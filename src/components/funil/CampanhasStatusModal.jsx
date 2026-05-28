import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, Clock, AlertCircle, Video, Calendar } from 'lucide-react';
import { format } from 'date-fns';

const CAMPANHAS = [
  { num: 1, label: 'Campanha 1', dias: 15, descricao: 'Vídeo explicativo — Introdução ao consórcio' },
  { num: 2, label: 'Campanha 2', dias: 30, descricao: 'Vídeo de vantagens — Por que escolher nosso serviço' },
  { num: 3, label: 'Campanha 3', dias: 45, descricao: 'Vídeo educativo — Planejamento financeiro' },
  { num: 4, label: 'Campanha 4', dias: 60, descricao: 'Vídeo de fechamento — Próximos passos' },
];

export default function CampanhasStatusModal({ oportunidade, ultimaCampanha = 0, dataEntrada = null }) {
  const [open, setOpen] = useState(false);
  const agora = new Date();

  const getStatus = (num) => {
    if (ultimaCampanha >= num) return 'enviada';
    if (!dataEntrada) return 'aguardando';
    const diasNoPlano = Math.floor((agora - new Date(dataEntrada)) / (1000 * 60 * 60 * 24));
    const diasNecessarios = num * 15;
    if (diasNoPlano >= diasNecessarios) return 'pronta';
    return 'aguardando';
  };

  const getDataEnvio = (num) => {
    if (!dataEntrada) return null;
    const entrada = new Date(dataEntrada);
    const diasMs = (num * 15) * (1000 * 60 * 60 * 24);
    return new Date(entrada.getTime() + diasMs);
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-600 text-xs font-medium transition-colors"
        title="Ver status dos vídeos educativos"
      >
        <Video className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">Videos</span>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Video className="w-5 h-5 text-blue-600" />
              Vídeos Educativos — {oportunidade?.cliente_nome || 'Oportunidade'}
            </DialogTitle>
          </DialogHeader>

          {!dataEntrada ? (
            <div className="py-6 text-center text-slate-500">
              <AlertCircle className="w-12 h-12 mx-auto mb-3 opacity-40" />
              <p className="text-sm">Nenhuma data de entrada no planejamento registrada</p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="bg-blue-50 p-3 rounded-lg border border-blue-200">
                <p className="text-xs text-blue-600 font-medium">
                  📅 Entrada em Planejamento: <span className="font-bold">{format(new Date(dataEntrada), 'dd/MM/yyyy')}</span>
                </p>
              </div>

              <div className="space-y-2">
                {CAMPANHAS.map((campanha) => {
                  const status = getStatus(campanha.num);
                  const dataEnvio = getDataEnvio(campanha.num);
                  const diasRestantes = dataEnvio ? Math.ceil((dataEnvio - agora) / (1000 * 60 * 60 * 24)) : 0;

                  return (
                    <div
                      key={campanha.num}
                      className={`p-3 rounded-lg border-2 transition-all ${
                        status === 'enviada'
                          ? 'bg-emerald-50 border-emerald-300'
                          : status === 'pronta'
                          ? 'bg-amber-50 border-amber-300'
                          : 'bg-slate-50 border-slate-200'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            {status === 'enviada' ? (
                              <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                            ) : status === 'pronta' ? (
                              <Clock className="w-4 h-4 text-amber-600 flex-shrink-0 animate-pulse" />
                            ) : (
                              <AlertCircle className="w-4 h-4 text-slate-400 flex-shrink-0" />
                            )}
                            <p className="font-medium text-sm text-slate-900">{campanha.label}</p>
                          </div>
                          <p className="text-xs text-slate-600 ml-6">{campanha.descricao}</p>
                        </div>

                        <Badge
                          variant={status === 'enviada' ? 'default' : status === 'pronta' ? 'secondary' : 'outline'}
                          className={
                            status === 'enviada'
                              ? 'bg-emerald-600 text-white flex-shrink-0'
                              : status === 'pronta'
                              ? 'bg-amber-500 text-white flex-shrink-0'
                              : 'flex-shrink-0'
                          }
                        >
                          {status === 'enviada' ? '✓ Enviado' : status === 'pronta' ? '⏳ Pronto' : 'Aguardando'}
                        </Badge>
                      </div>

                      {status !== 'aguardando' && dataEnvio && (
                        <div className={`mt-2 ml-6 text-xs flex items-center gap-1 ${
                          status === 'enviada' ? 'text-emerald-600' : 'text-amber-600'
                        }`}>
                          <Calendar className="w-3 h-3" />
                          {status === 'enviada'
                            ? `Enviado em ${format(dataEnvio, 'dd/MM/yyyy')}`
                            : `Será enviado em ${format(dataEnvio, 'dd/MM/yyyy')} (${diasRestantes}d)`}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="bg-blue-50 p-3 rounded-lg border border-blue-200 mt-4">
                <p className="text-xs text-blue-700">
                  <span className="font-semibold">💡 Dica:</span> Os vídeos são enviados automaticamente a cada 15 dias. Acompanhe o progresso aqui.
                </p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}