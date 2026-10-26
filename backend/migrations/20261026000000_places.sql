-- M22: the world's cities of 15,000+ people, from GeoNames (cities15000, CC BY 4.0), for
-- "Near <Place>" on /search. Filled by `cargo run --bin data -- places`, never at runtime.
create table places (
  id uuid primary key,
  geonames_id integer not null unique,
  name text not null,            -- as GeoNames writes it, e.g. "Zürich"
  ascii_name text not null,
  country char(2) not null,      -- ISO 3166-1 alpha-2
  lat double precision not null,
  lng double precision not null,
  population integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger set_updated_at before update on places for each row execute function set_updated_at();

-- Every name a place answers to (its name, ASCII name and alternates), folded: lower case, no
-- accents, words split by single spaces. The "C" collation lets the key's index serve both the
-- exact and the prefix (`like 'mul%'`) lookup.
create table place_names (
  place_id uuid not null references places(id) on delete cascade,
  name text collate "C" not null,
  primary key (name, place_id)
);
