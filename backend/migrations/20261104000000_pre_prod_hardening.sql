-- M26: what the review before production found cheaper to change now than with real data.

-- A jam is upcoming, live or past by its own calendar, never by a status someone has to set:
-- `completed` goes. Postgres can't drop an enum value, so the type is rebuilt; a completed jam
-- becomes published, and its dates say it is over.
alter type event_status rename to event_status_old;
create type event_status as enum ('draft', 'in_review', 'published', 'registration_closed', 'cancelled');
alter table events
  alter column status drop default,
  alter column status type event_status
    using (case status::text when 'completed' then 'published' else status::text end)::event_status,
  alter column status set default 'draft';
drop type event_status_old;

-- Where a jam is in time, by its own calendar: every query asks this, so the rule lives once.
-- The API refuses a timezone Postgres doesn't know, so this never fails on a stored jam.
create type jam_phase as enum ('upcoming', 'live', 'past');
create function jam_phase(starts_on date, ends_on date, timezone text) returns jam_phase
language sql stable as $$
  select case
    when ends_on < (now() at time zone timezone)::date then 'past'::jam_phase
    when starts_on > (now() at time zone timezone)::date then 'upcoming'::jam_phase
    else 'live'::jam_phase
  end
$$;

-- Verification reserves an organiser's handle, typing it doesn't: nobody can squat one.
drop index app_users_instagram_handle_key;
create unique index app_users_instagram_handle_key on app_users (lower(instagram_handle))
  where verified_at is not null;

-- Never set nor shown, and a legal name on a public endpoint.
alter table dancers drop column real_name;

-- The foreign keys the dancer, organiser and jam pages read by.
create index on entry_members (dancer_id);
create index on event_staff (dancer_id);
create index on events (organizer_id);
-- `own_page` finds the account's self page, merged away or not, on every `/auth/me`.
create index dancers_self_pages on dancers (created_by) where source = 'self';

-- The rules the API already checks (`domain::battle`), so no other writer can break them.
alter table entries
  add constraint entries_winner_is_first
    check ((reached = 'winner') = (final_rank is not distinct from 1)),
  add constraint entries_top2_is_second check (reached <> 'top2' or final_rank = 2),
  add constraint entries_offset_needs_video
    check (video_offset_seconds is null or video_url is not null);
alter table battles
  add constraint battles_team_size_format check (format in ('team', 'showcase') or team_size is null),
  add constraint battles_prize_currency
    check ((prize_currency is null) = (coalesce(prize_first, prize_second, prize_third) is null));
alter table events add constraint events_pin_together check ((lat is null) = (lng is null));
