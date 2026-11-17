-- M32 step 1: "I'm going". One row per account and jam; the jam page shows how many.
create table event_attendees (
  event_id uuid not null references events(id) on delete cascade,
  user_id uuid not null references app_users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (event_id, user_id)
);
