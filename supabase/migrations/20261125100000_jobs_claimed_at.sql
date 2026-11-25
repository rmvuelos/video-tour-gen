-- When a worker last claimed the job: a `running` job with an old claim lost its worker.
alter table jobs add column claimed_at timestamptz;
