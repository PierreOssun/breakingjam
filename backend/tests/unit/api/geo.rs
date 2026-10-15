//! Unit tests of `crate::api::geo`.

use crate::api::geo::*;

#[test]
fn only_real_country_codes_count() {
    assert_eq!(country_code("CH"), Some("CH".into()));
    assert_eq!(country_code("XX"), None, "Cloudflare doesn't know");
    assert_eq!(country_code("T1"), None, "Tor");
    assert_eq!(country_code("ch"), None);
    assert_eq!(country_code("CHE"), None);
    assert_eq!(country_code(""), None);
}
