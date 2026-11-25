begin;
select plan(3);

select has_column('jobs', 'claimed_at', 'jobs.claimed_at exists');
select col_type_is('jobs', 'claimed_at', 'timestamp with time zone', 'claimed_at is timestamptz');
select col_is_null('jobs', 'claimed_at', 'claimed_at is null until a worker claims the job');

select * from finish();
rollback;
