//! The emails about entering battles (M32): to the organiser when a dancer enters or asks, to the
//! dancer when their request goes out and when it is answered. Plain text, in the reader's language.

use chrono::{Datelike, NaiveDate, NaiveTime};

use crate::mail::{Language, Message};

/// What happened, and to whom it is told.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Notice<'a> {
    /// To the organiser: `who` entered an open battle.
    Entered { who: &'a str },
    /// To the organiser: `who` (a dancer, or a team's name) asked to enter.
    Asked { who: &'a str },
    /// To the dancer: their request went out.
    RequestSent,
    /// To the dancer: they are in, alone or as a team's captain (a team leaves through the
    /// organiser, so the email can't tell them to withdraw).
    Accepted { team: bool },
    /// To the dancer: the organiser said no.
    Declined,
}

/// The battle an email is about, and where its jam page is.
#[derive(Debug, Clone)]
pub struct BattleNews {
    /// The jam's name.
    pub jam: String,
    /// The battle's name.
    pub battle: String,
    /// The jam page, absolute.
    pub link: String,
    /// The battle's day, else the jam's first.
    pub day: NaiveDate,
    /// When the battle starts, if announced.
    pub starts: Option<NaiveTime>,
    /// Venue and city, as far as known.
    pub place: Option<String>,
}

impl Message {
    /// The email telling `notice` about `news`, in `language`.
    pub fn battle(notice: Notice<'_>, language: Language, to: &str, news: &BattleNews) -> Self {
        let (subject, body) = match language {
            Language::En => english(notice, news),
            Language::Fr => french(notice, news),
            Language::De => german(notice, news),
        };
        Self {
            to: to.to_owned(),
            subject,
            text: format!("{body}\n\n{}\n", news.link),
        }
    }
}

/// "Sunday 13 December, starts 16:00", then the venue on its own line: when and where, for an
/// accepted dancer, written out as in a sentence.
fn when_and_where(news: &BattleNews, language: Language) -> String {
    let day = news.day;
    let weekday = day.weekday().num_days_from_monday() as usize;
    let month = day.month0() as usize;
    let mut line = match language {
        Language::En => format!("{} {} {}", EN_DAYS[weekday], day.day(), EN_MONTHS[month]),
        Language::Fr => format!("{} {} {}", FR_DAYS[weekday], day.day(), FR_MONTHS[month]),
        Language::De => format!("{}, {}. {}", DE_DAYS[weekday], day.day(), DE_MONTHS[month]),
    };
    if let Some(time) = news.starts {
        let starts = match language {
            Language::En => "starts",
            Language::Fr => "début à",
            Language::De => "Beginn",
        };
        line.push_str(&format!(", {starts} {}", time.format("%H:%M")));
    }
    if let Some(place) = &news.place {
        line.push_str(&format!("\n{place}"));
    }
    line
}

const EN_DAYS: [&str; 7] = [
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday",
];
const FR_DAYS: [&str; 7] = [
    "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche",
];
const DE_DAYS: [&str; 7] = [
    "Montag",
    "Dienstag",
    "Mittwoch",
    "Donnerstag",
    "Freitag",
    "Samstag",
    "Sonntag",
];
const EN_MONTHS: [&str; 12] = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
];
const FR_MONTHS: [&str; 12] = [
    "janvier",
    "février",
    "mars",
    "avril",
    "mai",
    "juin",
    "juillet",
    "août",
    "septembre",
    "octobre",
    "novembre",
    "décembre",
];
const DE_MONTHS: [&str; 12] = [
    "Januar",
    "Februar",
    "März",
    "April",
    "Mai",
    "Juni",
    "Juli",
    "August",
    "September",
    "Oktober",
    "November",
    "Dezember",
];

fn english(notice: Notice<'_>, news: &BattleNews) -> (String, String) {
    let (battle, jam) = (&news.battle, &news.jam);
    match notice {
        Notice::Entered { who } => (
            format!("{who} entered {battle} at {jam}"),
            format!(
                "{who} entered {battle} at {jam}: verified dancers enter open battles directly. See who's in on the jam page:"
            ),
        ),
        Notice::Asked { who } => (
            format!("{who} asked to enter {battle} at {jam}"),
            format!(
                "{who} asked to enter {battle} at {jam}. Accept or decline the request on the jam page:"
            ),
        ),
        Notice::RequestSent => (
            format!("Request sent: {battle} at {jam}"),
            format!(
                "Your request to enter {battle} at {jam} went to the organiser. You get an email when they answer. You can cancel it on the jam page:"
            ),
        ),
        Notice::Accepted { team } => (
            format!("You're in: {battle} at {jam}"),
            format!(
                "The organiser accepted your request: you're in {battle} at {jam}.\n\n{}\n\n{}",
                when_and_where(news, Language::En),
                if team {
                    "Can't make it? Only the organiser can take your team out: write to them from the jam page:"
                } else {
                    "Can't make it? Withdraw on the jam page while registration is open:"
                }
            ),
        ),
        Notice::Declined => (
            format!("Your request for {battle} at {jam}"),
            format!(
                "The organiser declined your request to enter {battle} at {jam}. To ask why, contact them from the jam page:"
            ),
        ),
    }
}

fn french(notice: Notice<'_>, news: &BattleNews) -> (String, String) {
    let (battle, jam) = (&news.battle, &news.jam);
    match notice {
        Notice::Entered { who } => (
            format!("{who} participe à {battle} ({jam})"),
            format!(
                "{who} participe à {battle} ({jam}) : les danseurs vérifiés s'inscrivent directement aux battles ouverts. Vois qui participe sur la page du jam :"
            ),
        ),
        Notice::Asked { who } => (
            format!("{who} demande à participer à {battle} ({jam})"),
            format!(
                "{who} demande à participer à {battle} ({jam}). Accepte ou refuse la demande sur la page du jam :"
            ),
        ),
        Notice::RequestSent => (
            format!("Demande envoyée : {battle} ({jam})"),
            format!(
                "Ta demande pour participer à {battle} ({jam}) est partie chez l'organisateur. Tu recevras un e-mail avec sa réponse. Tu peux l'annuler sur la page du jam :"
            ),
        ),
        Notice::Accepted { team } => (
            format!("Tu participes : {battle} ({jam})"),
            format!(
                "L'organisateur a accepté ta demande : tu participes à {battle} ({jam}).\n\n{}\n\n{}",
                when_and_where(news, Language::Fr),
                if team {
                    "Tu ne peux plus venir ? Seul l'organisateur peut retirer ton équipe : écris-lui depuis la page du jam :"
                } else {
                    "Tu ne peux plus venir ? Retire-toi sur la page du jam tant que les inscriptions sont ouvertes :"
                }
            ),
        ),
        Notice::Declined => (
            format!("Ta demande pour {battle} ({jam})"),
            format!(
                "L'organisateur a refusé ta demande pour participer à {battle} ({jam}). Pour savoir pourquoi, contacte-le depuis la page du jam :"
            ),
        ),
    }
}

fn german(notice: Notice<'_>, news: &BattleNews) -> (String, String) {
    let (battle, jam) = (&news.battle, &news.jam);
    match notice {
        Notice::Entered { who } => (
            format!("{who} ist bei {battle} dabei ({jam})"),
            format!(
                "{who} hat sich bei {battle} ({jam}) angemeldet: Verifizierte Tänzer:innen melden sich bei offenen Battles direkt an. Wer dabei ist, siehst du auf der Jam-Seite:"
            ),
        ),
        Notice::Asked { who } => (
            format!("{who} fragt für {battle} an ({jam})"),
            format!(
                "{who} möchte bei {battle} ({jam}) teilnehmen. Nimm die Anfrage auf der Jam-Seite an oder lehne sie ab:"
            ),
        ),
        Notice::RequestSent => (
            format!("Anfrage gesendet: {battle} ({jam})"),
            format!(
                "Deine Anfrage für {battle} ({jam}) ist bei der Veranstalter:in. Du bekommst eine E-Mail, sobald sie antwortet. Zurückziehen kannst du sie auf der Jam-Seite:"
            ),
        ),
        Notice::Accepted { team } => (
            format!("Du bist dabei: {battle} ({jam})"),
            format!(
                "Die Veranstalter:in hat deine Anfrage angenommen: Du bist bei {battle} ({jam}) dabei.\n\n{}\n\n{}",
                when_and_where(news, Language::De),
                if team {
                    "Du kannst doch nicht? Nur die Veranstalter:in kann dein Team zurückziehen: Schreib ihr über die Jam-Seite:"
                } else {
                    "Du kannst doch nicht? Zieh dich auf der Jam-Seite zurück, solange die Anmeldung offen ist:"
                }
            ),
        ),
        Notice::Declined => (
            format!("Deine Anfrage für {battle} ({jam})"),
            format!(
                "Die Veranstalter:in hat deine Anfrage für {battle} ({jam}) abgelehnt. Wenn du wissen willst, warum, schreib ihr über die Jam-Seite:"
            ),
        ),
    }
}
