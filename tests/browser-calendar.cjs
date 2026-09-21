// Run with a local dev server and Playwright installed (or PLAYWRIGHT_MODULE set).
// Every Supabase HTTP request is intercepted; mutations execute only in PGlite.
const fs=require('node:fs'),assert=require('node:assert/strict');
const root=process.cwd();
const {createTimelineFixture}=require('./fixtures/timeline-db.cjs');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const id=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
(async()=>{
 const db=await createTimelineFixture();
 await db.exec('reset role');
 await db.exec(fs.readFileSync('supabase/migrate-calendar-events.sql','utf8'));
 await db.exec(fs.readFileSync('supabase/migrate-calendar-event-ranges.sql','utf8'));
 await db.exec('set role authenticated');
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
   else if(name==='calendar_events') {
    const method=route.request().method();
    const eventId=u.searchParams.get('id')?.replace('eq.','');
    if(method==='GET') data=(await db.query('select * from calendar_events')).rows;
    else if(method==='POST') {const b=route.request().postDataJSON();data=(await db.query('insert into calendar_events(project_id,title,date,start_time,end_time,location,notes,end_date) values($1,$2,$3,$4,$5,$6,$7,$8) returning *',[b.project_id,b.title,b.date,b.start_time,b.end_time,b.location,b.notes,b.end_date])).rows[0];}
    else if(method==='PATCH') {const b=route.request().postDataJSON();data=(await db.query('update calendar_events set title=$1,date=$2,start_time=$3,end_time=$4,location=$5,notes=$6,end_date=$8 where id=$7 returning *',[b.title,b.date,b.start_time,b.end_time,b.location,b.notes,eventId,b.end_date])).rows[0];}
    else if(method==='DELETE') data=(await db.query('delete from calendar_events where id=$1 returning id',[eventId])).rows[0];
   const normalize=row=>({...row,date:row.date instanceof Date?row.date.toISOString().slice(0,10):row.date,end_date:row.end_date instanceof Date?row.end_date.toISOString().slice(0,10):row.end_date});
   data=Array.isArray(data)?data.map(normalize):normalize(data);
   }
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
 await page.goto((process.env.APP_URL || 'http://localhost:3000')+'/calendar?board='+id(3));
 await page.getByRole('heading',{name:'Calendar',exact:true}).waitFor({timeout:15000}).catch(async e=>{console.error('Page state:',await page.locator('body').innerText(),errors);throw e;});
 assert.equal(await page.getByRole('button',{name:'Today',exact:true}).count(),1);
 await page.getByRole('combobox',{name:'Choose board'}).selectOption('all');
 const legend=page.getByRole('list',{name:'Board colors'});
 await legend.waitFor();
 const legendText=await legend.innerText();
 assert.ok(legendText.includes('Gameplay'),'All-boards legend lists Gameplay');
 assert.ok(legendText.includes('Art'),'All-boards legend lists Art');
 const gameplayEnd=new Date(`${day(4)}T12:00:00`).toLocaleDateString('en',{month:'short',day:'numeric'});
 assert.ok(legendText.includes(`Ends ${gameplayEnd}`),'Legend shows Gameplay\'s automatic end date (its latest task deadline)');
 await page.getByRole('combobox',{name:'Choose board'}).selectOption(id(3));
 await page.getByRole('combobox',{name:'Calendar date type'}).selectOption('startDate');
 await page.getByRole('button',{name:'Prototype',exact:true}).first().click();
 await page.getByLabel('Start date',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Cancel',exact:true}).click();
 const heading=page.locator('main h2').first();
 const current=await heading.textContent();
 await page.getByRole('button',{name:'Next month',exact:true}).click();
 assert.notEqual(await heading.textContent(),current);
 await page.getByRole('button',{name:'Today',exact:true}).click();
 assert.equal(await heading.textContent(),current);
 await page.getByRole('textbox',{name:'Search calendar tasks'}).fill('not-a-task');
 assert.equal(await page.locator('main').getByRole('button',{name:'Prototype',exact:false}).count(),0);
 await page.getByRole('textbox',{name:'Search calendar tasks'}).fill('');
 await page.getByRole('button',{name:'Release notes',exact:false}).click();
 await page.getByLabel('Start date',{exact:true}).fill(day(1));
 await page.getByLabel('Scheduled end',{exact:true}).fill(day(1));
 await page.getByRole('button',{name:'Save',exact:true}).click();
 await page.getByRole('dialog').waitFor({state:'hidden'});
 assert.equal((await snapshot()).cards.find(c=>c.title==='Release notes').deadline,day(1));
 await page.reload();
 await page.getByRole('heading',{name:'Calendar',exact:true}).waitFor();
 assert.equal(await page.getByRole('button',{name:'Release notes',exact:true}).count(),1);
 const taskCount=(await snapshot()).cards.length;
 const emptyDate=page.getByRole('button',{name:/^Add event on /}).first();
 const emptyLabel=await emptyDate.getAttribute('aria-label');
 const emptyBox=await emptyDate.boundingBox();
 await emptyDate.click({position:{x:emptyBox.width/2,y:emptyBox.height-10}});
 const selectedDate=await page.getByLabel('Start date',{exact:true}).inputValue();
 assert.equal(new Date(`${selectedDate}T12:00:00`).toLocaleDateString('en',{dateStyle:'full'}),emptyLabel.replace('Add event on ',''));
 const assertCentered=async()=>{
  const box=await page.getByRole('dialog').boundingBox(),view=page.viewportSize();
  assert.ok(Math.abs(box.x+box.width/2-view.width/2)<2,'Dialog is horizontally centered');
  assert.ok(Math.abs(box.y+box.height/2-view.height/2)<2,'Dialog is vertically centered');
 };
 await assertCentered();
 await page.setViewportSize({width:390,height:844});
 await assertCentered();
 await page.screenshot({path:'/tmp/foundry-event-dialog-mobile.png'});
 await page.setViewportSize({width:1440,height:1000});
 await page.getByRole('button',{name:'Cancel',exact:true}).click();
 await emptyDate.focus(); await page.keyboard.press('Enter');
 assert.equal(await page.getByLabel('Start date',{exact:true}).inputValue(),selectedDate);
 await page.getByRole('button',{name:'Cancel',exact:true}).click();
 await page.getByRole('button',{name:'New event',exact:true}).click();
 await page.getByLabel('Event title',{exact:true}).fill('Studio playtest');
 await page.getByLabel('Start date',{exact:true}).fill(day(0));
 await page.getByLabel('End date',{exact:true}).fill(day(9));
 await page.getByLabel('All day',{exact:true}).uncheck();
 await page.getByLabel('Start time',{exact:true}).fill('14:00');
 await page.getByLabel('End time (optional)',{exact:true}).fill('15:00');
 await page.getByLabel('Location',{exact:true}).fill('Studio');
 await page.getByRole('button',{name:'Save event',exact:true}).click();
 await page.getByRole('dialog').waitFor({state:'hidden'});
 assert.equal((await snapshot()).cards.length,taskCount);
 await page.reload();
 await page.getByRole('button',{name:'Studio playtest',exact:false}).first().waitFor();
 const eventBars=page.locator('button').filter({hasText:'Studio playtest'});
 assert.ok(await eventBars.count()>=2,'Multi-day event wraps across weeks');
 await page.screenshot({path:'/tmp/calendar-multiday-month.png'});
 await page.getByRole('button',{name:'Week',exact:true}).click();
 await page.getByRole('region',{name:'Weekly calendar'}).waitFor();
 await page.screenshot({path:'/tmp/calendar-multiday-week.png'});
 await page.getByRole('button',{name:'Next week',exact:true}).click();
 await page.getByRole('button',{name:'Studio playtest',exact:false}).first().waitFor();
 await page.getByRole('button',{name:'Day',exact:true}).click();
 await page.getByRole('region',{name:'Daily calendar'}).waitFor();
 await page.screenshot({path:'/tmp/calendar-multiday-day.png'});
 await page.getByRole('button',{name:'Studio playtest',exact:false}).first().click();
 assert.equal(await page.getByLabel('End date',{exact:true}).inputValue(),day(9));
 await page.getByRole('button',{name:'Cancel',exact:true}).click();
 await page.getByRole('button',{name:'Next day',exact:true}).click();
 await page.getByRole('button',{name:'Studio playtest',exact:false}).first().waitFor();
 await page.getByRole('button',{name:'Month',exact:true}).click();
 await page.getByRole('button',{name:'Today',exact:true}).click();
 const occupiedDate=page.getByRole('button',{name:`Add event on ${today.toLocaleDateString('en',{dateStyle:'full'})}`,exact:true});
 const occupiedBox=await occupiedDate.boundingBox();
 await occupiedDate.click({position:{x:occupiedBox.width/2,y:occupiedBox.height-8}});
 assert.equal(await page.getByLabel('Event title',{exact:true}).inputValue(),'');
 assert.equal(await page.getByLabel('Start date',{exact:true}).inputValue(),day(0));
 await page.getByRole('button',{name:'Cancel',exact:true}).click();
 await page.getByRole('combobox',{name:'Choose board'}).selectOption(id(4));
 await page.getByRole('button',{name:'Studio playtest',exact:false}).first().click();
 await page.getByLabel('Event title',{exact:true}).fill('Updated playtest');
 await page.getByRole('button',{name:'Save event',exact:true}).click();
 await page.getByRole('dialog').waitFor({state:'hidden'});
 assert.equal((await db.query('select title from calendar_events')).rows[0].title,'Updated playtest');
 await page.getByRole('button',{name:'Updated playtest',exact:false}).first().click();
 await page.getByRole('button',{name:'Delete event',exact:true}).click();
 await page.getByRole('button',{name:'Confirm delete',exact:true}).click();
 await page.getByRole('dialog').waitFor({state:'hidden'});
 assert.equal((await db.query('select * from calendar_events')).rows.length,0);
 assert.equal((await snapshot()).cards.length,taskCount);
 await page.getByRole('combobox',{name:'Choose board'}).selectOption(id(3));
 await page.screenshot({path:'/tmp/foundry-calendar-desktop.png' ,fullPage:true});
 await page.setViewportSize({width:390,height:844});
 await page.getByRole('button',{name:'Calendar',exact:true}).scrollIntoViewIfNeeded();
 await page.screenshot({path:'/tmp/foundry-calendar-mobile.png',fullPage:true});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),'No page-level horizontal overflow');
 assert.deepEqual(errors,[]);
 console.log('Calendar passed: task editing, standalone event create/reload/edit/delete, board independence, date filters, search, month navigation and mobile layout.');
 await browser.close();await db.close();
})().catch(e=>{console.error(e);process.exit(1);});
