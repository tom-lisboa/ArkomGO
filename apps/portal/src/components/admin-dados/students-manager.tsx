"use client";

// AlunosManager — tabela de alunos com busca, CRUD, bloqueio e importação CSV
// (Story 1.7, RF004/RF005). Mutações via server actions de app/admin/students/actions.ts.

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Ban,
  Check,
  Copy,
  Eye,
  LockOpen,
  Mail,
  Pencil,
  Plus,
  Search,
  Trash2,
  Upload,
  Users,
} from "lucide-react";
import {
  Badge,
  Button,
  ConfirmDialog,
  EmptyState,
  Input,
  Label,
  Modal,
  Select,
  useToast,
} from "@/components/ui";
import { cn, formatDate } from "@/lib/utils";
import {
  createUserAction,
  deleteUserAction,
  sendAccessEmailAction,
  toggleBlockAction,
  updateUserAction,
} from "@/app/admin/students/actions";
import { ImportCsvModal } from "@/components/admin-dados/import-csv-modal";
import { NovaSenhaTemporariaButton } from "@/components/admin-dados/nova-senha-temporaria";

export type AlunoRow = {
  id: number;
  full_name: string;
  email: string;
  role: "admin" | "student";
  status: "active" | "blocked";
  registered_at: string;
  /** Plano ativo (0011) — `null` sem plano ou sem a migration no ambiente. */
  plan_id: number | null;
  progress_pct: number;
};

/** Resultado da criação exibido no modal persistente de credenciais — a senha
 *  temporária só existe aqui, uma única vez; toast que some não serve. */
type CredenciaisCriadas = {
  fullName: string;
  email: string;
  temporaryPassword?: string;
  emailSent: boolean;
  emailError?: string;
  provisioningInfo?: string;
  planError?: string;
  blocked: boolean;
};

export function AlunosManager({
  alunos,
  currentUserId,
  planos = [],
}: {
  alunos: AlunoRow[];
  currentUserId: number;
  /** Planos publicados para o select do formulário (vazio ⇒ campo oculto). */
  planos?: { id: number; name: string }[];
}) {
  const { toast } = useToast();
  const [busca, setBusca] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editando, setEditando] = useState<AlunoRow | null>(null);
  const [excluindo, setExcluindo] = useState<AlunoRow | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erroForm, setErroForm] = useState<string | null>(null);
  const [enviandoEmailId, setEnviandoEmailId] = useState<number | null>(null);
  const [credenciais, setCredenciais] = useState<CredenciaisCriadas | null>(null);
  const [senhaCopiada, setSenhaCopiada] = useState(false);

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return alunos;
    return alunos.filter(
      (a) =>
        a.full_name.toLowerCase().includes(q) || a.email.toLowerCase().includes(q)
    );
  }, [alunos, busca]);

  function abrirCriacao() {
    setEditando(null);
    setErroForm(null);
    setFormOpen(true);
  }

  function abrirEdicao(aluno: AlunoRow) {
    setEditando(aluno);
    setErroForm(null);
    setFormOpen(true);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const planoCru = String(fd.get("plan_id") ?? "").trim();
    const payload = {
      full_name: String(fd.get("full_name") ?? ""),
      email: String(fd.get("email") ?? ""),
      role: (fd.get("role") === "admin" ? "admin" : "student") as "admin" | "student",
      status: (fd.get("status") === "blocked" ? "blocked" : "active") as
        | "active"
        | "blocked",
      plan_id: planoCru !== "" ? Number(planoCru) : null,
    };
    setSalvando(true);
    setErroForm(null);
    try {
    const result = editando
      ? await updateUserAction(editando.id, {
          ...payload,
        })
      : await createUserAction(payload);

      if (!result.ok) {
        setErroForm(result.error);
        return;
      }
      setFormOpen(false);
      if (editando) {
        if (result.planError) {
          toast({
            title: "Conta salva, mas o plano não foi atribuído",
            description: result.planError,
            variant: "error",
          });
        }
        toast({
          title: "Usuário atualizado com sucesso!",
          description: result.emailSent
            ? "E-mail de definição de senha enviado."
            : result.emailError
              ? `O e-mail de definição de senha NÃO foi enviado: ${result.emailError}`
              : undefined,
          ...(result.emailError ? { variant: "error" as const } : {}),
        });
      } else {
        const provisioning = result.provisioning;
        const provisioningInfo = provisioning
          ? provisioning.failed > 0
            ? `${provisioning.provisioned} de ${provisioning.provisioned + provisioning.failed} soluções provisionadas; ${provisioning.failed} falharam.${
                provisioning.failures?.length
                  ? ` ${provisioning.failures
                      .map((failure) => failure.solutionName ?? failure.solution)
                      .join(", ")}.`
                  : ""
              }`
            : `${provisioning.provisioned} soluções provisionadas com sucesso.`
          : undefined;
        // Nada de toast aqui: a senha temporária só existe neste retorno, e o
        // modal persistente garante que o admin consiga copiá-la com calma.
        setSenhaCopiada(false);
        setCredenciais({
          fullName: payload.full_name.trim(),
          email: payload.email.trim().toLowerCase(),
          temporaryPassword: result.temporaryPassword,
          emailSent: result.emailSent === true,
          emailError: result.emailError,
          provisioningInfo,
          planError: result.planError,
          blocked: payload.status === "blocked",
        });
      }
    } finally {
      setSalvando(false);
    }
  }

  async function handleToggleBlock(aluno: AlunoRow) {
    const result = await toggleBlockAction(aluno.id);
    if (!result.ok) {
      toast({ title: result.error, variant: "error" });
      return;
    }
    toast({
      title:
        aluno.status === "blocked"
          ? `${aluno.full_name} foi desbloqueado(a).`
          : `${aluno.full_name} foi bloqueado(a).`,
      description:
        aluno.status === "blocked"
          ? "O acesso à plataforma foi restabelecido."
          : "Este usuário não consegue mais entrar na plataforma.",
      variant: "info",
    });
  }

  async function handleDelete() {
    if (!excluindo) return;
    const result = await deleteUserAction(excluindo.id);
    if (!result.ok) {
      toast({ title: result.error, variant: "error" });
      return;
    }
    toast({ title: `${excluindo.full_name} foi excluído(a).`, variant: "success" });
  }

  async function copiarSenhaTemporaria() {
    if (!credenciais?.temporaryPassword) return;
    try {
      await navigator.clipboard.writeText(credenciais.temporaryPassword);
      setSenhaCopiada(true);
      setTimeout(() => setSenhaCopiada(false), 2500);
    } catch {
      /* clipboard unavailable (insecure context) — a senha segue visível */
    }
  }

  async function handleWelcomeEmail(aluno: AlunoRow) {
    setEnviandoEmailId(aluno.id);
    try {
      const result = await sendAccessEmailAction(aluno.id);
      if (!result.ok) {
        toast({ title: result.error, variant: "error" });
        return;
      }
      toast({
        title: "E-mail enviado pelo Supabase",
        description: `Acesso enviado para ${aluno.email}.`,
        variant: "success",
      });
    } finally {
      setEnviandoEmailId(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-full max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-tertiary" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome ou e-mail…"
            className="pl-[36px]"
            aria-label="Buscar membros"
          />
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setImportOpen(true)}>
            <Upload className="h-4 w-4" />
            Importar CSV
          </Button>
          <Button onClick={abrirCriacao}>
            <Plus className="h-4 w-4" />
            Novo usuário
          </Button>
        </div>
      </div>

      {filtrados.length === 0 ? (
        <EmptyState
          icon={<Users className="h-6 w-6" />}
          title={busca ? "Nenhum resultado para a busca" : "Nenhum aluno cadastrado"}
          description={
            busca
              ? "Tente outro nome ou e-mail."
              : "Crie o primeiro usuário ou importe uma lista via CSV."
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-surface shadow-card-sm">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead>
              <tr className="border-b border-border-subtle bg-navy-50 font-mono text-3xs uppercase tracking-widest text-tertiary">
                <th className="px-4 py-3 font-medium">Nome</th>
                <th className="px-4 py-3 font-medium">E-mail</th>
                <th className="px-4 py-3 font-medium">Perfil</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Cadastro</th>
                <th className="px-4 py-3 text-right font-medium">Progresso</th>
                <th className="px-4 py-3 text-right font-medium">Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map((aluno) => (
                <tr
                  key={aluno.id}
                  className="border-b border-border-subtle last:border-b-0 even:bg-navy-50 hover:bg-surface-hover"
                >
                  <td className="px-4 py-3 font-medium text-primary">
                    {aluno.full_name}
                    {aluno.id === currentUserId && (
                      <span className="ml-2 text-xs font-normal text-tertiary">
                        (você)
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-secondary">{aluno.email}</td>
                  <td className="px-4 py-3">
                    <Badge variant={aluno.role === "admin" ? "orange" : "default"}>
                      {aluno.role === "admin" ? "Admin" : "Aluno"}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={aluno.status === "active" ? "success" : "danger"}>
                      {aluno.status === "active" ? "Ativo" : "Bloqueado"}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-secondary">
                    {formatDate(aluno.registered_at, "dd/MM/yyyy")}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {aluno.role === "admin" ? (
                      <span className="text-tertiary">—</span>
                    ) : (
                      <div className="flex items-center justify-end gap-2">
                        <div className="h-1.5 w-20 overflow-hidden rounded-full bg-neutral-200">
                          <div
                            className="h-full rounded-full bg-accent"
                            style={{ width: `${aluno.progress_pct}%` }}
                          />
                        </div>
                        <span className="font-mono text-sm text-primary">
                          {aluno.progress_pct}%
                        </span>
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <Link
                        href={`/admin/students/${aluno.id}`}
                        title="Ver detalhe"
                        className="rounded-lg p-2 text-secondary transition-colors hover:bg-surface-hover hover:text-primary"
                      >
                        <Eye className="h-4 w-4" />
                      </Link>
                      <button
                        type="button"
                        title="Enviar e-mail de boas-vindas"
                        onClick={() => handleWelcomeEmail(aluno)}
                        disabled={enviandoEmailId === aluno.id}
                        className="rounded-lg p-2 text-secondary transition-colors hover:bg-surface-hover hover:text-primary"
                      >
                        <Mail className="h-4 w-4" />
                      </button>
                      <NovaSenhaTemporariaButton
                        profileId={aluno.id}
                        profileName={aluno.full_name}
                        profileEmail={aluno.email}
                        blocked={aluno.status === "blocked"}
                        isSelf={aluno.id === currentUserId}
                      />
                      <button
                        type="button"
                        title="Editar"
                        onClick={() => abrirEdicao(aluno)}
                        className="rounded-lg p-2 text-secondary transition-colors hover:bg-surface-hover hover:text-primary"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        title={aluno.status === "blocked" ? "Desbloquear" : "Bloquear"}
                        onClick={() => handleToggleBlock(aluno)}
                        disabled={aluno.id === currentUserId}
                        className={cn(
                          "rounded-lg p-2 transition-colors disabled:pointer-events-none disabled:opacity-40",
                          aluno.status === "blocked"
                            ? "text-green-600 hover:bg-success-subtle"
                            : "text-amber-600 hover:bg-warning-subtle"
                        )}
                      >
                        {aluno.status === "blocked" ? (
                          <LockOpen className="h-4 w-4" />
                        ) : (
                          <Ban className="h-4 w-4" />
                        )}
                      </button>
                      <button
                        type="button"
                        title="Excluir"
                        onClick={() => setExcluindo(aluno)}
                        disabled={aluno.id === currentUserId}
                        className="rounded-lg p-2 text-danger transition-colors hover:bg-danger-subtle disabled:pointer-events-none disabled:opacity-40"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td
                  colSpan={7}
                  className="border-t border-border-subtle bg-surface-sunken px-4 py-3 font-mono text-2xs tracking-wider text-secondary"
                >
                  {filtrados.length} usuário{filtrados.length === 1 ? "" : "s"} exibido
                  {filtrados.length === 1 ? "" : "s"}.
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* Modal criar/editar */}
      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editando ? "Editar usuário" : "Novo usuário"}
      >
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {erroForm && (
            <div className="rounded-md border border-red-400 bg-danger-subtle px-4 py-3 text-sm font-medium text-red-700">
              {erroForm}
            </div>
          )}
          <div>
            <Label htmlFor="al-nome">Nome completo</Label>
            <Input
              id="al-nome"
              name="full_name"
              placeholder="Nome do aluno"
              defaultValue={editando?.full_name ?? ""}
              required
            />
          </div>
          <div>
            <Label htmlFor="al-email">E-mail</Label>
            <Input
              id="al-email"
              name="email"
              type="email"
              placeholder="aluno@email.com"
              defaultValue={editando?.email ?? ""}
              readOnly={editando !== null}
              required
            />
            {editando ? (
              <p className="mt-1.5 text-xs text-tertiary">
                O e-mail não pode ser alterado enquanto as reservas das soluções
                estiverem vinculadas a este endereço.
              </p>
            ) : null}
          </div>
          {editando ? (
            <div className="rounded-xl bg-surface-sunken px-4 py-3 text-base text-secondary">
              A senha não se digita aqui: use “enviar e-mail de acesso” na lista
              ou, quando o e-mail do usuário não for uma opção, “gerar nova senha
              temporária” — a senha aparece na tela para você repassar.
            </div>
          ) : (
            <div className="rounded-xl bg-surface-sunken px-4 py-3 text-base text-secondary">
              A senha temporária será gerada automaticamente e o usuário deverá
              trocá-la no primeiro acesso.
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="al-perfil">Perfil</Label>
              {editando?.id === currentUserId ? (
                <input type="hidden" name="role" value={editando.role} />
              ) : null}
              <Select
                id="al-perfil"
                name="role"
                defaultValue={editando?.role ?? "student"}
                disabled={editando?.id === currentUserId}
              >
                <option value="student">Aluno</option>
                <option value="admin">Admin</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="al-status">Status</Label>
              {editando?.id === currentUserId ? (
                <input type="hidden" name="status" value={editando.status} />
              ) : null}
              <Select
                id="al-status"
                name="status"
                defaultValue={editando?.status ?? "active"}
                disabled={editando?.id === currentUserId}
              >
                <option value="active">Ativo</option>
                <option value="blocked">Bloqueado</option>
              </Select>
            </div>
          </div>
          {planos.length > 0 ? (
            <div>
              <Label htmlFor="al-plano">Plano</Label>
              <Select
                id="al-plano"
                name="plan_id"
                key={editando?.id ?? "novo"}
                defaultValue={editando?.plan_id != null ? String(editando.plan_id) : ""}
              >
                {/* Com plano vigente não existe "sem plano" aqui: remover é
                    decisão da ficha (onde o extrato dá o contexto). */}
                {editando?.plan_id == null ? (
                  <option value="">Sem plano (atribuir depois)</option>
                ) : null}
                {planos.map((plano) => (
                  <option key={plano.id} value={String(plano.id)}>
                    {plano.name}
                  </option>
                ))}
              </Select>
              <p className="mt-1.5 text-xs text-tertiary">
                {editando
                  ? "Trocar o plano lança as horas do novo no extrato; o direito atual vira histórico."
                  : "Com plano escolhido, os direitos materializam e as horas entram no extrato já na criação."}
              </p>
            </div>
          ) : null}
          <div className="mt-1 flex justify-end gap-3">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setFormOpen(false)}
              disabled={salvando}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={salvando}>
              {salvando ? "Salvando…" : editando ? "Salvar alterações" : "Criar usuário"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Credenciais do usuário recém-criado — persistente (não fecha por Esc/
          clique fora): a senha temporária não pode ser consultada depois. */}
      <Modal
        open={credenciais !== null}
        onClose={() => setCredenciais(null)}
        title="Usuário criado"
        dismissable={false}
      >
        {credenciais && (
          <div className="flex flex-col gap-4">
            {credenciais.temporaryPassword ? (
              <div className="rounded-md border border-amber-400 bg-warning-subtle px-4 py-3 text-sm font-medium text-amber-700">
                Copie a senha agora: por segurança ela não fica gravada e não
                poderá ser consultada depois.
              </div>
            ) : null}
            <div>
              <Label>Usuário</Label>
              <p className="text-base text-primary">
                {credenciais.fullName}{" "}
                <span className="font-mono text-sm text-secondary">
                  ({credenciais.email})
                </span>
              </p>
            </div>
            {credenciais.temporaryPassword ? (
              <div>
                <Label>Senha temporária</Label>
                <div className="flex items-center gap-2">
                  <code
                    data-testid="senha-temporaria"
                    className="flex-1 select-all rounded-lg border border-border bg-surface-sunken px-3 py-2 font-mono text-base text-primary"
                  >
                    {credenciais.temporaryPassword}
                  </code>
                  <Button type="button" variant="secondary" onClick={copiarSenhaTemporaria}>
                    {senhaCopiada ? (
                      <Check className="h-4 w-4" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                    {senhaCopiada ? "Copiada!" : "Copiar"}
                  </Button>
                </div>
                <p className="mt-1.5 text-xs text-tertiary">
                  O usuário troca esta senha no primeiro acesso.
                </p>
              </div>
            ) : (
              <div className="rounded-xl bg-surface-sunken px-4 py-3 text-sm text-secondary">
                {credenciais.blocked
                  ? "A conta nasceu bloqueada; desbloqueie-a e use “enviar e-mail de acesso” quando for liberar."
                  : "Já existia uma identidade central para este e-mail — a senha atual foi preservada. Use a ação de enviar e-mail de acesso para o usuário definir uma nova."}
              </div>
            )}
            <div
              className={cn(
                "rounded-md px-4 py-3 text-sm",
                credenciais.emailSent
                  ? "bg-success-subtle text-green-700"
                  : "border border-amber-400 bg-warning-subtle text-amber-700"
              )}
            >
              {credenciais.emailSent
                ? `E-mail de acesso enviado para ${credenciais.email}.`
                : credenciais.emailError
                  ? `O e-mail de acesso não foi enviado: ${credenciais.emailError}`
                  : "O e-mail de acesso não foi enviado — use a senha temporária acima ou reenvie pela lista."}
            </div>
            {credenciais.planError ? (
              <div className="rounded-md border border-red-400 bg-danger-subtle px-4 py-3 text-sm font-medium text-red-700">
                Plano não atribuído: {credenciais.planError}
              </div>
            ) : null}
            {credenciais.provisioningInfo ? (
              <p className="text-xs text-tertiary">{credenciais.provisioningInfo}</p>
            ) : null}
            <div className="flex justify-end">
              <Button type="button" onClick={() => setCredenciais(null)}>
                Concluir
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Confirmação de exclusão */}
      <ConfirmDialog
        open={excluindo !== null}
        onClose={() => setExcluindo(null)}
        onConfirm={handleDelete}
        title={`Excluir ${excluindo?.full_name ?? "usuário"}?`}
        description="O usuário perde o acesso imediatamente e sai das listagens. Esta ação não pode ser desfeita."
      />

      {/* Importação CSV */}
      <ImportCsvModal open={importOpen} onClose={() => setImportOpen(false)} />
    </div>
  );
}
