const fs=require('node:fs');
const {PGlite}=require('@electric-sql/pglite');
const id=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
async function createTimelineFixture(){
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
 await db.exec(fs.readFileSync('supabase/migrate-task-hierarchy.sql','utf8'));
 await db.exec(fs.readFileSync('supabase/migrate-nested-timeline.sql','utf8'));
 await db.exec('grant usage on schema auth to authenticated;grant select,insert,update,delete on all tables in schema public to authenticated;set role authenticated;');

 return db;
}
module.exports={createTimelineFixture,id};
