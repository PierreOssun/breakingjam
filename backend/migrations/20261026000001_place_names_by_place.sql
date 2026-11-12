-- M22, after review: deleting places (each re-import) cascades to their names, so look names up by
-- place; and tell a place's own names from its alternates, which only count for big places.
create index on place_names (place_id);
alter table place_names add column own boolean not null default false;  -- its name or ASCII name
