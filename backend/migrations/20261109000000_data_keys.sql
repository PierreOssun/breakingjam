-- The keys of the jams and crews the curated-data import wrote (data/events/<series>/<year>,
-- data/crews.toml), as dancers already have one: the import can run again and add only what is new.
alter table events add column data_key text unique;
alter table crews add column data_key text unique;
