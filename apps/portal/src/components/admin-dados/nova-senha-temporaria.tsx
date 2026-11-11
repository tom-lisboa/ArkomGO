"use client";

// Botão "Gerar nova senha temporária" (ClickUp 86ajradyp) — usado na lista de
// membros (ícone) e na ficha do aluno (botão com rótulo). A senha temporária só
// existia no modal da criação; sem a caixa de e-mail do aluno, a única saída
// era excluir e recriar a conta (perdendo plano e extrato). Aqui a credencial é
// trocada e mostrada na hora, com confirmação antes — a senha atual morre no
// mesmo instante.

import { useState } from "react";
import { Check, Copy, KeyRound } from "lucide-react";
import { Button, ConfirmDialog, Label, Modal, useToast } from "@/components/ui";
import { gerarNovaSenhaTemporariaAction } from "@/app/admin/students/actions";

type Credencial = { senha: string; warning?: string };

export function NovaSenhaTemporariaButton({
  profileId,
  profileName,
  profileEmail,
  blocked = false,
  isSelf = false,
  variant = "icon",
}: {
  profileId: number;
  profileName: string;
  profileEmail: string;
  /** Conta bloqueada não loga: o servidor recusa e o botão explica por quê. */
  blocked?: boolean;
  /** A própria conta do admin logado — o servidor também recusa. */
  isSelf?: boolean;
  /** `icon` para a linha de ações da lista; `button` para a ficha. */
  variant?: "icon" | "button";
}) {
  const { toast } = useToast();
  const [confirmando, setConfirmando] = useState(false);
  const [credencial, setCredencial] = useState<Credencial | null>(null);
  const [copiada, setCopiada] = useState(false);

  const impedimento = isSelf
    ? "Você não pode gerar uma senha temporária para a sua própria conta."
    : blocked
      ? "Desbloqueie o usuário antes de gerar uma nova senha temporária."
      : null;
  const rotulo = "Gerar nova senha temporária";

  async function gerar() {
    const result = await gerarNovaSenhaTemporariaAction(profileId);
    if (!result.ok) {
      toast({ title: result.error, variant: "error" });
      return;
    }
    if (!result.temporaryPassword) {
      toast({
        title: "A senha não foi gerada. Tente novamente.",
        variant: "error",
      });
      return;
    }
    setCopiada(false);
    setCredencial({ senha: result.temporaryPassword, warning: result.warning });
  }

  async function copiar() {
    if (!credencial) return;
    try {
      await navigator.clipboard.writeText(credencial.senha);
      setCopiada(true);
      setTimeout(() => setCopiada(false), 2500);
    } catch {
      /* clipboard indisponível (contexto inseguro) — a senha segue visível */
    }
  }

  return (
    <>
      {variant === "icon" ? (
        <button
          type="button"
          title={impedimento ?? rotulo}
          aria-label={rotulo}
          onClick={() => setConfirmando(true)}
          disabled={impedimento !== null}
          className="rounded-lg p-2 text-secondary transition-colors hover:bg-surface-hover hover:text-primary disabled:pointer-events-none disabled:opacity-40"
        >
          <KeyRound className="h-4 w-4" />
        </button>
      ) : (
        // Botão travado que DIZ o motivo — na ficha há espaço para a frase
        // inteira, e um botão morto sem explicação vira chamado de suporte.
        <div className="flex flex-col items-end gap-1.5">
          <Button
            type="button"
            variant="secondary"
            onClick={() => setConfirmando(true)}
            disabled={impedimento !== null}
          >
            <KeyRound className="h-4 w-4" />
            {rotulo}
          </Button>
          {impedimento && (
            <p className="max-w-[300px] text-right text-xs text-tertiary">{impedimento}</p>
          )}
        </div>
      )}

      <ConfirmDialog
        open={confirmando}
        onClose={() => setConfirmando(false)}
        onConfirm={gerar}
        danger={false}
        title={`Gerar nova senha temporária para ${profileName}?`}
        description="A senha atual deixa de funcionar imediatamente e as sessões abertas deste usuário são encerradas. A senha nova aparece na tela para você copiar e o usuário terá que trocá-la no próximo acesso."
        confirmLabel="Gerar senha"
        loadingLabel="Gerando…"
      />

      {/* Persistente (não fecha por Esc/clique fora): a senha não pode ser
          consultada depois — o banco guarda só o hash. */}
      <Modal
        open={credencial !== null}
        onClose={() => setCredencial(null)}
        title="Nova senha temporária"
        dismissable={false}
      >
        {credencial && (
          <div className="flex flex-col gap-4">
            <div className="rounded-md border border-amber-400 bg-warning-subtle px-4 py-3 text-sm font-medium text-amber-700">
              Copie a senha agora: por segurança ela não fica gravada e não
              poderá ser consultada depois.
            </div>
            <div>
              <Label>Usuário</Label>
              <p className="text-base text-primary">
                {profileName}{" "}
                <span className="font-mono text-sm text-secondary">({profileEmail})</span>
              </p>
            </div>
            <div>
              <Label>Senha temporária</Label>
              <div className="flex items-center gap-2">
                <code
                  data-testid="senha-temporaria"
                  className="flex-1 select-all rounded-lg border border-border bg-surface-sunken px-3 py-2 font-mono text-base text-primary"
                >
                  {credencial.senha}
                </code>
                <Button type="button" variant="secondary" onClick={copiar}>
                  {copiada ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  {copiada ? "Copiada!" : "Copiar"}
                </Button>
              </div>
              <p className="mt-1.5 text-xs text-tertiary">
                A senha anterior já não vale. O usuário troca esta no próximo acesso.
              </p>
            </div>
            {credencial.warning && (
              <div className="rounded-md border border-amber-400 bg-warning-subtle px-4 py-3 text-sm text-amber-700">
                {credencial.warning}
              </div>
            )}
            <div className="flex justify-end">
              <Button type="button" onClick={() => setCredencial(null)}>
                Concluir
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
