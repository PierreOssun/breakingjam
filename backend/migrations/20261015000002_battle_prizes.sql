-- Cash prizes per place, in one ISO 4217 currency (e.g. EUR, CHF, CNY), in whole units.
alter table battles
  add column prize_currency char(3)
    check (prize_currency ~ '^[A-Z]{3}$'),
  add column prize_first integer check (prize_first >= 0),
  add column prize_second integer check (prize_second >= 0),
  add column prize_third integer check (prize_third >= 0);
