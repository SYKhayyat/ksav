;;; ksav-girsa.el --- The six errands to the library beside Ksav  -*- lexical-binding: t; -*-

;; Copyright (C) 2026 The Ksav Authors
;; SPDX-License-Identifier: MIT OR Apache-2.0

;;; Commentary:

;; Girsa is the sibling application: the library, with the corpus in it.  Ksav
;; is the pen.  Six of the engine's services are errands from one to the other,
;; and all six are marked `Native' in the registry because they need the
;; *installed* application — a browser tab has neither a listener for the
;; loopback nor a token to read.
;;
;;   inbox             sources Girsa has handed over, waiting for the caret
;;   clipboard-source  the Source Packet Girsa put on the clipboard
;;   mekoros           where is this phrase from?
;;   linkify           turn the mareh mekomos in a piece of prose into live refs
;;   refresh           every citation in this document, as the library has it now
;;   saved-here        this document lives here, so "who cites this" can find it
;;
;; # What is *not* here, and why
;;
;; There is no command to insert a place that `mekoros' found.  A Mekor is a row
;; from the library, not markup, and the one renderer that turns a source into
;; Ksav markup is in Rust — `ksav_engine::source' — reached by the two paths
;; that carry a whole packet: an arrival over the loopback and the clipboard.
;; Writing a second renderer here, in elisp, is precisely what spec.md §10.3
;; rules out, and it would drift from the first one the week after it was
;; written.  So this file shows what the library said and hands the insertion
;; back to the two doors that go through Rust.
;;
;; # Nothing here starts an engine
;;
;; Two of these are errands rather than requests — telling Girsa where a
;; document was saved, and asking whether anything is waiting.  Both would
;; otherwise run through `ksav-call', which starts an engine when none is
;; answering, so saving a file in `ksav-mode' would boot a whole typesetter to
;; deliver a courtesy message.  They ask `ksav-running-p' first and say nothing
;; when the answer is no.

;;; Code:

(require 'subr-x)
(require 'thingatpt)
(require 'ksav-engine)

(defcustom ksav-tell-girsa-on-save t
  "Tell Girsa where a document was saved, so it can answer \"who cites this\".

The other half of standing on a passage in the library and seeing which of your
own sefarim quote it.  A path and a name — never the text: Girsa reads the file
itself, and sending the body would be a second copy of one document with no
owner between them.

Nothing happens when no engine is running: this is a courtesy to the library,
not a step in saving, and a save must never wait on either."
  :type 'boolean
  :group 'ksav)

;;;; ------------------------------------------------------- what is waiting

;;;###autoload
(defun ksav-inbox ()
  "Insert the sources Girsa has handed over since the last time you asked.

The list is **drained** by asking, which is why this is a command and not a
poll: two windows each asking on a timer would each insert half the sources and
neither would be told the other had.

A source arrives as markup, already rendered in Rust by the same renderer the
clipboard path goes through, so a quote that comes over the loopback and a
quote that comes on the clipboard are the same document.

A whole document handed over from Girsa's own buffer is asked about before it
replaces what is open, because that is the one arrival that is not an
insertion."
  (interactive)
  (let ((arrivals (ksav-ask "inbox" nil)))
    (if (null arrivals)
        (message "Ksav: nothing waiting from Girsa")
      (let ((inserted 0))
        (dolist (a arrivals)
          (let ((markup (or (alist-get 'markup a) ""))
                (whole (eq t (alist-get 'whole a)))
                (display (or (alist-get 'display a) (alist-get 'reference a) "a source")))
            (cond
             ((string-empty-p markup) nil)
             ((and whole (not (y-or-n-p (format "Replace this buffer with %s? " display))))
              nil)
             (whole
              (erase-buffer)
              (insert markup)
              (setq inserted (1+ inserted)))
             (t
              (insert markup)
              (setq inserted (1+ inserted))))))
        (message "Ksav: %d source%s from Girsa"
                 inserted (if (= inserted 1) "" "s"))))))

;;;###autoload
(defun ksav-yank-source ()
  "Paste a Girsa Source Packet as markup, or paste the clipboard as text.

Girsa puts a copied source on the clipboard under a real native format, which
is the only way one application can hand another a structured quote — and which
no `paste' event exposes on any platform.  So it is asked of the engine, in the
process that can open the real clipboard, rather than read off the yank.

There being no packet is the ordinary answer and not a failure: you copied from
a text editor.  This yanks in that case, which is what a yank did before this
command existed."
  (interactive)
  (let ((markup (alist-get 'markup (ksav-ask "clipboard-source" nil))))
    (if (and (stringp markup) (not (string-empty-p markup)))
        (progn (insert markup)
               (message "Ksav: pasted a source from Girsa"))
      (yank))))

;;;; --------------------------------------------------------- where is it from

(defun ksav--phrase (prompt)
  "The region, or the word at point, or PROMPT for one."
  (cond
   ((use-region-p)
    (buffer-substring-no-properties (region-beginning) (region-end)))
   (t (read-string prompt (thing-at-point 'word t)))))

;;;###autoload
(defun ksav-mekoros (phrase)
  "Ask the library where PHRASE is from.

The region when there is one, the word at point otherwise.

`total' before the places, and that ordering is the whole answer: a phrase that
turns up in four thousand places has no source — it has a language — and
offering the first of them as *the* mekor would be an invention.

The places are shown and not inserted.  See this file's commentary: the one
renderer that turns a source into markup is in Rust, and a second one here
would be a different document from the first."
  (interactive (list (ksav--phrase "Where is this from: ")))
  (when (string-empty-p (string-trim phrase))
    (user-error "Ksav: nothing to look for"))
  (let* ((answer (ksav-ask "mekoros" `((phrase . ,phrase) (except . nil))))
         (total (or (alist-get 'total answer) 0))
         (said (alist-get 'said answer))
         (places (alist-get 'places answer)))
    (if (null places)
        (message "Ksav: the library has nothing for that phrase")
      (ksav--show-trouble
       (or said (format "%d place%s" total (if (= total 1) "" "s")))
       (mapcar (lambda (p)
                 (format "%s\n    %s%s"
                         (or (alist-get 'display p) (alist-get 'ref p) "")
                         (or (alist-get 'shown p) "")
                         (let ((n (alist-get 'characters p)))
                           (if (integerp n) (format "\n    (%d characters there)" n) ""))))
               places)))))

;;;###autoload
(defun ksav-search-in-girsa (phrase)
  "Put PHRASE in Girsa's own search and bring the library up.

The ending for when nothing `ksav-mekoros' found fits: the same service, asked
to open rather than to answer, because it is one question with two endings."
  (interactive (list (ksav--phrase "Search Girsa for: ")))
  (ksav-ask "mekoros" `((phrase . ,phrase) (search . t)))
  (message "Ksav: asked Girsa to search for %s" phrase))

;;;; ------------------------------------------------------------- the document

;;;###autoload
(defun ksav-linkify (start end)
  "Turn the mareh mekomos between START and END into live refs.

The certain ones only — the library decides which, and a reference it is not
sure about is left exactly as it was written.  The whole buffer when there is no
region.

The rewrite is applied here, unlike `ksav-refresh-sources' below, and the
difference is what changes: this marks up references the writer already typed
and leaves their words alone, where a refresh would replace the words with
somebody else's corrected edition."
  (interactive
   (if (use-region-p)
       (list (region-beginning) (region-end))
     (list (point-min) (point-max))))
  (let* ((text (buffer-substring-no-properties start end))
         (marked (alist-get 'text (ksav-ask "linkify" `((text . ,text))))))
    (cond
     ((not (stringp marked)) (user-error "Ksav: the library sent nothing back"))
     ((string= marked text) (message "Ksav: nothing here needed marking up"))
     (t
      (save-excursion
        (delete-region start end)
        (goto-char start)
        (insert marked))
      (message "Ksav: the citations here are live refs now")))))

;;;###autoload
(defun ksav-refresh-sources ()
  "Show every citation in this document as the library has it now.

Rows, and not a rewritten buffer.  A correction somebody else made silently
changing the words in the sefer you are writing is the one surprise the whole
arrangement exists to avoid — a correction is a claim somebody made, not a fact
about your sefer — so what comes back is offered and you say yes.

A citation whose place upstream re-segmented is reported separately: the
document holds a name that resolves only because a redirect row exists on this
machine, against this shelf, and a document is a file somebody emails."
  (interactive)
  (let* ((answer (ksav-ask "refresh" `((markup . ,(buffer-string)))))
         (quotes (alist-get 'quotes answer))
         (moved (alist-get 'moved answer))
         (retargeted (alist-get 'retargeted answer))
         (trouble (or (alist-get 'trouble answer) 0)))
    (if (null quotes)
        (message "Ksav: no citations in this document")
      (ksav--show-trouble
       (format "%d citation%s, %d of them the library could not look up"
               (length quotes) (if (= 1 (length quotes)) "" "s") trouble)
       (append
        (mapcar (lambda (q)
                  (format "%s\n    %s%s"
                          (or (alist-get 'display q) (alist-get 'ref q) "")
                          (or (alist-get 'text q) "")
                          (let ((why (alist-get 'trouble q)))
                            (if why (format "\n    — %s" why) ""))))
                quotes)
        (when moved
          (cons "\nThese places have moved upstream:"
                (mapcar (lambda (m)
                          (format "    %s → %s"
                                  (alist-get 'from m)
                                  (mapconcat #'identity (alist-get 'to m) ", ")))
                        moved)))))
      (when (and (stringp retargeted) (not (string= retargeted (buffer-string)))
                 (y-or-n-p "Rewrite this document with the refreshed citations? "))
        (let ((where (point)))
          (erase-buffer)
          (insert retargeted)
          (goto-char (min where (point-max))))
        (message "Ksav: the citations are the library's current ones")))))

;;;; --------------------------------------------------------- telling the library

(defun ksav-tell-girsa-saved (&optional forget)
  "Tell Girsa this document was saved here.  FORGET unregisters it instead.

Silent in both directions.  The library not being open is the ordinary case and
answers `told: false', which is not an error and must not interrupt a save."
  (interactive)
  (when-let ((path (buffer-file-name)))
    ;; No engine, no errand. Starting a typesetter to deliver a courtesy message
    ;; is not what anybody meant by saving a file.
    (when (ksav-running-p)
      (ignore-errors
        (ksav-call "saved-here"
                   `((path . ,path)
                     (name . ,(file-name-base path))
                     ,@(when forget '((forget . t)))))))))

(defun ksav--tell-girsa-on-save ()
  "Run `ksav-tell-girsa-saved' from `after-save-hook', if that is wanted."
  (when ksav-tell-girsa-on-save (ksav-tell-girsa-saved)))

(provide 'ksav-girsa)
;;; ksav-girsa.el ends here
