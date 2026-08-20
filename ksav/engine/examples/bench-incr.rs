//! Does a second compile after a one-word edit cost the whole book again?
use ksav_engine::{compile_doc, DocConfig};
use std::time::Instant;

fn doc(rows: usize, tweak: &str) -> String {
    let w = "בראשית ברא אלקים את השמים ואת הארץ והארץ היתה תהו ובהו וחשך על פני תהום";
    let mut s = String::from("#table(columns: (1fr, 2fr), stroke: none,\n");
    for d in 1..=rows {
        s.push_str("[\n");
        for i in 1..=14 {
            s.push_str(&format!("P{d}.{i} {w}\n\n"));
        }
        s.push_str("],\n[\n");
        for i in 1..=14 {
            s.push_str(&format!("G{d}.{i} {w} {w}\n\n"));
        }
        s.push_str("],\n");
    }
    s.push_str(&format!("[{tweak}],[{tweak}],\n)"));
    s
}

fn main() {
    let cfg = DocConfig::default();
    for rows in [40usize, 100, 200] {
        let a = doc(rows, "x");
        let b = doc(rows, "y"); // one character different, at the END
        let t0 = Instant::now();
        let r1 = compile_doc(&a, &cfg);
        let cold = t0.elapsed();
        let pages = r1.map(|d| d.pages().len()).unwrap_or(0);
        let t1 = Instant::now();
        let _ = compile_doc(&a, &cfg); // identical input, warm
        let same = t1.elapsed();
        let t2 = Instant::now();
        let _ = compile_doc(&b, &cfg); // one-char edit, warm
        let edit = t2.elapsed();
        println!("rows={rows:3} pages={pages:4}  cold={:7.0}ms  recompile-identical={:7.0}ms  after-1-char-edit={:7.0}ms",
                 cold.as_secs_f64()*1000.0, same.as_secs_f64()*1000.0, edit.as_secs_f64()*1000.0);
    }
}
