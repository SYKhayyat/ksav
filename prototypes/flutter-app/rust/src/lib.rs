pub mod parser;
pub mod html_renderer;

use std::ffi::{CStr, CString};
use std::os::raw::c_char;
use crate::parser::{parse_ksav_markup, translate_ast_to_typst};
use crate::html_renderer::{HTMLRenderer, CustomStyle};

/// Helper to convert safe Rust string from C string pointer
fn parse_c_str(ptr: *const c_char) -> String {
    if ptr.is_null() {
        return String::new();
    }
    unsafe {
        CStr::from_ptr(ptr)
            .to_str()
            .unwrap_or("")
            .to_string()
    }
}

/// Helper to convert Rust String back to heap-allocated C string pointer for Dart
fn return_c_str(s: String) -> *mut c_char {
    let c_str = CString::new(s).unwrap_or_else(|_| CString::new("").unwrap());
    c_str.into_raw()
}

/// Exposes AST-to-HTML Compilation to Flutter/Dart FFI
/// Highly optimized and zero-copy string references where possible
#[no_mangle]
pub extern "C" fn parse_and_render_to_html(
    src: *const c_char,
    title: *const c_char,
    font_family: *const c_char,
    font_size: usize,
    margin: usize,
    footnote_style: *const c_char,
    custom_styles_json: *const c_char,
) -> *mut c_char {
    let src_rust = parse_c_str(src);
    let title_rust = parse_c_str(title);
    let font_family_rust = parse_c_str(font_family);
    let footnote_style_rust = parse_c_str(footnote_style);
    let custom_styles_json_rust = parse_c_str(custom_styles_json);

    // 1. Parse the document into AST (Rust parser)
    let ast = parse_ksav_markup(&src_rust);

    // Parse custom styles JSON, fallback to empty vector if parsing fails
    let custom_styles: Vec<CustomStyle> = serde_json::from_str(&custom_styles_json_rust)
        .unwrap_or_else(|_| Vec::new());

    // 2. Instantiate Renderer
    let renderer = HTMLRenderer::new(&footnote_style_rust, custom_styles);

    // 3. Render into Full HTML Document
    let compiled_html = renderer.compile_full_html(
        &title_rust,
        &ast,
        &font_family_rust,
        font_size,
        margin,
    );

    return_c_str(compiled_html)
}

/// Exposes Ksav-to-Typst Compilation to Flutter/Dart FFI
#[no_mangle]
pub extern "C" fn parse_to_typst(src: *const c_char) -> *mut c_char {
    let src_rust = parse_c_str(src);
    let ast = parse_ksav_markup(&src_rust);
    let typst_markup = translate_ast_to_typst(&ast);
    return_c_str(typst_markup)
}

/// Safely frees a string allocated by Rust on the heap.
/// This prevents memory leaks in the Dart VM.
#[no_mangle]
pub extern "C" fn free_string(ptr: *mut c_char) {
    if !ptr.is_null() {
        unsafe {
            let _ = CString::from_raw(ptr);
        }
    }
}
