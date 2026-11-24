;;; gate-options.el --- What `node tools/gate.mjs emacs` asks of byte-compile -*- lexical-binding: t; -*-

;; SPDX-License-Identifier: MIT OR Apache-2.0

;;; Commentary:

;; Loaded by the gate's `emacs-compile' check, and by nothing else. Not part of
;; the package: `PACKAGE_FILES' is a list, so this is not shipped.
;;
;; Two decisions, and both of them were made in `ci.yml' first, in a shell step:
;;
;; **A warning is an error.** An elisp warning is what a `tsc` error is in the
;; editor — the file compiles either way, and the warning is the only thing that
;; will ever name a free variable or a function that is not there. The history is
;; in the check: `ksav.el` used `string-replace', which is Emacs 28, against a
;; declaration of 27.1, and the ERT run failed with a `void-function' backtrace
;; from inside a `let' inside an `unwind-protect' while the byte compiler would
;; have said the name and the line.
;;
;; **The `.elc' files do not go beside the sources.** `batch-byte-compile' writes
;; `ksav.elc' next to `ksav.el', and the next thing the gate does is load
;; `ksav.el' — which, with a `.elc' of the same vintage sitting beside it, is not
;; guaranteed to be the source that was just linted. The shell step that this
;; replaces ended with `rm -f ./*.elc' for exactly that reason: a cleanup step is
;; how a compile check apologises for dirtying the tree it is checking. A
;; destination function says it in one place instead, and leaves `git status'
;; alone.

;;; Code:

(require 'bytecomp)

(setq byte-compile-error-on-warn t)

(setq byte-compile-dest-file-function
      (lambda (source)
        (expand-file-name (concat (file-name-nondirectory source) "c")
                          temporary-file-directory)))

(provide 'gate-options)
;;; gate-options.el ends here
