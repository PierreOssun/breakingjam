-- M32 step 2: how dancers enter a battle. `organizer` (the default, today's behaviour): the
-- organiser adds them; `approval`: they ask and the organiser decides (step 3); `open`: a
-- verified dancer enters a solo battle directly.
create type battle_registration as enum ('organizer', 'approval', 'open');
alter table battles add column registration battle_registration not null default 'organizer';
