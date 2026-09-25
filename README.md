# MY-GPT
 
A personal AI chat assistant with a custom-built UI (no third-party chat UI library) —
built with Next.js + React, talking directly to Google's Gemini API.

## 1. Install dependencies
 
```bash
npm install
```

## 2. Add your API key

Get a free API key from **https://aistudio.google.com/apikey**.

Create a file named `.env.local` in this project's root folder (same level as
`package.json`) with this single line:

```
GOOGLE_API_KEY=your_key_here
```

(There's a `.env.example` file in this folder you can copy as a starting point.)

## 3. Run it

```bash
npm run dev
```

Open **http://localhost:3000** in your browser. Type a question and press Enter
(Shift+Enter for a new line).

## How it works

- `app/page.js` — the custom chat UI (message bubbles, input box, typing indicator).
- `app/api/chat/route.js` — a server route that sends your conversation to Google's
  Gemini API (`gemini-2.0-flash`) and returns the reply.
- `app/globals.css` — all the styling, no CSS framework.

If something goes wrong (missing/invalid key, network issue, blocked response),
the error is shown directly in the chat window instead of failing silently, and
also logged in the terminal running `npm run dev`.

## Notes

- `npm audit` may report two moderate/high advisories in a transitive `postcss`
  dependency bundled inside Next.js itself. They're only fully resolved by
  upgrading to Next.js 16 (a breaking change), and don't matter much for an app
  you only run on your own machine for personal use. Let me know if you'd like
  help upgrading to Next 16 later.
- Swap `GEMINI_MODEL` in `app/api/chat/route.js` to try a different Gemini model.
