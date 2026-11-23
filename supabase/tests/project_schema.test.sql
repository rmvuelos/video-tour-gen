begin;
select plan(46);

-- Fixtures: users A and B with one project, file and job each.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.test'), ('00000000-0000-0000-0000-00000000000b', 'b@example.test'), ('00000000-0000-0000-0000-00000000000c', 'c@example.test');
insert into projects (id, user_id, name) values ('00000000-0000-0000-0001-00000000000a', '00000000-0000-0000-0000-00000000000a', 'A'), ('00000000-0000-0000-0001-00000000000b', '00000000-0000-0000-0000-00000000000b', 'B');
insert into project_files (project_id, user_id, kind, original_filename, declared_mime, size_bytes) values
  ('00000000-0000-0000-0001-00000000000a', '00000000-0000-0000-0000-00000000000a', 'plan', 'a.pdf', 'application/pdf', 10),
  ('00000000-0000-0000-0001-00000000000b', '00000000-0000-0000-0000-00000000000b', 'plan', 'b.pdf', 'application/pdf', 10);
insert into jobs (project_id, user_id, type, status) values
  ('00000000-0000-0000-0001-00000000000a', '00000000-0000-0000-0000-00000000000a', 'ingest', 'queued'),
  ('00000000-0000-0000-0001-00000000000b', '00000000-0000-0000-0000-00000000000b', 'ingest', 'queued');

select has_table('projects');
select has_table('project_files');
select has_table('jobs');
select is((select count(*) from pg_class where oid in ('projects'::regclass, 'project_files'::regclass, 'jobs'::regclass) and relrowsecurity), 3::bigint, 'RLS enabled on the 3 tables');

-- Constraints (23514 = check_violation)
select lives_ok($$insert into projects (user_id, name, description, area_m2) values ('00000000-0000-0000-0000-00000000000b', repeat('x', 120), repeat('x', 2000), null)$$, 'boundary values are accepted');
select throws_ok($$insert into projects (user_id, name) values ('00000000-0000-0000-0000-00000000000a', '')$$, '23514', null, 'empty name');
select throws_ok($$insert into projects (user_id, name) values ('00000000-0000-0000-0000-00000000000a', '   ')$$, '23514', null, 'blank name');
select throws_ok($$insert into projects (user_id, name) values ('00000000-0000-0000-0000-00000000000a', repeat('x', 121))$$, '23514', null, 'name over 120');
select throws_ok($$insert into projects (user_id, name, area_m2) values ('00000000-0000-0000-0000-00000000000a', 'x', 0)$$, '23514', null, 'area 0');
select throws_ok($$insert into projects (user_id, name, description) values ('00000000-0000-0000-0000-00000000000a', 'x', repeat('x', 2001))$$, '23514', null, 'description over 2000');
select throws_ok($$insert into projects (user_id, name, status) values ('00000000-0000-0000-0000-00000000000a', 'x', 'bogus')$$, '23514', null, 'project status');

select throws_ok($$insert into project_files (project_id, user_id, kind, original_filename, declared_mime, size_bytes) values ('00000000-0000-0000-0001-00000000000a', '00000000-0000-0000-0000-00000000000a', 'bogus', 'f', 'image/png', 1)$$, '23514', null, 'file kind');
select throws_ok($$insert into project_files (project_id, user_id, kind, original_filename, declared_mime, size_bytes) values ('00000000-0000-0000-0001-00000000000a', '00000000-0000-0000-0000-00000000000a', 'photo', 'f', 'image/png', 0)$$, '23514', null, 'size_bytes 0');
select throws_ok($$insert into project_files (project_id, user_id, kind, original_filename, declared_mime, size_bytes) values ('00000000-0000-0000-0001-00000000000a', '00000000-0000-0000-0000-00000000000a', 'photo', 'f', 'text/plain', 1)$$, '23514', null, 'mime outside the allowed list');
select throws_ok($$insert into project_files (project_id, user_id, kind, original_filename, declared_mime, size_bytes, width) values ('00000000-0000-0000-0001-00000000000a', '00000000-0000-0000-0000-00000000000a', 'photo', 'f', 'image/png', 1, 0)$$, '23514', null, 'width 0');
select throws_ok($$insert into project_files (project_id, user_id, kind, original_filename, declared_mime, size_bytes, page_index) values ('00000000-0000-0000-0001-00000000000a', '00000000-0000-0000-0000-00000000000a', 'plan', 'f', 'application/pdf', 1, -1)$$, '23514', null, 'page_index -1');
select throws_ok($$insert into project_files (project_id, user_id, kind, original_filename, declared_mime, size_bytes, page_index) values ('00000000-0000-0000-0001-00000000000a', '00000000-0000-0000-0000-00000000000a', 'photo', 'f', 'image/png', 1, 0)$$, '23514', null, 'page_index on a photo');
select throws_ok($$insert into project_files (project_id, user_id, kind, original_filename, declared_mime, size_bytes, status) values ('00000000-0000-0000-0001-00000000000a', '00000000-0000-0000-0000-00000000000a', 'photo', 'f', 'image/png', 1, 'bogus')$$, '23514', null, 'file status');
select throws_ok($$insert into project_files (project_id, user_id, kind, original_filename, declared_mime, size_bytes) values ('00000000-0000-0000-0001-00000000000a', '00000000-0000-0000-0000-00000000000a', 'photo', repeat('x', 256), 'image/png', 1)$$, '23514', null, 'filename over 255');

select throws_ok($$insert into jobs (project_id, user_id, type, status) values ('00000000-0000-0000-0001-00000000000a', '00000000-0000-0000-0000-00000000000a', 'bogus', 'done')$$, '23514', null, 'job type');
select throws_ok($$insert into jobs (project_id, user_id, type, status) values ('00000000-0000-0000-0001-00000000000a', '00000000-0000-0000-0000-00000000000a', 'ingest', 'bogus')$$, '23514', null, 'job status');
select throws_ok($$insert into jobs (project_id, user_id, type, status, started_at, finished_at) values ('00000000-0000-0000-0001-00000000000a', '00000000-0000-0000-0000-00000000000a', 'ingest', 'done', '2026-01-02', '2026-01-01')$$, '23514', null, 'finished_at before started_at');

-- Owner integrity: user_id must match the project owner (23503 = foreign_key_violation)
select throws_ok($$insert into project_files (project_id, user_id, kind, original_filename, declared_mime, size_bytes) values ('00000000-0000-0000-0001-00000000000a', '00000000-0000-0000-0000-00000000000b', 'photo', 'f', 'image/png', 1)$$, '23503', null, 'file with another owner than its project');
select throws_ok($$insert into jobs (project_id, user_id, type, status) values ('00000000-0000-0000-0001-00000000000a', '00000000-0000-0000-0000-00000000000b', 'ingest', 'done')$$, '23503', null, 'job with another owner than its project');

-- One active job per (project, type); one plan per project; many photos
select throws_ok($$insert into jobs (project_id, user_id, type, status) values ('00000000-0000-0000-0001-00000000000a', '00000000-0000-0000-0000-00000000000a', 'ingest', 'running')$$, '23505', null, 'second active job rejected');
update jobs set status = 'done' where project_id = '00000000-0000-0000-0001-00000000000a';
select lives_ok($$insert into jobs (project_id, user_id, type, status) values ('00000000-0000-0000-0001-00000000000a', '00000000-0000-0000-0000-00000000000a', 'ingest', 'queued')$$, 'new job allowed once the previous is done');
select throws_ok($$insert into project_files (project_id, user_id, kind, original_filename, declared_mime, size_bytes) values ('00000000-0000-0000-0001-00000000000a', '00000000-0000-0000-0000-00000000000a', 'plan', 'p2.png', 'image/png', 1)$$, '23505', null, 'second plan rejected');
select lives_ok($$insert into project_files (project_id, user_id, kind, original_filename, declared_mime, size_bytes) values ('00000000-0000-0000-0001-00000000000a', '00000000-0000-0000-0000-00000000000a', 'photo', '1.jpg', 'image/jpeg', 1), ('00000000-0000-0000-0001-00000000000a', '00000000-0000-0000-0000-00000000000a', 'photo', '2.jpg', 'image/jpeg', 1)$$, 'two photos allowed');

-- Cascades: project -> files and jobs; auth user -> everything
insert into projects (id, user_id, name) values ('00000000-0000-0000-0001-0000000000c1', '00000000-0000-0000-0000-00000000000c', 'C1'), ('00000000-0000-0000-0001-0000000000c2', '00000000-0000-0000-0000-00000000000c', 'C2');
insert into project_files (project_id, user_id, kind, original_filename, declared_mime, size_bytes) values ('00000000-0000-0000-0001-0000000000c1', '00000000-0000-0000-0000-00000000000c', 'plan', 'c.pdf', 'application/pdf', 1), ('00000000-0000-0000-0001-0000000000c2', '00000000-0000-0000-0000-00000000000c', 'plan', 'c.pdf', 'application/pdf', 1);
insert into jobs (project_id, user_id, type, status) values ('00000000-0000-0000-0001-0000000000c1', '00000000-0000-0000-0000-00000000000c', 'ingest', 'queued'), ('00000000-0000-0000-0001-0000000000c2', '00000000-0000-0000-0000-00000000000c', 'ingest', 'queued');
delete from projects where id = '00000000-0000-0000-0001-0000000000c1';
select is((select count(*) from project_files where project_id = '00000000-0000-0000-0001-0000000000c1') + (select count(*) from jobs where project_id = '00000000-0000-0000-0001-0000000000c1'), 0::bigint, 'deleting a project deletes its files and jobs');
delete from auth.users where id = '00000000-0000-0000-0000-00000000000c';
select is((select count(*) from projects where user_id = '00000000-0000-0000-0000-00000000000c') + (select count(*) from project_files where user_id = '00000000-0000-0000-0000-00000000000c') + (select count(*) from jobs where user_id = '00000000-0000-0000-0000-00000000000c'), 0::bigint, 'deleting a user deletes projects, files and jobs');

-- updated_at trigger (now() is constant in a transaction, so start from an old value)
update projects set updated_at = '2000-01-01' where id = '00000000-0000-0000-0001-00000000000a';
update projects set name = 'A2' where id = '00000000-0000-0000-0001-00000000000a';
select ok((select updated_at > '2000-01-01' from projects where id = '00000000-0000-0000-0001-00000000000a'), 'updated_at is refreshed on update');

-- RLS as user A
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';
select is((select count(*) from projects), 1::bigint, 'A sees only own projects');
select is((select count(*) from project_files), 3::bigint, 'A sees only own files');
select is((select count(*) from jobs), 2::bigint, 'A sees only own jobs');
select is((select count(*) from projects where user_id <> auth.uid()) + (select count(*) from project_files where user_id <> auth.uid()) + (select count(*) from jobs where user_id <> auth.uid()), 0::bigint, 'A never sees B rows');
select throws_ok($$insert into projects (user_id, name) values ('00000000-0000-0000-0000-00000000000a', 'x')$$, '42501', null, 'authenticated cannot insert projects');
select throws_ok($$insert into project_files (project_id, user_id, kind, original_filename, declared_mime, size_bytes) values ('00000000-0000-0000-0001-00000000000a', '00000000-0000-0000-0000-00000000000a', 'photo', 'f', 'image/png', 1)$$, '42501', null, 'authenticated cannot insert files');
select throws_ok($$insert into jobs (project_id, user_id, type, status) values ('00000000-0000-0000-0001-00000000000a', '00000000-0000-0000-0000-00000000000a', 'ingest', 'done')$$, '42501', null, 'authenticated cannot insert jobs');
select throws_ok($$update projects set name = 'hack'$$, '42501', null, 'authenticated cannot update');
select throws_ok($$delete from projects$$, '42501', null, 'authenticated cannot delete');

-- RLS as user B (symmetry)
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}';
select is((select count(*) from projects where user_id <> auth.uid()) + (select count(*) from project_files where user_id <> auth.uid()) + (select count(*) from jobs where user_id <> auth.uid()), 0::bigint, 'B never sees A rows');
select is((select count(*) from project_files), 1::bigint, 'B sees only own files');

-- anon: no read, no write
set local role anon;
select throws_ok($$select count(*) from projects$$, '42501', null, 'anon cannot read projects');
select throws_ok($$select count(*) from jobs$$, '42501', null, 'anon cannot read jobs');
select throws_ok($$insert into projects (user_id, name) values ('00000000-0000-0000-0000-00000000000a', 'x')$$, '42501', null, 'anon cannot insert');

reset role;
select is((select name from projects where id = '00000000-0000-0000-0001-00000000000a'), 'A2', 'denied writes left data intact');

select * from finish();
rollback;
