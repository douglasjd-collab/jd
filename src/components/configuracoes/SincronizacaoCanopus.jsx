import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { 
  RefreshCw, 
  Loader2, 
  CheckCircle2,
  Database,
  AlertCircle
} from 'lucide-react';
import { toast } from 'sonner';

export default function SincronizacaoCanopus() {
  const [tipoProduto, setTipoProduto] = useState('101');
  const [permiteReserva, setPermiteReserva] = useState('N');
  const queryClient = useQueryClient();

  // Buscar total de planos
  const { data: planos = [] } = useQuery({
    queryKey: ['plano-canopus'],
    queryFn: async () => {
      const res = await base44.entities.PlanoCanopus.list({ limit: 1000 });
      return Array.isArray(res) ? res : (res?.items ?? []);
    },
  });

  // helper para extrair erro do Base44/Axios
  function getErrorInfo(err) {
    const e = err || {};
    const status = e?.response?.status;
    const data = e?.response?.data;

    // Se vier texto puro (ex: "Internal Server Error")
    if (typeof data === "string") {
      return { status, text: data };
    }

    // Se vier JSON
    if (data && typeof data === "object") {
      const message =
        data.message ||
        data.error ||
        data.detail ||
        (Array.isArray(data.errors) ? data.errors.map(x => x?.message || JSON.stringify(x)).join(" | ") : null);

      return {
        status,
        text: message ? String(message) : JSON.stringify(data),
        data,
      };
    }

    // fallback
    return {
      status,
      text: e.message || "Erro desconhecido",
    };
  }

  // Sincronizar
  const sincronizarMutation = useMutation({
    mutationFn: async () => {
      // dica: loga o payload para confirmar
      const payload = { id_tipo_produto: tipoProduto, permite_reserva: permiteReserva };
      console.log("[Canopus Sync] payload:", payload);

      const response = await base44.functions.invoke("syncCanopusPlanos", payload);

      // loga resposta em caso de sucesso
      console.log("[Canopus Sync] response:", response);

      return response?.data ?? response;
    },

    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["plano-canopus"] });

      const criados = data?.criados ?? 0;
      const atualizados = data?.atualizados ?? 0;

      toast.success(`Sincronização concluída! ${criados} criados, ${atualizados} atualizados`);
    },

    onError: (err) => {
      const info = getErrorInfo(err);

      // imprime tudo no console (isso aqui vai ajudar MUITO)
      console.error("[Canopus Sync] ERROR RAW:", err);
      console.error("[Canopus Sync] ERROR INFO:", info);

      toast.error(
        info.status
          ? `Erro ${info.status}: ${info.text}`
          : `Erro: ${info.text}`
      );
    },
  });

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-xl bg-emerald-50">
            <RefreshCw className="w-6 h-6 text-emerald-600" />
          </div>
          <div>
            <CardTitle>Sincronização Canopus</CardTitle>
            <CardDescription>
              Buscar planos de consórcio diretamente do sistema Canopus
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Status */}
        <div className="p-4 bg-slate-50 rounded-xl flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Database className="w-5 h-5 text-slate-400" />
            <div>
              <p className="text-sm text-slate-500">Planos Sincronizados</p>
              <p className="text-2xl font-bold text-slate-900">{planos.length}</p>
            </div>
          </div>
          {planos.length > 0 && (
            <CheckCircle2 className="w-6 h-6 text-emerald-500" />
          )}
        </div>

        {/* Filtros */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label>Tipo de Produto</Label>
            <Select value={tipoProduto} onValueChange={setTipoProduto}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="101">Automóveis (101)</SelectItem>
                <SelectItem value="102">Imóveis (102)</SelectItem>
                <SelectItem value="103">Motocicletas (103)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Permite Reserva</Label>
            <Select value={permiteReserva} onValueChange={setPermiteReserva}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="N">Não (N)</SelectItem>
                <SelectItem value="S">Sim (S)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Ação */}
        <div className="flex items-center gap-3 pt-4 border-t">
          <Button
            onClick={() => sincronizarMutation.mutate()}
            disabled={sincronizarMutation.isPending}
            className="bg-emerald-600 hover:bg-emerald-700 gap-2"
          >
            {sincronizarMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
            Sincronizar Planos
          </Button>
        </div>

        {/* Info */}
        <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-blue-600 mt-0.5" />
          <div className="flex-1 text-sm">
            <p className="font-semibold text-blue-900">Como funciona</p>
            <p className="text-blue-700 mt-1">
              A sincronização busca automaticamente os planos do sistema Canopus usando suas credenciais 
              (CANOPUS_USER e CANOPUS_PASS). Os tokens de sessão são capturados automaticamente.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}