import { clsx, type ClassValue } from "clsx"
import { addDays, differenceInCalendarDays, format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/* ── Liberação de curso (PRD §10) — port do bilhon-ai/lib/utils.ts ──────────
 * O aluno só vê/abre um curso liberado: `release_type='immediate'` OU
 * `registered_at + release_after_days <= agora`. Usado pelo loader das
 * Capacitações (gating de exibição), pelas server actions (gating de escrita)
 * e pelas páginas de curso/aula (guard de acesso). */
type CourseRelease = {
  release_type: string // 'immediate' | 'after_days'
  release_after_days: number
}

/** Data em que o curso libera para o usuário (null = liberação imediata). */
export function courseReleaseDate(
  course: CourseRelease,
  registeredAt: Date | string
): Date | null {
  if (course.release_type !== "after_days" || course.release_after_days <= 0) return null
  const reg = typeof registeredAt === "string" ? new Date(registeredAt) : registeredAt
  return addDays(reg, course.release_after_days)
}

/** O curso já está liberado para este usuário? */
export function isCourseReleased(
  course: CourseRelease,
  registeredAt: Date | string
): boolean {
  const releaseAt = courseReleaseDate(course, registeredAt)
  return releaseAt === null || releaseAt.getTime() <= Date.now()
}

/** Dias (inteiros, >= 0) até o curso liberar. 0 = já liberado. */
export function daysUntilCourseRelease(
  course: CourseRelease,
  registeredAt: Date | string
): number {
  const releaseAt = courseReleaseDate(course, registeredAt)
  if (!releaseAt) return 0
  return Math.max(0, differenceInCalendarDays(releaseAt, new Date()))
}

export function formatDate(
  date: Date | string,
  pattern = "dd 'de' MMMM 'de' yyyy"
): string {
  const parsed = typeof date === "string" ? new Date(date) : date
  const hasExplicitZone =
    typeof date !== "string" || /(?:Z|[+-]\d{2}:?\d{2})$/i.test(date)
  const value = hasExplicitZone
    ? new Date(
        parsed.getUTCFullYear(),
        parsed.getUTCMonth(),
        parsed.getUTCDate(),
        parsed.getUTCHours(),
        parsed.getUTCMinutes(),
        parsed.getUTCSeconds(),
      )
    : parsed
  return format(value, pattern, { locale: ptBR })
}

export function formatTime(
  value: Date | string,
  pattern = "HH'h'mm"
): string {
  if (typeof value === "string" && /^\d{2}:\d{2}/.test(value)) {
    const [hours, minutes] = value.split(":")
    return pattern === "HH'h'mm" ? `${hours}h${minutes}` : `${hours}:${minutes}`
  }
  const date = typeof value === "string" ? new Date(value) : value
  return format(date, pattern, { locale: ptBR })
}

export function getInitials(name: string): string {
  const words = name
    .replace(/[^\p{L}\p{N} ]/gu, "")
    .split(" ")
    .filter(Boolean)
  if (words.length === 0) return "?"
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return (words[0][0] + words[1][0]).toUpperCase()
}
