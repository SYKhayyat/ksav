import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = 3000;

// Middleware for parsing JSON requests
app.use(express.json());

// Initialize Gemini client server-side ONLY
const getAiClient = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn('Warning: GEMINI_API_KEY environment variable is missing.');
  }
  return new GoogleGenAI({
    apiKey: apiKey || '',
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
};

// API Endpoint for Ksav AI writing companion
app.post('/api/gemini/assistant', async (req, res) => {
  try {
    const { prompt, editorText } = req.body;
    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    const ai = getAiClient();

    const systemInstruction = `You are "Ksav AI" (קסב AI), an expert typesetting assistant designed for Hebrew writers. You help users compose, proofread, format, and draft Hebrew documents using "Ksav" markup, which is a Hebrew-first wrapper over Typst.

Ksav Markup Reference (Hebrew command aliases wrapped in brackets):
- Bold: #הדגשה[טקסט]
- Italic: #נטוי[טקסט]
- Underline: #קו_תחתון[טקסט]
- Strikethrough: #קו_חוצה[טקסט]
- Heading 1: #כותרת1[טקסט]
- Heading 2: #כותרת2[טקסט]
- Heading 3: #כותרת3[טקסט]
- Bullet List: #רשימה[ #פריט[א] #פריט[ב] ]
- Numbered List: #רשימה_ממוספרת[ #פריט[א] #פריט[ב] ]
- Nested (hierarchical) Footnote: #הערה[טקסט]
- Flat Footnote: #הערהשטוחה[טקסט]
- Alignment: #מרכז[טקסט], #ימין[טקסט], #שמאל[טקסט]
- Table: #טבלה[ #שורה[#תא[תא 1] #תא[תא 2]] ]
- Font size: #כתב_גדול[טקסט], #כתב_קטן[טקסט]

Instructions:
1. Always write your responses in clear, friendly, helpful Hebrew (עברית).
2. If the user asks you to format, proofread, draft, or outline something, use Ksav markup to style it. Place your complete typeset document inside a code block using \`\`\`ksav or \`\`\`typst, so the editor can easily capture it!
3. Help the user learn how to write beautiful documents, explaining the Hebrew commands where necessary.
4. If they have existing text in their editor, respect it. We have attached the current editor content here: "${editorText || ''}".
5. Ensure Hebrew typography matches traditional Hebrew standards (RTL-aware, with appropriate headings and footnotes).`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.5-flash',
      contents: prompt,
      config: {
        systemInstruction,
        temperature: 0.7,
      },
    });

    const resultText = response.text || '';
    res.json({ result: resultText });
  } catch (error: any) {
    console.error('Error calling Gemini API:', error);
    res.status(500).json({ error: 'Failed to generate response', details: error.message });
  }
});

// Vite Dev Server Middleware or Static Build Serving
async function setupServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
    console.log('Vite middleware mounted in Development mode.');
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
    console.log('Serving static files in Production mode.');
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Ksav server running on http://0.0.0.0:${PORT}`);
  });
}

setupServer();
