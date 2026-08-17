;;; ksav-engine.el --- Talking to the Ksav engine  -*- lexical-binding: t; -*-

;; Copyright (C) 2026 The Ksav Authors
;; SPDX-License-Identifier: MIT OR Apache-2.0

;;; Commentary:

;; The engine, and everything about reaching it: where it is, how to get one,
;; how to start and stop it, how a request is made, and how a refusal is read.
;;
;; This is the file every other file in the package requires, so `ksav' the
;; customisation group is defined here rather than in `ksav.el'.  A `defcustom'
;; needs its group to exist first, and putting the group in the front door would
;; make the front door a dependency of everything that has a setting — which is
;; a cycle, in a language with no way to break one.
;;
;; Nothing here knows what a document is.  The engine is the product; this
;; package is a door into it, and this file is the hinge.

;;; Code:

(require 'json)
(require 'subr-x)
(require 'url)
(require 'ksav-services)
(require 'ksav-release)

;; `url-http' sets these in the response buffer and declares neither, so the
;; byte compiler calls them free variables in every package that reads a body.
;; Declared rather than silenced: the warning is right that nothing here defines
;; them, and this says where they come from.
(defvar url-http-end-of-headers)
(defvar url-http-response-status)

(defgroup ksav nil
  "Write a sefer in Emacs, typeset by Ksav."
  :group 'languages
  :prefix "ksav-")

(defcustom ksav-executable "ksav"
  "The Ksav engine binary.

Started as `ksav serve ADDRESS' when no server is already running.  Ksav is
a single self-contained binary; if it is not on variable `exec-path', give
the path here — or run \\[ksav-install-engine], which downloads the one for
this machine."
  :type 'string)

(defcustom ksav-install-directory (locate-user-emacs-file "ksav")
  "Where \\[ksav-install-engine] keeps the engine it downloads.

Under your own Emacs directory rather than anywhere on variable `exec-path',
because a
package writing an executable onto a system path is a thing to be asked about
and this is not asking."
  :type 'directory)

(defcustom ksav-release-repository "SYKhayyat/ksav"
  "The GitHub repository \\[ksav-install-engine] downloads a release from."
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

(defcustom ksav-language "he"
  "Which language names things: \"he\" or \"en\".

Used for command names, template names and the descriptions beside them.  It
does not change the document; a Ksav command has a name in each language and
both compile."
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
  "Is there an engine answering at `ksav-server-address'?

Answered by reading an HTTP status, the same question `ksav--download' and
`ksav-call' ask, and not by whether `url-retrieve-synchronously' handed back a
buffer.  That is not the same question and it has no stable answer: against a
port with no listener, Emacs 30.2 on GNU/Linux returns a live buffer with an
empty body, Emacs 30.2 on Windows returns nil, and neither signals.  Reading
this as \"an engine is running\" makes `ksav-start' take its already-answering
branch, so it starts nothing, returns an address, and every call after it fails
with `no reply' — the whole package, on a machine with an engine sitting right
there.

CI runs `emacs-nox' 27.1, which is this package's declared minimum and happens
to be one of the spellings where the wrong question gets the right answer.  Half
of this suite is live tests that cannot pass when this returns t wrongly, and
all of them were green."
  (let ((url-request-method "GET")
        (url-show-status nil))
    (condition-case nil
        (let ((buffer (url-retrieve-synchronously (ksav-server-address) t t 2)))
          (and (buffer-live-p buffer)
               (unwind-protect
                   (with-current-buffer buffer
                     (and (boundp 'url-http-response-status)
                          (integerp url-http-response-status)))
                 (kill-buffer buffer))))
      (error nil))))

(defun ksav-installed-engine ()
  "The engine \\[ksav-install-engine] has already put on this machine, or nil."
  (let ((row (ksav-release-this-machine)))
    (when row
      (let ((file (expand-file-name (ksav-release-binary row) ksav-install-directory)))
        (and (file-executable-p file) file)))))

(defun ksav-engine-program ()
  "The engine to start, or nil when there is none on this machine.

Variable `exec-path' first, so a system package or a build of your own wins over
anything this package downloaded — that is the order somebody who installed an
engine deliberately expects, and the download is the fallback for somebody who
has not."
  (or (executable-find ksav-executable) (ksav-installed-engine)))

;;;###autoload
(defun ksav-start ()
  "Start an engine, unless one is already answering.

Returns the address it is at.  Signals an error when there is no engine to
start — which is the one thing that can go wrong here that a reader can act on,
and it must not look like a compile failure."
  (interactive)
  (cond
   ((ksav-running-p) (ksav-server-address))
   (ksav-server-url
    (user-error "Nothing is answering at %s, and `ksav-server-url' says not to start one"
                ksav-server-url))
   (t
    ;; The message names the command that fixes it. It used to say "set
    ;; `ksav-executable' to the Ksav binary", which is advice about a variable
    ;; offered to the one reader who is certain not to have the file it wants —
    ;; there was no `ksav' binary to point at, on any machine, because a release
    ;; attached four desktop installers and the desktop shell links the engine
    ;; as a library. Naming the variable was true and useless.
    (let ((program (ksav-engine-program)))
      (unless program
        (user-error "No Ksav engine on this machine — run `M-x ksav-install-engine'%s"
                    (if (ksav-release-this-machine) ""
                      (format ", or build one: Ksav publishes none for %s/%s"
                              system-type (ksav-release-arch)))))
      (setq ksav--process
            (start-process "ksav" (get-buffer-create " *ksav engine*")
                           program "serve"
                           (format "127.0.0.1:%d" ksav-port))))
    (set-process-query-on-exit-flag ksav--process nil)
    (let ((until (+ (float-time) ksav-start-timeout)))
      (while (and (< (float-time) until) (not (ksav-running-p)))
        (sleep-for 0.2)))
    (unless (ksav-running-p)
      (user-error "The engine did not answer within %d seconds — see ` *ksav engine*'"
                  ksav-start-timeout))
    (ksav-server-address))))

(defun ksav-stop ()
  "Stop the engine this package started, and leave anybody else's alone."
  (interactive)
  (when (process-live-p ksav--process)
    (delete-process ksav--process))
  (setq ksav--process nil))

(add-hook 'kill-emacs-hook #'ksav-stop)

(defun ksav--download (url file)
  "Fetch URL into FILE, or signal with what the server actually said.

`url-copy-file' is the obvious spelling here and it is the wrong one: it writes
whatever comes back.  A release with no such asset answers 404 with an HTML
page, and `url-copy-file' would write that page to disk, `ksav-install-engine'
would mark it executable, and the failure would surface much later as an engine
that starts and immediately dies — a message about a typesetter, describing a
download.  So the status is read, and a refusal is reported as a refusal."
  (let ((buffer (url-retrieve-synchronously url t t 600)))
    (unless buffer (user-error "Ksav: no answer from %s" url))
    (unwind-protect
        (with-current-buffer buffer
          (let ((status (and (boundp 'url-http-response-status) url-http-response-status)))
            (unless (eq status 200)
              (user-error "Ksav: %s answered %s" url (or status "nothing")))
            (goto-char url-http-end-of-headers)
            ;; `no-conversion', or Emacs decodes an executable as text on a
            ;; system whose default coding is not binary and writes a file that
            ;; runs nowhere.  The same trap, and the same fix, as writing a PDF.
            (let ((coding-system-for-write 'no-conversion))
              (write-region (point) (point-max) file nil 'silent))))
      (kill-buffer buffer))))

(defun ksav-release-url (row tag)
  "Where the engine in ROW is downloaded from, at release TAG or the newest one."
  (format "https://github.com/%s/releases/%s/%s"
          ksav-release-repository
          (if tag (concat "download/" tag) "latest/download")
          (ksav-release-asset row)))

;;;###autoload
(defun ksav-install-engine (&optional tag)
  "Download the Ksav engine for this machine into `ksav-install-directory'.

Ksav is a client: the typesetting, the note apparatus, the command vocabulary
and the Hebrew speller are all the engine's, and this package is a door into
it.  So an Emacs with this package and nothing else has a door and no room, and
this is the command that fixes that without a Rust toolchain and a compile of
the whole Typst compiler.

With a prefix argument, ask for a release TAG instead of taking the newest.

Nothing is put on variable `exec-path' and nothing outside your Emacs
directory is touched.  `ksav-executable' still wins if it names a program
that exists, so a Ksav you installed yourself is never quietly replaced by
this one."
  (interactive (list (when current-prefix-arg (read-string "Release tag (e.g. v0.1.0): "))))
  (let ((row (ksav-release-this-machine)))
    (unless row
      (user-error "Ksav publishes no engine for %s on %s — build one with `cargo build --release' in ksav/engine"
                  system-type (ksav-release-arch)))
    (let* ((url (ksav-release-url row tag))
           (dest (expand-file-name (ksav-release-binary row) ksav-install-directory))
           ;; Written beside the destination and renamed into place.  An
           ;; interrupted download must not leave a truncated file that
           ;; `ksav-installed-engine' will happily report as an installed
           ;; engine — this is a hundred megabytes over somebody's connection,
           ;; so interrupted is the ordinary case and not the exotic one.
           (part (concat dest ".part")))
      (make-directory ksav-install-directory t)
      (message "Ksav: downloading %s — a whole typesetting engine, so give it a moment"
               (ksav-release-asset row))
      (ksav--download url part)
      (rename-file part dest t)
      (set-file-modes dest #o755)
      (message "Ksav: the engine is installed at %s" dest)
      dest)))

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

(defun ksav-ask (service payload)
  "Ask for SERVICE with PAYLOAD, and signal rather than return a refusal.

The same call as `ksav-call', for the callers that have nothing useful to do
with a refusal except stop and show it.  It is where the registry's
needs-the-installed-application column is finally read.

# Two failures that look alike and are not

A service that needs the machine beside Girsa can be refused for a reason the
reader is *in*: the library is not open, there is no folder on disk, this
document has never been saved.  Every other service can only be refused because
something went wrong.  Emacs already has two signals for exactly that
distinction — `user-error' is a state you are in and prints one line,
`error' is a fault and offers a backtrace — and this package used to raise
neither, so \"Girsa is not running\" arrived looking like a bug in the
typesetter.

The engine's own words are never rephrased in either case.  Half of what it
says is a message a writer is meant to read, and a friendlier sentence in front
of it is one they cannot search for."
  (let* ((answer (ksav-call service payload))
         (refused (ksav--refused answer)))
    (cond
     ((and refused (ksav-service-native-p service)) (user-error "Ksav: %s" refused))
     (refused (error "Ksav: %s" refused))
     (t answer))))

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
  "Every diagnostic in ANSWER, as lines of text.

Each one says **where it is**, which for a long time none of them did.  The
engine computes a line, a column, the command the trouble is about and a
spelling suggestion for every diagnostic — the browser editor puts a mark in
its gutter from exactly those fields — and this printed the severity and the
message and dropped the rest.  So a writer with a three-hundred-line sefer read
\"the command here is missing an argument: body\" and went looking by eye.

The shape is `file:line:column: severity: message', which is what every
compiler has printed since the seventies and what `compilation-mode' and
`next-error' already know how to walk.  `whose' is the buffer's own file, since
`file' is set only for a line that came out of an included document."
  (let ((whose (or (and buffer-file-name (file-name-nondirectory buffer-file-name))
                   "")))
    (mapcar
     (lambda (d)
       (let ((line (alist-get 'line d))
             (column (alist-get 'column d))
             (about (alist-get 'about d))
             (mean (alist-get 'did_you_mean d))
             (file (or (alist-get 'file d) whose)))
         (concat
          (when line
            (format "%s:%d%s: " file line (if column (format ":%d" column) "")))
          (format "%s: %s"
                  (or (alist-get 'severity d) "error")
                  (or (alist-get 'message d) ""))
          ;; `about` carries its own hash and `did_you_mean` does not.  Both
          ;; halves of this were written twice — once here and once in the
          ;; engine — and both drafts printed `[##סעיף]`, which is the argument
          ;; for the format being one authority rather than two agreeing.
          (when about (format " [%s]" about))
          (when mean (format " — did you mean #%s?" mean)))))
     (alist-get 'diagnostics answer))))

;;;; --------------------------------------------------- saying what came back

(defconst ksav-trouble-buffer "*ksav diagnostics*"
  "Where diagnostics, misspellings and the engine's refusals are shown.

One buffer for all of them.  A window per kind of bad news is a screen full of
windows on the day everything is wrong at once, and the reader has to close
each of them by hand afterwards.")

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

(provide 'ksav-engine)
;;; ksav-engine.el ends here
