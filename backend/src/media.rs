//! Uploaded images: what a valid one is, and the store they are written to (R2, via the Worker).

use axum::body::Bytes;
use oauth2::reqwest::{
    self,
    header::{CACHE_CONTROL, CONTENT_TYPE},
};

use crate::config::Config;

/// What an uploaded image must be: a JPEG of exactly this size, up to `max_bytes`.
#[derive(Debug, Clone, Copy)]
pub struct ImageSpec {
    /// Width in pixels.
    pub width: u16,
    /// Height in pixels.
    pub height: u16,
    /// Largest accepted file.
    pub max_bytes: usize,
}

/// A jam's flyer on its page, 4:5.
pub const FLYER: ImageSpec = ImageSpec {
    width: 1080,
    height: 1350,
    max_bytes: 2 * 1024 * 1024,
};

/// A jam's flyer on cards, lists and the map.
pub const FLYER_CARD: ImageSpec = ImageSpec {
    width: 540,
    height: 675,
    max_bytes: 400 * 1024,
};

impl ImageSpec {
    /// Why `bytes` is not such an image, if it is not.
    pub fn check(&self, bytes: &[u8]) -> Result<(), &'static str> {
        if bytes.len() > self.max_bytes {
            return Err("is too large");
        }
        match jpeg_size(bytes) {
            None => Err("must be a JPEG"),
            Some(size) if size != (self.width, self.height) => Err("has the wrong pixel size"),
            Some(_) => Ok(()),
        }
    }
}

/// `(width, height)` of a JPEG, read from its frame header; `None` when it is not a JPEG.
pub(crate) fn jpeg_size(bytes: &[u8]) -> Option<(u16, u16)> {
    let mut rest = bytes.strip_prefix(&[0xFF, 0xD8])?;
    loop {
        let [0xFF, marker, len_hi, len_lo, segment @ ..] = rest else {
            return None;
        };
        // SOF0–SOF15 hold the size; C4, C8 and CC share their range but are other segments.
        if matches!(marker, 0xC0..=0xCF) && !matches!(marker, 0xC4 | 0xC8 | 0xCC) {
            let [_precision, h_hi, h_lo, w_hi, w_lo, ..] = segment else {
                return None;
            };
            let width = u16::from_be_bytes([*w_hi, *w_lo]);
            let height = u16::from_be_bytes([*h_hi, *h_lo]);
            return Some((width, height));
        }
        // The image data (SOS) starts before any frame header: not a JPEG we accept.
        let len = usize::from(u16::from_be_bytes([*len_hi, *len_lo]));
        if *marker == 0xDA || len < 2 {
            return None;
        }
        rest = rest.get(2 + len..)?;
    }
}

/// Uploaded objects never change, as every upload gets a new key.
const IMMUTABLE: &str = "public, max-age=31536000, immutable";

/// Writes and deletes uploaded images: plain HTTP to `MEDIA_STORE_URL`, which in production is
/// the Worker's handler in front of R2.
#[derive(Debug, Clone)]
pub struct MediaStore {
    http: reqwest::Client,
    store_url: String,
    public_url: String,
}

impl MediaStore {
    /// The store named by `config`, written to with `http`.
    pub fn new(http: reqwest::Client, config: &Config) -> Self {
        Self {
            http,
            store_url: config.media_store_url.trim_end_matches('/').to_owned(),
            public_url: config.media_public_url.trim_end_matches('/').to_owned(),
        }
    }

    /// Stores a JPEG under `key`; returns its public URL.
    pub async fn put_jpeg(&self, key: &str, jpeg: Bytes) -> reqwest::Result<String> {
        self.http
            .put(format!("{}/{key}", self.store_url))
            .header(CONTENT_TYPE, "image/jpeg")
            .header(CACHE_CONTROL, IMMUTABLE)
            .body(jpeg)
            .send()
            .await?
            .error_for_status()?;
        Ok(format!("{}/{key}", self.public_url))
    }

    /// Deletes the object behind one of this store's public URLs; other URLs are left alone.
    pub async fn delete(&self, url: &str) -> reqwest::Result<()> {
        let Some(key) = self.key_of(url) else {
            return Ok(());
        };
        self.http
            .delete(format!("{}/{key}", self.store_url))
            .send()
            .await?
            .error_for_status()?;
        Ok(())
    }

    /// The key behind one of this store's public URLs.
    pub(crate) fn key_of<'a>(&self, url: &'a str) -> Option<&'a str> {
        url.strip_prefix(self.public_url.as_str())?
            .strip_prefix('/')
    }
}
