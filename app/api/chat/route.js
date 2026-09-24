import { NextResponse } from "next/server";

// Auto-updating Google aliases: these always point at a current model, so
// this doesn't break again the way it did when a hardcoded model version
// ("gemini-2.0-flash") got retired. If the primary is overloaded, we fall
// back to the lighter "lite" model, which tends to have more spare capacity.
const PRIMARY_MODEL = "gemini-flash-latest";
const FALLBACK_MODEL = "gemini-flash-lite-latest";

function buildSystemInstruction() {
  // This server runs on your own machine, so the system clock here is
  // your machine's real local time. Telling the model the actual date/time
  // fixes "what's today's date" style questions, which a language model
  // can never answer correctly on its own (it has no internal clock).
  const now = new Date();
  const formatted = now.toLocaleString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });

  return (
    "You are MY-GPT, a helpful, accurate, and friendly personal AI assistant. " +
    `The current date and time is: ${formatted}. Use this whenever a question ` +
    "depends on knowing today's date, or on how recent something is. " +
    "You have a Google Search tool available: use it for anything that could have " +
    "changed since your training (news, scores, prices, current events, recent " +
    "releases, or anything you're not fully sure is still accurate), and answer " +
    "directly from the search results rather than guessing. " +
    "Answer questions clearly and directly. If you are still not certain about " +
    "something after considering whether to search, say so instead of guessing."
  );
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function callGemini(model, apiKey, contents, useSearch) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

  const body = {
    contents,
    systemInstruction: { parts: [{ text: buildSystemInstruction() }] },
    generationConfig: { temperature: 0.7 },
  };

  if (useSearch) {
    // Lets Gemini pull in live Google Search results before answering.
    // Some free-tier accounts have zero grounding quota available (a known
    // Google-side account quirk, separate from ordinary chat quota), so
    // this is only ever tried first, with a non-search fallback below.
    body.tools = [{ google_search: {} }];
  }

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify(body),
  });

  const data = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, data };
}

// Gemini returns 503 when a model is temporarily overloaded, and 429 when
// a rate limit is hit. Both are usually resolved by waiting a moment and
// retrying, so we retry a couple of times before giving up on a model.
function isRetryable(status) {
  return status === 503 || status === 429;
}

function extractReplyText(data) {
  const parts = data?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return "";
  // With search grounding on, a response can carry more than one text part;
  // join them all rather than assuming the answer is in parts[0].
  return parts
    .map((p) => p?.text || "")
    .join("")
    .trim();
}

export async function POST(req) {
  try {
    const apiKey = process.env.GOOGLE_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        {
          error:
            "Missing GOOGLE_API_KEY. Create a .env.local file in the project root " +
            "with GOOGLE_API_KEY=your_key_here, then restart `npm run dev`.",
        },
        { status: 500 }
      );
    }

    const { messages } = await req.json();

    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: "No messages provided." }, { status: 400 });
    }

    // Convert our simple {role, content} history into Gemini's format.
    // Gemini uses "model" instead of "assistant", and only accepts user/model roles.
    const contents = messages
      .filter((m) => m && (m.role === "user" || m.role === "assistant") && m.content)
      .map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      }));

    // Try grounded search first for the best answers, but fall back to a
    // plain (non-grounded) call - on the same model, then the lighter one -
    // if search grounding is overloaded or its quota is exhausted, so the
    // chat still works even when live search doesn't.
    const attempts = [
      { model: PRIMARY_MODEL, useSearch: true, retries: 1 },
      { model: PRIMARY_MODEL, useSearch: false, retries: 1 },
      { model: FALLBACK_MODEL, useSearch: false, retries: 1 },
    ];

    let lastErrorMessage = "Something went wrong. Please try again.";
    let lastStatus = 502;

    for (const { model, useSearch, retries } of attempts) {
      for (let attempt = 0; attempt <= retries; attempt++) {
        const { ok, status, data } = await callGemini(model, apiKey, contents, useSearch);

        if (ok) {
          const reply = extractReplyText(data);

          if (reply) {
            return NextResponse.json({ reply });
          }

          const blockReason = data?.promptFeedback?.blockReason;
          lastErrorMessage = blockReason
            ? `The response was blocked (${blockReason}). Try rephrasing your question.`
            : "The model returned an empty response. Please try again.";
          lastStatus = 502;
          break; // empty reply won't be fixed by retrying the same model
        }

        lastErrorMessage = data?.error?.message || `Gemini API error (status ${status}).`;
        lastStatus = status;

        if (isRetryable(status) && attempt < retries) {
          await sleep(500 * (attempt + 1)); // 500ms, then 1000ms
          continue;
        }

        break; // not retryable, or out of retries for this model -> try next model
      }
    }

    return NextResponse.json({ error: lastErrorMessage }, { status: lastStatus });
  } catch (err) {
    console.error("Chat API error:", err);
    return NextResponse.json(
      { error: "Something went wrong on the server. Check the terminal running `npm run dev` for details." },
      { status: 500 }
    );
  }
}
