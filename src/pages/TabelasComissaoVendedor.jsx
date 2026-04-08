import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Loader2, Plus, Pencil, Trash2, Users, Star, LayersIcon, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

const TIPO_OP_OPTIONS = [
  { value: '', label: 'Todos' },
  { value: 'NOVO', label: 'Novo' },
  { value: 'REFINANCIAMENTO', label: 'Refinanciamento' },
  { value: 'PORTABILIDADE_PURA', label: 'Portabilidade Pura' },
  { value: 'REFIN_PORTABILIDADE', label: 'Refin + Portabilidade' },
];

const fmt = (v) => v != null ? `${Number(v).toFixed(2)}%` : '-';

export default function TabelasComissaoVendedor() {
  const queryClient = useQueryClient();
  const [user, setUser] = useState(null);
  const [empresaId, setEmpresaId] = useState(null);
  const [tab, setTab] = useState('niveis');
  const [deleteTarget, setDeleteTarget] = useState(null); // { type, id }

  // Modals
  const [modalNivel, setModalNivel] = useState(false);
  const [editandoNivel, setEditandoNivel] = useState(null);
  const [formNivel, setFormNivel] = useState({ nome: '', descricao: '', cor: '#6366f1' });

  const [modalTabelaNivel, setModalTabelaNivel] = useState(false);
  const [editandoTabelaNivel, setEditandoTabelaNivel] = useState(null);
  const [formTabelaNivel, setFormTabelaNivel] = useState({
    nivel_id: '', banco: '', convenio_id: '', tipo_operacao: '',
    prazo_min: '0', prazo_max: '999', tipo_comissao: 'percentual',
    percentual_vendedor: '', valor_fixo_vendedor: ''
  });

  const [modalVendedor, setModalVendedor] = useState(false);
  const [editandoVendedor, setEditandoVendedor] = useState(null);
  const [formVendedor, setFormVendedor] = useState({
    vendedor_id: '', banco: '', convenio_id: '', tipo_operacao: '',
    prazo_min: '0', prazo_max: '999', tipo_comissao: 'percentual',
    percentual_vendedor: '', valor_fixo_vendedor: '',
    prioridade: '1', vigencia_inicio: '', vigencia_fim: '', observacoes: ''
  });

  useEffect(() => { loadUser(); }, []);

  const loadUser = async () => {
    const me = await base44.auth.me();
    setUser(me);
    if (me.role === 'super_admin' || me.perfil === 'super_admin') {
      const empresas = await base44.entities.Empresa.filter({ status: 'ativa' });
      if (empresas.length > 0) setEmpresaId(empresas[0].id);
    } else {
      const colabs = await base44.entities.Colaborador.filter({ user_id: me.id, status: 'ativo' });
      if (colabs.length > 0) setEmpresaId(colabs[0].empresa_id);
    }
  };

  const { data: niveis = [], isLoading: loadNiveis } = useQuery({
    queryKey: ['niveis-comissao', empresaId],
    enabled: !!empresaId,
    queryFn: () => base44.entities.NivelComissaoVendedor.filter({ empresa_id: empresaId, ativo: true })
  });

  const { data: tabelasNivel = [], isLoading: loadTabelasNivel } = useQuery({
    queryKey: ['tabelas-comissao-nivel', empresaId],
    enabled: !!empresaId,
    queryFn: () => base44.entities.TabelaComissaoNivel.filter({ empresa_id: empresaId, ativo: true })
  });

  const { data: tabelasVendedor = [], isLoading: loadTabelasVendedor } = useQuery({
    queryKey: ['tabelas-comissao-vendedor', empresaId],
    enabled: !!empresaId,
    queryFn: () => base44.entities.TabelaComissaoVendedor.filter({ empresa_id: empresaId, ativo: true }, 'vendedor_nome')
  });

  const { data: convenios = [] } = useQuery({
    queryKey: ['convenios', empresaId],
    enabled: !!empresaId,
    queryFn: () => base44.entities.Convenio.filter({ empresa_id: empresaId, ativo: true })
  });

  const { data: bancos = [] } = useQuery({
    queryKey: ['bancos', empresaId],
    enabled: !!empresaId,
    queryFn: () => base44.entities.Banco.filter({ empresa_id: empresaId, ativo: true })
  });

  const { data: vendedores = [] } = useQuery({
    queryKey: ['colaboradores-vendedores', empresaId],
    enabled: !!empresaId,
    queryFn: () => base44.entities.Colaborador.filter({ empresa_id: empresaId, status: 'ativo' })
  });

  // ---- MUTATIONS NÍVEIS ----
  const criarNivel = useMutation({
    mutationFn: (d) => base44.entities.NivelComissaoVendedor.create({ empresa_id: empresaId, ...d, ativo: true }),
    onSuccess: () => { queryClient.invalidateQueries(['niveis-comissao', empresaId]); toast.success('Nível criado!'); setModalNivel(false); }
  });
  const editarNivel = useMutation({
    mutationFn: ({ id, d }) => base44.entities.NivelComissaoVendedor.update(id, d),
    onSuccess: () => { queryClient.invalidateQueries(['niveis-comissao', empresaId]); toast.success('Nível atualizado!'); setModalNivel(false); }
  });
  const deletarNivel = useMutation({
    mutationFn: (id) => base44.entities.NivelComissaoVendedor.update(id, { ativo: false }),
    onSuccess: () => { queryClient.invalidateQueries(['niveis-comissao', empresaId]); toast.success('Nível removido!'); setDeleteTarget(null); }
  });

  // ---- MUTATIONS TABELA NÍVEL ----
  const criarTabelaNivel = useMutation({
    mutationFn: (d) => {
      const nivel = niveis.find(n => n.id === d.nivel_id);
      const conv = convenios.find(c => c.id === d.convenio_id);
      return base44.entities.TabelaComissaoNivel.create({
        empresa_id: empresaId,
        nivel_id: d.nivel_id,
        nivel_nome: nivel?.nome || '',
        banco: d.banco || '',
        convenio_id: d.convenio_id || null,
        convenio_nome: conv?.nome || '',
        tipo_operacao: d.tipo_operacao || '',
        prazo_min: Number(d.prazo_min) || 0,
        prazo_max: Number(d.prazo_max) || 999,
        tipo_comissao: d.tipo_comissao,
        percentual_vendedor: d.tipo_comissao === 'percentual' ? parseFloat(d.percentual_vendedor) || 0 : 0,
        valor_fixo_vendedor: d.tipo_comissao === 'fixo' ? parseFloat(d.valor_fixo_vendedor) || 0 : 0,
        ativo: true
      });
    },
    onSuccess: () => { queryClient.invalidateQueries(['tabelas-comissao-nivel', empresaId]); toast.success('Regra de nível criada!'); setModalTabelaNivel(false); }
  });
  const editarTabelaNivel = useMutation({
    mutationFn: ({ id, d }) => {
      const nivel = niveis.find(n => n.id === d.nivel_id);
      const conv = convenios.find(c => c.id === d.convenio_id);
      return base44.entities.TabelaComissaoNivel.update(id, {
        nivel_id: d.nivel_id,
        nivel_nome: nivel?.nome || '',
        banco: d.banco || '',
        convenio_id: d.convenio_id || null,
        convenio_nome: conv?.nome || '',
        tipo_operacao: d.tipo_operacao || '',
        prazo_min: Number(d.prazo_min) || 0,
        prazo_max: Number(d.prazo_max) || 999,
        tipo_comissao: d.tipo_comissao,
        percentual_vendedor: d.tipo_comissao === 'percentual' ? parseFloat(d.percentual_vendedor) || 0 : 0,
        valor_fixo_vendedor: d.tipo_comissao === 'fixo' ? parseFloat(d.valor_fixo_vendedor) || 0 : 0,
      });
    },
    onSuccess: () => { queryClient.invalidateQueries(['tabelas-comissao-nivel', empresaId]); toast.success('Regra atualizada!'); setModalTabelaNivel(false); }
  });
  const deletarTabelaNivel = useMutation({
    mutationFn: (id) => base44.entities.TabelaComissaoNivel.update(id, { ativo: false }),
    onSuccess: () => { queryClient.invalidateQueries(['tabelas-comissao-nivel', empresaId]); toast.success('Regra removida!'); setDeleteTarget(null); }
  });

  // ---- MUTATIONS TABELA VENDEDOR ----
  const criarTabelaVendedor = useMutation({
    mutationFn: (d) => {
      const vend = vendedores.find(v => v.id === d.vendedor_id);
      const conv = convenios.find(c => c.id === d.convenio_id);
      return base44.entities.TabelaComissaoVendedor.create({
        empresa_id: empresaId,
        vendedor_id: d.vendedor_id,
        vendedor_nome: vend?.nome || '',
        banco: d.banco || '',
        convenio_id: d.convenio_id || null,
        convenio_nome: conv?.nome || '',
        tipo_operacao: d.tipo_operacao || '',
        prazo_min: Number(d.prazo_min) || 0,
        prazo_max: Number(d.prazo_max) || 999,
        tipo_comissao: d.tipo_comissao,
        percentual_vendedor: d.tipo_comissao === 'percentual' ? parseFloat(d.percentual_vendedor) || 0 : 0,
        valor_fixo_vendedor: d.tipo_comissao === 'fixo' ? parseFloat(d.valor_fixo_vendedor) || 0 : 0,
        prioridade: Number(d.prioridade) || 1,
        vigencia_inicio: d.vigencia_inicio || null,
        vigencia_fim: d.vigencia_fim || null,
        observacoes: d.observacoes || '',
        ativo: true
      });
    },
    onSuccess: () => { queryClient.invalidateQueries(['tabelas-comissao-vendedor', empresaId]); toast.success('Exceção de vendedor criada!'); setModalVendedor(false); }
  });
  const editarTabelaVendedor = useMutation({
    mutationFn: ({ id, d }) => {
      const vend = vendedores.find(v => v.id === d.vendedor_id);
      const conv = convenios.find(c => c.id === d.convenio_id);
      return base44.entities.TabelaComissaoVendedor.update(id, {
        vendedor_id: d.vendedor_id,
        vendedor_nome: vend?.nome || '',
        banco: d.banco || '',
        convenio_id: d.convenio_id || null,
        convenio_nome: conv?.nome || '',
        tipo_operacao: d.tipo_operacao || '',
        prazo_min: Number(d.prazo_min) || 0,
        prazo_max: Number(d.prazo_max) || 999,
        tipo_comissao: d.tipo_comissao,
        percentual_vendedor: d.tipo_comissao === 'percentual' ? parseFloat(d.percentual_vendedor) || 0 : 0,
        valor_fixo_vendedor: d.tipo_comissao === 'fixo' ? parseFloat(d.valor_fixo_vendedor) || 0 : 0,
        prioridade: Number(d.prioridade) || 1,
        vigencia_inicio: d.vigencia_inicio || null,
        vigencia_fim: d.vigencia_fim || null,
        observacoes: d.observacoes || '',
      });
    },
    onSuccess: () => { queryClient.invalidateQueries(['tabelas-comissao-vendedor', empresaId]); toast.success('Exceção atualizada!'); setModalVendedor(false); }
  });
  const deletarTabelaVendedor = useMutation({
    mutationFn: (id) => base44.entities.TabelaComissaoVendedor.update(id, { ativo: false }),
    onSuccess: () => { queryClient.invalidateQueries(['tabelas-comissao-vendedor', empresaId]); toast.success('Exceção removida!'); setDeleteTarget(null); }
  });

  const handleDelete = () => {
    if (!deleteTarget) return;
    if (deleteTarget.type === 'nivel') deletarNivel.mutate(deleteTarget.id);
    if (deleteTarget.type === 'tabelaNivel') deletarTabelaNivel.mutate(deleteTarget.id);
    if (deleteTarget.type === 'tabelaVendedor') deletarTabelaVendedor.mutate(deleteTarget.id);
  };

  if (!user || !empresaId) {
    return <div className="flex items-center justify-center h-96"><Loader2 className="w-8 h-8 animate-spin text-slate-400" /></div>;
  }

  const selectClass = "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring";

  return (
    <div className="space-y-6 p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Comissão do Vendedor</h1>
        <p className="text-slate-500 text-sm mt-1">
          Configure quanto cada vendedor recebe. Independente da comissão da empresa.
        </p>
      </div>

      {/* Info box */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex gap-3">
        <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
        <div className="text-sm text-blue-800">
          <p className="font-semibold mb-1">Ordem de busca da comissão do vendedor:</p>
          <p><span className="font-medium">1º</span> Exceção específica do vendedor (mais alta prioridade)</p>
          <p><span className="font-medium">2º</span> Regra do nível/tier do vendedor (Ouro, Prata, Bronze...)</p>
          <p><span className="font-medium">3º</span> Sem regra encontrada = 0% (ou percentual manual)</p>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid grid-cols-3 w-full max-w-lg">
          <TabsTrigger value="niveis" className="flex items-center gap-2">
            <Star className="w-4 h-4" /> Níveis
          </TabsTrigger>
          <TabsTrigger value="regras-nivel" className="flex items-center gap-2">
            <LayersIcon className="w-4 h-4" /> Regras por Nível
          </TabsTrigger>
          <TabsTrigger value="excecoes-vendedor" className="flex items-center gap-2">
            <Users className="w-4 h-4" /> Exceções por Vendedor
          </TabsTrigger>
        </TabsList>

        {/* ===== ABA 1: NÍVEIS ===== */}
        <TabsContent value="niveis" className="space-y-4 mt-4">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="font-semibold text-slate-800">Níveis de Comissão</h2>
              <p className="text-xs text-slate-500 mt-0.5">Ex: Ouro, Prata, Bronze. Atribua um nível a cada vendedor.</p>
            </div>
            <Button onClick={() => { setEditandoNivel(null); setFormNivel({ nome: '', descricao: '', cor: '#6366f1' }); setModalNivel(true); }}>
              <Plus className="w-4 h-4 mr-2" /> Novo Nível
            </Button>
          </div>

          {loadNiveis ? <div className="flex justify-center py-8"><Loader2 className="animate-spin w-6 h-6 text-slate-400" /></div>
            : niveis.length === 0 ? (
              <Card><CardContent className="text-center py-12 text-slate-500">Nenhum nível cadastrado. Crie o primeiro!</CardContent></Card>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                {niveis.map(n => (
                  <Card key={n.id} className="overflow-hidden">
                    <div className="h-2" style={{ backgroundColor: n.cor || '#6366f1' }} />
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="font-bold text-lg text-slate-900">{n.nome}</p>
                          {n.descricao && <p className="text-xs text-slate-500 mt-0.5">{n.descricao}</p>}
                          <p className="text-xs text-slate-400 mt-2">
                            {tabelasNivel.filter(t => t.nivel_id === n.id).length} regra(s) configurada(s)
                          </p>
                        </div>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => {
                            setEditandoNivel(n);
                            setFormNivel({ nome: n.nome, descricao: n.descricao || '', cor: n.cor || '#6366f1' });
                            setModalNivel(true);
                          }}>
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500" onClick={() => setDeleteTarget({ type: 'nivel', id: n.id })}>
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
        </TabsContent>

        {/* ===== ABA 2: REGRAS POR NÍVEL ===== */}
        <TabsContent value="regras-nivel" className="space-y-4 mt-4">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="font-semibold text-slate-800">Regras por Nível</h2>
              <p className="text-xs text-slate-500 mt-0.5">Defina a comissão de cada nível por banco, convênio e prazo.</p>
            </div>
            <Button onClick={() => { setEditandoTabelaNivel(null); setFormTabelaNivel({ nivel_id: niveis[0]?.id || '', banco: '', convenio_id: '', tipo_operacao: '', prazo_min: '0', prazo_max: '999', tipo_comissao: 'percentual', percentual_vendedor: '', valor_fixo_vendedor: '' }); setModalTabelaNivel(true); }}>
              <Plus className="w-4 h-4 mr-2" /> Nova Regra
            </Button>
          </div>

          {loadTabelasNivel ? <div className="flex justify-center py-8"><Loader2 className="animate-spin w-6 h-6 text-slate-400" /></div>
            : tabelasNivel.length === 0 ? (
              <Card><CardContent className="text-center py-12 text-slate-500">Nenhuma regra cadastrada ainda.</CardContent></Card>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50">
                    <tr className="text-slate-600 text-left">
                      <th className="p-3 font-semibold">Nível</th>
                      <th className="p-3 font-semibold">Banco</th>
                      <th className="p-3 font-semibold">Convênio</th>
                      <th className="p-3 font-semibold">Tipo Op.</th>
                      <th className="p-3 font-semibold">Prazo</th>
                      <th className="p-3 font-semibold text-right">Comissão</th>
                      <th className="p-3 font-semibold text-center">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tabelasNivel.map(t => {
                      const nivel = niveis.find(n => n.id === t.nivel_id);
                      return (
                        <tr key={t.id} className="border-b hover:bg-slate-50">
                          <td className="p-3">
                            <span className="px-2 py-1 rounded-full text-xs font-bold text-white" style={{ backgroundColor: nivel?.cor || '#6366f1' }}>
                              {t.nivel_nome || '?'}
                            </span>
                          </td>
                          <td className="p-3 text-slate-600">{t.banco || <span className="text-slate-400">Todos</span>}</td>
                          <td className="p-3 text-slate-600">{t.convenio_nome || <span className="text-slate-400">Todos</span>}</td>
                          <td className="p-3 text-slate-600">{t.tipo_operacao || <span className="text-slate-400">Todos</span>}</td>
                          <td className="p-3 text-slate-600">{t.prazo_min === 0 && t.prazo_max === 999 ? <span className="text-slate-400">Todos</span> : `${t.prazo_min}–${t.prazo_max}m`}</td>
                          <td className="p-3 text-right font-bold text-purple-700">
                            {t.tipo_comissao === 'fixo' ? `R$ ${t.valor_fixo_vendedor?.toFixed(2)}` : fmt(t.percentual_vendedor)}
                          </td>
                          <td className="p-3 text-center">
                            <div className="flex gap-1 justify-center">
                              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => {
                                setEditandoTabelaNivel(t);
                                setFormTabelaNivel({ nivel_id: t.nivel_id, banco: t.banco || '', convenio_id: t.convenio_id || '', tipo_operacao: t.tipo_operacao || '', prazo_min: String(t.prazo_min ?? 0), prazo_max: String(t.prazo_max ?? 999), tipo_comissao: t.tipo_comissao || 'percentual', percentual_vendedor: String(t.percentual_vendedor ?? ''), valor_fixo_vendedor: String(t.valor_fixo_vendedor ?? '') });
                                setModalTabelaNivel(true);
                              }}>
                                <Pencil className="w-4 h-4" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500" onClick={() => setDeleteTarget({ type: 'tabelaNivel', id: t.id })}>
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
        </TabsContent>

        {/* ===== ABA 3: EXCEÇÕES POR VENDEDOR ===== */}
        <TabsContent value="excecoes-vendedor" className="space-y-4 mt-4">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="font-semibold text-slate-800">Exceções por Vendedor</h2>
              <p className="text-xs text-slate-500 mt-0.5">Regras específicas que sobrepõem o nível. Ex: João no PAN = 4,5%.</p>
            </div>
            <Button onClick={() => { setEditandoVendedor(null); setFormVendedor({ vendedor_id: '', banco: '', convenio_id: '', tipo_operacao: '', prazo_min: '0', prazo_max: '999', tipo_comissao: 'percentual', percentual_vendedor: '', valor_fixo_vendedor: '', prioridade: '1', vigencia_inicio: '', vigencia_fim: '', observacoes: '' }); setModalVendedor(true); }}>
              <Plus className="w-4 h-4 mr-2" /> Nova Exceção
            </Button>
          </div>

          {loadTabelasVendedor ? <div className="flex justify-center py-8"><Loader2 className="animate-spin w-6 h-6 text-slate-400" /></div>
            : tabelasVendedor.length === 0 ? (
              <Card><CardContent className="text-center py-12 text-slate-500">Nenhuma exceção cadastrada ainda.</CardContent></Card>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50">
                    <tr className="text-slate-600 text-left">
                      <th className="p-3 font-semibold">Vendedor</th>
                      <th className="p-3 font-semibold">Banco</th>
                      <th className="p-3 font-semibold">Convênio</th>
                      <th className="p-3 font-semibold">Tipo Op.</th>
                      <th className="p-3 font-semibold">Prazo</th>
                      <th className="p-3 font-semibold text-right">Comissão</th>
                      <th className="p-3 font-semibold">Vigência</th>
                      <th className="p-3 font-semibold text-center">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tabelasVendedor.map(t => (
                      <tr key={t.id} className="border-b hover:bg-slate-50">
                        <td className="p-3">
                          <p className="font-medium text-slate-900">{t.vendedor_nome}</p>
                          {t.observacoes && <p className="text-xs text-slate-400 truncate max-w-[140px]">{t.observacoes}</p>}
                        </td>
                        <td className="p-3 text-slate-600">{t.banco || <span className="text-slate-400">Todos</span>}</td>
                        <td className="p-3 text-slate-600">{t.convenio_nome || <span className="text-slate-400">Todos</span>}</td>
                        <td className="p-3 text-slate-600">{t.tipo_operacao || <span className="text-slate-400">Todos</span>}</td>
                        <td className="p-3 text-slate-600">{t.prazo_min === 0 && t.prazo_max === 999 ? <span className="text-slate-400">Todos</span> : `${t.prazo_min}–${t.prazo_max}m`}</td>
                        <td className="p-3 text-right font-bold text-blue-700">
                          {t.tipo_comissao === 'fixo' ? `R$ ${t.valor_fixo_vendedor?.toFixed(2)}` : fmt(t.percentual_vendedor)}
                        </td>
                        <td className="p-3 text-xs text-slate-500">
                          {t.vigencia_inicio ? t.vigencia_inicio : '—'} {t.vigencia_fim ? `→ ${t.vigencia_fim}` : ''}
                        </td>
                        <td className="p-3 text-center">
                          <div className="flex gap-1 justify-center">
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => {
                              setEditandoVendedor(t);
                              setFormVendedor({ vendedor_id: t.vendedor_id, banco: t.banco || '', convenio_id: t.convenio_id || '', tipo_operacao: t.tipo_operacao || '', prazo_min: String(t.prazo_min ?? 0), prazo_max: String(t.prazo_max ?? 999), tipo_comissao: t.tipo_comissao || 'percentual', percentual_vendedor: String(t.percentual_vendedor ?? ''), valor_fixo_vendedor: String(t.valor_fixo_vendedor ?? ''), prioridade: String(t.prioridade ?? 1), vigencia_inicio: t.vigencia_inicio || '', vigencia_fim: t.vigencia_fim || '', observacoes: t.observacoes || '' });
                              setModalVendedor(true);
                            }}>
                              <Pencil className="w-4 h-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500" onClick={() => setDeleteTarget({ type: 'tabelaVendedor', id: t.id })}>
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
        </TabsContent>
      </Tabs>

      {/* ===== MODAL NÍVEL ===== */}
      <Dialog open={modalNivel} onOpenChange={setModalNivel}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editandoNivel ? 'Editar' : 'Novo'} Nível de Comissão</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Nome do Nível *</Label>
              <Input placeholder="Ex: Ouro, Prata, Bronze" value={formNivel.nome} onChange={e => setFormNivel(p => ({ ...p, nome: e.target.value }))} />
            </div>
            <div>
              <Label>Descrição</Label>
              <Input placeholder="Descrição opcional" value={formNivel.descricao} onChange={e => setFormNivel(p => ({ ...p, descricao: e.target.value }))} />
            </div>
            <div>
              <Label>Cor de identificação</Label>
              <div className="flex items-center gap-3 mt-1">
                <input type="color" value={formNivel.cor} onChange={e => setFormNivel(p => ({ ...p, cor: e.target.value }))} className="h-10 w-16 rounded border cursor-pointer" />
                <span className="text-sm text-slate-500">{formNivel.cor}</span>
              </div>
            </div>
            <div className="flex gap-3 justify-end pt-2">
              <Button variant="outline" onClick={() => setModalNivel(false)}>Cancelar</Button>
              <Button
                disabled={!formNivel.nome}
                onClick={() => editandoNivel
                  ? editarNivel.mutate({ id: editandoNivel.id, d: formNivel })
                  : criarNivel.mutate(formNivel)
                }
              >
                {(criarNivel.isPending || editarNivel.isPending) ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Salvar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ===== MODAL TABELA NÍVEL ===== */}
      <Dialog open={modalTabelaNivel} onOpenChange={setModalTabelaNivel}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editandoTabelaNivel ? 'Editar' : 'Nova'} Regra por Nível</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Nível *</Label>
              <select className={selectClass} value={formTabelaNivel.nivel_id} onChange={e => setFormTabelaNivel(p => ({ ...p, nivel_id: e.target.value }))}>
                <option value="">Selecione...</option>
                {niveis.map(n => <option key={n.id} value={n.id}>{n.nome}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Banco (opcional)</Label>
                <select className={selectClass} value={formTabelaNivel.banco} onChange={e => setFormTabelaNivel(p => ({ ...p, banco: e.target.value }))}>
                  <option value="">Todos</option>
                  {bancos.map(b => <option key={b.id} value={b.nome}>{b.nome}</option>)}
                </select>
              </div>
              <div>
                <Label>Convênio (opcional)</Label>
                <select className={selectClass} value={formTabelaNivel.convenio_id} onChange={e => setFormTabelaNivel(p => ({ ...p, convenio_id: e.target.value }))}>
                  <option value="">Todos</option>
                  {convenios.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Tipo de Operação</Label>
                <select className={selectClass} value={formTabelaNivel.tipo_operacao} onChange={e => setFormTabelaNivel(p => ({ ...p, tipo_operacao: e.target.value }))}>
                  {TIPO_OP_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div>
                <Label>Tipo de Comissão</Label>
                <select className={selectClass} value={formTabelaNivel.tipo_comissao} onChange={e => setFormTabelaNivel(p => ({ ...p, tipo_comissao: e.target.value }))}>
                  <option value="percentual">Percentual (%)</option>
                  <option value="fixo">Valor Fixo (R$)</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Prazo Mínimo (meses)</Label>
                <Input type="number" value={formTabelaNivel.prazo_min} onChange={e => setFormTabelaNivel(p => ({ ...p, prazo_min: e.target.value }))} />
              </div>
              <div>
                <Label>Prazo Máximo (meses)</Label>
                <Input type="number" value={formTabelaNivel.prazo_max} onChange={e => setFormTabelaNivel(p => ({ ...p, prazo_max: e.target.value }))} />
              </div>
            </div>
            {formTabelaNivel.tipo_comissao === 'percentual' ? (
              <div>
                <Label>Percentual do Vendedor (%) *</Label>
                <Input type="number" step="0.01" placeholder="3.5" value={formTabelaNivel.percentual_vendedor} onChange={e => setFormTabelaNivel(p => ({ ...p, percentual_vendedor: e.target.value }))} />
              </div>
            ) : (
              <div>
                <Label>Valor Fixo (R$) *</Label>
                <Input type="number" step="0.01" placeholder="100.00" value={formTabelaNivel.valor_fixo_vendedor} onChange={e => setFormTabelaNivel(p => ({ ...p, valor_fixo_vendedor: e.target.value }))} />
              </div>
            )}
            <div className="flex gap-3 justify-end pt-2">
              <Button variant="outline" onClick={() => setModalTabelaNivel(false)}>Cancelar</Button>
              <Button
                disabled={!formTabelaNivel.nivel_id}
                onClick={() => editandoTabelaNivel
                  ? editarTabelaNivel.mutate({ id: editandoTabelaNivel.id, d: formTabelaNivel })
                  : criarTabelaNivel.mutate(formTabelaNivel)
                }
              >
                {(criarTabelaNivel.isPending || editarTabelaNivel.isPending) ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Salvar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ===== MODAL EXCEÇÃO VENDEDOR ===== */}
      <Dialog open={modalVendedor} onOpenChange={setModalVendedor}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editandoVendedor ? 'Editar' : 'Nova'} Exceção por Vendedor</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Vendedor *</Label>
              <select className={selectClass} value={formVendedor.vendedor_id} onChange={e => setFormVendedor(p => ({ ...p, vendedor_id: e.target.value }))}>
                <option value="">Selecione...</option>
                {vendedores.filter(v => ['vendedor', 'gerente'].includes(v.perfil)).map(v => <option key={v.id} value={v.id}>{v.nome}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Banco (opcional)</Label>
                <select className={selectClass} value={formVendedor.banco} onChange={e => setFormVendedor(p => ({ ...p, banco: e.target.value }))}>
                  <option value="">Todos</option>
                  {bancos.map(b => <option key={b.id} value={b.nome}>{b.nome}</option>)}
                </select>
              </div>
              <div>
                <Label>Convênio (opcional)</Label>
                <select className={selectClass} value={formVendedor.convenio_id} onChange={e => setFormVendedor(p => ({ ...p, convenio_id: e.target.value }))}>
                  <option value="">Todos</option>
                  {convenios.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Tipo de Operação</Label>
                <select className={selectClass} value={formVendedor.tipo_operacao} onChange={e => setFormVendedor(p => ({ ...p, tipo_operacao: e.target.value }))}>
                  {TIPO_OP_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div>
                <Label>Tipo de Comissão</Label>
                <select className={selectClass} value={formVendedor.tipo_comissao} onChange={e => setFormVendedor(p => ({ ...p, tipo_comissao: e.target.value }))}>
                  <option value="percentual">Percentual (%)</option>
                  <option value="fixo">Valor Fixo (R$)</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Prazo Mínimo (meses)</Label>
                <Input type="number" value={formVendedor.prazo_min} onChange={e => setFormVendedor(p => ({ ...p, prazo_min: e.target.value }))} />
              </div>
              <div>
                <Label>Prazo Máximo (meses)</Label>
                <Input type="number" value={formVendedor.prazo_max} onChange={e => setFormVendedor(p => ({ ...p, prazo_max: e.target.value }))} />
              </div>
            </div>
            {formVendedor.tipo_comissao === 'percentual' ? (
              <div>
                <Label>Percentual do Vendedor (%) *</Label>
                <Input type="number" step="0.01" placeholder="4.5" value={formVendedor.percentual_vendedor} onChange={e => setFormVendedor(p => ({ ...p, percentual_vendedor: e.target.value }))} />
              </div>
            ) : (
              <div>
                <Label>Valor Fixo (R$) *</Label>
                <Input type="number" step="0.01" placeholder="100.00" value={formVendedor.valor_fixo_vendedor} onChange={e => setFormVendedor(p => ({ ...p, valor_fixo_vendedor: e.target.value }))} />
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Vigência Início</Label>
                <Input type="date" value={formVendedor.vigencia_inicio} onChange={e => setFormVendedor(p => ({ ...p, vigencia_inicio: e.target.value }))} />
              </div>
              <div>
                <Label>Vigência Fim</Label>
                <Input type="date" value={formVendedor.vigencia_fim} onChange={e => setFormVendedor(p => ({ ...p, vigencia_fim: e.target.value }))} />
              </div>
            </div>
            <div>
              <Label>Prioridade</Label>
              <Input type="number" min="1" value={formVendedor.prioridade} onChange={e => setFormVendedor(p => ({ ...p, prioridade: e.target.value }))} />
              <p className="text-xs text-slate-400 mt-1">Menor número = maior prioridade</p>
            </div>
            <div>
              <Label>Observações</Label>
              <Input placeholder="Opcional" value={formVendedor.observacoes} onChange={e => setFormVendedor(p => ({ ...p, observacoes: e.target.value }))} />
            </div>
            <div className="flex gap-3 justify-end pt-2">
              <Button variant="outline" onClick={() => setModalVendedor(false)}>Cancelar</Button>
              <Button
                disabled={!formVendedor.vendedor_id}
                onClick={() => editandoVendedor
                  ? editarTabelaVendedor.mutate({ id: editandoVendedor.id, d: formVendedor })
                  : criarTabelaVendedor.mutate(formVendedor)
                }
              >
                {(criarTabelaVendedor.isPending || editarTabelaVendedor.isPending) ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Salvar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ===== CONFIRM DELETE ===== */}
      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
            <AlertDialogDescription>Esta ação desativa o registro. Histórico de comissões já calculadas não é afetado.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}