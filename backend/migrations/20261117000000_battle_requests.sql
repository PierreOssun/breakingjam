-- M32 step 3: dancers ask to enter a battle "with approval"; its organiser accepts (a normal
-- entry is made) or declines. A request is never an entry: pending entries are public.
create table battle_requests (
  id uuid primary key,
  battle_id uuid not null references battles(id) on delete cascade,
  user_id uuid not null references app_users(id) on delete cascade,   -- the account that asked
  dancer_id uuid not null references dancers(id),                      -- its verified page: the dancer, or a team's captain
  team_name text,
  status claim_status not null default 'pending',                       -- pending, approved, rejected; a cancelled one is deleted
  decided_by uuid references app_users(id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index battle_requests_one_pending
  on battle_requests (battle_id, dancer_id) where status = 'pending';
create index on battle_requests (battle_id, status);

create table battle_request_members (   -- who would enter, the asker first; one for a solo battle
  request_id uuid not null references battle_requests(id) on delete cascade,
  dancer_id uuid not null references dancers(id),
  position smallint not null,
  primary key (request_id, dancer_id)
);
