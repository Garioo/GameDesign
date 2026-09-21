const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');
const compiled={exports:{}};
new Function('exports',ts.transpileModule(fs.readFileSync('lib/calendarLayout.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText)(compiled.exports);
const {calendarWeekLayout,eventCoversDate,eventSpan,spanCoversDate,spanOverlaps}=compiled.exports;
const dates=['2026-12-28','2026-12-29','2026-12-30','2026-12-31','2027-01-01','2027-01-02','2027-01-03'];
test('inclusive multi-day ranges clip at week and year boundaries',()=>{
 const event={id:'a',date:'2026-12-27',end_date:'2027-01-04'};
 assert.equal(eventCoversDate(event,'2027-01-04'),true);
 assert.equal(eventCoversDate(event,'2027-01-05'),false);
 const {segments}=calendarWeekLayout([eventSpan(event)],dates);
 assert.equal(segments[0].span.event,event);
 assert.deepEqual([segments[0].start,segments[0].end,segments[0].continuesBefore,segments[0].continuesAfter],[0,6,true,true]);
});
test('overlapping events use separate lanes and reuse free lanes',()=>{
 const events=[{id:'a',date:dates[0],end_date:dates[2]},{id:'b',date:dates[1],end_date:dates[3]},{id:'c',date:dates[3],end_date:null}];
 const result=calendarWeekLayout(events.map(eventSpan),dates);
 assert.equal(result.lanes,2);
 assert.deepEqual(result.segments.map(s=>s.lane),[0,1,0]);
 assert.equal(eventCoversDate(events[2],dates[3]),true);
 assert.equal(eventCoversDate(events[2],dates[4]),false);
});
test('tasks with a start date and deadline share lanes with events across the whole period',()=>{
 const task={id:'t',from:dates[0],to:dates[4],task:{title:'Build'}};
 const event=eventSpan({id:'e',date:dates[2],end_date:dates[5]});
 const {segments,lanes}=calendarWeekLayout([event,task],dates);
 assert.equal(lanes,2);
 assert.deepEqual(segments.map(s=>[s.span.id,s.start,s.end,s.lane]),[['t',0,4,0],['e',2,5,1]]);
 assert.equal(spanCoversDate(task,dates[3]),true);
 assert.equal(spanCoversDate(task,dates[5]),false);
 assert.equal(spanOverlaps(task,dates[5],dates[6]),false);
 assert.equal(spanOverlaps(task,dates[4],dates[6]),true);
});
