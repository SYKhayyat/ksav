;;; ksav.el --- Write a sefer in Emacs, typeset by Ksav  -*- lexical-binding: t; -*-

;; Copyright (C) 2026 The Ksav Authors
;; SPDX-License-Identifier: MIT OR Apache-2.0

;; Author: The Ksav Authors
;; URL: https://github.com/SYKhayyat/ksav
;; Version: 0.1.0
;; Package-Requires: ((emacs "27.1"))
;; Keywords: languages, wp, hebrew

;;; Commentary:

;; Ksav is a Hebrew-first writing system built on real Typst compilation.  This
;; package lets you write a `.ksav' document in Emacs and have Ksav's own engine
;; typeset it, with the page beside the text.
;;
;; It is a *client*.  Nothing here parses Ksav markup, decides what a command
;; means, or renders anything: every one of those questions is answered by the
;; engine over HTTP, by the same services the desktop application and the
;; browser build ask.  That is the whole design, and the reason for it is
;; written down in `engine/src/services.rs': this product used to keep four
;; hand-written copies of what the engine can do, they drifted, and the drift
;; was silent every time.  A fifth copy, in elisp, would drift too — so the
;; service table here is *generated* into `ksav-services.el' from the engine's
;; own registry, and `ksav/app/test/emacs.test.mjs' fails when the two disagree.
;;
;; The command vocabulary is not generated at all: it is asked for at run time
;; from `/commands', so `M-x ksav-insert-command' offers whatever the engine
;; you are actually talking to knows about.
;;
;; Every service the engine answers has a door here.  That is a claim the test
;; file above holds, with an exemption list that is empty — because the version
;; before this one reached three of sixteen, and a client that quietly cannot do
;; twelve of the things the product does is not a client, it is a demo.
;;
;; Getting started, from an Emacs with nothing else installed:
;;
;;   M-x ksav-install-engine     ; downloads the engine for this machine
;;   ;; `.ksav' files now open in `ksav-mode'.
;;
;; The engine is a separate download because this package is a client and the
;; engine is the product — see below.  It is fetched from the same GitHub
;; release this package comes from, put under your own Emacs directory, and
;; never placed on `exec-path'; a `ksav' binary of your own always wins.
;;
;;   C-c C-c   compile, and show the page
;;   C-c C-i   insert a command, by name, in either language
;;   C-c C-e   export a PDF
;;   C-c C-s   spell-check the buffer against Ksav's Hebrew and English lexicons
;;
;; …and the rest of the table is in this directory's README.
;;
;; The engine is started for you the first time you need it, and stopped when
;; Emacs exits.  Point it at one you are already running with
;; `ksav-server-url'.
;;
;; # How this package is laid out
;;
;; `ksav-services.el'  the engine's registry, generated from Rust
;; `ksav-release.el'   which build runs on which machine, generated too
;; `ksav-engine.el'    getting, starting and asking an engine; reading a refusal
;; `ksav-preview.el'   compiling, the page, PDF and Typst out, jump and reveal
;; `ksav-write.el'     commands, templates, the sefarim catalogue, the speller
;; `ksav-girsa.el'     the six errands to the library beside Ksav
;; `ksav-git.el'       version control, on the git the writer already has
;; `ksav.el'           this file: the mode, the keys, and nothing else

;;; Code:

(require 'ksav-engine)
(require 'ksav-preview)
(require 'ksav-write)
(require 'ksav-girsa)
(require 'ksav-git)

(defcustom ksav-paragraph-direction 'right-to-left
  "Which way paragraphs run in `ksav-mode'.

Ksav is Hebrew-first and this is the honest default for it.  Set it to
`left-to-right' for an English document, or to nil to let Emacs decide from the
first strong character in each paragraph — which is Emacs' own default and is
wrong exactly when a Hebrew paragraph happens to begin with a command name."
  ;; Named, because the group is defined in `ksav-engine.el' — a `defcustom'
  ;; takes the last `defgroup' in its own file, and there is none in this one.
  :type '(choice (const right-to-left) (const left-to-right) (const nil))
  :group 'ksav)

;;;; ------------------------------------------------------------------- the mode

(defvar ksav-mode-syntax-table
  (let ((table (make-syntax-table)))
    ;; Typst's comments, which Ksav inherits: `//' to end of line and `/* */'.
    (modify-syntax-entry ?/ ". 124" table)
    (modify-syntax-entry ?* ". 23b" table)
    (modify-syntax-entry ?\n ">" table)
    (modify-syntax-entry ?\" "\"" table)
    (modify-syntax-entry ?\\ "\\" table)
    ;; `#' starts a command name and is part of no word.
    (modify-syntax-entry ?# "'" table)
    ;; Hebrew letters are letters.  Without this, `word-forward' and every
    ;; regexp using `\\w' stop at the first one — in a Hebrew-first editor.
    (modify-syntax-entry '(?\u0590 . ?\u05F4) "w" table)
    table)
  "Syntax for `ksav-mode'.")

(defconst ksav-command-regexp
  "#\\([[:alpha:]\u0590-\u05FF_][[:alnum:]\u0590-\u05FF_]*\\)"
  "A Ksav command: `#' and a name, in Hebrew or in English.")

(defvar ksav-font-lock-keywords
  `((,ksav-command-regexp (1 font-lock-keyword-face))
    ;; A named argument inside a call: `#שם(רמה: 2)[…]'.
    ("[(,][ \t]*\\([[:alpha:]\u0590-\u05FF_][[:alnum:]\u0590-\u05FF_]*\\)[ \t]*:"
     (1 font-lock-variable-name-face))
    ;; Inline maths, which Typst delimits with dollars.
    ("\\$[^$\n]*\\$" . font-lock-constant-face))
  "What `ksav-mode' colours.")

(defvar ksav-mode-map
  (let ((map (make-sparse-keymap)))
    ;; Full sequences, rather than two prefix keymaps of their own.  A
    ;; `define-key' with three keys in it builds the intermediate maps anyway,
    ;; and this way every binding this mode has is one line matching one
    ;; pattern — which is what `app/test/emacs.test.mjs' reads to check that
    ;; each of them is in the README.  A key nobody is told about is a feature
    ;; that does not exist for anybody who did not write it, and a fence that
    ;; can only see the bindings written one particular way is worse than none.
    (define-key map (kbd "C-c C-c") #'ksav-compile)
    (define-key map (kbd "C-c C-e") #'ksav-export-pdf)
    (define-key map (kbd "C-c C-t") #'ksav-export-typst)
    (define-key map (kbd "C-c C-n") #'ksav-new-from-template)
    (define-key map (kbd "C-c C-i") #'ksav-insert-command)
    (define-key map (kbd "C-c C-f") #'ksav-insert-sefer)
    (define-key map (kbd "C-c C-s") #'ksav-spell-buffer)
    (define-key map (kbd "C-c C-w") #'ksav-correct-word)
    (define-key map (kbd "C-c C-r") #'ksav-reveal)
    (define-key map (kbd "C-c C-k") #'ksav-stop)
    ;; The library beside Ksav.
    (define-key map (kbd "C-c C-g i") #'ksav-inbox)
    (define-key map (kbd "C-c C-g y") #'ksav-yank-source)
    (define-key map (kbd "C-c C-g m") #'ksav-mekoros)
    (define-key map (kbd "C-c C-g s") #'ksav-search-in-girsa)
    (define-key map (kbd "C-c C-g l") #'ksav-linkify)
    (define-key map (kbd "C-c C-g r") #'ksav-refresh-sources)
    ;; Version control, on the sefer rather than on the directory.
    (define-key map (kbd "C-c C-v v") #'ksav-git-status)
    (define-key map (kbd "C-c C-v c") #'ksav-git-commit)
    (define-key map (kbd "C-c C-v l") #'ksav-git-log)
    (define-key map (kbd "C-c C-v p") #'ksav-git-push)
    (define-key map (kbd "C-c C-v u") #'ksav-git-pull)
    (define-key map (kbd "C-c C-v !") #'ksav-git)
    map)
  "Keys in `ksav-mode'.")

;;;###autoload
(define-derived-mode ksav-mode text-mode "Ksav"
  "Major mode for writing a sefer in Ksav's markup.

\\{ksav-mode-map}"
  :syntax-table ksav-mode-syntax-table
  (setq-local font-lock-defaults '(ksav-font-lock-keywords))
  (setq-local comment-start "// ")
  (setq-local comment-end "")
  (setq-local comment-start-skip "//+[ \t]*")
  ;; Hebrew-first, and stated rather than inferred.  Emacs decides a paragraph's
  ;; direction from its first strong character, which is wrong exactly when a
  ;; Hebrew paragraph opens with `#כותרת' — the Latin-lettered command name is
  ;; not there, but a `#' followed by Hebrew still trips the heuristic often
  ;; enough to make a document jump around while it is being written.
  (setq-local bidi-paragraph-direction ksav-paragraph-direction)
  (setq-local require-final-newline t)
  ;; The sefarim catalogue, offered where a sefer name goes.  `completion-at-point'
  ;; is the door every completion front end in Emacs already knows about, so this
  ;; is also what company and corfu pick up without being told.
  (add-hook 'completion-at-point-functions #'ksav-sefer-completion-at-point nil t)
  ;; Tell the library where this document lives, so that standing on a passage
  ;; in Girsa and asking which of your own sefarim cite it has an answer.  It
  ;; does nothing when no engine is running.
  (add-hook 'after-save-hook #'ksav--tell-girsa-on-save nil t))

;;;###autoload
(add-to-list 'auto-mode-alist '("\\.ksav\\'" . ksav-mode))

(provide 'ksav)
;;; ksav.el ends here
