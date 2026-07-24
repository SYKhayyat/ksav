import React, { useState } from 'react';
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  AlignLeft,
  AlignCenter,
  AlignRight,
  List,
  ListOrdered,
  Plus,
  Table as TableIcon,
  HelpCircle,
  FileText,
  ChevronDown,
  Sparkles,
  Type,
  FileSignature,
  FilePlus,
} from 'lucide-react';
import { documentTemplates } from '../utils/parser';
import { EditorConfig } from '../types';

interface ToolbarProps {
  onInsertCommand: (commandName: string) => void;
  onLoadTemplate: (templateId: string) => void;
  config: EditorConfig;
  onChangeConfig: (newConfig: Partial<EditorConfig>) => void;
  onOpenAICompanion: () => void;
}

export default function Toolbar({
  onInsertCommand,
  onLoadTemplate,
  config,
  onChangeConfig,
  onOpenAICompanion,
}: ToolbarProps) {
  const [showHeadings, setShowHeadings] = useState(false);
  const [showFootnotes, setShowFootnotes] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showFonts, setShowFonts] = useState(false);
  const [showTableGrid, setShowTableGrid] = useState(false);
  const [hoveredGrid, setHoveredGrid] = useState({ r: 0, c: 0 });

  const handleSelectTableSize = (rows: number, cols: number) => {
    let tableMarkup = `טבלה[\n`;
    // header row
    tableMarkup += '  #שורה[';
    for (let c = 1; c <= cols; c++) {
      tableMarkup += `#תא[עמודה ${c}]${c < cols ? ' ' : ''}`;
    }
    tableMarkup += ']\n';
    
    // content rows
    for (let r = 1; r < rows; r++) {
      tableMarkup += '  #שורה[';
      for (let c = 1; c <= cols; c++) {
        tableMarkup += `#תא[נתון]${c < cols ? ' ' : ''}`;
      }
      tableMarkup += ']\n';
    }
    tableMarkup += ']';

    onInsertCommand(tableMarkup);
    setShowTableGrid(false);
  };

  const fontOptions = [
    { name: 'Frank Ruhl Libre', label: 'פרנק ריהל ליברה (סריף)' },
    { name: 'Rubik', label: 'רוביק (סנס-סריף)' },
    { name: 'JetBrains Mono', label: 'ג׳ט-בריינס מונו' },
    { name: 'Inter', label: 'אינטר (מודרני)' },
  ];

  return (
    <div className="flex flex-wrap items-center justify-between gap-y-2 px-4 py-2.5 bg-white border-b border-gray-200 shadow-sm relative z-40 select-none" dir="rtl">
      {/* Tool groups */}
      <div className="flex flex-wrap items-center gap-1.5">
        {/* Style Tools */}
        <div className="flex items-center bg-gray-50 p-1 rounded-lg border border-gray-200/60">
          <button
            onClick={() => onInsertCommand('הדגשה')}
            title="מודגש (#הדגשה)"
            className="p-1.5 text-gray-600 hover:text-gray-900 hover:bg-white rounded transition-all"
          >
            <Bold size={15} />
          </button>
          <button
            onClick={() => onInsertCommand('נטוי')}
            title="נטוי (#נטוי)"
            className="p-1.5 text-gray-600 hover:text-gray-900 hover:bg-white rounded transition-all"
          >
            <Italic size={15} />
          </button>
          <button
            onClick={() => onInsertCommand('קו_תחתון')}
            title="קו תחתון (#קו_תחתון)"
            className="p-1.5 text-gray-600 hover:text-gray-900 hover:bg-white rounded transition-all"
          >
            <Underline size={15} />
          </button>
          <button
            onClick={() => onInsertCommand('קו_חוצה')}
            title="קו חוצה (#קו_חוצה)"
            className="p-1.5 text-gray-600 hover:text-gray-900 hover:bg-white rounded transition-all"
          >
            <Strikethrough size={15} />
          </button>
        </div>

        {/* Alignment */}
        <div className="flex items-center bg-gray-50 p-1 rounded-lg border border-gray-200/60">
          <button
            onClick={() => onInsertCommand('ימין')}
            title="יישור לימין (#ימין)"
            className="p-1.5 text-gray-600 hover:text-gray-900 hover:bg-white rounded transition-all"
          >
            <AlignRight size={15} />
          </button>
          <button
            onClick={() => onInsertCommand('מרכז')}
            title="יישור למרכז (#מרכז)"
            className="p-1.5 text-gray-600 hover:text-gray-900 hover:bg-white rounded transition-all"
          >
            <AlignCenter size={15} />
          </button>
          <button
            onClick={() => onInsertCommand('שמאל')}
            title="יישור לשמאל (#שמאל)"
            className="p-1.5 text-gray-600 hover:text-gray-900 hover:bg-white rounded transition-all"
          >
            <AlignLeft size={15} />
          </button>
        </div>

        {/* Headings Dropdown */}
        <div className="relative">
          <button
            onClick={() => {
              setShowHeadings(!showHeadings);
              setShowFootnotes(false);
              setShowTemplates(false);
              setShowFonts(false);
            }}
            className="flex items-center gap-1 px-2.5 py-1.5 bg-gray-50 text-gray-700 border border-gray-200/60 rounded-lg text-xs font-medium hover:bg-gray-100 transition-all"
          >
            <Type size={14} className="text-gray-500" />
            <span>כותרות</span>
            <ChevronDown size={12} className="text-gray-400" />
          </button>

          {showHeadings && (
            <div className="absolute right-0 mt-1 w-44 bg-white border border-gray-100 rounded-xl shadow-xl z-50 py-1 flex flex-col overflow-hidden animate-in fade-in slide-in-from-top-1 duration-150">
              <button
                onClick={() => {
                  onInsertCommand('כותרת1');
                  setShowHeadings(false);
                }}
                className="px-3.5 py-2.5 text-right hover:bg-gray-50 text-xs font-semibold text-gray-900 border-b border-gray-50"
              >
                כותרת ראשית (רמה 1)
              </button>
              <button
                onClick={() => {
                  onInsertCommand('כותרת2');
                  setShowHeadings(false);
                }}
                className="px-3.5 py-2.5 text-right hover:bg-gray-50 text-xs font-medium text-gray-800 border-b border-gray-50"
              >
                כותרת משנית (רמה 2)
              </button>
              <button
                onClick={() => {
                  onInsertCommand('כותרת3');
                  setShowHeadings(false);
                }}
                className="px-3.5 py-2.5 text-right hover:bg-gray-50 text-xs text-gray-700"
              >
                כותרת קטנה (רמה 3)
              </button>
            </div>
          )}
        </div>

        {/* Lists & Tables */}
        <div className="flex items-center bg-gray-50 p-1 rounded-lg border border-gray-200/60 relative">
          <button
            onClick={() => onInsertCommand('רשימה')}
            title="רשימת פריטים (#רשימה)"
            className="p-1.5 text-gray-600 hover:text-gray-900 hover:bg-white rounded transition-all"
          >
            <List size={15} />
          </button>
          <button
            onClick={() => onInsertCommand('רשימה_ממוספרת')}
            title="רשימה ממוספרת (#רשימה_ממוספרת)"
            className="p-1.5 text-gray-600 hover:text-gray-900 hover:bg-white rounded transition-all"
          >
            <ListOrdered size={15} />
          </button>
          
          {/* Visual Table Dropdown */}
          <div className="relative border-r border-gray-200/60 pr-1 mr-0.5">
            <button
              onClick={() => {
                setShowTableGrid(!showTableGrid);
                setShowHeadings(false);
                setShowFootnotes(false);
                setShowTemplates(false);
                setShowFonts(false);
              }}
              title="בנה טבלה מותאמת"
              className="p-1.5 text-gray-600 hover:text-gray-900 hover:bg-white rounded transition-all flex items-center gap-0.5"
            >
              <TableIcon size={15} />
              <ChevronDown size={10} className="text-gray-400" />
            </button>

            {showTableGrid && (
              <div className="absolute right-0 mt-2.5 w-48 bg-white border border-gray-100 rounded-xl shadow-xl z-50 p-3.5 flex flex-col gap-2.5 animate-in fade-in slide-in-from-top-1 duration-150">
                <div className="text-[10px] text-gray-400 font-bold text-right">
                  {hoveredGrid.r > 0 && hoveredGrid.c > 0
                    ? `צור טבלה בגודל ${hoveredGrid.r}x${hoveredGrid.c}`
                    : 'בחר ממדי טבלה:'}
                </div>
                
                {/* 4x4 grid boxes */}
                <div className="grid grid-cols-4 gap-1.5 justify-center">
                  {[1, 2, 3, 4].map((r) =>
                    [1, 2, 3, 4].map((c) => {
                      const isHovered = r <= hoveredGrid.r && c <= hoveredGrid.c;
                      return (
                        <button
                          key={`${r}-${c}`}
                          onMouseEnter={() => setHoveredGrid({ r, c })}
                          onMouseLeave={() => setHoveredGrid({ r: 0, c: 0 })}
                          onClick={() => handleSelectTableSize(r, c)}
                          className={`w-7 h-7 rounded border transition-all ${
                            isHovered
                              ? 'bg-blue-500 border-blue-600 shadow-sm shadow-blue-100'
                              : 'bg-gray-50 border-gray-200 hover:border-gray-300'
                          }`}
                          title={`${r} שורות x ${c} עמודות`}
                        />
                      );
                    })
                  )}
                </div>

                <button
                  onClick={() => handleSelectTableSize(2, 2)}
                  className="w-full text-center py-1 bg-gray-50 border border-gray-200 hover:bg-gray-100 rounded text-[10px] font-semibold text-gray-600 transition-all mt-1"
                >
                  טבלה מהירה (2x2)
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Footnotes Dropdown */}
        <div className="relative">
          <button
            onClick={() => {
              setShowFootnotes(!showFootnotes);
              setShowHeadings(false);
              setShowTemplates(false);
              setShowFonts(false);
            }}
            className="flex items-center gap-1 px-2.5 py-1.5 bg-gray-50 text-gray-700 border border-gray-200/60 rounded-lg text-xs font-medium hover:bg-gray-100 transition-all"
          >
            <Plus size={14} className="text-gray-500" />
            <span>הערות שוליים</span>
            <ChevronDown size={12} className="text-gray-400" />
          </button>

          {showFootnotes && (
            <div className="absolute right-0 mt-1 w-52 bg-white border border-gray-100 rounded-xl shadow-xl z-50 py-1 flex flex-col overflow-hidden animate-in fade-in slide-in-from-top-1 duration-150">
              <button
                onClick={() => {
                  onInsertCommand('הערה');
                  setShowFootnotes(false);
                }}
                className="px-3.5 py-2.5 text-right hover:bg-gray-50 text-xs font-medium text-gray-800 border-b border-gray-50"
              >
                הערה מקוננת (#הערה)
              </button>
              <button
                onClick={() => {
                  onInsertCommand('הערהשטוחה');
                  setShowFootnotes(false);
                }}
                className="px-3.5 py-2.5 text-right hover:bg-gray-50 text-xs text-gray-700 border-b border-gray-50"
              >
                הערה שטוחה (#הערהשטוחה)
              </button>
              <div className="px-3.5 py-2 bg-gray-50 border-t flex flex-col gap-1.5">
                <span className="text-[10px] text-gray-400 font-medium">סגנון הערות גלובלי:</span>
                <div className="flex gap-2">
                  <button
                    onClick={() => onChangeConfig({ footnoteStyle: 'hierarchical' })}
                    className={`flex-1 text-center py-1 text-[10px] rounded transition-all ${
                      config.footnoteStyle === 'hierarchical'
                        ? 'bg-blue-600 text-white font-semibold'
                        : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    מקונן
                  </button>
                  <button
                    onClick={() => onChangeConfig({ footnoteStyle: 'stacked' })}
                    className={`flex-1 text-center py-1 text-[10px] rounded transition-all ${
                      config.footnoteStyle === 'stacked'
                        ? 'bg-blue-600 text-white font-semibold'
                        : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    שטוח
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Font Selection Dropdown */}
        <div className="relative">
          <button
            onClick={() => {
              setShowFonts(!showFonts);
              setShowHeadings(false);
              setShowFootnotes(false);
              setShowTemplates(false);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-50 text-gray-700 border border-gray-200/60 rounded-lg text-xs font-medium hover:bg-gray-100 transition-all"
          >
            <span className="text-gray-400 font-mono text-[10px]">Aa</span>
            <span>{fontOptions.find((f) => f.name === config.fontFamily)?.label || 'גופן'}</span>
            <ChevronDown size={12} className="text-gray-400" />
          </button>

          {showFonts && (
            <div className="absolute right-0 mt-1 w-52 bg-white border border-gray-100 rounded-xl shadow-xl z-50 py-1 flex flex-col overflow-hidden animate-in fade-in slide-in-from-top-1 duration-150">
              {fontOptions.map((f) => (
                <button
                  key={f.name}
                  onClick={() => {
                    onChangeConfig({ fontFamily: f.name });
                    setShowFonts(false);
                  }}
                  style={{ fontFamily: f.name === 'Frank Ruhl Libre' ? 'serif' : 'sans-serif' }}
                  className={`px-3.5 py-2.5 text-right text-xs hover:bg-gray-50 transition-colors border-b border-gray-50/50 flex items-center justify-between ${
                    config.fontFamily === f.name ? 'text-blue-600 font-semibold bg-blue-50/20' : 'text-gray-700'
                  }`}
                >
                  <span>{f.label}</span>
                  {config.fontFamily === f.name && <span className="w-1.5 h-1.5 bg-blue-600 rounded-full"></span>}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Templates & AI Helper */}
      <div className="flex items-center gap-2">
        {/* Templates */}
        <div className="relative">
          <button
            onClick={() => {
              setShowTemplates(!showTemplates);
              setShowHeadings(false);
              setShowFootnotes(false);
              setShowFonts(false);
            }}
            className="flex items-center gap-1 px-3 py-1.5 bg-blue-550/10 text-blue-700 hover:bg-blue-50 border border-blue-200/60 rounded-lg text-xs font-semibold transition-all"
          >
            <FilePlus size={14} className="text-blue-600" />
            <span>תבניות מסמך</span>
            <ChevronDown size={12} className="text-blue-500" />
          </button>

          {showTemplates && (
            <div className="absolute left-0 mt-1 w-64 bg-white border border-gray-100 rounded-xl shadow-xl z-50 py-1 flex flex-col overflow-hidden animate-in fade-in slide-in-from-top-1 duration-150">
              <div className="px-3 py-1.5 bg-gray-50 text-[10px] text-gray-400 font-semibold border-b">
                בחר תבנית להתחלה מהירה:
              </div>
              {documentTemplates.map((tmpl) => (
                <button
                  key={tmpl.id}
                  onClick={() => {
                    onLoadTemplate(tmpl.id);
                    setShowTemplates(false);
                  }}
                  className="px-3.5 py-2.5 text-right hover:bg-gray-50 border-b border-gray-50 last:border-b-0 flex flex-col gap-0.5"
                >
                  <span className="text-xs font-bold text-gray-900">{tmpl.hebrewName}</span>
                  <span className="text-[10px] text-gray-400 leading-normal">{tmpl.hebrewDescription}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* AI Assistant Button */}
        <button
          onClick={onOpenAICompanion}
          className="flex items-center gap-1 px-3 py-1.5 bg-gradient-to-r from-indigo-600 to-blue-600 text-white rounded-lg text-xs font-bold shadow-md shadow-indigo-100 hover:opacity-90 active:scale-98 transition-all"
        >
          <Sparkles size={14} />
          <span>עוזר כתיבה AI</span>
        </button>
      </div>
    </div>
  );
}
