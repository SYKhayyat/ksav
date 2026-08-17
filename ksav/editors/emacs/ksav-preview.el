;;; ksav-preview.el --- The typeset page, and the two ways between it and the text  -*- lexical-binding: t; -*-

;; Copyright (C) 2026 The Ksav Authors
;; SPDX-License-Identifier: MIT OR Apache-2.0

;;; Commentary:

;; Compiling, showing the page, writing a PDF or the assembled Typst, and the
;; two searches between the source and the page:
;;
;;   `ksav-jump'    a place on the page → the line that produced it
;;   `ksav-reveal'  a line → everywhere on the page it ended up
;;
;; Both of those are the engine's `jump' and `reveal' services, which are the
;; reason `typst-ide' is in this product's dependency tree at all, and neither
;; had a door in Emacs.
;;
;; # Points, not pixels
;;
;; A page arrives as SVG whose `viewBox' is written in Typst points, which is
;; the unit both services speak.  So the only conversion this file makes is
;; between the pixels Emacs drew and that box — the drawn width and the box
;; width, and nothing else.  Neither the zoom nor the window size can make the
;; two sides disagree about where something is, because neither is consulted.

;;; Code:

(require 'subr-x)
(require 'ksav-engine)

;; `image-size' is defined in image.c, and **only in an Emacs built with a
;; window system** — so on the `emacs-nox' CI runs it does not exist and the
;; byte compiler is right to say so. Declared rather than guarded with
;; `fboundp': the one caller is reached from a mouse click on a drawn page,
;; which is a thing that cannot happen in an Emacs that cannot draw one.
;;
;; This is the local-is-laxer-than-CI trap, exactly. The machine this was
;; written on has a graphical Emacs 30, where the function is simply there;
;; Ubuntu's `emacs-nox' 27.1 is the floor this package claims, and it is the
;; only place the claim is ever tested.
(declare-function image-size "image.c" (spec &optional pixels frame))

(defconst ksav-preview-buffer "*ksav page*"
  "Where the typeset document is shown.")

(defvar-local ksav--source-buffer nil
  "The buffer a preview was made from.")

(defvar-local ksav--page-boxes nil
  "The `viewBox' of each drawn page, as a vector of (WIDTH . HEIGHT) in points.

Kept because a click gives pixels and the engine wants points, and the ratio
between them is a property of the page that was drawn rather than of the window
it was drawn in.")

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

(defun ksav--view-box (svg)
  "The (WIDTH . HEIGHT) of SVG's own coordinate system, in points, or nil.

Typst writes the page size into the `viewBox', which is why a point on a page
can be named without knowing anything about how big it was drawn."
  (when (string-match
         "viewBox=\"\\([0-9.]+\\) +\\([0-9.]+\\) +\\([0-9.]+\\) +\\([0-9.]+\\)\""
         svg)
    (cons (string-to-number (match-string 3 svg))
          (string-to-number (match-string 4 svg)))))

(defun ksav--svg-marked (svg x y)
  "SVG with a mark drawn at X, Y — its own coordinates, so Typst points.

Drawn into the page rather than overlaid on it.  Emacs can put an overlay on an
image, and it cannot put one *inside* it: the page is a single display property
occupying one character, so there is no position between its corners to hang
anything on.  A rectangle appended before the closing tag is in the page's own
coordinate system, which is the coordinate system the answer came back in."
  (let ((at (string-match-p "</svg>" svg)))
    (if (not at)
        svg
      (concat (substring svg 0 at)
              (format (concat "<rect x=\"%s\" y=\"%s\" width=\"140\" height=\"16\""
                              " fill=\"#f2c744\" fill-opacity=\"0.45\"/>")
                      (max 0 (- x 4)) (max 0 (- y 12)))
              (substring svg at)))))

(define-derived-mode ksav-preview-mode special-mode "Ksav page"
  "The typeset document, page by page.

\\{ksav-preview-mode-map}"
  (setq-local cursor-type nil)
  (setq-local truncate-lines nil))

(defun ksav--show-pages (pages source &optional mark)
  "Draw PAGES — a list of SVG strings — in the preview buffer for SOURCE.

MARK is (PAGE X . Y) — a zero-based page and a place on it in points — to draw
a mark at, for `ksav-reveal'."
  (with-current-buffer (get-buffer-create ksav-preview-buffer)
    (let ((inhibit-read-only t)
          (n 0))
      (erase-buffer)
      (ksav-preview-mode)
      (setq ksav--source-buffer source)
      (setq ksav--page-boxes (vconcat (mapcar #'ksav--view-box pages)))
      (if (not (ksav--svg-supported-p))
          ;; Said, rather than left blank.  A terminal Emacs, or one built
          ;; without librsvg, cannot draw these — and a preview window that is
          ;; simply empty looks like a compile that produced nothing.
          (insert (format "This Emacs cannot draw SVG, so the page cannot be shown here.\n\n%s typeset.\nUse `M-x ksav-export-pdf' to write a PDF and open it.\n"
                          (ksav--pages-said (length pages))))
        (dolist (svg pages)
          (let* ((marked (if (and mark (= n (car mark)))
                             (ksav--svg-marked svg (cadr mark) (cddr mark))
                           svg))
                 (start (point)))
            (insert-image (create-image (encode-coding-string marked 'utf-8) 'svg t))
            ;; Which page this is, readable from wherever point lands on it.
            ;; A click reports a position and an image; it does not report
            ;; which of eleven images it was.
            (put-text-property start (point) 'ksav-page n)
            (insert "\n\n")
            (setq n (1+ n)))))
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

;;;###autoload
(defun ksav-export-typst (file)
  "Write this document's assembled Typst source to FILE.

The prelude, the page setup and every `#כלול' chapter expanded — what the
compiler is actually handed, which is the thing to read when a document does
something you did not write.

`assemble' and not a compile: this is the `format!' the engine does *before*
the seconds of layout, and asking for it through `compile' would mean paying
for a full typesetting run and a base64 PDF to obtain a string that was ready
before either started."
  (interactive
   (list (read-file-name "Write Typst source to: " nil nil nil
                         (concat (file-name-base (or (buffer-file-name) "document")) ".typ"))))
  (let* ((answer (ksav-ask "assemble" `((body . ,(buffer-string)))))
         (source (alist-get 'typst_source answer))
         (diags (ksav--diagnostics answer)))
    (unless (and (stringp source) (not (string= source "")))
      (ksav--show-trouble "the document could not be assembled" diags)
      (user-error "Ksav: nothing was assembled"))
    ;; Warnings do not stop it. A chapter that could not be resolved is a
    ;; diagnostic and the rest of the document still assembled, so writing the
    ;; file *and* saying what is missing is more use than refusing to write.
    (when diags
      (ksav--show-trouble "the document assembled, with something to say" diags))
    ;; UTF-8, said out loud.  Emacs picks a coding system for a new file from
    ;; the locale, and on a machine whose default is not UTF-8 a buffer full of
    ;; Hebrew is not representable in it — so an interactive Emacs stops to ask
    ;; which coding system to use, in the middle of an export, about a file
    ;; format that has exactly one right answer.  Typst reads UTF-8.
    (let ((coding-system-for-write 'utf-8-unix))
      (with-temp-file file (insert source)))
    (message "Ksav: wrote %s — %d characters of Typst" file (length source))))

;;;; -------------------------------------------------------- between the two

(defun ksav--page-at-point ()
  "The zero-based page under point in the preview, or nil."
  (get-text-property (point) 'ksav-page))

(defun ksav--point-in-points (position)
  "Where POSITION — an event position on a drawn page — is, in Typst points.

Answers (X . Y), or nil when the click was not on a page this buffer drew.
`posn-object-x-y' is in pixels within the image; `image-size' with a third
argument is the same image's size in pixels.  The ratio of those to the page's
own `viewBox' is the whole conversion."
  (let* ((where (posn-point position))
         (page (and where (get-text-property where 'ksav-page)))
         (box (and page ksav--page-boxes (> (length ksav--page-boxes) page)
                   (aref ksav--page-boxes page)))
         (image (posn-image position))
         (xy (posn-object-x-y position)))
    (when (and box image xy)
      (let* ((drawn (image-size image t))
             (w (car drawn))
             (h (cdr drawn)))
        (when (and (> w 0) (> h 0))
          (cons (* (car box) (/ (float (car xy)) w))
                (* (cdr box) (/ (float (cdr xy)) h))))))))

(defun ksav-jump (event)
  "Go to the line in the source that printed where EVENT was clicked.

Inverse search, and the engine's `jump' service: the document is laid out again
with the point named, and the answer is a line and a column in the body that
was sent.

Nothing happens for a click on something the writer did not type — a margin, a
running head, the rule above a note band — and for a document that does not
currently compile.  Both mean *leave the cursor alone*, so neither is reported:
a message on every miss would fire on every click into the margin."
  (interactive "e")
  (let* ((position (event-start event))
         (where (posn-point position))
         (page (and where (get-text-property where 'ksav-page)))
         (at (ksav--point-in-points position))
         (source ksav--source-buffer))
    (unless (buffer-live-p source)
      (user-error "Ksav: the buffer this page was made from is gone"))
    (when at
      (let* ((body (with-current-buffer source (buffer-string)))
             (answer (ksav-call "jump" `((body . ,body)
                                         (page . ,page)
                                         (x_pt . ,(car at))
                                         (y_pt . ,(cdr at)))))
             (line (alist-get 'line answer))
             (column (alist-get 'column answer)))
        (when (and (integerp line) (> line 0))
          (let ((window (get-buffer-window source)))
            (if window (select-window window) (pop-to-buffer source)))
          (goto-char (point-min))
          (forward-line (1- line))
          (when (integerp column)
            (forward-char (min (1- (max 1 column))
                               (- (line-end-position) (point))))))))))

;;;###autoload
(defun ksav-reveal ()
  "Show where the line at point ended up on the page.

Forward search, and the engine's `reveal' service.  A place in the body can
print in more than one place — a note set in a band *and* in an endnote list
prints twice, and text in a running head prints on every page — so the answer
is a list, in page order, and this goes to the first of them and says how many
there were.

The page is recompiled to answer it, because the answer is a fact about a
layout and there is no layout without one."
  (interactive)
  (let* ((source (current-buffer))
         (line (line-number-at-pos))
         (column (1+ (current-column)))
         (body (buffer-string))
         (points (alist-get 'points (ksav-call "reveal" `((body . ,body)
                                                          (line . ,line)
                                                          (column . ,column))))))
    (if (null points)
        ;; Not an error. A blank line, a comment, and a line inside a command
        ;; whose output is nothing all print nowhere, and none of them is a
        ;; fault.
        (message "Ksav: nothing from line %d printed on the page" line)
      (let* ((first (car points))
             (page (or (alist-get 'page first) 0))
             (x (or (alist-get 'x_pt first) 0))
             (y (or (alist-get 'y_pt first) 0))
             (answer (ksav-call "compile" `((body . ,body))))
             (pages (alist-get 'pages_svg answer)))
        (unless (eq t (alist-get 'ok answer))
          (user-error "Ksav: the document does not compile, so there is no page to show"))
        (display-buffer (ksav--show-pages pages source (cons page (cons x y))))
        (with-current-buffer ksav-preview-buffer
          (goto-char (point-min))
          (while (and (not (eobp)) (not (eql (ksav--page-at-point) page)))
            (goto-char (or (next-single-property-change (point) 'ksav-page) (point-max))))
          (when-let ((window (get-buffer-window ksav-preview-buffer)))
            (set-window-point window (point))))
        (message "Ksav: line %d prints on page %d%s"
                 line (1+ page)
                 (if (cdr points) (format ", and in %d other places" (length (cdr points))) ""))))))

;; The mouse and nothing else, and that is not an oversight.  A jump needs a
;; place *within* a page, and point in this buffer is at the page: the whole
;; document occupies one character with an image hung on it, so there is no
;; position between its corners for a keyboard to be at.  An Emacs that cannot
;; draw the page cannot click on it either, and is told so in words above.
(define-key ksav-preview-mode-map (kbd "<mouse-1>") #'ksav-jump)

(provide 'ksav-preview)
;;; ksav-preview.el ends here
