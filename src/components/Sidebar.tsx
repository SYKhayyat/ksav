import React, { useState, useEffect } from 'react';
import {
  FolderOpen,
  Plus,
  Trash2,
  FileText,
  Settings,
  Download,
  Upload,
  Search,
  ChevronRight,
  ChevronLeft,
  Info,
  Clock,
  BookOpen,
  Sliders,
  SlidersHorizontal,
} from 'lucide-react';
import { EditorConfig } from '../types';
import { documentTemplates } from '../utils/parser';

export interface KsavDocument {
  id: string;
  title: string;
  content: string;
  lastSaved: string;
  wordCount: number;
}

interface SidebarProps {
  currentDocId: string;
  currentContent: string;
  currentTitle: string;
  onSelectDocument: (id: string, title: string, content: string) => void;
  onUpdateCurrentTitle: (title: string) => void;
  config: EditorConfig;
  onChangeConfig: (newConfig: Partial<EditorConfig>) => void;
}

export default function Sidebar({
  currentDocId,
  currentContent,
  currentTitle,
  onSelectDocument,
  onUpdateCurrentTitle,
  config,
  onChangeConfig,
}: SidebarProps) {
  const [isOpen, setIsOpen] = useState(true);
  const [activeTab, setActiveTab] = useState<'docs' | 'settings'>('docs');
  const [documents, setDocuments] = useState<KsavDocument[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [importError, setImportError] = useState<string | null>(null);

  // Load documents from localStorage on mount
  useEffect(() => {
    loadDocs();
  }, []);

  const loadDocs = () => {
    try {
      const stored = localStorage.getItem('ksav_documents');
      if (stored) {
        setDocuments(JSON.parse(stored));
      } else {
        // Initialize with default templates
        const initialDocs: KsavDocument[] = documentTemplates.map((t) => ({
          id: `doc-${t.id}`,
          title: t.hebrewName,
          content: t.content,
          lastSaved: new Date().toISOString(),
          wordCount: t.content.split(/\s+/).filter(Boolean).length,
        }));
        localStorage.setItem('ksav_documents', JSON.stringify(initialDocs));
        setDocuments(initialDocs);
      }
    } catch (e) {
      console.error('Error loading documents', e);
    }
  };

  // Keep current document content synchronized in local state list
  useEffect(() => {
    if (!currentDocId) return;
    
    setDocuments((prevDocs) => {
      const idx = prevDocs.findIndex((d) => d.id === currentDocId);
      if (idx === -1) {
        // If it's a new unsaved doc, let's add it
        const newDoc: KsavDocument = {
          id: currentDocId,
          title: currentTitle,
          content: currentContent,
          lastSaved: new Date().toISOString(),
          wordCount: currentContent.split(/\s+/).filter(Boolean).length,
        };
        const updated = [...prevDocs, newDoc];
        localStorage.setItem('ksav_documents', JSON.stringify(updated));
        return updated;
      } else {
        const doc = prevDocs[idx];
        if (doc.content === currentContent && doc.title === currentTitle) {
          return prevDocs;
        }
        const updatedDoc = {
          ...doc,
          title: currentTitle,
          content: currentContent,
          lastSaved: new Date().toISOString(),
          wordCount: currentContent.split(/\s+/).filter(Boolean).length,
        };
        const updated = [...prevDocs];
        updated[idx] = updatedDoc;
        localStorage.setItem('ksav_documents', JSON.stringify(updated));
        return updated;
      }
    });
  }, [currentContent, currentTitle, currentDocId]);

  // Create a new empty document
  const handleCreateNew = () => {
    const newId = `doc-${Date.now()}`;
    const defaultTitle = 'מסמך חדש ללא שם';
    const defaultContent = '#ימין[\n#כותרת1[כותרת המסמך החדש שלך]\n\nהתחל לכתוב כאן...\n]';
    
    const newDoc: KsavDocument = {
      id: newId,
      title: defaultTitle,
      content: defaultContent,
      lastSaved: new Date().toISOString(),
      wordCount: defaultContent.split(/\s+/).filter(Boolean).length,
    };

    const updated = [newDoc, ...documents];
    localStorage.setItem('ksav_documents', JSON.stringify(updated));
    setDocuments(updated);
    onSelectDocument(newId, defaultTitle, defaultContent);
  };

  // Delete document
  const handleDeleteDoc = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (documents.length <= 1) {
      alert('חייב להישאר לפחות מסמך אחד במערכת.');
      return;
    }
    if (confirm('האם אתה בטוח שברצונך למחוק מסמך זה לצמיתות?')) {
      const updated = documents.filter((d) => d.id !== id);
      localStorage.setItem('ksav_documents', JSON.stringify(updated));
      setDocuments(updated);
      
      // If current document was deleted, select another one
      if (currentDocId === id && updated.length > 0) {
        onSelectDocument(updated[0].id, updated[0].title, updated[0].content);
      }
    }
  };

  // Export current document as .ksav file (offline utility!)
  const handleExportCurrent = () => {
    try {
      const exportData = {
        title: currentTitle,
        content: currentContent,
        config: config,
        version: '1.0.0',
        exporter: 'Ksav Web Typesetter',
      };
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${currentTitle || 'document'}.ksav`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      alert('שגיאה בייצוא המסמך.');
    }
  };

  // Import .ksav file from local disk (offline-ready!)
  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);
        if (json && json.title && json.content) {
          const newId = `doc-imported-${Date.now()}`;
          const newDoc: KsavDocument = {
            id: newId,
            title: json.title,
            content: json.content,
            lastSaved: new Date().toISOString(),
            wordCount: json.content.split(/\s+/).filter(Boolean).length,
          };

          const updated = [newDoc, ...documents];
          localStorage.setItem('ksav_documents', JSON.stringify(updated));
          setDocuments(updated);
          onSelectDocument(newId, json.title, json.content);
          
          if (json.config) {
            onChangeConfig(json.config);
          }
          setImportError(null);
        } else {
          setImportError('קובץ קסב לא תקין או חסר שדות חובה.');
        }
      } catch (err) {
        setImportError('קובץ JSON לא תקין.');
      }
    };
    reader.readAsText(file);
  };

  // Filter documents by search
  const filteredDocs = documents.filter((doc) =>
    doc.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div
      className={`relative h-full bg-slate-900 border-l border-slate-800 transition-all duration-300 flex select-none ${
        isOpen ? 'w-72' : 'w-12'
      }`}
      dir="rtl"
    >
      {/* Sidebar Content (Visible when open) */}
      <div className={`flex flex-col h-full w-full ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none w-0'}`}>
        {/* Top Header Selector */}
        <div className="flex border-b border-slate-800 p-2 bg-slate-950/80">
          <button
            onClick={() => setActiveTab('docs')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'docs'
                ? 'bg-blue-600/90 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <FolderOpen size={13} />
            <span>כל המסמכים</span>
          </button>
          <button
            onClick={() => setActiveTab('settings')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'settings'
                ? 'bg-blue-600/90 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <Settings size={13} />
            <span>הגדרות עימוד</span>
          </button>
        </div>

        {/* Tab content area */}
        <div className="flex-1 overflow-y-auto p-3">
          {activeTab === 'docs' ? (
            <div className="flex flex-col gap-3 h-full">
              {/* Document Search */}
              <div className="relative">
                <Search size={14} className="absolute right-3 top-2.5 text-slate-500" />
                <input
                  type="text"
                  placeholder="חפש מסמך..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-slate-950/60 border border-slate-800/80 rounded-lg py-1.5 pr-8 pl-3 text-xs text-slate-200 placeholder-slate-500 outline-none focus:border-blue-500 transition-all"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2">
                <button
                  onClick={handleCreateNew}
                  className="flex-1 flex items-center justify-center gap-1 py-2 px-3 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg transition-all shadow-md shadow-blue-900/30"
                >
                  <Plus size={14} />
                  <span>מסמך חדש</span>
                </button>

                <label className="flex-1 flex items-center justify-center gap-1 py-2 px-3 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-lg cursor-pointer border border-slate-700 transition-all">
                  <Upload size={14} />
                  <span>ייבוא</span>
                  <input
                    type="file"
                    accept=".ksav,.json"
                    onChange={handleImportFile}
                    className="hidden"
                  />
                </label>
              </div>

              {importError && (
                <div className="text-[10px] text-red-400 bg-red-950/40 p-2 border border-red-900/40 rounded-lg text-right leading-relaxed">
                  {importError}
                </div>
              )}

              {/* Document List */}
              <div className="flex-1 overflow-y-auto space-y-1.5 max-h-[42vh]">
                {filteredDocs.length > 0 ? (
                  filteredDocs.map((doc) => {
                    const isActive = doc.id === currentDocId;
                    const dateStr = new Date(doc.lastSaved).toLocaleDateString('he-IL', {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    });

                    return (
                      <div
                        key={doc.id}
                        onClick={() => onSelectDocument(doc.id, doc.title, doc.content)}
                        className={`group flex items-center justify-between p-2.5 rounded-xl cursor-pointer transition-all border ${
                          isActive
                            ? 'bg-blue-600/10 border-blue-500 text-white'
                            : 'bg-slate-950/20 border-slate-850/50 hover:bg-slate-800/40 text-slate-300'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          <FileText
                            size={16}
                            className={isActive ? 'text-blue-400' : 'text-slate-500'}
                          />
                          <div className="flex flex-col min-w-0 text-right">
                            <span className="text-xs font-bold truncate">{doc.title}</span>
                            <span className="text-[9px] text-slate-500 flex items-center gap-1 mt-0.5">
                              <Clock size={10} />
                              <span>{dateStr}</span>
                              <span className="text-slate-600">•</span>
                              <span>{doc.wordCount} מילים</span>
                            </span>
                          </div>
                        </div>

                        {/* Action buttons inside item */}
                        <button
                          onClick={(e) => handleDeleteDoc(doc.id, e)}
                          title="מחק מסמך"
                          className="p-1.5 rounded-md hover:bg-red-500/15 hover:text-red-400 text-slate-600 opacity-0 group-hover:opacity-100 transition-all duration-150"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    );
                  })
                ) : (
                  <div className="text-center py-10 text-slate-500 text-xs font-sans leading-relaxed">
                    לא נמצאו מסמכים תואמים.
                  </div>
                )}
              </div>

              {/* Active Document Operations */}
              <div className="border-t border-slate-850 pt-3 mt-auto">
                <button
                  onClick={handleExportCurrent}
                  className="w-full flex items-center justify-center gap-1.5 py-2 bg-slate-800/80 hover:bg-slate-700 text-slate-200 hover:text-white border border-slate-750 rounded-lg text-xs font-semibold transition-all"
                >
                  <Download size={13} />
                  <span>ייצא מסמך נוכחי (.ksav)</span>
                </button>
              </div>
            </div>
          ) : (
            /* Settings Panel */
            <div className="flex flex-col gap-4 text-slate-300 text-right">
              <div>
                <h4 className="text-xs font-extrabold text-slate-400 mb-2 uppercase tracking-wide">
                  סגנון עמוד ונייר (מקומי)
                </h4>

                <div className="space-y-3.5 bg-slate-950/40 p-3 rounded-xl border border-slate-850">
                  {/* Font Sizes slider */}
                  <div className="flex flex-col gap-1.5">
                    <div className="flex justify-between text-[11px] font-medium text-slate-400">
                      <span>גודל גופן בסיסי:</span>
                      <span className="font-mono text-blue-400 font-bold">{config.fontSize}px</span>
                    </div>
                    <input
                      type="range"
                      min="11"
                      max="22"
                      value={config.fontSize}
                      onChange={(e) => onChangeConfig({ fontSize: Number(e.target.value) })}
                      className="w-full accent-blue-500 h-1 bg-slate-800 rounded-lg cursor-pointer"
                    />
                  </div>

                  {/* Margins size selection */}
                  <div className="flex flex-col gap-1.5">
                    <div className="flex justify-between text-[11px] font-medium text-slate-400">
                      <span>שולי דף (מרווח):</span>
                      <span className="font-mono text-blue-400 font-bold">{config.margins}px</span>
                    </div>
                    <input
                      type="range"
                      min="24"
                      max="128"
                      step="8"
                      value={config.margins}
                      onChange={(e) => onChangeConfig({ margins: Number(e.target.value) })}
                      className="w-full accent-blue-500 h-1 bg-slate-800 rounded-lg cursor-pointer"
                    />
                  </div>

                  {/* Toggle Toolbar */}
                  <div className="flex items-center justify-between text-[11px] font-medium text-slate-400 pt-1 border-t border-slate-800/60">
                    <span>הצג סרגל כלים עליון</span>
                    <button
                      onClick={() => onChangeConfig({ showToolbar: !config.showToolbar })}
                      className={`w-9 h-5 rounded-full p-0.5 transition-colors ${
                        config.showToolbar ? 'bg-blue-600' : 'bg-slate-800'
                      }`}
                    >
                      <div
                        className={`w-4 h-4 rounded-full bg-white transition-all transform ${
                          config.showToolbar ? '-translate-x-4' : 'translate-x-0'
                        }`}
                      ></div>
                    </button>
                  </div>

                  {/* Footnotes Style */}
                  <div className="flex items-center justify-between text-[11px] font-medium text-slate-400 pt-1.5 border-t border-slate-800/60">
                    <span>סגנון הערות ברירת מחדל</span>
                    <select
                      value={config.footnoteStyle}
                      onChange={(e) =>
                        onChangeConfig({
                          footnoteStyle: e.target.value as 'hierarchical' | 'stacked',
                        })
                      }
                      className="bg-slate-900 border border-slate-800 text-[10px] text-slate-200 rounded px-1.5 py-0.5 outline-none focus:border-blue-500"
                    >
                      <option value="hierarchical">מקונן (Typst)</option>
                      <option value="stacked">שטוח (ערימה)</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Offline capabilities Info card */}
              <div className="bg-blue-950/20 border border-blue-900/35 p-3 rounded-xl flex flex-col gap-1.5 mt-2">
                <div className="flex items-center gap-2 text-blue-400">
                  <Info size={14} />
                  <h5 className="text-[11px] font-bold">סביבת כתיבה אופליין מלאה</h5>
                </div>
                <p className="text-[10px] text-slate-400 leading-normal">
                  כל המסמכים, ההגדרות, מנוע העימוד וייצוא קבצי ה-Ksav נשמרים ומעובדים ישירות בדפדפן שלך ללא צורך בחיבור לאינטרנט!
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Sidebar Footer */}
        <div className="p-3 border-t border-slate-850 text-center text-[10px] text-slate-500 select-none bg-slate-950/30">
          <span>קסב v1.0 • עימוד עברי מקומי</span>
        </div>
      </div>

      {/* Vertical Collapsible Handle Bar */}
      <div className="absolute left-0 top-0 bottom-0 w-1 bg-slate-800/40 hover:bg-slate-700/60 cursor-col-resize transition-colors"></div>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="absolute -left-3.5 top-1/2 -translate-y-1/2 w-7 h-7 bg-slate-900 border border-slate-800 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-200 hover:bg-slate-800 shadow-md shadow-slate-950/50 z-50 transition-all hover:scale-105"
      >
        {isOpen ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
      </button>
    </div>
  );
}
