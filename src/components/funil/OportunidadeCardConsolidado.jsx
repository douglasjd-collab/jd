import React, { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ChevronDown, Eye, MessageCircle, MoreHorizontal, MessageSquare } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { format } from 'date-fns';
import { createPageUrl } from '@/utils';
import { useNavigate } from 'react-router-dom';
import CampanhasPlanejamentoBadge from './CampanhasPlanejamentoBadge';
import ChatPopupModal from '@/components/chat/ChatPopupModal';

export default function OportunidadeCardConsolidado({
  oportunidade,
  simulacoes,
  onEditClick,
  onAlterarResponsavelClick,
  onAlterarQuadroClick,
  onDeleteClick,
  onComentariosClick,
  avatarUrl,
  getInitials,
  formatCurrency,
  currentUser,
  isResponsavel,
  podeAlterarQuadro,
  podeAlterarResponsavel,
  etapas,
  dataAtrasada,
  etapaAtual
}) {
  const [expandirSimulacoes, setExpandirSimulacoes] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const navigate = useNavigate();

  const isVendaFechada = etapaAtual?.nome?.toLowerCase().includes('venda fechada') || 
                         etapaAtual?.nome?.toLowerCase().includes('fechada') ||
                         etapaAtual?.tipo === 'ganho';

  let cardClasses = 'bg-white border border-slate-200 hover:shadow-md';

  if (oportunidade.status === 'ganha' || isVendaFechada) {
    cardClasses = 'bg-green-50 border-2 border-green-600';
  } else if (oportunidade.status === 'perdida') {
    cardClasses = 'bg-red-50 border-2 border-red-600';
  } else if (dataAtrasada) {
    cardClasses = 'bg-orange-50 border-2 border-orange-400 shadow-[0_0_15px_rgba(251,146,60,0.3)]';
  }

  // Simulação com maior valor (preview)
  const simulacaoDestaque = simulacoes?.length > 0 
    ? simulacoes.reduce((max, sim) => (sim.valor_estimado > max.valor_estimado) ? sim : max)
    : null;

  // Valor total de todas as simulações
  const valorTotal = simulacoes?.reduce((sum, sim) => sum + (sim.valor_estimado || 0), 0) || oportunidade.valor_estimado;

  return (
    <>
    <div className={`p-3 rounded-lg shadow-sm transition-all cursor-move ${cardClasses}`}>
      {/* Header */}
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1">
          <h4 className="font-medium text-slate-900 text-sm">{oportunidade.titulo}</h4>
          {simulacoes?.length > 1 && (
            <p className="text-xs text-blue-600 font-semibold mt-1">
              📊 {simulacoes.length} simulações
            </p>
          )}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-6 w-6">
              <MoreHorizontal className="w-4 h-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            {(isResponsavel || podeAlterarQuadro) && (
              <DropdownMenuItem onClick={onEditClick}>
                <span>✏️ Editar</span>
              </DropdownMenuItem>
            )}
            {podeAlterarResponsavel && (
              <DropdownMenuItem onClick={onAlterarResponsavelClick}>
                <span>👥 Alterar Responsáveis</span>
              </DropdownMenuItem>
            )}
            {podeAlterarQuadro && (
              <>
                <DropdownMenuItem onClick={onAlterarQuadroClick}>
                  <span>↔️ Alterar Quadro</span>
                </DropdownMenuItem>
                <DropdownMenuItem 
                  onClick={() => {
                    if (confirm(`Tem certeza que deseja excluir a oportunidade "${oportunidade.titulo}"?`)) {
                      onDeleteClick();
                    }
                  }}
                  className="text-red-600"
                >
                  <span>🗑️ Excluir Lead</span>
                </DropdownMenuItem>
              </>
            )}
            <DropdownMenuItem asChild>
              <a href={createPageUrl(`OportunidadeDetalhes?id=${oportunidade.id}`)}>
                <span>👁️ Ver detalhes</span>
              </a>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Cliente */}
      {oportunidade.cliente_nome && (
        <p className="text-xs text-slate-600 mb-2">👤 {oportunidade.cliente_nome}</p>
      )}

      {/* Telefone */}
      {oportunidade.telefone_lead && (
        <p className="text-xs text-slate-600 mb-2">📞 {oportunidade.telefone_lead}</p>
      )}

      {/* Badge campanhas de planejamento */}
      {etapaAtual?.tipo === 'planejamento' && (
        <div className="mb-2">
          <p className="text-[9px] text-slate-400 uppercase font-semibold mb-1">Campanhas (60 dias)</p>
          <CampanhasPlanejamentoBadge
            ultimaCampanha={oportunidade.campanha_planejamento_ultima || 0}
            dataEntrada={oportunidade.data_entrada_planejamento}
            compact={false}
          />
        </div>
      )}

      {/* Valores */}
      <div className="flex items-center justify-between text-xs mb-2">
        <div>
          <p className="text-slate-500 text-xs">Valor</p>
          <span className="font-semibold text-emerald-600">
            {formatCurrency(valorTotal)}
          </span>
          {simulacoes?.length > 1 && (
            <p className="text-slate-500 text-xs mt-1">
              Máx: {formatCurrency(simulacaoDestaque?.valor_estimado || 0)}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1">
          {/* Comentários internos */}
          <Button
            size="icon"
            variant="ghost"
            className="h-6 w-6 hover:bg-blue-100"
            onClick={(e) => { e.stopPropagation(); onComentariosClick(); }}
            title="Comentários"
          >
            <MessageCircle className="w-4 h-4 text-blue-600" />
          </Button>
          {/* Ver conversa WhatsApp */}
          {(oportunidade.telefone_lead || oportunidade.cliente_telefone) && (
            <Button
              size="icon"
              variant="ghost"
              className="h-6 w-6 hover:bg-green-100"
              onClick={(e) => { e.stopPropagation(); setChatOpen(true); }}
              title="Ver conversa WhatsApp"
            >
              <MessageSquare className="w-4 h-4 text-green-600" />
            </Button>
          )}
        </div>
      </div>

      {/* Histórico de Simulações (expandível) */}
      {simulacoes?.length > 1 && (
        <div className="mt-2 pt-2 border-t border-slate-200">
          <button
            onClick={() => setExpandirSimulacoes(!expandirSimulacoes)}
            className="flex items-center gap-2 text-xs text-blue-600 hover:text-blue-700 font-medium w-full"
          >
            <ChevronDown 
              className={`w-3 h-3 transition-transform ${expandirSimulacoes ? 'rotate-180' : ''}`}
            />
            Ver histórico ({simulacoes.length})
          </button>

          {expandirSimulacoes && (
            <div className="mt-2 space-y-1 bg-blue-50 p-2 rounded-lg max-h-[150px] overflow-y-auto">
              {simulacoes.map((sim, idx) => (
                <div key={sim.id} className="flex justify-between items-start text-xs p-1 hover:bg-blue-100 rounded">
                  <div className="flex-1">
                    <p className="text-slate-700 font-medium">
                      Sim {simulacoes.length - idx}
                    </p>
                    <p className="text-slate-500 text-[11px]">
                      {format(new Date(sim.created_date), 'dd/MM/yyyy HH:mm')}
                    </p>
                  </div>
                  <p className="font-semibold text-emerald-600">
                    {formatCurrency(sim.valor_estimado || 0)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>

    {/* Chat WhatsApp Popup */}

    {chatOpen && (
      <ChatPopupModal
        open={chatOpen}
        onOpenChange={setChatOpen}
        contato={{
          telefone: oportunidade.telefone_lead || oportunidade.cliente_telefone,
          nome: oportunidade.cliente_nome || oportunidade.titulo,
        }}
        empresaId={currentUser?.empresa_id}
        user={currentUser}
      />
    )}
  </>
  );
}