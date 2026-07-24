use serde::{Serialize, Deserialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum NodeType {
    Text,
    Bold,
    Italic,
    Underline,
    Strikethrough,
    Heading,
    UnorderedList,
    OrderedList,
    ListItem,
    Footnote,
    FootnoteFlat,
    Table,
    TableRow,
    TableCell,
    AlignCenter,
    AlignRight,
    AlignLeft,
    LargeText,
    SmallText,
    Unknown,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ASTNode {
    pub r#type: NodeType,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub value: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub children: Option<Vec<ASTNode>>,
    pub source_start: usize,
    pub source_end: usize,
}

pub fn get_node_type(name: &str) -> NodeType {
    match name {
        "הדגשה" => NodeType::Bold,
        "נטוי" => NodeType::Italic,
        "קו_תחתון" => NodeType::Underline,
        "קו_חוצה" => NodeType::Strikethrough,
        "כותרת1" | "כותרת2" | "כותרת3" => NodeType::Heading,
        "רשימה" => NodeType::UnorderedList,
        "רשימה_ממוספרת" => NodeType::OrderedList,
        "פריט" => NodeType::ListItem,
        "הערה" => NodeType::Footnote,
        "הערהשטוחה" => NodeType::FootnoteFlat,
        "טבלה" => NodeType::Table,
        "שורה" => NodeType::TableRow,
        "תא" => NodeType::TableCell,
        "מרכז" => NodeType::AlignCenter,
        "ימין" => NodeType::AlignRight,
        "שמאל" => NodeType::AlignLeft,
        "כתב_גדול" => NodeType::LargeText,
        "כתב_קטן" => NodeType::SmallText,
        _ => NodeType::Unknown,
    }
}

/// Recursive Hebrew Ksav Markup Parser
pub fn parse_ksav_markup(src: &str) -> Vec<ASTNode> {
    let mut nodes = Vec::new();
    let chars: Vec<char> = src.chars().collect();
    let mut i = 0;

    while i < chars.len() {
        if chars[i] == '#' && i + 1 < chars.len() && chars[i + 1] != ' ' {
            let name_start = i + 1;
            let mut name_end = name_start;

            // Hebrew characters range (\u{0590} to \u{05FF}), English letters, digits, and underscores
            while name_end < chars.len() {
                let c = chars[name_end];
                if c.is_alphanumeric() || c == '_' || (c >= '\u{0590}' && c <= '\u{05FF}') {
                    name_end += 1;
                } else {
                    break;
                }
            }

            let cmd_name: String = chars[name_start..name_end].iter().collect();

            if !cmd_name.is_empty() && name_end < chars.len() && chars[name_end] == '[' {
                let bracket_start = name_end;
                let mut depth = 1;
                let mut j = name_end + 1;

                while j < chars.len() && depth > 0 {
                    if chars[j] == '[' {
                        depth += 1;
                    } else if chars[j] == ']' {
                        depth -= 1;
                    }
                    j += 1;
                }

                // Extract content inside brackets
                let content: String = chars[bracket_start + 1..j - 1].iter().collect();
                let children = parse_ksav_markup(&content);

                nodes.push(ASTNode {
                    r#type: get_node_type(&cmd_name),
                    value: Some(cmd_name.clone()),
                    text: None,
                    children: Some(children),
                    source_start: i,
                    source_end: j,
                });
                i = j;
            } else {
                nodes.push(ASTNode {
                    r#type: NodeType::Text,
                    value: None,
                    text: Some(format!("#{}", cmd_name)),
                    children: None,
                    source_start: i,
                    source_end: name_end,
                });
                i = name_end;
            }
        } else {
            // Find next '#'
            let mut next_hash = i;
            while next_hash < chars.len() {
                if chars[next_hash] == '#' {
                    break;
                }
                next_hash += 1;
            }

            let plain: String = chars[i..next_hash].iter().collect();
            if !plain.is_empty() {
                nodes.push(ASTNode {
                    r#type: NodeType::Text,
                    value: None,
                    text: Some(plain),
                    children: None,
                    source_start: i,
                    source_end: next_hash,
                });
            }
            i = next_hash;
        }
    }
    nodes
}

/// Translates the AST structure directly into standard Typst markup code
pub fn translate_ast_to_typst(nodes: &[ASTNode]) -> String {
    let mut out = String::new();
    for node in nodes {
        match node.r#type {
            NodeType::Text => {
                if let Some(ref txt) = node.text {
                    out.push_str(txt);
                }
            }
            _ => {
                let children_typst = if let Some(ref children) = node.children {
                    translate_ast_to_typst(children)
                } else {
                    String::new()
                };

                let val = node.value.clone().unwrap_or_default();
                let typst_pattern = match val.as_str() {
                    "הדגשה" => format!("#text(weight: \"bold\")[{}]", children_typst),
                    "נטוי" => format!("#text(style: \"italic\")[{}]", children_typst),
                    "קו_תחתון" => format!("#underline[{}]", children_typst),
                    "קו_חוצה" => format!("#strike[{}]", children_typst),
                    "כותרת1" => format!("#heading(level: 1)[{}]", children_typst),
                    "כותרת2" => format!("#heading(level: 2)[{}]", children_typst),
                    "כותרת3" => format!("#heading(level: 3)[{}]", children_typst),
                    "רשימה" => format!("#list[{}]", children_typst),
                    "רשימה_ממוספרת" => format!("#enum[{}]", children_typst),
                    "פריט" => format!("- [{}]", children_typst),
                    "הערה" => format!("#footnote[{}]", children_typst),
                    "הערהשטוחה" => format!("#footnote(style: \"flat\")[{}]", children_typst),
                    "מרכז" => format!("#align(center)[{}]", children_typst),
                    "ימין" => format!("#align(right)[{}]", children_typst),
                    "שמאל" => format!("#align(left)[{}]", children_typst),
                    "כתב_גדול" => format!("#text(size: 1.2em)[{}]", children_typst),
                    "כתב_קטן" => format!("#text(size: 0.8em)[{}]", children_typst),
                    _ => format!("#{}[{}]", val, children_typst),
                };
                out.push_str(&typst_pattern);
            }
        }
    }
    out
}
