import React, { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Plus, Loader2, Wallet, CheckCircle2, Clock } from 'lucide-react';
import { toast } from 'sonner';
import FiltrosAdiantamentos from '@/components/adiantamentos/FiltrosAdiantamentos';
import AdiantamentoTabela from '@/components/adiantamentos/AdiantamentoTabela';
import AdiantamentoCard from '@/components/adiantamentos/AdiantamentoCard';
import AdiantamentoFormModal from '@/components/adiantamentos/AdiantamentoFormModal';
import AdiantamentoDetalhesModal from '@/components/adiantamentos/AdiantamentoDetalhesModal';
import { fmt, escapeRegex, nomeRecebedor } from '@/components/adiantamentos/adiantamentoHelpers';

const FILTROS_INICIAIS = {
  busca: '',
  status: 'pendente',
  pessoaTipo: 'todos',
  recebedor: 'todos',
  dataInicio: '',
  dataFim: '',
};

export default function Adiantamentos() {
  const [user, setUser] = useState(null);
  const [filtros, setFiltros] = useState(FILTROS_INICIAIS);
  const [formOpen, setFormOpen] = useState(false);
  const [editando, setEditando] = useState(null);
  const [detalhesId, setDetalhesId] = useState(null);
  const queryClient = useQueryClient();

  useEffect(() => { loadUser(); }, []);

  const loadUser = async () => {
    const me = await base44.auth.me();
    if (me.role === 'super_admin') {
      setUser({ ...me, perfil: 'super_admin', empresa_id: null });
    } else {
      const colabs = await base44.entities.Colaborador.filter({ user_id: me.id }, '-created_date');
      const c = colabs.find((col) => col.status === 'ativo') || colabs[0];
      if (c) {
        setUser({ ...me, perfil: c.perfil, empresa_id: c.empresa_id, colaborador_id: c.id });
      }
    }
  };

  // Perfis administrativos enxergam toda a empresa; parceiro/vendedor enxergam apenas os próprios adiantamentos
  const perfilUsuario = user?.perfil || (user?.role === 'admin' ? 'admin' : '');
  const isAdmin = ['master', 'super_admin', 'admin', 'gerente'].includes(perfilUsuario);

  const baseFiltro = useMemo(() => {
    const f = {};
    if (user?.empresa_id) f.empresa_id = user.empresa_id;
    if (user && !isAdmin) f.colaborador_id = user.colaborador_id || user.id;
    return f;
  }, [user, isAdmin]);

  // Resumo geral (não muda com os filtros) — mesmas regras atuais: soma do valor por status
  const { data: resumo } = useQuery({
    queryKey: ['adiantamentos-resumo', baseFiltro],
    queryFn: () => base44.entities.Adiantamento.aggregate({ query: baseFiltro, groupBy: 'status', sum: 'valor' }),
    enabled: !!user,
  });
  const somaPorStatus = (status) => resumo?.rows?.find(r => r.status === status)?.sum_valor || 0;
  const totalPendente = somaPorStatus('pendente');
  const totalDescontado = somaPorStatus('descontado');

  const { data: adiantamentos = [], isLoading, isFetching } = useQuery({
    queryKey: ['adiantamentos', baseFiltro, filtros],
    queryFn: async () => {
      const query = { ...baseFiltro };
      if (filtros.status !== 'todos') query.status = filtros.status;
      if (filtros.pessoaTipo !== 'todos') query.pessoa_tipo = filtros.pessoaTipo;
      if (filtros.dataInicio || filtros.dataFim) {
        query.data = {
          ...(filtros.dataInicio ? { $gte: filtros.dataInicio } : {}),
          ...(filtros.dataFim ? { $lte: filtros.dataFim } : {}),
        };
      }

      const condicoes = [];
      if (filtros.recebedor !== 'todos') {
        condicoes.push({ $or: [{ colaborador_nome: filtros.recebedor }, { parceiro_nome: filtros.recebedor }] });
      }
      const busca = filtros.busca.trim();
      if (busca) {
        const regex = { $regex: escapeRegex(busca), $options: 'i' };
        condicoes.push({ $or: [{ colaborador_nome: regex }, { parceiro_nome: regex }, { motivo: regex }] });
      }
      if (condicoes.length) query.$and = condicoes;

      const pagina = await base44.entities.Adiantamento.filter(query, { sort: '-data', limit: 500 });
      return pagina.items || [];
    },
    enabled: !!user,
  });

  const { data: recebedores = [] } = useQuery({
    queryKey: ['adiantamentos-recebedores', baseFiltro],
    queryFn: async () => {
      const [c, p] = await Promise.all([
        base44.entities.Adiantamento.filter(baseFiltro, { distinct: 'colaborador_nome' }),
        base44.entities.Adiantamento.filter(baseFiltro, { distinct: 'parceiro_nome' }),
      ]);
      return [...new Set([...(c.items || []), ...(p.items || [])].filter(Boolean))]
        .sort((a, b) => a.localeCompare(b, 'pt-BR'));
    },
    enabled: !!user,
  });

  const { data: colaboradores = [] } = useQuery({
    queryKey: ['colab-adi', user?.empresa_id],
    queryFn: () => {
      const f = { status: 'ativo' };
      if (user?.empresa_id) f.empresa_id = user.empresa_id;
      return base44.entities.Colaborador.filter(f, 'nome', 200);
    },
    enabled: !!user && isAdmin,
  });

  const { data: parceiros = [] } = useQuery({
    queryKey: ['parceiros-adi', user?.empresa_id],
    queryFn: () => {
      const f = {};
      if (user?.empresa_id) f.empresa_id = user.empresa_id;
      return base44.entities.EmpresaParceira.filter(f, 'nome', 200);
    },
    enabled: !!user && isAdmin,
  });

  const invalidar = () => {
    queryClient.invalidateQueries({ queryKey: ['adiantamentos'] });
    queryClient.invalidateQueries({ queryKey: ['adiantamentos-resumo'] });
    queryClient.invalidateQueries({ queryKey: ['adiantamentos-recebedores'] });
  };

  const abrirNovo = () => { setEditando(null); setFormOpen(true); };
  const abrirEdicao = (adi) => { setDetalhesId(null); setEditando(adi); setFormOpen(true); };
  const abrirDetalhes = (adi) => setDetalhesId(adi.id);

  const adiantamentoDetalhes = adiantamentos.find(a => a.id === detalhesId) || null;

  const handleCancelar = async (adi) => {
    if (!confirm(`Cancelar o adiantamento de ${nomeRecebedor(adi)}?`)) return;
    try {
      await base44.entities.Adiantamento.update(adi.id, { status: 'cancelado' });
      invalidar();
      toast.success('Adiantamento cancelado');
    } catch (e) {
      toast.error('Não foi possível cancelar o adiantamento.');
    }
  };

  const salvarComprovantes = async (adi, lista) => {
    await base44.entities.Adiantamento.update(adi.id, { comprovantes_json: JSON.stringify(lista) });
    invalidar();
  };

  const filtrosAtivos = Object.keys(FILTROS_INICIAIS).some(k => filtros[k] !== FILTROS_INICIAIS[k]);

  if (!user) {
    return <div className="p-6 flex items-center gap-2 text-slate-500"><Loader2 className="w-4 h-4 animate-spin" /> Carregando...</div>;
  }

  return (
    <div className="p-4 lg:p-6 max-w-7xl mx-auto space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl lg:text-2xl font-bold text-slate-900">Adiantamentos</h1>
          <p className="text-slate-500 text-sm mt-1">Gerencie adiantamentos para parceiros, vendedores, colaboradores, gerentes e administradores.</p>
        </div>
        {isAdmin && (
          <Button onClick={abrirNovo} className="bg-[#10353C] hover:bg-[#1a5060] text-white flex-shrink-0">
            <Plus className="w-4 h-4 mr-2" /> Novo Adiantamento
          </Button>
        )}
      </div>

      {/* Indicadores */}
      <div className="grid grid-cols-2 gap-3 lg:gap-4">
        <Card className="p-4 flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-orange-100 flex items-center justify-center flex-shrink-0">
            <Clock className="w-5 h-5 text-orange-600" />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-slate-500">Total Pendente</p>
            <p className="text-base lg:text-lg font-bold text-orange-700 truncate">{fmt(totalPendente)}</p>
          </div>
        </Card>
        <Card className="p-4 flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-green-100 flex items-center justify-center flex-shrink-0">
            <CheckCircle2 className="w-5 h-5 text-green-600" />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-slate-500">Total Descontado</p>
            <p className="text-base lg:text-lg font-bold text-green-700 truncate">{fmt(totalDescontado)}</p>
          </div>
        </Card>
      </div>

      {/* Busca e filtros */}
      <FiltrosAdiantamentos filtros={filtros} onChange={setFiltros} recebedores={recebedores} />

      {/* Lista */}
      {isLoading ? (
        <Card className="p-8 text-center text-slate-400">
          <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />Carregando...
        </Card>
      ) : adiantamentos.length === 0 ? (
        <Card className="p-8 text-center text-slate-400">
          <Wallet className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>Nenhum adiantamento encontrado{filtrosAtivos ? ' com os filtros aplicados' : ''}</p>
        </Card>
      ) : (
        <>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span>{adiantamentos.length} adiantamento{adiantamentos.length > 1 ? 's' : ''}</span>
            {isFetching && <Loader2 className="w-3 h-3 animate-spin" />}
          </div>
          <AdiantamentoTabela
            adiantamentos={adiantamentos}
            podeGerenciar={isAdmin}
            onAbrir={abrirDetalhes}
            onEditar={abrirEdicao}
            onAnexar={abrirEdicao}
            onCancelar={handleCancelar}
          />
          <AdiantamentoCard
            adiantamentos={adiantamentos}
            podeGerenciar={isAdmin}
            onAbrir={abrirDetalhes}
            onEditar={abrirEdicao}
            onAnexar={abrirEdicao}
            onCancelar={handleCancelar}
          />
        </>
      )}

      <AdiantamentoFormModal
        open={formOpen}
        onOpenChange={setFormOpen}
        adiantamento={editando}
        user={user}
        colaboradores={colaboradores}
        parceiros={parceiros}
        onSalvo={invalidar}
      />

      <AdiantamentoDetalhesModal
        open={!!adiantamentoDetalhes}
        onOpenChange={(v) => !v && setDetalhesId(null)}
        adiantamento={adiantamentoDetalhes}
        podeGerenciar={isAdmin}
        onEditar={abrirEdicao}
        onCancelar={handleCancelar}
        onSalvarComprovantes={salvarComprovantes}
      />
    </div>
  );
}