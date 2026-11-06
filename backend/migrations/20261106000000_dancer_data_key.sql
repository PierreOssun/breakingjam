-- The key of a dancer the curated-data import wrote (data/dancers.toml), so a page that names
-- curated people (the Team page) finds them in every environment, whatever their id there.
alter table dancers add column data_key text unique;
