import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Phone, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function MicroSIPDiscador({ onLigar, onConfigOpen, sipConfigOk }) {
  const [numero, setNumero] = useState('');

  const handleLigar = () => {
    if (!numero.trim()) return;
    onLigar(numero.trim());
    setNumero('');
  };

  return (
    <div className="bg-white border rounded-2xl shadow-sm overflow-hidden">
      {/* Header */}
      <div className="bg-[#10353C] text-white px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Phone className="w-4 h-4 text-[#23BE84]" />
          <span className="font-semibold text-sm">Discador MicroSIP</span>
        </div>
        <div className="flex items-center gap-2">
          <span className={cn(
            'text-xs px-2 py-0.5 rounded-full font-medium',
            sipConfigOk ? 'bg-green-500/30 text-green-200' : 'bg-yellow-500/30 text-yellow-200'
          )}>
            {sipConfigOk ? '● Configurado' : '⚠ Config pendente'}
          </span>
          <button onClick={onConfigOpen} className="text-white/60 hover:text-white" title="Configurar MicroSIP">
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="p-4 space-y-3">
        {!sipConfigOk && (
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 space-y-1">
            <p className="font-semibold">⚙️ Configure o MicroSIP primeiro</p>
            <p>Clique no ícone de engrenagem acima para configurar SIP User, Password e Domain.</p>
            <button onClick={onConfigOpen} className="text-amber-700 font-semibold hover:underline">
              → Configurar agora
            </button>
          </div>
        )}

        {/* Campo de número */}
        <div className="flex gap-2">
          <Input
            placeholder="DDD + número (ex: 81999991234)"
            value={numero}
            onChange={e => setNumero(e.target.value.replace(/\D/g, ''))}
            onKeyDown={e => e.key === 'Enter' && numero.trim() && handleLigar()}
            className="flex-1 font-mono"
            autoFocus
          />
          <Button
            onClick={handleLigar}
            disabled={!numero.trim()}
            className="bg-green-600 hover:bg-green-700 text-white px-4"
          >
            <Phone className="w-4 h-4" />
          </Button>
        </div>

        {/* Teclado numérico */}
        <div className="grid grid-cols-3 gap-2">
          {['1','2','3','4','5','6','7','8','9','*','0','#'].map(d => (
            <button
              key={d}
              onClick={() => setNumero(prev => prev + d)}
              className="h-10 rounded-lg border bg-slate-50 hover:bg-slate-100 text-slate-700 font-semibold text-sm transition-colors"
            >
              {d}
            </button>
          ))}
        </div>

        <p className="text-xs text-slate-400 text-center">
          Ao clicar em ligar, o MicroSIP iniciará a chamada automaticamente
        </p>
      </div>
    </div>
  );
}