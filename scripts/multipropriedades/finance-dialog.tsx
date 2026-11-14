import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { WalletCards } from "lucide-react";

type FinanceState =
  | "sem_titulo" | "aguardando" | "baixa_disponivel" | "estorno_disponivel"
  | "baixada" | "em_revisao" | "indisponivel" | "data_futura";

async function financeRequest<T>(path: string, body?: object, signal?: AbortSignal): Promise<T> {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session) throw Error("Sua sessão expirou. Abra a Maia novamente.");
  const response = await fetch("http://127.0.0.1:8190" + path, {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: "Bearer " + data.session.access_token,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    credentials: "omit",
    redirect: "error",
    signal: signal ?? AbortSignal.timeout(15000),
  });
  const result = await response.json();
  if (!response.ok) throw Error(result.error?.message || "Não foi possível concluir a operação no FinanceAI.");
  return result.data;
}

function FinanceAIParcela({ parcela, onClose }: { parcela: ParcelaSituacao; onClose: () => void }) {
  const { orgId } = useActiveOrg();
  const invalidar = useInvalidarMulti();
  const [recibo, setRecibo] = useState("");
  const path = `/v2/orgs/${orgId}/parcelas/${parcela.id}/financeai`;
  const status = useQuery({
    queryKey: multiKey(orgId, "financeai", parcela.id),
    queryFn: ({ signal }) => financeRequest<{
      estado: FinanceState; conciliacao_id?: string; titulo_id?: string;
    }>(path, undefined, signal),
    retry: false,
  });
  useEffect(() => {
    function refresh(event: MessageEvent) {
      if (event.origin === "http://127.0.0.1:3007" && event.source === window.parent &&
          event.data?.type === "arkom.multi.finance-return") void status.refetch();
    }
    window.addEventListener("message", refresh);
    return () => window.removeEventListener("message", refresh);
  }, [status.refetch]);
  const comando = useMutation({
    mutationFn: ({ action, id }: { action: "preparar" | "conciliar" | "estornar"; id?: string }) =>
      financeRequest<{ comando_id?: string }>(path + "/" + action, id ? { conciliacao_id: id } : {}),
    onSuccess: async (resultado, { action }) => {
      if (resultado.comando_id) setRecibo(resultado.comando_id);
      toast.success(action === "preparar" ? "Título enviado ao FinanceAI."
        : action === "conciliar" ? "Pagamento baixado na Maia." : "Estorno aplicado na Maia.");
      await invalidar();
    },
    onError: (error) => toast.error(error.message),
  });
  const estado = status.data?.estado;
  const mensagens: Record<FinanceState, string> = {
    sem_titulo: "Envie a parcela ao FinanceAI para conferir o pagamento com o extrato da empresa.",
    aguardando: "Confirme o pagamento no FinanceAI e volte aqui para aplicar a baixa.",
    baixa_disponivel: "Pagamento confirmado no FinanceAI. Aplique a baixa para marcar a parcela como paga e registrar o recibo na Maia.",
    estorno_disponivel: "Conciliação revertida no FinanceAI. Aplique o estorno para reabrir a parcela e registrar a operação na Maia.",
    baixada: "A baixa já está registrada. Para estornar, reverta a conciliação no FinanceAI e volte aqui.",
    em_revisao: "A movimentação está em revisão no FinanceAI. Confira o extrato para continuar.",
    indisponivel: "Esta parcela não está disponível para conciliação com o FinanceAI.",
    data_futura: "A movimentação tem data futura. A baixa fica disponível na data do pagamento.",
  };
  const podeAbrirFinance = !status.isError && estado &&
    ["aguardando", "baixada", "em_revisao", "data_futura"].includes(estado);
  const id = status.data?.conciliacao_id;
  return (
    <Dialog open onOpenChange={(open) => !open && !comando.isPending && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Conciliação com FinanceAI</DialogTitle>
          <DialogDescription>
            {parcela.cotista_nome ?? "Parcela do contrato"} · {formatMoeda(parcela.valor)}
            {" · Vencimento em "}{formatDia(parcela.vencimento)}
          </DialogDescription>
        </DialogHeader>
        <div className="rounded-xl border border-border bg-muted/40 p-4 text-sm leading-relaxed" aria-live="polite">
          {status.isPending ? "Consultando a parcela…" : status.isError
            ? status.error.message : estado && mensagens[estado]}
          {recibo && <p className="mt-2 break-all text-xs text-muted-foreground">Recibo {recibo}</p>}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" disabled={comando.isPending || status.isFetching}
            onClick={() => void status.refetch()}>Atualizar situação</Button>
          {podeAbrirFinance && status.data?.titulo_id && <Button onClick={() =>
            window.parent.postMessage({
              type: "arkom.multi.finance", titleId: status.data?.titulo_id,
            }, "http://127.0.0.1:3007")
          }>Abrir FinanceAI</Button>}
          {!status.isError && estado === "sem_titulo" && <Button disabled={comando.isPending || status.isFetching}
            onClick={() => comando.mutate({ action: "preparar" })}>Enviar ao FinanceAI</Button>}
          {!status.isError && id && estado === "baixa_disponivel" && <Button disabled={comando.isPending || status.isFetching}
            onClick={() => comando.mutate({ action: "conciliar", id })}>Aplicar baixa</Button>}
          {!status.isError && id && estado === "estorno_disponivel" && <Button variant="destructive" disabled={comando.isPending || status.isFetching}
            onClick={() => comando.mutate({ action: "estornar", id })}>Aplicar estorno</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
