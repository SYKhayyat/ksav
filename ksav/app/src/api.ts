// Backend abstraction. Today: HttpBackend (talks to the Rust `ksav serve`).
// M3 will add a WasmBackend with the identical interface so the app runs with
// no server. The rest of the app depends only on this interface.

export interface DocConfig {
  font: string;
  size_pt: number;
  margin_cm: number;
  dir: "rtl" | "ltr";
  numbering: boolean;
  justify: boolean;
  line_spacing_em: number;
  columns: number;
}

export interface Diagnostic {
  severity: "error" | "warning";
  message: string;
}

export interface CompileResult {
  ok: boolean;
  pages_svg: string[];
  pdf_base64: string | null;
  diagnostics: Diagnostic[];
  typst_source: string;
}

export interface CommandDef {
  he: string;
  en: string;
  category: string;
  desc_he: string;
  desc_en: string;
  insert: string;
}

export interface TemplateDef {
  id: string;
  he: string;
  en: string;
  category: string;
  desc_he: string;
  desc_en: string;
  body: string;
}

export interface Backend {
  compile(body: string, cfg: DocConfig): Promise<CompileResult>;
  commands(): Promise<CommandDef[]>;
  templates(): Promise<TemplateDef[]>;
}

export class HttpBackend implements Backend {
  constructor(private base = "") {}

  async compile(body: string, cfg: DocConfig): Promise<CompileResult> {
    const res = await fetch(this.base + "/compile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body, ...cfg }),
    });
    if (!res.ok) throw new Error(`compile ${res.status}`);
    return res.json();
  }

  async commands(): Promise<CommandDef[]> {
    const res = await fetch(this.base + "/commands");
    return res.json();
  }

  async templates(): Promise<TemplateDef[]> {
    const res = await fetch(this.base + "/templates");
    return res.json();
  }
}
