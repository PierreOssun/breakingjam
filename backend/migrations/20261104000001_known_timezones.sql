-- M26, after review: `jam_phase` fails on a timezone Postgres doesn't know, and before M26 the
-- API checked only its shape. A jam stored with such a name falls back to UTC, at most a day
-- off its own calendar, rather than breaking every list, map and count it appears in.
update events set timezone = 'UTC' where timezone not in (select name from pg_timezone_names);
