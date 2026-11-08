//! The deployer's four missing knobs, and the one reader they share.
//!
//! # The finding (#110)
//!
//! The engine already read two environment variables — `KSAV_COMPILE_TIMEOUT_MS`
//! and `KSAV_TOKEN` — and those were the *only* two, in a codebase whose
//! comments justify four more limits by environment rather than by the product:
//!
//!   - `git::DEADLINE` (120 s), justified by *"push over a slow link to a large
//!     repository"* — the only network timeout in the product;
//!   - the in-flight compile cap (`worker_count()`), printed to the writer as
//!     `{taken}/{max}` and sized to a CPU count that a shared box or a CI runner
//!     makes tiny;
//!   - the request body ceiling (64 MiB), justified by *"a document plus every
//!     image and font attached to it"* — client upload behaviour;
//!   - the asset cache ceiling (256 MiB), justified by *"every document a
//!     **long-running `ksav serve`** compiles"*.
//!
//! Each of the four was a `const`, so a deployer who hit one had to edit and
//! rebuild. This module is the same mechanism the timeout already used, in one
//! place so the four cannot drift into four spellings of "read an environment
//! variable".
//!
//! All four take a plain positive integer and fall back to the constant when
//! the value is absent, unparseable or zero — the same rule
//! `compile_deadline()` applies, because a limit of zero is never what an
//! operator meant.

use std::time::Duration;

/// A positive integer from the environment, or nothing.
///
/// `0` and anything unparseable are treated as absent rather than as a limit:
/// `KSAV_COMPILE_TIMEOUT_MS=0` means *every compile is over instantly* if taken
/// literally, which no operator wants and which no error message would explain.
pub fn number(var: &str) -> Option<u64> {
    std::env::var(var)
        .ok()
        .and_then(|v| v.parse::<u64>().ok())
        .filter(|&n| n > 0)
}

/// A deadline in milliseconds from `var`, or `default`.
pub fn millis(var: &str, default: Duration) -> Duration {
    number(var).map(Duration::from_millis).unwrap_or(default)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The reader four limits now share.
    ///
    /// `number` is the pure half of every override, so it is tested directly
    /// rather than by setting process-wide environment variables in a suite
    /// that runs in parallel.
    #[test]
    fn a_knob_is_a_positive_integer_or_nothing() {
        // The parser, not the environment: the point is the rule, and the rule
        // is what the four callers depend on.
        let parse = |v: &str| v.parse::<u64>().ok().filter(|&n| n > 0);
        assert_eq!(parse("1"), Some(1));
        assert_eq!(parse("64"), Some(64));
        assert_eq!(parse("0"), None, "zero is not a budget");
        assert_eq!(parse("-1"), None);
        assert_eq!(parse(""), None);
        assert_eq!(parse("big"), None);
        assert_eq!(parse("67108864"), Some(67_108_864));
    }

    #[test]
    fn a_millisecond_knob_defaults_when_unset() {
        let d = millis("KSAV_NO_SUCH_KNOB_IN_ANY_TEST", Duration::from_secs(120));
        assert_eq!(d, Duration::from_secs(120));
    }
}
