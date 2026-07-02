import React, { useState, useEffect, useRef, useMemo } from 'react';
import { commandRegistry } from '../utils/parser';
import { TypstCommand } from '../types';
import { Search, X, Check, Keyboard, CornerDownLeft } from 'lucide-react';

interface CommandPaletteProps {
  onClose: () => void;
  onSelectCommand: (commandName: string) => void;
}

export default function CommandPalette({ onClose, onSelectCommand }: CommandPaletteProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [selectedIndex, setSelectedIndex] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Focus search input on mount
  useEffect(() => {
    searchInputRef.current?.focus();
    // Close on escape key
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Categories list
  const categories = useMemo(() => {
    return ['All', 'Style', 'Structure', 'Layout', 'Table', 'Footnote'];
  }, []);

  // Filter commands by query and category
  const filteredCommands = useMemo(() => {
    return Object.values(commandRegistry).filter((cmd) => {
      const matchesSearch =
        cmd.hebrewName.includes(searchQuery) ||
        cmd.englishName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        cmd.description.includes(searchQuery);
      const matchesCategory = selectedCategory === 'All' || cmd.category === selectedCategory;
      return matchesSearch && matchesCategory;
    });
  }, [searchQuery, selectedCategory]);

  // Reset selected index when filters change
  useEffect(() => {
    setSelectedIndex(0);
  }, [searchQuery, selectedCategory]);

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % filteredCommands.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + filteredCommands.length) % filteredCommands.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredCommands[selectedIndex]) {
        onSelectCommand(filteredCommands[selectedIndex].hebrewName);
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh] bg-gray-900/50 backdrop-blur-sm p-4">
      <div
        ref={containerRef}
        onKeyDown={handleKeyDown}
        className="w-full max-w-xl bg-white rounded-2xl shadow-2xl border border-gray-100 flex flex-col overflow-hidden max-h-[70vh] animate-in fade-in zoom-in-95 duration-150"
        dir="rtl"
      >
        {/* Search header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100">
          <Search size={18} className="text-gray-400 min-w-[18px]" />
          <input
            ref={searchInputRef}
            type="text"
            placeholder="חפש פקודת עימוד בעברית או באנגלית... (לדוגמה: הדגשה, כותרת, רשימה)"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-transparent outline-none border-none text-sm text-gray-800 placeholder-gray-400 font-sans text-right"
          />
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-gray-100 transition-colors text-gray-400 hover:text-gray-600"
          >
            <X size={16} />
          </button>
        </div>

        {/* Category filters */}
        <div className="flex items-center gap-1.5 px-4 py-2 bg-gray-50/50 border-b border-gray-100 overflow-x-auto select-none">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${
                selectedCategory === cat
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {cat === 'All' ? 'הכל' :
               cat === 'Style' ? 'סגנון וטקסט' :
               cat === 'Structure' ? 'מבנה וכותרות' :
               cat === 'Layout' ? 'יישור ועימוד' :
               cat === 'Table' ? 'טבלאות' : 'הערות שוליים'}
            </button>
          ))}
        </div>

        {/* Commands list */}
        <div className="flex-1 overflow-y-auto divide-y divide-gray-50 max-h-[40vh]">
          {filteredCommands.length > 0 ? (
            filteredCommands.map((cmd, idx) => {
              const isSelected = idx === selectedIndex;
              return (
                <div
                  key={cmd.hebrewName}
                  onClick={() => onSelectCommand(cmd.hebrewName)}
                  className={`flex items-center justify-between p-3 cursor-pointer transition-all ${
                    isSelected ? 'bg-blue-50/60 border-r-4 border-blue-600' : 'hover:bg-gray-50/70'
                  }`}
                >
                  <div className="flex flex-col gap-0.5 text-right flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-gray-900 text-sm font-mono text-blue-600">
                        #{cmd.hebrewName}
                      </span>
                      <span className="text-[10px] text-gray-400 font-medium bg-gray-100 px-1.5 py-0.2 rounded font-sans">
                        {cmd.englishName}
                      </span>
                    </div>
                    <span className="text-xs text-gray-500 font-sans">{cmd.description}</span>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="text-[11px] font-mono text-gray-400 hidden sm:inline" dir="ltr">
                      {cmd.example}
                    </span>
                    {isSelected && (
                      <span className="text-[10px] text-blue-500 font-sans font-medium flex items-center gap-1 bg-blue-100/50 px-2 py-0.5 rounded">
                        <CornerDownLeft size={10} />
                        <span>בחר</span>
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          ) : (
            <div className="p-8 text-center text-gray-400 text-sm font-sans">
              לא נמצאו פקודות תואמות לחיפוש שלך.
            </div>
          )}
        </div>

        {/* Shortcut hint footer */}
        <div className="px-4 py-2 bg-gray-50 border-t border-gray-100 flex items-center justify-between text-[10px] text-gray-400 select-none">
          <div className="flex items-center gap-1">
            <Keyboard size={12} />
            <span>השתמש ב- ↑ ↓ וב- Enter לניווט</span>
          </div>
          <span>הקש Esc ליציאה</span>
        </div>
      </div>
    </div>
  );
}
