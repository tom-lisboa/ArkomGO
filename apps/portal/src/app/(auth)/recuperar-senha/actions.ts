"use server";

import { sendCentralPasswordSetupEmail } from "@/lib/central-auth";
import { ensureDatabaseReady, getSql } from "@/lib/db";
import { getPublicUrl } from "@/lib/public-url";

export type RecoverState = { sent?: boolean };

export async function recoverAction(
  _previous: RecoverState,
  formData: FormData,
): Promise<RecoverState> {
  const email = String(formData.get("email") ?? "").trim();
  if (email) {
    try {
      await ensureDatabaseReady();
      const sql = getSql();
      const profile = (
        await sql<{ id: number }[]>`
          SELECT id
          FROM profiles
          WHERE lower(email) = lower(${email}) AND status = 'active'
          LIMIT 1
        `
      )[0];
      if (profile) {
        const redirectTo = await getPublicUrl("/definir-senha");
        const result = await sendCentralPasswordSetupEmail({ email, redirectTo });
        if (!result.ok) {
          // Never reveal whether the address exists or why delivery failed.
          console.error("[arkom] Falha ao enviar recuperação de senha:", result.error);
        }
      }
    } catch (error) {
      // The response remains generic; operators get the actionable readiness error.
      console.error("[arkom] Recuperacao indisponivel:", error);
    }
  }
  return { sent: true };
}
