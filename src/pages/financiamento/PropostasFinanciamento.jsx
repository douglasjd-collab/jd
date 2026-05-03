import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { Plus, Search, Edit2, Trash2, ChevronDown, ChevronUp, Car, Bike } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import PropostaFinanciamentoModal from '@/components/financiamento/PropostaFinanciamentoModal';

const STATUS_LABELS = {
  em_analise: 'Em análise',
  aguardando_documentacao: 'Aguard. Documentação',
  aprovado: 'Aprovado',
  reprovado: 'Reprovado',
  contrato_emitido: 'Contrato Emitido',
  pago: 'Pago / Finalizado',
  cancelado: 'Cancelado',
};

const STATUS_COLORS = {
  em_analise: 'bg-yellow-100 text-yellow-800',
  aguardando_documentacao: 'bg-blue-100 text-blue-800',
  aprovado: 'bg-green-100 text-green-800',
  reprovado: 'bg-red-100 text-red-800',
  contrato_emitido: 'bg-purple-100 text-purple-800',
  pago: 'bg-emerald-100 text-emerald-800',
  cancelado: 'bg-gray-100 text-gray-700',
};

function fmt(val) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val || 0);
}

export default function PropostasFinanciamento({ user }) {
  const [propostas, setPropostas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState('');
  const [filtroStatus, setFiltroStatus] = useState('all');
  const [filtroTipo, setFiltroTipo] = useState('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [propostaSelecionada, setPropostaSelecionada] = useState(null);

  const empresaId = user?.empresa_id;

  const carregar = async () => {
    setLoading(true);
    const filtro = empresaId ? { empresa_id: empresaId } : {};
    const data = await base44.entities.FinanciamentoVeiculo.filter(filtro, '-created_date', 500);
    setPropostas(data || []);
    setLoading(false);
  };

  useEffect(() => { carregar(); }, [empresaId]);

  const filtradas = propostas.filter(p => {
    if (filtroStatus !== 'all' && p.status !== filtroStatus) return false;
    if (filtroTipo !== 'all' && p.tipo_veiculo !== filtroTipo) return false;
    if (busca) {
      const q = busca.toLowerCase();
      return (p.cliente_nome || '').toLowerCase().includes(q) ||
        (p.cliente_cpf || '').includes(q) ||
        (p.numero_proposta || '').toLowerCase().includes(q) ||
        (p.veiculo_modelo || '').toLowerCase().includes(q);
    }
    return true;
  });

  const handleNova = () => { setPropostaSelecionada(null); setModalOpen(true); };
  const handleEditar = (p) => { setPropostaSelecionada(p); setModalOpen(true); };
  const handleExcluir = async (id) => {
    if (!confirm('Deseja excluir esta proposta?')) return;
    await base44.entities.FinanciamentoVeiculo.delete(id);
    carregar();
  };

  const handleSalvar = async (dados) => {
    const base = { ...dados, empresa_id: empresaId };
    if (propostaSelecionada?.id) {
      await base44.entities.FinanciamentoVeiculo.update(propostaSelecionada.id, base);
      toast.success('Proposta atualizada!');
    } else {
      if (!base.numero_proposta) {
        const todas = await base44.entities.FinanciamentoVeiculo.filter({ empresa_id: empresaId }, '-created_date', 200);
        base.numero_proposta = `FIN${String((todas.length || 0) + 1).padStart(4, '0')}`;
      }
      await base44.entities.FinanciamentoVeiculo.create(base);
      toast.success('Proposta cadastrada!');
    }
    setModalOpen(false);
    carregar();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-xl font-bold text-slate-800">Propostas — Financiamento de Veículos</h2>
        <Button onClick={handleNova} className="bg-blue-600 hover:bg-blue-700 text-white gap-2">
          <Plus className="w-4 h-4" /> Nova Proposta
        </Button>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-3 bg-white p-3 rounded-xl border">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input placeholder="Buscar por cliente, CPF, modelo..." className="pl-9" value={busca} onChange={e => setBusca(e.target.value)} />
        </div>
        <Select value={filtroStatus} onValueChange={setFiltroStatus}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os status</SelectItem>
            {Object.entries(STATUS_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filtroTipo} onValueChange={setFiltroTipo}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Tipo" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="carro">Carro</SelectItem>
            <SelectItem value="moto">Moto</SelectItem>
            <SelectItem value="caminhao">Caminhão</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Tabela */}
      <div className="bg-white rounded-xl border overflow-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b">
            <tr>
              <th className="text-left px-4 py-3 font-semibold text-slate-600">Proposta</th>
              <th className="text-left px-4 py-3 font-semibold text-slate-600">Cliente</th>
              <th className="text-left px-4 py-3 font-semibold text-slate-600">Veículo</th>
              <th className="text-left px-4 py-3 font-semibold text-slate-600">Banco</th>
              <th className="text-right px-4 py-3 font-semibold text-slate-600">Valor Fin.</th>
              <th className="text-left px-4 py-3 font-semibold text-slate-600">Vendedor</th>
              <th className="text-left px-4 py-3 font-semibold text-slate-600">Status</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} className="text-center py-10 text-slate-400">Carregando...</td></tr>
            ) : filtradas.length === 0 ? (
              <tr><td colSpan={8} className="text-center py-10 text-slate-400">Nenhuma proposta encontrada</td></tr>
            ) : filtradas.map(p => (
              <tr key={p.id} className="border-b hover:bg-slate-50 transition-colors">
                <td className="px-4 py-3 font-mono text-xs text-slate-500">{p.numero_proposta || '—'}</td>
                <td className="px-4 py-3">
                  <p className="font-medium text-slate-800">{p.cliente_nome}</p>
                  <p className="text-xs text-slate-500">{p.cliente_cpf}</p>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1">
                    {p.tipo_veiculo === 'moto' ? <Bike className="w-4 h-4 text-orange-500" /> : <Car className="w-4 h-4 text-blue-500" />}
                    <span>{p.veiculo_marca} {p.veiculo_modelo} {p.veiculo_ano}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-slate-600">{p.banco || '—'}</td>
                <td className="px-4 py-3 text-right font-semibold text-slate-800">{fmt(p.valor_financiado)}</td>
                <td className="px-4 py-3 text-slate-600">{p.vendedor_nome || '—'}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${STATUS_COLORS[p.status]}`}>
                    {STATUS_LABELS[p.status]}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-1 justify-end">
                    <button onClick={() => handleEditar(p)} className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button onClick={() => handleExcluir(p.id)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <PropostaFinanciamentoModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        proposta={propostaSelecionada}
        user={user}
        onSalvar={handleSalvar}
      />
    </div>
  );
}