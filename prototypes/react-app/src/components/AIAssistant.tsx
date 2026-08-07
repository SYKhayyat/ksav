import React, { useState, useRef, useEffect } from 'react';
import { Sparkles, Send, X, Check, Copy, Plus } from 'lucide-react';

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
  const chatEndRef = useRef<HTMLDivElement>(null);

  // The rotating "מתחבר למוח המלאכותי…" phrases that used to live here are gone
  // with the request they were covering for. A spinner that can never resolve,
  // over a fetch to an endpoint that was deleted, is the most expensive kind of
  // lie a UI can tell: it looks like it is working.

  // Scroll to bottom on new messages
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const presetPrompts = [
    { label: 'נסח דברי תורה', prompt: 'כתוב דבר תורה קצר ומרגש על פרשת השבוע הנוכחית. השתמש בפקודות עימוד של קסב כמו #כותרת1, #הדגשה, והערות שוליים עם #הערה להסברים תורניים.' },
    { label: 'עצב את הטקסט שלי', prompt: `קח את הטקסט הבא מהעורך שלי והוסף לו פקודות עימוד של קסב (כמו #הדגשה, #כותרת1, #רשימה, #הערה) בצורה מקצועית ויפה: \n\n${editorText}` },
    { label: 'תקן שגיאות כתיב', prompt: `תקן שגיאות כתיב וניסוח בטקסט הבא, תוך שמירה מלאה על כל פקודות העימוד של קסב (#הדגשה, #הערה וכו׳) ללא שינוי שלהן: \n\n${editorText}` },
    { label: 'צור מכתב פנייה', prompt: 'צור תבנית של מכתב פנייה רשמי יפה המיושר לימין (#ימין), עם כותרת מודגשת, רשימה מסודרת של נקודות, והערת שוליים אחת.' },
  ];

  // What this panel says instead of calling a backend.
  //
  // It used to `fetch('/api/gemini/assistant')`, an endpoint that was deleted on
  // 24 July together with the Express server behind it — an open, unmetered,
  // unauthenticated proxy holding the owner's Gemini key, which is a trap for
  // whoever clones a public repository first (see ../../README.md). So the call
  // failed, and the failure was reported as *`אנא ודא שמפתח ה-API מוגדר כראוי`* —
  // "check your API key is configured" — which sent the reader to
  // `.env.example`, which offered them a `GEMINI_API_KEY` slot to fill in for a
  // route that does not exist. Three artifacts pointing at each other and at
  // nothing.
  //
  // Restoring the proxy is not the fix; it is the vulnerability. What is left is
  // the honest thing an archived mock can do: say so, and hand the prompt back
  // so it can be pasted into whatever assistant the reader actually uses. The
  // panel still demonstrates the interaction it was built to demonstrate, which
  // is the whole reason this directory is kept.
  const ARCHIVED_NOTE =
    'הפרוטוטייפ הזה נשמר לצורכי היסטוריה בלבד ואין מאחוריו שרת. ' +
    'שרת ה-Gemini המקורי הוסר במכוון (ראו prototypes/README.md). ' +
    'הנה הבקשה שהייתה נשלחת — אפשר להעתיק אותה לכל עוזר כתיבה:';

  const handleSend = (customPrompt?: string) => {
    const promptToSend = customPrompt || input;
    if (!promptToSend.trim()) return;

    setMessages((prev) => [
      ...prev,
      { role: 'user', text: promptToSend },
      { role: 'model', text: `${ARCHIVED_NOTE}\n\n${promptToSend}` },
    ]);
    if (!customPrompt) setInput('');
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

        <div ref={chatEndRef} />
      </div>

      {/* Preset Suggestions */}
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
          className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs text-gray-800 placeholder-gray-400 outline-none focus:border-blue-500 focus:bg-white transition-all font-sans"
        />
        <button
          type="submit"
          disabled={!input.trim()}
          className="p-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-100 disabled:text-gray-400 text-white rounded-xl shadow-md transition-all flex items-center justify-center"
        >
          <Send size={14} className="transform rotate-180" />
        </button>
      </form>
    </div>
  );
}
