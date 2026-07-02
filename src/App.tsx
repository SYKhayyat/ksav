import React, { useState, useEffect } from 'react';
import Toolbar from './components/Toolbar';
import ProseEditor from './components/ProseEditor';
import LivePreview from './components/LivePreview';
import CommandPalette from './components/CommandPalette';
import AIAssistant from './components/AIAssistant';
import Sidebar from './components/Sidebar';
import { documentTemplates } from './utils/parser';
import { EditorConfig } from './types';
import {
  FileText,
  Eye,
  Code,
  Sparkles,
  ArrowLeftRight,
  Download,
  Copy,
  Check,
  RotateCcw,
  BookOpen,
  Sliders,
  Maximize2,
  Minimize2,
} from 'lucide-react';

export default function App() {
  const defaultTemplate = documentTemplates[0];
  const [currentDocId, setCurrentDocId] = useState<string>('doc-letter');
  const [sourceText, setSourceText] = useState(defaultTemplate.content);
  const [documentTitle, setDocumentTitle] = useState(defaultTemplate.hebrewName);

  // Configuration settings
  const [config, setConfig] = useState<EditorConfig>({
    mode: 'prose',
    showToolbar: true,
    autoSave: true,
    footnoteStyle: 'hierarchical',
    fontFamily: 'Frank Ruhl Libre',
    fontSize: 14,
    margins: 64, // px padding
  });

  // UI state
  const [isSplitScreen, setIsSplitScreen] = useState(true);
  const [activeMobileView, setActiveMobileView] = useState<'editor' | 'preview'>('editor');
  const [showPalette, setShowPalette] = useState(false);
  const [showAIAssistant, setShowAIAssistant] = useState(false);
  const [copied, setCopied] = useState(false);

  // Auto-Save notification simulator
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'dirty'>('saved');

  // Load last active doc on mount
  useEffect(() => {
    const savedActiveId = localStorage.getItem('ksav_active_doc_id');
    const stored = localStorage.getItem('ksav_documents');
    if (stored) {
      try {
        const docs = JSON.parse(stored);
        if (docs && docs.length > 0) {
          const activeDoc = docs.find((d: any) => d.id === savedActiveId) || docs[0];
          setCurrentDocId(activeDoc.id);
          setSourceText(activeDoc.content);
          setDocumentTitle(activeDoc.title);
        }
      } catch (e) {
        console.error(e);
      }
    }
  }, []);

  // Trigger simulated auto-save on changes
  useEffect(() => {
    if (saveStatus === 'saved') return;
    const timer = setTimeout(() => {
      setSaveStatus('saved');
    }, 1200);
    return () => clearTimeout(timer);
  }, [sourceText, saveStatus]);

  const handleSourceChange = (newText: string) => {
    setSourceText(newText);
    setSaveStatus('saving');
  };

  const handleSelectDocument = (id: string, title: string, content: string) => {
    setCurrentDocId(id);
    setSourceText(content);
    setDocumentTitle(title);
    localStorage.setItem('ksav_active_doc_id', id);
    setSaveStatus('saved');
  };

  const handleUpdateCurrentTitle = (newTitle: string) => {
    setDocumentTitle(newTitle);
    setSaveStatus('saving');
  };

  // Load selected template
  const handleLoadTemplate = (templateId: string) => {
    const tmpl = documentTemplates.find((t) => t.id === templateId);
    if (tmpl) {
      if (confirm('האם אתה בטוח שברצונך לטעון תבנית זו? פעולה זו תחליף את תוכן העורך הנוכחי.')) {
        setSourceText(tmpl.content);
        setDocumentTitle(tmpl.hebrewName);
        setSaveStatus('saving');
      }
    }
  };

  // Update editor configs
  const handleChangeConfig = (newConfig: Partial<EditorConfig>) => {
    setConfig((prev) => ({ ...prev, ...newConfig }));
  };

  // Insert command directly at cursor using globally registered window method
  const handleSelectCommandFromPalette = (commandName: string) => {
    setShowPalette(false);
    if ((window as any).ksavInsertCommand) {
      (window as any).ksavInsertCommand(commandName);
    }
  };

  // Apply AI assistant suggested text
  const handleApplyAIText = (newText: string, append: boolean) => {
    if (append) {
      handleSourceChange(sourceText + '\n\n' + newText);
    } else {
      if (confirm('האם להחליף את כל הטקסט הנוכחי בעורך בטקסט שיוצר על ידי ה-AI?')) {
        handleSourceChange(newText);
      }
    }
  };

  // Copy entire raw markup source
  const handleCopyRawSource = () => {
    navigator.clipboard.writeText(sourceText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Print document
  const handlePrintDocument = () => {
    window.print();
  };

  return (
    <div className="flex flex-col h-screen bg-gray-100 overflow-hidden font-sans text-gray-800 antialiased selection:bg-blue-100" dir="rtl">
      {/* Premium Main Header */}
      <header className="flex items-center justify-between px-6 py-3 bg-white border-b border-gray-200 select-none">
        {/* Brand Logo */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-gradient-to-tr from-blue-600 to-indigo-600 rounded-xl flex items-center justify-center shadow-md shadow-blue-200 text-white font-serif font-bold text-lg select-none">
            ק
          </div>
          <div className="flex flex-col text-right">
            <h1 className="text-base font-extrabold tracking-tight text-gray-900 font-serif leading-tight">
              קְסָב <span className="text-xs font-mono font-normal text-blue-600 px-1.5 py-0.2 bg-blue-50 border border-blue-100 rounded mr-1">KSAV</span>
            </h1>
            <p className="text-[10px] text-gray-400 font-medium tracking-normal">מערכת עימוד וכתיבה עברית מתקדמת</p>
          </div>
        </div>

        {/* Editable Title */}
        <div className="flex items-center gap-2 max-w-sm flex-1 mx-8">
          <FileText size={16} className="text-gray-400 min-w-[16px]" />
          <input
            type="text"
            value={documentTitle}
            onChange={(e) => handleUpdateCurrentTitle(e.target.value)}
            title="לחץ כדי לשנות את שם המסמך"
            className="w-full bg-transparent border-b border-transparent hover:border-gray-200 focus:border-blue-500 py-1 font-semibold text-gray-800 text-sm outline-none transition-all text-right"
          />
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2.5">
          {/* Save status */}
          <span className="text-[11px] text-gray-400 font-medium pl-2 hidden md:inline-flex items-center gap-1.5">
            <span className={`w-1.5 h-1.5 rounded-full ${saveStatus === 'saved' ? 'bg-green-500' : 'bg-amber-400 animate-pulse'}`}></span>
            <span>{saveStatus === 'saved' ? 'נשמר אוטומטית' : 'שומר שינויים...'}</span>
          </span>

          {/* Copy Raw Code */}
          <button
            onClick={handleCopyRawSource}
            title="העתק את קוד המקור של קסב"
            className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-50 border border-gray-200 hover:bg-gray-100 rounded-lg text-xs font-medium text-gray-700 transition-all"
          >
            {copied ? <Check size={13} className="text-green-600" /> : <Copy size={13} />}
            <span className="hidden sm:inline">{copied ? 'הועתק!' : 'העתק מקור'}</span>
          </button>

          {/* Print PDF */}
          <button
            onClick={handlePrintDocument}
            title="הדפס או שמור כ-PDF"
            className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-50 border border-gray-200 hover:bg-gray-100 rounded-lg text-xs font-medium text-gray-700 transition-all"
          >
            <Download size={13} />
            <span className="hidden sm:inline">הדפס / PDF</span>
          </button>

          <div className="w-px h-5 bg-gray-200 mx-1"></div>

          {/* Screen mode selectors */}
          <div className="flex bg-gray-100 p-0.5 rounded-lg border border-gray-200/60">
            <button
              onClick={() => handleChangeConfig({ mode: config.mode === 'prose' ? 'source' : 'prose' })}
              title="החלף בין מצב פרוזה למצב קוד מקור"
              className={`flex items-center gap-1 px-3 py-1 rounded-md text-xs font-medium transition-all ${
                config.mode === 'prose'
                  ? 'bg-white text-gray-950 shadow-sm font-semibold'
                  : 'text-gray-500 hover:text-gray-800'
              }`}
            >
              <Eye size={12} />
              <span>פרוזה</span>
            </button>
            <button
              onClick={() => handleChangeConfig({ mode: config.mode === 'source' ? 'prose' : 'source' })}
              className={`flex items-center gap-1 px-3 py-1 rounded-md text-xs font-medium transition-all ${
                config.mode === 'source'
                  ? 'bg-white text-gray-950 shadow-sm font-semibold'
                  : 'text-gray-500 hover:text-gray-800'
              }`}
            >
              <Code size={12} />
              <span>מקור</span>
            </button>
          </div>

          {/* Split screen desktop mode */}
          <button
            onClick={() => setIsSplitScreen(!isSplitScreen)}
            title="שנה פריסה (מסך מפוצל / עורך מלא)"
            className="p-2 text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-all hidden md:block"
          >
            <ArrowLeftRight size={15} />
          </button>
        </div>
      </header>

      {/* Visual Word-like Toolbar */}
      {config.showToolbar && (
        <Toolbar
          onInsertCommand={(cmd) => {
            if ((window as any).ksavInsertCommand) {
              (window as any).ksavInsertCommand(cmd);
            }
          }}
          onLoadTemplate={handleLoadTemplate}
          config={config}
          onChangeConfig={handleChangeConfig}
          onOpenAICompanion={() => setShowAIAssistant(true)}
        />
      )}

      {/* Mobile view selectors */}
      <div className="flex md:hidden bg-white border-b border-gray-200 p-2 justify-center gap-2">
        <button
          onClick={() => setActiveMobileView('editor')}
          className={`flex-1 py-1.5 text-center text-xs font-medium rounded-lg ${
            activeMobileView === 'editor'
              ? 'bg-blue-600 text-white font-semibold'
              : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
          }`}
        >
          עורך טקסט
        </button>
        <button
          onClick={() => setActiveMobileView('preview')}
          className={`flex-1 py-1.5 text-center text-xs font-medium rounded-lg ${
            activeMobileView === 'preview'
              ? 'bg-blue-600 text-white font-semibold'
              : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
          }`}
        >
          תצוגה מקדימה
        </button>
      </div>

      {/* Main Workspace Body */}
      <main className="flex-1 flex overflow-hidden relative">
        {/* Document Management Sidebar */}
        <Sidebar
          currentDocId={currentDocId}
          currentContent={sourceText}
          currentTitle={documentTitle}
          onSelectDocument={handleSelectDocument}
          onUpdateCurrentTitle={handleUpdateCurrentTitle}
          config={config}
          onChangeConfig={handleChangeConfig}
        />

        {/* Editor Container */}
        <div
          className={`h-full flex flex-col bg-white border-l border-gray-200 transition-all duration-200 ${
            isSplitScreen ? 'w-full md:w-1/2' : 'w-full'
          } ${activeMobileView === 'editor' ? 'block' : 'hidden md:block'}`}
        >
          <ProseEditor
            sourceText={sourceText}
            onChangeSource={handleSourceChange}
            config={config}
            onOpenPalette={() => setShowPalette(true)}
          />
        </div>

        {/* Split separator divider (split mode desktop only) */}
        {isSplitScreen && <div className="w-px bg-gray-200/80 hidden md:block select-none pointer-events-none"></div>}

        {/* Preview Container */}
        <div
          className={`h-full flex flex-col transition-all duration-200 ${
            isSplitScreen ? 'w-full md:w-1/2' : 'hidden'
          } ${activeMobileView === 'preview' ? 'block' : 'hidden md:block'}`}
        >
          <LivePreview sourceText={sourceText} config={config} documentTitle={documentTitle} />
        </div>

        {/* AI Assistant Slider Drawer Overlay */}
        {showAIAssistant && (
          <AIAssistant
            onClose={() => setShowAIAssistant(false)}
            editorText={sourceText}
            onApplyText={handleApplyAIText}
          />
        )}
      </main>

      {/* Visual Statistics & Offline Status Footer */}
      <footer className="h-7 bg-white border-t border-gray-200 flex items-center justify-between px-4 text-[10px] text-gray-500 select-none z-40">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 bg-green-500 rounded-full"></span>
            <span className="font-semibold text-gray-600">מצב מקומי/אופליין פעיל</span>
          </div>
          <span className="text-gray-300">|</span>
          <span>תווים: {sourceText.length}</span>
          <span className="text-gray-300">|</span>
          <span>מילים: {sourceText.split(/\s+/).filter(Boolean).length}</span>
          <span className="text-gray-300">|</span>
          <span>פסקאות: {sourceText.split(/\n+/).filter(Boolean).length}</span>
          <span className="text-gray-300">|</span>
          <span>עמודים (משוער): {Math.max(1, Math.ceil(sourceText.split(/\s+/).filter(Boolean).length / 320))}</span>
        </div>
        <div className="flex items-center gap-4">
          <span>קיצורים: <kbd className="bg-gray-100 px-1 rounded border border-gray-200">/ או Ctrl+K</kbd> לפלטת פקודות</span>
          <span>החזק <kbd className="bg-gray-100 px-1 rounded border border-gray-200">Alt</kbd> להצגת פקודות בפרוזה</span>
        </div>
      </footer>

      {/* Fuzzy-searchable Command Palette Overlay */}
      {showPalette && (
        <CommandPalette
          onClose={() => setShowPalette(false)}
          onSelectCommand={handleSelectCommandFromPalette}
        />
      )}
    </div>
  );
}
