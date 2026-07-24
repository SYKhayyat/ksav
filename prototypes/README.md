# Prototypes — archived, not the product

These two directories are the **original Gemini-authored prototypes** that predate
the real Ksav. They are kept for history and reference only. The product lives in
[`../ksav`](../ksav).

Neither prototype was ever real:

- **`react-app/`** — a React/Vite web mock. It rendered a hand-rolled HTML
  approximation of Hebrew typesetting and emitted invalid Typst strings that
  were never compiled. It never invoked Typst.
- **`flutter-app/`** — a Flutter + Rust mock with the same shape: a second
  reimplementation of the same custom bracket parser, also never compiling real
  Typst.

The real engine (`../ksav/engine`) embeds actual Typst and compiles every Hebrew
command as a genuine Typst function. Everything the prototypes gestured at, it
does for real.

## Why the server was removed

`react-app/` originally shipped with `server.ts`: an Express app that bound
`0.0.0.0:3000` and exposed `POST /api/gemini/assistant` with **no authentication,
no rate limit, no origin check, and no size limit**, proxying to Google Gemini
with the owner's API key and interpolating the request's editor text straight
into the model's system instruction. Anyone who could reach the port could spend
the owner's quota and steer the model, and upstream errors were returned verbatim
to the caller.

It was also effectively dead: it named the model `gemini-3.5-flash`, which is not
a model in Google's lineup, so every request would have failed.

An open, unmetered API-key proxy sitting at the front door of a public repository
is a trap for whoever clones it first. `server.ts` has been **deleted**, and the
prototype's `package.json` no longer references it or the Gemini/Express/dotenv
dependencies. The static React mock still builds (`npm install && npm run build`
inside `react-app/`), but the AI assistant panel has no backend and does nothing —
which is correct for an archived mock.
