//! Generated jam flyer (DESIGN.md §4.24): a 4:5 SVG and a 1200×630 Open Graph image.

// Ported from `frontend/generated-flyer-reference.py`; the tests check byte-for-byte parity
// with it. Deliberate differences: font stacks lead with the Fontsource names the frontend
// registers, quotes are escaped too (the SVG is inlined into pages), the root carries
// `xmlns`, a missing start time is left out instead of printed empty, and two corrections
// from DESIGN.md §4.24: the name block gets 126 units of room (the reference uses 138), and
// the accessible label is localised while compact flyers are always `aria-hidden`.

use std::{
    fmt::Write,
    sync::{Arc, LazyLock},
};

use chrono::Datelike;
use resvg::{tiny_skia, usvg};
use serde::Deserialize;
use sha1::{Digest, Sha1};
use utoipa::ToSchema;

use crate::domain::event::Event;

const HANDSTAND: [&str; 20] = [
    "..XX..........XX....",
    "..XXX........XXX....",
    "...XXX......XXX.....",
    "....XXX....XXX......",
    ".....XXX..XXX.......",
    "......XXXXXX........",
    ".......XXXX.........",
    ".......XXXX.........",
    ".......XXXX.........",
    ".......XXXX.........",
    ".......XXXX.........",
    "......XXXXXX........",
    ".....XXXXXXXX.......",
    "....XXX.XX.XXX......",
    "....XX.XXXX.XX......",
    "...XX..XXXX..XX.....",
    "...XX..XXXX..XX.....",
    "..XX....XX....XX....",
    "..XX..........XX....",
    ".XXX..........XXX...",
];

const TOPROCK: [&str; 22] = [
    "........XX..........",
    ".......XXX..........",
    ".......XX...........",
    "......XX....XXX.....",
    "......XX...XXXXX....",
    ".......XX..XXXXX....",
    ".......XX..XXXXX....",
    "........XX..XXX.....",
    ".........XXXXXX.....",
    "........XXXXXXXXXX..",
    "........XXXXXXX..XX.",
    "........XXXXXXX...XX",
    ".........XXXXX...XX.",
    ".........XXXXX..XX..",
    ".........XXXXX......",
    "........XXXXXXX.....",
    ".......XXX...XXX....",
    "......XXX.....XXX...",
    ".....XXX.......XX...",
    "....XXX........XX...",
    "...XXX.........XXX..",
    "..XXXX.........XXXX.",
];

const DISPLAY: &str = "'Unbounded Variable', Unbounded, 'Arial Black', sans-serif";
const BODY: &str = "'Manrope Variable', Manrope, 'Helvetica Neue', Arial, sans-serif";

/// Background family of a flyer, picked from the jam id.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Palette {
    Klein,
    Violet,
    Ink,
}

/// The pixel dancer on a flyer, picked from the jam id.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Pose {
    Handstand,
    Toprock,
}

struct Colors {
    bg: &'static str,
    ring: &'static str,
    text: &'static str,
    sub: &'static str,
    body: &'static str,
    rim: &'static str,
    shadow: &'static str,
    floor: &'static str,
}

impl Palette {
    fn colors(self) -> Colors {
        match self {
            Self::Klein => Colors {
                bg: "#002FA7",
                ring: "#1440BE",
                text: "#FFFFFF",
                sub: "#C7D4FF",
                body: "#0B0D14",
                rim: "#8FAAFF",
                shadow: "#001C6B",
                floor: "#5F80E6",
            },
            Self::Violet => Colors {
                bg: "#6D3AF5",
                ring: "#7C4FFF",
                text: "#FFFFFF",
                sub: "#E6DDFF",
                body: "#0B0D14",
                rim: "#D6C7FF",
                shadow: "#4818C6",
                floor: "#A88CFF",
            },
            Self::Ink => Colors {
                bg: "#0B0D14",
                ring: "#182038",
                text: "#F3F5FA",
                sub: "#8FAAFF",
                body: "#2F5BFF",
                rim: "#B9CAFF",
                shadow: "#111833",
                floor: "#2A3A72",
            },
        }
    }
}

impl Pose {
    fn rows(self) -> &'static [&'static str] {
        match self {
            Self::Handstand => &HANDSTAND,
            Self::Toprock => &TOPROCK,
        }
    }
}

/// Language of the printed weekday, month and "cancelled" band.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Deserialize, ToSchema)]
#[serde(rename_all = "lowercase")]
pub enum Lang {
    #[default]
    En,
    Fr,
    De,
}

impl Lang {
    fn weekday(self, index: usize) -> &'static str {
        let names = match self {
            Self::En => ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
            Self::Fr => ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"],
            Self::De => ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"],
        };
        names[index]
    }

    fn month(self, index: usize) -> &'static str {
        let names = match self {
            Self::En => [
                "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
            ],
            Self::Fr => [
                "Janv", "Févr", "Mars", "Avr", "Mai", "Juin", "Juil", "Août", "Sept", "Oct", "Nov",
                "Déc",
            ],
            Self::De => [
                "Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez",
            ],
        };
        names[index]
    }

    /// Start of the flyer's accessible name: "Generated flyer: <name>, <date>, <city>".
    pub fn flyer_label(self) -> &'static str {
        match self {
            Self::En => "Generated flyer:",
            Self::Fr => "Flyer généré :",
            Self::De => "Generierter Flyer:",
        }
    }

    /// Text of the band across a cancelled jam's flyer.
    pub fn cancelled(self) -> &'static str {
        match self {
            Self::En => "CANCELLED",
            Self::Fr => "ANNULÉ",
            Self::De => "ABGESAGT",
        }
    }
}

/// Everything printed on a flyer; `for_event` builds it from a stored jam.
#[derive(Debug, Clone, PartialEq)]
pub struct FlyerText {
    pub name: String,
    /// Weekday of the first day, e.g. `Sat`.
    pub dow: String,
    /// Day of the month, two digits.
    pub day: String,
    /// Month, e.g. `Nov`.
    pub mon: String,
    /// Start time; v0.1 jams have dates only, so it is `None` for now.
    pub time: Option<String>,
    pub city: String,
    /// ISO 3166-1 alpha-2.
    pub cc: String,
    /// Battle names, in display order.
    pub cats: Vec<String>,
}

// Category line budgets, in characters (uppercase Manrope 700 at 12px / 20px, plus tracking).
const FLYER_CATS_CHARS: usize = 36;
const OG_CATS_CHARS: usize = 46;

/// How a name block is laid out: its width, the sizes to try and how many lines may be used.
#[derive(Debug, Clone, Copy)]
pub(crate) struct NameFit {
    width: f64,
    sizes: &'static [u32],
    /// Line limit below 30px; larger sizes always stop at 3.
    max_lines: usize,
    /// Height from the top of the first line to the last baseline, when bounded.
    room: Option<f64>,
}

/// DESIGN.md §4.24: the name block stays below the floor, at most 126 units from the first
/// cap height to the last baseline. (The reference passes 420 - 270 - 12 = 138.)
pub(crate) const FLYER_NAME: NameFit = NameFit {
    width: 344.0,
    sizes: &[46, 40, 34, 28, 24],
    max_lines: 4,
    room: Some(126.0),
};
/// The Open Graph image's name block: wider, larger sizes, at most three lines.
pub(crate) const OG_NAME: NameFit = NameFit {
    width: 660.0,
    sizes: &[84, 72, 60, 50],
    max_lines: 3,
    room: None,
};

impl FlyerText {
    /// The flyer text of a jam: first day, place and battle names in `lang`.
    pub fn for_event(event: &Event, battle_names: Vec<String>, lang: Lang) -> Self {
        let first = event.starts_on;
        Self {
            name: event.name.clone(),
            dow: lang
                .weekday(first.weekday().num_days_from_monday() as usize)
                .to_owned(),
            day: format!("{:02}", first.day()),
            mon: lang.month(first.month0() as usize).to_owned(),
            time: None,
            city: event.city.clone(),
            cc: event.country.clone(),
            cats: battle_names,
        }
    }

    fn with_cats_fitted(&self, max_chars: usize) -> Self {
        Self {
            cats: fit_categories(&self.cats, max_chars),
            ..self.clone()
        }
    }
}

/// Options of the 4:5 flyer.
#[derive(Debug, Clone, Copy)]
pub struct FlyerOptions<'a> {
    /// Date and art only, for renders 120px wide or less; always `aria-hidden`.
    pub compact: bool,
    /// Start of the accessible name, e.g. `Generated flyer:`; unused when compact (DESIGN.md §4.24).
    pub label: &'a str,
    /// Band text when the jam is cancelled.
    pub cancelled: Option<&'a str>,
    /// Prefix of the gradient ids, unique per flyer on a page.
    pub uid: &'a str,
}

/// Palette and pose seeded from the jam id: `sha1(id)` as an integer, `% 3` and `/ 3 % 2`.
pub fn seed(jam_id: &str) -> (Palette, Pose) {
    // Only the value modulo 6 matters: h % 3 == (h % 6) % 3 and (h / 3) % 2 == (h % 6) / 3.
    let rest = Sha1::digest(jam_id.as_bytes())
        .iter()
        .fold(0u32, |rest, byte| (rest * 256 + u32::from(*byte)) % 6);
    let palette = [Palette::Klein, Palette::Violet, Palette::Ink][(rest % 3) as usize];
    let pose = [Pose::Handstand, Pose::Toprock][(rest / 3) as usize];
    (palette, pose)
}

/// Breaks a name into lines that fit (character-width estimate), trying the sizes in order;
/// when none fits, the most lines that fit the room are kept and the last one gets "…".
pub(crate) fn fit_name(name: &str, fit: NameFit) -> (u32, Vec<String>) {
    let NameFit {
        width,
        sizes,
        max_lines,
        room,
    } = fit;
    let words: Vec<&str> = name.split_whitespace().collect();
    let len = |s: &str| s.chars().count() as f64;
    let mut best = (sizes[0], Vec::new());
    for &fs in sizes {
        let cw = f64::from(fs) * 0.8;
        let mut lines: Vec<String> = Vec::new();
        let mut cur = String::new();
        let mut ok = true;
        for word in &words {
            let candidate = if cur.is_empty() {
                (*word).to_owned()
            } else {
                format!("{cur} {word}")
            };
            if len(&candidate) * cw <= width {
                cur = candidate;
            } else {
                if !cur.is_empty() {
                    lines.push(std::mem::take(&mut cur));
                }
                cur = (*word).to_owned();
                if len(word) * cw > width {
                    ok = false;
                }
            }
        }
        if !cur.is_empty() {
            lines.push(cur);
        }
        // Avoid a lonely short last word: pull the previous word down when it fits.
        let n = lines.len();
        if n >= 2 && len(&lines[n - 1]) <= 3.0 && lines[n - 2].contains(' ') {
            let (a, b) = lines[n - 2]
                .rsplit_once(' ')
                .map(|(a, b)| (a.to_owned(), b.to_owned()))
                .unwrap_or_default();
            let joined = format!("{b} {}", lines[n - 1]);
            if len(&joined) * cw <= width {
                lines[n - 2] = a;
                lines[n - 1] = joined;
            }
        }
        let limit = if fs <= 30 { max_lines } else { 3 };
        let fits_room = room.is_none_or(|room| {
            (lines.len() as f64 - 1.0) * f64::from(fs) * 1.08 + f64::from(fs) * 0.8 <= room
        });
        let fits = ok && lines.len() <= limit && fits_room;
        best = (fs, lines);
        if fits {
            return best;
        }
    }
    let (fs, lines) = best;
    let mut n = 1;
    if let Some(room) = room {
        while n < lines.len() && n as f64 * f64::from(fs) * 1.08 + f64::from(fs) * 0.8 <= room {
            n += 1;
        }
    }
    let mut out: Vec<String> = lines.iter().take(n).cloned().collect();
    if lines.len() > n
        && let Some(last) = out.last_mut()
    {
        *last = format!("{}…", last.trim_end_matches(['.', ',']));
    }
    (fs, out)
}

/// Keeps as many category names as fit in `max_chars` (joined with " · "), then "+N".
pub fn fit_categories(names: &[String], max_chars: usize) -> Vec<String> {
    let mut unique: Vec<&String> = Vec::new();
    for name in names {
        if !unique.contains(&name) {
            unique.push(name);
        }
    }
    let joined_len = |items: &[String]| {
        items.iter().map(|s| s.chars().count()).sum::<usize>() + 3 * items.len().saturating_sub(1)
    };
    let mut kept: Vec<String> = Vec::new();
    for (index, name) in unique.iter().enumerate() {
        let left = unique.len() - index - 1;
        let mut candidate = kept.clone();
        candidate.push((*name).clone());
        if left > 0 {
            candidate.push(format!("+{left}"));
        }
        if joined_len(&candidate) > max_chars {
            break;
        }
        kept.push((*name).clone());
    }
    if kept.is_empty()
        && let Some(first) = unique.first()
    {
        // A single name longer than the line: cut it rather than drop every category.
        let cut: String = first.chars().take(max_chars.saturating_sub(1)).collect();
        kept.push(format!("{cut}…"));
    }
    let hidden = unique.len() - kept.len();
    if hidden > 0 {
        kept.push(format!("+{hidden}"));
    }
    kept
}

fn esc(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&#39;")
}

fn pixel_rings(
    center: (f64, f64),
    radii: &[f64],
    cell: u32,
    size: (u32, u32),
    color: &str,
) -> String {
    let mut out = String::new();
    let half = f64::from(cell) / 2.0;
    for gy in (0..size.1).step_by(cell as usize) {
        for gx in (0..size.0).step_by(cell as usize) {
            let dx = f64::from(gx) + half - center.0;
            let dy = f64::from(gy) + half - center.1;
            let d = (dx * dx + dy * dy).sqrt();
            if radii.iter().any(|r| (d - r).abs() < half) {
                let _ = write!(
                    out,
                    r#"<rect x="{gx}" y="{gy}" width="{cell}" height="{cell}" fill="{color}"></rect>"#
                );
            }
        }
    }
    out
}

fn sprite(pose: Pose, origin: (u32, u32), cell: u32, colors: &Colors) -> String {
    let (x0, y0) = origin;
    let rows = pose.rows();
    let mut out = String::new();
    // Shadow: the same shape one cell down and right.
    for (y, row) in rows.iter().enumerate() {
        for (x, ch) in row.chars().enumerate() {
            if ch == 'X' {
                let _ = write!(
                    out,
                    r#"<rect x="{}" y="{}" width="{cell}" height="{cell}" fill="{}"></rect>"#,
                    x0 + (x as u32 + 1) * cell,
                    y0 + (y as u32 + 1) * cell,
                    colors.shadow
                );
            }
        }
    }
    let rim = (cell / 3).max(2);
    for (y, row) in rows.iter().enumerate() {
        let cells: Vec<char> = row.chars().collect();
        let mut x = 0;
        while x < cells.len() {
            if cells[x] != 'X' {
                x += 1;
                continue;
            }
            let mut x1 = x;
            while x1 + 1 < cells.len() && cells[x1 + 1] == 'X' {
                x1 += 1;
            }
            let (left, right, top) = (x as u32, x1 as u32, y as u32);
            let _ = write!(
                out,
                r#"<rect x="{}" y="{}" width="{}" height="{cell}" fill="{}"></rect>"#,
                x0 + left * cell,
                y0 + top * cell,
                (right - left + 1) * cell,
                colors.body
            );
            // Rim light on the right edge of each run.
            let _ = write!(
                out,
                r#"<rect x="{}" y="{}" width="{rim}" height="{cell}" fill="{}"></rect>"#,
                x0 + right * cell + cell - rim,
                y0 + top * cell,
                colors.rim
            );
            x = x1 + 1;
        }
    }
    out
}

/// The 4:5 flyer (400×500 viewBox), filling its container.
pub fn flyer_svg(text: &FlyerText, look: (Palette, Pose), options: FlyerOptions) -> String {
    let (palette, pose) = look;
    let p = palette.colors();
    let uid = options.uid;
    let (w, h) = (400, 500);
    let floor_y = 270;
    let mut s = String::new();
    let _ = write!(
        s,
        r#"<rect width="{w}" height="{h}" fill="{}"></rect>"#,
        p.bg
    );
    s += &pixel_rings(
        (300.0, 170.0),
        &[56.0, 96.0, 136.0, 176.0, 216.0, 256.0],
        8,
        (w, h),
        p.ring,
    );
    for gx in (0..w).step_by(16) {
        let _ = write!(
            s,
            r#"<rect x="{gx}" y="{floor_y}" width="8" height="4" fill="{}"></rect>"#,
            p.floor
        );
    }
    s += &sprite(pose, (196, floor_y - pose.rows().len() as u32 * 8), 8, &p);
    // HD layer: glow from the top left and a bottom vignette.
    let _ = write!(
        s,
        concat!(
            r##"<defs><radialGradient id="{uid}g" cx="0.25" cy="0.2" r="0.8"><stop offset="0" stop-color="#FFFFFF" stop-opacity=".16"></stop><stop offset="1" stop-color="#FFFFFF" stop-opacity="0"></stop></radialGradient>"##,
            r##"<linearGradient id="{uid}v" x1="0" y1="0" x2="0" y2="1"><stop offset=".55" stop-color="#000000" stop-opacity="0"></stop><stop offset="1" stop-color="#000000" stop-opacity=".45"></stop></linearGradient></defs>"##,
            r#"<rect width="{w}" height="{h}" fill="url(#{uid}g)"></rect><rect width="{w}" height="{h}" fill="url(#{uid}v)"></rect>"#
        ),
        uid = uid,
        w = w,
        h = h
    );
    let _ = write!(
        s,
        r#"<text x="28" y="54" font-family="{BODY}" font-weight="800" font-size="16" letter-spacing="2" fill="{}">{}</text>"#,
        p.sub,
        esc(&text.dow.to_uppercase())
    );
    let _ = write!(
        s,
        r#"<text x="24" y="124" font-family="{DISPLAY}" font-weight="800" font-size="72" letter-spacing="-2" fill="{}">{}</text>"#,
        p.text,
        esc(&text.day)
    );
    let _ = write!(
        s,
        r#"<text x="28" y="160" font-family="{DISPLAY}" font-weight="800" font-size="28" fill="{}">{}</text>"#,
        p.text,
        esc(&text.mon.to_uppercase())
    );
    if !options.compact {
        let text = text.with_cats_fitted(FLYER_CATS_CHARS);
        if let Some(time) = &text.time {
            let _ = write!(
                s,
                r#"<text x="28" y="188" font-family="{BODY}" font-weight="700" font-size="15" fill="{}">{}</text>"#,
                p.sub,
                esc(time)
            );
        }
        let _ = write!(
            s,
            r#"<text x="372" y="46" text-anchor="end" font-family="{BODY}" font-weight="800" font-size="11" letter-spacing="2" fill="{}" opacity=".9">BREAKINGJAM</text>"#,
            p.sub
        );
        let (fs, lines) = fit_name(&text.name, FLYER_NAME);
        let lh = f64::from(fs) * 1.08;
        let y_first = 420.0 - (lines.len() as f64 - 1.0) * lh;
        for (i, line) in lines.iter().enumerate() {
            let _ = write!(
                s,
                r#"<text x="26" y="{:.1}" font-family="{DISPLAY}" font-weight="800" font-size="{fs}" letter-spacing="{:.2}" fill="{}">{}</text>"#,
                y_first + i as f64 * lh,
                -f64::from(fs) * 0.02,
                p.text,
                esc(line)
            );
        }
        let _ = write!(
            s,
            r#"<text x="28" y="452" font-family="{BODY}" font-weight="800" font-size="17" fill="{}">{} · {}</text>"#,
            p.text,
            esc(&text.city),
            esc(&text.cc)
        );
        let _ = write!(
            s,
            r#"<text x="28" y="478" font-family="{BODY}" font-weight="700" font-size="12" letter-spacing="1.4" fill="{}">{}</text>"#,
            p.sub,
            esc(&text.cats.join(" · ").to_uppercase())
        );
    }
    if let Some(band) = options.cancelled {
        let _ = write!(
            s,
            concat!(
                r##"<g transform="rotate(-12 200 250)"><rect x="-40" y="214" width="480" height="64" fill="#D8354A"></rect>"##,
                r##"<text x="200" y="258" text-anchor="middle" font-family="{}" font-weight="800" font-size="30" letter-spacing="2" fill="#FFFFFF">{}</text></g>"##
            ),
            DISPLAY,
            esc(band)
        );
    }
    // §4.24: the full flyer is a named image; compact sits next to its text and hides.
    let aria = if options.compact {
        r#"aria-hidden="true""#.to_owned()
    } else {
        format!(
            r#"role="img" aria-label="{} {}, {} {} {}, {}""#,
            esc(options.label),
            esc(&text.name),
            esc(&text.dow),
            esc(&text.day),
            esc(&text.mon),
            esc(&text.city)
        )
    };
    format!(
        r#"<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 {w} {h}" preserveAspectRatio="xMidYMid slice" shape-rendering="crispEdges" text-rendering="geometricPrecision" {aria} style="display: block">{s}</svg>"#
    )
}

/// The 1200×630 share image, filling its container.
pub fn og_svg(text: &FlyerText, look: (Palette, Pose), uid: &str) -> String {
    let (palette, pose) = look;
    let p = palette.colors();
    let text = text.with_cats_fitted(OG_CATS_CHARS);
    let (w, h) = (1200, 630);
    let floor_y = 520;
    let mut s = String::new();
    let _ = write!(
        s,
        r#"<rect width="{w}" height="{h}" fill="{}"></rect>"#,
        p.bg
    );
    s += &pixel_rings(
        (940.0, 260.0),
        &[90.0, 150.0, 210.0, 270.0, 330.0, 390.0],
        12,
        (w, h),
        p.ring,
    );
    for gx in (0..w).step_by(24) {
        let _ = write!(
            s,
            r#"<rect x="{gx}" y="{floor_y}" width="12" height="6" fill="{}"></rect>"#,
            p.floor
        );
    }
    s += &sprite(pose, (800, floor_y - pose.rows().len() as u32 * 16), 16, &p);
    let _ = write!(
        s,
        r##"<defs><linearGradient id="{uid}v" x1="0" y1="0" x2="0" y2="1"><stop offset=".6" stop-color="#000000" stop-opacity="0"></stop><stop offset="1" stop-color="#000000" stop-opacity=".4"></stop></linearGradient></defs><rect width="{w}" height="{h}" fill="url(#{uid}v)"></rect>"##
    );
    let time = text
        .time
        .as_deref()
        .map(|time| format!(" · {}", esc(time)))
        .unwrap_or_default();
    let _ = write!(
        s,
        r#"<text x="64" y="104" font-family="{BODY}" font-weight="800" font-size="26" letter-spacing="3" fill="{}">{} {} {}{time}</text>"#,
        p.sub,
        esc(&text.dow.to_uppercase()),
        esc(&text.day),
        esc(&text.mon.to_uppercase())
    );
    let (fs, lines) = fit_name(&text.name, OG_NAME);
    let lh = f64::from(fs) * 1.06;
    for (i, line) in lines.iter().enumerate() {
        let _ = write!(
            s,
            r#"<text x="60" y="{:.0}" font-family="{DISPLAY}" font-weight="800" font-size="{fs}" letter-spacing="{:.1}" fill="{}">{}</text>"#,
            210.0 + i as f64 * lh,
            -f64::from(fs) * 0.02,
            p.text,
            esc(line)
        );
    }
    let _ = write!(
        s,
        r#"<text x="64" y="500" font-family="{BODY}" font-weight="800" font-size="30" fill="{}">{} · {}</text>"#,
        p.text,
        esc(&text.city),
        esc(&text.cc)
    );
    // With no battles yet, the line is just the site name, without a dangling separator.
    let cats = esc(&text.cats.join(" · ").to_uppercase());
    let footer = if cats.is_empty() {
        "BREAKINGJAM.COM".to_owned()
    } else {
        format!("{cats}   ·   BREAKINGJAM.COM")
    };
    let _ = write!(
        s,
        r#"<text x="64" y="566" font-family="{BODY}" font-weight="700" font-size="20" letter-spacing="2" fill="{}">{footer}</text>"#,
        p.sub
    );
    format!(
        r#"<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 {w} {h}" shape-rendering="crispEdges" role="img" aria-label="Share image for {}" style="display: block">{s}</svg>"#,
        esc(&text.name)
    )
}

static UNBOUNDED: &[u8] = include_bytes!("../assets/fonts/Unbounded-wght.ttf");
static MANROPE: &[u8] = include_bytes!("../assets/fonts/Manrope-wght.ttf");

/// The two brand fonts, embedded so rasterising needs no font files on the host.
pub(crate) static FONTS: LazyLock<Arc<usvg::fontdb::Database>> = LazyLock::new(|| {
    let mut fonts = usvg::fontdb::Database::new();
    fonts.load_font_data(UNBOUNDED.to_vec());
    fonts.load_font_data(MANROPE.to_vec());
    Arc::new(fonts)
});

/// Why the share image could not be rasterised.
#[derive(Debug, thiserror::Error)]
pub enum RasterError {
    #[error("invalid SVG: {0}")]
    Svg(#[from] usvg::Error),
    #[error("could not allocate the image")]
    Pixmap,
    #[error("could not encode PNG: {0}")]
    Png(String),
}

/// Rasterises an `og_svg` document to a 1200×630 PNG with the embedded fonts.
pub fn og_png(svg: &str) -> Result<Vec<u8>, RasterError> {
    // `100%` has nothing to be a percentage of outside a page; give the root its pixel size.
    let svg = svg.replacen(
        r#"width="100%" height="100%""#,
        r#"width="1200" height="630""#,
        1,
    );
    let options = usvg::Options {
        fontdb: FONTS.clone(),
        ..usvg::Options::default()
    };
    let tree = usvg::Tree::from_str(&svg, &options)?;
    let mut pixmap = tiny_skia::Pixmap::new(1200, 630).ok_or(RasterError::Pixmap)?;
    resvg::render(&tree, tiny_skia::Transform::default(), &mut pixmap.as_mut());
    pixmap
        .encode_png()
        .map_err(|err| RasterError::Png(err.to_string()))
}
