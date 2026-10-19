-- M18: when a battle starts, as wall-clock time in its jam's timezone; null until announced.
alter table battles add column starts_at timestamp without time zone;
