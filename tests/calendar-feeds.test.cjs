const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
const { PGlite } = require("@electric-sql/pglite");

// Parse in a fixed zone so UTC → local conversion is deterministic.
process.env.TZ = "Europe/Copenhagen";
const compiled = { exports: {} };
new Function("exports", ts.transpileModule(fs.readFileSync("lib/ical.ts", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText)(compiled.exports);
const { parseIcs, isMoodleCalendarUrl } = compiled.exports;

const MOODLE = [
  "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Moodle Pty Ltd//NONSGML Moodle Version 2024//EN",
  "BEGIN:VEVENT",
  "UID:123@moodle.example.dk",
  "SUMMARY:Assignment 2 is due",
  "DESCRIPTION:Hand in the prototype\\, report and video.\\nGroup work.",
  "CLASS:PUBLIC",
  "LAST-MODIFIED:20260901T080000Z",
  "DTSTAMP:20260922T080000Z",
  "DTSTART:20260925T215900Z",
  "DTEND:20260925T215900Z",
  "CATEGORIES:GD-E26",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "UID:124@moodle.example.dk",
  "SUMMARY:Lecture: Level design with a very long title that Moodle folds ac",
  " ross two lines",
  "DTSTART:20260929T070000Z",
  "DTEND:20260929T100000Z",
  "LOCATION:Room 2.14",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "UID:125@moodle.example.dk",
  "SUMMARY:Autumn break",
  "DTSTART;VALUE=DATE:20261012",
  "DTEND;VALUE=DATE:20261017",
  "END:VEVENT",
  "END:VCALENDAR", "",
].join("\r\n");

test("Moodle deadlines, lectures and all-day ranges map to calendar events", () => {
  const [deadline, lecture, holiday] = parseIcs(MOODLE);
  // 21:59Z on 25 Sep is 23:59 in Copenhagen (CEST); due-date events have no end.
  assert.deepEqual(
    [deadline.date, deadline.end_date, deadline.start_time, deadline.end_time, deadline.category],
    ["2026-09-25", null, "23:59", null, "GD-E26"],
  );
  assert.equal(deadline.notes, "Hand in the prototype, report and video.\nGroup work.");
  assert.equal(lecture.title, "Lecture: Level design with a very long title that Moodle folds across two lines");
  assert.deepEqual([lecture.start_time, lecture.end_time, lecture.location], ["09:00", "12:00", "Room 2.14"]);
  // All-day DTEND is exclusive: 12–16 October.
  assert.deepEqual([holiday.date, holiday.end_date, holiday.start_time], ["2026-10-12", "2026-10-16", null]);
});

test("a UTC time that crosses midnight lands on the local day", () => {
  const [event] = parseIcs("BEGIN:VEVENT\nUID:x\nSUMMARY:Late\nDTSTART:20261231T233000Z\nEND:VEVENT");
  assert.deepEqual([event.date, event.start_time], ["2027-01-01", "00:30"]);
});

test("only https Moodle export links with a token are accepted", () => {
  assert.equal(isMoodleCalendarUrl("https://moodle.example.dk/calendar/export_execute.php?userid=5&authtoken=abc&preset_what=all&preset_time=recentupcoming"), true);
  assert.equal(isMoodleCalendarUrl("https://example.dk/moodle/calendar/export_execute.php?userid=5&authtoken=abc"), true);
  assert.equal(isMoodleCalendarUrl("http://moodle.example.dk/calendar/export_execute.php?authtoken=abc"), false);
  assert.equal(isMoodleCalendarUrl("https://moodle.example.dk/calendar/export_execute.php?userid=5"), false);
  assert.equal(isMoodleCalendarUrl("https://user:pw@moodle.example.dk/calendar/export_execute.php?authtoken=abc"), false);
  assert.equal(isMoodleCalendarUrl("https://moodle.example.dk/evil?x=/calendar/export_execute.php&authtoken=abc"), false);
});

const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const LINK = "https://moodle.example.dk/calendar/export_execute.php?userid=5&authtoken=secret";
async function makeDb() {
  const db = new PGlite();
  await db.exec(`
    create role authenticated; create role anon;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$ select current_setting('test.uid', true)::uuid $$;
    create table profiles(id uuid primary key);
    create table projects(id uuid primary key);
    create table project_members(project_id uuid, user_id uuid, role text, primary key(project_id, user_id));
    create function can_access_project(p_project uuid) returns boolean language sql stable security definer as $$
      select exists(select 1 from project_members where project_id = p_project and user_id = auth.uid()) $$;
    create function can_edit_project(p_project uuid) returns boolean language sql stable security definer as $$
      select exists(select 1 from project_members where project_id = p_project and user_id = auth.uid() and role in ('owner','editor')) $$;
    insert into projects values ('${id(1)}'), ('${id(2)}');
    insert into profiles values ('${id(1)}'), ('${id(2)}'), ('${id(3)}');
    insert into project_members values ('${id(1)}', '${id(1)}', 'owner'), ('${id(1)}', '${id(2)}', 'viewer'), ('${id(2)}', '${id(3)}', 'owner');
    grant usage on schema auth to authenticated;
    create publication supabase_realtime;
  `);
  await db.exec(fs.readFileSync("supabase/migrate-calendar-feeds.sql", "utf8"));
  return db;
}
const asUser = (db, uid) => db.exec(`reset role; set role authenticated; select set_config('test.uid', '${uid}', false);`);

test("editors add feeds; members see the name and load the link only through the RPC", async () => {
  const db = await makeDb();
  try {
    await asUser(db, id(1));
    const feed = (await db.query("insert into calendar_feeds(project_id, label, url) values ($1, 'Moodle', $2) returning id, created_by", [id(1), LINK])).rows[0];
    assert.equal(feed.created_by, id(1));

    await asUser(db, id(2)); // viewer in the same workspace
    assert.deepEqual((await db.query("select label from calendar_feeds")).rows, [{ label: "Moodle" }]);
    await assert.rejects(db.query("select url from calendar_feeds"), /permission denied/);
    assert.equal((await db.query("select calendar_feed_url($1) as url", [feed.id])).rows[0].url, LINK);
    await assert.rejects(db.query("insert into calendar_feeds(project_id, url) values ($1, $2)", [id(1), LINK]), /row-level security/);
    assert.equal((await db.query("delete from calendar_feeds returning id")).rows.length, 0);

    await asUser(db, id(3)); // other workspace
    assert.equal((await db.query("select count(*)::int as n from calendar_feeds")).rows[0].n, 0);
    assert.equal((await db.query("select calendar_feed_url($1) as url", [feed.id])).rows[0].url, null);
  } finally {
    await db.close();
  }
});

test("only Moodle export links over https are stored", async () => {
  const db = await makeDb();
  try {
    await asUser(db, id(1));
    await assert.rejects(db.query("insert into calendar_feeds(project_id, url) values ($1, 'http://moodle.example.dk/calendar/export_execute.php?authtoken=x')", [id(1)]), /check constraint/);
    await assert.rejects(db.query("insert into calendar_feeds(project_id, url) values ($1, 'https://169.254.169.254/latest/meta-data')", [id(1)]), /check constraint/);
  } finally {
    await db.close();
  }
});
