-- How often an organiser was emailed that this account asks to enter this battle: at most twice a
-- day, however often the asker cancels and asks again.
create table request_mails (
  battle_id uuid not null references battles(id) on delete cascade,
  user_id uuid not null references app_users(id) on delete cascade,
  sends smallint not null default 1 check (sends between 1 and 2),
  day_started_at timestamptz not null default now(),
  primary key (battle_id, user_id)
);
