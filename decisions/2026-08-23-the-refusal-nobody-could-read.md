# 2026-08-23 · The refusal nobody could read

Three audit findings about a system that does the right thing and then says so
in a place where the answer is lost — or says nothing while undoing what the
writer typed.

## B12 · The git drawer erased the message being typed

The drawer rebuilds whole on every change, which is the right call for six
blocks of mutable state — and `gitMayHaveChanged` fires from the manual-save
path, so typing a commit message and pressing Ctrl+S rebuilt the drawer
mid-sentence and recreated every field empty. Name, email, branch name, remote
name and URL all had the same wound.

Fixed once, above the fields: a draft map keyed by field, read when a rebuild
recreates the input and written on every keystroke. Each consuming action clears
its own draft on use, so a sent commit does not leave its message behind to be
sent again by accident.

## B13 · Release refusals were written to no console

Every deep-link and scheme diagnosis went through `eprintln!`, release builds
detach the console (`windows_subsystem`), and the log plugin was registered only
under `debug_assertions`. The "diagnosis written where nobody can read it"
anti-pattern, in the flagship installer.

The log plugin is now registered unconditionally and **before** setup, with a
log-directory file target beside stdout — before, because the URL that started
the process is delivered during setup, and a refused source from that delivery
is exactly the line worth finding later. All seven `eprintln!` sites became
`log::warn!`/`log::error!`; the debug-only registration stays as an extra view,
not as the record.

## B14 · Shir HaShirim Rabbah filed as the megillah

`"שיר השירים רבה"` sat in the Tanach row's alias list, so a citation printed as
`שיר השירים` at order 1044 under תנ״ך instead of מדרש at 3000. It has its own
row in Midrash now (3008), with `"שה\"ש רבה"` beside it. Lookup is exact-match
on folded spellings, so the shorter alias cannot swallow the longer one.
