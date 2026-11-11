-- The avatar rework: a dancer's chosen avatar becomes a spec, one named value per slot
-- (DESIGN.md §4.16), instead of the indexed code. Headgear is a slot of its own now, so a cap
-- or a beanie sits on a buzz cut (the backwards cap on long hair), in the hoodie's colour as
-- it was drawn; the old "bob" was drawn as blunt bangs.
alter table dancers add column avatar jsonb;

update dancers d set avatar = jsonb_build_object(
  'style',  (array['spiky','buzz','buzz','bun','afro','buzz','long','space','braids','puffs','pony','bangs','long'])[p.h + 1],
  'head',   (array['none','cap','beanie','none','none','none','none','none','none','none','none','none','cap'])[p.h + 1],
  'skin',   (array['light','tan','medium','deep'])[p.s + 1],
  'hair',   (array['black','brown','bleach','violet','blue'])[p.c + 1],
  'cloth',  (array['ink','blue','violet','white','red'])[p.o + 1],
  'accent', (array['black','blue','violet','white','red'])[p.o + 1],
  'extra',  (array['none','phones','chain'])[p.e + 1],
  'bg',     (array['klein','violet','ink','night'])[p.b + 1],
  'lashes', p.d & 1 <> 0, 'lips', p.d & 2 <> 0, 'hoops', p.d & 4 <> 0)
from (select id, m[1]::int h, m[2]::int s, m[3]::int c, m[4]::int o, m[5]::int e, m[6]::int b,
             coalesce(m[7], '0')::int d
      from dancers,
           regexp_match(avatar_parts, '^h(\d+)-s(\d+)-c(\d+)-o(\d+)-e(\d+)-b(\d+)(?:-d(\d+))?$') m
      -- No code, or one that doesn't parse: the dancer stays seeded from their id.
      where m is not null
     ) p
where d.id = p.id;

-- `avatar_parts` stays, unread, for this release: the build still running while this is
-- applied selects it, and a rollback finds its codes. A later migration drops it.
