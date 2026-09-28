use ksav_engine::{compile, DocConfig};
fn main() {
    // A grammar error deep in a document: does it carry a line and a column?
    let body = format!("#שער[מסמך]\n\n{}\n\n{}. {}\n\nטקסט.\n",
        "פסקה ראשונה.".repeat(3), "מ. ג. א. עם הערה שבורה", "ג. עם הערה שבורה");
    let out = compile(&body, &DocConfig::default());
    for d in out.diagnostics.iter().take(4) {
        println!("[{}] line={:?} col={:?} about={:?}\n   {}", d.severity, d.line, d.column, d.about, d.message.chars().take(80).collect::<String>());
    }
}
