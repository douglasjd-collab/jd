import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import {
  Loader2, ArrowLeft, Tag, MessageSquare, CheckSquare, Paperclip,
  Clock, MessageCircle, Sparkles, Phone, DollarSign, Calendar, AlertTriangle, X
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

import OportunidadeAbaDetalhes from './OportunidadeAbaDetalhes';
import OportunidadeAbaComentarios from './OportunidadeAbaComentarios';
import OportunidadeAbaChecklist from './OportunidadeAbaChecklist';
import OportunidadeAbaAnexos from './OportunidadeAbaAnexos';
import OportunidadeAbaHistorico from './OportunidadeAbaHistorico';
import OportunidadeAbaBatePapo from './OportunidadeAbaBatePapo';
import OportunidadeAbaIA from './OportunidadeAbaIA';

const formatCurrency = (v) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

function tempoParado(dateStr) {
  if (!dateStr) return null;
  try { return formatDistanceToNow(new Date(dateStr), { addSuffix: false, locale: ptBR }); } catch { return null; }
}

const STATUS_CORES = {
  aberta: 'bg-blue-100 text-blue-700',
  ganha: 'bg-green-100 text-green-700',
  perdida: 'bg-red-100 text-red-700',
};

const ABAS = [
  { key: 'detalhes', label: 'Detalhes', icon: Tag },
  { key: 'comentarios', label: 'Comentários', icon: MessageSquare },
  { key: 'checklist', label: 'Checklist', icon: CheckSquare },
  { key: 'anexos', label: 'Anexos', icon: Paperclip },
  { key: 'historico', label: 'Histórico', icon: Clock },
  { key: 'batePapo', label: 'Bate-Papo', icon: MessageCircle },
  { key: 'ia', label: 'IA', icon: Sparkles },
];

export default function OportunidadeModal({ open, onOpenChange, oportunidadeId, currentUser, onUpdate }) {
  const [aba, setAba] = useState('detalhes');
  const queryClient = useQueryClient();

  useEffect(() => {
    if (open) setAba('detalhes');
  }, [open, oportunidadeId]);

  const { data: oportunidade, isLoading } = useQuery({
    queryKey: ['oportunidade', oportunidadeId],
    queryFn: async () => {
      const r = await base44.entities.Oportunidade.filter({ id: oportunidadeId });
      return r[0];
    },
    enabled: !!oportunidadeId && open,
  });

  const { data: comentarios = [] } = useQuery({
    queryKey: ['comentarios-oportunidade', oportunidadeId],
    queryFn: () => base44.entities.ComentarioOportunidade.filter({ oportunidade_id: oportunidadeId }, 'created_date'),
    enabled: !!oportunidadeId && open,
  });

  const { data: movimentacoes = [] } = useQuery({
    queryKey: ['movimentacoes-oportunidade', oportunidadeId],
    queryFn: () => base44.entities.MovimentacaoFunil.filter({ oportunidade_id: oportunidadeId }, '-created_date'),
    enabled: !!oportunidadeId && open,
  });

  const { data: colaboradores = [] } = useQuery({
    queryKey: ['colaboradores-oportunidade', oportunidade?.empresa_id],
    queryFn: () => base44.entities.Colaborador.filter({ empresa_id: oportunidade.empresa_id }, null, 200),
    enabled: !!oportunidade?.empresa_id && open,
  });

  const { data: etapas = [] } = useQuery({
    queryKey: ['etapas-funil', oportunidade?.empresa_id],
    queryFn: () => base44.entities.EtapaFunil.filter({ empresa_id: oportunidade.empresa_id }, 'ordem', 100),
    enabled: !!oportunidade?.empresa_id && open,
  });

  let checklistItems = [];
  try { checklistItems = oportunidade?.checklist ? JSON.parse(oportunidade.checklist) : []; } catch {}

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
    queryClient.invalidateQueries({ queryKey: ['oportunidades'] });
    onUpdate?.();
  };

  const abasComBadge = ABAS.map(a => ({
    ...a,
    badge: a.key === 'comentarios' ? (comentarios.length || null)
      : a.key === 'checklist' ? (checklistItems.length > 0 ? `${checklistItems.filter(i => i.checked).length}/${checklistItems.length}` : null)
      : a.key === 'anexos' ? (anexos.length || null)
      : a.key === 'historico' ? (movimentacoes.length || null)
      : null
  }));

  const responsavel = colaboradores.find(c => c.id === oportunidade?.vendedor_id);
  const parado = oportunidade ? tempoParado(oportunidade.data_ultima_movimentacao) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="p-0 overflow-hidden flex flex-col gap-0 [&>button:last-of-type]:hidden"
        style={{ maxWidth: '900px', width: '95vw', maxHeight: '92vh', height: '92vh' }}
      >
        {isLoading ? (
          <div className="flex items-center justify-center flex-1 h-64">
            <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
          </div>
        ) : !oportunidade ? (
          <div className="p-8 text-slate-400 text-center">Oportunidade não encontrada</div>
        ) : (
          <>
            {/* CABEÇALHO */}
            <div className="bg-white border-b px-6 pt-5 pb-4 flex-shrink-0">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1.5">
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
                  <h2 className="text-xl font-bold text-slate-900 leading-tight">
                    {oportunidade.cliente_nome || oportunidade.titulo}
                  </h2>
                  <div className="flex flex-wrap items-center gap-3 mt-1.5 text-xs text-slate-500">
                    {oportunidade.cliente_telefone && (
                      <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{oportunidade.cliente_telefone}</span>
                    )}
                    {oportunidade.valor_estimado > 0 && (
                      <span className="flex items-center gap-1 font-semibold text-emerald-700">
                        <DollarSign className="w-3 h-3" />{formatCurrency(oportunidade.valor_estimado)}
                      </span>
                    )}
                    {parado && (
                      <span className="flex items-center gap-1 text-amber-600">
                        <AlertTriangle className="w-3 h-3" />Parado há {parado}
                      </span>
                    )}
                    {responsavel && (
                      <span className="flex items-center gap-1.5">
                        {responsavel.foto_perfil
                          ? <img src={responsavel.foto_perfil} alt="" className="w-4 h-4 rounded-full object-cover" />
                          : <div className="w-4 h-4 rounded-full bg-[#1e3a5f] flex items-center justify-center text-white text-[8px] font-bold">{responsavel.nome?.charAt(0)}</div>
                        }
                        {responsavel.nome}
                      </span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => onOpenChange(false)}
                  className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 hover:bg-slate-200 text-slate-400 hover:text-slate-700 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* ABAS */}
            <div className="flex border-b bg-white px-4 gap-0.5 overflow-x-auto flex-shrink-0">
              {abasComBadge.map(a => (
                <button
                  key={a.key}
                  onClick={() => setAba(a.key)}
                  className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium border-b-2 whitespace-nowrap transition-colors ${
                    aba === a.key ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'
                  }`}
                >
                  <a.icon className="w-3.5 h-3.5" />
                  {a.label}
                  {a.badge != null && a.badge !== 0 && (
                    <span className="text-xs bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded-full font-semibold leading-none">
                      {a.badge}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* CONTEÚDO */}
            <div className="flex-1 overflow-y-auto bg-white">
              {aba === 'detalhes' && (
                <OportunidadeAbaDetalhes oportunidade={oportunidade} colaboradores={colaboradores} etapas={etapas} currentUser={currentUser} onUpdate={handleUpdateOportunidade} />
              )}
              {aba === 'comentarios' && (
                <OportunidadeAbaComentarios oportunidade={oportunidade} currentUser={currentUser} colaboradores={colaboradores} />
              )}
              {aba === 'checklist' && (
                <OportunidadeAbaChecklist oportunidade={oportunidade} currentUser={currentUser} onUpdate={handleUpdateOportunidade} />
              )}
              {aba === 'anexos' && (
                <OportunidadeAbaAnexos oportunidade={oportunidade} currentUser={currentUser} comentarios={comentarios} />
              )}
              {aba === 'historico' && (
                <OportunidadeAbaHistorico oportunidade={oportunidade} movimentacoes={movimentacoes} comentarios={comentarios} />
              )}
              {aba === 'batePapo' && (
                <OportunidadeAbaBatePapo oportunidade={oportunidade} currentUser={currentUser} />
              )}
              {aba === 'ia' && (
                <OportunidadeAbaIA oportunidade={oportunidade} comentarios={comentarios} movimentacoes={movimentacoes} checklistItems={checklistItems} currentUser={currentUser} />
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}