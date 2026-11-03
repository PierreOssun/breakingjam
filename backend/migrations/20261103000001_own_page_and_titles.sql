-- M25: an account has at most one page of its own (`source = 'self'`, made through
-- `POST /api/dancers/mine`). Before M25, `self` meant a page a plain account made through the
-- API, for anyone: none of those is known to be the account's own page.
update dancers set source = 'organizer' where source = 'self';
-- A page counts as the account's own while it is live, not merged away and not someone else's:
-- the same rule as `db::dancers::own_page`, so an account that lost its page may make one. A
-- page merged into one nobody owns is still the account's, through the merge; the handler
-- refuses a second page then.
create unique index dancers_one_self_page on dancers (created_by)
  where source = 'self' and deleted_at is null and merged_into_id is null
    and (user_id is null or user_id = created_by);

-- M25: what a dancer page says its dancer does ("I'm a…"); set by its verified owner or the
-- BreakingJam team, never guessed. Empty until set.
create type dancer_title as enum ('bboy', 'bgirl', 'breaker', 'dj', 'mc', 'judge');
alter table dancers add column titles dancer_title[] not null default '{}';
