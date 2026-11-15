//! Unit tests of `crate::dataset::upcoming`.

use std::path::Path;

use utoipa::{
    PartialSchema,
    openapi::{RefOr, schema::Schema},
};

use crate::{
    dataset::upcoming::load,
    domain::{battle::BattleFields, event::EventFields},
};

fn repository_file() -> String {
    std::fs::read_to_string(Path::new(env!("CARGO_MANIFEST_DIR")).join("../data/upcoming.toml"))
        .unwrap()
}

/// The field names the API documents for `T`.
fn fields_of<T: PartialSchema>() -> Vec<String> {
    match T::schema() {
        RefOr::T(Schema::Object(object)) => object.properties.keys().cloned().collect(),
        _ => panic!("not an object schema"),
    }
}

#[test]
fn every_jam_of_the_repository_file_passes_the_api_rules() {
    let jams = load(&Path::new(env!("CARGO_MANIFEST_DIR")).join("../data")).unwrap();
    assert!(!jams.is_empty());
    let refused: Vec<String> = jams.iter().filter_map(|jam| jam.check().err()).collect();
    assert!(refused.is_empty(), "{refused:#?}");
}

/// Serde ignores a misspelt key next to a flattened struct, so `instagram = …` would vanish.
#[test]
fn the_repository_file_uses_only_the_apis_field_names() {
    let file: toml::Table = repository_file().parse().unwrap();
    let jam_fields = fields_of::<EventFields>();
    let battle_fields = fields_of::<BattleFields>();
    let mut unknown = Vec::new();
    for jam in file["jams"].as_array().unwrap() {
        let jam = jam.as_table().unwrap();
        let name = jam["name"].as_str().unwrap_or("?");
        let own = ["key", "sources", "battles"];
        for key in jam.keys() {
            if !own.contains(&key.as_str()) && !jam_fields.contains(key) {
                unknown.push(format!("{name}: {key}"));
            }
        }
        for battle in jam["battles"].as_array().unwrap() {
            for key in battle.as_table().unwrap().keys() {
                if !battle_fields.contains(key) {
                    unknown.push(format!("{name}: battle {key}"));
                }
            }
        }
    }
    assert!(unknown.is_empty(), "{unknown:#?}");
}
