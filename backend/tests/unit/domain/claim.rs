//! Unit tests of `crate::domain::claim`.

use crate::domain::claim::*;

#[test]
fn codes_use_the_unambiguous_alphabet() {
    for _ in 0..200 {
        let code = new_code();
        assert_eq!(code.len(), 7);
        assert!(code.starts_with("BJ-"));
        assert!(code[3..].bytes().all(|b| CODE_ALPHABET.contains(&b)));
    }
}
