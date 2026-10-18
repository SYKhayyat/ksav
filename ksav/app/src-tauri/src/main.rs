// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

#[cfg(target_os = "linux")]
fn should_prefer_x11(
    nixos: bool,
    wayland_display: bool,
    gdk_backend: Option<&std::ffi::OsStr>,
) -> bool {
    nixos && wayland_display && gdk_backend != Some(std::ffi::OsStr::new("x11"))
}

#[cfg(target_os = "linux")]
fn prefer_x11_on_wayland() {
    // In the NixOS desktop environment used to build this app, WebKitGTK 2.52.5
    // can hand a Wayland webview a negative CSS viewport (devicePixelRatio =
    // -1/96). That is an upstream GTK/WebKit compatibility problem, not a
    // Ksav layout problem. GTK chooses its backend before Tauri creates the
    // webview, so this compatibility workaround must happen before
    // app_lib::run(). An existing X11 choice is already safe; other values are
    // replaced because the affected Wayland path makes the editor unusable.
    if should_prefer_x11(
        std::path::Path::new("/etc/NIXOS").is_file(),
        std::env::var_os("WAYLAND_DISPLAY").is_some(),
        std::env::var_os("GDK_BACKEND").as_deref(),
    ) {
        std::env::set_var("GDK_BACKEND", "x11");
    }
}

fn main() {
    #[cfg(target_os = "linux")]
    prefer_x11_on_wayland();
    app_lib::run();
}

#[cfg(all(test, target_os = "linux"))]
mod tests {
    use super::should_prefer_x11;
    use std::ffi::OsStr;

    #[test]
    fn selects_x11_for_wayland_unless_already_using_x11() {
        assert!(should_prefer_x11(true, true, None));
        assert!(should_prefer_x11(true, true, Some(OsStr::new("wayland"))));
        assert!(!should_prefer_x11(true, true, Some(OsStr::new("x11"))));
        assert!(!should_prefer_x11(false, true, None));
        assert!(!should_prefer_x11(true, false, None));
    }
}
