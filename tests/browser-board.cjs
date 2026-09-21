// Run with a local dev server and Playwright installed (or PLAYWRIGHT_MODULE set).
// Every Supabase HTTP request is intercepted; mutations execute only in PGlite.
// Covers the Kanban "All boards" grouped view (per-board color, task count, end date, overflow
// menu) and the outside-click-closes-the-dropdown fix, both of which had zero coverage before.
const fs=require('node:fs'),assert=require('node:assert/strict');
const root=process.cwd();
const {createTimelineFixture}=require('./fixtures/timeline-db.cjs');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const id=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
(async()=>{
 const db=await createTimelineFixture();
 const snapshot=async()=> (await db.query('select gantt_snapshot($1) s',[id(1)])).rows[0].s;

 const env=fs.readFileSync(root+'/.env.local','utf8');
 const host=new URL(env.match(/^NEXT_PUBLIC_SUPABASE_URL=["']?([^\s"']+)/m)[1]).hostname;
 const profile={id:id(99),name:'Board tester',initials:'BT',color:'#849884',onboarded_at:'2026-01-01'};
 const browser=await chromium.launch({headless:true,channel:"chrome"});
 const context=await browser.newContext({viewport:{width:1440,height:1000}});
 const errors=[];
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
    else if(name==='gantt_mutate'||name==='gantt_mutate_hierarchy')data=(await db.query(`select ${name}($1,$2,$3) s`,[body.p_project,body.p_expected,body.p_action])).rows[0].s;
   }else if(['boards','board_columns','board_cards'].includes(name))data=(await db.query(`select * from ${name} order by position nulls last,id`)).rows.map(r=>Object.fromEntries(Object.entries(r).map(([k,v])=>[k,v instanceof Date?v.toISOString().slice(0,10):v])));
   else if(name==='profiles')data=u.searchParams.get('id')?profile:[profile];
   else if(name==='project_members')data=[{project_id:id(1),role:'owner',user_id:id(99),profile,profiles:profile,projects:{id:id(1),name:'Timeline fixture',color:'#849884'}}];
   else if(name==='projects')data={id:id(1),name:'Timeline fixture'};
   else if(name==='board_categories')data=[{id:id(70),name:'mechanic'}];
   await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
  }catch(e){await route.fulfill({status:400,contentType:'application/json',body:JSON.stringify({message:e.message,code:'P0001'})});}
 });
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.goto((process.env.APP_URL || 'http://localhost:3000')+'/board?board='+id(3));

 // Clicking non-interactive text is a reliable "outside click" that can't accidentally hit
 // another control; the sidebar's "Boards" label is always present and inert.
 const clickOutside=()=>page.getByText('Boards',{exact:true}).click();

 // All boards is the default view (two boards in the fixture), so it renders on load with no
 // extra click — one group per board, each with its own name, task count and overflow menu.
 const gameplayGroup=page.locator('.kanban-group').filter({hasText:'Gameplay'});
 const artGroup=page.locator('.kanban-group').filter({hasText:'Art'});
 await gameplayGroup.waitFor({timeout:15000}).catch(async e=>{console.error('Page state:',await page.locator('body').innerText(),errors);throw e;});
 await artGroup.waitFor();
 assert.ok((await gameplayGroup.innerText()).includes('2 tasks'),'Gameplay group shows its task count');
 assert.ok((await artGroup.innerText()).includes('0 tasks'),'Art group shows its (empty) task count');
 const gameplayStyle=await gameplayGroup.getAttribute('style'),artStyle=await artGroup.getAttribute('style');
 assert.ok(gameplayStyle && gameplayStyle.includes('--board-color'),'Gameplay group carries a --board-color custom property');
 assert.notEqual(gameplayStyle,artStyle,'Gameplay and Art get different board colors');
 assert.ok(await gameplayGroup.locator('.card').filter({hasText:'Prototype'}).count()>=1,'Gameplay group shows its Prototype card');

 // Dropdown outside-click: opening a board-group's overflow menu shows its panel; clicking
 // elsewhere on the page closes it again (previously only its own summary could close it).
 const gameplayMenuSummary=gameplayGroup.locator('summary[aria-label="Gameplay actions"]');
 await gameplayMenuSummary.click();
 const gameplayMenuPanel=gameplayGroup.locator('.planning-overflow > div');
 await gameplayMenuPanel.getByText('Manage stages',{exact:true}).waitFor();
 assert.ok(await gameplayMenuPanel.getByText('Open board',{exact:true}).isVisible());
 await clickOutside();
 await gameplayMenuPanel.waitFor({state:'hidden'});

 // Opening a different board's menu closes any other one left open (no two panels stay open).
 await gameplayMenuSummary.click();
 await gameplayMenuPanel.waitFor({state:'visible'});
 await artGroup.locator('summary[aria-label="Art actions"]').click();
 await gameplayMenuPanel.waitFor({state:'hidden'});
 await artGroup.locator('.planning-overflow > div').waitFor({state:'visible'});
 await clickOutside();
 await artGroup.locator('.planning-overflow > div').waitFor({state:'hidden'});

 // "Open board" switches out of All boards into a single-board view.
 await gameplayMenuSummary.click();
 await gameplayMenuPanel.getByText('Open board',{exact:true}).click();
 await page.locator('.col').filter({hasText:'Explore'}).waitFor();
 assert.equal(await page.locator('.kanban-group').count(),0,'Single-board view has no group sections');
 assert.ok(await page.locator('.card').filter({hasText:'Prototype'}).count()>=1);

 // Filters dropdown also closes on outside click, confirming the fix isn't special-cased to
 // the board-group menu.
 await page.locator('.planning-menu').filter({hasText:'Filters'}).locator('summary').click();
 const filtersPanel=page.locator('.planning-menu > div').filter({hasText:'Category'});
 await filtersPanel.waitFor({state:'visible'});
 await clickOutside();
 await filtersPanel.waitFor({state:'hidden'});

 assert.deepEqual(errors,[]);
 console.log('Board passed: All-boards grouped view (color, task count, overflow menu), open-board switch, and outside-click closes dropdowns.');
 await browser.close();await db.close();
})().catch(e=>{console.error(e);process.exit(1);});
