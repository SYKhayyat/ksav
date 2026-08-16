// Stage `editors/emacs` as an installable Emacs package.
//
// # The finding
//
// The package worked and could not be installed. Every route into it began
// "clone the monorepo": the README said `(add-to-list 'load-path
// "/path/to/ksav/editors/emacs")`, there was no archive entry, no recipe, no
// tarball, and no `-pkg.el` — so `package-install-file`, the one command an
// Emacs user reaches for, had nothing to be given. A package that is only
// installable by people who already have the source tree is a package for
// people who were never going to need it.
//
// This produces the tarball. `release.yml` attaches it, so
// `M-x package-install-file` on the download is a complete install, and
// `emit-release-assets.mjs` is the other half — the engine binary that install
// then needs.
//
//   node tools/emacs-package.mjs <dir>   # stage <dir>/ksav-<version>/
//
// # What is in it, and what is not
//
// `ksav-tests.el` is left out. It is a real suite and it is the *package's*
// suite, run by CI against a real engine, but it requires `ert` and exists to
// be run from the checkout; shipping it to every installation adds a file
// nobody loads and a byte-compile of code about the package rather than of the
// package. MELPA's own convention is the same.
//
// # The version
//
// Read out of `ksav.el`'s own `;; Version:` header rather than declared here.
// package.el reads that header for a `package-vc-install' and reads `-pkg.el'
// for a tarball, and the two disagreeing is a package that reports one version
// installed and another in its own source. One of them has to be derived from
// the other, and the header is the one Emacs already treats as authoritative.

import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { isMain } from "./generated.mjs";

const here = dirname(fileURLToPath(import.meta.url));
export const EMACS = join(here, "..", "..", "editors", "emacs");

/** What ships. In load order, which is also the order `-pkg.el` wants them. */
export const PACKAGE_FILES = ["ksav-services.el", "ksav-release.el", "ksav.el", "README.md"];

/** One header field of an elisp file, as `lisp-mnt` would read it. */
export function header(file, field) {
  const text = readFileSync(join(EMACS, file), "utf8");
  const hit = new RegExp(`^;;\\s*${field}:\\s*(.+)$`, "mu").exec(text);
  return hit ? hit[1].trim() : null;
}

/** The version this package declares, from `ksav.el`. */
export const packageVersion = () => header("ksav.el", "Version");

/** The Emacs it declares it needs, from `Package-Requires`. */
export function requiredEmacs() {
  const raw = header("ksav.el", "Package-Requires") ?? "";
  const hit = /\(emacs\s+"([^"]+)"\)/u.exec(raw);
  return hit ? hit[1] : null;
}

/**
 * Every `ksav-*` feature the shipped files require of each other.
 *
 * Swept rather than listed, because the list above is the thing that goes
 * stale: a new generated file gets required from `ksav.el` and not added here,
 * and the tarball then installs a package that fails to load on the one machine
 * that matters — somebody else's. `app/test/emacs.test.mjs` compares the two.
 */
export function requiredFeatures() {
  const found = new Set();
  for (const file of PACKAGE_FILES.filter((f) => f.endsWith(".el"))) {
    const text = readFileSync(join(EMACS, file), "utf8");
    for (const m of text.matchAll(/^\(require '(ksav[\w-]*)\)/gmu)) found.add(m[1]);
  }
  return [...found];
}

/** The `-pkg.el` a multi-file tarball needs, which package.el reads for its metadata. */
export function pkgEl() {
  // `lexical-binding' as well as `no-byte-compile', which looks redundant and is
  // not: package.el byte-compiles the installed directory, reaches this file
  // anyway, and warns that it has no directive — a warning on the last line of
  // somebody's first install of Ksav, about a file they did not write and will
  // never open.
  return `;;; ksav-pkg.el --- Generated package metadata  -*- no-byte-compile: t; lexical-binding: t -*-

;; Written by ksav/app/tools/emacs-package.mjs when the tarball is built, from
;; the headers of ksav.el.  Not in the repository: a second declaration of the
;; version is a second thing to remember to change.

(define-package "ksav" "${packageVersion()}"
  "Write a sefer in Emacs, typeset by Ksav"
  '((emacs "${requiredEmacs()}"))
  :url "https://github.com/SYKhayyat/ksav"
  :keywords '("languages" "wp" "hebrew"))
`;
}

/** Stage the package under DIR, and return the directory that was made. */
export function stage(dir) {
  const name = `ksav-${packageVersion()}`;
  const out = join(dir, name);
  mkdirSync(out, { recursive: true });
  for (const file of PACKAGE_FILES) copyFileSync(join(EMACS, file), join(out, file));
  writeFileSync(join(out, "ksav-pkg.el"), pkgEl());
  return out;
}

if (isMain(import.meta.url)) {
  const dir = process.argv[2];
  if (!dir) {
    console.error("usage: node tools/emacs-package.mjs <dir>");
    process.exit(2);
  }
  const made = stage(dir);
  // The directory name, so the workflow can `tar -cf ksav-<version>.tar` on it
  // without spelling the version out a second time in YAML.
  console.log(made);
}
