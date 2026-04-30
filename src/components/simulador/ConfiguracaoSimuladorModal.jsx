import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import {
  Settings, Save, Loader2, Car, Home, Bike, Package,
  Plus, Trash2, Edit2, Check, X
} from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';

// ── Configuração Seguro Prestamista ──────────────────────────────────────────
const BENS = [
  { key: 'automovel', label: 'Automóvel', icon: Car, color: 'text-blue-600' },
  { key: 'imovel', label: 'Imóvel', icon: Home, color: 'text-green-600' },
  { key: 'motocicleta', label: 'Motocicleta', icon: Bike, color: 'text-orange-600' },
  { key: 'bens_moveis', label: 'Bens Móveis', icon: Package, color: 'text-purple-600' },
];

const TIPOS_CONSORCIO = [
  { value: 'automovel', label: 'Automóvel' },
  { value: 'imovel', label: 'Imóvel' },
  { value: 'motocicleta', label: 'Motocicleta' },
  { value: 'servico', label: 'Serviço' },
];

const TIPOS_PARCELA = [
  { value: 'linear', label: 'Linear' },
  { value: 'gradual', label: 'Gradual' },
  { value: 'decrescente', label: 'Decrescente' },
];

const CHAVE_CONFIG_SEGURO = 'simulador_seguro_prestamista';

const planoVazio = () => ({
  tipo_consorcio: 'automovel',
  codigo_grupo: '',
  nome_plano: '',
  codigo_modalidade: '',
  tipo_parcela: 'linear',
  prazo_total: '',
  percentual_plano: '',
  administradora_id: '',
  administradora_nome: '',
  status: 'ativo',
});

export default function ConfiguracaoSimuladorModal({ open, onOpenChange, empresaId }) {
  const [tab, setTab] = useState('planos');

  // ── Planos ─────────────────────────────────────────────────────────────────
  const [planos, setPlanos] = useState([]);
  const [administradoras, setAdministradoras] = useState([]);
  const [filtroTipo, setFiltroTipo] = useState('automovel');
  const [carregandoPlanos, setCarregandoPlanos] = useState(false);
  const [editando, setEditando] = useState(null); // plano sendo editado (objeto) ou null
  const [novoPlano, setNovoPlano] = useState(null); // null = oculto, objeto = formulário aberto
  const [salvandoPlano, setSalvandoPlano] = useState(false);

  // ── Seguro Prestamista ────────────────────────────────────────────────────
  const [linhas, setLinhas] = useState([]);
  const [configSeguroId, setConfigSeguroId] = useState(null);
  const [carregandoSeguro, setCarregandoSeguro] = useState(false);
  const [salvandoSeguro, setSalvandoSeguro] = useState(false);
  const [expandidos, setExpandidos] = useState({});

  useEffect(() => {
    if (!open || !empresaId) return;
    carregarDados();
  }, [open, empresaId]);

  const carregarDados = async () => {
    setCarregandoPlanos(true);
    setCarregandoSeguro(true);
    try {
      const [admList, planosList, configs] = await Promise.all([
        base44.entities.Administradora.filter({ empresa_id: empresaId, status: 'ativa' }, 'razao_social', 200),
        base44.entities.PlanoSimulador.filter({ empresa_id: empresaId }, 'nome_plano', 500),
        base44.entities.ConfiguracaoSistema.filter({ chave: CHAVE_CONFIG_SEGURO }),
      ]);

      setAdministradoras(admList);
      setPlanos(planosList);

      // Seguro prestamista
      if (configs.length > 0 && configs[0].valor) {
        const dados = JSON.parse(configs[0].valor);
        if (Array.isArray(dados)) {
          setLinhas(dados);
          if (dados.length > 0) setExpandidos({ 0: true });
        } else {
          setLinhas([{ administradora_id: '', administradora_nome: 'Padrão', taxas: dados }]);
          setExpandidos({ 0: true });
        }
        setConfigSeguroId(configs[0].id);
      }
    } catch (e) {
      toast.error('Erro ao carregar dados: ' + e.message);
    } finally {
      setCarregandoPlanos(false);
      setCarregandoSeguro(false);
    }
  };

  // ── Planos - handlers ──────────────────────────────────────────────────────
  const planosFiltrados = planos.filter(p => p.tipo_consorcio === filtroTipo);

  const handleSalvarPlano = async (dados, id) => {
    setSalvandoPlano(true);
    try {
      const adm = administradoras.find(a => a.id === dados.administradora_id);
      const payload = {
        ...dados,
        empresa_id: empresaId,
        administradora_nome: adm?.razao_social || adm?.nome_fantasia || '',
        prazo_total: dados.prazo_total ? Number(dados.prazo_total) : null,
        percentual_plano: dados.percentual_plano ? Number(dados.percentual_plano) : null,
      };

      if (id) {
        await base44.entities.PlanoSimulador.update(id, payload);
        setPlanos(prev => prev.map(p => p.id === id ? { ...p, ...payload } : p));
        toast.success('Plano atualizado!');
      } else {
        const criado = await base44.entities.PlanoSimulador.create(payload);
        setPlanos(prev => [...prev, criado]);
        toast.success('Plano criado!');
      }
      setEditando(null);
      setNovoPlano(null);
    } catch (e) {
      toast.error('Erro ao salvar: ' + e.message);
    } finally {
      setSalvandoPlano(false);
    }
  };

  const handleExcluirPlano = async (id) => {
    if (!confirm('Excluir este plano?')) return;
    try {
      await base44.entities.PlanoSimulador.delete(id);
      setPlanos(prev => prev.filter(p => p.id !== id));
      toast.success('Plano excluído!');
    } catch (e) {
      toast.error('Erro ao excluir: ' + e.message);
    }
  };

  const handleToggleStatus = async (plano) => {
    const novoStatus = plano.status === 'ativo' ? 'inativo' : 'ativo';
    try {
      await base44.entities.PlanoSimulador.update(plano.id, { status: novoStatus });
      setPlanos(prev => prev.map(p => p.id === plano.id ? { ...p, status: novoStatus } : p));
    } catch (e) {
      toast.error('Erro: ' + e.message);
    }
  };

  // ── Seguro Prestamista - handlers ──────────────────────────────────────────
  const adicionarLinhaSeguro = () => {
    const novoIdx = linhas.length;
    setLinhas(prev => [...prev, {
      administradora_id: '', administradora_nome: '',
      taxas: { automovel: '', imovel: '', motocicleta: '', bens_moveis: '' }
    }]);
    setExpandidos(prev => ({ ...prev, [novoIdx]: true }));
  };

  const removerLinhaSeguro = (idx) => {
    setLinhas(prev => prev.filter((_, i) => i !== idx));
  };

  const setAdmSeguro = (idx, admId) => {
    const adm = administradoras.find(a => a.id === admId);
    setLinhas(prev => prev.map((l, i) => i === idx
      ? { ...l, administradora_id: admId, administradora_nome: adm?.razao_social || '' }
      : l
    ));
  };

  const setTaxa = (idx, bem, valor) => {
    setLinhas(prev => prev.map((l, i) => i === idx
      ? { ...l, taxas: { ...l.taxas, [bem]: valor } }
      : l
    ));
  };

  const handleSalvarSeguro = async () => {
    setSalvandoSeguro(true);
    try {
      const valor = JSON.stringify(linhas);
      if (configSeguroId) {
        await base44.entities.ConfiguracaoSistema.update(configSeguroId, { valor });
      } else {
        const nova = await base44.entities.ConfiguracaoSistema.create({
          chave: CHAVE_CONFIG_SEGURO,
          valor,
          descricao: 'Taxas de seguro prestamista por administradora e tipo de bem (% ao mês)',
        });
        setConfigSeguroId(nova.id);
      }
      toast.success('Configurações salvas!');
    } catch (e) {
      toast.error('Erro ao salvar: ' + e.message);
    } finally {
      setSalvandoSeguro(false);
    }
  };

  const tipoBadgeColor = { linear: 'bg-blue-100 text-blue-700', gradual: 'bg-amber-100 text-amber-700', decrescente: 'bg-purple-100 text-purple-700' };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-slate-600" />
            Configuração do Simulador
          </DialogTitle>
        </DialogHeader>

        <Tabs value={tab} onValueChange={setTab} className="flex-1 overflow-hidden flex flex-col">
          <TabsList className="grid grid-cols-2 w-full">
            <TabsTrigger value="planos">📋 Planos</TabsTrigger>
            <TabsTrigger value="seguro">🛡️ Seguro Prestamista</TabsTrigger>
          </TabsList>

          {/* ── ABA PLANOS ─────────────────────────────────────────────── */}
          <TabsContent value="planos" className="flex-1 overflow-y-auto mt-2 space-y-3">
            {/* Filtro tipo */}
            <div className="flex gap-2 flex-wrap">
              {TIPOS_CONSORCIO.map(t => (
                <button
                  key={t.value}
                  onClick={() => setFiltroTipo(t.value)}
                  className={`px-3 py-1 rounded-full text-sm font-medium transition-all ${
                    filtroTipo === t.value
                      ? 'bg-slate-800 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {t.label}
                </button>
              ))}
              <Button size="sm" variant="outline" onClick={() => setNovoPlano({ ...planoVazio(), tipo_consorcio: filtroTipo })} className="gap-1 h-7 text-xs ml-auto">
                <Plus className="w-3.5 h-3.5" /> Novo Plano
              </Button>
            </div>

            {/* Formulário Novo Plano */}
            {novoPlano && (
              <PlanoForm
                dados={novoPlano}
                onChange={setNovoPlano}
                administradoras={administradoras}
                onSalvar={() => handleSalvarPlano(novoPlano, null)}
                onCancelar={() => setNovoPlano(null)}
                salvando={salvandoPlano}
              />
            )}

            {/* Lista de planos */}
            {carregandoPlanos ? (
              <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>
            ) : planosFiltrados.length === 0 ? (
              <div className="text-center py-8 text-slate-400 text-sm border-2 border-dashed rounded-lg">
                Nenhum plano cadastrado para este tipo. Clique em "Novo Plano".
              </div>
            ) : (
              <div className="space-y-2">
                {planosFiltrados.map(plano => (
                  <div key={plano.id}>
                    {editando?.id === plano.id ? (
                      <PlanoForm
                        dados={editando}
                        onChange={setEditando}
                        administradoras={administradoras}
                        onSalvar={() => handleSalvarPlano(editando, plano.id)}
                        onCancelar={() => setEditando(null)}
                        salvando={salvandoPlano}
                      />
                    ) : (
                      <div className="flex items-center gap-2 p-2.5 border rounded-lg bg-white hover:bg-slate-50 group">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-semibold text-slate-800 truncate">
                              {plano.codigo_grupo} - {plano.nome_plano}
                            </span>
                            <span className="text-xs text-slate-400">/ {plano.codigo_modalidade}</span>
                            <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${tipoBadgeColor[plano.tipo_parcela] || 'bg-slate-100 text-slate-600'}`}>
                              {TIPOS_PARCELA.find(t => t.value === plano.tipo_parcela)?.label}
                            </span>
                            {plano.percentual_plano && (
                              <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded">{plano.percentual_plano}%</span>
                            )}
                            {plano.prazo_total && (
                              <span className="text-xs text-slate-500">{plano.prazo_total}m</span>
                            )}
                          </div>
                          {plano.administradora_nome && (
                            <p className="text-xs text-slate-400 mt-0.5">{plano.administradora_nome}</p>
                          )}
                        </div>
                        <button
                          onClick={() => handleToggleStatus(plano)}
                          className={`text-xs px-2 py-0.5 rounded font-medium ${plano.status === 'ativo' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}
                        >
                          {plano.status === 'ativo' ? 'Ativo' : 'Inativo'}
                        </button>
                        <button onClick={() => setEditando({ ...plano })} className="text-slate-400 hover:text-blue-600 p-1">
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => handleExcluirPlano(plano.id)} className="text-slate-300 hover:text-red-500 p-1">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          {/* ── ABA SEGURO PRESTAMISTA ─────────────────────────────────── */}
          <TabsContent value="seguro" className="flex-1 overflow-y-auto mt-2 space-y-3">
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
              <strong>Seguro Prestamista:</strong> taxa mensal cobrada sobre a carta de crédito. Reduz a parcela final quando o prazo é diminuído via lance.
            </div>

            {carregandoSeguro ? (
              <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Taxas por Administradora</p>
                  <Button size="sm" variant="outline" onClick={adicionarLinhaSeguro} className="gap-1.5 h-7 text-xs">
                    <Plus className="w-3.5 h-3.5" /> Adicionar
                  </Button>
                </div>

                {linhas.length === 0 && (
                  <div className="text-center py-8 text-slate-400 text-sm border-2 border-dashed rounded-lg">
                    Nenhuma configuração. Clique em "Adicionar".
                  </div>
                )}

                {linhas.map((linha, idx) => (
                  <div key={idx} className="border rounded-lg overflow-hidden">
                    <div className="flex items-center gap-2 px-3 py-2 bg-slate-50">
                      <div className="flex-1">
                        <Select value={linha.administradora_id || ''} onValueChange={v => setAdmSeguro(idx, v)}>
                          <SelectTrigger className="h-8 text-sm bg-white border border-slate-200">
                            <SelectValue placeholder="Selecionar Administradora..." />
                          </SelectTrigger>
                          <SelectContent className="bg-white border-slate-200 text-slate-900">
                            {administradoras.map(a => (
                              <SelectItem key={a.id} value={a.id} className="text-slate-900 focus:bg-slate-100 focus:text-slate-900">{a.razao_social || a.nome_fantasia}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <button onClick={() => removerLinhaSeguro(idx)} className="text-red-400 hover:text-red-600 p-0.5">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div className="divide-y">
                      {BENS.map(({ key, label, icon: Icon, color }) => (
                        <div key={key} className="flex items-center gap-3 px-3 py-2">
                          <Icon className={`w-4 h-4 ${color} flex-shrink-0`} />
                          <span className="flex-1 text-sm text-slate-700">{label}</span>
                          <div className="flex items-center gap-1">
                            <Input
                              type="number" step="0.001" min="0" max="10"
                              value={linha.taxas?.[key] || ''}
                              onChange={e => setTaxa(idx, key, e.target.value)}
                              className="w-20 h-7 text-right text-sm"
                              placeholder="0,000"
                            />
                            <span className="text-xs text-slate-500 w-4">%</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}

                <Button onClick={handleSalvarSeguro} disabled={salvandoSeguro} className="w-full gap-1.5 bg-slate-800 hover:bg-slate-900">
                  {salvandoSeguro ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Salvar Configurações
                </Button>
              </>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

// ── Sub-componente: Formulário de Plano ────────────────────────────────────
function PlanoForm({ dados, onChange, administradoras, onSalvar, onCancelar, salvando }) {
  const set = (key, val) => onChange(prev => ({ ...prev, [key]: val }));

  return (
    <div className="border-2 border-blue-200 rounded-lg p-3 bg-blue-50 space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-xs">Tipo do Consórcio *</Label>
          <Select value={dados.tipo_consorcio} onValueChange={v => set('tipo_consorcio', v)}>
            <SelectTrigger className="h-8 text-xs mt-0.5"><SelectValue /></SelectTrigger>
            <SelectContent className="bg-white border-slate-200">
              {[{ value: 'automovel', label: 'Automóvel' }, { value: 'imovel', label: 'Imóvel' }, { value: 'motocicleta', label: 'Motocicleta' }, { value: 'servico', label: 'Serviço' }].map(t =>
                <SelectItem key={t.value} value={t.value} className="text-slate-900 focus:bg-slate-100">{t.label}</SelectItem>
              )}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Tipo de Parcela *</Label>
          <Select value={dados.tipo_parcela} onValueChange={v => set('tipo_parcela', v)}>
            <SelectTrigger className="h-8 text-xs mt-0.5"><SelectValue /></SelectTrigger>
            <SelectContent className="bg-white border-slate-200">
              <SelectItem value="linear" className="text-slate-900 focus:bg-slate-100">Linear</SelectItem>
              <SelectItem value="gradual" className="text-slate-900 focus:bg-slate-100">Gradual</SelectItem>
              <SelectItem value="decrescente" className="text-slate-900 focus:bg-slate-100">Decrescente</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Código do Grupo *</Label>
          <Input value={dados.codigo_grupo} onChange={e => set('codigo_grupo', e.target.value)} className="h-8 text-xs mt-0.5" placeholder="Ex: 3000" />
        </div>
        <div>
          <Label className="text-xs">Código da Modalidade *</Label>
          <Input value={dados.codigo_modalidade} onChange={e => set('codigo_modalidade', e.target.value)} className="h-8 text-xs mt-0.5" placeholder="Ex: 61" />
        </div>
        <div className="col-span-2">
          <Label className="text-xs">Nome do Plano *</Label>
          <Input value={dados.nome_plano} onChange={e => set('nome_plano', e.target.value)} className="h-8 text-xs mt-0.5" placeholder="Ex: PLANO EXCLUSIVO 70%" />
        </div>
        <div>
          <Label className="text-xs">Prazo Total (meses)</Label>
          <Input type="number" value={dados.prazo_total} onChange={e => set('prazo_total', e.target.value)} className="h-8 text-xs mt-0.5" placeholder="Ex: 160" />
        </div>
        <div>
          <Label className="text-xs">Percentual do Plano (%)</Label>
          <Input type="number" value={dados.percentual_plano} onChange={e => set('percentual_plano', e.target.value)} className="h-8 text-xs mt-0.5" placeholder="Ex: 50" />
        </div>
        <div className="col-span-2">
          <Label className="text-xs">Administradora</Label>
          <Select value={dados.administradora_id || ''} onValueChange={v => set('administradora_id', v)}>
            <SelectTrigger className="h-8 text-xs mt-0.5"><SelectValue placeholder="Selecionar (opcional)..." /></SelectTrigger>
            <SelectContent className="bg-white border-slate-200">
              {administradoras.map(a => <SelectItem key={a.id} value={a.id} className="text-slate-900 focus:bg-slate-100">{a.razao_social || a.nome_fantasia}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="flex gap-2 justify-end pt-1">
        <Button size="sm" variant="outline" onClick={onCancelar} className="h-7 text-xs gap-1">
          <X className="w-3 h-3" /> Cancelar
        </Button>
        <Button size="sm" onClick={onSalvar} disabled={salvando} className="h-7 text-xs gap-1 bg-blue-600 hover:bg-blue-700">
          {salvando ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
          Salvar
        </Button>
      </div>
    </div>
  );
}