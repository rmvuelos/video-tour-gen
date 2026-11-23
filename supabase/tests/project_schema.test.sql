begin;
select plan(29);

-- Fixtures: users A and B, each with one project, file and job.
insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'a@example.test'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'b@example.test');
insert into projects (id, user_id, name) values
  ('a1000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'A'),
  ('b1000000-0000-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-000000000002', 'B');
insert into project_files (project_id, user_id, kind, original_filename, declared_mime, size_bytes) values
  ('a1000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'plan', 'a.pdf', 'application/pdf', 10),
  ('b1000000-0000-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-000000000002', 'plan', 'b.pdf', 'application/pdf', 10);
insert into jobs (project_id, user_id, type, status) values
  ('a1000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'ingest', 'queued'),
  ('b1000000-0000-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-000000000002', 'ingest', 'queued');

select has_table('projects');
select has_table('project_files');
select has_table('jobs');
select is((select count(*) from pg_class where oid in ('projects'::regclass, 'project_files'::regclass, 'jobs'::regclass) and relrowsecurity), 3::bigint, 'RLS enabled on the 3 tables');

-- Constraints (23514 = check_violation)
select lives_ok($$insert into projects (user_id, name, description, area_m2) values ('bbbbbbbb-0000-0000-0000-000000000002', repeat('x', 120), repeat('x', 2000), null)$$, 'boundary values are accepted');
select throws_ok($$insert into projects (user_id, name) values ('aaaaaaaa-0000-0000-0000-000000000001', '')$$, '23514', null, 'empty name');
select throws_ok($$insert into projects (user_id, name) values ('aaaaaaaa-0000-0000-0000-000000000001', repeat('x', 121))$$, '23514', null, 'name over 120');
select throws_ok($$insert into projects (user_id, name, area_m2) values ('aaaaaaaa-0000-0000-0000-000000000001', 'x', 0)$$, '23514', null, 'area 0');
select throws_ok($$insert into projects (user_id, name, description) values ('aaaaaaaa-0000-0000-0000-000000000001', 'x', repeat('x', 2001))$$, '23514', null, 'description over 2000');
select throws_ok($$insert into projects (user_id, name, status) values ('aaaaaaaa-0000-0000-0000-000000000001', 'x', 'bogus')$$, '23514', null, 'project status');

select throws_ok($$insert into project_files (project_id, user_id, kind, original_filename, declared_mime, size_bytes) values ('a1000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'bogus', 'f', 'image/png', 1)$$, '23514', null, 'file kind');
select throws_ok($$insert into project_files (project_id, user_id, kind, original_filename, declared_mime, size_bytes) values ('a1000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'photo', 'f', 'image/png', 0)$$, '23514', null, 'size_bytes 0');
select throws_ok($$insert into project_files (project_id, user_id, kind, original_filename, declared_mime, size_bytes, page_index) values ('a1000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'plan', 'f', 'application/pdf', 1, -1)$$, '23514', null, 'page_index -1');
select throws_ok($$insert into project_files (project_id, user_id, kind, original_filename, declared_mime, size_bytes, status) values ('a1000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'photo', 'f', 'image/png', 1, 'bogus')$$, '23514', null, 'file status');
select throws_ok($$insert into project_files (project_id, user_id, kind, original_filename, declared_mime, size_bytes) values ('a1000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'photo', repeat('x', 256), 'image/png', 1)$$, '23514', null, 'filename over 255');

select throws_ok($$insert into jobs (project_id, user_id, type, status) values ('a1000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'bogus', 'done')$$, '23514', null, 'job type');
select throws_ok($$insert into jobs (project_id, user_id, type, status) values ('a1000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'ingest', 'bogus')$$, '23514', null, 'job status');

-- One active job per (project, type)
select throws_ok($$insert into jobs (project_id, user_id, type, status) values ('a1000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'ingest', 'running')$$, '23505', null, 'second active job rejected');
update jobs set status = 'done' where project_id = 'a1000000-0000-0000-0000-000000000001';
select lives_ok($$insert into jobs (project_id, user_id, type, status) values ('a1000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'ingest', 'queued')$$, 'new job allowed once the previous is done');

-- Cascade from projects
delete from projects where id = 'a1000000-0000-0000-0000-000000000001';
select is((select count(*) from project_files where project_id = 'a1000000-0000-0000-0000-000000000001'), 0::bigint, 'deleting a project cascades to its files');
insert into projects (id, user_id, name) values ('a1000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'A');
insert into project_files (project_id, user_id, kind, original_filename, declared_mime, size_bytes) values ('a1000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'plan', 'a.pdf', 'application/pdf', 10);
insert into jobs (project_id, user_id, type, status) values ('a1000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'ingest', 'queued');

-- updated_at trigger (now() is constant in a transaction, so start from the past)
update projects set updated_at = '2000-01-01' where id = 'a1000000-0000-0000-0000-000000000001';
update projects set name = 'A2' where id = 'a1000000-0000-0000-0000-000000000001';
select ok((select updated_at > '2000-01-01' from projects where id = 'a1000000-0000-0000-0000-000000000001'), 'updated_at is refreshed on update');

-- RLS as user A
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}';
select is((select count(*) from projects), 1::bigint, 'A sees only own projects');
select is((select count(*) from project_files), 1::bigint, 'A sees only own files');
select is((select count(*) from jobs), 1::bigint, 'A sees only own jobs');
select is((select count(*) from projects where user_id <> auth.uid()) + (select count(*) from project_files where user_id <> auth.uid()) + (select count(*) from jobs where user_id <> auth.uid()), 0::bigint, 'A never sees B rows');
select throws_ok($$insert into projects (user_id, name) values ('aaaaaaaa-0000-0000-0000-000000000001', 'x')$$, '42501', null, 'authenticated cannot insert');
select lives_ok($q$do $b$ declare n int; begin update projects set name = 'hack'; get diagnostics n = row_count; assert n = 0; end $b$$q$, 'authenticated cannot update');
select lives_ok($q$do $b$ declare n int; begin delete from projects; get diagnostics n = row_count; assert n = 0; end $b$$q$, 'authenticated cannot delete');

-- anon sees nothing
set local role anon;
select is((select count(*) from projects) + (select count(*) from project_files) + (select count(*) from jobs), 0::bigint, 'anon sees nothing');

select * from finish();
rollback;
