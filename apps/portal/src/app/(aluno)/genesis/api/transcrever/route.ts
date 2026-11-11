// /genesis/api/transcrever — transcrição de áudio (fallback do ditado por voz).
//
// O ditado do Genesis usa a Web Speech API do navegador (ao vivo, sem custo) quando
// disponível. Em navegadores SEM suporte (Firefox, webviews), o client grava o áudio
// (MediaRecorder) e envia para cá — transcrevemos server-side na OpenAI.
//
// A key da OpenAI vem do MESMO lugar que o builder usa para gerar soluções: a edge
// function do Supabase central (bai_builder-stt, irmã do bai_builder-llm) com a
// OPENAI_API_KEY do runtime central — nenhuma configuração extra no app. Uma
// OPENAI_API_KEY no env do app (opcional) tem prioridade e chama a OpenAI direto.
// Sem nenhum dos dois, GET responde enabled:false e o botão de microfone não
// aparece nesses navegadores. Modelo: whisper-1 (override via STT_MODEL).
//
// Segurança: sessão obrigatória + bloqueio de primeiro acesso, como /genesis/api/etapa.

import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";

const OPENAI_KEY = process.env.OPENAI_API_KEY || "";
const CENTRAL_URL = process.env.CENTRAL_SUPABASE_URL || "";
const CENTRAL_SR = process.env.CENTRAL_SUPABASE_SERVICE_ROLE_KEY || "";
const STT_MODEL = process.env.STT_MODEL || "whisper-1";
const MAX_AUDIO_BYTES = 15 * 1024 * 1024; // ~2 min de webm/opus com folga
const usaCentral = !OPENAI_KEY && !!(CENTRAL_URL && CENTRAL_SR);

/** O fallback está operante? Com key local, sim; via central, pergunta à edge
 *  function (só ela sabe se a OPENAI_API_KEY existe no runtime central). */
async function fallbackHabilitado(): Promise<boolean> {
  if (OPENAI_KEY) return true;
  if (!usaCentral) return false;
  try {
    const res = await fetch(`${CENTRAL_URL}/functions/v1/bai_builder-stt`, {
      headers: { apikey: CENTRAL_SR, authorization: `Bearer ${CENTRAL_SR}` },
    });
    if (!res.ok) return false;
    const j = (await res.json()) as { enabled?: boolean };
    return !!j.enabled;
  } catch {
    return false;
  }
}

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ enabled: false }, { status: 401 });
  return NextResponse.json({ enabled: await fallbackHabilitado() });
}

export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ ok: false, error: "Não autenticado." }, { status: 401 });
    if (user.must_change_password === 1) {
      return NextResponse.json({ ok: false, error: "Troque sua senha para continuar." }, { status: 403 });
    }
    if (!OPENAI_KEY && !usaCentral) {
      return NextResponse.json({ ok: false, error: "Transcrição não configurada." }, { status: 503 });
    }

    const form = await req.formData().catch(() => null);
    const audio = form?.get("audio");
    if (!(audio instanceof Blob) || audio.size === 0) {
      return NextResponse.json({ ok: false, error: "Áudio ausente." }, { status: 400 });
    }
    if (audio.size > MAX_AUDIO_BYTES) {
      return NextResponse.json({ ok: false, error: "Áudio muito longo — grave no máximo 2 minutos." }, { status: 413 });
    }

    // extensão coerente com o mimetype do navegador (Chrome/Firefox: webm; Safari: mp4)
    const ext = /mp4|m4a|aac/.test(audio.type) ? "mp4" : /ogg/.test(audio.type) ? "ogg" : "webm";
    const upstream = new FormData();

    let res: Response;
    if (OPENAI_KEY) {
      // key local (override): OpenAI direto
      upstream.append("file", audio, `audio.${ext}`);
      upstream.append("model", STT_MODEL);
      upstream.append("language", "pt");
      res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
        method: "POST",
        headers: { authorization: `Bearer ${OPENAI_KEY}` },
        body: upstream,
      });
    } else {
      // padrão: edge function do central (mesma OPENAI_API_KEY que gera as soluções)
      upstream.append("audio", audio, `audio.${ext}`);
      upstream.append("model", STT_MODEL);
      res = await fetch(`${CENTRAL_URL}/functions/v1/bai_builder-stt`, {
        method: "POST",
        headers: { apikey: CENTRAL_SR, authorization: `Bearer ${CENTRAL_SR}` },
        body: upstream,
      });
    }

    if (!res.ok) {
      const detalhe = (await res.text()).slice(0, 200);
      console.error(`[transcrever] upstream ${res.status}: ${detalhe}`);
      return NextResponse.json({ ok: false, error: "Não foi possível transcrever o áudio. Tente novamente." }, { status: 502 });
    }
    const j = (await res.json()) as { text?: string };
    return NextResponse.json({ ok: true, text: (j.text ?? "").trim() });
  } catch (error) {
    console.error("Error in POST /genesis/api/transcrever:", error);
    return NextResponse.json({ ok: false, error: "Não foi possível transcrever o áudio. Tente novamente." }, { status: 500 });
  }
}
