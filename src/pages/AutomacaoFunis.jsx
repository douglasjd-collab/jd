import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Pencil, Trash2, Zap, Clock, MessageCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { toast } from 'sonner';

export default function AutomacaoFunis() {
  const [currentUser, setCurrentUser] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editando, setEditando] = useState(null);
  const [expandedFunil, setExpandedFunil] = useState(null);
  const [formData, setFormData] = useState({
    nome: '', funil: '', etapa_id: '', etapa_nome: '', tempo_disparo: 0,
    tipo_tempo: 'dias', canal: 'whatsapp', mensagem: '', horario_envio: '08:00',
    parar_se_responder: true, etapa_resposta_id: '', etapa_resposta_nome: '',
    parar_se_mudar_etapa: true, ordem: 1, ativo: true
  });

  const queryClient = useQueryClient();

  useEffect(() => {
    base44.auth.me().then(async (user) => {
      if (!user) return;
      if (user.role !== 'super_admin') {
        const colabs = await base44.entities.Colaborador.filter({ user_id: user.id });
        const colab = colabs.find(c => c.status === 'ativo') || colabs[0];
        setCurrentUser({ ...user, empresa_id: colab?.empresa_id || user.empresa_id, perfil: colab?.perfil || 'admin' });
      } else {
        setCurrentUser({ ...user, perfil: 'super_admin' });
      }
    });
  }, []);

  const { data: etapas = [] } = useQuery({
    queryKey: ['etapas-funil'],
    queryFn: () => base44.entities.EtapaFunil.list('ordem', 500),
  });

  const { data: automacoes = [] } = useQuery({
    queryKey: ['automacoes-funil', currentUser?.empresa_id],
    enabled: !!currentUser,
    queryFn: () => base44.entities.AutomacaoFunil.filter({ empresa_id: currentUser.empresa_id }, 'ordem'),
  });

  const { data: historico = [] } = useQuery({
    queryKey: ['historico-automacao', currentUser?.empresa_id],
    enabled: !!currentUser,
    queryFn: () => base44.entities.HistoricoAutomacao.filter({ empresa_id: currentUser.empresa_id }, '-enviado_em', 100),
  });

  const salvarMutation = useMutation({
    mutationFn: async (data) => {
      const payload = { ...data, empresa_id: currentUser.empresa_id };
      if (editando) return base44.entities.AutomacaoFunil.update(editando.id, payload);
      return base44.entities.AutomacaoFunil.create(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['automacoes-funil'] });
      setFormOpen(false);
      setEditando(null);
      resetForm();
      toast.success(editando ? 'Automação atualizada!' : 'Automação criada!');
    },
    onError: (e) => toast.error('Erro: ' + e.message),
  });

  const excluirMutation = useMutation({
    mutationFn: (id) => base44.entities.AutomacaoFunil.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['automacoes-funil'] });
      toast.success('Automação excluída!');
    },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, ativo }) => base44.entities.AutomacaoFunil.update(id, { ativo }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['automacoes-funil'] }),
  });

  const resetForm = () => setFormData({
    nome: '', funil: '', etapa_id: '', etapa_nome: '', tempo_disparo: 0,
    tipo_tempo: 'dias', canal: 'whatsapp', mensagem: '', horario_envio: '08:00',
    parar_se_responder: true, etapa_resposta_id: '', etapa_resposta_nome: '',
    parar_se_mudar_etapa: true, ordem: 1, ativo: true
  });

  const abrirEditar = (auto) => {
    setEditando(auto);
    setFormData({
      nome: auto.nome, funil: auto.funil, etapa_id: auto.etapa_id,
      etapa_nome: auto.etapa_nome, tempo_disparo: auto.tempo_disparo,
      tipo_tempo: auto.tipo_tempo, canal: auto.canal, mensagem: auto.mensagem,
      horario_envio: auto.horario_envio || '08:00',
      parar_se_responder: auto.parar_se_responder ?? true,
      etapa_resposta_id: auto.etapa_resposta_id || '',
      etapa_resposta_nome: auto.etapa_resposta_nome || '',
      parar_se_mudar_etapa: auto.parar_se_mudar_etapa ?? true,
      ordem: auto.ordem, ativo: auto.ativo
    });
    setFormOpen(true);
  };

  // Agrupado por funil > etapa
  const produtosDasEtapas = [...new Set(etapas.map(e => e.produto).filter(Boolean))];
  const todosOsFunis = [
    { value: 'consorcio', label: 'Consórcio' },
    { value: 'emprestimo', label: 'Empréstimo Consignado' },
    ...produtosDasEtapas
      .filter(p => p !== 'consorcio' && p !== 'emprestimo')
      .map(p => ({ value: p, label: p.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) })),
  ];

  const etapasFiltradas = etapas.filter(e => e.produto === formData.funil);

  // Agrupar automações por funil
  const automacoesPorFunil = automacoes.reduce((acc, a) => {
    if (!acc[a.funil]) acc[a.funil] = [];
    acc[a.funil].push(a);
    return acc;
  }, {});

  const labelFunil = (slug) => todosOsFunis.find(f => f.value === slug)?.label || slug;
  const labelTempo = (auto) => auto.tempo_disparo === 0 ? 'Imediato' : `Após ${auto.tempo_disparo} ${auto.tipo_tempo}`;

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">⚙️ Automação de Funis</h1>
          <p className="text-slate-500 text-sm mt-1">Configure mensagens automáticas por etapa do funil</p>
        </div>
        <Button onClick={() => { resetForm(); setEditando(null); setFormOpen(true); }} className="bg-[#1e3a5f] hover:bg-[#2a4a73] gap-2">
          <Plus className="w-4 h-4" /> Nova Automação
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="p-4 text-center">
          <p className="text-2xl font-bold text-[#1e3a5f]">{automacoes.length}</p>
          <p className="text-sm text-slate-500">Automações criadas</p>
        </Card>
        <Card className="p-4 text-center">
          <p className="text-2xl font-bold text-green-600">{automacoes.filter(a => a.ativo).length}</p>
          <p className="text-sm text-slate-500">Ativas</p>
        </Card>
        <Card className="p-4 text-center">
          <p className="text-2xl font-bold text-blue-600">{historico.length}</p>
          <p className="text-sm text-slate-500">Disparos recentes</p>
        </Card>
      </div>

      {/* Lista por funil */}
      {Object.keys(automacoesPorFunil).length === 0 && (
        <Card className="p-12 text-center">
          <Zap className="w-12 h-12 text-slate-300 mx-auto mb-4" />
          <p className="text-slate-500 text-lg font-medium">Nenhuma automação criada ainda</p>
          <p className="text-slate-400 text-sm mt-1">Crie sua primeira automação para começar a nutrir leads automaticamente</p>
        </Card>
      )}

      {Object.entries(automacoesPorFunil).map(([funil, autos]) => (
        <Card key={funil} className="overflow-hidden">
          <button
            className="w-full flex items-center justify-between p-4 hover:bg-slate-50 transition-colors"
            onClick={() => setExpandedFunil(expandedFunil === funil ? null : funil)}
          >
            <div className="flex items-center gap-3">
              <span className="text-lg">🗂️</span>
              <div className="text-left">
                <p className="font-semibold text-slate-800">{labelFunil(funil)}</p>
                <p className="text-xs text-slate-500">{autos.length} automação{autos.length !== 1 ? 'ões' : ''}</p>
              </div>
            </div>
            {expandedFunil === funil ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
          </button>

          {expandedFunil === funil && (
            <div className="border-t divide-y">
              {autos.sort((a, b) => (a.ordem || 0) - (b.ordem || 0)).map((auto) => (
                <div key={auto.id} className="p-4 flex items-start gap-4">
                  <div className="flex-shrink-0 w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                    <span className="text-sm font-bold text-blue-700">{auto.ordem || '?'}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="font-medium text-slate-800">{auto.nome}</p>
                      <Badge variant={auto.ativo ? 'default' : 'secondary'} className={auto.ativo ? 'bg-green-100 text-green-700 text-xs' : 'text-xs'}>
                        {auto.ativo ? 'Ativa' : 'Inativa'}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-slate-500 mb-2">
                      <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {labelTempo(auto)}</span>
                      <span className="flex items-center gap-1"><MessageCircle className="w-3 h-3" /> {auto.etapa_nome || auto.etapa_id}</span>
                      <span>🕐 {auto.horario_envio || '08:00'}</span>
                    </div>
                    <p className="text-sm text-slate-600 bg-slate-50 rounded p-2 line-clamp-2">{auto.mensagem}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Switch
                      checked={auto.ativo}
                      onCheckedChange={(v) => toggleMutation.mutate({ id: auto.id, ativo: v })}
                    />
                    <Button variant="ghost" size="icon" onClick={() => abrirEditar(auto)}>
                      <Pencil className="w-4 h-4 text-slate-500" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => {
                      if (confirm('Excluir esta automação?')) excluirMutation.mutate(auto.id);
                    }}>
                      <Trash2 className="w-4 h-4 text-red-500" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      ))}

      {/* Histórico recente */}
      {historico.length > 0 && (
        <Card className="p-4">
          <h3 className="font-semibold text-slate-800 mb-3">📋 Últimos Disparos</h3>
          <div className="space-y-2">
            {historico.slice(0, 10).map((h) => (
              <div key={h.id} className="flex items-center justify-between text-sm py-2 border-b last:border-0">
                <div>
                  <span className="font-medium">{h.oportunidade_titulo}</span>
                  <span className="text-slate-400 ml-2">→ {h.automacao_nome}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className={
                    h.status === 'enviado' ? 'text-green-600 border-green-300' :
                    h.status === 'erro' ? 'text-red-600 border-red-300' : 'text-slate-500'
                  }>
                    {h.status}
                  </Badge>
                  <span className="text-slate-400 text-xs">{h.enviado_em ? new Date(h.enviado_em).toLocaleString('pt-BR') : ''}</span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Modal Form */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editando ? 'Editar Automação' : 'Nova Automação'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Nome da Automação *</Label>
                <Input value={formData.nome} onChange={(e) => setFormData({ ...formData, nome: e.target.value })} placeholder="Ex: Follow-up Dia 2" />
              </div>
              <div>
                <Label>Ordem na Sequência</Label>
                <Input type="number" min="1" value={formData.ordem} onChange={(e) => setFormData({ ...formData, ordem: parseInt(e.target.value) || 1 })} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Funil *</Label>
                <Select value={formData.funil} onValueChange={(v) => setFormData({ ...formData, funil: v, etapa_id: '', etapa_nome: '' })}>
                  <SelectTrigger><SelectValue placeholder="Selecione o funil" /></SelectTrigger>
                  <SelectContent>
                    {todosOsFunis.map(f => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Etapa *</Label>
                <Select
                  value={formData.etapa_id}
                  disabled={!formData.funil}
                  onValueChange={(v) => {
                    const etapa = etapas.find(e => e.id === v);
                    setFormData({ ...formData, etapa_id: v, etapa_nome: etapa?.nome || '' });
                  }}
                >
                  <SelectTrigger><SelectValue placeholder="Selecione a etapa" /></SelectTrigger>
                  <SelectContent>
                    {etapasFiltradas.map(e => <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label>Tempo para Disparar</Label>
                <Input type="number" min="0" value={formData.tempo_disparo} onChange={(e) => setFormData({ ...formData, tempo_disparo: parseInt(e.target.value) || 0 })} />
                <p className="text-xs text-slate-400 mt-1">0 = imediato</p>
              </div>
              <div>
                <Label>Unidade</Label>
                <Select value={formData.tipo_tempo} onValueChange={(v) => setFormData({ ...formData, tipo_tempo: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="minutos">Minutos</SelectItem>
                    <SelectItem value="horas">Horas</SelectItem>
                    <SelectItem value="dias">Dias</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Horário de Envio</Label>
                <Input type="time" value={formData.horario_envio} onChange={(e) => setFormData({ ...formData, horario_envio: e.target.value })} />
              </div>
            </div>

            <div>
              <Label>Mensagem * <span className="text-slate-400 font-normal text-xs">(use {'{{nome}}'}, {'{{vendedor}}'})</span></Label>
              <Textarea
                rows={6}
                value={formData.mensagem}
                onChange={(e) => setFormData({ ...formData, mensagem: e.target.value })}
                placeholder="Olá, {{nome}}! Estou entrando em contato sobre seu seguro..."
              />
            </div>

            <div className="space-y-3 p-3 bg-slate-50 rounded-lg">
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-2">
                  <Switch checked={formData.parar_se_responder} onCheckedChange={(v) => setFormData({ ...formData, parar_se_responder: v, etapa_resposta_id: '', etapa_resposta_nome: '' })} />
                  <Label className="font-normal cursor-pointer">Parar se cliente responder</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={formData.parar_se_mudar_etapa} onCheckedChange={(v) => setFormData({ ...formData, parar_se_mudar_etapa: v })} />
                  <Label className="font-normal cursor-pointer">Parar se mudar de etapa</Label>
                </div>
              </div>
              {formData.parar_se_responder && (
                <div>
                  <Label className="text-sm">Mover para etapa ao responder <span className="text-slate-400 font-normal">(opcional)</span></Label>
                  <Select
                    value={formData.etapa_resposta_id || 'nenhuma'}
                    onValueChange={(v) => {
                      if (v === 'nenhuma') {
                        setFormData({ ...formData, etapa_resposta_id: '', etapa_resposta_nome: '' });
                      } else {
                        const etapa = etapas.find(e => e.id === v);
                        setFormData({ ...formData, etapa_resposta_id: v, etapa_resposta_nome: etapa?.nome || '' });
                      }
                    }}
                  >
                    <SelectTrigger className="bg-white"><SelectValue placeholder="Não mover de etapa" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="nenhuma">Não mover de etapa</SelectItem>
                      {etapasFiltradas.filter(e => e.id !== formData.etapa_id).map(e => (
                        <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Switch checked={formData.ativo} onCheckedChange={(v) => setFormData({ ...formData, ativo: v })} />
              <Label className="font-normal cursor-pointer">Automação ativa</Label>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button variant="outline" onClick={() => setFormOpen(false)}>Cancelar</Button>
              <Button
                onClick={() => {
                  if (!formData.nome || !formData.funil || !formData.etapa_id || !formData.mensagem) {
                    toast.error('Preencha todos os campos obrigatórios'); return;
                  }
                  salvarMutation.mutate(formData);
                }}
                disabled={salvarMutation.isPending}
                className="bg-[#1e3a5f] hover:bg-[#2a4a73]"
              >
                {editando ? 'Salvar' : 'Criar Automação'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}