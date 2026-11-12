-- M29: battle results by round. A match is one battle of a bracket between two entries.

create type match_round as enum ('top64', 'top32', 'top16', 'top8', 'top4', 'third', 'final');

create table battle_matches (
  id uuid primary key,
  battle_id uuid not null references battles(id) on delete cascade,
  round match_round not null,
  position smallint not null check (position >= 0),   -- order within its round
  winner_id uuid not null references entries(id) on delete cascade,
  loser_id uuid not null references entries(id) on delete cascade,
  video_url text,
  video_offset_seconds int check (video_offset_seconds >= 0),
  created_at timestamptz not null default now(),
  constraint battle_matches_two_sides check (winner_id <> loser_id),
  constraint battle_matches_offset_needs_video
    check (video_offset_seconds is null or video_url is not null),
  unique (battle_id, round, position)
);
create index on battle_matches (winner_id);
create index on battle_matches (loser_id);

-- Today's results: the one 1st and the one 2nd of a battle played its final, with the winner's
-- video (their last battle). Earlier rounds stay as placings, shown grouped by round.
insert into battle_matches (id, battle_id, round, position, winner_id, loser_id,
                            video_url, video_offset_seconds)
select gen_random_uuid(), w.battle_id, 'final', 0, w.id, l.id,
       w.video_url, w.video_offset_seconds
from entries w
join entries l on l.battle_id = w.battle_id
where w.reached = 'winner' and l.reached = 'top2'
  and w.status <> 'withdrawn' and l.status <> 'withdrawn'
  and (select count(*) from entries x
       where x.battle_id = w.battle_id and x.reached in ('winner', 'top2')
         and x.status <> 'withdrawn') = 2;
