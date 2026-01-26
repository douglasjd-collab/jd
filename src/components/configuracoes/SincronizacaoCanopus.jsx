import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { 
  RefreshCw, 
  Loader2, 
  CheckCircle2,
  Database,
  AlertCircle,
  Settings
} from 'lucide-react';
import { toast } from 'sonner';

export default function SincronizacaoCanopus() {
  const [tipoProduto, setTipoProduto] = useState('101');
  const [permiteReserva, setPermiteReserva] = useState('N');
  const [modalOpen, setModalOpen] = useState(false);
  const [usuario, setUsuario] = useState('');
  const [senha, setSenha] = useState('');
  const [empresaId, setEmpresaId] = useState(null);
  const queryClient = useQueryClient();

  // Carregar empresa_id e credenciais
  useEffect(() => {
    const loadData = async () => {
      try {
        const user = await base44.auth.me();
        let empId = user?.empresa_id;
        
        if (!empId) {
          const colabs = await base44.entities.Colaborador.filter({ user_id: user.id, status: 'ativo' });
          if (colabs?.length) empId = colabs[0].empresa_id;
        }
        
        setEmpresaId(empId);
        
        if (empId) {
          const integs = await base44.entities.IntegracaoCanopus.filter({ empresa_id: empId, origem: 'CANOPUS', status: 'ativo' });
          if (integs?.length) {
            setUsuario(integs[0].usuario || '');
            setSenha(integs[0].senha || '');
          }
        }
      } catch (e) {
        console.error('Erro ao carregar dados:', e);
      }
    };
    loadData();
  }, []);

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

  // Salvar credenciais
  const salvarCredenciaisMutation = useMutation({
    mutationFn: async () => {
      if (!empresaId) throw new Error('empresa_id não encontrado');
      if (!usuario || !senha) throw new Error('Usuário e senha são obrigatórios');

      const integs = await base44.entities.IntegracaoCanopus.filter({ empresa_id: empresaId, origem: 'CANOPUS' });
      
      if (integs?.length) {
        await base44.entities.IntegracaoCanopus.update(integs[0].id, {
          usuario,
          senha,
          status: 'ativo'
        });
      } else {
        await base44.entities.IntegracaoCanopus.create({
          empresa_id: empresaId,
          origem: 'CANOPUS',
          usuario,
          senha,
          url: 'https://afv.consorciocanopus.com.br/Sistema/',
          status: 'ativo'
        });
      }
    },
    onSuccess: () => {
      toast.success('Credenciais salvas com sucesso!');
      setModalOpen(false);
    },
    onError: (err) => {
      toast.error(err.message || 'Erro ao salvar credenciais');
    }
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
          
          <Button
            onClick={() => setModalOpen(true)}
            variant="outline"
            className="gap-2"
          >
            <Settings className="w-4 h-4" />
            Configurar Credenciais
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

      {/* Modal de Configuração */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Configurar Credenciais Canopus</DialogTitle>
            <DialogDescription>
              Informe suas credenciais de acesso ao sistema Canopus
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div>
              <Label>Usuário</Label>
              <Input
                value={usuario}
                onChange={(e) => setUsuario(e.target.value)}
                placeholder="Digite o usuário"
              />
            </div>

            <div>
              <Label>Senha</Label>
              <Input
                type="password"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                placeholder="Digite a senha"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => setModalOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              onClick={() => salvarCredenciaisMutation.mutate()}
              disabled={salvarCredenciaisMutation.isPending}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {salvarCredenciaisMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                'Salvar'
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}