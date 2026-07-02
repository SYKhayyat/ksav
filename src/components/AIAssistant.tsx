import React, { useState, useRef, useEffect } from 'react';
import { Sparkles, Send, X, ArrowLeft, Check, Copy, RefreshCw, FileText, Eraser, Plus } from 'lucide-react';

interface AIAssistantProps {
  onClose: () => void;
  editorText: string;
  onApplyText: (newText: string, append: boolean) => void;
}

interface ChatMessage {
  role: 'user' | 'model';
  text: string;
}

export default function AIAssistant({ onClose, editorText, onApplyText }: AIAssistantProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'model',
      text: 'שלום! אני עוזר הכתיבה של קסב (Ksav). אני יכול לסייע לך לנסח, לתקן שגיאות, לעצב דפי הלכה או ליצור דברי תורה מדהימים עם פקודות עימוד בעברית! במה תרצה שנעבוד היום?',
    },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [loadingPhrase, setLoadingPhrase] = useState('מתחבר למוח המלאכותי...');
  const chatEndRef = useRef<HTMLDivElement>(null);

  const loadingPhrases = [
    'מנתח את מבנה המסמך...',
    'מעבד סגנונות כתיבה בעברית...',
    'מדייק את פקודות העימוד...',
    'רושם כותרות והערות שוליים...',
    'מלביש את הטקסט במחלצות עימוד...',
  ];

  // Rotate loading phrases for high-quality UX
  useEffect(() => {
    let interval: any;
    if (isLoading) {
      let idx = 0;
      interval = setInterval(() => {
        setLoadingPhrase(loadingPhrases[idx % loadingPhrases.length]);
        idx++;
      }, 3000);
    }
    return () => clearInterval(interval);
  }, [isLoading]);

  // Scroll to bottom on new messages
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const presetPrompts = [
    { label: 'נסח דברי תורה', prompt: 'כתוב דבר תורה קצר ומרגש על פרשת השבוע הנוכחית. השתמש בפקודות עימוד של קסב כמו #כותרת1, #הדגשה, והערות שוליים עם #הערה להסברים תורניים.' },
    { label: 'עצב את הטקסט שלי', prompt: `קח את הטקסט הבא מהעורך שלי והוסף לו פקודות עימוד של קסב (כמו #הדגשה, #כותרת1, #רשימה, #הערה) בצורה מקצועית ויפה: \n\n${editorText}` },
    { label: 'תקן שגיאות כתיב', prompt: `תקן שגיאות כתיב וניסוח בטקסט הבא, תוך שמירה מלאה על כל פקודות העימוד של קסב (#הדגשה, #הערה וכו׳) ללא שינוי שלהן: \n\n${editorText}` },
    { label: 'צור מכתב פנייה', prompt: 'צור תבנית של מכתב פנייה רשמי יפה המיושר לימין (#ימין), עם כותרת מודגשת, רשימה מסודרת של נקודות, והערת שוליים אחת.' },
  ];

  const handleSend = async (customPrompt?: string) => {
    const promptToSend = customPrompt || input;
    if (!promptToSend.trim()) return;

    // Add user message
    setMessages((prev) => [...prev, { role: 'user', text: promptToSend }]);
    if (!customPrompt) setInput('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/gemini/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: promptToSend,
          editorText: editorText,
        }),
      });

      if (!response.ok) {
        throw new Error('שגיאה בתקשורת עם השרת');
      }

      const data = await response.json();
      setMessages((prev) => [...prev, { role: 'model', text: data.result }]);
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        { role: 'model', text: `סליחה, אירעה שגיאה בעיבוד הבקשה: ${err.message || 'אנא ודא שמפתח ה-API מוגדר כראוי.'}` },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  // Extract code block or take full response text
  const getCleanTextToApply = (text: string): string => {
    // Check if the response contains a typst/ksav code block
    const codeBlockRegex = /```(?:typst|ksav|hebrew)?\n([\s\S]*?)```/;
    const match = text.match(codeBlockRegex);
    if (match && match[1]) {
      return match[1].trim();
    }
    return text;
  };

  return (
    <div className="w-80 sm:w-96 bg-white border-l border-gray-200 h-full flex flex-col shadow-2xl relative z-40 animate-in slide-in-from-left duration-200" dir="rtl">
      {/* Side Bar Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md">
        <div className="flex items-center gap-2">
          <Sparkles size={16} className="text-blue-100 animate-pulse" />
          <h3 className="text-sm font-bold tracking-tight">עוזר כתיבה חכם קסב AI</h3>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded-lg hover:bg-white/10 text-blue-100 hover:text-white transition-colors"
        >
          <X size={16} />
        </button>
      </div>

      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50/50">
        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={`flex flex-col max-w-[85%] ${
              msg.role === 'user' ? 'mr-auto items-start' : 'ml-auto items-end'
            }`}
          >
            {/* Bubble content */}
            <div
              className={`p-3 rounded-2xl text-xs leading-relaxed font-sans shadow-sm border ${
                msg.role === 'user'
                  ? 'bg-blue-600 text-white border-blue-500 rounded-tl-none'
                  : 'bg-white text-gray-800 border-gray-200/60 rounded-tr-none'
              }`}
            >
              <p className="whitespace-pre-wrap">{msg.text}</p>

              {/* Quick actions for AI output messages */}
              {msg.role === 'model' && idx > 0 && (
                <div className="mt-3 pt-2.5 border-t border-gray-100 flex flex-wrap gap-1.5 justify-start">
                  <button
                    onClick={() => onApplyText(getCleanTextToApply(msg.text), false)}
                    className="flex items-center gap-1 px-2 py-1 text-[10px] font-semibold text-blue-600 bg-blue-50 border border-blue-100 hover:bg-blue-100 rounded transition-all"
                  >
                    <Check size={10} />
                    <span>החלף את הכל</span>
                  </button>
                  <button
                    onClick={() => onApplyText(getCleanTextToApply(msg.text), true)}
                    className="flex items-center gap-1 px-2 py-1 text-[10px] font-semibold text-gray-600 bg-gray-100 border border-gray-200 hover:bg-gray-200 rounded transition-all"
                  >
                    <Plus size={10} />
                    <span>הוסף לסוף</span>
                  </button>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(getCleanTextToApply(msg.text));
                    }}
                    className="flex items-center gap-1 px-2 py-1 text-[10px] font-semibold text-gray-500 bg-white border border-gray-200 hover:bg-gray-50 rounded transition-all"
                  >
                    <Copy size={10} />
                    <span>העתק</span>
                  </button>
                </div>
              )}
            </div>
            <span className="text-[9px] text-gray-400 mt-1 font-mono">
              {msg.role === 'user' ? 'אני' : 'קסב AI'}
            </span>
          </div>
        ))}

        {/* Loading Bubble */}
        {isLoading && (
          <div className="flex flex-col max-w-[85%] ml-auto items-end">
            <div className="p-3.5 bg-white text-gray-500 border border-gray-100 rounded-2xl rounded-tr-none shadow-sm flex items-center gap-2.5">
              <RefreshCw size={12} className="animate-spin text-indigo-600" />
              <span className="text-xs font-sans font-medium">{loadingPhrase}</span>
            </div>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      {/* Preset Suggestions (Shown when input is empty and not loading) */}
      {!isLoading && (
        <div className="px-4 py-2 border-t border-gray-100 bg-white flex flex-wrap gap-1.5 overflow-x-auto max-h-24">
          {presetPrompts.map((p) => (
            <button
              key={p.label}
              onClick={() => handleSend(p.prompt)}
              className="px-2 py-1 bg-gray-50 border border-gray-200 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 rounded-full text-[10px] text-gray-600 font-sans transition-all whitespace-nowrap shadow-sm"
            >
              {p.label}
            </button>
          ))}
        </div>
      )}

      {/* Input Form Footer */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSend();
        }}
        className="p-3 border-t border-gray-200 bg-white flex items-center gap-2"
      >
        <input
          type="text"
          placeholder="שאל אותי משהו, בקש עימוד, או דבר תורה..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={isLoading}
          className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs text-gray-800 placeholder-gray-400 outline-none focus:border-blue-500 focus:bg-white transition-all font-sans"
        />
        <button
          type="submit"
          disabled={isLoading || !input.trim()}
          className="p-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-100 disabled:text-gray-400 text-white rounded-xl shadow-md transition-all flex items-center justify-center"
        >
          <Send size={14} className="transform rotate-180" />
        </button>
      </form>
    </div>
  );
}
