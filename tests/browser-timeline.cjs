// Run with a local dev server and Playwright installed (or PLAYWRIGHT_MODULE set).
// Every Supabase HTTP request is intercepted; mutations execute only in PGlite.
const fs=require('node:fs'),assert=require('node:assert/strict');
const root=process.cwd();
const {createTimelineFixture}=require('./fixtures/timeline-db.cjs');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const id=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
(async()=>{
 const db=await createTimelineFixture();
 const snapshot=async()=> (await db.query('select gantt_snapshot($1) s',[id(1)])).rows[0].s;
 const action=async(a)=> (await db.query('select gantt_mutate_hierarchy($1,$2,$3) s',[id(1),await snapshot(),a])).rows[0].s;
 await action({op:'card',card:{id:id(11),parent_id:id(10)}});
 await action({op:'create_tasks',column_id:id(5),parent_id:id(11),day:null,titles:['Nested draft']});
 await action({op:'create_tasks',column_id:id(5),parent_id:null,day:null,titles:['Release notes']});
 const today=new Date();today.setHours(12,0,0,0);
 const day=offset=>{const d=new Date(today);d.setDate(d.getDate()+offset);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
 for(const [task,start,end] of [[id(10),0,2],[id(11),3,4]]) await db.query('select gantt_mutate($1,$2,$3)',[id(1),await snapshot(),{op:'card',card:{id:task,start_date:day(start),deadline:day(end)}}]);
 await db.query('select gantt_mutate($1,$2,$3)',[id(1),await snapshot(),{op:'dependency',predecessor:id(10),successor:id(11),kind:'FS',gap:0}]);

 const env=fs.readFileSync(root+'/.env.local','utf8');
 const host=new URL(env.match(/^NEXT_PUBLIC_SUPABASE_URL=["']?([^\s"']+)/m)[1]).hostname;
 const profile={id:id(99),name:'Timeline tester',initials:'TT',color:'#849884',onboarded_at:'2026-01-01'};
 const browser=await chromium.launch({headless:true,channel:"chrome"});
 const context=await browser.newContext({viewport:{width:1440,height:1000}});
 const errors=[];let failNext=false;let writes=0;
 await context.addInitScript(({host,user})=>{localStorage.setItem(`sb-${host.split('.')[0]}-auth-token`,JSON.stringify({access_token:'test-session',refresh_token:'test-refresh',expires_at:Math.floor(Date.now()/1000)+86400,expires_in:86400,token_type:'bearer',user:{id:user,email:'fixture@example.test',aud:'authenticated',role:'authenticated'}}));},{host,user:id(99)});
 await context.route('**/*',async route=>{
  const u=new URL(route.request().url());
  if(u.hostname!==host){return route.continue();}
  const name=u.pathname.split('/').pop();
  let data=[];
  try {
   if(u.pathname.includes('/auth/'))data={user:profile};
   else if(u.pathname.includes('/rpc/')){
    const body=route.request().postDataJSON();
    if(name==='gantt_snapshot')data=await snapshot();
    else if(name==='gantt_mutate'||name==='gantt_mutate_hierarchy'){
     if(failNext){failNext=false;throw Error('Fixture save failed. Try again.');}
     writes++;
     data=(await db.query(`select ${name}($1,$2,$3) s`,[body.p_project,body.p_expected,body.p_action])).rows[0].s;
    }
   }else if(['boards','board_columns','board_cards'].includes(name))data=(await db.query(`select * from ${name} order by position nulls last,id`)).rows.map(r=>Object.fromEntries(Object.entries(r).map(([k,v])=>[k,v instanceof Date?v.toISOString().slice(0,10):v])));
   else if(name==='profiles')data=u.searchParams.get('id')?profile:[profile];
   else if(name==='project_members')data=[{project_id:id(1),role:'owner',user_id:id(99),profile,profiles:profile,projects:{id:id(1),name:'Timeline fixture',color:'#849884'}}];
   else if(name==='projects')data={id:id(1),name:'Timeline fixture'};
   else if(name==='board_categories')data=[{id:id(70),name:'mechanic'}];
   await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
  }catch(e){await route.fulfill({status:400,contentType:'application/json',body:JSON.stringify({message:e.message,code:'P0001'})});}
 });
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.goto((process.env.APP_URL || 'http://localhost:3000')+'/table?board='+id(3));
 await page.getByRole('button',{name:'Add subtasks to Prototype',exact:true}).waitFor({timeout:30000});
 await page.screenshot({path:'/tmp/nested-timeline-desktop.png',fullPage:true});
 console.log('Rendered actual timeline with fixture database');
 const row=title=>page.locator('.gantt-row').filter({has:page.locator('.gantt-task-copy strong').filter({hasText:new RegExp('^'+title+'$')})});
 assert.equal(await row('Nested draft').count(),1);
 // Create under a nested task; failed saves retain the name.
 await page.getByRole('button',{name:'Add subtasks to Test build',exact:true}).click();
 const input=page.getByRole('textbox',{name:'Subtask names'});
 await input.fill('Review nested draft');failNext=true;await input.press('Enter');
 await page.getByRole('alert').filter({hasText:'Fixture save failed'}).waitFor();
 assert.equal(await input.inputValue(),'Review nested draft');
 await input.press('Enter');await row('Review nested draft').waitFor();
 assert.equal(await input.count(),1);
 let created=(await snapshot()).cards.find(c=>c.title==='Review nested draft');assert.equal(created.parent_id,id(11));assert.equal(created.start_date,null);
 const entry=await page.locator('.timeline-entry-row').boundingBox(),createdBox=await row('Review nested draft').boundingBox();assert.ok(entry.y>=createdBox.y+createdBox.height-1);
 await input.press('Escape');
 // Date-cell scheduling, resizing, undo and keyboard date movement.
 const dateButton=row('Review nested draft').locator('.timeline-empty-days button').nth(6);
 const dateLabel=await dateButton.getAttribute('aria-label');await dateButton.click();
 await row('Review nested draft').locator('.gantt-bar').waitFor();
 created=(await snapshot()).cards.find(c=>c.title==='Review nested draft');assert.ok(dateLabel.endsWith(created.start_date));assert.equal(created.deadline,created.start_date);
 await row('Review nested draft').locator('.timeline-drag-handle:not(:disabled)').waitFor();
 const beforeDate=created.start_date;
 await row('Review nested draft').locator('.gantt-bar-body').press('ArrowRight');
 await row('Review nested draft').locator('.timeline-drag-handle:not(:disabled)').waitFor();
 await page.waitForTimeout(200);assert.notEqual((await snapshot()).cards.find(c=>c.id===created.id).start_date,beforeDate);
 await page.getByRole('button',{name:'Undo',exact:true}).click();await page.waitForTimeout(200);
 assert.equal((await snapshot()).cards.find(c=>c.id===created.id).start_date,beforeDate);
 // Pointer resize and bar move use the same scheduling RPC.
 const resize=await row('Review nested draft').getByRole('button',{name:'Resize end of Review nested draft'}).boundingBox();
 const dayWidth=await page.locator('.gantt-dates > div').first().evaluate(el=>el.getBoundingClientRect().width);
 let response=page.waitForResponse(r=>r.url().includes('/rpc/gantt_mutate') && r.request().method()==='POST');
 await page.mouse.move(resize.x+resize.width/2,resize.y+resize.height/2);await page.mouse.down();await page.mouse.move(resize.x+resize.width/2+2*dayWidth,resize.y+resize.height/2,{steps:6});await page.mouse.up();await response;
 await row('Review nested draft').locator('.timeline-drag-handle:not(:disabled)').waitFor();
 let changed=(await snapshot()).cards.find(c=>c.id===created.id);assert.ok(changed.deadline>changed.start_date);
 const body=await row('Review nested draft').locator('.gantt-bar-body').boundingBox();
 response=page.waitForResponse(r=>r.url().includes('/rpc/gantt_mutate') && r.request().method()==='POST');
 await page.mouse.move(body.x+body.width/2,body.y+body.height/2);await page.mouse.down();await page.mouse.move(body.x+body.width/2+dayWidth,body.y+body.height/2,{steps:6});await page.mouse.up();await response;
 await row('Review nested draft').locator('.timeline-drag-handle:not(:disabled)').waitFor();
 assert.notEqual((await snapshot()).cards.find(c=>c.id===created.id).start_date,changed.start_date);
 // The parent selector excludes self and descendants, but allows deeper parents.
 await row('Prototype').locator('.gantt-task-open').click();
 assert.deepEqual(await page.locator('#task-parent option').allTextContents(),['None — main task','Release notes']);
 await page.keyboard.press('Escape');
 await row('Review nested draft').locator('.gantt-task-open').click();
 assert.ok((await page.locator('#task-parent option').allTextContents()).includes('Prototype / Test build / Nested draft'));
 await page.keyboard.press('Escape');
 // Collapse and search preserve the complete ancestor path.
 await page.getByRole('button',{name:'Toggle subtasks for Prototype',exact:true}).click();
 assert.equal(await row('Nested draft').count(),0);
 await page.getByRole('textbox',{name:'Search tasks'}).fill('Nested draft');
 await row('Nested draft').waitFor();assert.equal(await row('Prototype').count(),1);assert.equal(await row('Test build').count(),1);
 assert.equal(await page.getByRole('button',{name:'Reorder Nested draft',exact:true}).isDisabled(),true);
 await page.getByRole('textbox',{name:'Search tasks'}).fill('');assert.equal(await row('Nested draft').count(),0);
 await page.getByRole('button',{name:'Toggle subtasks for Prototype',exact:true}).click();
 // Adding beneath a search result expands its previously collapsed ancestors.
 await page.getByRole('button',{name:'Toggle subtasks for Prototype',exact:true}).click();
 await page.getByRole('textbox',{name:'Search tasks'}).fill('Nested draft');
 await page.getByRole('button',{name:'Add subtasks to Test build',exact:true}).click();
 await page.getByRole('textbox',{name:'Subtask names'}).waitFor();
 assert.equal(await row('Nested draft').count(),1);
 await page.getByRole('textbox',{name:'Subtask names'}).press('Escape');
 // Root reorder moves the whole subtree; reload persists order.
 await page.getByRole('button',{name:'Reorder Release notes',exact:true}).dragTo(page.getByRole('button',{name:'Reorder Prototype',exact:true}));
 await page.waitForTimeout(250);
 let roots=(await snapshot()).cards.filter(c=>!c.parent_id).sort((a,b)=>a.timeline_position-b.timeline_position);assert.equal(roots[0].title,'Release notes');
 await page.reload();await row('Nested draft').waitFor();
 assert.equal(await page.locator('.gantt-task-copy strong').first().textContent(),'Release notes');
 await page.getByRole('button',{name:'Reorder Release notes',exact:true}).press('Alt+ArrowDown');await page.waitForTimeout(200);
 roots=(await snapshot()).cards.filter(c=>!c.parent_id).sort((a,b)=>a.timeline_position-b.timeline_position);assert.equal(roots[0].title,'Prototype');
 // Ensure label/bar geometry and row height agree.
 const rb=await row('Review nested draft').boundingBox(),bar=await row('Review nested draft').locator('.gantt-bar').boundingBox();assert.equal(rb.height,44);assert.ok(Math.abs((rb.y+22)-(bar.y+bar.height/2))<2);
 const grid=await page.locator('.gantt-grid').boundingBox();
 const parentRow=await row('Prototype').boundingBox(), childRow=await row('Test build').boundingBox();
 const path=await page.locator('.gantt-connections > path').first().getAttribute('d');
 const ys=path.match(/^M[\d.]+ ([\d.]+) H[\d.]+ V([\d.]+)/);assert.ok(ys);
 assert.ok(Math.abs(Number(ys[1])-(parentRow.y-grid.y+22))<1);assert.ok(Math.abs(Number(ys[2])-(childRow.y-grid.y+22))<1);
 await page.screenshot({path:'/tmp/nested-timeline-desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});
 await page.screenshot({path:'/tmp/nested-timeline-mobile.png',fullPage:true});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);
 const priorWrites=writes;await page.locator('.gantt-scroll').evaluate(el=>el.scrollLeft=300);await page.waitForTimeout(100);assert.equal(writes,priorWrites);
 // All boards: each board gets its own group header, colored to match the sidebar, with its
 // automatic end date (the latest deadline among its tasks).
 await page.getByRole('button',{name:'All boards',exact:true}).click();
 const gameplayGroup=page.locator('.gantt-group').filter({hasText:'Gameplay'});
 await gameplayGroup.waitFor();
 assert.equal(await gameplayGroup.locator('.gantt-group-dot').count(),1,'Gameplay group header shows a board-color dot');
 assert.ok((await gameplayGroup.innerText()).includes('Ends'),'Gameplay group header shows its automatic end date');
 const artGroup=page.locator('.gantt-group').filter({hasText:'Art'});
 await artGroup.waitFor();
 assert.equal(await artGroup.locator('.gantt-group-dot').count(),1,'Art group header also shows a board-color dot');
 assert.deepEqual(errors,[]);
 console.log('PASS inline creation, retry, nested hierarchy, cell scheduling, keyboard dates/undo, drag/resize, parent selector, filtering, drag reorder, reload, keyboard reorder, alignment, narrow-screen scrolling');
 await browser.close();await db.close();
})().catch(e=>{console.error(e);process.exit(1)});
