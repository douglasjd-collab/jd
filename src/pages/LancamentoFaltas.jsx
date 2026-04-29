import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { UserX, Plus, Trash2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

const fmt = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export default function LancamentoFaltas() {
  const [user, setUser] = useState(null);
  const [colaboradores, setColaboradores] = useState([]);
  const [folhas, setFolhas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // form
  const [colabId, setColabId] = useState('');
  const [dataFalta, setDataFalta] = useState('');
  const [perderDSR, setPerderDSR] = useState(false);
  const [perderFeriado, setPerderFeriado] = useState(false);
  const [observacao, setObservacao] = useState('');

  // filtros lista
  const [filtroColab, setFiltroColab] = useState('todos');
  const [filtroMes, setFiltroMes] = useState('');

  // faltas já lançadas: buscamos nas observações das folhas
  const [registros, setRegistros] = useState([]);

  useEffect(() => {
    base44.auth.me().then(me => {
      setUser(me);
      carregar(me);
    });
  }, []);

  const carregar = async (me) => {
    setLoading(true);
    const filtro = me?.empresa_id ? { empresa_id: me.empresa_id } : {};
    const [cols, fols] = await Promise.all([
      base44.entities.FuncionarioColaborador.filter(filtro, 'nome', 200),
      base44.entities.FolhaSalarial.filter(filtro, '-created_date', 500),
    ]);
    setColaboradores(cols);
    setFolhas(fols);

    // Extrair registros de faltas das observações
    const regs = [];
    fols.forEach(f => {
      if (!f.observacoes) return;
      const blocos = f.observacoes.split('\n\n');
      blocos.forEach(bloco => {
        if (!bloco.startsWith('Falta em ')) return;
        regs.push({
          folha_id: f.id,
          colaborador_nome: f.colaborador_nome,
          mes_referencia: f.mes_referencia,
          bloco,
        });
      });
    });
    setRegistros(regs);
    setLoading(false);
  };

  const colab = colaboradores.find(c => c.id === colabId);
  const valorDia = (colab?.salario_base || 0) / 30;

  // Encontrar a folha do colaborador para o mês da falta
  const mesFalta = dataFalta
    ? `${String(new Date(dataFalta + 'T00:00:00').getMonth() + 1).padStart(2, '0')}/${new Date(dataFalta + 'T00:00:00').getFullYear()}`
    : '';

  const folhaDoColab = folhas.find(
    f => f.colaborador_id === colabId && f.mes_referencia === mesFalta
  );

  const itensDesconto = () => {
    const lista = [];
    if (dataFalta) {
      const dataFormatada = format(new Date(dataFalta + 'T00:00:00'), 'dd/MM/yyyy');
      lista.push({ label: `Falta injustificada (${dataFormatada})`, valor: valorDia });
    }
    if (perderDSR) lista.push({ label: 'Perda do DSR (domingo)', valor: valorDia });
    if (perderFeriado) lista.push({ label: 'Perda do feriado', valor: valorDia });
    return lista;
  };

  const totalDesconto = itensDesconto().reduce((s, i) => s + i.valor, 0);

  const lancar = async () => {
    if (!colabId) return toast.error('Selecione o colaborador');
    if (!dataFalta) return toast.error('Informe a data da falta');
    if (!folhaDoColab) return toast.error(`Não existe folha salarial para ${colab?.nome} no mês ${mesFalta}. Crie a folha primeiro.`);

    setSaving(true);
    const dataFormatada = format(new Date(dataFalta + 'T00:00:00'), 'dd/MM/yyyy');
    const itens = itensDesconto();
    const linhasObs = itens.map(i => `• ${i.label}: -${fmt(i.valor)}`).join('\n');
    const novaLinhaObs = `Falta em ${dataFormatada}:\n${linhasObs}\nTotal descontado: -${fmt(totalDesconto)}`;
    const obsAtual = folhaDoColab.observacoes || '';
    const novaObs = obsAtual ? `${obsAtual}\n\n${novaLinhaObs}` : novaLinhaObs;

    const obsComUserObs = observacao ? `${novaObs}\nObs: ${observacao}` : novaObs;

    await base44.entities.FolhaSalarial.update(folhaDoColab.id, {
      dias_trabalhados: Math.max(0, (folhaDoColab.dias_trabalhados || 30) - 1),
      descontos: (folhaDoColab.descontos || 0) + totalDesconto,
      valor_liquido: (folhaDoColab.valor_liquido || 0) - totalDesconto,
      observacoes: obsComUserObs,
    });

    toast.success(`Falta lançada para ${colab?.nome} — desconto de ${fmt(totalDesconto)}`);
    setSaving(false);
    setModalOpen(false);
    resetForm();
    carregar(user);
  };

  const resetForm = () => {
    setColabId('');
    setDataFalta('');
    setPerderDSR(false);
    setPerderFeriado(false);
    setObservacao('');
  };

  const registrosFiltrados = registros.filter(r => {
    const okColab = filtroColab === 'todos' || colaboradores.find(c => c.nome === r.colaborador_nome && c.id === filtroColab);
    const okMes = !filtroMes || r.mes_referencia?.includes(filtroMes);
    return okColab && okMes;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Lançamento de Faltas</h1>
          <p className="text-slate-500 text-sm">Registre faltas e aplique descontos automaticamente na folha salarial</p>
        </div>
        <Button onClick={() => setModalOpen(true)} className="bg-orange-600 hover:bg-orange-700 gap-2">
          <Plus className="w-4 h-4" /> Lançar Falta
        </Button>
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-3">
            <Input
              className="w-36"
              placeholder="Mês (04/2026)"
              value={filtroMes}
              onChange={e => setFiltroMes(e.target.value)}
            />
            <Select value={filtroColab} onValueChange={setFiltroColab}>
              <SelectTrigger className="w-48"><SelectValue placeholder="Colaborador" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos colaboradores</SelectItem>
                {colaboradores.map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Lista de faltas registradas */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center text-slate-500">Carregando...</div>
          ) : registrosFiltrados.length === 0 ? (
            <div className="p-8 text-center text-slate-500">
              <UserX className="w-12 h-12 mx-auto mb-2 opacity-30" />
              <p>Nenhuma falta registrada</p>
            </div>
          ) : (
            <div className="divide-y">
              {registrosFiltrados.map((r, i) => (
                <div key={i} className="p-4 flex flex-col sm:flex-row sm:items-start gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-slate-800">{r.colaborador_nome}</span>
                      <Badge className="bg-slate-100 text-slate-600 text-xs">{r.mes_referencia}</Badge>
                    </div>
                    <pre className="text-sm text-slate-600 whitespace-pre-wrap font-sans">{r.bloco}</pre>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modal Lançar Falta */}
      <Dialog open={modalOpen} onOpenChange={(v) => { if (!v) resetForm(); setModalOpen(v); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserX className="w-5 h-5 text-orange-500" /> Lançar Falta
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">

            {/* Colaborador */}
            <div>
              <Label>Colaborador *</Label>
              <Select value={colabId} onValueChange={setColabId}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  {colaboradores.filter(c => c.status === 'Ativo').map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Info salário */}
            {colab && (
              <div className="bg-slate-50 rounded-lg p-3 text-sm space-y-1">
                <p><span className="text-slate-500">Salário base:</span> <strong>{fmt(colab.salario_base)}</strong></p>
                <p><span className="text-slate-500">Valor por dia (÷30):</span> <span className="font-semibold text-orange-600">{fmt(valorDia)}</span></p>
              </div>
            )}

            {/* Data da falta */}
            <div>
              <Label>Data da falta *</Label>
              <Input
                type="date"
                value={dataFalta}
                onChange={e => setDataFalta(e.target.value)}
                className="mt-1"
              />
            </div>

            {/* Aviso folha */}
            {colabId && dataFalta && !folhaDoColab && (
              <div className="flex items-start gap-2 bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm text-yellow-800">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <p>Nenhuma folha salarial encontrada para <strong>{colab?.nome}</strong> em <strong>{mesFalta}</strong>. Crie a folha primeiro em "Folha Salarial".</p>
              </div>
            )}

            {folhaDoColab && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-2 text-xs text-green-700">
                ✓ Folha encontrada: {folhaDoColab.mes_referencia} — {folhaDoColab.status}
              </div>
            )}

            {/* Checkboxes */}
            <div className="space-y-2">
              <p className="text-sm font-medium text-slate-700">Perdas adicionais na semana da falta:</p>
              <label className="flex items-center gap-3 p-2 rounded-lg border cursor-pointer hover:bg-orange-50">
                <input type="checkbox" checked={perderDSR} onChange={e => setPerderDSR(e.target.checked)} className="w-4 h-4 accent-orange-500" />
                <div className="flex-1">
                  <p className="text-sm font-medium">Perda do DSR (Domingo)</p>
                  <p className="text-xs text-slate-500">A falta injustificada cancela o descanso semanal remunerado</p>
                </div>
                <span className="text-sm font-semibold text-red-500">-{fmt(valorDia)}</span>
              </label>
              <label className="flex items-center gap-3 p-2 rounded-lg border cursor-pointer hover:bg-orange-50">
                <input type="checkbox" checked={perderFeriado} onChange={e => setPerderFeriado(e.target.checked)} className="w-4 h-4 accent-orange-500" />
                <div className="flex-1">
                  <p className="text-sm font-medium">Perda do Feriado</p>
                  <p className="text-xs text-slate-500">Feriado na mesma semana da falta também é descontado</p>
                </div>
                <span className="text-sm font-semibold text-red-500">-{fmt(valorDia)}</span>
              </label>
            </div>

            {/* Resumo */}
            {dataFalta && colabId && (
              <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 space-y-1">
                <p className="text-xs font-semibold text-orange-700 uppercase tracking-wide mb-2">Resumo do desconto</p>
                {itensDesconto().map((it, i) => (
                  <div key={i} className="flex justify-between text-sm">
                    <span className="text-slate-600">{it.label}</span>
                    <span className="font-medium text-red-600">-{fmt(it.valor)}</span>
                  </div>
                ))}
                <div className="border-t border-orange-200 pt-2 mt-2 flex justify-between font-bold">
                  <span className="text-orange-800">Total a descontar</span>
                  <span className="text-orange-800 text-lg">-{fmt(totalDesconto)}</span>
                </div>
              </div>
            )}

            {/* Observação */}
            <div>
              <Label>Observação (opcional)</Label>
              <textarea
                className="w-full border rounded-md p-2 text-sm min-h-[52px] mt-1"
                value={observacao}
                onChange={e => setObservacao(e.target.value)}
                placeholder="Ex: Falta sem aviso prévio"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => { resetForm(); setModalOpen(false); }}>Cancelar</Button>
            <Button
              onClick={lancar}
              disabled={saving || !colabId || !dataFalta || !folhaDoColab}
              className="bg-orange-600 hover:bg-orange-700"
            >
              {saving ? 'Salvando...' : 'Confirmar Falta'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}