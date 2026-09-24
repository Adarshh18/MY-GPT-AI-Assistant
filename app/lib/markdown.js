"use client";

import { useState } from "react";

function parseInline(text, keyPrefix) {
  const pattern = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*\n]+\*)|(\[[^\]]+\]\([^)]+\))/g;
  const nodes = [];
  let lastIndex = 0;
  let match;
  let i = 0;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }
    const token = match[0];

    if (token.startsWith("`")) {
      nodes.push(
        <code key={`${keyPrefix}-${i++}`} className="inline-code">
          {token.slice(1, -1)}
        </code>
      );
    } else if (token.startsWith("**")) {
      nodes.push(<strong key={`${keyPrefix}-${i++}`}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith("*")) {
      nodes.push(<em key={`${keyPrefix}-${i++}`}>{token.slice(1, -1)}</em>);
    } else if (token.startsWith("[")) {
      const m = token.match(/\[([^\]]+)\]\(([^)]+)\)/);
      if (m) {
        nodes.push(
          <a key={`${keyPrefix}-${i++}`} href={m[2]} target="_blank" rel="noreferrer">
            {m[1]}
          </a>
        );
      }
    }
    lastIndex = match.index + token.length;
  }

  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
}

function toBlocks(content) {
  const lines = content.split("\n");
  const blocks = [];
  let i = 0;
  let listBuffer = null;

  function flushList() {
    if (listBuffer) {
      blocks.push(listBuffer);
      listBuffer = null;
    }
  }

  while (i < lines.length) {
    const line = lines[i];

    if (/^```/.test(line.trim())) {
      flushList();
      const lang = line.trim().slice(3).trim();
      const codeLines = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i].trim())) {
        codeLines.push(lines[i]);
        i++;
      }
      i++;
      blocks.push({ type: "code", lang, content: codeLines.join("\n") });
      continue;
    }

    const headerMatch = line.match(/^(#{1,3})\s+(.*)/);
    if (headerMatch) {
      flushList();
      blocks.push({ type: "header", level: headerMatch[1].length, content: headerMatch[2] });
      i++;
      continue;
    }

    const ulMatch = line.match(/^\s*[-*]\s+(.*)/);
    if (ulMatch) {
      if (!listBuffer || listBuffer.type !== "ul") {
        flushList();
        listBuffer = { type: "ul", items: [] };
      }
      listBuffer.items.push(ulMatch[1]);
      i++;
      continue;
    }

    const olMatch = line.match(/^\s*\d+\.\s+(.*)/);
    if (olMatch) {
      if (!listBuffer || listBuffer.type !== "ol") {
        flushList();
        listBuffer = { type: "ol", items: [] };
      }
      listBuffer.items.push(olMatch[1]);
      i++;
      continue;
    }

    flushList();

    if (line.trim() === "") {
      i++;
      continue;
    }

    const paraLines = [line];
    i++;
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !/^```/.test(lines[i].trim()) &&
      !/^#{1,3}\s/.test(lines[i]) &&
      !/^\s*[-*]\s+/.test(lines[i]) &&
      !/^\s*\d+\.\s+/.test(lines[i])
    ) {
      paraLines.push(lines[i]);
      i++;
    }
    blocks.push({ type: "para", content: paraLines.join("\n") });
  }

  flushList();
  return blocks;
}

function CodeBlock({ lang, content }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable — silently ignore
    }
  }

  return (
    <div className="code-block">
      <div className="code-block-head">
        <span className="code-lang">{lang || "code"}</span>
        <button type="button" className="code-copy-btn" onClick={handleCopy}>
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre>
        <code>{content}</code>
      </pre>
    </div>
  );
}

function renderBlock(block, idx) {
  switch (block.type) {
    case "code":
      return <CodeBlock key={idx} lang={block.lang} content={block.content} />;
    case "header": {
      const level = Math.min(block.level + 3, 6);
      const Tag = `h${level}`;
      return (
        <Tag key={idx} className="msg-heading">
          {parseInline(block.content, `h${idx}`)}
        </Tag>
      );
    }
    case "ul":
      return (
        <ul key={idx} className="msg-list">
          {block.items.map((item, j) => (
            <li key={j}>{parseInline(item, `ul${idx}-${j}`)}</li>
          ))}
        </ul>
      );
    case "ol":
      return (
        <ol key={idx} className="msg-list">
          {block.items.map((item, j) => (
            <li key={j}>{parseInline(item, `ol${idx}-${j}`)}</li>
          ))}
        </ol>
      );
    case "para":
    default:
      return (
        <p key={idx} className="msg-para">
          {parseInline(block.content, `p${idx}`)}
        </p>
      );
  }
}

export function renderMarkdown(content) {
  if (!content) return null;
  return toBlocks(content).map((block, idx) => renderBlock(block, idx));
}
