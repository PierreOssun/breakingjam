-- M19: a flyer uploaded by the organiser replaces the generated one wherever a flyer shows.
alter table events
  add column flyer_url text,       -- 1080×1350 JPEG on R2; null = the generated flyer
  add column flyer_card_url text,  -- 540×675, for cards, lists and the map
  add constraint events_flyer_together check ((flyer_url is null) = (flyer_card_url is null));
