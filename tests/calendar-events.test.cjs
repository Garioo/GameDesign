const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {createTimelineFixture,id}=require('./fixtures/timeline-db.cjs');
test('standalone events persist independently and enforce workspace permissions',async()=>{
 const db=await createTimelineFixture();
 try {
  await db.exec('reset role');
  const migration=fs.readFileSync('supabase/migrate-calendar-events.sql','utf8');
  await db.exec(migration);await db.exec(migration);
  const ranges=fs.readFileSync('supabase/migrate-calendar-event-ranges.sql','utf8');
  await db.exec(ranges); await db.exec(ranges);
  await db.exec('set role authenticated');
  const before=(await db.query('select count(*) from board_cards')).rows[0].count;
  const event=(await db.query('insert into calendar_events(project_id,title,date,start_time,end_time) values($1,$2,$3,$4,$5) returning *',[id(1),'Team playtest','2026-09-22','10:00','11:00'])).rows[0];
  assert.equal(event.title,'Team playtest');
  assert.equal((await db.query('select count(*) from board_cards')).rows[0].count,before);
  await assert.rejects(db.query("insert into calendar_events(project_id,title,date) values($1,'Private','2026-09-22')",[id(2)]),/row-level security/);
  await assert.rejects(db.query("update calendar_events set end_time='09:00' where id=$1",[event.id]),/check constraint/);
  await db.query("update calendar_events set end_date='2026-09-24', end_time='09:00' where id=$1",[event.id]);
  await assert.rejects(db.query("update calendar_events set end_date='2026-09-21' where id=$1",[event.id]),/check constraint/);
  await db.exec("set test.role='viewer'");
  assert.equal((await db.query('select * from calendar_events')).rows.length,1);
  assert.equal((await db.query("update calendar_events set title='Changed' returning id")).rows.length,0);
  assert.equal((await db.query('delete from calendar_events returning id')).rows.length,0);
  await assert.rejects(db.query("insert into calendar_events(project_id,title,date) values($1,'Viewer event','2026-09-22')",[id(1)]),/row-level security/);
  await db.exec("set test.role='editor'");
  await db.query("update calendar_events set title='Updated', start_time=null,end_time=null where id=$1",[event.id]);
  assert.equal((await db.query('select title from calendar_events')).rows[0].title,'Updated');
  await db.query('delete from calendar_events where id=$1',[event.id]);
  assert.equal((await db.query('select * from calendar_events')).rows.length,0);
 }finally{await db.close();}
});
