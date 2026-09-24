const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {createTimelineFixture,id}=require('./fixtures/timeline-db.cjs');
test('repeating events validate their rule and agenda, and ticks are per occurrence and workspace-scoped',async()=>{
 const db=await createTimelineFixture();
 try {
  await db.exec('reset role');
  await db.exec(fs.readFileSync('supabase/migrate-calendar-events.sql','utf8'));
  await db.exec(fs.readFileSync('supabase/migrate-calendar-event-ranges.sql','utf8'));
  const migration=fs.readFileSync('supabase/migrate-event-recurrence.sql','utf8');
  await db.exec(migration);await db.exec(migration);
  await db.exec('grant select,insert,delete on calendar_agenda_checks to authenticated;set role authenticated');
  const agenda=JSON.stringify([{id:'a',text:'Wins'},{id:'b',text:'Blockers'}]);
  const event=(await db.query("insert into calendar_events(project_id,title,date,repeat,agenda) values($1,'Standup','2026-09-07','week',$2) returning *",[id(1),agenda])).rows[0];
  assert.equal(event.repeat,'week');
  assert.deepEqual(event.skipped_dates,[]);
  await assert.rejects(db.query("update calendar_events set repeat='hourly' where id=$1",[event.id]),/check constraint/);
  await assert.rejects(db.query("update calendar_events set repeat_until='2026-09-01' where id=$1",[event.id]),/check constraint/);
  await assert.rejects(db.query("update calendar_events set repeat=null, repeat_until='2026-12-01' where id=$1",[event.id]),/check constraint/,'until needs a repeat');
  await assert.rejects(db.query(`update calendar_events set agenda='[{"id":"a","text":"  "}]' where id=$1`,[event.id]),/check constraint/);
  await assert.rejects(db.query(`update calendar_events set agenda='{"id":"a"}' where id=$1`,[event.id]),/check constraint/);
  await db.query("update calendar_events set skipped_dates='{2026-09-14}', repeat_until='2026-12-31' where id=$1",[event.id]);

  // Ticks belong to one occurrence.
  await db.query("insert into calendar_agenda_checks(event_id,occurrence,item_id,project_id) values($1,'2026-09-07','a',$2)",[event.id,id(1)]);
  await assert.rejects(db.query("insert into calendar_agenda_checks(event_id,occurrence,item_id,project_id) values($1,'2026-09-07','a',$2)",[event.id,id(1)]),/duplicate key/);
  const ticks=d=>db.query('select item_id from calendar_agenda_checks where event_id=$1 and occurrence=$2',[event.id,d]).then(r=>r.rows.map(x=>x.item_id));
  assert.deepEqual(await ticks('2026-09-07'),['a']);
  assert.deepEqual(await ticks('2026-09-21'),[],'next week starts unticked');
  // A tick can't claim another workspace, nor pair this event with a different project.
  await assert.rejects(db.query("insert into calendar_agenda_checks(event_id,occurrence,item_id,project_id) values($1,'2026-09-21','a',$2)",[event.id,id(2)]),/row-level security/);

  await db.exec("set test.role='viewer'");
  assert.deepEqual(await ticks('2026-09-07'),['a'],'viewers see ticks');
  await assert.rejects(db.query("insert into calendar_agenda_checks(event_id,occurrence,item_id,project_id) values($1,'2026-09-21','b',$2)",[event.id,id(1)]),/row-level security/);
  assert.equal((await db.query('delete from calendar_agenda_checks returning item_id')).rows.length,0);
  await db.exec("set test.role='editor'");
  assert.equal((await db.query("delete from calendar_agenda_checks where item_id='a' returning item_id")).rows.length,1);

  // Meeting notes per occurrence: every occurrence starts empty.
  await db.exec('reset role');await db.exec('grant select,insert,update,delete on calendar_event_notes to authenticated;set role authenticated');
  assert.equal((await db.query("select repeat_weekends from calendar_events where id=$1",[event.id])).rows[0].repeat_weekends,true);
  await db.query("insert into calendar_event_notes(event_id,occurrence,project_id,notes) values($1,'2026-09-07',$2,'Shipped it')",[event.id,id(1)]);
  await db.query("insert into calendar_event_notes(event_id,occurrence,project_id,notes) values($1,'2026-09-07',$2,'Shipped it, twice') on conflict (event_id,occurrence) do update set notes=excluded.notes",[event.id,id(1)]);
  const notesOn=d=>db.query('select notes from calendar_event_notes where event_id=$1 and occurrence=$2',[event.id,d]).then(r=>r.rows[0]?.notes??'');
  assert.equal(await notesOn('2026-09-07'),'Shipped it, twice');
  assert.equal(await notesOn('2026-09-21'),'');
  await assert.rejects(db.query("insert into calendar_event_notes(event_id,occurrence,project_id,notes) values($1,'2026-09-21',$2,'x')",[event.id,id(2)]),/row-level security/);
  await assert.rejects(db.query("insert into calendar_event_notes(event_id,occurrence,project_id,notes) values($1,'2026-09-21',$2,$3)",[event.id,id(1),'x'.repeat(5001)]),/check constraint/);
  await db.exec("set test.role='viewer'");
  assert.equal(await notesOn('2026-09-07'),'Shipped it, twice','viewers read notes');
  assert.equal((await db.query("update calendar_event_notes set notes='hacked' returning notes")).rows.length,0);
  await db.exec("set test.role='editor'");

  // Deleting the event removes its ticks.
  await db.query("insert into calendar_agenda_checks(event_id,occurrence,item_id,project_id) values($1,'2026-09-21','b',$2)",[event.id,id(1)]);
  await db.query('delete from calendar_events where id=$1',[event.id]);
  assert.equal((await db.query('select count(*)::int as n from calendar_agenda_checks')).rows[0].n,0);
  assert.equal((await db.query('select count(*)::int as n from calendar_event_notes')).rows[0].n,0,'and its notes');
 }finally{await db.close();}
});
