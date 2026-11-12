-- M12c: an organiser's public page lives on the account, verified by Instagram like dancers.
alter table app_users
  add column instagram_handle text,  -- lowercase, no '@'
  add column country char(2),
  add column city text,
  add column bio text,
  add column verified_at timestamptz;
create unique index app_users_instagram_handle_key
  on app_users (lower(instagram_handle))
  where instagram_handle is not null;

create table organizer_claims (
  id uuid primary key,
  user_id uuid not null
    references app_users(id) on delete cascade,
  instagram_handle text not null, -- frozen at request
  code text not null,             -- 'BJ-7K2M'
  status claim_status not null default 'pending',
  reviewed_by uuid references app_users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index organizer_claims_one_pending_key
  on organizer_claims (user_id)
  where status = 'pending';
