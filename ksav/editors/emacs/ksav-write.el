;;; ksav-write.el --- Commands, templates, sefarim and the speller  -*- lexical-binding: t; -*-

;; Copyright (C) 2026 The Ksav Authors
;; SPDX-License-Identifier: MIT OR Apache-2.0

;;; Commentary:

;; What the engine knows about writing, as doors in Emacs: the command
;; vocabulary, the document templates, the catalogue of sefarim that citation
;; autocomplete is made of, and the two halves of the speller.
;;
;; None of these lists is written down here.  Every one of them is asked for at
;; run time, so an engine with a command, a template or a sefer this package has
;; never heard of offers it anyway.  That is not a convenience: this repository
;; has paid five times, in five languages, for a client keeping its own copy of
;; something the engine already knew.

;;; Code:

(require 'seq)
(require 'subr-x)
(require 'thingatpt)
(require 'ksav-engine)

;; The mode lives in the front door, which requires this file: a `require' back
;; the other way is a cycle, and elisp has no way out of one.
(declare-function ksav-mode "ksav" ())

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

(defun ksav-command-named (name)
  "The command whose English name is NAME, or nil.

By the English name because that is the one this package can spell as a literal
without putting Hebrew markup in elisp — and because it is the name that does
not change when a Hebrew one is improved."
  (seq-find (lambda (c) (equal name (alist-get 'en c))) (ksav-commands)))

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

;;;; ------------------------------------------------------------ the templates

(defun ksav-templates ()
  "Every document template the engine carries."
  (ksav-call "templates" nil))

(defun ksav--template-label (tpl)
  "How template TPL is offered, in `ksav-language'."
  (let ((he (alist-get 'he tpl))
        (en (alist-get 'en tpl))
        (desc (alist-get (if (string= ksav-language "he") 'desc_he 'desc_en) tpl)))
    (format "%s · %s%s"
            (if (string= ksav-language "he") he en)
            (if (string= ksav-language "he") en he)
            (if (and desc (not (string-empty-p desc))) (concat " — " desc) ""))))

;;;###autoload
(defun ksav-new-from-template ()
  "Start a new document from one of the engine's templates.

A buffer, not a file: naming it is the writer's business and a template is a
starting point rather than a document.  Save it wherever you keep sefarim.

The direction comes with it.  A template declares the language its body is
written in, and an English letter dropped into a right-to-left buffer is set
flush right, which is nobody's letter."
  (interactive)
  (let* ((templates (ksav-templates))
         (table (mapcar (lambda (tpl) (cons (ksav--template-label tpl) tpl)) templates))
         (pick (completing-read "Template: " (mapcar #'car table) nil t))
         (chosen (cdr (assoc pick table)))
         (body (or (alist-get 'body chosen) ""))
         (name (or (alist-get (if (string= ksav-language "he") 'he 'en) chosen) "document"))
         (buffer (generate-new-buffer (format "*ksav: %s*" name))))
    (with-current-buffer buffer
      (insert body)
      (goto-char (point-min))
      ;; `ksav-mode' after the text, so `font-lock' has something to colour and
      ;; the direction below is not undone by the mode's own default.
      (ksav-mode)
      (when (equal (alist-get 'lang chosen) "en")
        (setq-local bidi-paragraph-direction 'left-to-right))
      (set-buffer-modified-p nil))
    (pop-to-buffer buffer)))

;;;; -------------------------------------------------------------- the sefarim

(defvar ksav--sefarim nil
  "The engine's catalogue of sefarim, once asked for.

Cached for the session because it is compiled into the engine binary: it cannot
change while that engine is running, and completion asks for it on a keystroke.
`ksav-stop' does not clear it, deliberately — pointing Emacs at a *different*
engine mid-session is the one case where this is stale, and it is rarer than
the case where an HTTP request per keypress makes completion unusable.  Set it
to nil to ask again.")

(defun ksav-sefarim ()
  "The catalogue of sefarim: canonical names, kinds, and the aliases of each."
  (or ksav--sefarim
      (setq ksav--sefarim (alist-get 'sefarim (ksav-call "sefarim" nil)))))

(defun ksav--sefer-names ()
  "Every name a sefer can be typed as, each mapped to its canonical spelling.

The aliases are the point of the table.  A sefer written as it is commonly
abbreviated is a sefer the source index files somewhere else, so what completion
inserts is always the canonical name — which is the same decision the desktop
application's autocomplete makes, made once, in the engine."
  (let (names)
    (dolist (s (ksav-sefarim) (nreverse names))
      (let ((canonical (alist-get 'canonical s)))
        (when canonical
          (push (cons canonical canonical) names)
          (dolist (alias (alist-get 'aliases s))
            (unless (equal alias canonical)
              (push (cons alias canonical) names))))))))

;;;###autoload
(defun ksav-insert-sefer ()
  "Insert the name of a sefer, chosen from the engine's catalogue.

Type it any way it is written — an abbreviation, a nickname — and the canonical
name is what lands in the document, because that is the name `#מפתח_מקורות'
files it under."
  (interactive)
  (let* ((table (ksav--sefer-names))
         (pick (completing-read "Sefer: " (mapcar #'car table) nil t)))
    (insert (or (cdr (assoc pick table)) pick))))

(defun ksav-sefer-completion-at-point ()
  "Offer sefer names inside a string, for `completion-at-point-functions'.

Inside a string and not inside a *citation*, which would be the narrower claim
and a worse one: it would mean this package deciding which of the engine's
commands take a sefer name, which is a fact about the engine that would then be
written down here and go stale the day a command is added.  A quoted string is
where a name goes in every one of them, `:exclusive' is `no', so anything else
offering completions still gets its turn, and an offer nobody wanted costs a
keystroke to dismiss."
  (let ((start (nth 8 (syntax-ppss))))
    (when (and start (eq (char-after start) ?\"))
      (let ((from (1+ start))
            (to (point)))
        (when (>= to from)
          (list from to
                (completion-table-dynamic (lambda (_) (mapcar #'car (ksav--sefer-names))))
                :exclusive 'no
                :annotation-function
                (lambda (name)
                  (let ((canonical (cdr (assoc name (ksav--sefer-names)))))
                    (if (equal canonical name) "" (concat " → " canonical))))
                :exit-function
                ;; An alias is replaced by the name it stands for. Completing
                ;; to the alias and leaving it would put a name in the document
                ;; that the source index has to guess about.
                (lambda (name status)
                  (when (eq status 'finished)
                    (let ((canonical (cdr (assoc name (ksav--sefer-names)))))
                      (when (and canonical (not (equal canonical name)))
                        (delete-char (- (length name)))
                        (insert canonical)))))))))))

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

(defun ksav-suggestions (word)
  "What the engine would put in place of WORD."
  (alist-get 'suggestions (ksav-call "suggest" `((word . ,word) (user_words . "")))))

;;;###autoload
(defun ksav-correct-word ()
  "Replace the word at point with one the engine suggests.

Asked for one word at the moment it is asked about, rather than fetched for
every misspelling in the document: suggestions are the expensive half of a
speller — each one is a walk of both lexicons — and a buffer with forty unknown
words would pay for forty of them to show a list nobody opened."
  (interactive)
  (let* ((bounds (bounds-of-thing-at-point 'word))
         (word (and bounds (buffer-substring-no-properties (car bounds) (cdr bounds)))))
    (unless word (user-error "Ksav: point is not on a word"))
    (let ((suggestions (ksav-suggestions word)))
      (if (null suggestions)
          ;; Two different silences, and the reader can tell them apart: a word
          ;; the lexicons know needs no correction, and a word so far from
          ;; anything that nothing was near it. Neither is an error.
          (message "Ksav: nothing to suggest for %s" word)
        (let ((pick (completing-read (format "Replace %s with: " word) suggestions nil t)))
          (delete-region (car bounds) (cdr bounds))
          (insert pick))))))

(provide 'ksav-write)
;;; ksav-write.el ends here
