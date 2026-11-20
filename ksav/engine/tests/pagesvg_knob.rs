//! `KSAV_SVG_THREADS` is the escape hatch for the page serialiser (#218).
//!
//! Its own file, and therefore its own process: the test sets a process-wide
//! environment variable, and `cargo test` runs the tests *within* one binary in
//! parallel threads. Reading the knob in `pagesvg.rs`'s own file made every
//! neighbouring assertion about thread counts race with it, which is a flaky test
//! that would have been blamed on the code rather than on the test.
//!
//! Two directions, and both are real deployment questions:
//!
//! - **`1`** asks for the sequential answer. A server already running several
//!   compiles in flight does not want each of them claiming every core, and a
//!   caller that needs to reproduce a report needs the serial path to exist.
//! - a number above the box's size is clamped rather than obeyed, because 64
//!   threads for eight cores is contention, not parallelism.

use ksav_engine::pagesvg::threads_for;

#[test]
fn the_thread_count_is_a_knob_and_a_cap() {
    std::env::set_var("KSAV_SVG_THREADS", "1");
    assert_eq!(threads_for(64), 1, "the knob did not take");

    std::env::set_var("KSAV_SVG_THREADS", "64");
    assert_eq!(
        threads_for(260),
        16,
        "the knob is not capped at the box's size"
    );

    std::env::set_var("KSAV_SVG_THREADS", "3");
    assert_eq!(
        threads_for(260),
        3,
        "a thread count within the cap was not obeyed"
    );
}
