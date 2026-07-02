export type NodeType =
  | 'text'
  | 'bold'
  | 'italic'
  | 'underline'
  | 'strikethrough'
  | 'heading'
  | 'unorderedList'
  | 'orderedList'
  | 'listItem'
  | 'footnote'
  | 'footnoteFlat'
  | 'table'
  | 'tableRow'
  | 'tableCell'
  | 'alignCenter'
  | 'alignRight'
  | 'alignLeft'
  | 'largeText'
  | 'smallText'
  | 'unknown';

export interface ASTNode {
  type: NodeType;
  text?: string;
  children?: ASTNode[];
  value?: string; // custom info e.g. heading level, command name
  sourceStart: number;
  sourceEnd: number;
}

export interface TypstCommand {
  hebrewName: string;
  englishName: string;
  description: string;
  example: string;
  category: 'Style' | 'Structure' | 'Layout' | 'Table' | 'Footnote';
  typstTemplate: string;
}

export interface DocumentTemplate {
  id: string;
  name: string;
  hebrewName: string;
  description: string;
  hebrewDescription: string;
  content: string;
}

export interface EditorConfig {
  mode: 'prose' | 'source';
  showToolbar: boolean;
  autoSave: boolean;
  footnoteStyle: 'hierarchical' | 'stacked';
  fontFamily: string;
  fontSize: number;
  margins: number; // in px
}
