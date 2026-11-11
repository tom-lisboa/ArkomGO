"use client";

import { useEffect, useRef, useState } from "react";
import { Mic } from "lucide-react";

import { useLocale, useT } from "@/lib/i18n";
import {
  DRAFT_MIN_NOTES,
  FAST,
  type BrainSections,
} from "./content";

/* ---- minimal Web Speech API typing (not in the DOM lib) ---- */
interface SpeechResultLike {
  0: { transcript: string };
  isFinal: boolean;
}
interface SpeechEventLike {
  resultIndex: number;
  results: { length: number; [i: number]: SpeechResultLike };
}
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: SpeechEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getSpeechCtor(): SpeechRecognitionCtor | undefined {
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

const EMPTY_SECTIONS: BrainSections = {
  company: "",
  one_liner: "",
  offers: "",
  icp: "",
  clients: "",
  voice: "",
  tools: "",
  notes: "",
};

interface BrainFastProps {
  onDrafted: (sections: BrainSections) => void;
  onTypeMyself: () => void;
}

/**
 * Fast view (findings A2): the draft-entry screen shown when the brain is empty.
 * Website + a freeform ramble feed the mock draft API; the inline Talk button is
 * the Web Speech API (Talk → Listening…), rendered only when the browser
 * supports it. The primary button unlocks once there's a website OR ≥80 chars.
 */
export function BrainFast({ onDrafted, onTypeMyself }: BrainFastProps) {
  const t = useT();
  const { locale } = useLocale();

  const [website, setWebsite] = useState("");
  const [notes, setNotes] = useState("");
  const [drafting, setDrafting] = useState(false);

  const [speechSupported, setSpeechSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const recRef = useRef<SpeechRecognitionLike | null>(null);

  useEffect(() => {
    setSpeechSupported(Boolean(getSpeechCtor()));
    return () => recRef.current?.stop();
  }, []);

  const draftDisabled =
    drafting || (!website.trim() && notes.trim().length < DRAFT_MIN_NOTES);

  async function draft() {
    setDrafting(true);
    try {
      const res = await fetch("/api/brain-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: website, text: notes }),
      });
      const data = (await res.json()) as { sections: BrainSections };
      onDrafted(data.sections);
    } catch {
      // graceful degrade: still enter the edit pass with what we have
      onDrafted({ ...EMPTY_SECTIONS, notes: notes.trim() });
    } finally {
      setDrafting(false);
    }
  }

  function toggleTalk() {
    if (listening) {
      recRef.current?.stop();
      return;
    }
    const Ctor = getSpeechCtor();
    if (!Ctor) return;
    const rec = new Ctor();
    rec.lang = "en-US";
    rec.continuous = true;
    rec.interimResults = false;
    rec.onresult = (e) => {
      let finalText = "";
      for (let i = e.resultIndex; i < e.results.length; i += 1) {
        const r = e.results[i];
        if (r.isFinal) finalText += r[0].transcript;
      }
      const clean = finalText.trim();
      if (clean) setNotes((prev) => (prev ? `${prev} ${clean}` : clean));
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recRef.current = rec;
    rec.start();
    setListening(true);
  }

  return (
    <section className="mt-8">
      <h2 className="text-[21px] font-bold leading-tight tracking-[-0.01em] text-st-ivory">
        {FAST.heading[locale]}
      </h2>
      <p className="mt-2 max-w-[560px] text-[13.5px] leading-relaxed text-st-ink-2">
        {FAST.sub[locale]}
      </p>

      {/* Website */}
      <label className="mt-6 block">
        <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-st-ink-2">
          {FAST.websiteLabel[locale]}
        </span>
        <input
          type="text"
          inputMode="url"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
          placeholder={FAST.websitePlaceholder[locale]}
          className="mt-2 w-full rounded-[12px] border border-st-line-2 bg-st-card-2 px-4 py-3.5 text-[15px] text-st-ivory outline-none placeholder:text-st-ink-3 focus:border-st-ivory/30"
        />
      </label>

      {/* Notes + inline Talk */}
      <label className="mt-5 block">
        <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-st-ink-2">
          {FAST.notesLabel[locale]}
          {speechSupported ? FAST.notesLabelTalkSuffix[locale] : ""}
        </span>
        <div className="relative mt-2">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={FAST.notesPlaceholder[locale]}
            rows={4}
            className="w-full resize-none rounded-[12px] border border-st-line-2 bg-st-card-2 px-4 py-3.5 pb-12 text-[15px] leading-relaxed text-st-ivory outline-none placeholder:text-st-ink-3 focus:border-st-ivory/30"
          />
          {speechSupported ? (
            <button
              type="button"
              onClick={toggleTalk}
              aria-pressed={listening}
              className={`absolute bottom-3 right-3 inline-flex items-center gap-1.5 rounded-[16px] border px-[11px] py-1.5 text-[11.5px] font-semibold transition-colors ${
                listening
                  ? "border-[#c58b5f]/50 bg-[#c58b5f]/15 text-st-ivory"
                  : "border-st-line-2 bg-st-card-2 text-st-ink-2 hover:text-st-ivory"
              }`}
            >
              <Mic className="size-[13px]" />
              {listening ? t.brain.listening : t.brain.card.talk}
            </button>
          ) : null}
        </div>
      </label>

      {/* Actions */}
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onTypeMyself}
          className="rounded-[8px] border border-st-line-2 bg-st-card-2 px-3.5 py-2.5 text-[13.5px] font-semibold text-st-ivory transition-colors hover:bg-white/[0.06]"
        >
          {t.brain.card.typeMyself}
        </button>
        <button
          type="button"
          onClick={draft}
          disabled={draftDisabled}
          className={`rounded-[8px] bg-st-ivory px-4 py-2.5 text-[13.5px] font-semibold text-st-bg transition-opacity ${
            draftDisabled ? "cursor-not-allowed opacity-50" : "hover:opacity-90"
          }`}
        >
          {drafting ? t.brain.drafting : t.brain.card.draftAi}
        </button>
      </div>

      <p className="mt-5 max-w-[520px] text-[12px] leading-relaxed text-st-ink-3">
        {FAST.hint[locale]}
      </p>
    </section>
  );
}
