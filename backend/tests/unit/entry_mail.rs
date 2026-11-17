//! Unit tests of `crate::entry_mail`.

use chrono::{NaiveDate, NaiveTime};

use crate::{
    entry_mail::{BattleNews, Notice},
    mail::{Language, Message},
};

fn news() -> BattleNews {
    BattleNews {
        jam: "Winter Cypher".into(),
        battle: "2v2 Mixed".into(),
        link: "https://breakingjam.com/jams/winter-cypher".into(),
        day: NaiveDate::from_ymd_opt(2026, 12, 13).unwrap(),
        starts: NaiveTime::from_hms_opt(17, 30, 0),
        place: Some("Rote Fabrik, Zürich".into()),
    }
}

#[test]
fn dates_are_written_out_as_in_a_sentence() {
    for (language, when) in [
        (Language::En, "Sunday 13 December, starts 17:30"),
        (Language::Fr, "dimanche 13 décembre, début à 17:30"),
        (Language::De, "Sonntag, 13. Dezember, Beginn 17:30"),
    ] {
        let mail = Message::battle(Notice::Accepted { team: false }, language, "a@b.c", &news());
        assert!(
            mail.text.contains(&format!("{when}\nRote Fabrik, Zürich")),
            "{}",
            mail.text
        );
        assert!(
            mail.text
                .ends_with("https://breakingjam.com/jams/winter-cypher\n")
        );
    }
}

#[test]
fn a_team_is_told_to_write_to_the_organiser_not_to_withdraw() {
    let alone = Message::battle(
        Notice::Accepted { team: false },
        Language::En,
        "a@b.c",
        &news(),
    );
    let team = Message::battle(
        Notice::Accepted { team: true },
        Language::En,
        "a@b.c",
        &news(),
    );
    assert!(alone.text.contains("Withdraw on the jam page"));
    assert!(
        team.text
            .contains("Only the organiser can take your team out")
    );
    assert!(!team.text.contains("Withdraw"));
}

#[test]
fn a_battle_without_a_start_or_venue_says_the_day_alone() {
    let bare = BattleNews {
        starts: None,
        place: None,
        ..news()
    };
    let mail = Message::battle(
        Notice::Accepted { team: false },
        Language::De,
        "a@b.c",
        &bare,
    );
    assert!(
        mail.text
            .contains("dabei.\n\nSonntag, 13. Dezember\n\nDu kannst"),
        "{}",
        mail.text
    );
}
