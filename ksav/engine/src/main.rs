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

use ksav_engine::{compile_with, docfile};

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

    // The output directory, and the two ways this used to lie about it.
    //
    // There is no `-o` flag; `usage` documents a bare positional. Somebody typed
    // the flag anyway, and the CLI made a **directory called `-o`**, wrote
    // eleven pages of SVG and two PDFs into it, ignored the real output
    // directory in `args[3]`, and printed a success line. The evidence sat in
    // this repository as an untracked `engine/-o/`.
    //
    // So an option-shaped output argument is a usage error — the same treatment
    // `git.rs::plain` gives an argument that begins with a dash, for the same
    // reason — and an argument nobody has a use for is refused rather than
    // dropped. Silently ignoring `args[3]` is how the `-o` run looked like it
    // had worked.
    if let Some(bad) = args.get(2).filter(|a| a.starts_with('-')) {
        eprintln!("error: unexpected option {bad}; the output directory is a bare path");
        usage(&mut std::io::stderr());
        return ExitCode::from(2);
    }
    if let Some(extra) = args.get(3) {
        eprintln!("error: unexpected argument {extra}");
        usage(&mut std::io::stderr());
        return ExitCode::from(2);
    }
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

    // A `.ksav` is not always its own text.
    //
    // `read_to_string` above is the whole file; `docfile::read` is what is
    // *inside* it. A document carrying an image, its own page setup or its own
    // commands is written as JSON by `serializeDoc`, and this binary used to
    // hand that wrapper to the compiler and print a success line over a PDF of
    // `{"format": "ksav-document", …}`. The usage text has said `<input.ksav>`
    // since the day the CLI existed.
    //
    // The page setup matters as much as the unwrapping did: this compiled with
    // `DocConfig::default()`, so a sefer set to A5 with a gutter came out of the
    // CLI as shipped-default A4 — a PDF that disagreed with the application's
    // preview and said nothing about why.
    let doc = docfile::read(&body);
    let source = doc.source();

    // A hash with no bytes behind it cannot happen in a file the editor wrote —
    // a file always carries its bytes — so this is a hand-edited or truncated
    // document, and the image would otherwise simply fail to resolve with no
    // hint as to which one or why.
    for name in &doc.missing_assets {
        eprintln!(
            "warning: {} refers to an asset that is not in the file ({name})",
            input.display()
        );
    }

    let started = std::time::Instant::now();
    let result = compile_with(&source, &doc.cfg, &doc.assets);
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
    // Lines are counted in what the compiler was handed, and what it was handed
    // begins with the document's own `#let` preamble. `Diagnostic::line` says so
    // in as many words — *"a caller that prepends anything subtracts its own
    // line count. It knows what it added; the engine does not."* — and this is
    // that subtraction. Without it every diagnostic in a document that defines
    // one command names a line two further down than the writer's.
    //
    // A diagnostic that lands *inside* the preamble is not a line of the
    // writer's document at all, so it is said in those words rather than
    // clamped to line 1, which would point at innocent text.
    let preamble = doc.preamble_lines();
    for d in &result.diagnostics {
        let mut d = d.clone();
        if preamble > 0 && d.file.is_none() {
            match d.line {
                Some(line) if line > preamble => d.line = Some(line - preamble),
                Some(_) => {
                    d.line = None;
                    d.column = None;
                    d.message
                        .push_str(" — in this document's own commands, not in its text");
                }
                None => {}
            }
        }
        eprintln!("{}", d.one_line(&whose));
    }

    if let Some(pdf) = &result.pdf {
        let pdf_path = out_dir.join(format!("{stem}.pdf"));
        if let Err(e) = std::fs::write(&pdf_path, pdf) {
            eprintln!("error: cannot write {}: {e}", pdf_path.display());
            return ExitCode::from(1);
        }
        // The page images, and whether they arrived.
        //
        // This was `let _ = std::fs::write(...)` under a `✓ compiled … (43
        // page(s))` and an exit code of 0. A full disk, a read-only directory or
        // a path too long produced the success line with no SVGs on disk and
        // nothing said — which is exactly the class of small lie the PDF write
        // three lines up is checked to avoid, in the same loop body's sibling.
        let mut failed = 0usize;
        for (i, svg) in result.pages_svg.iter().enumerate() {
            let svg_path = out_dir.join(format!("{stem}.page-{}.svg", i + 1));
            if let Err(e) = std::fs::write(&svg_path, svg) {
                eprintln!("error: cannot write {}: {e}", svg_path.display());
                failed += 1;
            }
        }
        println!(
            "✓ compiled {} → {} ({} page(s), {} bytes PDF) in {:.0}ms",
            input.display(),
            pdf_path.display(),
            result.pages_svg.len(),
            pdf.len(),
            elapsed.as_secs_f64() * 1000.0,
        );
        if failed > 0 {
            eprintln!(
                "✗ {failed} of {} page image(s) could not be written",
                result.pages_svg.len()
            );
            return ExitCode::from(1);
        }
        ExitCode::SUCCESS
    } else {
        eprintln!(
            "✗ compilation failed ({} diagnostic(s))",
            result.diagnostics.len()
        );
        ExitCode::from(1)
    }
}
