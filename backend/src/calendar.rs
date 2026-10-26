//! A jam as an iCalendar file (RFC 5545), for "Add to calendar".

use chrono::{DateTime, Days, Utc};

use crate::domain::event::Event;

/// The jam as a one-event calendar: all day from its first to its last day, at its venue,
/// linking to its page. All-day, because a jam has days but no times of its own.
pub fn ics(event: &Event, page_url: &str, now: DateTime<Utc>) -> String {
    // DTEND is exclusive: the day after the last one.
    let end = event
        .ends_on
        .checked_add_days(Days::new(1))
        .unwrap_or(event.ends_on);
    let place = [
        event.venue_name.as_deref(),
        event.address.as_deref(),
        Some(event.city.as_str()),
        Some(event.country.as_str()),
    ];
    let location = place.into_iter().flatten().collect::<Vec<_>>().join(", ");
    [
        "BEGIN:VCALENDAR".to_owned(),
        "VERSION:2.0".to_owned(),
        "PRODID:-//BreakingJam//Jams//EN".to_owned(),
        "CALSCALE:GREGORIAN".to_owned(),
        "METHOD:PUBLISH".to_owned(),
        "BEGIN:VEVENT".to_owned(),
        format!("UID:{}@breakingjam.com", event.id),
        format!("DTSTAMP:{}", now.format("%Y%m%dT%H%M%SZ")),
        format!("DTSTART;VALUE=DATE:{}", event.starts_on.format("%Y%m%d")),
        format!("DTEND;VALUE=DATE:{}", end.format("%Y%m%d")),
        format!("SUMMARY:{}", text(&event.name)),
        format!("LOCATION:{}", text(&location)),
        format!("URL:{page_url}"),
        format!("DESCRIPTION:{}", text(page_url)),
        "END:VEVENT".to_owned(),
        "END:VCALENDAR".to_owned(),
    ]
    .iter()
    .map(|line| fold(line))
    .collect()
}

/// A TEXT value (§3.3.11): backslash, `;`, `,` and line breaks escaped, any other control
/// character dropped, as a bare CR would otherwise start a property of its own in some clients.
pub(crate) fn text(value: &str) -> String {
    let mut escaped = String::with_capacity(value.len());
    let mut chars = value.chars().peekable();
    while let Some(c) = chars.next() {
        match c {
            '\\' => escaped.push_str("\\\\"),
            ';' => escaped.push_str("\\;"),
            ',' => escaped.push_str("\\,"),
            '\n' => escaped.push_str("\\n"),
            '\r' => {
                // CRLF is one break.
                chars.next_if_eq(&'\n');
                escaped.push_str("\\n");
            }
            '\t' => escaped.push(' '),
            c if c.is_control() => {}
            c => escaped.push(c),
        }
    }
    escaped
}

/// One content line ending in CRLF, folded after 75 octets (§3.1) but never inside a character.
pub(crate) fn fold(line: &str) -> String {
    let mut folded = String::with_capacity(line.len() + 2);
    let mut octets = 0;
    for c in line.chars() {
        if octets + c.len_utf8() > 75 {
            folded.push_str("\r\n ");
            octets = 1;
        }
        folded.push(c);
        octets += c.len_utf8();
    }
    folded.push_str("\r\n");
    folded
}
