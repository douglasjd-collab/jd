import React, { useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import PageHeader from "@/components/ui/PageHeader";
import DataTable from "@/components/ui/DataTable";
import StatusBadge from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { Plus, Loader2 } from "lucide-react";
import { toast } from "sonner";

const moneyBR = (v) =>
  (Number(v || 0)).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const clamp = (n, min, max) => Math.max(min, Math.min(max, Number(n || 0)));

export default function CartasContempladas() {
  const queryClient = useQueryClient();

  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  const [form, setForm] = useState({
    titulo: "",
    categoria: "automovel",
    status: "disponivel",
    valor_credito: 0,
    parcela: 0,
    entrada: 0,
    comissao_percentual: 1,
    parcelas_pagas: 0,
    parcelas_total: 0,
    observacoes: "",
    fonte: "manual",
  });

  const { data: me } = useQuery({
    queryKey: ["me"],
    queryFn: async () => base44.auth.me(),
  });

  const { data: cartas = [], isLoading } = useQuery({
    queryKey: ["cartas-contempladas"],
    queryFn: async () => {
      const res = await base44.entities.CartaContemplada.list();
      return res || [];
    },
  });

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return cartas;
    return cartas.filter((c) => {
      const s = `${c.titulo || ""} ${c.categoria || ""} ${c.status || ""}`.toLowerCase();
      return s.includes(term);
    });
  }, [cartas, q]);

  const columns = useMemo(
    () => [
      { header: "Título", accessorKey: "titulo" },
      {
        header: "Categoria",
        cell: ({ row }) => {
          const v = row.original.categoria;
          const map = {
            automovel: "Automóvel",
            moto: "Moto",
            imovel: "Imóvel",
            servicos: "Serviços",
            outros: "Outros",
          };
          return map[v] || v || "-";
        },
      },
      {
        header: "Status",
        cell: ({ row }) => <StatusBadge status={row.original.status || "disponivel"} />,
      },
      { header: "Crédito", cell: ({ row }) => moneyBR(row.original.valor_credito) },
      { header: "Entrada", cell: ({ row }) => moneyBR(row.original.entrada) },
      { header: "Parcela", cell: ({ row }) => moneyBR(row.original.parcela) },
      {
        header: "Parcelas",
        cell: ({ row }) => {
          const p = Number(row.original.parcelas_pagas || 0);
          const t = Number(row.original.parcelas_total || 0);
          const rest = Math.max(0, t - p);
          return t > 0 ? `Pagas: ${p}/${t} • Restam: ${rest}` : "-";
        },
      },
      { header: "Comissão", cell: ({ row }) => `${Number(row.original.comissao_percentual || 0)}%` },
      {
        header: "Ações",
        cell: ({ row }) => (
          <Button variant="outline" size="sm" onClick={() => handleEdit(row.original)}>
            Editar
          </Button>
        ),
      },
    ],
    []
  );

  const resetForm = () =>
    setForm({
      titulo: "",
      categoria: "automovel",
      status: "disponivel",
      valor_credito: 0,
      parcela: 0,
      entrada: 0,
      comissao_percentual: 1,
      parcelas_pagas: 0,
      parcelas_total: 0,
      observacoes: "",
      fonte: "manual",
    });

  const handleNew = () => {
    setEditing(null);
    resetForm();
    setOpen(true);
  };

  const handleEdit = (c) => {
    setEditing(c);
    setForm({
      titulo: c.titulo || "",
      categoria: c.categoria || "automovel",
      status: c.status || "disponivel",
      valor_credito: Number(c.valor_credito || 0),
      parcela: Number(c.parcela || 0),
      entrada: Number(c.entrada || 0),
      comissao_percentual: clamp(c.comissao_percentual ?? 1, 1, 5),
      parcelas_pagas: Number(c.parcelas_pagas || 0),
      parcelas_total: Number(c.parcelas_total || 0),
      observacoes: c.observacoes || "",
      fonte: c.fonte || "manual",
    });
    setOpen(true);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        ...form,
        comissao_percentual: clamp(form.comissao_percentual, 1, 5),
        valor_credito: Number(form.valor_credito || 0),
        entrada: Number(form.entrada || 0),
        parcela: Number(form.parcela || 0),
        parcelas_pagas: Number(form.parcelas_pagas || 0),
        parcelas_total: Number(form.parcelas_total || 0),
        fonte: "manual",
      };

      if (!payload.titulo?.trim()) throw new Error("Informe um título");

      const role = (me?.perfil || me?.role || "").toString().trim().toLowerCase();

      // EDITAR = altera apenas a carta atual (sem replicar)
      if (editing?.id) {
        return base44.entities.CartaContemplada.update(editing.id, payload);
      }

      // CRIAR: super_admin/master replica para todas as empresas
      if (["super_admin", "master"].includes(role)) {
        const res = await base44.functions.invoke("createCartaContempladaReplicar", {
          data: payload,
        });
        return res.data;
      }

      // CRIAR normal (admin/gerente)
      return base44.entities.CartaContemplada.create(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cartas-contempladas"] });
      toast.success(editing ? "Carta atualizada!" : "Carta cadastrada e replicada!");
      setOpen(false);
      setEditing(null);
      resetForm();
    },
    onError: (e) => toast.error(e?.message || "Erro ao salvar"),
  });

  return (
    <div className="space-y-4">
      <PageHeader
        title="Cartas Contempladas"
        subtitle="Lista de cartas contempladas disponíveis e controle de comissão/parcelas."
        actionLabel="Nova Carta"
        onAction={handleNew}
      />

      <Input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Buscar por título, categoria ou status..."
      />

      <DataTable
        columns={columns}
        data={filtered}
        loading={isLoading}
        emptyMessage="Nenhuma carta contemplada cadastrada."
      />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar Carta" : "Cadastrar Carta Contemplada"}</DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-2">
            <div className="md:col-span-2">
              <Label>Título</Label>
              <Input
                value={form.titulo}
                onChange={(e) => setForm((p) => ({ ...p, titulo: e.target.value }))}
                placeholder="Ex.: Carta Contemplada – Veículos"
              />
            </div>

            <div>
              <Label>Categoria</Label>
              <Select value={form.categoria} onValueChange={(v) => setForm((p) => ({ ...p, categoria: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="automovel">Automóvel</SelectItem>
                  <SelectItem value="moto">Moto</SelectItem>
                  <SelectItem value="imovel">Imóvel</SelectItem>
                  <SelectItem value="servicos">Serviços</SelectItem>
                  <SelectItem value="outros">Outros</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm((p) => ({ ...p, status: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="disponivel">Disponível</SelectItem>
                  <SelectItem value="reservada">Reservada</SelectItem>
                  <SelectItem value="vendida">Vendida</SelectItem>
                  <SelectItem value="inativa">Inativa</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Valor do Crédito</Label>
              <Input type="number" value={form.valor_credito}
                onChange={(e) => setForm((p) => ({ ...p, valor_credito: e.target.value }))}
              />
            </div>

            <div>
              <Label>Parcela</Label>
              <Input type="number" value={form.parcela}
                onChange={(e) => setForm((p) => ({ ...p, parcela: e.target.value }))}
              />
            </div>

            <div>
              <Label>Entrada</Label>
              <Input type="number" value={form.entrada}
                onChange={(e) => setForm((p) => ({ ...p, entrada: e.target.value }))}
              />
            </div>

            <div>
              <Label>Comissão do Vendedor (%)</Label>
              <Input
                type="number"
                min={1}
                max={5}
                value={form.comissao_percentual}
                onChange={(e) => setForm((p) => ({ ...p, comissao_percentual: e.target.value }))}
              />
              <p className="text-xs text-slate-500 mt-1">Permitido: 1% a 5%</p>
            </div>

            <div>
              <Label>Parcelas Pagas</Label>
              <Input type="number" value={form.parcelas_pagas}
                onChange={(e) => setForm((p) => ({ ...p, parcelas_pagas: e.target.value }))}
              />
            </div>

            <div>
              <Label>Total de Parcelas</Label>
              <Input type="number" value={form.parcelas_total}
                onChange={(e) => setForm((p) => ({ ...p, parcelas_total: e.target.value }))}
              />
              <p className="text-xs text-slate-500 mt-1">
                Preview:{" "}
                {form.parcelas_total > 0
                  ? `Pagas: ${Number(form.parcelas_pagas || 0)}/${Number(form.parcelas_total || 0)} • Restam: ${Math.max(
                      0,
                      Number(form.parcelas_total || 0) - Number(form.parcelas_pagas || 0)
                    )}`
                  : "-"}
              </p>
            </div>

            <div className="md:col-span-2">
              <Label>Observações</Label>
              <Textarea
                value={form.observacoes}
                onChange={(e) => setForm((p) => ({ ...p, observacoes: e.target.value }))}
                placeholder="Informações adicionais, restrições, etc."
              />
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saveMutation.isPending}>
              Cancelar
            </Button>
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {saveMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Salvando...
                </>
              ) : (
                "Salvar"
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}