//! Ksav CLI — compile a `.ksav` Hebrew document to PDF + SVG.
//!
//! Usage:
//!   ksav <input.ksav> [output_dir]
//!
//! Writes `<name>.pdf` and `<name>.page-N.svg` into the output dir
//! (default: alongside the input) and prints any compiler diagnostics.

use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::ExitCode;

use ksav_engine::{compile, DocConfig};

/// The usage text, written wherever it is asked for.
///
/// One copy, so the text somebody gets by asking is the text they get by
/// getting it wrong. It used to exist only on the no-arguments path, which
/// meant `ksav --help` fell through to the compile path and came back as
/// `error: cannot read --help: The system cannot find the file specified` —
/// the usage was right there and unreachable by the obvious route.
fn usage(to: &mut dyn Write) {
    let _ = writeln!(to, "usage:");
    let _ = writeln!(
        to,
        "  ksav <input.ksav> [output_dir]   compile to PDF + SVG"
    );
    let _ = writeln!(
        to,
        "  ksav serve [addr]                launch the web editor (default 127.0.0.1:7878)"
    );
    let _ = writeln!(to, "  ksav --help                      this text");
    let _ = writeln!(to, "  ksav --version                   which Ksav this is");
}

fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().collect();
    match args.get(1).map(String::as_str) {
        // Asked for, so it goes to stdout and succeeds. Asking for help and
        // being handed a non-zero exit is the same class of small lie as the
        // rest of this file's exit codes exist to avoid.
        Some("--help" | "-h" | "help") => {
            usage(&mut std::io::stdout());
            return ExitCode::SUCCESS;
        }
        Some("--version" | "-V") => {
            println!("ksav {}", env!("CARGO_PKG_VERSION"));
            return ExitCode::SUCCESS;
        }
        // Not asked for: stderr, and 2 — a usage error, like everywhere else.
        None => {
            usage(&mut std::io::stderr());
            return ExitCode::from(2);
        }
        Some(_) => {}
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

    // Report diagnostics from the real Typst compiler, *where they are*.
    //
    // This printed `[severity] message` and nothing else, for as long as the CLI
    // has existed — while the engine was computing a line, a column, the command
    // the trouble is about and a spelling suggestion for every one of them,
    // because the browser editor puts a mark in its gutter. So a writer
    // compiling a sefer here read "the command here is missing an argument:
    // body" with no idea which command or which of three hundred lines.
    //
    // `Diagnostic::one_line` is where that is written now, once, so the Emacs
    // client says the same thing.
    let whose = input.display().to_string();
    for d in &result.diagnostics {
        eprintln!("{}", d.one_line(&whose));
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
        eprintln!(
            "✗ compilation failed ({} diagnostic(s))",
            result.diagnostics.len()
        );
        ExitCode::from(1)
    }
}
