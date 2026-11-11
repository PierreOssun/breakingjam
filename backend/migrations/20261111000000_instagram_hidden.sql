-- A verified dancer may keep their Instagram handle off their public page and out of search.
alter table dancers add column instagram_hidden boolean not null default false;
