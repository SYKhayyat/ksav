# קְסָב · Ksav

**A Hebrew-first typesetting and writing system** — a rich in-browser editor for composing
beautifully typeset Hebrew documents using "Ksav" markup, a Hebrew-first command layer inspired
by [Typst](https://typst.app/). It ships with a Word-like toolbar, a live preview, a command
palette, ready-made document templates, and an AI writing companion powered by Google Gemini.

Ksav (כְּתָב, "writing"/"script") is aimed at Hebrew writers — from a bochur writing divrei
Torah to anyone who wants well-formatted RTL Hebrew documents with proper headings, footnotes,
tables, and nikud.

> This repository contains **three implementations** of Ksav. The top level is a React/Vite
> web-app prototype (documented below). Two additional implementations live in subdirectories —
> see [Repository layout](#repository-layout).

## What it does

- **Hebrew markup editor** — write with bracketed Hebrew commands such as `#הדגשה[טקסט]` (bold),
  `#כותרת1[…]` (heading), `#רשימה[…]` (list), `#טבלה[…]` (table), `#הערה[…]` (footnote), and
  alignment/size commands.
- **Prose & source modes** — toggle between a clean "prose" view that renders the styling and a
  raw "source" (markup) view.
- **Live split-screen preview** of the rendered document, with print / save-as-PDF.
- **Command palette** (`/` or `Ctrl+K`) — fuzzy-search all commands in Hebrew or English and
  insert them at the cursor.
- **Word-like toolbar** with formatting, templates, and configuration controls.
- **Document sidebar** — manage multiple documents; content is auto-saved to `localStorage`.
- **AI writing companion** — "Ksav AI" (קסב AI), a Gemini-backed assistant that drafts,
  proofreads, and formats Hebrew text using Ksav markup. Requests are proxied through the
  server so the API key never reaches the browser.
- **Fully RTL, bilingual-aware UI** with configurable font, size, margins, and footnote style.

## Tech stack

- **Frontend:** React 19, TypeScript, Vite 6, Tailwind CSS 4, `lucide-react`, `motion`
- **Backend:** Express (Node), serving the Vite middleware in dev and the static build in prod
- **AI:** `@google/genai` (Google Gemini), called **server-side only**
- **Tooling:** `tsx` (dev runner), `esbuild` (server bundling), `tsc` for type-checking

## Repository layout

| Path | Description |
| --- | --- |
| `src/` | The React SPA — editor components (`ProseEditor`, `LivePreview`, `Toolbar`, `CommandPalette`, `AIAssistant`, `Sidebar`), the Ksav markup parser and command/template registries (`utils/parser.ts`), and shared types. This prototype renders Ksav with its own JS parser (it does not invoke a real Typst compiler). |
| `server.ts` | Express server (port `3000`). Exposes `POST /api/gemini/assistant` and serves the frontend. |
| `ksav/` | A ground-up rewrite that compiles documents with the **real Typst engine** (Rust + WASM), with a CodeMirror SPA and a Tauri desktop app. Has its own detailed [README](ksav/README.md). |
| `ksav_flutter_rust/` | An earlier **Flutter + Rust (FFI)** prototype of the same editor. Has its own [README](ksav_flutter_rust/README.md) (in Hebrew). |
| `index.html`, `vite.config.ts`, `tsconfig.json` | Vite app entry and configuration. |
| `metadata.json` | AI Studio applet manifest. |

> Per `ksav/README.md`, both the top-level `src/` React app and `ksav_flutter_rust/` are earlier
> prototypes that *mock* the renderer. The `ksav/` directory is the ground-up rewrite that runs
> the genuine Typst compiler — start there if you want the production engine.

## Getting started

**Prerequisites:** Node.js and a Google Gemini API key.

1. Install dependencies:
   ```sh
   npm install
   ```
2. Create a `.env` file (see [`.env.example`](.env.example)) and set your Gemini API key:
   ```sh
   GEMINI_API_KEY="your-key-here"
   ```
3. Start the dev server:
   ```sh
   npm run dev
   ```
   The app runs at http://localhost:3000 (Express with Vite middleware and HMR).

### Available scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Run the Express + Vite dev server (`tsx server.ts`). |
| `npm run build` | Build the frontend with Vite and bundle `server.ts` into `dist/server.cjs` with esbuild. |
| `npm run start` | Run the production build (`node dist/server.cjs`). Set `NODE_ENV=production` to serve the static `dist/`. |
| `npm run lint` | Type-check with `tsc --noEmit`. |

## Environment variables

Defined in [`.env.example`](.env.example):

| Variable | Required | Description |
| --- | --- | --- |
| `GEMINI_API_KEY` | Yes | Google Gemini API key, used server-side for the AI companion. Without it, AI requests fail (a warning is logged at startup). |
| `APP_URL` | No | The URL where the app is hosted; used for self-referential links. Injected automatically when deployed on AI Studio. |

## API

The server exposes a single application endpoint:

- `POST /api/gemini/assistant` — body `{ prompt, editorText }` → `{ result }`. Sends the prompt
  (plus the current editor content as context) to Gemini with the "Ksav AI" system instruction
  and returns the generated Hebrew markup.
