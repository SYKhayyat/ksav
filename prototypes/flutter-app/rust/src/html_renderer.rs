use crate::parser::{ASTNode, NodeType};
use serde::{Serialize, Deserialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomStyle {
    pub name: String,
    pub font_family: Option<String>,
    pub font_size: Option<String>,
    pub color: Option<String>,
    pub bg_color: Option<String>,
    pub text_align: Option<String>,
    pub font_weight: Option<String>,
    pub text_decoration: Option<String>,
    pub border: Option<String>,
    pub padding: Option<String>,
    pub is_block: Option<bool>,
}

pub struct FootnoteItem {
    pub num: String,
    pub content: String,
    pub level: usize,
}

pub struct HTMLRenderer {
    pub footnote_style: String, // "hierarchical" or "stacked"
    pub custom_styles: Vec<CustomStyle>,
}

impl HTMLRenderer {
    pub fn new(footnote_style: &str, custom_styles: Vec<CustomStyle>) -> Self {
        HTMLRenderer {
            footnote_style: footnote_style.to_string(),
            custom_styles,
        }
    }

    /// Recursively traverse the AST to extract and number footnotes
    pub fn collect_footnotes(&self, nodes: &[ASTNode], parent_num: Option<String>, level: usize, flat_counter: &mut usize, footnotes: &mut Vec<FootnoteItem>) {
        let mut child_counter = 1;

        for node in nodes {
            let is_footnote = node.r#type == NodeType::Footnote || node.r#type == NodeType::FootnoteFlat;

            if is_footnote {
                let num_str = if self.footnote_style == "stacked" {
                    let num = *flat_counter;
                    *flat_counter += 1;
                    num.to_string()
                } else {
                    match &parent_num {
                        Some(p) => format!("{}.{}", p, child_counter),
                        None => {
                            let num = child_counter;
                            child_counter += 1;
                            num.to_string()
                        }
                    }
                };

                let footnote_content = if let Some(ref children) = node.children {
                    self.render_nodes_to_html_snippet(children)
                } else {
                    String::new()
                };

                footnotes.push(FootnoteItem {
                    num: num_str.clone(),
                    content: footnote_content,
                    level,
                });

                // Trailing recursive footnotes inside this footnote
                if let Some(ref children) = node.children {
                    self.collect_footnotes(children, Some(num_str), level + 1, flat_counter, footnotes);
                }
            } else if let Some(ref children) = node.children {
                self.collect_footnotes(children, parent_num.clone(), level, flat_counter, footnotes);
            }
        }
    }

    /// Render a slice of ASTNodes into HTML
    pub fn render_nodes_to_html_snippet(&self, nodes: &[ASTNode]) -> String {
        let mut out = String::new();
        let mut footnote_ref_counter = 1; // resets per snippet context if needed, but we keep track of globally numbered ones

        for node in nodes {
            match node.r#type {
                NodeType::Text => {
                    if let Some(ref txt) = node.text {
                        // Replace multiple newlines with breaks or keep them for RTL
                        let escaped = txt.replace('\n', "<br/>");
                        out.push_str(&escaped);
                    }
                }
                NodeType::Bold => {
                    out.push_str("<strong>");
                    out.push_str(&self.render_nodes_to_html_snippet(node.children.as_ref().unwrap_or(&vec![])));
                    out.push_str("</strong>");
                }
                NodeType::Italic => {
                    out.push_str("<em>");
                    out.push_str(&self.render_nodes_to_html_snippet(node.children.as_ref().unwrap_or(&vec![])));
                    out.push_str("</em>");
                }
                NodeType::Underline => {
                    out.push_str("<span style=\"text-decoration: underline;\">");
                    out.push_str(&self.render_nodes_to_html_snippet(node.children.as_ref().unwrap_or(&vec![])));
                    out.push_str("</span>");
                }
                NodeType::Strikethrough => {
                    out.push_str("<span style=\"text-decoration: line-through;\">");
                    out.push_str(&self.render_nodes_to_html_snippet(node.children.as_ref().unwrap_or(&vec![])));
                    out.push_str("</span>");
                }
                NodeType::Heading => {
                    let level = match node.value.as_deref() {
                        Some("כותרת1") => 1,
                        Some("כותרת2") => 2,
                        Some("כותרת3") => 3,
                        _ => 1,
                    };
                    out.push_str(&format!("<h{level} class=\"heading-level-{level}\">"));
                    out.push_str(&self.render_nodes_to_html_snippet(node.children.as_ref().unwrap_or(&vec![])));
                    out.push_str(&format!("</h{level}>"));
                }
                NodeType::UnorderedList => {
                    out.push_str("<ul>");
                    out.push_str(&self.render_nodes_to_html_snippet(node.children.as_ref().unwrap_or(&vec![])));
                    out.push_str("</ul>");
                }
                NodeType::OrderedList => {
                    out.push_str("<ol>");
                    out.push_str(&self.render_nodes_to_html_snippet(node.children.as_ref().unwrap_or(&vec![])));
                    out.push_str("</ol>");
                }
                NodeType::ListItem => {
                    out.push_str("<li>");
                    out.push_str(&self.render_nodes_to_html_snippet(node.children.as_ref().unwrap_or(&vec![])));
                    out.push_str("</li>");
                }
                NodeType::Footnote | NodeType::FootnoteFlat => {
                    // Inline footnote superscript references
                    // In a simple offline rendering we show bracketed superscripts
                    out.push_str("<sup class=\"footnote-ref\">[fn]</sup>");
                }
                NodeType::Table => {
                    out.push_str("<table class=\"ksav-table\">");
                    out.push_str(&self.render_nodes_to_html_snippet(node.children.as_ref().unwrap_or(&vec![])));
                    out.push_str("</table>");
                }
                NodeType::TableRow => {
                    out.push_str("<tr>");
                    out.push_str(&self.render_nodes_to_html_snippet(node.children.as_ref().unwrap_or(&vec![])));
                    out.push_str("</tr>");
                }
                NodeType::TableCell => {
                    out.push_str("<td>");
                    out.push_str(&self.render_nodes_to_html_snippet(node.children.as_ref().unwrap_or(&vec![])));
                    out.push_str("</td>");
                }
                NodeType::AlignCenter => {
                    out.push_str("<div class=\"align-center\" style=\"text-align: center;\">");
                    out.push_str(&self.render_nodes_to_html_snippet(node.children.as_ref().unwrap_or(&vec![])));
                    out.push_str("</div>");
                }
                NodeType::AlignRight => {
                    out.push_str("<div class=\"align-right\" style=\"text-align: right;\">");
                    out.push_str(&self.render_nodes_to_html_snippet(node.children.as_ref().unwrap_or(&vec![])));
                    out.push_str("</div>");
                }
                NodeType::AlignLeft => {
                    out.push_str("<div class=\"align-left\" style=\"text-align: left; direction: ltr;\">");
                    out.push_str(&self.render_nodes_to_html_snippet(node.children.as_ref().unwrap_or(&vec![])));
                    out.push_str("</div>");
                }
                NodeType::LargeText => {
                    out.push_str("<span class=\"text-large\" style=\"font-size: 1.25em;\">");
                    out.push_str(&self.render_nodes_to_html_snippet(node.children.as_ref().unwrap_or(&vec![])));
                    out.push_str("</span>");
                }
                NodeType::SmallText => {
                    out.push_str("<span class=\"text-small\" style=\"font-size: 0.85em; color: #555;\">");
                    out.push_str(&self.render_nodes_to_html_snippet(node.children.as_ref().unwrap_or(&vec![])));
                    out.push_str("</span>");
                }
                _ => {
                    // Check if it's a custom style!
                    let val = node.value.clone().unwrap_or_default();
                    if let Some(style) = self.custom_styles.iter().find(|s| s.name == val) {
                        let mut css = String::new();
                        if let Some(ref f) = style.font_family {
                            css.push_str(&format!("font-family: '{}'; ", f));
                        }
                        if let Some(ref sz) = style.font_size {
                            css.push_str(&format!("font-size: {}; ", sz));
                        }
                        if let Some(ref col) = style.color {
                            css.push_str(&format!("color: {}; ", col));
                        }
                        if let Some(ref bg) = style.bg_color {
                            css.push_str(&format!("background-color: {}; ", bg));
                        }
                        if let Some(ref align) = style.text_align {
                            css.push_str(&format!("text-align: {}; ", align));
                        }
                        if let Some(ref weight) = style.font_weight {
                            css.push_str(&format!("font-weight: {}; ", weight));
                        }
                        if let Some(ref dec) = style.text_decoration {
                            css.push_str(&format!("text-decoration: {}; ", dec));
                        }
                        if let Some(ref b) = style.border {
                            css.push_str(&format!("border: {}; ", b));
                        }
                        if let Some(ref p) = style.padding {
                            css.push_str(&format!("padding: {}; ", p));
                        }
                        
                        let display_type = if style.is_block.unwrap_or(false) { "block" } else { "inline-block" };
                        out.push_str(&format!("<span class=\"custom-style-{}\" style=\"display: {}; {}\">", val, display_type, css));
                        out.push_str(&self.render_nodes_to_html_snippet(node.children.as_ref().unwrap_or(&vec![])));
                        out.push_str("</span>");
                    } else {
                        // Unknown commands fall back to rendering children
                        out.push_str(&self.render_nodes_to_html_snippet(node.children.as_ref().unwrap_or(&vec![])));
                    }
                }
            }
        }
        out
    }

    /// Full HTML compiler: creates a fully styled print-ready A4 document
    pub fn compile_full_html(&self, title: &str, nodes: &[ASTNode], font_family: &str, font_size_px: usize, margins_px: usize) -> String {
        let mut flat_counter = 1;
        let mut footnotes = Vec::new();
        self.collect_footnotes(nodes, None, 0, &mut flat_counter, &mut footnotes);

        // Render the body text
        let main_body = self.render_nodes_to_html_snippet(nodes);

        // Replace superscript markers with correct indices
        let mut numbered_body = String::new();
        let mut fn_idx = 0;
        let mut split_parts = main_body.split("<sup class=\"footnote-ref\">[fn]</sup>");
        
        if let Some(first) = split_parts.next() {
            numbered_body.push_str(first);
        }
        
        for part in split_parts {
            if fn_idx < footnotes.len() {
                let fn_num = &footnotes[fn_idx].num;
                numbered_body.push_str(&format!(
                    "<a href=\"#fn-bottom-{}\" id=\"fn-ref-{}\" class=\"footnote-link\"><sup>{}</sup></a>",
                    fn_num, fn_num, fn_num
                ));
                fn_idx += 1;
            }
            numbered_body.push_str(part);
        }

        // Render the footer footnotes block
        let mut footnotes_html = String::new();
        if !footnotes.is_empty() {
            footnotes_html.push_str("<div class=\"footnotes-section\">");
            footnotes_html.push_str("<hr class=\"footnotes-divider\" />");
            footnotes_html.push_str("<ol class=\"footnotes-list\">");
            for f in footnotes {
                let indent_px = f.level * 16;
                let child_border_class = if f.level > 0 { "border-right: 2px solid #ddd; margin-right: 8px; padding-right: 8px;" } else { "" };
                footnotes_html.push_str(&format!(
                    "<li id=\"fn-bottom-{}\" style=\"padding-right: {}px; {}\"><strong>{}.</strong> {}</li>",
                    f.num, indent_px, child_border_class, f.num, f.content
                ));
            }
            footnotes_html.push_str("</ol>");
            footnotes_html.push_str("</div>");
        }

        // Build complete beautiful HTML
        format!(
            r#"<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
    <meta charset="UTF-8">
    <title>{}</title>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Frank+Ruhl+Libre:wght@300;400;500;700;900&family=Rubik:ital,wght@0,300..900;1,300..900&display=swap');
        
        body {{
            font-family: '{}', 'Rubik', serif;
            font-size: {}px;
            line-height: 1.6;
            color: #1a1a1a;
            background: #ffffff;
            margin: 0;
            padding: {}px;
            direction: rtl;
            text-align: justify;
        }}
        
        h1, h2, h3 {{
            color: #0c0c0c;
            font-family: 'Frank Ruhl Libre', serif;
            font-weight: 700;
            margin-top: 1.5em;
            margin-bottom: 0.5em;
            text-align: right;
        }}
        
        h1.heading-level-1 {{ font-size: 1.8em; border-b: 1px solid #eee; padding-bottom: 4px; }}
        h2.heading-level-2 {{ font-size: 1.4em; }}
        h3.heading-level-3 {{ font-size: 1.15em; }}
        
        p {{
            margin-bottom: 1.2em;
        }}
        
        strong {{
            font-weight: 700;
        }}
        
        em {{
            font-style: italic;
        }}
        
        ul, ol {{
            margin-bottom: 1.2em;
            padding-right: 24px;
        }}
        
        li {{
            margin-bottom: 0.4em;
        }}
        
        .footnote-link {{
            color: #2563eb;
            text-decoration: none;
            font-weight: bold;
            padding: 0 2px;
        }}
        
        .footnote-link:hover {{
            text-decoration: underline;
        }}
        
        .ksav-table {{
            width: 100%;
            border-collapse: collapse;
            margin: 1.5em 0;
            direction: rtl;
        }}
        
        .ksav-table td {{
            border: 1px solid #e2e8f0;
            padding: 8px 12px;
            font-size: 0.95em;
            text-align: right;
        }}
        
        .ksav-table tr:nth-child(even) {{
            background-color: #f8fafc;
        }}
        
        .footnotes-section {{
            margin-top: 3em;
            font-size: 0.85em;
            color: #4a5568;
            font-family: 'Frank Ruhl Libre', serif;
        }}
        
        .footnotes-divider {{
            border: 0;
            border-top: 1px solid #cbd5e1;
            width: 25%;
            margin-right: 0;
            margin-bottom: 1.5em;
        }}
        
        .footnotes-list {{
            list-style-type: none;
            padding-right: 0;
        }}
        
        .footnotes-list li {{
            margin-bottom: 0.6em;
            line-height: 1.5;
            text-align: justify;
        }}
        
        @media print {{
            body {{
                padding: 0;
                margin: 20mm;
            }}
            .footnote-link {{
                color: #000;
            }}
        }}
    </style>
</head>
<body>
    <div class="document-root">
        {}
        {}
    </div>
</body>
</html>"#,
            title, font_family, font_size_px, margins_px, numbered_body, footnotes_html
        )
    }
}
