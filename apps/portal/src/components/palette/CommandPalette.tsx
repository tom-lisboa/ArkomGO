"use client";

import "./palette.css";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  GitBranch,
  GraduationCap,
  LayoutGrid,
  Map as MapIcon,
  Search,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { useLocale, useT } from "@/lib/i18n";
import {
  buildNavRows,
  buildSearchCorpus,
  searchCorpus,
  type PaletteItem,
  type PaletteKind,
} from "./palette-data";

/* ---------------------------------------------------------------------------
   Provider + hook — mounted once at the app root (app/providers.tsx) so ⌘K works
   on EVERY route and any surface can open it via usePalette().open().
   --------------------------------------------------------------------------- */
interface PaletteCtx {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
}
const Ctx = createContext<PaletteCtx | null>(null);

export function usePalette(): PaletteCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("usePalette must be used within <PaletteProvider>");
  return c;
}

export function PaletteProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const toggle = useCallback(() => setIsOpen((v) => !v), []);

  // Global ⌘K / Ctrl+K on any route.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        setIsOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <Ctx.Provider value={{ isOpen, open, close, toggle }}>
      {children}
      {isOpen ? <CommandPalette onClose={close} /> : null}
    </Ctx.Provider>
  );
}

/* ---------------------------------------------------------------------------
   The modal itself. Fresh mount per open → query + selection reset for free.
   --------------------------------------------------------------------------- */
function iconFor(kind: PaletteKind): React.ReactNode {
  switch (kind) {
    case "nav":
      return <ArrowRight />;
    case "skill":
      return <GitBranch />;
    case "department":
      return <MapIcon />;
    case "dashboard":
      return <LayoutGrid />;
    case "lesson":
      return <GraduationCap />;
  }
}

function CommandPalette({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const t = useT();
  const { locale } = useLocale();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const navRows = useMemo(() => buildNavRows(t), [t]);
  const corpus = useMemo(() => buildSearchCorpus(locale, t), [locale, t]);
  const results = useMemo(
    () => (query.trim() ? searchCorpus(corpus, query) : navRows),
    [query, corpus, navRows]
  );

  // Focus the input + lock body scroll on mount.
  useEffect(() => {
    inputRef.current?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // Reset the highlight whenever the result set changes.
  useEffect(() => {
    setActive(0);
  }, [query]);

  // Keep the highlighted row in view.
  useEffect(() => {
    listRef.current?.querySelector(".cp-row.on")?.scrollIntoView({ block: "nearest" });
  }, [active, results]);

  const go = useCallback(
    (item: PaletteItem) => {
      onClose();
      router.push(item.href);
    },
    [onClose, router]
  );

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = results[active];
      if (item) go(item);
    }
  };

  return (
    <div
      className="cp-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="cp" role="dialog" aria-modal="true" onKeyDown={onKeyDown}>
        <div className="cp-in">
          <Search className="cp-si" strokeWidth={2} aria-hidden />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t.palette.placeholder}
            autoComplete="off"
            spellCheck={false}
            aria-label={t.palette.placeholder}
          />
          <span className="cp-esc">{t.palette.esc}</span>
        </div>

        {results.length > 0 ? (
          <div className="cp-list" ref={listRef}>
            {results.map((item, i) => (
              <button
                key={item.id}
                type="button"
                className={cn("cp-row", i === active && "on")}
                onMouseEnter={() => setActive(i)}
                onClick={() => go(item)}
              >
                <span className="cp-ic" aria-hidden>
                  {iconFor(item.kind)}
                </span>
                <span className="cp-txt">
                  <b>{item.title}</b>
                  <span>{item.sub}</span>
                </span>
                <span className="cp-tag">{item.tag}</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="cp-empty">{t.palette.empty(query.trim())}</div>
        )}
      </div>
    </div>
  );
}
