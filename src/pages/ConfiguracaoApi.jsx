import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import {
  Tabs, TabsContent, TabsList, TabsTrigger,
} from '@/components/ui/tabs';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Plus, Trash2, Pencil, Plug, RefreshCw, CheckCircle2, XCircle,
  Clock, Zap, Settings, List, Play, AlertCircle, Loader2
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

export default function ConfiguracaoApi() {
  const [currentUser, setCurrentUser] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editando, setEditando] = useState(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletando, setDeletando] = useState(null);
  const [activeConfig, setActiveConfig] = useState(null);
  const [testeResultado, setTesteResultado] = useState(null);
  const [testando, setTestando] = useState(false);
  const [sincronizando, setSincronizando] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => { loadUser(); }, []);

  const loadUser = async () => {
    const me = await base44.auth.me();
    if (me.role === 'super_admin' || me.perfil === 'super_admin') {
      setCurrentUser({ ...me, perfil: 'super_admin', empresa_id: null });
      return;
    }
    const colabs = await base44.entities.Colaborador.filter({ user_id: me.id, status: 'ativo' }, '-created_date');
    if (colabs.length > 0) {
      const c = colabs[0];
      setCurrentUser({ ...me, perfil: c.perfil, empresa_id: c.empresa_id });
    }
  };

  const { data: configs = [], isLoading } = useQuery({
    queryKey: ['configuracoes-api', currentUser?.empresa_id],
    enabled: !!currentUser,
    queryFn: () => currentUser?.empresa_id
      ? base44.entities.ConfiguracaoApiBanco.filter({ empresa_id: currentUser.empresa_id })
      : base44.entities.ConfiguracaoApiBanco.list(),
  });

  const { data: bancos = [] } = useQuery({
    queryKey: ['bancos-api'],
    queryFn: () => base44.entities.Banco.filter({ ativo: true }),
  });

  const { data: mapeamentos = [] } = useQuery({
    queryKey: ['mapeamentos-status', activeConfig?.id],
    enabled: !!activeConfig?.id,
    queryFn: () => base44.entities.MapeamentoStatusBanco.filter({ configuracao_api_id: activeConfig.id }),
  });

  const { data: logs = [] } = useQuery({
    queryKey: ['logs-integracao', activeConfig?.id],
    enabled: !!activeConfig?.id,
    queryFn: () => base44.entities.LogIntegracaoBanco.filter(
      { configuracao_api_id: activeConfig.id }, '-created_date', 50
    ),
  });

  const saveMutation = useMutation({
    mutationFn: async (data) => {
      if (editando) return base44.entities.ConfiguracaoApiBanco.update(editando.id, data);
      return base44.entities.ConfiguracaoApiBanco.create({ ...data, empresa_id: currentUser?.empresa_id });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['configuracoes-api'] });
      setModalOpen(false);
      setEditando(null);
      toast.success('Configuração salva!');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.ConfiguracaoApiBanco.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['configuracoes-api'] });
      setDeleteOpen(false);
      if (activeConfig?.id === deletando?.id) setActiveConfig(null);
      toast.success('Integração removida!');
    },
  });

  const saveMapeamentoMutation = useMutation({
    mutationFn: (data) => base44.entities.MapeamentoStatusBanco.create({
      ...data,
      empresa_id: currentUser?.empresa_id,
      configuracao_api_id: activeConfig.id,
      banco_id: activeConfig.banco_id,
    }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['mapeamentos-status'] }),
  });

  const deleteMapeamentoMutation = useMutation({
    mutationFn: (id) => base44.entities.MapeamentoStatusBanco.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['mapeamentos-status'] }),
  });

  const handleTestar = async () => {
    if (!activeConfig) return;
    setTestando(true);
    setTesteResultado(null);
    try {
      const res = await base44.functions.invoke('testarConexaoApiBanco', { configuracao_id: activeConfig.id });
      setTesteResultado(res.data);
      queryClient.invalidateQueries({ queryKey: ['logs-integracao'] });
    } catch (e) {
      setTesteResultado({ success: false, error: e.message });
    } finally {
      setTestando(false);
    }
  };

  const handleSincronizar = async () => {
    if (!activeConfig) return;
    setSincronizando(true);
    try {
      const res = await base44.functions.invoke('importarPropostasBanco', {
        configuracao_id: activeConfig.id,
        empresa_id: currentUser?.empresa_id || activeConfig.empresa_id,
      });
      if (res.data.success) {
        const msg = `Sincronização concluída: ${res.data.importadas || 0} novas, ${res.data.atualizadas || 0} atualizadas${res.data.clientes_criados > 0 ? `, ${res.data.clientes_criados} clientes criados` : ''}`;
        toast.success(msg);
      } else {
        toast.error(res.data.error || 'Erro na sincronização');
      }
      queryClient.invalidateQueries({ queryKey: ['logs-integracao'] });
      queryClient.invalidateQueries({ queryKey: ['configuracoes-api'] });
    } catch (e) {
      toast.error(e.message);
    } finally {
      setSincronizando(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Configuração de APIs</h1>
          <p className="text-slate-500 mt-1">Gerencie integrações com bancos e parceiros</p>
        </div>
        <Button className="bg-[#23BE84] hover:bg-[#1da570] gap-2" onClick={() => { setEditando(null); setModalOpen(true); }}>
          <Plus className="w-4 h-4" /> Nova Integração
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Lista de integrações */}
        <div className="lg:col-span-1 space-y-2">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide px-1">Integrações</p>
          {isLoading && <div className="text-slate-400 text-sm p-3">Carregando...</div>}
          {configs.map(c => {
            const banco = bancos.find(b => b.id === c.banco_id);
            const isActive = activeConfig?.id === c.id;
            return (
              <div
                key={c.id}
                onClick={() => setActiveConfig(c)}
                className={`p-3 rounded-xl border cursor-pointer transition-all ${isActive ? 'border-[#23BE84] bg-emerald-50' : 'border-slate-200 bg-white hover:border-slate-300'}`}
              >
                <div className="flex items-center gap-2">
                  {banco?.logo_url
                    ? <img src={banco.logo_url} alt={banco.nome} className="w-7 h-7 object-contain rounded" />
                    : <div className="w-7 h-7 rounded bg-slate-200 flex items-center justify-center text-xs font-bold text-slate-500">{(banco?.nome || 'B')[0]}</div>
                  }
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-slate-800 truncate">{c.nome_integracao}</p>
                    <p className="text-xs text-slate-400 truncate">{banco?.nome || '-'}</p>
                  </div>
                  <div className={`w-2 h-2 rounded-full ${c.integracao_ativa ? 'bg-green-500' : 'bg-slate-300'}`} />
                </div>
              </div>
            );
          })}
          {configs.length === 0 && !isLoading && (
            <div className="text-center py-6 text-slate-400 text-sm">
              <Plug className="w-6 h-6 mx-auto mb-2 opacity-50" />
              Nenhuma integração
            </div>
          )}
        </div>

        {/* Detalhes */}
        <div className="lg:col-span-3">
          {!activeConfig ? (
            <div className="bg-white rounded-xl border border-dashed border-slate-300 h-64 flex items-center justify-center text-slate-400">
              <div className="text-center">
                <Settings className="w-8 h-8 mx-auto mb-2 opacity-40" />
                <p>Selecione uma integração para configurar</p>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-slate-200">
              {/* Header */}
              <div className="p-5 border-b flex items-center justify-between">
                <div>
                  <h2 className="font-bold text-slate-900">{activeConfig.nome_integracao}</h2>
                  <p className="text-sm text-slate-500">{activeConfig.base_url}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={handleTestar} disabled={testando} className="gap-1.5">
                    {testando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                    Testar
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleSincronizar} disabled={sincronizando} className="gap-1.5">
                    {sincronizando ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                    Sincronizar
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => { setEditando(activeConfig); setModalOpen(true); }}>
                    <Pencil className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="text-red-500" onClick={() => { setDeletando(activeConfig); setDeleteOpen(true); }}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              <Tabs defaultValue="dados" className="p-5">
                <TabsList>
                  <TabsTrigger value="dados">Dados</TabsTrigger>
                  <TabsTrigger value="automacao">Automação</TabsTrigger>
                  <TabsTrigger value="mapeamento">Status</TabsTrigger>
                  <TabsTrigger value="teste">Teste</TabsTrigger>
                  <TabsTrigger value="logs">Logs</TabsTrigger>
                </TabsList>

                {/* ABA DADOS */}
                 <TabsContent value="dados" className="mt-4 space-y-3">
                  {/* Avisos de configuração incorreta */}
                  {activeConfig.base_url?.includes('/sign-in') || activeConfig.base_url?.includes('/login') ? (
                    <div className="bg-yellow-50 border border-yellow-300 rounded-lg p-3 text-sm text-yellow-800">
                      ⚠️ <strong>URL incorreta:</strong> A URL Base não deve incluir <code>/sign-in</code> ou <code>/login</code>. Use apenas o domínio raiz, ex: <code>https://finanto.joinbank.com.br</code>. Clique em editar para corrigir.
                    </div>
                  ) : null}
                  {activeConfig.api_key?.startsWith('http') ? (
                    <div className="bg-red-50 border border-red-300 rounded-lg p-3 text-sm text-red-800">
                      🔴 <strong>API Key inválida:</strong> O campo "API Key" contém uma URL, não uma chave de autenticação. Para a Finanto, use os campos <strong>Usuário</strong> e <strong>Senha</strong>. Clique em editar para corrigir.
                    </div>
                  ) : null}
                  <div className="grid grid-cols-2 gap-4">
                    <InfoField label="Banco" value={bancos.find(b => b.id === activeConfig.banco_id)?.nome || '-'} />
                    <InfoField label="Ambiente" value={activeConfig.ambiente} badge={activeConfig.ambiente === 'producao' ? 'green' : 'yellow'} />
                    <InfoField label="Tipo Autenticação" value={activeConfig.auth_type} />
                    <InfoField label="Tipo Integração" value={activeConfig.tipo_integracao} />
                    <InfoField label="URL Base" value={activeConfig.base_url} span={2} />
                    {activeConfig.ultima_sincronizacao_em && (
                      <InfoField label="Última Sincronização" value={format(new Date(activeConfig.ultima_sincronizacao_em), 'dd/MM/yyyy HH:mm')} span={2} />
                    )}
                    {activeConfig.ultimo_erro && (
                      <div className="col-span-2 bg-red-50 border border-red-200 rounded-lg p-3">
                        <p className="text-xs font-semibold text-red-700 mb-1 flex items-center gap-1"><AlertCircle className="w-3.5 h-3.5" /> Último Erro</p>
                        <p className="text-sm text-red-600">{activeConfig.ultimo_erro}</p>
                      </div>
                    )}
                    {activeConfig.observacoes && (
                      <InfoField label="Observações" value={activeConfig.observacoes} span={2} />
                    )}
                  </div>
                </TabsContent>

                {/* ABA AUTOMAÇÃO */}
                <TabsContent value="automacao" className="mt-4 space-y-4">
                  <SwitchField label="Importar propostas automaticamente" checked={activeConfig.importar_propostas_auto} onChange={async (v) => {
                    await base44.entities.ConfiguracaoApiBanco.update(activeConfig.id, { importar_propostas_auto: v });
                    setActiveConfig({ ...activeConfig, importar_propostas_auto: v });
                    queryClient.invalidateQueries({ queryKey: ['configuracoes-api'] });
                  }} />
                  <SwitchField label="Atualizar status automaticamente" checked={activeConfig.atualizar_status_auto} onChange={async (v) => {
                    await base44.entities.ConfiguracaoApiBanco.update(activeConfig.id, { atualizar_status_auto: v });
                    setActiveConfig({ ...activeConfig, atualizar_status_auto: v });
                    queryClient.invalidateQueries({ queryKey: ['configuracoes-api'] });
                  }} />
                  <SwitchField label="Buscar histórico automaticamente" checked={activeConfig.buscar_historico_auto} onChange={async (v) => {
                    await base44.entities.ConfiguracaoApiBanco.update(activeConfig.id, { buscar_historico_auto: v });
                    setActiveConfig({ ...activeConfig, buscar_historico_auto: v });
                    queryClient.invalidateQueries({ queryKey: ['configuracoes-api'] });
                  }} />
                  <SwitchField label="Integração ativa" checked={activeConfig.integracao_ativa} onChange={async (v) => {
                    await base44.entities.ConfiguracaoApiBanco.update(activeConfig.id, { integracao_ativa: v });
                    setActiveConfig({ ...activeConfig, integracao_ativa: v });
                    queryClient.invalidateQueries({ queryKey: ['configuracoes-api'] });
                  }} />
                  <div>
                    <Label className="text-sm text-slate-600">Intervalo de sincronização (minutos)</Label>
                    <div className="flex items-center gap-2 mt-1">
                      <Input
                        type="number" min={5} className="w-28"
                        defaultValue={activeConfig.intervalo_sync_minutos || 15}
                        onBlur={async (e) => {
                          const v = parseInt(e.target.value) || 15;
                          await base44.entities.ConfiguracaoApiBanco.update(activeConfig.id, { intervalo_sync_minutos: v });
                          setActiveConfig({ ...activeConfig, intervalo_sync_minutos: v });
                        }}
                      />
                      <span className="text-sm text-slate-500">minutos</span>
                    </div>
                  </div>
                </TabsContent>

                {/* ABA MAPEAMENTO DE STATUS */}
                <TabsContent value="mapeamento" className="mt-4 space-y-4">
                  <MapeamentoStatusTab
                    mapeamentos={mapeamentos}
                    onAdd={(data) => saveMapeamentoMutation.mutate(data)}
                    onDelete={(id) => deleteMapeamentoMutation.mutate(id)}
                  />
                </TabsContent>

                {/* ABA TESTE */}
                <TabsContent value="teste" className="mt-4">
                  <div className="space-y-4">
                    <Button onClick={handleTestar} disabled={testando} className="gap-2 bg-[#23BE84] hover:bg-[#1da570]">
                      {testando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                      Testar Conexão Agora
                    </Button>
                    {testeResultado && (
                      <div className={`rounded-xl p-4 border ${testeResultado.success ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                        <div className="flex items-center gap-2 mb-2">
                          {testeResultado.success
                            ? <CheckCircle2 className="w-5 h-5 text-green-600" />
                            : <XCircle className="w-5 h-5 text-red-600" />}
                          <p className={`font-semibold ${testeResultado.success ? 'text-green-800' : 'text-red-800'}`}>
                            {testeResultado.success ? 'Conexão estabelecida!' : 'Falha na conexão'}
                          </p>
                        </div>
                        {testeResultado.tempo_ms && (
                          <p className="text-sm text-slate-600 flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5" /> Tempo de resposta: {testeResultado.tempo_ms}ms
                          </p>
                        )}
                        {testeResultado.status_http && (
                          <p className="text-sm text-slate-600">HTTP Status: {testeResultado.status_http}</p>
                        )}
                        {testeResultado.token && (
                          <p className="text-sm text-green-700 mt-1">✅ Token recebido com sucesso</p>
                        )}
                        {testeResultado.error && (
                          <p className="text-sm text-red-700 mt-1 font-mono">{testeResultado.error}</p>
                        )}
                      </div>
                    )}
                  </div>
                </TabsContent>

                {/* ABA LOGS */}
                <TabsContent value="logs" className="mt-4">
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {logs.length === 0 && <p className="text-slate-400 text-sm text-center py-6">Nenhum log encontrado</p>}
                    {logs.map(log => (
                      <div key={log.id} className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg border border-slate-100">
                        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${log.sucesso ? 'bg-green-500' : 'bg-red-500'}`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-slate-700">{log.tipo_acao}</span>
                            {log.status_http && <Badge variant="outline" className="text-xs">{log.status_http}</Badge>}
                          </div>
                          {log.mensagem_erro && <p className="text-xs text-red-600 truncate">{log.mensagem_erro}</p>}
                        </div>
                        <span className="text-xs text-slate-400 flex-shrink-0">
                          {log.executado_em ? format(new Date(log.executado_em), 'dd/MM HH:mm') : '-'}
                        </span>
                      </div>
                    ))}
                  </div>
                </TabsContent>
              </Tabs>
            </div>
          )}
        </div>
      </div>

      {/* Modal de criação/edição */}
      <ConfiguracaoModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        editando={editando}
        bancos={bancos}
        onSave={(data) => saveMutation.mutate(data)}
        isLoading={saveMutation.isPending}
      />

      {/* Confirmar exclusão */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover integração?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteMutation.mutate(deletando?.id)} className="bg-red-600 hover:bg-red-700">
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ---- Sub-componentes ----

function InfoField({ label, value, span = 1, badge }) {
  const colors = { green: 'bg-green-100 text-green-700', yellow: 'bg-yellow-100 text-yellow-700' };
  return (
    <div className={span === 2 ? 'col-span-2' : ''}>
      <p className="text-xs text-slate-400 font-medium uppercase tracking-wide">{label}</p>
      {badge
        ? <span className={`inline-block mt-1 px-2 py-0.5 rounded text-xs font-semibold ${colors[badge] || ''}`}>{value}</span>
        : <p className="text-sm font-medium text-slate-700 mt-0.5">{value || '-'}</p>
      }
    </div>
  );
}

function SwitchField({ label, checked, onChange }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-slate-100">
      <Label className="text-sm text-slate-700">{label}</Label>
      <Switch checked={!!checked} onCheckedChange={onChange} />
    </div>
  );
}

function MapeamentoStatusTab({ mapeamentos, onAdd, onDelete }) {
  const [novoExterno, setNovoExterno] = useState('');
  const [novoInterno, setNovoInterno] = useState('');

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-500">Mapeie os status retornados pela API para o padrão interno.</p>
      <div className="space-y-2">
        {mapeamentos.map(m => (
          <div key={m.id} className="flex items-center gap-3 p-2.5 bg-slate-50 rounded-lg">
            <span className="font-mono text-xs bg-orange-100 text-orange-700 px-2 py-1 rounded">{m.status_externo}</span>
            <span className="text-slate-400">→</span>
            <span className="font-medium text-sm text-slate-700">{m.status_interno}</span>
            <Button variant="ghost" size="icon" className="ml-auto text-red-400 h-7 w-7" onClick={() => onDelete(m.id)}>
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </div>
        ))}
        {mapeamentos.length === 0 && <p className="text-slate-400 text-sm text-center py-4">Nenhum mapeamento configurado</p>}
      </div>
      <div className="flex gap-2 pt-2 border-t">
        <Input placeholder="Status da API (ex: EM_ANALISE)" value={novoExterno} onChange={e => setNovoExterno(e.target.value)} className="font-mono text-sm" />
        <span className="flex items-center text-slate-400">→</span>
        <Input placeholder="Status interno (ex: Em análise)" value={novoInterno} onChange={e => setNovoInterno(e.target.value)} />
        <Button size="sm" className="gap-1" onClick={() => {
          if (!novoExterno || !novoInterno) return;
          onAdd({ status_externo: novoExterno.trim(), status_interno: novoInterno.trim() });
          setNovoExterno(''); setNovoInterno('');
        }}>
          <Plus className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}

function ConfiguracaoModal({ open, onOpenChange, editando, bancos, onSave, isLoading }) {
  const [form, setForm] = useState({});

  useEffect(() => {
    setForm(editando || {
      nome_integracao: '', banco_id: '', base_url: '', ambiente: 'homologacao',
      tipo_integracao: 'API', auth_type: 'Bearer', integracao_ativa: false,
    });
  }, [editando, open]);

  const set = (field) => (val) => setForm(prev => ({ ...prev, [field]: val }));
  const setE = (field) => (e) => setForm(prev => ({ ...prev, [field]: e.target.value }));

  const handleSave = () => {
    if (!form.nome_integracao || !form.banco_id) {
      return;
    }
    const banco = bancos.find(b => b.id === form.banco_id);
    onSave({ ...form, banco_nome: banco?.nome || '' });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editando ? 'Editar Integração' : 'Nova Integração'}</DialogTitle>
          <DialogDescription>Configure os dados de acesso à API do banco</DialogDescription>
        </DialogHeader>
        <div className="space-y-5 pt-2">

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-xs mb-1 block">Banco *</Label>
              <Select value={form.banco_id || ''} onValueChange={set('banco_id')}>
                <SelectTrigger><SelectValue placeholder="Selecione o banco" /></SelectTrigger>
                <SelectContent>{bancos.map(b => <SelectItem key={b.id} value={b.id}>{b.nome}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs mb-1 block">Nome da Integração *</Label>
              <Input value={form.nome_integracao || ''} onChange={setE('nome_integracao')} placeholder="Ex: API Finanto" />
            </div>
            <div className="col-span-2">
              <Label className="text-xs mb-1 block">URL Base *</Label>
              <Input value={form.base_url || ''} onChange={setE('base_url')} placeholder="https://api.banco.com.br/v1" />
            </div>
            <div>
              <Label className="text-xs mb-1 block">Ambiente</Label>
              <Select value={form.ambiente || 'homologacao'} onValueChange={set('ambiente')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="homologacao">Homologação</SelectItem>
                  <SelectItem value="producao">Produção</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs mb-1 block">Tipo de Autenticação</Label>
              <Select value={form.auth_type || 'Bearer'} onValueChange={set('auth_type')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Bearer">Bearer Token</SelectItem>
                  <SelectItem value="ApiKey">API Key</SelectItem>
                  <SelectItem value="Basic">Basic Auth</SelectItem>
                  <SelectItem value="OAuth2">OAuth2</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Aviso sobre URL */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-700">
            <strong>⚠️ URL Base:</strong> informe apenas o domínio raiz, ex: <code>https://finanto.joinbank.com.br</code>. Não inclua caminhos como <code>/sign-in</code> ou <code>/propostas</code>.
          </div>

          {/* Campos condicionais por tipo de auth */}
          {(form.auth_type === 'ApiKey') && (
            <div>
              <Label className="text-xs mb-1 block">API Key</Label>
              <Input value={form.api_key || ''} onChange={setE('api_key')} type="password" placeholder="Chave de API" />
            </div>
          )}
          {(form.auth_type === 'OAuth2') && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs mb-1 block">Client ID</Label>
                <Input value={form.client_id || ''} onChange={setE('client_id')} />
              </div>
              <div>
                <Label className="text-xs mb-1 block">Client Secret</Label>
                <Input value={form.client_secret || ''} onChange={setE('client_secret')} type="password" />
              </div>
            </div>
          )}
          {/* Usuário/senha disponível para todos os tipos que usam login */}
          {(form.auth_type === 'Basic' || form.auth_type === 'Bearer' || form.auth_type === 'ApiKey') && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs mb-1 block">Usuário (login)</Label>
                <Input value={form.username || ''} onChange={setE('username')} placeholder="Usuário da API" />
              </div>
              <div>
                <Label className="text-xs mb-1 block">Senha (login)</Label>
                <Input value={form.password || ''} onChange={setE('password')} type="password" placeholder="Senha da API" />
              </div>
            </div>
          )}

          <div>
            <Label className="text-xs mb-1 block">Observações</Label>
            <Textarea value={form.observacoes || ''} onChange={setE('observacoes')} rows={2} />
          </div>

          <div className="flex items-center justify-between py-2 border-t">
            <Label className="text-sm">Integração Ativa</Label>
            <Switch checked={!!form.integracao_ativa} onCheckedChange={set('integracao_ativa')} />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>Cancelar</Button>
            <Button onClick={handleSave} disabled={isLoading || !form.nome_integracao || !form.banco_id} className="bg-[#1e3a5f] hover:bg-[#2a4a73]">
              {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Salvar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}