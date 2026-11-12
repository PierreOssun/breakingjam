-- One current membership per dancer and crew, so two racing adds can't both open one.
create unique index crew_memberships_one_current on crew_memberships (dancer_id, crew_id)
  where until is null;
