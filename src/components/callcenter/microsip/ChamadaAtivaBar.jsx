import React from 'react';
import { Button } from '@/components/ui/button';
import { PhoneOff, User, ExternalLink, ArrowUpRight, ArrowDownLeft } from 'lucide-react';
import { createPageUrl } from '@/utils';
import { cn } from '@/lib/utils';

const formatDuracao = (s) => {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
};

export default function ChamadaAtivaBar({ chamadaAtiva, duracao, onEncerrar }) {
  if (!chamadaAtiva) return null;
  const { numero, direcao, status, clienteNome, clienteId } = chamadaAtiva;
  const emLigacao = status === 'atendida';

  const abrirFicha = () => {
    if (clienteId) {
      window.location.href = createPageUrl(`ClienteDetalhes?id=${clienteId}`);
    }
  };

  return (
    <div className={cn(
      'flex items-center gap-3 px-4 py-3 rounded-xl text-white',
      emLigacao ? 'bg-slate-900' : 'bg-yellow-600'
    )}>
      {/* Avatar */}
      <div className={cn(
        'w-10 h-10 rounded-full flex items-center justify-center text-white font-bold shrink-0',
        emLigacao ? 'bg-green-500' : 'bg-yellow-400'
      )}>
        {clienteNome
          ? clienteNome.charAt(0).toUpperCase()
          : <User className="w-5 h-5" />
        }
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          {direcao === 'saida'
            ? <ArrowUpRight className="w-3.5 h-3.5 text-green-400 shrink-0" />
            : <ArrowDownLeft className="w-3.5 h-3.5 text-blue-400 shrink-0" />
          }
          <p className="font-semibold text-sm truncate">
            {clienteNome || numero}
          </p>
        </div>
        <p className="text-white/60 text-xs">
          {emLigacao
            ? <span className="font-mono text-green-400">{formatDuracao(duracao)}</span>
            : <span className="animate-pulse">Conectando via MicroSIP...</span>
          }
        </p>
      </div>

      {/* Ações */}
      <div className="flex items-center gap-2 shrink-0">
        {clienteId && (
          <button
            onClick={abrirFicha}
            className="text-white/60 hover:text-white"
            title="Abrir ficha"
          >
            <ExternalLink className="w-4 h-4" />
          </button>
        )}
        <Button
          onClick={onEncerrar}
          size="sm"
          className="bg-red-600 hover:bg-red-700 text-white h-8 px-3"
        >
          <PhoneOff className="w-4 h-4 mr-1" />
          Encerrar
        </Button>
      </div>
    </div>
  );
}