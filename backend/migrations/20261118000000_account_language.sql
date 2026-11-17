-- M32 step 4: the language an account reads its emails in. An organiser's "Nova asked to enter"
-- is triggered from Nova's browser, so the reader's own language has to be kept. Set at sign-up,
-- at login and when the language is switched; null until then, read as English.
alter table app_users add column language text check (language in ('en', 'fr', 'de'));
