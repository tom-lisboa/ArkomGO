"use server";

// Server actions do Builder (análise + esqueleto). A geração das etapas fica no route
// handler /genesis/api/etapa (permite paralelismo). Tudo valida o dono — sem IDOR.

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import {
  analyzeIdea,
  moreQuestions,
  generateSkeleton,
  type AnalyzeResult,
  type Answer,
} from "@/lib/builder";

export async function analisarIdeia(
  idea: string
): Promise<{ ok: true; result: AnalyzeResult } | { ok: false; error: string }> {
  try {
    await requireUser();
    const clean = (idea ?? "").trim();
    if (clean.length < 30) return { ok: false, error: "Descreva a ideia com pelo menos 30 caracteres." };
    if (clean.length > 2000) return { ok: false, error: "A ideia deve ter no máximo 2000 caracteres." };
    const result = await analyzeIdea(clean);
    return { ok: true, result };
  } catch (error) {
    console.error("Error in analisarIdeia:", error);
    return { ok: false, error: "Não foi possível analisar sua ideia. Tente novamente." };
  }
}

export async function maisPerguntas(
  idea: string,
  answers: Answer[]
): Promise<{ ok: true; questions: AnalyzeResult["questions"] } | { ok: false; error: string }> {
  try {
    await requireUser();
    const clean = (idea ?? "").trim();
    if (clean.length < 30) return { ok: false, error: "Ideia muito curta." };
    const safe = Array.isArray(answers)
      ? answers.filter((a) => a && typeof a.question === "string" && typeof a.answer === "string").slice(0, 10)
      : [];
    const questions = await moreQuestions(clean, safe);
    return { ok: true, questions };
  } catch (error) {
    console.error("Error in maisPerguntas:", error);
    return { ok: false, error: "Não foi possível gerar mais perguntas. Tente novamente." };
  }
}

export async function criarSolucao(
  idea: string,
  answers: Answer[]
): Promise<{ ok: true; solutionId: number } | { ok: false; error: string }> {
  try {
    const user = await requireUser();
    const clean = (idea ?? "").trim();
    if (clean.length < 30) return { ok: false, error: "Ideia muito curta." };
    const safeAnswers = Array.isArray(answers)
      ? answers.filter((a) => a && typeof a.question === "string" && typeof a.answer === "string").slice(0, 15)
      : [];
    const sol = await generateSkeleton(user.id, clean, safeAnswers);
    revalidatePath("/genesis");
    return { ok: true, solutionId: sol.id };
  } catch (error) {
    console.error("Error in criarSolucao:", error);
    return { ok: false, error: "Não foi possível gerar a solução. Tente novamente." };
  }
}
