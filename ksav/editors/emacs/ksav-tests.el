;;; ksav-tests.el --- Tests for ksav.el  -*- lexical-binding: t; -*-

;; SPDX-License-Identifier: MIT OR Apache-2.0

;;; Commentary:

;; Run them:
;;
;;   emacs -Q --batch -L . -l ksav.el -l ksav-tests.el \
;;         -f ert-run-tests-batch-and-exit
;;
;; Two halves, and the split is the point.
;;
;; Everything up to `ksav-live-' runs with no engine: the service table, the
;; mode, the syntax, the insertion convention, and how a refusal is read.  Those
;; are this package's own decisions and they must be checkable from a plain
;; checkout with nothing running.
;;
;; The `ksav-live-' tests need a `ksav' binary on `exec-path' and are guarded on
;; finding one.  That guard is a real skip and is declared as one — `KSAV_EMACS_LIVE=1'
;; makes the absence an *error* instead, and CI sets it, so the half of this
;; file that proves the package actually talks to the engine cannot quietly stop
;; running on the machine whose whole job is to run it.

;;; Code:

(require 'ert)
;; `cl-some' below. Required rather than left to an autoload, for the reason
;; `string-replace' is not used in `ksav.el': what happens to be loaded on the
;; Emacs a thing was written on is not what is loaded on the oldest one it
;; claims to support.
(require 'cl-lib)
(require 'ksav)

;;;; ------------------------------------------------------------- the registry

(ert-deftest ksav-services-are-the-engines ()
  "The generated table is populated and every row is well formed."
  (should (> (length ksav-services) 5))
  (dolist (row ksav-services)
    (should (= 4 (length row)))
    (should (stringp (nth 0 row)))
    (should (member (nth 1 row) '("GET" "POST")))
    (should (string-prefix-p "/" (nth 2 row)))
    ;; The engine keeps the path and the name the same word, and asserts it in
    ;; `services.rs'.  Checked here too: this client builds a URL out of one and
    ;; names the service by the other.
    (should (string= (nth 2 row) (concat "/" (nth 0 row))))))

(ert-deftest ksav-services-every-name-is-answered-once ()
  (let ((names (mapcar #'car ksav-services)))
    (should (= (length names) (length (delete-dups (copy-sequence names)))))))

(ert-deftest ksav-service-lookups ()
  (should (string= "/compile" (ksav-service-path "compile")))
  (should (string= "POST" (ksav-service-method "compile")))
  (should (string= "GET" (ksav-service-method "commands")))
  ;; The services that need the installed application say so, which is how this
  ;; client tells "cannot" from "went wrong".
  (should (ksav-service-native-p "inbox"))
  (should-not (ksav-service-native-p "compile")))

(ert-deftest ksav-a-service-nobody-answers-is-an-error ()
  "A typo in elisp is an error at the call, not a URL of nil and a 404."
  (should-error (ksav-service-path "nonesuch")))

;;;; ------------------------------------------------------------------ the mode

(ert-deftest ksav-mode-is-hebrew-first ()
  (with-temp-buffer
    (ksav-mode)
    (should (eq bidi-paragraph-direction 'right-to-left))
    (should (string= comment-start "// "))))

(ert-deftest ksav-mode-treats-hebrew-as-letters ()
  "Without this every `\\w' regexp and every word motion stops at the first
Hebrew letter — in a Hebrew-first editor."
  (with-temp-buffer
    (ksav-mode)
    (insert "ברכות")
    (goto-char (point-min))
    (forward-word)
    (should (= (point) (point-max)))))

(ert-deftest ksav-mode-knows-a-command-when-it-sees-one ()
  (with-temp-buffer
    (ksav-mode)
    (insert "#כותרת1[פרק ראשון]\n#bold[strong]\n")
    (goto-char (point-min))
    (should (re-search-forward ksav-command-regexp nil t))
    (should (string= (match-string 1) "כותרת1"))
    (should (re-search-forward ksav-command-regexp nil t))
    (should (string= (match-string 1) "bold"))))

(ert-deftest ksav-mode-colours-a-command ()
  (with-temp-buffer
    (ksav-mode)
    (insert "שלום #הדגשה[חזק]\n")
    (font-lock-ensure)
    (goto-char (point-min))
    (search-forward "הדגשה")
    (should (eq 'font-lock-keyword-face
                (get-text-property (1- (point)) 'face)))))

(ert-deftest ksav-mode-opens-a-ksav-file ()
  (should (eq 'ksav-mode (cdr (assoc "\\.ksav\\'" auto-mode-alist)))))

;;;; ------------------------------------------------- the insertion convention

(ert-deftest ksav-insert-template-leaves-point-in-the-hole ()
  "A command's `insert' carries a `|' where the caret belongs."
  (with-temp-buffer
    (ksav-insert-template "#הדגשה[|]")
    (should (string= (buffer-string) "#הדגשה[]"))
    ;; Between the brackets, which is the whole point of the marker.
    (should (string= (buffer-substring (point) (point-max)) "]"))))

(ert-deftest ksav-insert-template-with-no-marker-lands-at-the-end ()
  (with-temp-buffer
    (ksav-insert-template "#קו_מפריד")
    (should (string= (buffer-string) "#קו_מפריד"))
    (should (= (point) (point-max)))))

;;;; ------------------------------------------------------------- refusals

(ert-deftest ksav-a-refusal-keeps-the-engines-own-words ()
  "Never rephrased: the engine's sentence is the one a reader can search for."
  (should (string= "Permission denied"
                   (ksav--refused '((ok . nil) (error . "Permission denied")))))
  (should-not (ksav--refused '((ok . t) (pages_svg . ()))))
  ;; `/commands' answers with a bare list and says nothing about itself; an
  ;; absent `ok' is not a refusal.
  (should-not (ksav--refused '(((he . "הדגשה"))))))

(ert-deftest ksav-a-document-that-did-not-compile-is-not-a-wordless-refusal ()
  "A failed compile answers `ok: false' with the reasons in `diagnostics' and
no `error' field.  Read as a refusal it printed \"the engine refused and said
nothing about why\" directly above the diagnostics that said why — an interface
contradicting itself in adjacent lines."
  (let ((failed '((ok . nil)
                  (diagnostics . (((severity . "error") (message . "A bracket isn't closed")))))))
    (should-not (ksav--refused failed))
    (should (equal '("error: A bracket isn't closed") (ksav--diagnostics failed))))
  ;; …and a refusal with genuinely nothing in it still says so, because silence
  ;; is the one thing that must never be shown as success.
  (should (ksav--refused '((ok . nil)))))

(ert-deftest ksav-diagnostics-are-read-out-with-their-severity ()
  (should (equal '("error: line 3")
                 (ksav--diagnostics '((diagnostics . (((severity . "error") (message . "line 3")))))))))

(ert-deftest ksav-a-count-of-pages-agrees-with-itself ()
  "One page is singular in both halves of the sentence.  Written inline at two
sites, one of them produced \"1 page were typeset\"."
  (should (string= "1 page was" (ksav--pages-said 1)))
  (should (string= "3 pages were" (ksav--pages-said 3)))
  (should (string= "0 pages were" (ksav--pages-said 0))))

;;;; ---------------------------------------------------------------- with an engine

(defun ksav-tests--engine-wanted-p ()
  "Should the live tests run, and is that a choice or a requirement?

Returns t when there is an engine to talk to.  Signals when there is not *and*
`KSAV_EMACS_LIVE' is set — which is what CI does, so the half of this file that
proves this package talks to a real engine cannot quietly stop running on the
one machine whose job is to run it."
  (let ((have (and (executable-find ksav-executable) t)))
    (when (and (not have) (getenv "KSAV_EMACS_LIVE"))
      (error "KSAV_EMACS_LIVE is set and there is no `%s' on exec-path" ksav-executable))
    have))

(defmacro ksav-tests--with-engine (&rest body)
  "Run BODY against a real engine, or skip when there is none."
  (declare (indent 0))
  `(if (not (ksav-tests--engine-wanted-p))
       (ert-skip "no ksav binary on exec-path")
     (unwind-protect (progn ,@body) (ksav-stop))))

(ert-deftest ksav-live-compiles-a-document ()
  (ksav-tests--with-engine
    (with-temp-buffer
      (insert "#כותרת1[פרק ראשון]\n\nשלום עולם.\n")
      (let ((answer (ksav-call "compile" `((body . ,(buffer-string))))))
        (should-not (ksav--refused answer))
        (should (= 1 (length (alist-get 'pages_svg answer))))
        ;; A real page, from a real Typst layout — not an empty string that
        ;; would draw as nothing and look like a preview that failed.
        (should (string-match-p "<svg" (car (alist-get 'pages_svg answer))))))))

(ert-deftest ksav-live-reports-a-broken-document-rather-than-a-blank-page ()
  (ksav-tests--with-engine
    (let ((answer (ksav-call "compile" '((body . "#כותרת1[לא נסגר")))))
      (should (or (ksav--refused answer) (ksav--diagnostics answer)))
      ;; And the diagnostic says something. A refusal with no words in it is the
      ;; failure this whole product is being audited for.
      (should (cl-some (lambda (l) (> (length l) 8)) (ksav--diagnostics answer))))))

(ert-deftest ksav-live-keeps-the-last-good-page-while-a-document-is-broken ()
  "A writer types through broken states continuously.

Blanking the preview at every keystroke that has not finished yet makes it
useless exactly when it is being used — which is what the first draft did: it
drew whatever `pages_svg' held whenever there was no outright refusal, so an
unclosed bracket emptied the page and reported \"0 pages were typeset\" beside a
diagnostic explaining the bracket."
  (ksav-tests--with-engine
    (when (get-buffer ksav-preview-buffer) (kill-buffer ksav-preview-buffer))
    (with-temp-buffer
      (ksav-mode)
      (insert "#כותרת1[פרק ראשון]\n\nשלום.\n")
      (ksav-compile))
    (should (get-buffer ksav-preview-buffer))
    (let ((good (with-current-buffer ksav-preview-buffer (buffer-string))))
      (with-temp-buffer
        (ksav-mode)
        (insert "#כותרת1[לא נסגר")
        (ksav-compile))
      ;; The diagnostics are shown…
      (should (get-buffer ksav-trouble-buffer))
      (should (with-current-buffer ksav-trouble-buffer
                (save-excursion (goto-char (point-min)) (search-forward "did not compile" nil t))))
      ;; …and the page is untouched.
      (should (string= good (with-current-buffer ksav-preview-buffer (buffer-string)))))))

(ert-deftest ksav-live-takes-the-diagnostics-away-once-it-compiles ()
  "A stale error buffer beside a good page is a report on a document that no
longer exists."
  (ksav-tests--with-engine
    (with-temp-buffer
      (ksav-mode)
      (insert "#כותרת1[לא נסגר")
      (ksav-compile))
    (should (get-buffer ksav-trouble-buffer))
    (with-temp-buffer
      (ksav-mode)
      (insert "שלום.\n")
      (ksav-compile))
    (should-not (get-buffer ksav-trouble-buffer))))

(ert-deftest ksav-live-offers-the-engines-own-vocabulary ()
  (ksav-tests--with-engine
    (let ((commands (ksav-commands)))
      (should (> (length commands) 20))
      (dolist (c commands)
        (should (stringp (alist-get 'he c)))
        (should (stringp (alist-get 'en c))))
      ;; Deprecated commands still compile and are no longer offered — the
      ;; engine's own rule, and this client has to keep it or it becomes the one
      ;; surface still pointing at them.
      (should-not (cl-some (lambda (c) (eq t (alist-get 'deprecated c))) commands)))))

(ert-deftest ksav-live-spells-hebrew ()
  (ksav-tests--with-engine
    (let ((answer (ksav-call "spell" '((text . "שלום עולם קשקשתיבלגז") (user_words . "")))))
      (should-not (ksav--refused answer))
      (should (alist-get 'misspellings answer)))))

(ert-deftest ksav-live-writes-a-pdf ()
  (ksav-tests--with-engine
    (let ((file (make-temp-file "ksav-emacs-" nil ".pdf")))
      (unwind-protect
          (with-temp-buffer
            (insert "שלום.\n")
            (ksav-export-pdf file)
            (should (file-exists-p file))
            ;; The bytes, not the size: a PDF written through a text coding
            ;; system is the right length and opens nowhere.
            (with-temp-buffer
              (set-buffer-multibyte nil)
              (let ((coding-system-for-read 'no-conversion))
                (insert-file-contents-literally file))
              (should (string-prefix-p "%PDF" (buffer-string)))))
        (ignore-errors (delete-file file))))))

(provide 'ksav-tests)
;;; ksav-tests.el ends here
