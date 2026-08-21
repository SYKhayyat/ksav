// The smallest real package: one function, imported by name, resolved off disk.
//
// It exists so that `packages_root` is tested against a package rather than
// against a mock — a loader that works on a fixture and not on the layout Typst
// actually uses is a loader that does not work.
#let hello(who) = [שלום #who]
