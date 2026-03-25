import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  BarChart3, 
  Send, 
  Loader2, 
  Filter, 
  Search,
  CheckCircle2,
  AlertCircle,
  Clock
} from 'lucide-react';
import { toast } from 'sonner';

export default function Campanhas() {
  const [user, setUser] = useState(null);
  const [empresaId, setEmpresaId] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filtroStatus, setFiltroStatus] = useState('todas');
  const queryClient = useQueryClient();

  useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    try {
      const me = await base44.auth.me();
      if (me.role === 'super_admin' || me.perfil === 'super_admin') {
        setEmpresaId('699696c2c9f5bffc2e67402b');
      } else {
        const colabs = await base44.entities.Colaborador.filter({ user_id: me.id, status: 'ativo' });
        if (colabs.length > 0) {
          setEmpresaId(colabs[0].empresa_id);
        }
      }
      setUser(me);
    } catch (e) {
      console.error('Erro ao carregar usuário:', e);
      toast.error('Erro ao carregar usuário');
    }
  };

  // Buscar campanhas
  const { data: campanhas = [], refetch: refetchCampanhas } = useQuery({
    queryKey: ['campanhas', empresaId],
    enabled: !!empresaId,
    queryFn: async () => {
      const data = await base44.entities.CampanhaLog.filter(
        { empresa_id: empresaId },
        '-created_date',
        1000
      );
      return data || [];
    }
  });

  // Executar campanhas
  const executarMutation = useMutation({
    mutationFn: async () => {
      const resp = await base44.functions.invoke('verificarEEnviarCampanhas', {});
      return resp?.data;
    },
    onSuccess: (data) => {
      toast.success(`✅ ${data.campanhasEnviadas} campanhas enviadas`);
      if (data.erros > 0) {
        toast.warning(`⚠️ ${data.erros} erros durante o envio`);
      }
      refetchCampanhas();
    },
    onError: (error) => {
      toast.error('Erro ao executar campanhas: ' + error.message);
    }
  });

  // Filtrar campanhas
  const campanhasFiltradas = campanhas.filter(c => {
    const matchSearch = 
      (c.cliente_nome || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (c.cliente_telefone || '').includes(searchTerm);
    
    const matchStatus = 
      filtroStatus === 'todas' || c.status === filtroStatus;
    
    return matchSearch && matchStatus;
  });

  // Estatísticas
  const stats = {
    total: campanhas.length,
    enviadas: campanhas.filter(c => c.status === 'enviada').length,
    erros: campanhas.filter(c => c.status === 'erro').length,
    taxa_sucesso: campanhas.length > 0 
      ? Math.round((campanhas.filter(c => c.status === 'enviada').length / campanhas.length) * 100)
      : 0
  };

  if (!user || !empresaId) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Campanhas</h1>
          <p className="text-sm text-slate-500 mt-1">Gerencie campanhas de reengajamento de clientes</p>
        </div>
        <Button 
          onClick={() => executarMutation.mutate()}
          disabled={executarMutation.isPending}
          className="gap-2 bg-emerald-600 hover:bg-emerald-700"
        >
          {executarMutation.isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Send className="w-4 h-4" />
          )}
          Executar Campanhas Agora
        </Button>
      </div>

      {/* Cards de Estatísticas */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-500 uppercase font-semibold">Total Enviadas</p>
                <p className="text-3xl font-bold text-slate-900 mt-1">{stats.total}</p>
              </div>
              <BarChart3 className="w-8 h-8 text-blue-500 opacity-50" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-500 uppercase font-semibold">Sucesso</p>
                <p className="text-3xl font-bold text-emerald-600 mt-1">{stats.enviadas}</p>
              </div>
              <CheckCircle2 className="w-8 h-8 text-emerald-500 opacity-50" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-500 uppercase font-semibold">Erros</p>
                <p className="text-3xl font-bold text-red-600 mt-1">{stats.erros}</p>
              </div>
              <AlertCircle className="w-8 h-8 text-red-500 opacity-50" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-500 uppercase font-semibold">Taxa de Sucesso</p>
                <p className="text-3xl font-bold text-blue-600 mt-1">{stats.taxa_sucesso}%</p>
              </div>
              <Clock className="w-8 h-8 text-blue-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Histórico de Campanhas */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5" />
            Histórico de Campanhas
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Filtros */}
          <div className="flex gap-3 flex-wrap">
            <div className="flex-1 min-w-xs">
              <div className="relative">
                <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                <Input
                  placeholder="Buscar por cliente ou telefone..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <div className="flex gap-2">
              {['todas', 'enviada', 'erro'].map(status => (
                <Button
                  key={status}
                  variant={filtroStatus === status ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setFiltroStatus(status)}
                  className="capitalize"
                >
                  {status === 'todas' ? 'Todas' : status}
                </Button>
              ))}
            </div>
          </div>

          {/* Lista de Campanhas */}
          <ScrollArea className="h-[500px] border rounded-lg">
            <div className="space-y-2 p-4">
              {campanhasFiltradas.length === 0 ? (
                <div className="flex items-center justify-center h-96 text-slate-400">
                  <p>Nenhuma campanha encontrada</p>
                </div>
              ) : (
                campanhasFiltradas.map(campanha => (
                  <div
                    key={campanha.id}
                    className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-200 hover:bg-slate-100 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm text-slate-900">{campanha.cliente_nome}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{campanha.cliente_telefone}</p>
                      <p className="text-xs text-slate-400 mt-1">
                        Tipo: {campanha.tipo_campanha === 'aniversario_emprestimo' ? 'Aniversário de Empréstimo' : campanha.tipo_campanha}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 ml-4">
                      <span className="text-xs text-slate-500">
                        {new Date(campanha.created_date).toLocaleDateString('pt-BR')}
                      </span>
                      <Badge
                        variant={campanha.status === 'enviada' ? 'default' : 'destructive'}
                        className="capitalize"
                      >
                        {campanha.status === 'enviada' ? '✓ Enviada' : '✗ Erro'}
                      </Badge>
                    </div>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}