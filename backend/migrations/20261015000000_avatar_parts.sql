-- M12b: the generated pixel avatar's parts (DESIGN.md §4.16), chosen in the edit sheet,
-- e.g. 'h2-s1-c0-o3-e0-b1' (hair, skin, hair colour, hoodie, extra, backdrop).
-- Null: the parts are seeded from the dancer id.
alter table dancers add column avatar_parts text;
