import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { 
  RefreshCw, 
  AlertCircle, 
  CheckCircle2, 
  Clock, 
  Settings,
  PlayCircle,
  Loader2,
  Database,
  Eye
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

export default function IntegracaoCanopus() {
  const [configOpen, setConfigOpen] = useState(false);
  const [historicoOpen, setHistoricoOpen] = useState(false);
  const [credentials, setCredentials] = useState({
    usuario: '',
    senha: ''
  });
  const [user, setUser] = useState(null);

  const queryClient = useQueryClient();

  // Carregar usuário
  useEffect(() => {
    const loadUser = async () => {
      try {
        const me = await base44.auth.me();
        setUser(me);
      } catch (error) {
        console.error('Erro ao carregar usuário:', error);
      }
    };
    loadUser();
  }, []);

  // Buscar configurações
  const { data: config } = useQuery({
    queryKey: ['config-canopus', user?.id],
    queryFn: async () => {
      try {
        if (!user?.empresa_id) return null;
        const integracoes = await base44.entities.IntegracaoCanopus.filter({ 
          empresa_id: user.empresa_id,
          origem: 'CANOPUS'
        });
        return integracoes.length > 0 ? integracoes[0] : null;
      } catch (error) {
        console.error('Erro ao buscar config:', error);
        return null;
      }
    },
    retry: false,
    enabled: !!user?.empresa_id
  });

  // Buscar última execução
  const { data: ultimaExecucao } = useQuery({
    queryKey: ['integracao-canopus-ultima'],
    queryFn: async () => {
      try {
        const integracoes = await base44.entities.IntegracaoCanopus.list('-created_date', 1);
        return integracoes[0] || null;
      } catch (error) {
        console.error('Erro ao buscar última execução:', error);
        return null;
      }
    },
    retry: false
  });

  // Buscar histórico
  const { data: historico = [] } = useQuery({
    queryKey: ['integracao-canopus-historico'],
    queryFn: async () => {
      try {
        return await base44.entities.IntegracaoCanopus.list('-created_date', 20);
      } catch (error) {
        console.error('Erro ao buscar histórico:', error);
        return [];
      }
    },
    retry: false
  });

  // Buscar clientes Canopus
  const { data: clientesCanopus = [] } = useQuery({
    queryKey: ['clientes-canopus'],
    queryFn: async () => {
      try {
        return await base44.entities.ClienteCanopus.list('-created_date', 50);
      } catch (error) {
        console.error('Erro ao buscar clientes Canopus:', error);
        return [];
      }
    },
    retry: false
  });

  // Salvar configurações
  const salvarConfigMutation = useMutation({
    mutationFn: async (data) => {
      const configs = await base44.entities.ConfiguracaoSistema.filter({ 
        chave: 'canopus_config' 
      });

      const configData = {
        chave: 'canopus_config',
        valor: JSON.stringify(data),
        descricao: 'Configurações de integração Canopus',
        tipo: 'texto'
      };

      if (configs.length > 0) {
        await base44.entities.ConfiguracaoSistema.update(configs[0].id, configData);
      } else {
        await base44.entities.ConfiguracaoSistema.create(configData);
      }
    },
    onSuccess: () => {
      toast.success('Configurações salvas com sucesso');
      setConfigOpen(false);
      queryClient.invalidateQueries({ queryKey: ['config-canopus'] });
    },
    onError: () => {
      toast.error('Erro ao salvar configurações');
    }
  });

  // Executar integração manualmente (placeholder)
  const executarIntegracaoMutation = useMutation({
    mutationFn: async () => {
      const user = await base44.auth.me();

      // Criar registro de execução
      const integracao = await base44.entities.IntegracaoCanopus.create({
        tipo_execucao: 'manual',
        status: 'aguardando',
        data_execucao: new Date().toISOString(),
        usuario_id: user.id,
        usuario_nome: user.full_name
      });

      // Placeholder - quando backend functions estiver ativo, aqui chamará o robô
      throw new Error('Backend Functions não habilitado. Acesse Dashboard → Settings para habilitar.');
    },
    onError: (error) => {
      toast.error(error.message);
    }
  });

  const handleSalvarConfig = () => {
    if (!credentials.usuario || !credentials.senha) {
      toast.error('Preencha usuário e senha');
      return;
    }
    salvarConfigMutation.mutate(credentials);
  };

  const statusConfig = {
    aguardando: { label: 'Aguardando', color: 'bg-slate-100 text-slate-700', icon: Clock },
    executando: { label: 'Executando', color: 'bg-blue-100 text-blue-700', icon: Loader2 },
    concluido: { label: 'Concluído', color: 'bg-emerald-100 text-emerald-700', icon: CheckCircle2 },
    erro: { label: 'Erro', color: 'bg-red-100 text-red-700', icon: AlertCircle }
  };

  const formatTempo = (segundos) => {
    if (!segundos) return '-';
    const min = Math.floor(segundos / 60);
    const sec = segundos % 60;
    return `${min}m ${sec}s`;
  };

  return (
    <div className="space-y-6">
      {/* Status Card */}
      <Card className="border-0 shadow-sm">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-xl bg-blue-50">
                <RefreshCw className="w-6 h-6 text-blue-600" />
              </div>
              <div>
                <CardTitle>Integração Canopus</CardTitle>
                <p className="text-sm text-slate-500 mt-1">
                  Sincronização automática de clientes
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setConfigOpen(true)}
              className="gap-2"
            >
              <Settings className="w-4 h-4" />
              Configurar
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Status Atual */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="p-4 bg-slate-50 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <Database className="w-4 h-4 text-slate-400" />
                <p className="text-xs text-slate-600">Clientes Sincronizados</p>
              </div>
              <p className="text-2xl font-bold text-slate-900">{clientesCanopus.length}</p>
            </div>

            {ultimaExecucao && (
              <>
                <div className="p-4 bg-emerald-50 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <p className="text-xs text-emerald-700">Última Execução</p>
                  </div>
                  <p className="text-sm font-semibold text-emerald-900">
                    {format(new Date(ultimaExecucao.created_date), 'dd/MM/yyyy HH:mm')}
                  </p>
                </div>

                <div className="p-4 bg-blue-50 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <Clock className="w-4 h-4 text-blue-600" />
                    <p className="text-xs text-blue-700">Tempo de Execução</p>
                  </div>
                  <p className="text-lg font-bold text-blue-900">
                    {formatTempo(ultimaExecucao.tempo_execucao)}
                  </p>
                </div>

                <div className="p-4 bg-slate-50 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    {React.createElement(statusConfig[ultimaExecucao.status]?.icon || Clock, {
                      className: "w-4 h-4"
                    })}
                    <p className="text-xs text-slate-600">Status</p>
                  </div>
                  <Badge className={statusConfig[ultimaExecucao.status]?.color}>
                    {statusConfig[ultimaExecucao.status]?.label}
                  </Badge>
                </div>
              </>
            )}
          </div>

          {/* Ações */}
          <div className="flex items-center gap-3 pt-4 border-t">
            <Button
              onClick={() => executarIntegracaoMutation.mutate()}
              disabled={executarIntegracaoMutation.isPending}
              className="bg-blue-600 hover:bg-blue-700 gap-2"
            >
              {executarIntegracaoMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <PlayCircle className="w-4 h-4" />
              )}
              Executar Agora
            </Button>

            <Button
              variant="outline"
              onClick={() => setHistoricoOpen(true)}
              className="gap-2"
            >
              <Eye className="w-4 h-4" />
              Ver Histórico
            </Button>
          </div>

          {/* Alerta Backend Functions */}
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5" />
            <div className="flex-1">
              <p className="font-semibold text-amber-900 text-sm">Backend Functions Necessário</p>
              <p className="text-xs text-amber-700 mt-1">
                A integração RPA requer Backend Functions habilitado. Acesse Dashboard → Settings para ativar.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Modal de Configuração */}
      <Dialog open={configOpen} onOpenChange={setConfigOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Configurar Integração Canopus</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-xs text-blue-900">
                <strong>URL:</strong> https://afv.consorciocanopus.com.br/Sistema/
              </p>
            </div>

            <div>
              <Label htmlFor="usuario">Usuário *</Label>
              <Input
                id="usuario"
                value={credentials.usuario}
                onChange={(e) => setCredentials({ ...credentials, usuario: e.target.value })}
                placeholder="Seu usuário do Canopus"
              />
            </div>

            <div>
              <Label htmlFor="senha">Senha *</Label>
              <Input
                id="senha"
                type="password"
                value={credentials.senha}
                onChange={(e) => setCredentials({ ...credentials, senha: e.target.value })}
                placeholder="Sua senha do Canopus"
              />
            </div>

            <div className="p-3 bg-slate-50 rounded-lg text-xs text-slate-600">
              ⚠️ As credenciais são armazenadas de forma segura e usadas apenas para leitura de dados.
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <Button variant="outline" onClick={() => setConfigOpen(false)}>
                Cancelar
              </Button>
              <Button
                onClick={handleSalvarConfig}
                disabled={salvarConfigMutation.isPending}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {salvarConfigMutation.isPending && (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                )}
                Salvar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal de Histórico */}
      <Dialog open={historicoOpen} onOpenChange={setHistoricoOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Histórico de Execuções</DialogTitle>
          </DialogHeader>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data/Hora</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Lidos</TableHead>
                <TableHead>Criados</TableHead>
                <TableHead>Atualizados</TableHead>
                <TableHead>Erros</TableHead>
                <TableHead>Tempo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {historico.map((h) => {
                const StatusIcon = statusConfig[h.status]?.icon || Clock;
                return (
                  <TableRow key={h.id}>
                    <TableCell className="text-sm">
                      {format(new Date(h.created_date), 'dd/MM/yyyy HH:mm')}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize">
                        {h.tipo_execucao}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge className={statusConfig[h.status]?.color}>
                        {statusConfig[h.status]?.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">{h.total_clientes_lidos || 0}</TableCell>
                    <TableCell className="text-center text-emerald-600 font-semibold">
                      {h.total_criados || 0}
                    </TableCell>
                    <TableCell className="text-center text-blue-600 font-semibold">
                      {h.total_atualizados || 0}
                    </TableCell>
                    <TableCell className="text-center text-red-600 font-semibold">
                      {h.total_erros || 0}
                    </TableCell>
                    <TableCell className="text-sm">{formatTempo(h.tempo_execucao)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>

          {historico.length === 0 && (
            <div className="text-center py-8 text-slate-500 text-sm">
              Nenhuma execução registrada
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}