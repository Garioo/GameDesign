const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');
const compiled={exports:{}};
new Function('exports',ts.transpileModule(fs.readFileSync('lib/calendarRecurrence.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText)(compiled.exports);
const {occurrenceStarts,expandOccurrences,isOccurrence,addDays}=compiled.exports;
const rule=o=>({id:'e',date:'2026-09-07',end_date:null,repeat:null,repeat_until:null,skipped_dates:[],...o});

test('one-off events appear once, only when they overlap the range',()=>{
 assert.deepEqual(occurrenceStarts(rule({}),'2026-09-01','2026-09-30'),['2026-09-07']);
 assert.deepEqual(occurrenceStarts(rule({}),'2026-09-08','2026-09-30'),[]);
 // a multi-day one-off that started before the range still shows
 assert.deepEqual(occurrenceStarts(rule({end_date:'2026-09-09'}),'2026-09-09','2026-09-30'),['2026-09-07']);
});

test('weekly and fortnightly repeats land on the right days and stop at repeat_until',()=>{
 assert.deepEqual(occurrenceStarts(rule({repeat:'week'}),'2026-09-01','2026-09-30'),['2026-09-07','2026-09-14','2026-09-21','2026-09-28']);
 assert.deepEqual(occurrenceStarts(rule({repeat:'2weeks'}),'2026-09-15','2026-10-31'),['2026-09-21','2026-10-05','2026-10-19']);
 assert.deepEqual(occurrenceStarts(rule({repeat:'week',repeat_until:'2026-09-21'}),'2026-09-01','2026-09-30'),['2026-09-07','2026-09-14','2026-09-21']);
 assert.deepEqual(occurrenceStarts(rule({repeat:'week'}),'2026-08-01','2026-08-31'),[],'nothing before the first date');
});

test('daily repeats cross DST and year boundaries without drifting',()=>{
 const days=occurrenceStarts(rule({date:'2026-10-24',repeat:'day'}),'2026-10-24','2026-10-27');
 assert.deepEqual(days,['2026-10-24','2026-10-25','2026-10-26','2026-10-27']);
 assert.deepEqual(occurrenceStarts(rule({date:'2026-12-30',repeat:'day'}),'2026-12-31','2027-01-01'),['2026-12-31','2027-01-01']);
});

test('monthly repeats clamp short months but return to the original day',()=>{
 assert.deepEqual(occurrenceStarts(rule({date:'2026-01-31',repeat:'month'}),'2026-01-01','2026-05-31'),['2026-01-31','2026-02-28','2026-03-31','2026-04-30','2026-05-31']);
 assert.deepEqual(occurrenceStarts(rule({date:'2027-01-31',repeat:'month'}),'2028-02-01','2028-02-29'),['2028-02-29'],'leap year');
});

test('skipped occurrences are left out and multi-day repeats overlap into the range',()=>{
 assert.deepEqual(occurrenceStarts(rule({repeat:'week',skipped_dates:['2026-09-14']}),'2026-09-01','2026-09-21'),['2026-09-07','2026-09-21']);
 assert.deepEqual(occurrenceStarts(rule({repeat:'week',end_date:'2026-09-09'}),'2026-09-16','2026-09-16'),['2026-09-14']);
 assert.equal(isOccurrence(rule({repeat:'week'}),'2026-09-14'),true);
 assert.equal(isOccurrence(rule({repeat:'week',end_date:'2026-09-09'}),'2026-09-15'),false,'covered but not a start');
});

test('expanded occurrences keep their series and get unique ids and shifted end dates',()=>{
 const series=rule({repeat:'week',end_date:'2026-09-08',title:'Standup'});
 const [a,b]=expandOccurrences([series,rule({id:'x',date:'2026-09-10'})],'2026-09-07','2026-09-14');
 assert.deepEqual([a.id,a.date,a.end_date,a.occurrence],['e@2026-09-07','2026-09-07','2026-09-08','2026-09-07']);
 assert.equal(a.series,series);
 const all=expandOccurrences([series],'2026-09-07','2026-09-14');
 assert.deepEqual(all.map(o=>[o.id,o.end_date]),[['e@2026-09-07','2026-09-08'],['e@2026-09-14','2026-09-15']]);
 assert.equal(b.id,'e@2026-09-14');
 assert.equal(expandOccurrences([rule({id:'x',date:'2026-09-10'})],'2026-09-07','2026-09-14')[0].id,'x','one-offs keep their id');
 assert.equal(addDays('2026-02-28',1),'2026-03-01');
});

test('weekend toggle drops Saturday and Sunday occurrences only for repeats',()=>{
 // 2026-09-07 is a Monday
 assert.deepEqual(occurrenceStarts(rule({repeat:'day',repeat_weekends:false}),'2026-09-10','2026-09-15'),['2026-09-10','2026-09-11','2026-09-14','2026-09-15']);
 assert.equal(occurrenceStarts(rule({repeat:'day'}),'2026-09-10','2026-09-15').length,6,'on by default');
 // a monthly repeat that lands on a weekend is skipped that month
 assert.deepEqual(occurrenceStarts(rule({date:'2026-09-05',repeat:'month',repeat_weekends:false}),'2026-09-01','2026-12-31'),['2026-10-05','2026-11-05']);
 assert.deepEqual(occurrenceStarts(rule({date:'2026-09-05',repeat_weekends:false}),'2026-09-01','2026-09-30'),['2026-09-05'],'one-offs ignore it');
});
