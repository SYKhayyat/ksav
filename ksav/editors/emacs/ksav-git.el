;;; ksav-git.el --- Version control, on the git the writer already has  -*- lexical-binding: t; -*-

;; Copyright (C) 2026 The Ksav Authors
;; SPDX-License-Identifier: MIT OR Apache-2.0

;;; Commentary:

;; One engine service, eighteen operations.  The engine runs the git that is
;; already on the machine, in the folder the document is in, and answers in one
;; shape; this file is the door in Emacs.
;;
;; # Why an Emacs package would carry this at all
;;
;; Because it is not really about git.  A `.ksav' document is a file on disk, and
;; the engine's `git' service is the one that knows *which* file, which
;; repository it is in, whether it has ever been committed, and what the writer
;; will be recorded as — the three questions a reader has that `git status' in a
;; shell answers about a directory rather than about their sefer.  Anyone who
;; wants a full porcelain has one already; this is the sefer's own history.
;;
;; # The operations are the engine's list, not a list here
;;
;; `ksav-git-operations' is generated from `engine/src/git.rs' into
;; `ksav-services.el', so an operation that does not exist is an error in elisp
;; rather than a refusal shown to a writer, and one that is *added* in Rust
;; appears here without this file being touched.  What is written down here is
;; the arguments each operation wants, because the engine does not publish those
;; — and `ksav-tests.el' fails when an operation has no row, so the list cannot
;; quietly stop covering the table it is about.

;;; Code:

(require 'cl-lib)
(require 'subr-x)
(require 'ksav-engine)

(defconst ksav-git-arguments
  '(("status"      . ())
    ("init"        . ())
    ("log"         . ())
    ("show"        . (rev))
    ("commit"      . (message all))
    ("who"         . (name email))
    ("restore"     . (rev))
    ("revert"      . (rev))
    ("branches"    . ())
    ("switch"      . (name create))
    ("merge"       . (name))
    ("merge-abort" . ())
    ("resolve"     . (side))
    ("remotes"     . ())
    ("remote-add"  . (name url))
    ("fetch"       . (remote))
    ("pull"        . (remote))
    ("push"        . (remote set_upstream)))
  "What each git operation is asked for, beyond the document's own path.

A hand-written table, and the one in this package that could go stale — so
`ksav-tests.el' holds it against `ksav-git-operations', which is generated from
the engine's own list.  An operation added in Rust and not given a row here is
a red test rather than a command that prompts for nothing and refuses.")

(defconst ksav-git-prompts
  '((message      . "Commit message: ")
    (rev          . "Commit, branch or tag: ")
    (name         . "Name: ")
    (email        . "Email: ")
    (url          . "URL: ")
    (remote       . "Remote (empty for origin): ")
    (side         . "Take which side (ours/theirs): ")
    (all          . "Everything that changed, not only this document? ")
    (create       . "Create it? ")
    (set_upstream . "Set the upstream branch? "))
  "How each argument is asked for.  A flag is a yes-or-no; the rest are strings.")

(defconst ksav-git-flags '(all create set_upstream)
  "The arguments that are yes-or-no rather than text.")

(defun ksav-git-operation-p (op)
  "Is OP an operation the engine's `git' service answers?"
  (and (member op ksav-git-operations) t))

(defun ksav-git--path ()
  "This document's path, or a refusal that says which of three things is wrong.

Three answers, not one.  *There is no git*, and *this document is not in a
repository*, are the engine's to give and it gives them by name.  The third —
*this document has never been saved* — cannot even be asked, because every one
of these operations is about a path and an unsaved buffer has none."
  (or (buffer-file-name)
      (user-error "Ksav: save this document first — git is about a file on disk")))

(defun ksav-git--call (op &optional args)
  "Ask the `git' service for OP with ARGS, an alist, about this document."
  (unless (ksav-git-operation-p op)
    (error "Ksav: no git operation named %s" op))
  (ksav-ask "git" `((op . ,op) (path . ,(ksav-git--path)) ,@args)))

(defun ksav-git--read-arguments (op)
  "Ask for whatever OP wants, as an alist ready for the request."
  (let (args)
    (dolist (arg (cdr (assoc op ksav-git-arguments)) (nreverse args))
      (let ((prompt (alist-get arg ksav-git-prompts)))
        (if (memq arg ksav-git-flags)
            (when (y-or-n-p prompt) (push (cons arg t) args))
          (let ((said (read-string prompt)))
            ;; An empty answer is left off the request rather than sent as "".
            ;; The engine reads an absent `remote' as origin and an absent
            ;; `rev' as a refusal naming what is missing; an empty string is a
            ;; third thing, and it is the one nobody meant.
            (unless (string-empty-p (string-trim said))
              (push (cons arg said) args))))))))

;;;; --------------------------------------------------------------- reporting

(defun ksav-git--files-said (files)
  "FILES, as one line each: the two status letters git prints, and the path."
  (mapcar (lambda (f)
            (format "  %s%s  %s%s"
                    (or (alist-get 'staged f) ".")
                    (or (alist-get 'worktree f) ".")
                    (or (alist-get 'path f) "")
                    (let ((from (alist-get 'from f)))
                      (if from (format "  (was %s)" from) ""))))
          files))

(defun ksav-git--lines (answer)
  "Everything ANSWER has to say, as lines, whichever operation produced it.

One reader for eighteen answers, because they are one shape: the fields that
are there are shown and the fields that are not are not mentioned.  Written
this way rather than as a case per operation so that an operation added in Rust
prints something useful here on the day it arrives."
  (let (lines)
    (cl-flet ((say (fmt &rest args) (push (apply #'format fmt args) lines)))
      (when-let ((git (alist-get 'git answer))) (say "git %s" git))
      (when-let ((root (alist-get 'root answer))) (say "repository %s" root))
      (let ((branch (alist-get 'branch answer))
            (ahead (or (alist-get 'ahead answer) 0))
            (behind (or (alist-get 'behind answer) 0)))
        (when branch
          (say "on %s%s%s%s"
               branch
               (if (eq t (alist-get 'detached answer)) " (detached)" "")
               (if (> ahead 0) (format ", %d to push" ahead) "")
               (if (> behind 0) (format ", %d to pull" behind) ""))))
      (when (eq t (alist-get 'merging answer))
        (say "a merge is in progress"))
      (let ((who (alist-get 'who answer)))
        (if who
            (say "committing as %s <%s>" (alist-get 'name who) (alist-get 'email who))
          ;; Said out loud, because the alternative is a first commit failing
          ;; with git's own nine-line lecture about `user.email'.
          (when (alist-get 'root answer)
            (say "git has not been told who you are — `M-x ksav-git', then `who'"))))
      (when-let ((this (alist-get 'this answer)))
        (say "this document: %s"
             (if (eq t (alist-get 'tracked this))
                 (format "tracked, %s%s"
                         (or (alist-get 'staged this) ".")
                         (or (alist-get 'worktree this) "."))
               "never committed")))
      (when-let ((files (alist-get 'files answer)))
        (say "%d file%s changed:" (length files) (if (= 1 (length files)) "" "s"))
        (dolist (line (ksav-git--files-said files)) (push line lines)))
      (dolist (c (alist-get 'commits answer))
        (say "%s  %s  %s"
             (or (alist-get 'short c) "")
             (or (alist-get 'author c) "")
             (or (alist-get 'subject c) "")))
      (dolist (b (alist-get 'branches answer))
        (say "%s%s%s"
             (if (eq t (alist-get 'current b)) "* " "  ")
             (or (alist-get 'name b) "")
             (let ((up (alist-get 'upstream b))) (if up (format " → %s" up) ""))))
      (dolist (r (alist-get 'remotes answer))
        (say "%s  %s" (or (alist-get 'name r) "") (or (alist-get 'url r) "")))
      (when-let ((conflicts (alist-get 'conflicts answer)))
        (say "conflicts, which are yours to settle:")
        (dolist (c conflicts) (push (format "  %s" c) lines)))
      ;; git's own words last, and never rephrased: "Permission denied
      ;; (publickey)" is the one string a reader can search for.
      (when-let ((said (alist-get 'said answer)))
        (unless (string-empty-p (string-trim said)) (say "\n%s" said))))
    (nreverse lines)))

(defun ksav-git--report (headline answer)
  "Show HEADLINE and everything ANSWER says."
  (ksav--show-trouble headline (ksav-git--lines answer)))

;;;; ---------------------------------------------------------------- commands

;;;###autoload
(defun ksav-git-status ()
  "Where this document stands with git.

The document, not the directory: whether it is in a repository at all, whether
it has ever been committed, what git will record as the author, and what else
has changed around it."
  (interactive)
  (let ((answer (ksav-git--call "status")))
    (ksav-git--report
     (cond
      ((not (alist-get 'git answer)) "there is no git on this machine")
      ((not (alist-get 'root answer)) "this document is not inside a git repository")
      (t (format "%s" (file-name-nondirectory (ksav-git--path)))))
     answer)))

;;;###autoload
(defun ksav-git-commit (message &optional all)
  "Commit this document with MESSAGE.  With a prefix argument, commit ALL changes.

The document alone by default.  A sefer is usually one file among several in a
folder, and a commit that quietly swept up the other four is a commit nobody
can read afterwards."
  (interactive (list (read-string "Commit message: ") current-prefix-arg))
  (when (string-empty-p (string-trim message))
    (user-error "Ksav: a commit needs a message — it is the only part a person reads"))
  (let ((answer (ksav-git--call "commit" `((message . ,message)
                                           ,@(when all '((all . t)))))))
    (if (alist-get 'hash answer)
        (message "Ksav: committed %s" (alist-get 'hash answer))
      (ksav-git--report "nothing was committed" answer))))

;;;###autoload
(defun ksav-git-log ()
  "This document's history."
  (interactive)
  (ksav-git--report (format "%s, as git has it"
                            (file-name-nondirectory (ksav-git--path)))
                    (ksav-git--call "log")))

;;;###autoload
(defun ksav-git-push ()
  "Push this repository's current branch."
  (interactive)
  (ksav-git--report "push" (ksav-git--call "push")))

;;;###autoload
(defun ksav-git-pull ()
  "Pull this repository's current branch."
  (interactive)
  (ksav-git--report "pull" (ksav-git--call "pull")))

;;;###autoload
(defun ksav-git (op)
  "Run any of the engine's git operations, OP, on this document.

The named commands above are the ones a writer reaches for daily.  This is the
rest of the table — branches, merges, remotes, telling git who you are — and it
is generated from the engine's own list, so an operation added in Rust is
offered here the day it exists."
  (interactive (list (completing-read "git: " ksav-git-operations nil t)))
  (let ((answer (ksav-git--call op (ksav-git--read-arguments op))))
    (ksav-git--report op answer)))

(provide 'ksav-git)
;;; ksav-git.el ends here
