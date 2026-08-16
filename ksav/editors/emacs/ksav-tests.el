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

(ert-deftest ksav-every-service-has-a-door ()
  "Every service in the registry is asked for somewhere in this package.

The claim the whole of this package's last revision failed: it reached three of
sixteen services, and a reader had no way to tell a thing Ksav cannot do from a
thing Emacs was never taught to ask for.  `app/test/emacs.test.mjs' makes the
same check by reading the source, which is the half that can run with no Emacs;
this one is made from inside a loaded package, where a name is a name rather
than a match in a file."
  (let ((asked (ksav-tests--services-asked-for)))
    (dolist (row ksav-services)
      (should (member (car row) asked)))))

(defun ksav-tests--services-asked-for ()
  "Every service name this package passes to `ksav-call' or `ksav-ask'.

Read out of the sources rather than out of the loaded functions, because a
service name in elisp is a literal string inside a compiled body and there is
no supported way to ask a function what strings it holds."
  (let ((here (or (and load-file-name (file-name-directory load-file-name))
                  default-directory))
        (found '()))
    (dolist (file (directory-files here t "\\`ksav.*\\.el\\'") found)
      (unless (string-match-p "ksav-tests\\.el\\'" file)
        (with-temp-buffer
          (insert-file-contents file)
          (goto-char (point-min))
          (while (re-search-forward "(ksav-\\(?:call\\|ask\\) +\"\\([^\"]+\\)\"" nil t)
            (push (match-string 1) found)))))))

(ert-deftest ksav-a-refusal-from-a-service-that-needs-the-machine-is-not-a-fault ()
  "The registry's fourth column, finally read by something.

Emacs already has the two signals this distinction needs: a `user-error' is a
state the reader is in and prints one line, an `error' is a fault and offers a
backtrace.  A service that needs the installed application can be refused
because Girsa is not open — which is not a bug in a typesetter, and used to be
reported as one."
  (cl-letf (((symbol-function 'ksav-call)
             (lambda (&rest _) '((ok . nil) (error . "Girsa is not open")))))
    ;; `inbox' needs the machine…
    (should-error (ksav-ask "inbox" nil) :type 'user-error)
    ;; …and `compile' does not, so a refusal from it is a fault.
    (should-error (ksav-ask "compile" nil) :type 'error :exclude-subtypes t))
  ;; And an answer that is not a refusal comes straight back.
  (cl-letf (((symbol-function 'ksav-call) (lambda (&rest _) '((ok . t) (told . t)))))
    (should (eq t (alist-get 'told (ksav-ask "saved-here" nil))))))

;;;; ------------------------------------------------------------------- git

(ert-deftest ksav-git-operations-are-the-engines ()
  (should (> (length ksav-git-operations) 10))
  (should (member "status" ksav-git-operations))
  (should (ksav-git-operation-p "commit"))
  (should-not (ksav-git-operation-p "rebase")))

(ert-deftest ksav-git-every-operation-says-what-it-wants ()
  "The one hand-written table in this package, held to a generated one.

`ksav-git-arguments' cannot be generated — the engine publishes the list of
operations and not what each of them reads off the request — so it is checked
instead.  An operation added in Rust and not given a row here would otherwise be
offered by `ksav-git' and then refused for want of an argument nobody was asked
for."
  (dolist (op ksav-git-operations)
    (should (assoc op ksav-git-arguments))
    (dolist (arg (cdr (assoc op ksav-git-arguments)))
      ;; Every argument has a prompt, or `ksav-git' would ask for it with nil.
      (should (stringp (alist-get arg ksav-git-prompts)))))
  ;; And nothing in the table is an operation the engine does not have.
  (dolist (row ksav-git-arguments)
    (should (member (car row) ksav-git-operations)))
  ;; Every flag is an argument something actually asks for.
  (dolist (flag ksav-git-flags)
    (should (cl-some (lambda (row) (memq flag (cdr row))) ksav-git-arguments))))

(ert-deftest ksav-git-refuses-an-operation-the-engine-does-not-have ()
  (should-error (ksav-git--call "rebase")))

(ert-deftest ksav-git-reads-an-answer-of-any-shape ()
  "One reader for eighteen answers, so a new operation prints something useful
on the day it arrives rather than nothing."
  (let ((lines (ksav-git--lines
                '((ok . t) (git . "2.43.0") (root . "/tmp/sefer") (branch . "main")
                  (ahead . 2) (behind . 0)
                  (who . ((name . "A Writer") (email . "a@example.com")))
                  (this . ((tracked . t) (staged . ".") (worktree . "M")))
                  (commits . (((short . "abc1234") (author . "A Writer")
                               (subject . "A first siman"))))
                  (said . "Everything up-to-date")))))
    (should (cl-some (lambda (l) (string-match-p "git 2\\.43\\.0" l)) lines))
    (should (cl-some (lambda (l) (string-match-p "2 to push" l)) lines))
    (should (cl-some (lambda (l) (string-match-p "A first siman" l)) lines))
    ;; git's own words, never rephrased.
    (should (cl-some (lambda (l) (string-match-p "Everything up-to-date" l)) lines))))

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

(ert-deftest ksav-a-diagnostic-says-where-it-is ()
  "The engine computes a line, a column, the command and a suggestion for every
diagnostic — the browser editor puts a mark in its gutter from exactly those —
and this printed the severity and the message and dropped the rest.  So a writer
with a three-hundred-line sefer read \"the command here is missing an argument\"
and went looking by eye.

The shape is the one `compilation-mode` and `next-error` already walk."
  (let ((buffer-file-name "/seforim/kuntres.ksav"))
    (should (equal '("kuntres.ksav:5:2: error: חסר ארגומנט [#סעיף]")
                   (ksav--diagnostics
                    '((diagnostics . (((severity . "error")
                                       (message . "חסר ארגומנט")
                                       (line . 5) (column . 2)
                                       (about . "#סעיף")))))))))
  ;; A misspelling carries the name it meant, which is the whole value of the
  ;; field and reached nobody outside the browser.
  (let ((buffer-file-name "/seforim/kuntres.ksav"))
    (should (equal '("kuntres.ksav:1: error: אין פקודה — did you mean #כותרת1?")
                   (ksav--diagnostics
                    '((diagnostics . (((severity . "error")
                                       (message . "אין פקודה")
                                       (line . 1)
                                       (did_you_mean . "כותרת1")))))))))
  ;; …and a diagnostic with nowhere to point invents nothing. A position that is
  ;; not a position sends the reader to a line with nothing wrong with it.
  (should (equal '("error: אין קובץ")
                 (ksav--diagnostics
                  '((diagnostics . (((severity . "error") (message . "אין קובץ"))))))))
  ;; A line out of an included document names that document rather than the
  ;; buffer, which is the reason the engine computes the field at all.
  (let ((buffer-file-name "/seforim/kuntres.ksav"))
    (should (equal '("perek-b.ksav:7:3: error: משהו")
                   (ksav--diagnostics
                    '((diagnostics . (((severity . "error") (message . "משהו")
                                       (line . 7) (column . 3)
                                       (file . "perek-b.ksav"))))))))))

(ert-deftest ksav-a-count-of-pages-agrees-with-itself ()
  "One page is singular in both halves of the sentence.  Written inline at two
sites, one of them produced \"1 page were typeset\"."
  (should (string= "1 page was" (ksav--pages-said 1)))
  (should (string= "3 pages were" (ksav--pages-said 3)))
  (should (string= "0 pages were" (ksav--pages-said 0))))

;;;; ------------------------------------------------------------- the page

(ert-deftest ksav-a-page-is-measured-in-its-own-coordinates ()
  "The `viewBox' is Typst points, which is what `jump' and `reveal' speak.

Without it a click would have to be converted through the window size, the
zoom, and whatever Emacs decided to scale the image to — three numbers, any one
of which can be wrong on its own."
  (let ((box (ksav--view-box "<svg xmlns=\"…\" viewBox=\"0 0 595.28 841.89\" width=\"100\">")))
    (should box)
    (should (< (abs (- (car box) 595.28)) 0.01))
    (should (< (abs (- (cdr box) 841.89)) 0.01)))
  ;; A page with no box is not a crash: it is a page that cannot be clicked on.
  (should-not (ksav--view-box "<svg width=\"100\"></svg>")))

(ert-deftest ksav-a-mark-goes-inside-the-page ()
  "Emacs can overlay an image and cannot overlay a place *within* one, so the
mark is drawn into the SVG in the coordinates the answer came back in."
  (let ((marked (ksav--svg-marked "<svg viewBox=\"0 0 10 10\"><g/></svg>" 100 200)))
    (should (string-match-p "<rect" marked))
    (should (string-suffix-p "</svg>" marked))
    ;; Inside the page, not appended after it.
    (should (< (string-match-p "<rect" marked) (string-match-p "</svg>" marked))))
  ;; Something that is not an SVG comes back untouched rather than corrupted.
  (should (string= "not a page" (ksav--svg-marked "not a page" 1 1))))

;;;; -------------------------------------------------------------- the sefarim

(defmacro ksav-tests--with-catalogue (&rest body)
  "Run BODY with a small, known sefarim catalogue in place of the engine's."
  (declare (indent 0))
  `(let ((ksav--sefarim '(((canonical . "בבא מציעא") (kind . "shas") (order . 30)
                           (aliases . ("ב\"מ" "בבא מציעה")))
                          ((canonical . "שולחן ערוך") (kind . "posek") (order . 90)
                           (aliases . ("שו\"ע"))))))
     ,@body))

(ert-deftest ksav-an-alias-completes-to-the-name-the-index-files-it-under ()
  "The whole value of the catalogue.  A sefer written as it is abbreviated is a
sefer the source index files somewhere else."
  (ksav-tests--with-catalogue
    (let ((names (ksav--sefer-names)))
      (should (equal "בבא מציעא" (cdr (assoc "ב\"מ" names))))
      (should (equal "בבא מציעא" (cdr (assoc "בבא מציעא" names))))
      (should (equal "שולחן ערוך" (cdr (assoc "שו\"ע" names)))))))

(ert-deftest ksav-sefer-completion-is-offered-inside-a-string-and-not-outside ()
  (ksav-tests--with-catalogue
    (with-temp-buffer
      (ksav-mode)
      (insert "#ציון_מקור(\"בבא")
      (should (ksav-sefer-completion-at-point))
      ;; …and the same buffer with point outside the string offers nothing, so
      ;; this never fights with whatever else the writer has on TAB.
      (insert "\")")
      (should-not (ksav-sefer-completion-at-point)))))

;;;; ------------------------------------------------------------------- the mode

(ert-deftest ksav-mode-wires-up-the-catalogue-and-the-library ()
  "Two hooks, both of which are the only way their feature is ever reached."
  (with-temp-buffer
    (ksav-mode)
    (should (memq #'ksav-sefer-completion-at-point completion-at-point-functions))
    (should (memq #'ksav--tell-girsa-on-save after-save-hook))))

(ert-deftest ksav-mode-binds-a-key-for-every-part-of-the-product ()
  "Not a count: the commands that would otherwise be reachable only by somebody
who read the source."
  (dolist (command '(ksav-compile ksav-export-pdf ksav-export-typst
                     ksav-new-from-template ksav-insert-command ksav-insert-sefer
                     ksav-spell-buffer ksav-correct-word ksav-reveal
                     ksav-inbox ksav-yank-source ksav-mekoros ksav-search-in-girsa
                     ksav-linkify ksav-refresh-sources
                     ksav-git-status ksav-git-commit ksav-git-log ksav-git))
    (should (where-is-internal command ksav-mode-map))))

(ert-deftest ksav-telling-girsa-needs-no-engine-of-its-own ()
  "A courtesy errand must not boot a typesetter.

`ksav-tell-girsa-saved' runs from `after-save-hook', and going through
`ksav-call' would start an engine on the first save of any `.ksav' file — a
hundred megabytes of Typst, to deliver a message that nothing is listening for."
  (let ((called nil))
    (cl-letf (((symbol-function 'ksav-running-p) (lambda () nil))
              ((symbol-function 'ksav-call) (lambda (&rest _) (setq called t) nil)))
      (with-temp-buffer
        (setq buffer-file-name "/tmp/a-sefer.ksav")
        (ksav-tell-girsa-saved)
        (set-buffer-modified-p nil))
      (should-not called))))

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

(ert-deftest ksav-live-assembles-without-laying-anything-out ()
  "`assemble' is the `format!' a compile does before the layout starts.

Asked for through `compile' it would cost a full typesetting run and a base64
PDF to obtain a string that was ready before either began."
  (ksav-tests--with-engine
    (let* ((answer (ksav-call "assemble" '((body . "#כותרת1[פרק ראשון]\n\nשלום.\n"))))
           (source (alist-get 'typst_source answer)))
      (should (stringp source))
      ;; The prelude and the writer's words, in one string.
      (should (> (length source) 100))
      (should (string-match-p "פרק ראשון" source))
      ;; And no pages: nothing was laid out.
      (should-not (alist-get 'pages_svg answer)))))

(ert-deftest ksav-live-writes-the-typst-source-as-utf-8 ()
  "The bytes, not the length.

Emacs picks a coding system for a new file from the locale, and a buffer of
Hebrew is not representable in a Latin-1 one — so an Emacs on such a machine
stops in the middle of an export to ask which coding system to use, and a batch
one fails reading from stdin.  The same trap as writing a PDF, one file over."
  (ksav-tests--with-engine
    (let ((file (make-temp-file "ksav-emacs-" nil ".typ")))
      (unwind-protect
          (with-temp-buffer
            (insert "#כותרת1[פרק ראשון]\n\nשלום.\n")
            (ksav-export-typst file)
            (should (file-exists-p file))
            (with-temp-buffer
              (set-buffer-multibyte nil)
              (let ((coding-system-for-read 'no-conversion))
                (insert-file-contents-literally file))
              ;; ש is D7 A9 in UTF-8, and one unrepresentable byte in Latin-1.
              (should (string-match-p "\xd7\xa9" (buffer-string)))))
        (ignore-errors (delete-file file))))))

(ert-deftest ksav-live-goes-from-the-text-to-the-page-and-back ()
  "The two directions agree about where a line of the document is.

Checked as *near*, not as *equal*, and the difference is a fact about the two
questions rather than a slack tolerance.  `reveal' answers where a place in the
source is, and a cursor position is a zero-width place between glyphs — at
column 1 of a right-to-left line it is the outer edge of the run.  `jump'
answers what is *under* a point, which needs a glyph to be there.  Handing the
first answer straight to the second lands just outside the text and is told,
correctly, that there is nothing there.

So what is asserted is what the pair is for: a click within a glyph's width of
where `reveal' pointed comes back with the line `reveal' was asked about.  A
desynchronisation worth catching — the wrong page, the wrong line, a stale
layout — moves that answer far further than a glyph.

Worth writing down while it is fresh: `reveal' gives the same point for every
column of a line, so it is line-granular in this document shape whatever the
column says.  That is `typst-ide''s own resolution and not something this
package can improve on from here."
  (ksav-tests--with-engine
    (let* ((body "#כותרת1[פרק ראשון]\n\nשורה ראשונה.\n\nשורה שניה.\n")
           (points (alist-get 'points (ksav-call "reveal" `((body . ,body)
                                                            (line . 3)
                                                            (column . 1))))))
      (should points)
      (let* ((at (car points))
             (page (alist-get 'page at))
             (x (alist-get 'x_pt at))
             (y (alist-get 'y_pt at))
             (found '()))
        (should (equal 0 page))
        (dolist (dx '(-14 -8 -4 4 8 14))
          (dolist (dy '(-4 0 4))
            (let ((back (ksav-call "jump" `((body . ,body) (page . ,page)
                                            (x_pt . ,(+ x dx)) (y_pt . ,(+ y dy))))))
              (when (alist-get 'line back)
                (push (alist-get 'line back) found)))))
        (should found)
        ;; Every hit near that point is the line that was asked about — not
        ;; merely "some line", which a wrong-by-one-line answer would satisfy.
        (should (equal '(3) (delete-dups (sort found #'<))))))))

(ert-deftest ksav-live-offers-the-engines-templates ()
  (ksav-tests--with-engine
    (let ((templates (ksav-templates)))
      (should (> (length templates) 3))
      (dolist (tpl templates)
        (should (stringp (alist-get 'he tpl)))
        (should (stringp (alist-get 'en tpl)))
        (should (member (alist-get 'lang tpl) '("he" "en")))
        ;; A template with no body is a menu entry that opens an empty buffer.
        (should (> (length (alist-get 'body tpl)) 0))))))

(ert-deftest ksav-live-knows-the-sefarim-and-their-aliases ()
  (ksav-tests--with-engine
    (let ((ksav--sefarim nil))
      (let ((catalogue (ksav-sefarim)))
        (should (> (length catalogue) 20))
        (let ((names (ksav--sefer-names)))
          ;; Every alias resolves to a canonical name that is itself in the
          ;; table — an alias pointing at a sefer nobody has is a completion
          ;; that inserts a name the source index cannot file.
          (dolist (row names)
            (should (assoc (cdr row) names))))))))

(ert-deftest ksav-live-suggests-a-correction ()
  (ksav-tests--with-engine
    ;; A word one letter away from a real one, so there is something to say.
    (let ((suggestions (ksav-suggestions "שלוס")))
      (should (listp suggestions)))))

(ert-deftest ksav-live-git-answers-about-a-document ()
  "A repository made for the occasion, so this says something on any machine.

The engine runs the git that is already there — there is no library linked in —
so a test that only ran inside Ksav's own checkout would be a test of Ksav's own
checkout."
  (ksav-tests--with-engine
    (let* ((dir (make-temp-file "ksav-git-" t))
           (file (expand-file-name "sefer.ksav" dir)))
      (unwind-protect
          (with-temp-buffer
            (setq buffer-file-name file)
            (insert "שלום.\n")
            ;; `utf-8-unix', or an Emacs whose locale is not UTF-8 stops to ask
            ;; which coding system can hold these letters — a question with
            ;; nobody to answer it in batch.  The same trap `ksav-export-typst'
            ;; has to avoid, found here first.
            (let ((coding-system-for-write 'utf-8-unix))
              (write-region (point-min) (point-max) file nil 'silent))
            ;; Not in a repository yet, and the answer says which of the three
            ;; things is missing rather than failing.
            (let ((before (ksav-git--call "status")))
              (should (alist-get 'git before))
              (should-not (alist-get 'root before)))
            (ksav-git--call "init")
            (let ((after (ksav-git--call "status")))
              (should (alist-get 'root after))
              (should (alist-get 'this after))
              ;; A file that has never been committed says so, which is a
              ;; different answer from "unchanged".
              (should-not (eq t (alist-get 'tracked (alist-get 'this after)))))
            ;; The buffer is visiting a file and `with-temp-buffer' kills it on
            ;; the way out, which asks "modified; kill anyway?" — a question
            ;; with nobody to answer it in batch, and a test that fails with
            ;; `end-of-file' about stdin.
            (set-buffer-modified-p nil))
        (ignore-errors (delete-directory dir t))))))

(ert-deftest ksav-live-every-errand-answers-or-says-why ()
  "The six services that need the library beside Ksav, with no library there.

This is the state almost every reader is in — Girsa closed, or not installed —
and what it must never produce is silence.  Each of these either answers or
signals a `user-error' with words in it: *broken and unannounced* is the one
outcome that is worse than either."
  (ksav-tests--with-engine
    (dolist (errand '(("inbox" . nil)
                      ("clipboard-source" . nil)
                      ("mekoros" . ((phrase . "בראשית ברא")))
                      ("linkify" . ((text . "עיין בבא מציעא נט.")))
                      ("refresh" . ((markup . "שלום.\n")))
                      ("saved-here" . ((path . "/tmp/a-sefer.ksav")))))
      (let* ((name (car errand))
             (said nil))
        (should (ksav-service-native-p name))
        (condition-case err
            (ksav-ask name (cdr errand))
          (user-error (setq said (cadr err))))
        (when said
          ;; A refusal with nothing in it is the failure this whole product is
          ;; being audited for.
          (should (> (length said) 10)))))))

;;;; --------------------------------------------------------- getting an engine

(ert-deftest ksav-release-knows-this-machine ()
  "Every machine the tests run on is one Ksav publishes an engine for.

Not a tautology: the table lists four, and CI runs on the one this most needs
to be right about.  A row that stopped matching would send `ksav-start' down
the \"Ksav publishes none for your platform\" path on a platform it publishes
for, which is a refusal a reader would believe."
  (let ((row (ksav-release-this-machine)))
    (should row)
    (should (stringp (ksav-release-asset row)))
    (should (member (ksav-release-binary row) '("ksav" "ksav.exe")))))

(ert-deftest ksav-release-every-row-is-well-formed ()
  (should (>= (length ksav-release-targets) 4))
  (dolist (row ksav-release-targets)
    (should (stringp (nth 0 row)))
    (should (symbolp (nth 1 row)))
    (should (consp (nth 2 row)))
    (should (string-prefix-p "ksav-engine-" (ksav-release-asset row)))))

(ert-deftest ksav-release-url-is-the-newest-unless-a-tag-is-named ()
  "No tag means the newest release; a tag means that one.

Both spellings are GitHub's and they are not interchangeable — `latest/download'
has no tag in it and `download/TAG' has no `latest'.  Getting this wrong is a
404 at the one moment a new user is deciding whether this works."
  (let ((row (car ksav-release-targets)))
    (should (string-match-p "/releases/latest/download/" (ksav-release-url row nil)))
    (should (string-match-p "/releases/download/v9\\.9\\.9/" (ksav-release-url row "v9.9.9")))
    (should (string-suffix-p (ksav-release-asset row) (ksav-release-url row nil)))))

(ert-deftest ksav-with-no-engine-anywhere-the-message-names-the-command ()
  "The one message a reader with nothing installed will ever see.

It used to say \"set `ksav-executable' to the Ksav binary\", which is advice
about a variable given to the one person certain not to have a file to put in
it — there was no `ksav' binary published anywhere, for anybody, on any
platform.  True, and useless."
  (let ((ksav-executable "ksav-no-such-program-anywhere")
        (ksav-install-directory "/nonexistent/ksav")
        (ksav-server-url nil))
    (should-not (ksav-engine-program))
    (let ((message (cadr (should-error (ksav-start) :type 'user-error))))
      (should (string-match-p "ksav-install-engine" message)))))

(ert-deftest ksav-an-engine-on-exec-path-wins-over-a-downloaded-one ()
  "Order matters: a Ksav somebody installed deliberately is never shadowed."
  (let ((ksav-executable "emacs")) ; something that certainly exists
    (should (equal (ksav-engine-program) (executable-find "emacs")))))

(ert-deftest ksav-live-a-refused-download-is-not-written-to-disk ()
  "A 404 must not become a file.

`url-copy-file' — the obvious spelling — writes whatever comes back, so a
release with no such asset would produce a file containing an error page,
`ksav-install-engine' would mark it executable, and the failure would surface
much later as an engine that starts and dies.  Asked of the local engine rather
than of the network: it answers 404 for a path it does not route, which is the
same question without leaving the machine."
  (ksav-tests--with-engine
    (let ((file (make-temp-name (expand-file-name "ksav-refused" temporary-file-directory))))
      (unwind-protect
          (progn
            (should-error (ksav--download (concat (ksav-start) "/no-such-asset") file)
                          :type 'user-error)
            (should-not (file-exists-p file)))
        (ignore-errors (delete-file file))))))

(provide 'ksav-tests)
;;; ksav-tests.el ends here
