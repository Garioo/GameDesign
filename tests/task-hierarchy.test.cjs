const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { createTimelineFixture } = require('./fixtures/timeline-db.cjs');
const id = n => `00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
test('task hierarchy transactions',async t=>{
 const db = await createTimelineFixture();

 const snap = async () => (await db.query('select gantt_snapshot($1) s',[id(1)])).rows[0].s;
 const mutate = async (action,expected) => (await db.query('select gantt_mutate_hierarchy($1,$2,$3) s',[id(1),expected??await snap(),action])).rows[0].s;
 const attach = () => mutate({op:'card',card:{id:id(11),parent_id:id(10)}});
 const move = async (task,column) => db.query('select gantt_mutate($1,$2,$3)',[id(1),await snap(),{op:'card',card:{id:task,column_id:column}}]);
 async function scenario(name,fn){await t.test(name,async()=>{await db.exec('begin');try{await fn();}finally{await db.exec('rollback');}});}
 await scenario('creates five children dated to the local creation day and preserves the parent',async()=>{
  await mutate({op:'create_tasks',parent_id:id(10),column_id:id(5),day:'2026-09-18',titles:['Approach','Sources','Draft','Review','Edits']});
  const tasks=(await snap()).cards;assert.equal(tasks.filter(c=>c.parent_id===id(10)).length,5);assert.equal(tasks.find(c=>c.id===id(10)).title,'Prototype');
  for(const child of tasks.filter(c=>c.parent_id===id(10))){assert.equal(child.start_date,'2026-09-18');assert.equal(child.deadline,'2026-09-18');}
 });
 await scenario('creates a main task without a parent',async()=>{await mutate({op:'create_tasks',parent_id:null,column_id:id(5),titles:['Method']});assert.equal((await snap()).cards.find(c=>c.title==='Method').parent_id,null);});
 await scenario('attaches and detaches existing tasks',async()=>{const original=(await snap()).cards.find(c=>c.id===id(11));await attach();assert.equal((await snap()).cards.find(c=>c.id===id(11)).start_date,original.start_date);assert.equal((await snap()).cards.find(c=>c.id===id(11)).deadline,original.deadline);assert.equal((await snap()).cards.find(c=>c.id===id(11)).parent_id,id(10));await mutate({op:'card',card:{id:id(11),parent_id:null}});assert.equal((await snap()).cards.find(c=>c.id===id(11)).parent_id,null);});
 await scenario('rejects circular nesting',async()=>{await attach();await assert.rejects(mutate({op:'card',card:{id:id(10),parent_id:id(11)}}),/ancestor|different parent/);});
 await scenario('rejects self parenting',async()=>{await assert.rejects(mutate({op:'card',card:{id:id(10),parent_id:id(10)}}),/ancestor|different parent/);});
 await scenario('rejects children in another board',async()=>{await assert.rejects(mutate({op:'create_tasks',parent_id:id(10),column_id:id(7),titles:['Bad']}),/same board/);});
 await scenario('parent and descendant completion are independent',async()=>{
  await attach();
  await db.query('insert into board_columns(id,project_id,board_id,name,color,position,is_completed) values($1,$2,$3,$4,$5,2,true)',[id(8),id(1),id(3),'Done','#abcdef']);
  await db.exec('set constraints all immediate');
  await move(id(10),id(8));
  await move(id(11),id(8));await move(id(11),id(5));
  await mutate({op:'create_tasks',parent_id:id(10),column_id:id(5),day:null,titles:['New child']});
  assert.equal((await snap()).cards.find(c=>c.id===id(10)).column_id,id(8));
 });
 await scenario('deep nesting permits children with children and rejects deep cycles',async()=>{
  await attach();
  await mutate({op:'create_tasks',parent_id:id(11),column_id:id(5),day:null,titles:['Grandchild']});
  const grandchild=(await snap()).cards.find(c=>c.title==='Grandchild');
  assert.equal(grandchild.parent_id,id(11));
  await assert.rejects(mutate({op:'card',card:{id:id(10),parent_id:grandchild.id}}),/ancestor/);
 });
 await scenario('explicit null creates undated tasks; omitted dates retain legacy defaults',async()=>{
  await mutate({op:'create_tasks',column_id:id(5),day:null,titles:['Undated']});
  await mutate({op:'create_tasks',column_id:id(5),titles:['Legacy']});
  const tasks=(await snap()).cards;
  assert.equal(tasks.find(c=>c.title==='Undated').start_date,null);
  assert.equal(tasks.find(c=>c.title==='Undated').deadline,null);
  assert.ok(tasks.find(c=>c.title==='Legacy').start_date);
 });
 await scenario('reordering is independent of stages and preserves dates and hierarchy',async()=>{
  const before=await snap();
  await mutate({op:'reorder_tasks',board_id:id(3),parent_id:null,ids:[id(11),id(10)]});
  const after=await snap();
  assert.equal(after.cards.find(c=>c.id===id(11)).timeline_position,0);
  assert.equal(after.cards.find(c=>c.id===id(10)).timeline_position,1);
  for(const c of after.cards){const old=before.cards.find(x=>x.id===c.id);assert.equal(c.column_id,old.column_id);assert.equal(c.start_date,old.start_date);assert.equal(c.position,old.position);}
  await move(id(10),id(6));
  assert.equal((await snap()).cards.find(c=>c.id===id(10)).timeline_position,1);
 });
 await scenario('reparenting appends without moving descendants or dates',async()=>{
  await attach();
  await mutate({op:'create_tasks',parent_id:id(11),column_id:id(5),day:null,titles:['Grandchild']});
  const before=(await snap()).cards.find(c=>c.id===id(11));
  await mutate({op:'card',card:{id:id(11),parent_id:null}});
  const tasks=(await snap()).cards;
  assert.equal(tasks.find(c=>c.title==='Grandchild').parent_id,id(11));
  assert.ok(tasks.find(c=>c.id===id(11)).timeline_position>tasks.find(c=>c.id===id(10)).timeline_position);
  assert.equal(tasks.find(c=>c.id===id(11)).start_date,before.start_date);
 });
 await scenario('moving a parent leaves child dates independent unless explicitly linked',async()=>{
  await attach();const before=await snap();
  const parent=before.cards.find(c=>c.id===id(10));const child=before.cards.find(c=>c.id===id(11));
  await db.query('select gantt_mutate($1,$2,$3)',[id(1),before,{op:'card',card:{id:parent.id,start_date:'2026-10-01',deadline:'2026-10-03',firm_deadline:null}}]);
  assert.equal((await snap()).cards.find(c=>c.id===child.id).start_date,child.start_date);
  await db.query('select gantt_mutate($1,$2,$3)',[id(1),await snap(),{op:'dependency',predecessor:parent.id,successor:child.id,kind:'FS',gap:0}]);
  assert.equal((await snap()).cards.find(c=>c.id===child.id).start_date,'2026-10-04');
 });
 await scenario('direct order writes cannot bypass the reorder RPC',async()=>{await assert.rejects(db.query('update board_cards set timeline_position=10 where id=$1',[id(10)]),/reorder operation/);});
 await scenario('reorder rejects missing siblings',async()=>{await assert.rejects(mutate({op:'reorder_tasks',board_id:id(3),ids:[id(10)]}),/every sibling/);});
 await scenario('reorder rejects duplicate siblings',async()=>{await assert.rejects(mutate({op:'reorder_tasks',board_id:id(3),ids:[id(10),id(10)]}),/every sibling/);});
 await scenario('reorder rejects mixed parents',async()=>{await attach();await assert.rejects(mutate({op:'reorder_tasks',board_id:id(3),ids:[id(10),id(11)]}),/every sibling/);});
 await scenario('reorder rejects stale snapshot',async()=>{const before=await snap();await attach();await assert.rejects(mutate({op:'reorder_tasks',board_id:id(3),ids:[id(11),id(10)]},before),/schedule changed/);});
 await scenario('viewer cannot reorder',async()=>{await db.exec("set test.role='viewer'");await assert.rejects(mutate({op:'reorder_tasks',board_id:id(3),ids:[id(11),id(10)]}),/Editor access/);});
 await scenario('deleting a parent promotes its children',async()=>{await attach();await db.query('delete from board_cards where id=$1',[id(10)]);await db.exec('set constraints all immediate');assert.equal((await snap()).cards.find(c=>c.id===id(11)).parent_id,null);});
 await scenario('stale snapshots reject hierarchy writes',async()=>{const before=await snap();await attach();await assert.rejects(mutate({op:'create_tasks',column_id:id(5),titles:['New']},before),/schedule changed/);});
 await scenario('viewer cannot create subtasks',async()=>{await db.exec("set test.role='viewer'");await assert.rejects(attach(),/Editor access/);});
 await t.test('migration can be rerun preserving hierarchy',async()=>{await attach();const before=await snap();await db.exec('reset role');await db.exec(fs.readFileSync('supabase/migrate-nested-timeline.sql','utf8'));assert.deepEqual(await snap(),before);});
 await db.close();
});
