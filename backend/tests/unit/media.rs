//! Unit tests of `crate::media`.

use crate::{config::Config, media::*};

/// SOI, an APP0 segment, then a frame header of type `sof` for `width`×`height`.
fn jpeg(sof: u8, width: u16, height: u16) -> Vec<u8> {
    let [w_hi, w_lo] = width.to_be_bytes();
    let [h_hi, h_lo] = height.to_be_bytes();
    let mut bytes = vec![0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x04, 0x4A, 0x46];
    bytes.extend_from_slice(&[0xFF, sof, 0x00, 0x0B, 0x08, h_hi, h_lo, w_hi, w_lo]);
    bytes.extend_from_slice(&[0x01, 0x01, 0x11, 0x00, 0xFF, 0xD9]);
    bytes
}

#[test]
fn reads_the_size_of_baseline_and_progressive_jpegs() {
    assert_eq!(jpeg_size(&jpeg(0xC0, 1080, 1350)), Some((1080, 1350)));
    assert_eq!(jpeg_size(&jpeg(0xC2, 540, 675)), Some((540, 675)));
}

#[test]
fn skips_segments_that_share_the_frame_range() {
    // A Huffman table (C4) before the frame header, as some encoders write it.
    let mut bytes = vec![0xFF, 0xD8, 0xFF, 0xC4, 0x00, 0x03, 0x00];
    bytes.extend_from_slice(&jpeg(0xC0, 16, 20)[2..]);
    assert_eq!(jpeg_size(&bytes), Some((16, 20)));
}

#[test]
fn anything_else_has_no_jpeg_size() {
    assert_eq!(jpeg_size(b"\x89PNG\r\n\x1a\n"), None);
    assert_eq!(jpeg_size(&[0xFF, 0xD8]), None, "truncated");
    assert_eq!(
        jpeg_size(&jpeg(0xC0, 1080, 1350)[..12]),
        None,
        "cut in the header"
    );
    // Image data before any frame header.
    assert_eq!(
        jpeg_size(&[0xFF, 0xD8, 0xFF, 0xDA, 0x00, 0x02, 0xFF, 0xC0]),
        None
    );
    // A zero length must not loop forever.
    assert_eq!(jpeg_size(&[0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x00]), None);
}

#[test]
fn specs_check_type_size_and_bytes() {
    assert_eq!(FLYER.check(&jpeg(0xC0, 1080, 1350)), Ok(()));
    assert_eq!(
        FLYER.check(&jpeg(0xC0, 540, 675)),
        Err("has the wrong pixel size")
    );
    assert_eq!(FLYER_CARD.check(b"GIF89a"), Err("must be a JPEG"));
    let mut big = jpeg(0xC0, 540, 675);
    big.resize(FLYER_CARD.max_bytes + 1, 0);
    assert_eq!(FLYER_CARD.check(&big), Err("is too large"));
}

#[test]
fn only_its_own_public_urls_have_a_key() {
    let config = Config::from_lookup(|name| match name {
        "APP_PORT" => None,
        "MEDIA_PUBLIC_URL" => Some("https://media.breakingjam.com/".into()),
        _ => Some(format!("{name}-value")),
    })
    .unwrap();
    let store = MediaStore::new(Default::default(), &config);
    assert_eq!(
        store.key_of("https://media.breakingjam.com/flyers/a/b.jpg"),
        Some("flyers/a/b.jpg")
    );
    assert_eq!(
        store.key_of("https://media.breakingjam.com.evil.com/x.jpg"),
        None
    );
    assert_eq!(store.key_of("https://elsewhere.com/flyers/a/b.jpg"), None);
}
