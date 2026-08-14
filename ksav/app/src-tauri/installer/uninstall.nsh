; What the uninstaller has to take away that it did not put there.
;
; # The finding
;
; Relayed from Girsa as G10. Uninstalling Ksav left `ksav://` registered, so a
; source sent from Girsa afterwards opened nothing at all, with no error
; anywhere — the scheme still pointed at an executable that was gone.
;
; The reason is a split in who writes the key. The installer registers the
; scheme from `tauri.conf.json` and the uninstaller removes what the installer
; wrote. But the *application* also wrote one, at runtime, into
; `HKCU\Software\Classes\ksav` — that was `register_all()` on every start, which
; is the same finding seen from the other end (G9, and `src/scheme.rs` for the
; rule that replaced it). Nothing has ever removed that one, because the
; uninstaller does not know it exists.
;
; So it is named here. `DeleteRegKey` on a key that is not there is not an
; error, which is what makes this safe to run on a machine that never had the
; runtime registration.
;
; # Why the marker goes too
;
; `scheme-owner.txt` records the executable that claimed the scheme, and the
; rule in `scheme.rs` reads it to decide whether a copy still holds it. Leaving
; it behind after the file it names has been deleted would leave the next
; install to work that out from the filesystem — which it does, correctly, but
; only once it has been started. Removing both together means an uninstall
; leaves nothing at all, which is what an uninstall is.

!macro NSIS_HOOK_PREUNINSTALL
  DetailPrint "Removing the ksav:// registration"
  DeleteRegKey HKCU "Software\Classes\ksav"
  Delete "$APPDATA\org.ksav.app\scheme-owner.txt"
!macroend
