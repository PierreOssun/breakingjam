-- M24: a jam starts as a draft from its name and first day. City and country come with the
-- venue, and are needed to submit or publish, not to exist.
alter table events alter column city drop not null;
alter table events alter column country drop not null;
-- M24: when the jam opens and closes, as wall-clock time in its timezone; null = not announced.
alter table events add column opens_at time, add column closes_at time;
