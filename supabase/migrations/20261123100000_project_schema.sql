-- Writes go through the API with the service role (P-5); clients only read their own rows.

create function set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end $$;

create table projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  area_m2 numeric check (area_m2 > 0),
  description text check (char_length(description) <= 2000),
  status text not null default 'draft' check (status in ('draft', 'ingesting', 'ready', 'needs_fix')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index projects_user_created_idx on projects (user_id, created_at desc);
create trigger projects_set_updated_at before update on projects
  for each row execute function set_updated_at();

create table project_files (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('plan', 'photo')),
  -- Display only: storage paths never use it.
  original_filename text not null check (char_length(original_filename) <= 255),
  declared_mime text not null,
  size_bytes bigint not null check (size_bytes > 0),
  page_index integer check (page_index >= 0),
  status text not null default 'pending' check (status in ('pending', 'uploaded', 'valid', 'invalid')),
  error_code text,
  original_path text,
  derived_path text,
  thumb_path text,
  width integer,
  height integer,
  created_at timestamptz not null default now()
);
create index project_files_project_idx on project_files (project_id);

create table jobs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  type text not null check (type in ('ingest')),
  status text not null default 'queued' check (status in ('queued', 'running', 'done', 'failed')),
  error_code text,
  attempts integer not null default 0,
  started_at timestamptz,
  finished_at timestamptz,
  duration_ms integer,
  created_at timestamptz not null default now()
);
create index jobs_project_created_idx on jobs (project_id, created_at desc);
create unique index jobs_one_active_idx on jobs (project_id, type) where status in ('queued', 'running');

alter table projects enable row level security;
alter table project_files enable row level security;
alter table jobs enable row level security;

create policy projects_select_own on projects for select to authenticated using (auth.uid() = user_id);
create policy project_files_select_own on project_files for select to authenticated using (auth.uid() = user_id);
create policy jobs_select_own on jobs for select to authenticated using (auth.uid() = user_id);
