import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, FileText, Download, CheckCircle, DollarSign, Eye, Pencil, Trash2, BarChart2, UserX } from 'lucide-react';
import PreRelatorioModal from '@/components/folha/PreRelatorioModal';
import { toast } from 'sonner';
import { format } from 'date-fns';
import DescontosFolha from '@/components/folha/DescontosFolha';
import PagamentoFolhaModal from '@/components/folha/PagamentoFolhaModal';
import { gerarContracheque } from '@/components/folha/gerarContracheque';
import { moeda, liquido as calcLiquido, descontosTotal, pago, saldo, inssConfigurado, arredondar } from '@/components/folha/folhaCalculos';

const STATUS_CORES = {
  Rascunho: 'bg-gray-100 text-gray-600',
  Gerada: 'bg-blue-100 text-blue-700',
  Paga: 'bg-green-100 text-green-700',
  Assinada: 'bg-purple-100 text-purple-700',
  Arquivada: 'bg-slate-100 text-slate-500',
};

const emptyForm = {
  colaborador_id: '', mes_referencia: '', data_pagamento: '',
  salario_base: '', dias_trabalhados: '30', valor_comissao: '0',
  bonificacoes: '0', adiantamentos: '0', descontos: '0', descontos_itens: [], inss_valor: '0', inss_vigencia: '', salvar_inss: false, observacoes: ''
};

export default function FolhaSalarialPage() {
  const [user, setUser] = useState(null);
  const [filiais, setFiliais] = useState([]);
  const [pagamentoModal, setPagamentoModal] = useState(null);
  const [folhas, setFolhas] = useState([]);
  const [colaboradores, setColaboradores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [mesF, setMesF] = useState('');
  const [colabF, setColabF] = useState('todos');
  const [statusF, setStatusF] = useState('todos');
  const [modalOpen, setModalOpen] = useState(false);
  const [viewModal, setViewModal] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [gerandoPdf, setGerandoPdf] = useState(null);
  const [preRelatorio, setPreRelatorio] = useState(false);
  const [editModal, setEditModal] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [savingEdit, setSavingEdit] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [faltaModal, setFaltaModal] = useState(null);
  const [faltaData, setFaltaData] = useState('');
  const [faltaDSR, setFaltaDSR] = useState(false);
  const [faltaFeriado, setFaltaFeriado] = useState(false);
  const [savingFalta, setSavingFalta] = useState(false);

  useEffect(() => {
    base44.auth.me().then(me => {
      setUser(me);
      carregar(me);
    });
  }, []);

  const carregar = async (me) => {
    setLoading(true);
    const filtro = me?.empresa_id ? { empresa_id: me.empresa_id } : {};
    const [f, c, unidades] = await Promise.all([
      base44.entities.FolhaSalarial.filter(filtro, '-created_date', 500),
      base44.entities.FuncionarioColaborador.filter(filtro, 'nome', 200),
      base44.entities.Filial.filter(filtro, 'nome', 200)
    ]);
    setFolhas(f);
    setColaboradores(c);
    setFiliais(unidades);
    setLoading(false);
  };

  const abrirNova = () => {
    setForm({...emptyForm,mes_referencia:format(new Date(),'MM/yyyy'),inss_vigencia:format(new Date(),'yyyy-MM')});
    setModalOpen(true);
  };

  const preencherSalario = async (colabId) => {
    const c = colaboradores.find(x => x.id === colabId);
    if (!c) return;
    // Buscar adiantamentos pendentes do colaborador
    let totalAdiantamentos = 0;
    try {
      const adiantamentos = await base44.entities.AdiantamentoFuncionario.filter(
        { colaborador_id: colabId, status: 'Pendente' }
      );
      totalAdiantamentos = adiantamentos.reduce((s, a) => s + (a.valor || 0), 0);
    } catch {}
    setForm(f => ({
      ...f,
      colaborador_id: colabId,
      salario_base: String(c.salario_base || ''),
      adiantamentos: String(totalAdiantamentos),
      inss_valor: String(inssConfigurado(c,f.mes_referencia)?.valor || 0),
      inss_vigencia: inssConfigurado(c,f.mes_referencia)?.vigencia || f.inss_vigencia
    }));
  };

  const dadosForm = f => ({
    mes_referencia:f.mes_referencia, data_pagamento:f.data_pagamento || null,
    salario_base:moeda(f.salario_base),dias_trabalhados:moeda(f.dias_trabalhados),
    valor_comissao:moeda(f.valor_comissao),bonificacoes:moeda(f.bonificacoes),
    adiantamentos:moeda(f.adiantamentos),descontos:descontosTotal(f),
    descontos_itens:Array.isArray(f.descontos_itens) ? f.descontos_itens.map(i=>({...i,valor:moeda(i.valor)})) : (moeda(f.descontos)>0 ? [{id:crypto.randomUUID(),descricao:'Desconto anterior',valor:moeda(f.descontos)}] : []),
    inss_valor:moeda(f.inss_valor),inss_vigencia:f.inss_vigencia,
    valor_liquido:calcLiquido(f),observacoes:f.observacoes
  });
  const validar = f => {
    if(!/^\d{2}\/\d{4}$/.test(f.mes_referencia) || Number(f.mes_referencia.slice(0,2))<1 || Number(f.mes_referencia.slice(0,2))>12) throw new Error('Informe a competência no formato MM/AAAA.');
    if(['salario_base','valor_comissao','bonificacoes','adiantamentos','inss_valor'].some(k=>moeda(f[k])<0) || (f.descontos_itens || []).some(i=>!i.descricao.trim() || moeda(i.valor)<0)) throw new Error('Revise os valores e as descrições dos descontos.');
    if(moeda(f.dias_trabalhados)<0 || moeda(f.dias_trabalhados)>31 || calcLiquido(f)<0) throw new Error('Revise os dias trabalhados e o valor líquido.');
    if(f.salvar_inss && !/^\d{4}-\d{2}$/.test(f.inss_vigencia)) throw new Error('Informe a vigência do INSS.');
  };
  const guardarINSS = async f => {
    if(!f.salvar_inss) return;
    const c = await base44.entities.FuncionarioColaborador.get(f.colaborador_id);
    const configs = (c.inss_configuracoes || []).filter(i=>i.vigencia !== f.inss_vigencia);
    await base44.entities.FuncionarioColaborador.update(c.id,{inss_configuracoes:[...configs,{vigencia:f.inss_vigencia,valor:moeda(f.inss_valor)}]});
  };
  const salvar = async () => {
    if(saving) return;
    if(!form.colaborador_id) return toast.error('Selecione o funcionário.');
    setSaving(true);
    try {
      validar(form);
      await guardarINSS(form);
      const colab=colaboradores.find(c=>c.id===form.colaborador_id);
      await base44.entities.FolhaSalarial.create({...dadosForm(form),empresa_id:user?.empresa_id,colaborador_id:form.colaborador_id,colaborador_nome:colab?.nome || '',status:'Rascunho'});
      toast.success('Folha criada!');setModalOpen(false);await carregar(user);
    } catch(e) {toast.error(e.message || 'Não foi possível salvar a folha.');}
    finally {setSaving(false);}
  };
  const atualizarStatus = async (folha, novoStatus) => {
    if(novoStatus === 'Paga') return setPagamentoModal(folha);
    try {
      await base44.entities.FolhaSalarial.update(folha.id,{status:novoStatus});
      toast.success('Status atualizado');await carregar(user);
    } catch(e) {toast.error(e.message || 'Não foi possível atualizar.');}
  };
  const gerarPDF = async folha => {
    setGerandoPdf(folha.id);
    try {
      const empresa = await base44.entities.Empresa.get(folha.empresa_id);
      const c = colaboradores.find(c=>c.id===folha.colaborador_id) || {};
      const resultado=await gerarContracheque(folha,c,empresa);
      toast.success('Contracheque gerado!');
      if(!resultado.logoCarregado) toast.info('O logo não pôde ser carregado. Confira o logo no cadastro da empresa.');
    } catch(e) {toast.error(e.message || 'Não foi possível gerar o contracheque.');}
    finally {setGerandoPdf(null);}
  };

  const abrirEditar = (folha) => {
    if(pago(folha)>0) return toast.error('Esta folha já possui pagamentos. Os valores estão bloqueados.');
    setEditForm({
      colaborador_id: folha.colaborador_id,
      mes_referencia: folha.mes_referencia,
      data_pagamento: folha.data_pagamento || '',
      salario_base: String(folha.salario_base || ''),
      dias_trabalhados: String(folha.dias_trabalhados || '30'),
      valor_comissao: String(folha.valor_comissao || '0'),
      bonificacoes: String(folha.bonificacoes || '0'),
      adiantamentos: String(folha.adiantamentos || '0'),
      descontos: String(folha.descontos || '0'),
      descontos_itens:folha.descontos_itens,
      inss_valor:String(folha.inss_valor || 0),inss_vigencia:folha.inss_vigencia || '',salvar_inss:false,
      observacoes: folha.observacoes || ''
    });
    setEditModal(folha);
  };

  const salvarEdicao = async () => {
    if(savingEdit) return;
    setSavingEdit(true);
    try {
      validar(editForm);
      const atual=await base44.entities.FolhaSalarial.get(editModal.id);
      if(pago(atual)>0) throw new Error('Esta folha já possui pagamentos.');
      await guardarINSS(editForm);
      await base44.entities.FolhaSalarial.update(editModal.id,dadosForm(editForm));
      toast.success('Folha atualizada!');setEditModal(null);await carregar(user);
    } catch(e) {toast.error(e.message || 'Não foi possível salvar.');}
    finally {setSavingEdit(false);}
  };

  const calcDescontoFalta = () => {
    if (!faltaModal) return { itens: [], total: 0 };
    const valorDia = (faltaModal.salario_base || 0) / 30;
    const itens = [];
    if (faltaData) {
      const dataFormatada = format(new Date(faltaData + 'T00:00:00'), 'dd/MM/yyyy');
      itens.push({ label: `Falta injustificada (${dataFormatada})`, valor: valorDia });
    } else {
      itens.push({ label: 'Falta injustificada', valor: valorDia });
    }
    if (faltaDSR) itens.push({ label: 'Perda do DSR (domingo)', valor: valorDia });
    if (faltaFeriado) itens.push({ label: 'Perda do feriado', valor: valorDia });
    const total = itens.reduce((s, i) => s + i.valor, 0);
    return { itens, total };
  };

  const lancarFalta = async () => {
    if (!faltaModal) return;
    if (pago(faltaModal)>0) return toast.error('Folha com pagamentos não pode receber novos descontos.');
    if (!faltaData) return toast.error('Informe a data da falta');
    setSavingFalta(true);
    const { itens, total } = calcDescontoFalta();
    const dataFormatada = format(new Date(faltaData + 'T00:00:00'), 'dd/MM/yyyy');
    const linhasObs = itens.map(i => `• ${i.label}: -${fmt(i.valor)}`).join('\n');
    const novaLinhaObs = `Falta em ${dataFormatada}:\n${linhasObs}\nTotal descontado: -${fmt(total)}`;
    const obsAtual = faltaModal.observacoes || '';
    const novaObs = obsAtual ? `${obsAtual}\n\n${novaLinhaObs}` : novaLinhaObs;

    await base44.entities.FolhaSalarial.update(faltaModal.id, {
      dias_trabalhados: Math.max(0, (faltaModal.dias_trabalhados || 30) - 1),
      descontos: arredondar(descontosTotal(faltaModal) + total),
      descontos_itens:[...(faltaModal.descontos_itens || (moeda(faltaModal.descontos)>0 ? [{id:crypto.randomUUID(),descricao:'Desconto anterior',valor:moeda(faltaModal.descontos)}] : [])),...itens.map(i=>({id:crypto.randomUUID(),descricao:i.label,valor:arredondar(i.valor)}))],
      valor_liquido: (faltaModal.valor_liquido || 0) - total,
      observacoes: novaObs,
    });
    toast.success(`Falta lançada — desconto total de ${fmt(total)}`);
    setSavingFalta(false);
    setFaltaModal(null);
    setFaltaData('');
    setFaltaDSR(false);
    setFaltaFeriado(false);
    carregar(user);
  };

  const excluirFolha = async (folha) => {
    const atual=await base44.entities.FolhaSalarial.get(folha.id);
    if(pago(atual)>0) return toast.error('Folhas com pagamentos não podem ser excluídas.');
    await base44.entities.FolhaSalarial.delete(folha.id);
    toast.success('Folha excluída!');
    setConfirmDelete(null);
    carregar(user);
  };

  const fmt = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  const filtradas = folhas.filter(f => {
    const okMes = !mesF || f.mes_referencia?.includes(mesF);
    const okColab = colabF === 'todos' || f.colaborador_id === colabF;
    const okStatus = statusF === 'todos' || f.status === statusF;
    return okMes && okColab && okStatus;
  });

  const totalMes = filtradas.reduce((s, f) => s + (f.valor_liquido || 0), 0);
  const totalPagas = filtradas.reduce((s, f) => s + pago(f), 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Folha Salarial</h1>
          <p className="text-slate-500 text-sm">Controle de pagamentos e recibos</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setPreRelatorio(true)} className="gap-2">
            <BarChart2 className="w-4 h-4" /> Pré-Relatório
          </Button>
          <Button onClick={abrirNova} className="bg-[#10353C] hover:bg-[#10353C]/90 gap-2">
            <Plus className="w-4 h-4" /> Nova Folha
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-slate-500">Total (filtro atual)</p>
            <p className="text-xl font-bold text-slate-800">{fmt(totalMes)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-slate-500">Pagas</p>
            <p className="text-xl font-bold text-green-600">{fmt(totalPagas)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-slate-500">Registros</p>
            <p className="text-2xl font-bold text-slate-800">{filtradas.length}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-3">
            <Input className="w-32" placeholder="Mês (04/2026)" value={mesF} onChange={e => setMesF(e.target.value)} />
            <Select value={colabF} onValueChange={setColabF}>
              <SelectTrigger className="w-48"><SelectValue placeholder="Colaborador" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos colaboradores</SelectItem>
                {colaboradores.map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={statusF} onValueChange={setStatusF}>
              <SelectTrigger className="w-36"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos status</SelectItem>
                {['Rascunho','Gerada','Paga','Assinada','Arquivada'].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Lista */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center text-slate-500">Carregando...</div>
          ) : filtradas.length === 0 ? (
            <div className="p-8 text-center text-slate-500">
              <FileText className="w-12 h-12 mx-auto mb-2 opacity-30" />
              <p>Nenhuma folha encontrada</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b">
                  <tr>
                    <th className="text-left p-3 font-medium text-slate-600">Colaborador</th>
                    <th className="text-left p-3 font-medium text-slate-600">Mês Ref.</th>
                    <th className="text-left p-3 font-medium text-slate-600">Salário Base</th>
                    <th className="text-left p-3 font-medium text-slate-600">Líquido</th>
                    <th className="text-left p-3 font-medium text-slate-600">Status</th>
                    <th className="text-left p-3 font-medium text-slate-600">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filtradas.map(f => (
                    <tr key={f.id} className="border-b hover:bg-slate-50">
                      <td className="p-3 font-medium">{f.colaborador_nome}</td>
                      <td className="p-3">{f.mes_referencia}</td>
                      <td className="p-3">{fmt(f.salario_base)}</td>
                      <td className="p-3 font-bold text-green-700">{fmt(f.valor_liquido)}</td>
                      <td className="p-3">
                        <Badge className={STATUS_CORES[f.status] || 'bg-gray-100 text-gray-600'}>{pago(f)>0 && saldo(f)>0 ? 'Parcialmente paga' : f.status}</Badge>
                        <p className="text-xs text-slate-500 mt-1">Pago: {fmt(pago(f))} · Saldo: {fmt(saldo(f))}</p>
                      </td>
                      <td className="p-3">
                        <div className="flex gap-1 flex-wrap">
                          <Button size="sm" variant="ghost" onClick={() => setViewModal(f)} title="Ver detalhes">
                            <Eye className="w-4 h-4" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => gerarPDF(f)} disabled={gerandoPdf === f.id} title="Baixar PDF">
                            <Download className="w-4 h-4" />
                          </Button>
                          {f.status === 'Rascunho' && (
                            <Button size="sm" variant="outline" className="text-xs" onClick={() => atualizarStatus(f, 'Gerada')}>Gerar</Button>
                          )}
                          {f.status === 'Gerada' && (
                            <Button size="sm" className="text-xs bg-green-600 hover:bg-green-700" onClick={() => atualizarStatus(f, 'Paga')}>{pago(f)>0 ? 'Pagar saldo' : 'Fazer pagamento'}</Button>
                          )}
                          {f.status === 'Paga' && (
                            <Button size="sm" variant="outline" className="text-xs" onClick={() => atualizarStatus(f, 'Assinada')}>Assinar</Button>
                          )}
                          <Button size="sm" variant="ghost" onClick={() => { setFaltaModal(f); setFaltaData(''); setFaltaDSR(false); setFaltaFeriado(false); }} title="Lançar Falta" className="text-orange-500 hover:text-orange-700">
                            <UserX className="w-4 h-4" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => abrirEditar(f)} title="Editar">
                            <Pencil className="w-4 h-4 text-slate-500" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(f)} title="Excluir">
                            <Trash2 className="w-4 h-4 text-red-500" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {pagamentoModal && <PagamentoFolhaModal folha={pagamentoModal} filiais={filiais} onClose={()=>setPagamentoModal(null)} onPaid={()=>carregar(user)} />}
      {/* Modal Nova Folha */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nova Folha Salarial</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>Colaborador *</Label>
              <Select value={form.colaborador_id} onValueChange={v => preencherSalario(v)}>
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  {colaboradores.filter(c => c.status === 'Ativo').map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Mês de Referência *</Label>
                <Input value={form.mes_referencia} onChange={e => setForm({...form, mes_referencia: e.target.value})} placeholder="04/2026" />
              </div>
              <div>
                <Label>Data de Pagamento</Label>
                <Input type="date" value={form.data_pagamento} onChange={e => setForm({...form, data_pagamento: e.target.value})} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Salário Base</Label>
                <Input inputMode="decimal" value={form.salario_base} onChange={e => setForm({...form, salario_base: e.target.value})} />
              </div>
              <div>
                <Label>Dias Trabalhados</Label>
                <Input type="number" value={form.dias_trabalhados} onChange={e => setForm({...form, dias_trabalhados: e.target.value})} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Comissões (+)</Label>
                <Input inputMode="decimal" value={form.valor_comissao} onChange={e => setForm({...form, valor_comissao: e.target.value})} />
              </div>
              <div>
                <Label>Bonificações (+)</Label>
                <Input inputMode="decimal" value={form.bonificacoes} onChange={e => setForm({...form, bonificacoes: e.target.value})} />
              </div>
            </div>
            <div><Label>Adiantamentos anteriores (-)</Label>
              <Input inputMode="decimal" value={form.adiantamentos} onChange={e => setForm({...form,adiantamentos:e.target.value})}/>
              <p className="text-xs text-slate-500">Já descontados do líquido. Registre a quinzena atual no botão Fazer pagamento.</p></div>
              <DescontosFolha form={form} onChange={setForm} />
              <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
              <p className="text-sm text-slate-500">Valor Líquido</p>
              <p className="text-2xl font-bold text-green-700">
                {Number(calcLiquido(form)).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
              </p>
            </div>
            <div>
              <Label>Observações</Label>
              <textarea
                className="w-full border rounded-md p-2 text-sm min-h-[60px]"
                value={form.observacoes}
                onChange={e => setForm({...form, observacoes: e.target.value})}
              />
            </div>
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button onClick={salvar} disabled={saving} className="bg-[#10353C] hover:bg-[#10353C]/90">
              {saving ? 'Salvando...' : 'Criar Folha'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Pré-Relatório */}
      <PreRelatorioModal
        open={preRelatorio}
        onClose={() => setPreRelatorio(false)}
        empresaId={user?.empresa_id}
      />

      {/* Modal Editar Folha */}
      {editModal && (
        <Dialog open={!!editModal} onOpenChange={() => setEditModal(null)}>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Editar Folha — {editModal.colaborador_nome}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Mês de Referência</Label>
                  <Input value={editForm.mes_referencia} onChange={e => setEditForm({...editForm, mes_referencia: e.target.value})} placeholder="04/2026" />
                </div>
                <div>
                  <Label>Data de Pagamento</Label>
                  <Input type="date" value={editForm.data_pagamento} onChange={e => setEditForm({...editForm, data_pagamento: e.target.value})} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Salário Base</Label>
                  <Input inputMode="decimal" value={editForm.salario_base} onChange={e => setEditForm({...editForm, salario_base: e.target.value})} />
                </div>
                <div>
                  <Label>Dias Trabalhados</Label>
                  <Input type="number" value={editForm.dias_trabalhados} onChange={e => setEditForm({...editForm, dias_trabalhados: e.target.value})} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Comissões (+)</Label>
                  <Input inputMode="decimal" value={editForm.valor_comissao} onChange={e => setEditForm({...editForm, valor_comissao: e.target.value})} />
                </div>
                <div>
                  <Label>Bonificações (+)</Label>
                  <Input inputMode="decimal" value={editForm.bonificacoes} onChange={e => setEditForm({...editForm, bonificacoes: e.target.value})} />
                </div>
              </div>
              <div><Label>Adiantamentos anteriores (-)</Label>
              <Input inputMode="decimal" value={editForm.adiantamentos} onChange={e => setEditForm({...editForm,adiantamentos:e.target.value})}/>
              <p className="text-xs text-slate-500">Já descontados do líquido. Registre a quinzena atual no botão Fazer pagamento.</p></div>
              <DescontosFolha form={editForm} onChange={setEditForm} />
              <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
                <p className="text-sm text-slate-500">Valor Líquido</p>
                <p className="text-2xl font-bold text-green-700">
                  {Number(calcLiquido(editForm)).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </p>
              </div>
              <div>
                <Label>Observações</Label>
                <textarea className="w-full border rounded-md p-2 text-sm min-h-[60px]" value={editForm.observacoes} onChange={e => setEditForm({...editForm, observacoes: e.target.value})} />
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setEditModal(null)}>Cancelar</Button>
              <Button onClick={salvarEdicao} disabled={savingEdit} className="bg-[#10353C] hover:bg-[#10353C]/90">
                {savingEdit ? 'Salvando...' : 'Salvar Alterações'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Modal Confirmar Exclusão */}
      {confirmDelete && (
        <Dialog open={!!confirmDelete} onOpenChange={() => setConfirmDelete(null)}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Confirmar Exclusão</DialogTitle>
            </DialogHeader>
            <p className="text-slate-600 py-2">
              Deseja excluir a folha de <strong>{confirmDelete.colaborador_nome}</strong> referente a <strong>{confirmDelete.mes_referencia}</strong>? Esta ação não pode ser desfeita.
            </p>
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setConfirmDelete(null)}>Cancelar</Button>
              <Button variant="destructive" onClick={() => excluirFolha(confirmDelete)}>Excluir</Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Modal Lançar Falta */}
      {faltaModal && (() => {
        const { itens, total } = calcDescontoFalta();
        const valorDia = (faltaModal.salario_base || 0) / 30;
        return (
          <Dialog open={!!faltaModal} onOpenChange={() => { setFaltaModal(null); setFaltaData(''); setFaltaDSR(false); setFaltaFeriado(false); }}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <UserX className="w-5 h-5 text-orange-500" /> Lançar Falta
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-2">

                {/* Info colaborador */}
                <div className="bg-slate-50 rounded-lg p-3 text-sm space-y-1">
                  <p><span className="text-slate-500">Colaborador:</span> <strong>{faltaModal.colaborador_nome}</strong></p>
                  <p><span className="text-slate-500">Mês de referência:</span> {faltaModal.mes_referencia}</p>
                  <p><span className="text-slate-500">Salário base:</span> {fmt(faltaModal.salario_base)}</p>
                  <p>
                    <span className="text-slate-500">Valor por dia (÷30):</span>{' '}
                    <span className="font-semibold text-orange-600">{fmt(valorDia)}</span>
                  </p>
                </div>

                {/* Data da falta */}
                <div>
                  <Label>Data da falta *</Label>
                  <Input
                    type="date"
                    value={faltaData}
                    onChange={e => setFaltaData(e.target.value)}
                    className="mt-1"
                  />
                </div>

                {/* Checkboxes DSR / Feriado */}
                <div className="space-y-2">
                  <p className="text-sm font-medium text-slate-700">Perdas adicionais na semana da falta:</p>
                  <label className="flex items-center gap-3 p-2 rounded-lg border cursor-pointer hover:bg-orange-50">
                    <input
                      type="checkbox"
                      checked={faltaDSR}
                      onChange={e => setFaltaDSR(e.target.checked)}
                      className="w-4 h-4 accent-orange-500"
                    />
                    <div>
                      <p className="text-sm font-medium">Perda do DSR (Domingo)</p>
                      <p className="text-xs text-slate-500">A falta injustificada cancela o descanso semanal remunerado</p>
                    </div>
                    <span className="ml-auto text-sm font-semibold text-red-500">-{fmt(valorDia)}</span>
                  </label>
                  <label className="flex items-center gap-3 p-2 rounded-lg border cursor-pointer hover:bg-orange-50">
                    <input
                      type="checkbox"
                      checked={faltaFeriado}
                      onChange={e => setFaltaFeriado(e.target.checked)}
                      className="w-4 h-4 accent-orange-500"
                    />
                    <div>
                      <p className="text-sm font-medium">Perda do Feriado</p>
                      <p className="text-xs text-slate-500">Feriado na mesma semana da falta também é descontado</p>
                    </div>
                    <span className="ml-auto text-sm font-semibold text-red-500">-{fmt(valorDia)}</span>
                  </label>
                </div>

                {/* Resumo do desconto */}
                {faltaData && (
                  <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 space-y-1">
                    <p className="text-xs font-semibold text-orange-700 uppercase tracking-wide mb-2">Resumo do desconto</p>
                    {itens.map((it, i) => (
                      <div key={i} className="flex justify-between text-sm">
                        <span className="text-slate-600">{it.label}</span>
                        <span className="font-medium text-red-600">-{fmt(it.valor)}</span>
                      </div>
                    ))}
                    <div className="border-t border-orange-200 pt-2 mt-2 flex justify-between font-bold">
                      <span className="text-orange-800">Total a descontar</span>
                      <span className="text-orange-800 text-lg">-{fmt(total)}</span>
                    </div>
                  </div>
                )}
              </div>
              <div className="flex justify-end gap-3">
                <Button variant="outline" onClick={() => { setFaltaModal(null); setFaltaData(''); setFaltaDSR(false); setFaltaFeriado(false); }}>
                  Cancelar
                </Button>
                <Button onClick={lancarFalta} disabled={savingFalta || !faltaData} className="bg-orange-600 hover:bg-orange-700">
                  {savingFalta ? 'Salvando...' : 'Confirmar Falta'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        );
      })()}

      {/* Modal Detalhes */}
      {viewModal && (
        <Dialog open={!!viewModal} onOpenChange={() => setViewModal(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Detalhes da Folha</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <div className="flex justify-between"><span className="text-slate-500">Colaborador</span><span className="font-medium">{viewModal.colaborador_nome}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Mês</span><span>{viewModal.mes_referencia}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Salário Base</span><span>{fmt(viewModal.salario_base)}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Comissões</span><span className="text-green-600">+{fmt(viewModal.valor_comissao)}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Bonificações</span><span className="text-green-600">+{fmt(viewModal.bonificacoes)}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Adiantamentos</span><span className="text-red-500">-{fmt(viewModal.adiantamentos)}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Descontos</span><span className="text-red-500">-{fmt(viewModal.descontos)}</span></div>
              <div className="flex justify-between"><span>INSS</span><span>-{fmt(viewModal.inss_valor)}</span></div>
              {(viewModal.descontos_itens || []).map(i=><div key={i.id} className="flex justify-between text-sm"><span>{i.descricao}</span><span>-{fmt(i.valor)}</span></div>)}
              <div className="border-t pt-3 flex justify-between font-bold text-lg">
                <span>Valor Líquido</span><span className="text-green-700">{fmt(viewModal.valor_liquido)}</span>
              </div>
              <div className="flex justify-between"><span>Pago</span><strong>{fmt(pago(viewModal))}</strong></div>
              <div className="flex justify-between"><span>Saldo a pagar</span><strong>{fmt(saldo(viewModal))}</strong></div>
              {(viewModal.pagamentos || []).map(p=><div key={p.id} className="rounded bg-slate-50 p-2 text-sm">{p.tipo} · {p.data.split('-').reverse().join('/')} · {fmt(p.valor)}</div>)}
              {viewModal.data_pagamento && (
                <div className="flex justify-between text-sm"><span className="text-slate-500">Data Pagamento</span><span>{format(new Date(viewModal.data_pagamento + 'T00:00:00'), 'dd/MM/yyyy')}</span></div>
              )}
              <div className="flex justify-between"><span className="text-slate-500">Status</span>
                <Badge className={STATUS_CORES[viewModal.status]}>{viewModal.status}</Badge>
              </div>
            </div>
            <div className="flex justify-end">
              <Button onClick={() => gerarPDF(viewModal)} className="gap-2">
                <Download className="w-4 h-4" /> Baixar PDF
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}