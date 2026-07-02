//! Ksav CLI — compile a `.ksav` Hebrew document to PDF + SVG.
//!
//! Usage:
//!   ksav <input.ksav> [output_dir]
//!
//! Writes `<name>.pdf` and `<name>.page-N.svg` into the output dir
//! (default: alongside the input) and prints any compiler diagnostics.

use std::path::{Path, PathBuf};
use std::process::ExitCode;

use ksav_engine::{compile, DocConfig};

fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().collect();
    if args.len() < 2 {
        eprintln!("usage:");
        eprintln!("  ksav <input.ksav> [output_dir]   compile to PDF + SVG");
        eprintln!("  ksav serve [addr]                launch the web editor (default 127.0.0.1:7878)");
        return ExitCode::from(2);
    }

    if args[1] == "serve" {
        let addr = args.get(2).map(String::as_str).unwrap_or("127.0.0.1:7878");
        ksav_engine::server::serve(addr);
        return ExitCode::SUCCESS;
    }

    let input = PathBuf::from(&args[1]);
    let body = match std::fs::read_to_string(&input) {
        Ok(s) => s,
        Err(e) => {
            eprintln!("error: cannot read {}: {e}", input.display());
            return ExitCode::from(2);
        }
    };

    let out_dir: PathBuf = args
        .get(2)
        .map(PathBuf::from)
        .unwrap_or_else(|| input.parent().unwrap_or(Path::new(".")).to_path_buf());
    if let Err(e) = std::fs::create_dir_all(&out_dir) {
        eprintln!("error: cannot create {}: {e}", out_dir.display());
        return ExitCode::from(2);
    }
    let stem = input
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("document");

    let started = std::time::Instant::now();
    let result = compile(&body, &DocConfig::default());
    let elapsed = started.elapsed();

    // Report diagnostics from the real Typst compiler.
    for d in &result.diagnostics {
        eprintln!("[{}] {}", d.severity, d.message);
    }

    if let Some(pdf) = &result.pdf {
        let pdf_path = out_dir.join(format!("{stem}.pdf"));
        if let Err(e) = std::fs::write(&pdf_path, pdf) {
            eprintln!("error: cannot write {}: {e}", pdf_path.display());
            return ExitCode::from(1);
        }
        for (i, svg) in result.pages_svg.iter().enumerate() {
            let svg_path = out_dir.join(format!("{stem}.page-{}.svg", i + 1));
            let _ = std::fs::write(&svg_path, svg);
        }
        println!(
            "✓ compiled {} → {} ({} page(s), {} bytes PDF) in {:.0}ms",
            input.display(),
            pdf_path.display(),
            result.pages_svg.len(),
            pdf.len(),
            elapsed.as_secs_f64() * 1000.0,
        );
        ExitCode::SUCCESS
    } else {
        eprintln!("✗ compilation failed ({} diagnostic(s))", result.diagnostics.len());
        ExitCode::from(1)
    }
}
