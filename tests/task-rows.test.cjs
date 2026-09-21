const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');
const compiled={exports:{}};
new Function('exports',ts.transpileModule(fs.readFileSync('lib/taskHierarchy.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText)(compiled.exports);
const {taskRows}=compiled.exports;
const board={cols:[{id:'open',cards:[{id:'parent',title:'Method'},{id:'a',parentId:'parent',title:'Sources'},{id:'other',title:'Introduction'}]},{id:'done',isCompleted:true,cards:[{id:'b',parentId:'parent',title:'Draft'}]}]};
const options={collapsed:[],completed:true,matches:()=>true,filtering:false};
test('children stay below their parent across stages and progress includes completed tasks',()=>{const rows=taskRows(board,options);assert.deepEqual(rows.map(r=>[r.card.id,r.depth]),[['parent',0],['a',1],['b',1],['other',0]]);assert.equal(rows[0].completedChildren,1);assert.equal(rows[0].children.length,2);});
test('collapsing hides children without losing progress',()=>{const rows=taskRows(board,{...options,collapsed:['parent']});assert.deepEqual(rows.map(r=>r.card.id),['parent','other']);assert.equal(rows[0].children.length,2);});
test('search finds a hidden child and keeps parent context',()=>{const rows=taskRows(board,{...options,collapsed:['parent'],filtering:true,matches:c=>c.title==='Sources'});assert.deepEqual(rows.map(r=>r.card.id),['parent','a']);});
test('hide completed preserves total completion count',()=>{const rows=taskRows(board,{...options,completed:false});assert.deepEqual(rows.map(r=>r.card.id),['parent','a','other']);assert.equal(rows[0].completedChildren,1);});
const {parentChoices,entryIndex,TIMELINE_ROW_HEIGHT,TIMELINE_ENTRY_HEIGHT}=compiled.exports;
const deep={cols:[{id:'open',cards:[
 {id:'root',title:'Root',timelinePosition:1},
 {id:'child',title:'Child',parentId:'root',timelinePosition:0},
 {id:'leaf',title:'Leaf',parentId:'child',timelinePosition:0},
 {id:'sibling',title:'Sibling',parentId:'root',timelinePosition:1},
 {id:'first',title:'First',timelinePosition:0}
]}]};
test('arbitrary depth and sibling order produce one consistent tree',()=>{
 assert.deepEqual(taskRows(deep,options).map(r=>[r.card.id,r.depth]),[['first',0],['root',0],['child',1],['leaf',2],['sibling',1]]);
});
test('nested collapse hides the whole branch and searching restores ancestor paths',()=>{
 assert.deepEqual(taskRows(deep,{...options,collapsed:['child']}).map(r=>r.card.id),['first','root','child','sibling']);
 assert.deepEqual(taskRows(deep,{...options,collapsed:['root','child'],filtering:true,matches:c=>c.id==='leaf'}).map(r=>r.card.id),['root','child','leaf']);
 assert.deepEqual(taskRows(deep,{...options,collapsed:['root','child']}).map(r=>r.card.id),['first','root']);
});
test('parent selector excludes an entire subtree and displays full paths',()=>{
 assert.deepEqual(parentChoices(deep,'child'),[{id:'first',title:'First'},{id:'root',title:'Root'},{id:'sibling',title:'Root / Sibling'}]);
 assert.deepEqual(parentChoices(deep,'root'),[{id:'first',title:'First'}]);
});
test('entry follows all visible descendants and has a stable connector offset',()=>{
 const rows=taskRows(deep,options);
 assert.equal(entryIndex(rows,'root'),5);assert.equal(entryIndex(rows,'child'),4);
 assert.equal(entryIndex(rows,null),5);assert.equal(entryIndex(rows,'missing'),-1);
 const positions=rows.map((r,i)=>64+i*TIMELINE_ROW_HEIGHT+TIMELINE_ROW_HEIGHT/2+(i>=entryIndex(rows,'child')?TIMELINE_ENTRY_HEIGHT:0));
 assert.equal(positions[4]-positions[3],TIMELINE_ROW_HEIGHT+TIMELINE_ENTRY_HEIGHT);
});
test('a hidden completed ancestor is retained for an unfinished descendant',()=>{
 const board={cols:[{id:'done',isCompleted:true,cards:[{id:'root',title:'Root'}]}, {id:'open',cards:[{id:'child',title:'Child',parentId:'root'}]}]};
 assert.deepEqual(taskRows(board,{...options,completed:false,filtering:true,collapsed:['root']}).map(r=>r.card.id),['root','child']);
});
