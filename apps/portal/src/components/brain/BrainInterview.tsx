"use client";

import { ArrowLeft, ArrowRight, Check } from "lucide-react";

import { usePlan } from "@/lib/plan";
import { useT } from "@/lib/i18n";
import { GlassModal } from "@/components/GlassModal";
import { BRAIN_KEY, EMPTY_BRAIN, useLocalStorage, type BrainState } from "@/lib/use-local-storage";

/** Answers shape (all optional — draft-friendly). Stored under BrainState.answers. */
interface Answers {
  do?: string;
  sell?: string;
  price?: string;
  icp?: string;
  voice?: string;
  goals?: string;
  tools?: string[];
  toolsOther?: string;
  channels?: string[];
}

// Integration / tool proper names — intocáveis, stay EN.
const TOOLS = ["HubSpot", "Meta Ads", "Xero", "Instantly", "Slack", "Notion"];

const toggle = (arr: string[], v: string) =>
  arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];

/**
 * 8-step brain interview (Pro). Every field write-throughs to localStorage
 * 'skilltree-brain' (draft per step, resumes where you left off). On finish it
 * flips `completed`, which lights up the /brain pillars and the hub checklist.
 */
export function BrainInterview({ onClose }: { onClose: () => void }) {
  const { showToast } = usePlan();
  const t = useT();
  const [brain, setBrain] = useLocalStorage<BrainState>(BRAIN_KEY, EMPTY_BRAIN);

  const stepTitles = [
    t.brain.stepTitles.whatYouDo,
    t.brain.stepTitles.whatYouSell,
    t.brain.stepTitles.whoYouServe,
    t.brain.stepTitles.voiceTone,
    t.brain.stepTitles.goals,
    t.brain.stepTitles.toolsStack,
    t.brain.stepTitles.channels,
    t.brain.stepTitles.review,
  ];
  const TOTAL = stepTitles.length; // 8
  const CHANNELS = [
    t.brain.channels.outbound,
    t.brain.channels.inbound,
    t.brain.channels.paid,
    t.brain.channels.partners,
    t.brain.channels.community,
  ];
  // Only "Direct & concise" is character-identical to the dict (voiceExamples.direct).
  // "Warm & human" / "Technical & precise" differ from the dict's warm/expert values,
  // so they stay EN per the fidelity rule (recorded as MISMATCH).
  const VOICE_EXAMPLES = [
    t.brain.voiceExamples.direct,
    t.brain.voiceExamples.warm,
    t.brain.voiceExamples.expert,
  ];

  const step = Math.min(Math.max(brain.step ?? 0, 0), TOTAL - 1);
  const ans = brain.answers as Answers;

  const setField = (key: keyof Answers, value: string | string[]) =>
    setBrain((prev) => ({ ...prev, answers: { ...prev.answers, [key]: value } }));

  const go = (n: number) =>
    setBrain((prev) => ({ ...prev, step: Math.max(0, Math.min(TOTAL - 1, n)) }));

  const finish = () => {
    setBrain((prev) => ({ ...prev, completed: true, step: TOTAL }));
    showToast(t.brain.builtToast);
    onClose();
  };

  const pct = ((step + 1) / TOTAL) * 100;

  return (
    <GlassModal
      onClose={onClose}
      eyebrow={t.brain.stepOf(step + 1, TOTAL)}
      maxWidth={640}
      bodyClassName="px-6 py-5"
      headerRight={
        <span className="rounded-full border border-st-line-2 px-2 py-0.5 text-[10px] font-semibold text-st-ink-2">
          {t.brain.estTime}
        </span>
      }
      headerExtra={
        <div className="mx-6 mt-1 h-[3px] overflow-hidden rounded-full bg-white/[0.08]">
          <div
            className="h-full rounded-full bg-[#c58b5f] transition-[width] duration-300"
            style={{ width: `${pct}%` }}
          />
        </div>
      }
      footer={
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => go(step - 1)}
            disabled={step === 0}
            className={`inline-flex items-center gap-1.5 rounded-[10px] px-3 py-2 text-[13px] font-medium transition-colors ${
              step === 0 ? "cursor-not-allowed text-st-ink-3" : "text-st-ink-2 hover:text-st-ivory"
            }`}
          >
            <ArrowLeft size={15} />
            {t.common.back}
          </button>
          {step < TOTAL - 1 ? (
            <button
              type="button"
              onClick={() => go(step + 1)}
              className="inline-flex items-center gap-2 rounded-[10px] bg-[#ECECEE] px-5 py-2.5 text-[13px] font-bold text-[#0A0A0C] transition-opacity hover:opacity-90"
            >
              {t.common.next}
              <ArrowRight size={15} />
            </button>
          ) : (
            <button
              type="button"
              onClick={finish}
              className="inline-flex items-center gap-2 rounded-[10px] bg-[#ECECEE] px-5 py-2.5 text-[13px] font-bold text-[#0A0A0C] transition-opacity hover:opacity-90"
            >
              <Check size={15} />
              {t.brain.buildMyBrain}
            </button>
          )}
        </div>
      }
    >
      <h2 className="text-[20px] font-bold leading-tight tracking-[-0.01em] text-st-ivory">
        {stepTitles[step]}
      </h2>

          <div className="mt-4 flex flex-col gap-4">
            {step === 0 && (
              <Field label={t.brain.fields.doLabel}>
                <TextArea value={ans.do ?? ""} onChange={(v) => setField("do", v)} placeholder={t.brain.fields.doPlaceholder} />
              </Field>
            )}

            {step === 1 && (
              <>
                <Field label={t.brain.fields.sellLabel}>
                  <TextArea value={ans.sell ?? ""} onChange={(v) => setField("sell", v)} placeholder={t.brain.fields.sellPlaceholder} />
                </Field>
                <Field label={t.brain.fields.priceLabel}>
                  <input
                    value={ans.price ?? ""}
                    onChange={(e) => setField("price", e.target.value)}
                    placeholder={t.brain.fields.pricePlaceholder}
                    className="w-full rounded-[10px] border border-st-line-2 bg-white/[0.03] px-3.5 py-2.5 text-[14px] text-st-ivory outline-none placeholder:text-st-ink-3 focus:border-white/25"
                  />
                </Field>
              </>
            )}

            {step === 2 && (
              <Field label={t.brain.fields.icpLabel}>
                <TextArea value={ans.icp ?? ""} onChange={(v) => setField("icp", v)} placeholder={t.brain.fields.icpPlaceholder} />
              </Field>
            )}

            {step === 3 && (
              <Field label={t.brain.fields.voiceLabel}>
                <div className="mb-2 flex flex-wrap gap-2">
                  {VOICE_EXAMPLES.map((ex) => (
                    <button
                      key={ex}
                      type="button"
                      onClick={() =>
                        setField("voice", ans.voice ? `${ans.voice.trim()} ${ex}.` : `${ex}.`)
                      }
                      className="rounded-full border border-st-line-2 bg-white/[0.03] px-3 py-1.5 text-[12px] text-st-ivory transition-colors hover:bg-st-card-2"
                    >
                      {ex}
                    </button>
                  ))}
                </div>
                <TextArea value={ans.voice ?? ""} onChange={(v) => setField("voice", v)} placeholder={t.brain.fields.voicePlaceholder} />
              </Field>
            )}

            {step === 4 && (
              <Field label={t.brain.fields.goalsLabel}>
                <TextArea value={ans.goals ?? ""} onChange={(v) => setField("goals", v)} placeholder={t.brain.fields.goalsPlaceholder} />
              </Field>
            )}

            {step === 5 && (
              <Field label={t.brain.fields.toolsLabel}>
                <ChipGroup options={TOOLS} selected={ans.tools ?? []} onToggle={(v) => setField("tools", toggle(ans.tools ?? [], v))} />
                <input
                  value={ans.toolsOther ?? ""}
                  onChange={(e) => setField("toolsOther", e.target.value)}
                  placeholder={t.brain.fields.toolsOtherPlaceholder}
                  className="mt-3 w-full rounded-[10px] border border-st-line-2 bg-white/[0.03] px-3.5 py-2.5 text-[14px] text-st-ivory outline-none placeholder:text-st-ink-3 focus:border-white/25"
                />
              </Field>
            )}

            {step === 6 && (
              <Field label={t.brain.fields.channelsLabel}>
                <ChipGroup options={CHANNELS} selected={ans.channels ?? []} onToggle={(v) => setField("channels", toggle(ans.channels ?? [], v))} />
              </Field>
            )}

            {step === 7 && (
              <div className="flex flex-col gap-3">
                <p className="text-[13px] text-st-ink-2">{t.brain.fields.reviewIntro}</p>
                <ReviewRow label={t.brain.stepTitles.whatYouDo} value={ans.do} />
                <ReviewRow label={t.brain.stepTitles.whatYouSell} value={[ans.sell, ans.price].filter(Boolean).join(" · ")} />
                <ReviewRow label={t.brain.stepTitles.whoYouServe} value={ans.icp} />
                <ReviewRow label={t.brain.stepTitles.voiceTone} value={ans.voice} />
                <ReviewRow label={t.brain.fields.goalsReview} value={ans.goals} />
                <ReviewRow label={t.brain.stepTitles.toolsStack} value={[...(ans.tools ?? []), ans.toolsOther].filter(Boolean).join(", ")} />
                <ReviewRow label={t.brain.stepTitles.channels} value={(ans.channels ?? []).join(", ")} />
              </div>
            )}
          </div>
    </GlassModal>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-[13px] text-st-ink-2">{label}</span>
      {children}
    </div>
  );
}

function TextArea({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={4}
      className="w-full resize-none rounded-[10px] border border-st-line-2 bg-white/[0.03] px-3.5 py-3 text-[14px] leading-relaxed text-st-ivory outline-none placeholder:text-st-ink-3 focus:border-white/25"
    />
  );
}

function ChipGroup({
  options,
  selected,
  onToggle,
}: {
  options: string[];
  selected: string[];
  onToggle: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => {
        const on = selected.includes(opt);
        return (
          <button
            key={opt}
            type="button"
            onClick={() => onToggle(opt)}
            aria-pressed={on}
            className={`rounded-full border px-3.5 py-1.5 text-[12.5px] transition-colors ${
              on
                ? "border-[#c58b5f]/60 bg-[#c58b5f]/15 text-st-ivory"
                : "border-st-line-2 bg-white/[0.03] text-st-ink-2 hover:text-st-ivory"
            }`}
          >
            {opt}
          </button>
        );
      })}
    </div>
  );
}

function ReviewRow({ label, value }: { label: string; value?: string }) {
  const t = useT();
  return (
    <div className="rounded-[10px] border border-st-line-2 bg-white/[0.02] px-4 py-3">
      <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-st-ink-3">
        {label}
      </div>
      <div className="mt-1 text-[13.5px] leading-relaxed text-st-ivory">
        {value ? value : <span className="text-st-ink-3">{t.brain.fields.notAnswered}</span>}
      </div>
    </div>
  );
}
