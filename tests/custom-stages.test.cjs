const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { PGlite } = require('@electric-sql/pglite');
const id = n => `00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
test('custom stage transactions preserve the planning graph', async t => {
 const db = new PGlite();
 await db.exec(`create role authenticated;create role anon;create schema auth;create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql as 'select ''${id(99)}''::uuid';
 create table projects(id uuid primary key);insert into projects values('${id(1)}'),('${id(2)}');
 create function can_access_project(uuid) returns boolean language sql as 'select $1 = ''${id(1)}''::uuid';
 create function can_edit_project(uuid) returns boolean language sql as 'select can_access_project($1) and current_setting(''test.role'') = ''editor''';
 create table boards(id uuid primary key default gen_random_uuid(),project_id uuid references projects(id),name text,color text,position integer);
 create table board_columns(id uuid primary key default gen_random_uuid(),project_id uuid references projects(id),board_id uuid references boards(id) on delete cascade,name text,color text,position integer);
 create table board_cards(id uuid primary key,project_id uuid references projects(id),column_id uuid references board_columns(id) on delete cascade,title text,sub text,kind text,tags text[],owners uuid[],priority text,start_date date,deadline date,position integer,canvas_id uuid,check(deadline>=start_date));
 insert into boards values('${id(3)}','${id(1)}','Gameplay','#64748b',0),('${id(4)}','${id(1)}','Art','#64748b',1);
 insert into board_columns values('${id(5)}','${id(1)}','${id(3)}','Explore','#64748b',0),('${id(6)}','${id(1)}','${id(3)}','Playable','#6b8d7d',1),('${id(7)}','${id(1)}','${id(4)}','Sketch','#64748b',0);
 insert into board_cards values('${id(10)}','${id(1)}','${id(5)}','Prototype','Description','mechanic','{alpha}','{}','high','2026-09-14','2026-09-16',0,'${id(80)}'),('${id(11)}','${id(1)}','${id(6)}','Test build','','','{}','{}',null,'2026-09-17','2026-09-18',0,null);
 create publication supabase_realtime;set test.role='editor';`);
 await db.exec(fs.readFileSync('supabase/migrate-gantt-planning.sql','utf8'));
 await db.exec(fs.readFileSync('supabase/migrate-custom-stages.sql','utf8'));
 await db.exec('grant usage on schema auth to authenticated;grant select,insert,update,delete on all tables in schema public to authenticated;set role authenticated;');
 const snap = async () => (await db.query('select board_stage_snapshot($1,$2) s',[id(1),id(3)])).rows[0].s;
 const stage=(n,name,completed=false)=>({id:id(n),name,color:'#64748b',completed});
 const current=()=>[stage(5,'Explore'),stage(6,'Playable')];
 async function save(stages,transfers={},expected=undefined,board=id(3)){
  return (await db.query('select save_board_stages($1,$2,$3,$4,$5,$6) id',[id(1),board,expected??(board?await snap():null),'Gameplay',stages,transfers])).rows[0].id;
 }
 async function scenario(name,fn){await t.test(name,async()=>{await db.exec('begin');try{await fn();}finally{await db.exec('rollback');}});}
 await scenario('creates exactly the supplied stages, with no defaults',async()=>{const board=await save([stage(20,'Research'),stage(21,'Ready to ship',true)],{},null,null);const rows=(await db.query('select * from board_columns where board_id=$1 order by position',[board])).rows;assert.deepEqual(rows.map(r=>r.name),['Research','Ready to ship']);assert.equal(rows[1].is_completed,true);});
 await scenario('invalid creation rolls back the board too',async()=>{await db.exec('savepoint attempt');await assert.rejects(save([stage(20,' ')] ,{},null,null),/Each stage needs/);await db.exec('rollback to attempt');assert.equal((await db.query('select * from boards')).rows.length,2);});
 await scenario('renaming and recoloring preserve cards and links',async()=>{const before=await snap();const stages=current();stages[0].name='Discover';stages[0].color='#456789';await save(stages);const after=await snap();assert.deepEqual(after.schedule.cards,before.schedule.cards);assert.equal(after.schedule.columns.find(c=>c.id===id(5)).name,'Discover');assert.equal(after.schedule.cards[0].canvas_id,id(80));});
 await scenario('reorders IDs without changing assignments',async()=>{await save(current().reverse());const cols=(await db.query('select id from board_columns where board_id=$1 order by position',[id(3)])).rows;assert.deepEqual(cols.map(c=>c.id),[id(6),id(5)]);assert.equal((await snap()).schedule.cards[0].column_id,id(5));});
 await scenario('completion is explicit, independent of stage name',async()=>{await save([stage(5,'Done',false),stage(6,'Playable',true)]);const cols=(await snap()).schedule.columns;assert.equal(cols.find(c=>c.id===id(5)).is_completed,false);assert.equal(cols.find(c=>c.id===id(6)).is_completed,true);});
 await scenario('populated stage removal requires a destination',async()=>{await assert.rejects(save([stage(6,'Playable')]),/Choose a destination/);});
 await scenario('transfer preserves cards, ordering, dependencies and milestones',async()=>{
  const s=await snap();await db.query('select gantt_mutate($1,$2,$3)',[id(1),s.schedule,{op:'dependency',predecessor:id(10),successor:id(11),kind:'FS',gap:0}]);
  await db.query('select gantt_mutate($1,$2,$3)',[id(1),(await snap()).schedule,{op:'milestone',milestone:{id:id(30),name:'Demo',day:'2026-09-20',board_id:id(3)},tasks:[id(10)]}]);
  await save([stage(6,'Playable')],{[id(5)]:id(6)});const after=await snap();assert.equal(after.schedule.cards.length,2);assert.equal(after.schedule.cards[0].column_id,id(6));assert.equal(after.schedule.cards[0].position,1);assert.equal(after.schedule.cards[0].canvas_id,id(80));assert.equal(after.schedule.dependencies.length,1);assert.equal(after.schedule.links.length,1);
 });
 await scenario('cannot remove final stage',async()=>{await assert.rejects(save([]),/at least one/);});
 await scenario('names are trimmed and duplicates are case insensitive',async()=>{await assert.rejects(save([stage(5,'Explore'),stage(6,' explore ')]),/unique/);});
 await scenario('invalid colors rejected',async()=>{await assert.rejects(save([{...stage(5,'Explore'),color:'red'},stage(6,'Playable')]),/valid color/);});
 await scenario('foreign board destination rejected',async()=>{await assert.rejects(save([stage(6,'Playable')],{[id(5)]:id(7)}),/Choose a destination/);});
 await scenario('cannot hijack another board stage',async()=>{await assert.rejects(save([stage(7,'Stolen')]),/another board/);});
 await scenario('concurrent task edit requires reload',async()=>{const before=await snap();await db.query('update board_cards set title=$1 where id=$2',['New title',id(10)]);await assert.rejects(save(current(),{},before),/Reload stages/);});
 await scenario('concurrent board rename requires reload',async()=>{const before=await snap();await db.query('update boards set name=$1 where id=$2',['New name',id(3)]);await assert.rejects(save(current(),{},before),/Reload stages/);});
 await scenario('viewer cannot create or edit stages',async()=>{await db.exec("set test.role='viewer'");await assert.rejects(save(current()),/Editor access/);});
 await t.test('planning and custom-stage migrations can be rerun without changing saved data', async () => {
  await db.exec("reset role;set test.role='editor'");
  await db.query('update board_columns set name=$1,is_completed=false where id=$2',['Done',id(5)]);
  await db.query('select gantt_mutate($1,$2,$3)',[id(1),(await snap()).schedule,{op:'dependency',predecessor:id(10),successor:id(11),kind:'FS',gap:0}]);
  await db.query('select gantt_mutate($1,$2,$3)',[id(1),(await snap()).schedule,{op:'milestone',milestone:{id:id(30),name:'Demo',day:'2026-09-20',board_id:id(3)},tasks:[id(10)]}]);
  await db.query('insert into auth.users values($1)',[id(99)]);
  await db.query('insert into gantt_views(project_id,name,settings) values($1,$2,$3)',[id(1),'My timeline',{days:14}]);
  const before = await snap();
  const savedViews = (await db.query('select * from gantt_views order by id')).rows;
  for (let repeat=0;repeat<2;repeat++) {
   await db.exec(fs.readFileSync('supabase/migrate-gantt-planning.sql','utf8'));
   await db.exec(fs.readFileSync('supabase/migrate-custom-stages.sql','utf8'));
  }
  assert.deepEqual(await snap(),before);
  assert.deepEqual((await db.query('select * from gantt_views order by id')).rows,savedViews);
  assert.equal((await snap()).schedule.columns.find(c=>c.id===id(5)).is_completed,false);
  await db.exec("set role authenticated;set test.role='viewer'");
  await assert.rejects(save(current()),/Editor access/);
 });
 await db.close();
});
