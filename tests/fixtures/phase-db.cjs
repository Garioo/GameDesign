const fs = require("node:fs");
const { createTimelineFixture, id } = require("./timeline-db.cjs");
async function createPhaseFixture() {
  const db = await createTimelineFixture();
  await db.exec(
    `reset role;create table board_categories(id uuid primary key default gen_random_uuid(),project_id uuid references projects(id),name text,position integer default 0);insert into board_categories values('${id(70)}','${id(1)}','mechanic',0);`,
  );
  for (const name of [
    "board-end-date",
    "card-calendar-mode",
    "board-copy",
    "phase-planning",
  ])
    await db.exec(fs.readFileSync(`supabase/migrate-${name}.sql`, "utf8"));
  await db.exec(
    "grant select,insert,update,delete on board_categories to authenticated;set role authenticated",
  );
  return db;
}
module.exports = { createPhaseFixture, id };
