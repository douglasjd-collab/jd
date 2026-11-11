import React from 'react';
import { Bell, BellOff, AlertTriangle, User, Users } from 'lucide-react';
import { participantesDoCompromisso, dadosDoParticipante, formatarTelefone } from './participantesReuniao';

function tempoAntes(minutos) {
  if (minutos >= 1440) return `${Math.round(minutos / 1440)} dia(s)`;
  if (minutos >= 60) return `${Math.round(minutos / 60)}h`;
  return `${minutos}min`;
}

// Mostra, para o compromisso aberto, se os avisos automáticos estão ativos
// e exatamente quem vai receber (contato + participantes).
export default function StatusLembretesReuniao({ item, config, colaboradores = [] }) {
  const ativo = !!config?.ativo;
  const enviaCliente = ativo && config?.enviar_para_cliente !== false;
  const enviaParticipantes = ativo && config?.enviar_para_responsaveis !== false;

  const participantes = participantesDoCompromisso(item).map(p => dadosDoParticipante(p, colaboradores));
  const telefoneCliente = String(item?.telefone || '').replace(/\D/g, '');
  const tempos = config?.tempos_minutos?.length ? config.tempos_minutos : [60, 10];

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
          {ativo ? <Bell className="w-3.5 h-3.5" /> : <BellOff className="w-3.5 h-3.5" />}
          Avisos automáticos
        </p>
        <span
          className={`text-[11px] px-2 py-0.5 rounded-full border font-medium ${
            ativo ? 'bg-green-50 text-green-700 border-green-200' : 'bg-slate-100 text-slate-500 border-slate-200'
          }`}
        >
          {ativo ? 'Ativos' : 'Desativados'}
        </span>
      </div>

      {!ativo ? (
        <p className="text-xs text-slate-500">
          Ative em <b>Configuração de Lembretes</b> para avisar o contato e os participantes antes da reunião.
        </p>
      ) : (
        <>
          <p className="text-[11px] text-slate-400">
            Enviados {tempos.map(tempoAntes).join(' e ')} antes
          </p>

          <div className="flex items-start gap-2 text-xs">
            <User className="w-3.5 h-3.5 text-blue-500 mt-0.5 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-slate-700">Contato da reunião</p>
              {!enviaCliente ? (
                <p className="text-slate-400">Desativado na configuração</p>
              ) : telefoneCliente.length >= 10 ? (
                <p className="text-green-600">Recebe no {formatarTelefone(item.telefone)}</p>
              ) : (
                <p className="text-amber-600 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" /> Sem telefone — não receberá
                </p>
              )}
            </div>
          </div>

          <div className="flex items-start gap-2 text-xs">
            <Users className="w-3.5 h-3.5 text-purple-500 mt-0.5 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-slate-700">Participantes ({participantes.length})</p>
              {!enviaParticipantes ? (
                <p className="text-slate-400">Desativado na configuração</p>
              ) : participantes.length === 0 ? (
                <p className="text-amber-600 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" /> Nenhum participante — só o contato será avisado
                </p>
              ) : (
                participantes.map((p, i) => (
                  <p key={i} className={p.temTelefone ? 'text-green-600 truncate' : 'text-amber-600 truncate'}>
                    {p.nome}
                    {!p.temTelefone && ' — sem telefone cadastrado'}
                  </p>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}