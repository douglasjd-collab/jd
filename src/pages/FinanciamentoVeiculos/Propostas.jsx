import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Search, Eye, Pencil, Trash2 } from 'lucide-react';
import PropostaFinanciamentoModal from '@/components/financiamento/PropostaFinanciamentoModal';
import { toast } from 'sonner';

const STATUS_LABELS = {
  em_analise: { label: 'Em análise', color: 'bg-blue-100 text-blue-700' },
  aguardando_documentacao: { label: 'Aguardando Doc.', color: 'bg-yellow-100 text-yellow-700' },
  aprovado: { label: 'Aprovado', color: 'bg-green-100 text-green-700' },
  reprovado: { label: 'Reprovado', color: 'bg-red-100 text-red-700' },
  contrato_emitido: { label: 'Contrato Emitido', color: 'bg-purple-100 text-purple-700' },
  pago: { label: 'Pago / Finalizado', color: 'bg-emerald-100 text-emerald-700' },
  cancelado: { label: 'Cancelado', color: 'bg-gray-100 text-gray-600' },
};

const TIPO_LABELS = { carro: 'Carro', moto: 'Moto', caminhao: 'Caminhão' };

export default function PropostasFinanciamento() {
  const [user, setUser] = useState(null);
  const [propostas, setPropostas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState('');
  const [filtroStatus, setFiltroStatus] = useState('all');
  const [filtroTipo, setFiltroTipo] = useState('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [propostaSelecionada, setPropostaSelecionada] = useState(null);

  useEffect(() => {
    base44.auth.me().then(setUser).catch(() => {});
  }, []);

  useEffect(() => {
    if (!user) return;
    carregarPropostas();
  }, [user]);

  const carregarPropostas = async () => {
    setLoading(true);
    const filtro = user?.empresa_id ? { empresa_id: user.empresa_id } : {};
    const data = await base44.entities.FinanciamentoVeiculo.filter(filtro, '-created_date', 1000);
    setPropostas(data);
    setLoading(false);
  };

  const handleSalvar = async (dados) => {
    const empresaId = user?.empresa_id;
    if (propostaSelecionada) {
      await base44.entities.FinanciamentoVeiculo.update(propostaSelecionada.id, dados);
      toast.success('Proposta atualizada!');
    } else {
      const count = propostas.length + 1;
      await base44.entities.FinanciamentoVeiculo.create({
        ...dados,
        empresa_id: empresaId,
        numero_proposta: `FIN${String(count).padStart(4, '0')}`,
      });
      toast.success('Proposta cadastrada!');
    }
    setModalOpen(false);
    setPropostaSelecionada(null);
    carregarPropostas();
  };

  const handleExcluir = async (id) => {
    if (!confirm('Confirmar exclusão?')) return;
    await base44.entities.FinanciamentoVeiculo.delete(id);
    toast.success('Proposta excluída!');
    carregarPropostas();
  };

  const propostasFiltradas = propostas.filter(p => {
    if (filtroStatus !== 'all' && p.status !== filtroStatus) return false;
    if (filtroTipo !== 'all' && p.tipo_veiculo !== filtroTipo) return false;
    if (busca) {
      const b = busca.toLowerCase();
      if (!(p.cliente_nome?.toLowerCase().includes(b) || p.cliente_cpf?.includes(b) || p.veiculo_marca?.toLowerCase().includes(b) || p.numero_proposta?.toLowerCase().includes(b))) return false;
    }
    return true;
  });

  const fmt = (v) => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-800">Propostas de Financiamento</h1>
        <Button onClick={() => { setPropostaSelecionada(null); setModalOpen(true); }} className="bg-[#10353C] hover:bg-[#10353C]/90">
          <Plus className="w-4 h-4 mr-2" /> Nova Proposta
        </Button>
      </div>

      <div className="bg-white rounded-xl border p-4 flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input placeholder="Buscar por cliente, CPF, marca..." className="pl-9" value={busca} onChange={e => setBusca(e.target.value)} />
        </div>
        <Select value={filtroStatus} onValueChange={setFiltroStatus}>
          <SelectTrigger className="w-48"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os status</SelectItem>
            {Object.entries(STATUS_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
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

      <div className="bg-white rounded-xl border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 font-semibold text-slate-600">Proposta</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600">Cliente</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600">Veículo</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600">Banco</th>
                <th className="text-right px-4 py-3 font-semibold text-slate-600">Vr. Financiado</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600">Status</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600">Vendedor</th>
                <th className="text-center px-4 py-3 font-semibold text-slate-600">Ações</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} className="text-center py-10 text-slate-400">Carregando...</td></tr>
              ) : propostasFiltradas.length === 0 ? (
                <tr><td colSpan={8} className="text-center py-10 text-slate-400">Nenhuma proposta encontrada</td></tr>
              ) : propostasFiltradas.map(p => (
                <tr key={p.id} className="border-b last:border-0 hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-700">{p.numero_proposta || '—'}</td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-700">{p.cliente_nome}</p>
                    <p className="text-xs text-slate-400">{p.cliente_cpf}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-slate-700">{p.veiculo_marca} {p.veiculo_modelo}</p>
                    <p className="text-xs text-slate-400">{TIPO_LABELS[p.tipo_veiculo]} • {p.veiculo_ano}</p>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{p.banco || '—'}</td>
                  <td className="px-4 py-3 text-right font-medium text-slate-700">{fmt(p.valor_financiado)}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${STATUS_LABELS[p.status]?.color || 'bg-gray-100 text-gray-600'}`}>
                      {STATUS_LABELS[p.status]?.label || p.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{p.vendedor_nome || '—'}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-1">
                      <button onClick={() => { setPropostaSelecionada(p); setModalOpen(true); }} className="p-1.5 hover:bg-slate-100 rounded-lg" title="Editar">
                        <Pencil className="w-4 h-4 text-slate-500" />
                      </button>
                      <button onClick={() => handleExcluir(p.id)} className="p-1.5 hover:bg-red-50 rounded-lg" title="Excluir">
                        <Trash2 className="w-4 h-4 text-red-400" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <PropostaFinanciamentoModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        proposta={propostaSelecionada}
        onSalvar={handleSalvar}
        user={user}
      />
    </div>
  );
}