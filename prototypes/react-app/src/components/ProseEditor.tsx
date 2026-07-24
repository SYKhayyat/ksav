import React, { useRef, useEffect, useState } from 'react';
import { EditorConfig } from '../types';
import { commandRegistry } from '../utils/parser';
import { Sparkles, Eye, Code, Keyboard, Info } from 'lucide-react';

interface ProseEditorProps {
  sourceText: string;
  onChangeSource: (text: string) => void;
  config: EditorConfig;
  onOpenPalette: () => void;
}

export default function ProseEditor({
  sourceText,
  onChangeSource,
  config,
  onOpenPalette,
}: ProseEditorProps) {
  const [altPressed, setAltPressed] = useState(false);
  const [caretPos, setCaretPos] = useState({ start: 0, end: 0 });
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Monitor Alt key globally
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Alt') {
        e.preventDefault();
        setAltPressed(true);
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Alt') {
        setAltPressed(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  // Update cursor position state on selection change
  const handleSelect = (e: React.SyntheticEvent<HTMLTextAreaElement>) => {
    const target = e.currentTarget;
    setCaretPos({
      start: target.selectionStart,
      end: target.selectionEnd,
    });
  };

  // Wrap selected text or insert command at cursor
  const insertCommandAtCursor = (commandName: string) => {
    if (!textareaRef.current) return;
    const textarea = textareaRef.current;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;

    const selection = text.substring(start, end);
    let wrapper = '';
    if (commandName.includes('[')) {
      wrapper = `#${commandName}`;
    } else {
      wrapper = `#${commandName}[${selection}]`;
    }
    const newText = text.substring(0, start) + wrapper + text.substring(end);

    onChangeSource(newText);

    // Calculate new cursor position
    const newCursorPos = start === end && !commandName.includes('[')
      ? start + commandName.length + 2 
      : start + wrapper.length;

    // Refocus and set selection after React re-renders
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(newCursorPos, newCursorPos);
    }, 0);
  };

  // Expose insertion method globally or via ref if needed, but we can do it via event listeners or simple trigger
  // Catch '/' trigger for Command Palette
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const textarea = e.currentTarget;
    const start = textarea.selectionStart;

    // Trigger palette on '/' or 'Ctrl+K'
    if (e.key === '/' && (start === 0 || textarea.value[start - 1] === ' ' || textarea.value[start - 1] === '\n')) {
      e.preventDefault();
      onOpenPalette();
    } else if (e.ctrlKey && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      onOpenPalette();
    }
  };

  // Render highlighted syntax tokens for Prose Mode vs Source Mode
  const renderHighlightedContent = () => {
    const tokens: React.ReactNode[] = [];
    let i = 0;

    // Simple parser to tokenize sourceText for beautiful on-screen representation
    while (i < sourceText.length) {
      if (sourceText[i] === '#' && i + 1 < sourceText.length && sourceText[i + 1] !== ' ') {
        const start = i;
        let nameStart = i + 1;
        let nameEnd = nameStart;
        while (nameEnd < sourceText.length && /[\w\u0590-\u05FF_]/.test(sourceText[nameEnd])) {
          nameEnd++;
        }
        const cmdName = sourceText.substring(nameStart, nameEnd);
        const hasBrackets = nameEnd < sourceText.length && sourceText[nameEnd] === '[';

        const cmdInfo = commandRegistry[cmdName];
        let colorClass = 'text-blue-500';
        if (cmdInfo) {
          if (cmdInfo.category === 'Structure') colorClass = 'text-indigo-600 font-semibold';
          else if (cmdInfo.category === 'Layout') colorClass = 'text-amber-600';
          else if (cmdInfo.category === 'Table') colorClass = 'text-teal-600';
          else if (cmdInfo.category === 'Footnote') colorClass = 'text-purple-600';
        }

        // Check if command should be collapsed (Prose Mode)
        const isCollapsed = config.mode === 'prose' && !altPressed;

        tokens.push(
          <span
            key={`cmd-${start}`}
            className={`font-mono transition-all duration-150 ${colorClass} ${
              isCollapsed
                ? 'opacity-25 hover:opacity-100 bg-gray-100 px-1 py-0.2 rounded text-[10px] mx-0.5 select-none'
                : 'opacity-100'
            }`}
          >
            #{cmdName}
          </span>
        );

        i = nameEnd;

        if (hasBrackets) {
          tokens.push(
            <span
              key={`bracket-open-${nameEnd}`}
              className={`font-mono transition-all duration-150 text-gray-400 ${
                isCollapsed ? 'opacity-25 text-[10px] select-none' : 'opacity-100'
              }`}
            >
              [
            </span>
          );
          i++;
        }
      } else if (sourceText[i] === ']') {
        const isCollapsed = config.mode === 'prose' && !altPressed;
        tokens.push(
          <span
            key={`bracket-close-${i}`}
            className={`font-mono transition-all duration-150 text-gray-400 ${
              isCollapsed ? 'opacity-25 text-[10px] select-none' : 'opacity-100'
            }`}
          >
            ]
          </span>
        );
        i++;
      } else {
        let nextSpecial = sourceText.indexOf('#', i);
        let nextClose = sourceText.indexOf(']', i);
        let end = sourceText.length;
        if (nextSpecial !== -1 && nextSpecial < end) end = nextSpecial;
        if (nextClose !== -1 && nextClose < end) end = nextClose;

        const plain = sourceText.substring(i, end);
        tokens.push(
          <span key={`text-${i}`} className="font-sans text-gray-800 leading-relaxed">
            {plain}
          </span>
        );
        i = end;
      }
    }

    return tokens;
  };

  // Add the insert helper onto the window object so our toolbar can access it easily!
  useEffect(() => {
    (window as any).ksavInsertCommand = insertCommandAtCursor;
    return () => {
      delete (window as any).ksavInsertCommand;
    };
  }, [sourceText]);

  return (
    <div className="flex flex-col h-full bg-white relative">
      {/* Editor Header Info bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-100 bg-gray-50/50 text-xs text-gray-500">
        <div className="flex items-center gap-2">
          <span className="font-medium bg-blue-50 text-blue-600 border border-blue-100 rounded px-2 py-0.5">
            עורך {config.mode === 'prose' ? 'פרוזה (נקי)' : 'קוד מקור'}
          </span>
          <span className="hidden sm:inline">הקש <kbd className="bg-white border border-gray-200 px-1 rounded shadow-sm text-[10px]">Ctrl+K</kbd> לפלטת פקודות</span>
        </div>

        <div className="flex items-center gap-2">
          {config.mode === 'prose' && (
            <span className={`text-[11px] px-2 py-0.5 rounded transition-all flex items-center gap-1 ${
              altPressed ? 'bg-amber-50 text-amber-700 border border-amber-100' : 'bg-gray-100 text-gray-400'
            }`}>
              <Keyboard size={12} />
              <span>{altPressed ? 'הצגת פקודות פעילה (Alt לחוץ)' : 'החזק Alt להצגת פקודות'}</span>
            </span>
          )}
          <span className="text-[11px] font-mono text-gray-400">תווים: {sourceText.length}</span>
        </div>
      </div>

      {/* Editor text container with overlay syntax styling */}
      <div className="flex-1 relative overflow-hidden" dir="rtl">
        {/* Underlying transparent Textarea for typing */}
        <textarea
          ref={textareaRef}
          value={sourceText}
          onChange={(e) => onChangeSource(e.target.value)}
          onSelect={handleSelect}
          onKeyDown={handleKeyDown}
          dir="rtl"
          placeholder="התחל לכתוב בעברית כאן... הקש / לפלטת פקודות עימוד או הדבק תבנית למעלה."
          className="absolute inset-0 w-full h-full p-6 outline-none border-none resize-none font-sans text-sm leading-relaxed text-gray-800 bg-transparent caret-blue-600 z-10 selection:bg-blue-100"
          style={{
            // Keep fonts exactly matched
            fontFamily: config.fontFamily === 'Frank Ruhl Libre' ? '"Frank Ruhl Libre", serif' :
                        config.fontFamily === 'Rubik' ? '"Rubik", sans-serif' :
                        config.fontFamily === 'JetBrains Mono' ? '"JetBrains Mono", monospace' : '"Inter", sans-serif',
          }}
        />

        {/* Overlay styled layer for beautiful syntax tokens */}
        {/* We keep this mirrored but ignore pointer events so clicks pass straight to the textarea */}
        <div
          className="absolute inset-0 w-full h-full p-6 overflow-y-auto whitespace-pre-wrap break-words pointer-events-none text-sm select-none"
          style={{
            fontFamily: config.fontFamily === 'Frank Ruhl Libre' ? '"Frank Ruhl Libre", serif' :
                        config.fontFamily === 'Rubik' ? '"Rubik", sans-serif' :
                        config.fontFamily === 'JetBrains Mono' ? '"JetBrains Mono", monospace' : '"Inter", sans-serif',
            color: 'transparent', // make the raw text transparent, but tokens visible!
          }}
        >
          {sourceText ? renderHighlightedContent() : (
            <span className="text-gray-300 font-sans italic">
              התחל לכתוב בעברית כאן... הקש / לפלטת פקודות עימוד או הדבק תבנית למעלה.
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
