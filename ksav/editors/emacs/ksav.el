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
;; Getting started:
;;
;;   (require 'ksav)
;;   ;; `.ksav' files now open in `ksav-mode'.
;;
;;   C-c C-c   compile, and show the page
;;   C-c C-i   insert a command, by name, in either language
;;   C-c C-e   export a PDF
;;   C-c C-s   spell-check the buffer against Ksav's Hebrew and English lexicons
;;
;; The engine is started for you the first time you need it, and stopped when
;; Emacs exits.  Point it at one you are already running with
;; `ksav-server-url'.

;;; Code:

(require 'json)
(require 'url)
(require 'seq)
(require 'ksav-services)

;; `url-http' sets this in the response buffer and does not declare it, so the
;; byte compiler calls it a free variable in every package that reads a body.
;; Declared rather than silenced: the warning is right that nothing here defines
;; it, and this says where it comes from.
(defvar url-http-end-of-headers)

(defgroup ksav nil
  "Write a sefer in Emacs, typeset by Ksav."
  :group 'languages
  :prefix "ksav-")

(defcustom ksav-executable "ksav"
  "The Ksav engine binary.

Started as `ksav serve ADDRESS' when no server is already running.  Ksav is a
single self-contained binary; if it is not on `exec-path', give the full path
here."
  :type 'string)

(defcustom ksav-server-url nil
  "An engine that is already running, as \"http://127.0.0.1:7878\".

When nil, this package starts one of its own on `ksav-port' and stops it when
Emacs exits.  Set it to share one engine with a running desktop application, or
with another Emacs."
  :type '(choice (const :tag "Start one" nil) string))

(defcustom ksav-port 7879
  "The port to start an engine on.

Deliberately not 7878.  That is the port the desktop application's development
proxy expects, and quietly binding it would leave two different builds fighting
over one address with no message about it."
  :type 'integer)

(defcustom ksav-paragraph-direction 'right-to-left
  "Which way paragraphs run in `ksav-mode'.

Ksav is Hebrew-first and this is the honest default for it.  Set it to
`left-to-right' for an English document, or to nil to let Emacs decide from the
first strong character in each paragraph — which is Emacs' own default and is
wrong exactly when a Hebrew paragraph happens to begin with a command name."
  :type '(choice (const right-to-left) (const left-to-right) (const nil)))

(defcustom ksav-language "he"
  "Which language names things: \"he\" or \"en\".

Used for command names in `ksav-insert-command' and for the descriptions beside
them.  It does not change the document; a Ksav command has a name in each
language and both compile."
  :type '(choice (const "he") (const "en")))

(defcustom ksav-start-timeout 20
  "Seconds to wait for a freshly started engine to answer."
  :type 'integer)

;;;; ---------------------------------------------------------------- the engine

(defvar ksav--process nil
  "The engine this package started, if it started one.")

(defun ksav-server-address ()
  "Where the engine is, whether it is ours or somebody else's."
  (or ksav-server-url (format "http://127.0.0.1:%d" ksav-port)))

(defun ksav-running-p ()
  "Is there an engine answering at `ksav-server-address'?"
  (let ((url-request-method "GET")
        (url-show-status nil))
    (condition-case nil
        (with-current-buffer
            (url-retrieve-synchronously (ksav-server-address) t t 2)
          (prog1 t (kill-buffer)))
      (error nil))))

;;;###autoload
(defun ksav-start ()
  "Start an engine, unless one is already answering.

Returns the address it is at.  Signals an error naming `ksav-executable' when
there is no such program — which is the one thing that can go wrong here that a
reader can act on, and it must not look like a compile failure."
  (interactive)
  (cond
   ((ksav-running-p) (ksav-server-address))
   (ksav-server-url
    (user-error "Nothing is answering at %s, and `ksav-server-url' says not to start one"
                ksav-server-url))
   (t
    (unless (executable-find ksav-executable)
      (user-error "No `%s' on `exec-path' — set `ksav-executable' to the Ksav binary"
                  ksav-executable))
    (setq ksav--process
          (start-process "ksav" (get-buffer-create " *ksav engine*")
                         ksav-executable "serve"
                         (format "127.0.0.1:%d" ksav-port)))
    (set-process-query-on-exit-flag ksav--process nil)
    (let ((until (+ (float-time) ksav-start-timeout)))
      (while (and (< (float-time) until) (not (ksav-running-p)))
        (sleep-for 0.2)))
    (unless (ksav-running-p)
      (user-error "The engine did not answer within %d seconds — see ` *ksav engine*'"
                  ksav-start-timeout))
    (ksav-server-address))))

(defun ksav-stop ()
  "Stop the engine this package started.  Leaves anybody else's alone."
  (interactive)
  (when (process-live-p ksav--process)
    (delete-process ksav--process))
  (setq ksav--process nil))

(add-hook 'kill-emacs-hook #'ksav-stop)

;;;; ------------------------------------------------------------- asking for it

(defun ksav-call (service payload)
  "Ask the engine for SERVICE with PAYLOAD, an alist, and return its answer.

The answer is parsed as an alist.  SERVICE is a name from the generated
registry — `ksav-service-path' turns it into a URL and signals when it is not a
service, so a typo here is an error at the call rather than a 404 nobody reads."
  (let* ((path (ksav-service-path service))
         (method (ksav-service-method service))
         (url (concat (ksav-start) path))
         (url-request-method method)
         (url-request-extra-headers '(("Content-Type" . "application/json")))
         (url-request-data
          (when (string= method "POST")
            (encode-coding-string (json-encode payload) 'utf-8)))
         (url-show-status nil))
    (with-current-buffer (url-retrieve-synchronously url t t 120)
      (unwind-protect
          (progn
            (goto-char (point-min))
            ;; `url-http-end-of-headers' is where the body starts.  Without it
            ;; the JSON reader is handed a status line and reports a parse
            ;; error, which reads as "the engine sent nonsense" about an
            ;; entirely well-formed reply.
            (unless (and (boundp 'url-http-end-of-headers) url-http-end-of-headers)
              (error "Ksav: no reply from %s" url))
            (goto-char url-http-end-of-headers)
            (let ((body (buffer-substring-no-properties (point) (point-max))))
              (json-parse-string (decode-coding-string body 'utf-8)
                                 :object-type 'alist
                                 :array-type 'list
                                 :null-object nil
                                 :false-object nil)))
        (kill-buffer)))))

(defun ksav--refused (answer)
  "The engine's own words when ANSWER is a refusal, or nil when it is not.

Never rephrased.  Half of what an engine says is a message a writer is meant to
read — a Typst diagnostic naming a line, a service that needs the installed
application — and a friendlier sentence in front of it is one the reader cannot
search for.

A document that does not compile is **not** a refusal here, and the first draft
said it was: a failed compile answers `ok: false' with the reasons in
`diagnostics' and no `error' field, so a bare `ok: false' was reported as \"the
engine refused and said nothing about why\" — printed directly above the
diagnostics that said precisely why.  An interface contradicting itself in
adjacent lines is worse than one that says nothing, so that placeholder is now
reached only when there really is nothing else."
  (let ((ok (assoc 'ok answer))
        (err (alist-get 'error answer)))
    (cond
     (err err)
     ;; `ok' present and false.  Absent `ok' is not a refusal: `/commands'
     ;; answers with a bare array and says nothing about itself.
     ((and ok (null (cdr ok)) (null (alist-get 'diagnostics answer)))
      "the engine refused and said nothing about why")
     (t nil))))

(defun ksav--diagnostics (answer)
  "Every diagnostic in ANSWER, as lines of text."
  (mapcar (lambda (d)
            (format "%s: %s"
                    (or (alist-get 'severity d) "error")
                    (or (alist-get 'message d) "")))
          (alist-get 'diagnostics answer)))

;;;; ----------------------------------------------------------------- the page

(defconst ksav-preview-buffer "*ksav page*"
  "Where the typeset document is shown.")

(defvar-local ksav--source-buffer nil
  "The buffer a preview was made from.")

(defun ksav--pages-said (n)
  "N pages, in a sentence that agrees with itself.

One function rather than an inline `(if (= n 1) \"\" \"s\")' at each site,
because the first two sites disagreed about which words the plural reaches: one
of them produced \"1 page were typeset\", having pluralised the noun and left
the verb alone."
  (if (= n 1) "1 page was" (format "%d pages were" n)))

(defun ksav--svg-supported-p ()
  "Can this Emacs draw an SVG?"
  (and (display-graphic-p) (image-type-available-p 'svg)))

(define-derived-mode ksav-preview-mode special-mode "Ksav page"
  "The typeset document, page by page."
  (setq-local cursor-type nil)
  (setq-local truncate-lines nil))

(defun ksav--show-pages (pages source)
  "Draw PAGES — a list of SVG strings — in the preview buffer for SOURCE."
  (with-current-buffer (get-buffer-create ksav-preview-buffer)
    (let ((inhibit-read-only t))
      (erase-buffer)
      (ksav-preview-mode)
      (setq ksav--source-buffer source)
      (if (not (ksav--svg-supported-p))
          ;; Said, rather than left blank.  A terminal Emacs, or one built
          ;; without librsvg, cannot draw these — and a preview window that is
          ;; simply empty looks like a compile that produced nothing.
          (insert (format "This Emacs cannot draw SVG, so the page cannot be shown here.\n\n%s typeset.\nUse `M-x ksav-export-pdf' to write a PDF and open it.\n"
                          (ksav--pages-said (length pages))))
        (dolist (svg pages)
          (insert-image (create-image (encode-coding-string svg 'utf-8) 'svg t))
          (insert "\n\n")))
      (goto-char (point-min)))
    (current-buffer)))

;;;###autoload
(defun ksav-compile ()
  "Typeset this buffer and show the page.

Diagnostics, when there are any, go to their own buffer and name the line — the
engine reports them against the source you wrote, not against the assembled
Typst, so they are lines in this buffer."
  (interactive)
  (let* ((source (current-buffer))
         (answer (ksav-call "compile" `((body . ,(buffer-string)))))
         (refused (ksav--refused answer))
         (typeset (eq t (alist-get 'ok answer)))
         (diags (ksav--diagnostics answer))
         (pages (alist-get 'pages_svg answer)))
    ;; Three endings, and the middle one is why this is not an `if'.
    ;;
    ;;   * it compiled, with nothing to say — take the diagnostics away;
    ;;   * it compiled, *with warnings* — the page is good and the warnings are
    ;;     worth reading, so both;
    ;;   * it did not compile — the reasons, and **the last page that did**.
    ;;
    ;; That last part is the one worth stating. The first draft drew whatever
    ;; `pages_svg' held whenever there was no outright refusal, so a document
    ;; with an unclosed bracket replaced the preview with nothing and reported
    ;; "0 pages were typeset" beside a diagnostic explaining the bracket. A
    ;; writer types through broken states continuously; blanking the page at
    ;; every keystroke that has not finished yet makes the preview useless
    ;; exactly when it is being used.
    (cond
     (refused (ksav--show-trouble refused diags))
     (diags (ksav--show-trouble
             (if typeset "the document compiled, with something to say"
               "the document did not compile")
             diags))
     (t (ksav--kill-trouble)))
    (cond
     (typeset
      (display-buffer (ksav--show-pages pages source))
      (message "Ksav: %s typeset" (ksav--pages-said (length pages))))
     ((get-buffer ksav-preview-buffer)
      (message "Ksav: the document did not compile — the last page that did is still shown")))))

(defconst ksav-trouble-buffer "*ksav diagnostics*")

(defun ksav--show-trouble (headline lines)
  "Show HEADLINE and LINES in the diagnostics buffer."
  (with-current-buffer (get-buffer-create ksav-trouble-buffer)
    (let ((inhibit-read-only t))
      (erase-buffer)
      (special-mode)
      (insert headline "\n\n")
      (dolist (l lines) (insert l "\n"))
      (goto-char (point-min))))
  (display-buffer ksav-trouble-buffer))

(defun ksav--kill-trouble ()
  "Take the diagnostics buffer away once there is nothing wrong."
  (when-let ((buf (get-buffer ksav-trouble-buffer)))
    (when-let ((win (get-buffer-window buf))) (quit-window nil win))
    (kill-buffer buf)))

;;;###autoload
(defun ksav-export-pdf (file)
  "Typeset this buffer and write a PDF to FILE."
  (interactive
   (list (read-file-name "Write PDF to: " nil nil nil
                         (concat (file-name-base (or (buffer-file-name) "document")) ".pdf"))))
  (let* ((answer (ksav-call "compile" `((body . ,(buffer-string)) (want_pdf . t))))
         (refused (ksav--refused answer))
         (b64 (alist-get 'pdf_base64 answer)))
    (cond
     (refused (ksav--show-trouble refused (ksav--diagnostics answer)))
     ;; No PDF and no refusal means the document did not compile, and the
     ;; reasons are in `diagnostics'. Showing them is the whole answer; "the
     ;; engine returned no PDF" on its own is a true sentence that helps
     ;; nobody, and it was what this branch said.
     ((not (stringp b64))
      (ksav--show-trouble "the document did not compile, so there is no PDF"
                          (ksav--diagnostics answer)))
     (t
      ;; `no-conversion', or Emacs will helpfully mangle the bytes on a system
      ;; whose default coding is not binary — which produces a PDF that opens
      ;; nowhere and a bug report about the typesetter.
      (let ((coding-system-for-write 'no-conversion))
        (with-temp-file file (insert (base64-decode-string b64))))
      (message "Ksav: wrote %s" file)))))

;;;; ------------------------------------------------------------- the commands

(defun ksav-commands ()
  "Every command the engine offers, asked for rather than listed here.

This is the one registry that is *not* generated into this package, and the
difference is deliberate: the services are a contract between this code and an
engine, while the commands are a vocabulary that a running engine already
publishes.  Asking means `M-x ksav-insert-command' offers exactly what the
engine you are talking to knows, including commands added after this package
was written."
  (seq-remove (lambda (c) (eq t (alist-get 'deprecated c)))
              (ksav-call "commands" nil)))

(defun ksav--command-label (c)
  "How command C is offered, in `ksav-language'."
  (let ((he (alist-get 'he c))
        (en (alist-get 'en c)))
    (if (string= ksav-language "he") (format "%s · %s" he en) (format "%s · %s" en he))))

;;;###autoload
(defun ksav-insert-command ()
  "Insert a Ksav command, chosen by name in either language.

The command's own `insert' template carries a `|' where the caret belongs, and
that is where point is left."
  (interactive)
  (let* ((commands (ksav-commands))
         (table (mapcar (lambda (c) (cons (ksav--command-label c) c)) commands))
         (pick (completing-read "Command: " (mapcar #'car table) nil t))
         (chosen (cdr (assoc pick table)))
         (template (or (alist-get 'insert chosen) "")))
    (ksav-insert-template template)))

(defun ksav-insert-template (template)
  "Insert TEMPLATE, leaving point where its `|' is.

Exposed rather than inlined because it is what a snippet, a key binding or a
`ksav-mode' hook of your own would want, and because it is the one piece of
Ksav's insertion convention this package has to know.

Written with `substring' rather than with `string-replace', which is the
obvious spelling and is **Emacs 28**. This package declares 27.1 — that is
where `json-parse-string' arrives, and it is what Ubuntu 22.04 ships — so the
first draft was void-function on every Emacs it claimed to support and worked
on the one it was written on. The declared floor is only a claim until
something runs there; CI does, and that is how this was found."
  (let ((at (string-match-p "|" template)))
    (if (not at)
        (insert template)
      (insert (substring template 0 at))
      (save-excursion (insert (substring template (1+ at)))))))

;;;; --------------------------------------------------------------- the speller

;;;###autoload
(defun ksav-spell-buffer ()
  "Check this buffer against Ksav's Hebrew and English lexicons.

The words come back with an offset each; they are shown as a list you can click
through rather than as overlays, because the engine checks the *text* and this
buffer holds markup — a command name is not a misspelling, and pretending the
two coordinate systems are one would underline half of every document."
  (interactive)
  (let* ((answer (ksav-call "spell" `((text . ,(buffer-string)) (user_words . ""))))
         (refused (ksav--refused answer))
         (words (alist-get 'misspellings answer)))
    (cond
     (refused (user-error "Ksav: %s" refused))
     ((null words) (message "Ksav: nothing misspelled"))
     (t (ksav--show-trouble (format "%d word%s not in the lexicons"
                                    (length words) (if (= 1 (length words)) "" "s"))
                            (mapcar (lambda (w) (format "%s" (or (alist-get 'word w) w)))
                                    words))))))

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
    (define-key map (kbd "C-c C-c") #'ksav-compile)
    (define-key map (kbd "C-c C-i") #'ksav-insert-command)
    (define-key map (kbd "C-c C-e") #'ksav-export-pdf)
    (define-key map (kbd "C-c C-s") #'ksav-spell-buffer)
    (define-key map (kbd "C-c C-k") #'ksav-stop)
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
  (setq-local require-final-newline t))

;;;###autoload
(add-to-list 'auto-mode-alist '("\\.ksav\\'" . ksav-mode))

(provide 'ksav)
;;; ksav.el ends here
