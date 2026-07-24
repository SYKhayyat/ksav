import React, { useState, useMemo } from 'react';
import { parseKsavMarkup, translateASTToTypst } from '../utils/parser';
import { ASTNode, EditorConfig } from '../types';
import { Copy, Check, FileText, Code, TreeDeciduous, Layout, Eye, ArrowLeftRight } from 'lucide-react';

interface LivePreviewProps {
  sourceText: string;
  config: EditorConfig;
  documentTitle: string;
}

export default function LivePreview({ sourceText, config, documentTitle }: LivePreviewProps) {
  const [activeTab, setActiveTab] = useState<'typeset' | 'typst' | 'ast'>('typeset');
  const [copied, setCopied] = useState(false);
  const [zoom, setZoom] = useState(100);

  // Parse the source text to AST
  const ast = useMemo(() => parseKsavMarkup(sourceText), [sourceText]);

  // Translate to pure Typst
  const typstCode = useMemo(() => translateASTToTypst(ast), [ast]);

  // Copy Typst code to clipboard
  const handleCopyTypst = () => {
    navigator.clipboard.writeText(typstCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Footnote collection system with hierarchical capability
  const collectedFootnotes = useMemo(() => {
    const footnotes: { id: string; num: string; node: ASTNode; level: number }[] = [];
    let flatCounter = 1;

    const traverse = (nodes: ASTNode[], parentNum?: string, level = 0) => {
      let childCounter = 1;
      nodes.forEach((node) => {
        const isFootnote = node.type === 'footnote' || node.type === 'footnoteFlat';
        if (isFootnote) {
          let numStr = '';
          if (config.footnoteStyle === 'stacked') {
            numStr = `${flatCounter++}`;
          } else {
            numStr = parentNum ? `${parentNum}.${childCounter++}` : `${childCounter++}`;
          }

          footnotes.push({
            id: `fn-${node.sourceStart}`,
            num: numStr,
            node,
            level,
          });

          if (node.children) {
            traverse(node.children, config.footnoteStyle === 'stacked' ? undefined : numStr, level + 1);
          }
        } else {
          if (node.children) {
            traverse(node.children, parentNum, level);
          }
        }
      });
    };

    traverse(ast);
    return footnotes;
  }, [ast, config.footnoteStyle]);

  // Helper to map AST nodes to React elements
  const renderNode = (node: ASTNode, index: number, parentType?: string): React.ReactNode => {
    const key = `${node.type}-${node.sourceStart}-${index}`;

    if (node.type === 'text') {
      return <span key={key}>{node.text}</span>;
    }

    const children = node.children
      ? node.children.map((child, idx) => renderNode(child, idx, node.type))
      : null;

    switch (node.type) {
      case 'bold':
        return <strong key={key} className="font-bold text-gray-900">{children}</strong>;
      case 'italic':
        return <em key={key} className="italic text-gray-800">{children}</em>;
      case 'underline':
        return <span key={key} className="underline underline-offset-4 decoration-gray-500">{children}</span>;
      case 'strikethrough':
        return <span key={key} className="line-through text-gray-400">{children}</span>;
      case 'heading': {
        const level = node.value === 'כותרת1' ? 1 : node.value === 'כותרת2' ? 2 : 3;
        const fontClass = config.fontFamily === 'Frank Ruhl Libre' ? 'font-serif' : 'font-sans';
        if (level === 1) {
          return (
            <h1 key={key} className={`text-2xl font-bold tracking-tight text-gray-900 mt-6 mb-3 pb-1 border-b border-gray-100 ${fontClass}`}>
              {children}
            </h1>
          );
        } else if (level === 2) {
          return (
            <h2 key={key} className={`text-xl font-semibold text-gray-800 mt-4 mb-2 ${fontClass}`}>
              {children}
            </h2>
          );
        } else {
          return (
            <h3 key={key} className={`text-lg font-medium text-gray-700 mt-3 mb-1 ${fontClass}`}>
              {children}
            </h3>
          );
        }
      }
      case 'unorderedList':
        return <ul key={key} className="list-disc list-inside mr-4 my-2 space-y-1">{children}</ul>;
      case 'orderedList':
        return <ol key={key} className="list-decimal list-inside mr-4 my-2 space-y-1">{children}</ol>;
      case 'listItem':
        return <li key={key} className="text-gray-700 leading-relaxed pr-1">{children}</li>;
      case 'footnote':
      case 'footnoteFlat': {
        const fnInfo = collectedFootnotes.find((fn) => fn.id === `fn-${node.sourceStart}`);
        if (!fnInfo) return null;
        return (
          <sup key={key} className="text-xs font-bold text-blue-600 hover:text-blue-800 cursor-pointer px-0.5" title="לחץ למעבר להערה">
            <a href={`#fn-bottom-${fnInfo.num}`}>{fnInfo.num}</a>
          </sup>
        );
      }
      case 'table':
        return (
          <div key={key} className="my-4 overflow-x-auto border border-gray-200 rounded-lg">
            <table className="w-full text-right border-collapse">
              <tbody className="divide-y divide-gray-200 bg-white">
                {children}
              </tbody>
            </table>
          </div>
        );
      case 'tableRow':
        return <tr key={key} className="hover:bg-gray-50 odd:bg-gray-50/50">{children}</tr>;
      case 'tableCell':
        return <td key={key} className="px-4 py-2 text-sm text-gray-700 font-normal border-x border-gray-200">{children}</td>;
      case 'alignCenter':
        return <div key={key} className="text-center w-full my-2">{children}</div>;
      case 'alignRight':
        return <div key={key} className="text-right w-full my-2">{children}</div>;
      case 'alignLeft':
        return <div key={key} className="text-left w-full my-2" dir="ltr">{children}</div>;
      case 'largeText':
        return <span key={key} className="text-lg leading-relaxed">{children}</span>;
      case 'smallText':
        return <span key={key} className="text-sm leading-relaxed text-gray-600">{children}</span>;
      default:
        return (
          <span key={key} className="bg-red-50 text-red-700 border border-red-100 rounded px-1 text-xs" title={`Unknown command: #${node.value}`}>
            {children}
          </span>
        );
    }
  };

  // Render footnote list at bottom of page
  const renderBottomFootnotes = () => {
    if (collectedFootnotes.length === 0) return null;

    return (
      <div className="mt-8 pt-4 border-t border-gray-300">
        <div className="w-24 border-t-2 border-gray-400 mb-3"></div>
        <ol className="space-y-1.5 text-xs text-gray-600 font-sans" dir="rtl">
          {collectedFootnotes.map((fn) => (
            <li
              key={fn.id}
              id={`fn-bottom-${fn.num}`}
              style={{ paddingRight: `${fn.level * 14}px` }}
              className={`flex items-start gap-1 hover:bg-yellow-50/50 p-1 rounded transition-colors ${
                fn.level > 0 ? 'border-r-2 border-blue-100 mr-2 pr-2' : ''
              }`}
            >
              <span className="font-bold text-blue-600 min-w-[14px]">{fn.num}.</span>
              <div className="flex-1 text-right">
                {fn.node.children?.map((child, idx) => renderNode(child, idx, fn.node.type))}
              </div>
            </li>
          ))}
        </ol>
      </div>
    );
  };

  // Visual AST Tree view
  const renderASTTree = (nodes: ASTNode[], depth = 0): React.ReactNode => {
    return (
      <div className="font-mono text-xs space-y-1">
        {nodes.map((node, i) => (
          <div key={i} className="pl-4 border-r border-gray-200" style={{ marginRight: `${depth * 12}px` }}>
            <div className="flex items-center gap-2 py-0.5">
              <span className={`px-1.5 py-0.2 rounded font-semibold text-[10px] uppercase ${
                node.type === 'text' ? 'bg-gray-100 text-gray-600' :
                node.type === 'heading' ? 'bg-indigo-100 text-indigo-700' :
                node.type === 'footnote' || node.type === 'footnoteFlat' ? 'bg-yellow-100 text-yellow-800' :
                'bg-blue-100 text-blue-700'
              }`}>
                {node.type}
              </span>
              {node.value && <span className="text-gray-500 text-[10px]">({node.value})</span>}
              {node.text && <span className="text-gray-800 truncate max-w-xs">"{node.text.trim()}"</span>}
              <span className="text-[9px] text-gray-400">[{node.sourceStart}-{node.sourceEnd}]</span>
            </div>
            {node.children && node.children.length > 0 && renderASTTree(node.children, depth + 1)}
          </div>
        ))}
      </div>
    );
  };

  // Compute stylesheet font family
  const bodyFont = config.fontFamily === 'Frank Ruhl Libre' ? '"Frank Ruhl Libre", Georgia, serif' :
                   config.fontFamily === 'Rubik' ? '"Rubik", "Inter", sans-serif' :
                   config.fontFamily === 'JetBrains Mono' ? '"JetBrains Mono", monospace' : '"Inter", sans-serif';

  return (
    <div id="live_preview_panel" className="flex flex-col h-full bg-[#f8fafc] border-r border-gray-200">
      {/* Tab controls */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 bg-white">
        <div className="flex gap-1.5">
          <button
            onClick={() => setActiveTab('typeset')}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              activeTab === 'typeset'
                ? 'bg-blue-50 text-blue-600 border border-blue-100'
                : 'text-gray-600 hover:bg-gray-50 border border-transparent'
            }`}
          >
            <Layout size={14} />
            <span>תצוגה מקדימה</span>
          </button>
          <button
            onClick={() => setActiveTab('typst')}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              activeTab === 'typst'
                ? 'bg-blue-50 text-blue-600 border border-blue-100'
                : 'text-gray-600 hover:bg-gray-50 border border-transparent'
            }`}
          >
            <Code size={14} />
            <span>קוד Typst נקי</span>
          </button>
          <button
            onClick={() => setActiveTab('ast')}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              activeTab === 'ast'
                ? 'bg-blue-50 text-blue-600 border border-blue-100'
                : 'text-gray-600 hover:bg-gray-50 border border-transparent'
            }`}
          >
            <TreeDeciduous size={14} />
            <span>עץ AST</span>
          </button>
        </div>

        {/* Zoom and actions */}
        <div className="flex items-center gap-3">
          {activeTab === 'typeset' && (
            <div className="flex items-center gap-1.5 text-xs text-gray-500">
              <span className="font-medium">זום:</span>
              <select
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
                className="bg-gray-50 border border-gray-200 rounded px-1.5 py-0.5 text-xs outline-none"
              >
                <option value="75">75%</option>
                <option value="90">90%</option>
                <option value="100">100%</option>
                <option value="110">110%</option>
                <option value="125">125%</option>
              </select>
            </div>
          )}

          {activeTab === 'typst' && (
            <button
              onClick={handleCopyTypst}
              className="flex items-center gap-1 px-2.5 py-1 text-xs text-blue-600 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded transition-all"
            >
              {copied ? <Check size={12} className="text-green-600" /> : <Copy size={12} />}
              <span>{copied ? 'הועתק!' : 'העתק קוד'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Main preview body */}
      <div className="flex-1 overflow-auto p-6 flex justify-center items-start">
        {activeTab === 'typeset' ? (
          <div
            className="transition-all duration-200 origin-top shadow-xl border border-gray-200/60 bg-white"
            style={{
              width: '100%',
              maxWidth: '800px',
              minHeight: '1120px',
              transform: `scale(${zoom / 100})`,
              transformOrigin: 'top center',
              padding: `${config.margins}px`,
              fontFamily: bodyFont,
              direction: 'rtl',
              textAlign: 'right',
            }}
          >
            {/* Running Header */}
            <div className="flex items-center justify-between pb-3 mb-6 border-b border-gray-200 text-[10px] text-gray-400 font-sans tracking-wide">
              <span>{documentTitle || 'קסב - מערכת עימוד'}</span>
              <span>בס"ד</span>
              <span>מערכת העימוד קסב (Ksav)</span>
            </div>

            {/* Main Typeset Document Content */}
            <div className="prose prose-sm max-w-none text-gray-800 leading-relaxed space-y-4">
              {ast.length > 0 ? (
                ast.map((node, i) => renderNode(node, i))
              ) : (
                <div className="text-gray-300 text-center py-20 font-sans">
                  התחל להקליד במסך העורך או בחר תבנית כדי לראות עימוד חי...
                </div>
              )}
            </div>

            {/* Footnotes block */}
            {renderBottomFootnotes()}

            {/* Running Footer */}
            <div className="absolute bottom-6 left-0 right-0 flex justify-center text-[10px] text-gray-400 font-sans">
              <span>עמוד 1</span>
            </div>
          </div>
        ) : activeTab === 'typst' ? (
          <div className="w-full max-w-3xl bg-gray-900 rounded-xl shadow-lg p-5 border border-gray-800 font-mono text-xs text-gray-300 relative">
            <div className="flex justify-between items-center pb-3 border-b border-gray-800 mb-4 text-gray-500">
              <span>output.typ</span>
              <span className="text-[10px] bg-gray-800 px-2 py-0.5 rounded text-gray-400">Typst Raw Code</span>
            </div>
            <pre className="whitespace-pre-wrap overflow-x-auto text-left leading-relaxed" dir="ltr">
              {typstCode || '// No Typst output generated yet.'}
            </pre>
          </div>
        ) : (
          <div className="w-full max-w-3xl bg-white rounded-xl shadow-md p-6 border border-gray-200 max-h-[85vh] overflow-y-auto">
            <h4 className="text-sm font-semibold text-gray-800 mb-4 pb-2 border-b">
              עץ מבנה מסמך (AST Nodes) - לניתוח ודיבאג
            </h4>
            {ast.length > 0 ? (
              renderASTTree(ast)
            ) : (
              <span className="text-gray-400 text-xs">המסמך ריק.</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
