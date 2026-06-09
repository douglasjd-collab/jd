import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Loader2, ArrowLeft, Tag, MessageSquare, CheckSquare, Paperclip,
  Clock, MessageCircle, Sparkles, User, DollarSign, Calendar, Phone,
  TrendingUp, AlertTriangle
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

import OportunidadeAbaDetalhes from '@/components/oportunidade/OportunidadeAbaDetalhes';
import OportunidadeAbaComentarios from '@/components/oportunidade/OportunidadeAbaComentarios';
import OportunidadeAbaChecklist from '@/components/oportunidade/OportunidadeAbaChecklist';
import OportunidadeAbaAnexos from '@/components/oportunidade/OportunidadeAbaAnexos';
import OportunidadeAbaHistorico from '@/components/oportunidade/OportunidadeAbaHistorico';
import OportunidadeAbaBatePapo from '@/components/oportunidade/OportunidadeAbaBatePapo';
import OportunidadeAbaIA from '@/components/oportunidade/OportunidadeAbaIA';

const formatCurrency = (v) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

function tempoParado(dateStr) {
  if (!dateStr) return null;
  try {
    return formatDistanceToNow(new Date(dateStr), { addSuffix: false, locale: ptBR });
  } catch { return null; }
}

const STATUS_CORES = {
  aberta: 'bg-blue-100 text-blue-700',
  ganha: 'bg-green-100 text-green-700',
  perdida: 'bg-red-100 text-red-700',
};

export default function OportunidadeDetalhes() {
  const urlParams = new URLSearchParams(window.location.search);
  const oportunidadeId = urlParams.get('id');
  const [aba, setAba] = useState('detalhes');
  const [currentUser, setCurrentUser] = useState(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    base44.auth.me().then(me => {
      if (!me) return;
      base44.entities.Colaborador.filter({ user_id: me.id }, '-created_date').then(colabs => {
        const c = colabs.find(x => x.status === 'ativo') || colabs[0];
        setCurrentUser({ ...me, colaborador_id: c?.id, empresa_id: c?.empresa_id, perfil: c?.perfil || 'vendedor', nome_perfil: c?.nome || me.full_name, foto_perfil: c?.foto_perfil });
      }).catch(() => setCurrentUser(me));
    }).catch(() => {});
  }, []);

  const { data: oportunidade, isLoading } = useQuery({
    queryKey: ['oportunidade', oportunidadeId],
    queryFn: async () => {
      const r = await base44.entities.Oportunidade.filter({ id: oportunidadeId });
      return r[0];
    },
    enabled: !!oportunidadeId,
  });

  const { data: comentarios = [] } = useQuery({
    queryKey: ['comentarios-oportunidade', oportunidadeId],
    queryFn: () => base44.entities.ComentarioOportunidade.filter({ oportunidade_id: oportunidadeId }, 'created_date'),
    enabled: !!oportunidadeId,
  });

  const { data: movimentacoes = [] } = useQuery({
    queryKey: ['movimentacoes-oportunidade', oportunidadeId],
    queryFn: () => base44.entities.MovimentacaoFunil.filter({ oportunidade_id: oportunidadeId }, '-created_date'),
    enabled: !!oportunidadeId,
  });

  const { data: colaboradores = [] } = useQuery({
    queryKey: ['colaboradores-oportunidade', oportunidade?.empresa_id],
    queryFn: () => base44.entities.Colaborador.filter({ empresa_id: oportunidade.empresa_id }, null, 200),
    enabled: !!oportunidade?.empresa_id,
  });

  const { data: etapas = [] } = useQuery({
    queryKey: ['etapas-funil', oportunidade?.empresa_id],
    queryFn: () => base44.entities.EtapaFunil.filter({ empresa_id: oportunidade.empresa_id }, 'ordem', 100),
    enabled: !!oportunidade?.empresa_id,
  });

  // Checklist da oportunidade (guardado em campo JSON)
  let checklistItems = [];
  try { checklistItems = oportunidade?.checklist ? JSON.parse(oportunidade.checklist) : []; } catch {}

  // Anexos extraídos dos comentários
  const ANEXO_REGEX = /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g;
  const anexos = comentarios.flatMap(c => {
    const ms = [];
    let m;
    const rx = new RegExp(ANEXO_REGEX.source, 'g');
    while ((m = rx.exec(c.mensagem || '')) !== null) {
      ms.push({ nome: m[1], url: m[2], usuario_nome: c.usuario_nome, created_date: c.created_date });
    }
    return ms;
  });

  const handleUpdateOportunidade = async (id, data) => {
    await base44.entities.Oportunidade.update(id, data);
    queryClient.invalidateQueries({ queryKey: ['oportunidade', oportunidadeId] });
  };

  const abasConfig = [
    { key: 'detalhes', label: 'Detalhes', icon: Tag },
    { key: 'comentarios', label: 'Comentários', icon: MessageSquare, badge: comentarios.length || null },
    {
      key: 'checklist', label: 'Checklist', icon: CheckSquare,
      badge: checklistItems.length > 0 ? `${checklistItems.filter(i => i.checked).length}/${checklistItems.length}` : null
    },
    { key: 'anexos', label: 'Anexos', icon: Paperclip, badge: anexos.length || null },
    { key: 'historico', label: 'Histórico', icon: Clock, badge: movimentacoes.length || null },
    { key: 'batePapo', label: 'Bate-Papo', icon: MessageCircle },
    { key: 'ia', label: 'Análise IA', icon: Sparkles },
  ];

  if (isLoading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
    </div>
  );

  if (!oportunidade) return (
    <div className="p-8 text-slate-500">Oportunidade não encontrada.</div>
  );

  const parado = tempoParado(oportunidade.data_ultima_movimentacao);
  const responsavel = colaboradores.find(c => c.id === oportunidade.vendedor_id);

  return (
    <div className="space-y-0 min-h-screen bg-slate-50">
      {/* Breadcrumb */}
      <div className="px-6 pt-4 pb-2">
        <button
          onClick={() => window.history.back()}
          className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Voltar ao Funil
        </button>
      </div>

      {/* CABEÇALHO */}
      <div className="bg-white border-b shadow-sm px-6 py-5">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          {/* Info principal */}
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span className={`text-xs font-semibold px-2.5 py-1 rounded-full capitalize ${STATUS_CORES[oportunidade.status] || 'bg-slate-100 text-slate-600'}`}>
                {oportunidade.status === 'aberta' ? 'Em andamento' : oportunidade.status === 'ganha' ? '✓ Ganha' : '✗ Perdida'}
              </span>
              {oportunidade.etapa_nome && (
                <span className="text-xs bg-blue-50 text-blue-700 border border-blue-200 px-2.5 py-1 rounded-full font-medium">
                  {oportunidade.etapa_nome}
                </span>
              )}
              {oportunidade.produto && (
                <span className="text-xs bg-purple-50 text-purple-700 border border-purple-200 px-2.5 py-1 rounded-full font-medium capitalize">
                  {oportunidade.produto}
                </span>
              )}
            </div>

            <h1 className="text-2xl font-bold text-slate-900 leading-tight mb-1">
              {oportunidade.cliente_nome || oportunidade.titulo}
            </h1>
            {oportunidade.cliente_nome && oportunidade.titulo !== oportunidade.cliente_nome && (
              <p className="text-sm text-slate-500 mb-2">{oportunidade.titulo}</p>
            )}

            <div className="flex flex-wrap items-center gap-4 text-sm text-slate-600">
              {oportunidade.cliente_telefone && (
                <span className="flex items-center gap-1">
                  <Phone className="w-3.5 h-3.5 text-slate-400" />
                  {oportunidade.cliente_telefone}
                </span>
              )}
              {oportunidade.valor_estimado > 0 && (
                <span className="flex items-center gap-1 font-semibold text-emerald-700">
                  <DollarSign className="w-3.5 h-3.5" />
                  {formatCurrency(oportunidade.valor_estimado)}
                </span>
              )}
              {oportunidade.created_date && (
                <span className="flex items-center gap-1 text-slate-400">
                  <Calendar className="w-3.5 h-3.5" />
                  Criado em {format(new Date(oportunidade.created_date), 'dd/MM/yyyy')}
                </span>
              )}
              {parado && (
                <span className="flex items-center gap-1 text-amber-600">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  Parado há {parado}
                </span>
              )}
            </div>
          </div>

          {/* Responsável */}
          {(responsavel || oportunidade.vendedor_nome) && (
            <div className="flex items-center gap-3 bg-slate-50 border rounded-xl px-4 py-3 flex-shrink-0">
              {responsavel?.foto_perfil ? (
                <img src={responsavel.foto_perfil} alt="" className="w-10 h-10 rounded-full object-cover" />
              ) : (
                <div className="w-10 h-10 rounded-full bg-[#1e3a5f] flex items-center justify-center text-white font-bold text-sm">
                  {(responsavel?.nome || oportunidade.vendedor_nome || '?').charAt(0).toUpperCase()}
                </div>
              )}
              <div>
                <p className="text-xs text-slate-400">Responsável</p>
                <p className="text-sm font-semibold text-slate-800">{responsavel?.nome || oportunidade.vendedor_nome}</p>
                {responsavel?.perfil && <p className="text-xs text-slate-400 capitalize">{responsavel.perfil}</p>}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ABAS */}
      <div className="flex border-b bg-white px-6 gap-1 overflow-x-auto">
        {abasConfig.map(a => (
          <button
            key={a.key}
            onClick={() => setAba(a.key)}
            className={`flex items-center gap-1.5 px-3 py-3 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
              aba === a.key ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <a.icon className="w-4 h-4" />
            {a.label}
            {a.badge != null && a.badge !== 0 && (
              <span className="text-xs bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded-full font-semibold leading-none">
                {a.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* CONTEÚDO DAS ABAS */}
      <div className="bg-white min-h-[500px]">
        {aba === 'detalhes' && (
          <OportunidadeAbaDetalhes
            oportunidade={oportunidade}
            colaboradores={colaboradores}
            etapas={etapas}
            currentUser={currentUser}
            onUpdate={handleUpdateOportunidade}
          />
        )}
        {aba === 'comentarios' && (
          <OportunidadeAbaComentarios
            oportunidade={oportunidade}
            currentUser={currentUser}
            colaboradores={colaboradores}
          />
        )}
        {aba === 'checklist' && (
          <OportunidadeAbaChecklist
            oportunidade={oportunidade}
            currentUser={currentUser}
            onUpdate={handleUpdateOportunidade}
          />
        )}
        {aba === 'anexos' && (
          <OportunidadeAbaAnexos
            oportunidade={oportunidade}
            currentUser={currentUser}
            comentarios={comentarios}
          />
        )}
        {aba === 'historico' && (
          <OportunidadeAbaHistorico
            oportunidade={oportunidade}
            movimentacoes={movimentacoes}
            comentarios={comentarios}
          />
        )}
        {aba === 'batePapo' && (
          <OportunidadeAbaBatePapo
            oportunidade={oportunidade}
            currentUser={currentUser}
          />
        )}
        {aba === 'ia' && (
          <OportunidadeAbaIA
            oportunidade={oportunidade}
            comentarios={comentarios}
            movimentacoes={movimentacoes}
            checklistItems={checklistItems}
            currentUser={currentUser}
          />
        )}
      </div>
    </div>
  );
}