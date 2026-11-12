-- M15: how to reach a jam, shown on its page.
alter table events
  add column contact_email text,  -- public; optional
  add column website_url text;    -- http(s) only
