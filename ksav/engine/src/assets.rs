//! Assets carried with a compile request — images and user fonts.
//!
//! Ksav has no file system. The editor is a browser tab (or a Tauri webview) and
//! the engine may be a wasm module in that same tab, so `#תמונה("logo.png")` has
//! nothing to read: there is no path that means anything to both sides. Before
//! this module, inserting a picture was not merely unimplemented, it was
//! impossible — the compiler was built with no file resolver at all, so every
//! `image()` call failed "file not found".
//!
//! So the document's assets travel *with* the document. A compile request may
//! carry an `assets` array; each entry is a name and its bytes (base64), and the
//! name is what the document refers to. Fonts arrive the same way, on the same
//! channel, and are simply handed to the font book instead of the file resolver.

use base64::Engine as _;

/// One asset accompanying a compile request.
#[derive(Debug, Clone)]
pub struct Asset {
    /// The name the document refers to, e.g. `logo.png`. Used verbatim as the
    /// Typst path, so `#תמונה("logo.png")` resolves.
    pub name: String,
    pub bytes: Vec<u8>,
}

/// Everything a request carries alongside the document body.
#[derive(Debug, Clone, Default)]
pub struct Assets {
    /// Files the document can `image()` / `#תמונה` by name.
    pub files: Vec<Asset>,
    /// Extra font files to make available for this compile, on top of the
    /// bundled ones. The font's own family name (from the font file) is what
    /// `#גופן_שונה` / the settings font picker must use.
    pub fonts: Vec<Asset>,
}

impl Assets {
    pub fn is_empty(&self) -> bool {
        self.files.is_empty() && self.fonts.is_empty()
    }

    /// Read the `assets` and `fonts` arrays of a compile request.
    ///
    /// Each entry is `{name, data}` where `data` is base64 (a `data:` URL prefix
    /// is tolerated, since that is what a browser's FileReader hands you).
    /// Entries that are not decodable are dropped rather than failing the whole
    /// compile — one bad image should not cost the writer their preview.
    pub fn from_json(v: &serde_json::Value) -> Assets {
        Assets {
            files: read_list(v.get("assets")),
            fonts: read_list(v.get("fonts")),
        }
    }
}

fn read_list(v: Option<&serde_json::Value>) -> Vec<Asset> {
    let Some(arr) = v.and_then(|x| x.as_array()) else {
        return Vec::new();
    };
    arr.iter().filter_map(read_one).collect()
}

fn read_one(v: &serde_json::Value) -> Option<Asset> {
    let name = v.get("name")?.as_str()?.to_string();
    let data = v.get("data")?.as_str()?;
    // A browser FileReader produces "data:image/png;base64,AAAA…" — accept both
    // that and a bare base64 payload.
    let payload = match data.find(";base64,") {
        Some(i) => &data[i + 8..],
        None => data,
    };
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(payload.trim())
        .ok()?;
    if name.is_empty() || bytes.is_empty() {
        return None;
    }
    Some(Asset { name, bytes })
}
