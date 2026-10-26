# Places

`cities15000.tsv`: every city of 15,000 people or more, from [GeoNames](https://www.geonames.org/) (`cities15000.zip`, downloaded 2026-10-26), licensed [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). It lets `/search` answer a city with the closest jams ("Near <Place>"), even where no jam is registered.

The file keeps eight of GeoNames' columns, tab separated, in this order: id, name, ASCII name, alternate names (comma separated), country code, latitude, longitude, population.

Load it into a database (it replaces every place in one transaction):

```sh
just places                                   # the local database
cargo run --bin data -- places [FILE]         # from backend/, the database at DATABASE_URL
```

UAT and production load it with the **Import places** workflow (Actions → Import places → Run workflow, from `uat` or `prod`).

To refresh it:

```sh
curl -O https://download.geonames.org/export/dump/cities15000.zip && unzip cities15000.zip
awk -F'\t' 'BEGIN{OFS="\t"} {print $1,$2,$3,$4,$9,$5,$6,$15}' cities15000.txt > data/places/cities15000.tsv
```

Nothing downloads at runtime: the app only reads the `places` and `place_names` tables.
