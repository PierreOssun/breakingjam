-- M31: the admin panel.

-- One super admin at most; it is set with SQL, never through the API.
create unique index app_users_one_super_admin on app_users (role) where role = 'super_admin';

-- When the account last logged in or came back (`GET /auth/me`, once per visit); the newest
-- session is the best guess for the accounts that exist already.
alter table app_users add column last_seen_at timestamptz;
update app_users u set last_seen_at = (select max(s.created_at) from sessions s where s.user_id = u.id);

-- A jam the team entered stays the team's (no organiser card, "Contact us") after whoever
-- entered it leaves the team.
alter table events add column entered_by_team boolean not null default false;
update events e set entered_by_team = true
  from app_users u where u.id = e.organizer_id and u.role >= 'seed_admin';

-- What admins decided: the history under the jam queue, and a trail of merges and role changes.
-- Claim decisions need no copy here: the claims keep `reviewed_by` and `reviewed_at`.
create type admin_action as enum ('jam_approved', 'jam_rejected', 'dancer_merged', 'role_changed');
create table admin_actions (
  id uuid primary key,
  admin_id uuid not null references app_users(id),
  action admin_action not null,
  event_id uuid references events(id),        -- jam_approved, jam_rejected
  dancer_id uuid references dancers(id),      -- dancer_merged: the page merged away
  user_id uuid references app_users(id),      -- role_changed: whose role
  role user_role,                             -- role_changed: the new one
  note text,                                  -- jam_rejected: what the organiser should change
  created_at timestamptz not null default now(),
  check ((event_id is not null) = (action in ('jam_approved', 'jam_rejected'))),
  check ((dancer_id is not null) = (action = 'dancer_merged')),
  check ((user_id is not null) = (action = 'role_changed')),
  check ((role is not null) = (action = 'role_changed')),
  check ((note is not null) = (action = 'jam_rejected'))
);
create index on admin_actions (action, created_at);
