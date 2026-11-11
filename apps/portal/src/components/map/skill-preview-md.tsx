"use client";

import { Fragment, type ReactNode } from "react";

/**
 * Minimal, dependency-free Markdown renderer for the map skill-preview body.
 * Handles only the subset the SKILL_PREVIEWS excerpts actually use — h1/h2/h3,
 * **bold**, `inline code`, > blockquote, - / 1. lists, --- rules and | tables |.
 * Content is our own static, EN data (No-Invention · founder exception), so a
 * faithful, safe render beats pulling a full markdown lib into the bundle.
 */

/** inline: split a line into text / **bold** / `code` runs. */
function inline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  // tokenizer over `code` and **bold** (code wins, so a backtick span is atomic)
  const re = /(`[^`]+`)|(\*\*[^*]+\*\*)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[1]) {
      out.push(
        <code key={k++} className="rounded-[3px] bg-st-card-2 px-1 py-[1px] font-mono text-[11.5px] text-st-ivory">
          {m[1].slice(1, -1)}
        </code>
      );
    } else if (m[2]) {
      out.push(
        <strong key={k++} className="font-semibold text-st-ivory">
          {m[2].slice(2, -2)}
        </strong>
      );
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** split a "| a | b | c |" row into trimmed cells. */
function cells(row: string): string[] {
  return row
    .replace(/^\s*\|/, "")
    .replace(/\|\s*$/, "")
    .split("|")
    .map((c) => c.trim());
}

export function SkillPreviewMarkdown({ md }: { md: string }) {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];
    const s = line.trim();

    // blank
    if (s === "") { i++; continue; }

    // horizontal rule
    if (s === "---" || s === "***") {
      blocks.push(<hr key={key++} className="my-3 border-0 border-t border-st-line" />);
      i++;
      continue;
    }

    // headings
    if (s.startsWith("### ")) {
      blocks.push(<h4 key={key++} className="mb-1 mt-3 text-[12px] font-bold uppercase tracking-[0.12em] text-st-ink-2">{inline(s.slice(4))}</h4>);
      i++;
      continue;
    }
    if (s.startsWith("## ")) {
      blocks.push(<h3 key={key++} className="mb-1.5 mt-4 text-[13px] font-bold uppercase tracking-[0.14em] text-st-ink-2">{inline(s.slice(3))}</h3>);
      i++;
      continue;
    }
    if (s.startsWith("# ")) {
      blocks.push(<h2 key={key++} className="mb-2 text-[17px] font-semibold leading-snug tracking-[0.01em] text-st-ivory">{inline(s.slice(2))}</h2>);
      i++;
      continue;
    }

    // table — a run of lines starting with "|"
    if (s.startsWith("|")) {
      const rows: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) { rows.push(lines[i].trim()); i++; }
      const isSep = (r: string) => /^\|?[\s:|-]+\|?$/.test(r) && r.includes("-");
      const header = rows[0] && !isSep(rows[0]) ? cells(rows[0]) : null;
      const bodyRows = rows.filter((r, idx) => !(idx === 0 && header) && !isSep(r)).map(cells);
      blocks.push(
        <div key={key++} className="my-2.5 overflow-x-auto">
          <table className="w-full border-collapse text-[11.5px]">
            {header ? (
              <thead>
                <tr>
                  {header.map((h, ci) => (
                    <th key={ci} className="border-b border-st-line-2 px-2 py-1 text-left font-semibold text-st-ink-2">{inline(h)}</th>
                  ))}
                </tr>
              </thead>
            ) : null}
            <tbody>
              {bodyRows.map((r, ri) => (
                <tr key={ri}>
                  {r.map((c, ci) => (
                    <td key={ci} className="border-b border-st-line px-2 py-1 align-top text-st-ivory/85">{inline(c)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      continue;
    }

    // blockquote — a run of "> " lines
    if (s.startsWith(">")) {
      const quote: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith(">")) { quote.push(lines[i].trim().replace(/^>\s?/, "")); i++; }
      blocks.push(
        <blockquote key={key++} className="my-2.5 border-l-2 border-[color-mix(in_srgb,var(--map-copper,#c58b5f)_60%,transparent)] pl-3 text-[12.5px] leading-[1.6] text-st-ivory/80">
          {quote.map((q, qi) => (<Fragment key={qi}>{inline(q)}{qi < quote.length - 1 ? <br /> : null}</Fragment>))}
        </blockquote>
      );
      continue;
    }

    // unordered list
    if (s.startsWith("- ") || s.startsWith("* ")) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) { items.push(lines[i].trim().replace(/^[-*]\s+/, "")); i++; }
      blocks.push(
        <ul key={key++} className="my-2 list-disc space-y-1 pl-5 text-[12.5px] leading-[1.6] text-st-ivory/90">
          {items.map((it, ii) => (<li key={ii}>{inline(it)}</li>))}
        </ul>
      );
      continue;
    }

    // ordered list
    if (/^\d+\.\s/.test(s)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) { items.push(lines[i].trim().replace(/^\d+\.\s+/, "")); i++; }
      blocks.push(
        <ol key={key++} className="my-2 list-decimal space-y-1 pl-5 text-[12.5px] leading-[1.6] text-st-ivory/90">
          {items.map((it, ii) => (<li key={ii}>{inline(it)}</li>))}
        </ol>
      );
      continue;
    }

    // paragraph — accumulate consecutive plain lines
    const para: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !/^(#{1,3}\s|>|\||-\s|\*\s|\d+\.\s|---$|\*\*\*$)/.test(lines[i].trim())
    ) {
      para.push(lines[i].trim());
      i++;
    }
    blocks.push(
      <p key={key++} className="my-2 text-[12.5px] leading-[1.65] text-st-ivory/90">
        {para.map((ln, li) => (<Fragment key={li}>{inline(ln)}{li < para.length - 1 ? " " : null}</Fragment>))}
      </p>
    );
  }

  return <>{blocks}</>;
}
