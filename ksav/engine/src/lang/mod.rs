//! Ksav's language and the document's own calling of it — the engine's half.
//!
//! # What `#222` meant by "three concerns"
//!
//! `engine/src/lib.rs` was one 6,231-line file holding:
//!
//! 1. **the language** — the prelude's spellings, `main_source`/`assemble_source`,
//!    the `#מסמך(` found and edited in place, the package root, and the syntax-tree
//!    walk that answers what a document calls;
//! 2. **the compile pipeline** — the Typst world, the layouts, the page writing;
//! 3. **the wire** — the JSON a caller sends and is answered with.
//!
//! A change to one of those is not a change to the others, and they were two
//! thousand lines apart with nothing saying so. This module is the first: what a
//! document *says*, which is the same subject as `typst/ksav.typ` and is read for
//! the same reasons.
//!
//! - [`prelude`] — the literals and `#show` rule handed to Typst, the writer's own
//!   `#מסמך(` and the note reservoir inside it, and `@local`'s package root.
//! - [`commands`] — what a document calls, by name, from the parsed syntax tree:
//!   the walk behind the apparatus checks, and the italic question the editor asks
//!   the font book.
//!
//! The compile pipeline stays in `lib.rs` for now, and its own size is what says
//! whether a `layout` module is the next cut or a module for module's sake.

pub mod commands;
pub mod prelude;
