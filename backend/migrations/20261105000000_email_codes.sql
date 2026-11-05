-- M27: the 6-digit codes mailed to confirm an email address or reset a password.

create type email_code_purpose as enum ('verify_email', 'reset_password');

-- One live code per account and purpose: a new one replaces the last.
create table email_codes (
  user_id uuid not null references app_users(id) on delete cascade,
  purpose email_code_purpose not null,
  -- Plain text: hashing a million possibilities protects nothing, and a code lives 15 minutes.
  code text not null check (code ~ '^[0-9]{6}$'),
  attempts smallint not null default 0 check (attempts between 0 and 5),
  sent_at timestamptz not null default now(),
  -- Codes sent since `day_started_at`: at most 10 a day, so 50 guesses a day and no email flood.
  sends smallint not null default 1 check (sends between 1 and 10),
  day_started_at timestamptz not null default now(),
  expires_at timestamptz not null,
  primary key (user_id, purpose)
);
