import React from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { PhoneCall, TrendingUp, Tag, ArrowRightLeft, Check, X } from 'lucide-react';
import AvatarContato from './AvatarContato';
import FunilInfoPanel from './FunilInfoPanel';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

export default function PainelInfoLead({
  conversaSelecionada,
  contatosWhatsapp,
  setContatosWhatsapp,
  tagsDB,
  chamadaAtiva,
  encerrarChamada,
  ligarParaContato,
  oportunidadeAtual,
  setFunilModalOpen,
  setTransferirModal,
  setInfoLeadAberto,
}) {
  return (
    <div className="flex w-[260px] shrink-0 flex-col border-l overflow-hidden lg:relative absolute right-0 top-0 bottom-0 z-40 bg-white shadow-xl lg:shadow-none">
      <div className="border-b bg-white px-3 py-2 shrink-0 flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold">Informações do Lead</p>
          <p className="text-[10px] text-slate-500">Detalhes e histórico</p>
        </div>
        <button onClick={() => setInfoLeadAberto(false)} className="lg:hidden p-1 rounded-full hover:bg-slate-100">
          <X className="w-4 h-4 text-slate-500" />
        </button>
      </div>

      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-3 px-3 pb-3 pt-2">
          <div className="flex items-center gap-2">
            <AvatarContato
              contato={contatosWhatsapp[conversaSelecionada?.id] || { nome: conversaSelecionada.cliente_nome, telefone: conversaSelecionada.cliente_telefone, foto_url: conversaSelecionada.foto_url }}
              className="h-9 w-9"
            />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold leading-tight truncate">{conversaSelecionada.cliente_telefone}</p>
              <p className="text-[10px] text-slate-500 truncate">{contatosWhatsapp[conversaSelecionada?.id]?.nome || 'Sem nome'}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-1.5">
            <Button
              variant={chamadaAtiva ? "destructive" : "outline"}
              size="sm"
              className={`h-7 justify-center gap-1 rounded-md text-[10px] px-2 ${!chamadaAtiva ? 'text-green-700 border-green-300 hover:bg-green-50' : ''}`}
              title={chamadaAtiva ? 'Encerrar chamada' : 'Realizar chamada'}
              onClick={() => chamadaAtiva ? encerrarChamada() : ligarParaContato(conversaSelecionada?.cliente_telefone)}
            >
              <PhoneCall className="h-3 w-3" />
              <span className="hidden sm:inline">Ligar</span>
            </Button>
            <Button
              variant={oportunidadeAtual ? "default" : "outline"}
              size="sm"
              className={`h-7 justify-center gap-1 rounded-md text-[10px] px-2 ${oportunidadeAtual ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : ''}`}
              onClick={() => setFunilModalOpen(true)}
              title={oportunidadeAtual ? `No Funil: ${oportunidadeAtual.etapa_nome}` : 'Lançar no Funil'}
            >
              <TrendingUp className="h-3 w-3" />
              <span className="hidden sm:inline">{oportunidadeAtual ? 'Funil' : 'Lançar'}</span>
            </Button>
            <Button variant="outline" size="sm" className="h-7 justify-center gap-1 rounded-md text-[10px] px-2" title="Proposta">
              <Tag className="h-3 w-3" />
              <span className="hidden sm:inline">Proposta</span>
            </Button>
            <Button variant="outline" size="sm" className="h-7 justify-center gap-1 rounded-md text-[10px] px-2" onClick={() => setTransferirModal(conversaSelecionada)} title="Transferir">
              <ArrowRightLeft className="h-3 w-3" />
              <span className="hidden sm:inline">Transferir</span>
            </Button>
          </div>

          <Separator />
          <FunilInfoPanel oportunidade={oportunidadeAtual} onMoverClick={() => setFunilModalOpen(true)} />
          <Separator />

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold">Tags</span>
              <span className="text-[9px] text-slate-400">{tagsDB.length} tag(s)</span>
            </div>
            <div className="flex flex-wrap gap-1">
              {tagsDB.length === 0 ? (
                <p className="text-[10px] text-slate-400">Nenhuma tag criada. Crie em Contatos CRM.</p>
              ) : tagsDB.map((t) => {
                const contatoAtual = contatosWhatsapp[conversaSelecionada?.id];
                const ativa = (contatoAtual?.tags_ids || []).includes(t.id);
                return (
                  <button
                    key={t.id}
                    title={ativa ? 'Remover tag' : 'Adicionar tag'}
                    onClick={async () => {
                      if (!contatoAtual) return toast.error('Contato não encontrado');
                      const atuais = contatoAtual.tags_ids || [];
                      const novas = ativa ? atuais.filter(x => x !== t.id) : [...atuais, t.id];
                      await base44.entities.ContatoWhatsapp.update(contatoAtual.id, { tags_ids: novas });
                      setContatosWhatsapp(prev => ({ ...prev, [conversaSelecionada.id]: { ...contatoAtual, tags_ids: novas } }));
                      toast.success(ativa ? 'Tag removida' : 'Tag adicionada');
                    }}
                    className={cn('rounded-full px-1.5 py-0.5 text-[9px] font-medium border transition-all whitespace-nowrap', ativa ? 'border-slate-500 ring-1 ring-slate-400' : 'border-transparent opacity-60 hover:opacity-100')}
                    style={{ backgroundColor: t.cor + '33', color: t.cor }}
                  >
                    {ativa && '✓ '}{t.nome}
                  </button>
                );
              })}
            </div>
          </div>

          <Separator />

          <div className="space-y-1.5">
            <span className="text-[11px] font-semibold">Status</span>
            <div className="flex items-center justify-between rounded-lg bg-slate-50 px-2 py-1 text-[10px]">
              <span className="capitalize">{conversaSelecionada.status}</span>
              <Check className="h-3 w-3 text-emerald-500" />
            </div>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}