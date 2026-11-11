import type { ReactNode } from "react";

/**
 * Minimal markdown renderer for the skill reader (Pkg11 · N7 FD2/FD3). Handles the
 * subset the SKILL.md previews use — headings, paragraphs, **bold**, `code`, tables,
 * lists, blockquotes, fenced code, hr. No dependency added; content is trusted local
 * data. Everything is token-driven so the reader body holds in dark + light.
 */

/** Inline: split a line into **bold** / `code` / plain runs. */
function inline(text: string, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith("**")) {
      out.push(
        <strong key={`${key}-b${i}`} className="font-semibold text-st-ivory">
          {tok.slice(2, -2)}
        </strong>
      );
    } else {
      out.push(
        <code
          key={`${key}-c${i}`}
          className="rounded-[5px] bg-st-card-2 px-1.5 py-0.5 font-mono text-[12px] text-st-ivory"
        >
          {tok.slice(1, -1)}
        </code>
      );
    }
    last = m.index + tok.length;
    i += 1;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

const H_CLASS: Record<number, string> = {
  1: "mt-1 text-[18px] font-bold leading-snug tracking-[-0.01em] text-st-ivory",
  2: "mt-6 text-[11px] font-bold uppercase tracking-[0.12em] text-st-ink-3",
  3: "mt-5 text-[14px] font-semibold text-st-ivory",
  4: "mt-4 text-[13.5px] font-semibold text-st-ivory",
};

function cells(row: string): string[] {
  return row
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());
}

export function SkillMarkdown({ markdown }: { markdown: string }) {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;
  let k = 0;

  while (i < lines.length) {
    const line = lines[i];

    // blank
    if (line.trim() === "") {
      i += 1;
      continue;
    }

    // fenced code
    if (line.trim().startsWith("```")) {
      const buf: string[] = [];
      i += 1;
      while (i < lines.length && !lines[i].trim().startsWith("```")) {
        buf.push(lines[i]);
        i += 1;
      }
      i += 1; // closing fence
      blocks.push(
        <pre
          key={`pre${k++}`}
          className="mt-3 overflow-x-auto rounded-[10px] border border-st-line-2 bg-st-card-2 p-3 font-mono text-[12px] leading-relaxed text-st-ink-2"
        >
          {buf.join("\n")}
        </pre>
      );
      continue;
    }

    // hr
    if (/^(-{3,}|\*{3,})$/.test(line.trim())) {
      blocks.push(<hr key={`hr${k++}`} className="mt-5 border-st-line" />);
      i += 1;
      continue;
    }

    // heading
    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    if (h) {
      const level = h[1].length;
      blocks.push(
        <p key={`h${k++}`} className={H_CLASS[level]}>
          {inline(h[2], `h${k}`)}
        </p>
      );
      i += 1;
      continue;
    }

    // table (header row + separator)
    if (
      line.trim().startsWith("|") &&
      i + 1 < lines.length &&
      /^[\s|:-]+$/.test(lines[i + 1].trim()) &&
      lines[i + 1].includes("-")
    ) {
      const header = cells(line);
      i += 2; // skip header + separator
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        rows.push(cells(lines[i]));
        i += 1;
      }
      blocks.push(
        <div key={`tbl${k++}`} className="mt-3 overflow-x-auto">
          <table className="w-full border-collapse text-left text-[12.5px]">
            <thead>
              <tr>
                {header.map((c, ci) => (
                  <th
                    key={ci}
                    className="border-b border-st-line-2 pb-2 pr-4 font-semibold text-st-ivory"
                  >
                    {inline(c, `th${k}-${ci}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, ri) => (
                <tr key={ri}>
                  {r.map((c, ci) => (
                    <td
                      key={ci}
                      className="border-b border-st-line py-2 pr-4 align-top text-st-ink-2"
                    >
                      {inline(c, `td${k}-${ri}-${ci}`)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      continue;
    }

    // blockquote
    if (line.trim().startsWith(">")) {
      const buf: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith(">")) {
        buf.push(lines[i].replace(/^\s*>\s?/, ""));
        i += 1;
      }
      blocks.push(
        <blockquote
          key={`bq${k++}`}
          className="mt-3 border-l-2 border-st-line-2 pl-3 text-[13px] leading-relaxed text-st-ink-2"
        >
          {inline(buf.join(" "), `bq${k}`)}
        </blockquote>
      );
      continue;
    }

    // unordered list
    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*]\s+/, ""));
        i += 1;
      }
      blocks.push(
        <ul key={`ul${k++}`} className="mt-3 flex list-disc flex-col gap-1.5 pl-5 text-[13px] leading-relaxed text-st-ink-2">
          {items.map((it, ii) => (
            <li key={ii}>{inline(it, `ul${k}-${ii}`)}</li>
          ))}
        </ul>
      );
      continue;
    }

    // ordered list
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s+/, ""));
        i += 1;
      }
      blocks.push(
        <ol key={`ol${k++}`} className="mt-3 flex list-decimal flex-col gap-1.5 pl-5 text-[13px] leading-relaxed text-st-ink-2">
          {items.map((it, ii) => (
            <li key={ii}>{inline(it, `ol${k}-${ii}`)}</li>
          ))}
        </ol>
      );
      continue;
    }

    // paragraph (gather consecutive plain lines)
    const buf: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !/^(#{1,4})\s/.test(lines[i]) &&
      !lines[i].trim().startsWith("```") &&
      !lines[i].trim().startsWith(">") &&
      !lines[i].trim().startsWith("|") &&
      !/^\s*[-*]\s+/.test(lines[i]) &&
      !/^\s*\d+\.\s+/.test(lines[i]) &&
      !/^(-{3,}|\*{3,})$/.test(lines[i].trim())
    ) {
      buf.push(lines[i]);
      i += 1;
    }
    blocks.push(
      <p key={`p${k++}`} className="mt-3 text-[13px] leading-relaxed text-st-ink-2">
        {inline(buf.join(" "), `p${k}`)}
      </p>
    );
  }

  return <div className="im-md">{blocks}</div>;
}
