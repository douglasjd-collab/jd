import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, FileText, Download, CheckCircle, DollarSign, Eye } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import jsPDF from 'jspdf';

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
  bonificacoes: '0', adiantamentos: '0', descontos: '0', observacoes: ''
};

function calcLiquido(form) {
  const base = parseFloat(form.salario_base) || 0;
  const com = parseFloat(form.valor_comissao) || 0;
  const bon = parseFloat(form.bonificacoes) || 0;
  const adi = parseFloat(form.adiantamentos) || 0;
  const des = parseFloat(form.descontos) || 0;
  return base + com + bon - adi - des;
}

export default function FolhaSalarialPage() {
  const [user, setUser] = useState(null);
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

  useEffect(() => {
    base44.auth.me().then(me => {
      setUser(me);
      carregar(me);
    });
  }, []);

  const carregar = async (me) => {
    setLoading(true);
    const filtro = me?.empresa_id ? { empresa_id: me.empresa_id } : {};
    const [f, c] = await Promise.all([
      base44.entities.FolhaSalarial.filter(filtro, '-created_date', 500),
      base44.entities.FuncionarioColaborador.filter(filtro, 'nome', 200)
    ]);
    setFolhas(f);
    setColaboradores(c);
    setLoading(false);
  };

  const abrirNova = () => {
    setForm(emptyForm);
    setModalOpen(true);
  };

  const preencherSalario = (colabId) => {
    const c = colaboradores.find(x => x.id === colabId);
    if (c) setForm(f => ({ ...f, colaborador_id: colabId, salario_base: String(c.salario_base || '') }));
  };

  const salvar = async () => {
    if (!form.colaborador_id || !form.mes_referencia) return toast.error('Preencha colaborador e mês');
    setSaving(true);
    const colab = colaboradores.find(c => c.id === form.colaborador_id);
    const liquido = calcLiquido(form);
    const payload = {
      empresa_id: user?.empresa_id,
      colaborador_id: form.colaborador_id,
      colaborador_nome: colab?.nome || '',
      mes_referencia: form.mes_referencia,
      data_pagamento: form.data_pagamento || null,
      salario_base: parseFloat(form.salario_base) || 0,
      dias_trabalhados: parseFloat(form.dias_trabalhados) || 30,
      valor_comissao: parseFloat(form.valor_comissao) || 0,
      bonificacoes: parseFloat(form.bonificacoes) || 0,
      adiantamentos: parseFloat(form.adiantamentos) || 0,
      descontos: parseFloat(form.descontos) || 0,
      valor_liquido: liquido,
      status: 'Rascunho',
      observacoes: form.observacoes
    };
    await base44.entities.FolhaSalarial.create(payload);
    toast.success('Folha criada!');
    setSaving(false);
    setModalOpen(false);
    carregar(user);
  };

  const atualizarStatus = async (folha, novoStatus) => {
    const hoje = new Date().toISOString().split('T')[0];

    // Se Paga → criar despesa de pagamento de salário
    if (novoStatus === 'Paga' && !folha.transacao_id) {
      const despesa = await base44.entities.Despesa.create({
        empresa_id: folha.empresa_id,
        descricao: `Pagamento de Salário - ${folha.colaborador_nome} - ${folha.mes_referencia}`,
        valor: folha.valor_liquido,
        data: folha.data_pagamento || hoje,
        data_pagamento: folha.data_pagamento || hoje,
        categoria: 'Folha Salarial',
        status: 'pago',
      });
      await base44.entities.FolhaSalarial.update(folha.id, { status: novoStatus, transacao_id: despesa.id });
    } else {
      await base44.entities.FolhaSalarial.update(folha.id, { status: novoStatus });
    }

    toast.success(`Status atualizado para ${novoStatus}`);
    carregar(user);
  };

  const gerarPDF = async (folha) => {
    setGerandoPdf(folha.id);
    const colab = colaboradores.find(c => c.id === folha.colaborador_id);
    const doc = new jsPDF();

    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('RECIBO DE PAGAMENTO DE SALÁRIO', 20, 20);

    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.text('EMPRESA: JD PROMOTORA', 20, 32);
    doc.text('CNPJ: 28.845.490/0001-46', 20, 40);

    doc.line(20, 46, 190, 46);

    doc.setFont('helvetica', 'bold');
    doc.text('COLABORADOR:', 20, 54);
    doc.setFont('helvetica', 'normal');
    doc.text(folha.colaborador_nome || '-', 70, 54);

    doc.setFont('helvetica', 'bold');
    doc.text('CPF:', 20, 62);
    doc.setFont('helvetica', 'normal');
    doc.text(colab?.cpf || '-', 70, 62);

    doc.setFont('helvetica', 'bold');
    doc.text('CARGO:', 20, 70);
    doc.setFont('helvetica', 'normal');
    doc.text(colab?.cargo || '-', 70, 70);

    doc.setFont('helvetica', 'bold');
    doc.text('MÊS DE REFERÊNCIA:', 20, 78);
    doc.setFont('helvetica', 'normal');
    doc.text(folha.mes_referencia || '-', 90, 78);

    doc.line(20, 84, 190, 84);

    const fmt = (v) => `R$ ${Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;

    let y = 94;
    const linha = (label, valor, bold = false) => {
      if (bold) doc.setFont('helvetica', 'bold');
      else doc.setFont('helvetica', 'normal');
      doc.text(label, 20, y);
      doc.text(fmt(valor), 150, y, { align: 'right' });
      y += 9;
    };

    linha('SALÁRIO BASE:', folha.salario_base);
    linha(`DIAS TRABALHADOS: ${folha.dias_trabalhados || 30}`, '');
    linha('COMISSÕES:', folha.valor_comissao);
    linha('BONIFICAÇÕES:', folha.bonificacoes);

    doc.line(20, y, 190, y); y += 6;

    linha('ADIANTAMENTOS (-):', folha.adiantamentos);
    linha('DESCONTOS (-):', folha.descontos);

    doc.line(20, y, 190, y); y += 6;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text('VALOR LÍQUIDO:', 20, y);
    doc.text(fmt(folha.valor_liquido), 190, y, { align: 'right' });
    y += 12;

    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    if (folha.data_pagamento) {
      doc.text(`DATA DO PAGAMENTO: ${format(new Date(folha.data_pagamento + 'T00:00:00'), 'dd/MM/yyyy')}`, 20, y);
      y += 10;
    }

    doc.line(20, y, 190, y); y += 16;

    doc.text('Declaro que recebi o valor acima descrito.', 20, y); y += 16;

    doc.text('ASSINATURA: _______________________________', 20, y);

    doc.save(`recibo_${folha.colaborador_nome?.replace(/ /g, '_')}_${folha.mes_referencia?.replace('/', '-')}.pdf`);
    setGerandoPdf(null);
    toast.success('PDF gerado!');
  };

  const fmt = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  const filtradas = folhas.filter(f => {
    const okMes = !mesF || f.mes_referencia?.includes(mesF);
    const okColab = colabF === 'todos' || f.colaborador_id === colabF;
    const okStatus = statusF === 'todos' || f.status === statusF;
    return okMes && okColab && okStatus;
  });

  const totalMes = filtradas.reduce((s, f) => s + (f.valor_liquido || 0), 0);
  const totalPagas = filtradas.filter(f => f.status === 'Paga' || f.status === 'Assinada').reduce((s, f) => s + (f.valor_liquido || 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Folha Salarial</h1>
          <p className="text-slate-500 text-sm">Controle de pagamentos e recibos</p>
        </div>
        <Button onClick={abrirNova} className="bg-[#10353C] hover:bg-[#10353C]/90 gap-2">
          <Plus className="w-4 h-4" /> Nova Folha
        </Button>
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
                        <Badge className={STATUS_CORES[f.status] || 'bg-gray-100 text-gray-600'}>{f.status}</Badge>
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
                            <Button size="sm" className="text-xs bg-green-600 hover:bg-green-700" onClick={() => atualizarStatus(f, 'Paga')}>Pagar</Button>
                          )}
                          {f.status === 'Paga' && (
                            <Button size="sm" variant="outline" className="text-xs" onClick={() => atualizarStatus(f, 'Assinada')}>Assinar</Button>
                          )}
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
                <Input type="number" value={form.salario_base} onChange={e => setForm({...form, salario_base: e.target.value})} />
              </div>
              <div>
                <Label>Dias Trabalhados</Label>
                <Input type="number" value={form.dias_trabalhados} onChange={e => setForm({...form, dias_trabalhados: e.target.value})} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Comissões (+)</Label>
                <Input type="number" value={form.valor_comissao} onChange={e => setForm({...form, valor_comissao: e.target.value})} />
              </div>
              <div>
                <Label>Bonificações (+)</Label>
                <Input type="number" value={form.bonificacoes} onChange={e => setForm({...form, bonificacoes: e.target.value})} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Adiantamentos (-)</Label>
                <Input type="number" value={form.adiantamentos} onChange={e => setForm({...form, adiantamentos: e.target.value})} />
              </div>
              <div>
                <Label>Descontos (-)</Label>
                <Input type="number" value={form.descontos} onChange={e => setForm({...form, descontos: e.target.value})} />
              </div>
            </div>
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
              <div className="border-t pt-3 flex justify-between font-bold text-lg">
                <span>Valor Líquido</span><span className="text-green-700">{fmt(viewModal.valor_liquido)}</span>
              </div>
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