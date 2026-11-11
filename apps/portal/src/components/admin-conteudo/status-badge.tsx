// StatusBadge — badge padrão de status draft/published da área Admin > Conteúdo.
// Uso: <StatusBadge status={curso.status} />

import { Badge } from "@/components/ui";

export function StatusBadge({ status }: { status: "draft" | "published" }) {
  return status === "published" ? (
    <Badge status="success" dot>Publicado</Badge>
  ) : (
    <Badge status="navy" dot>Rascunho</Badge>
  );
}
