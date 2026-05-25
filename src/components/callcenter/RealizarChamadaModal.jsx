import React, { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Phone, PhoneOff, Loader2, Mic, MicOff } from 'lucide-react';
import { toast } from 'sonner';
import { base44 } from '@/api/base44Client';
import JsSIP from 'jssip';

const SIP_SERVER = 'wss://webrtc.nvoip.com.br:8089/ws';
const SIP_DOMAIN = 'sip.nvoip.com.br';

export default function RealizarChamadaModal({ open, onOpenChange, numeroInicial = '' }) {
  const [called, setCalled] = useState(numeroInicial);
  const [status, setStatus] = useState('idle'); // idle | registrando | pronto | ligando | ativa | encerrada | erro
  const [erro, setErro] = useState('');
  const [config, setConfig] = useState(null);
  const [loadingConfig, setLoadingConfig] = useState(false);
  const [muted, setMuted] = useState(false);

  const uaRef = useRef(null);
  const sessionRef = useRef(null);
  const audioRef = useRef(null);

  useEffect(() => {
    if (numeroInicial) setCalled(numeroInicial);
  }, [numeroInicial]);

  useEffect(() => {
    if (open) {
      carregarConfig();
    } else {
      desligar(true);
    }
  }, [open]);

  const carregarConfig = async () => {
    setLoadingConfig(true);
    setErro('');
    try {
      const res = await base44.functions.invoke('nvoipCallCenter', { action: 'buscarConfigUsuario' });
      const cfg = res.data?.config;
      if (!cfg?.numbersip || !cfg?.sip_password) {
        setErro('Configure seu Ramal SIP e Senha SIP em "Meu Ramal" para fazer chamadas pelo browser.');
        setStatus('erro');
      } else {
        setConfig(cfg);
        setStatus('idle');
      }
    } catch (e) {
      setErro('Erro ao carregar configuração: ' + e.message);
      setStatus('erro');
    } finally {
      setLoadingConfig(false);
    }
  };

  const registrarSip = () => {
    return new Promise((resolve, reject) => {
      if (uaRef.current) {
        uaRef.current.stop();
        uaRef.current = null;
      }

      const { numbersip, sip_password } = config;
      const uri = `sip:${numbersip}@${SIP_DOMAIN}`;

      const ua = new JsSIP.UA({
        sockets: [new JsSIP.WebSocketInterface(SIP_SERVER)],
        uri,
        password: sip_password,
        register: true,
        session_timers: false,
      });

      ua.on('registered', () => {
        console.log('[SIP] Registrado!');
        resolve(ua);
      });

      ua.on('registrationFailed', (e) => {
        console.error('[SIP] Falha no registro:', e.cause);
        reject(new Error('Falha no registro SIP: ' + e.cause));
      });

      ua.on('disconnected', () => {
        console.warn('[SIP] Desconectado');
      });

      ua.start();
      uaRef.current = ua;
    });
  };

  const handleLigar = async () => {
    const numero = called.replace(/\D/g, '');
    if (!numero || numero.length < 8) {
      toast.error('Número inválido.');
      return;
    }
    if (!config) {
      toast.error('Configure o ramal SIP primeiro.');
      return;
    }

    setStatus('registrando');
    setErro('');

    try {
      const ua = await registrarSip();
      setStatus('ligando');

      const numeroFormatado = numero.startsWith('55') ? numero : '55' + numero;
      const target = `sip:${numeroFormatado}@${SIP_DOMAIN}`;

      const session = ua.call(target, {
        mediaConstraints: { audio: true, video: false },
        rtcOfferConstraints: { offerToReceiveAudio: true, offerToReceiveVideo: false },
      });

      sessionRef.current = session;

      session.on('connecting', () => setStatus('ligando'));
      session.on('progress', () => setStatus('ligando'));

      session.on('accepted', () => {
        setStatus('ativa');
        // Conectar áudio remoto
        session.connection?.getReceivers().forEach(receiver => {
          if (receiver.track?.kind === 'audio' && audioRef.current) {
            const stream = new MediaStream([receiver.track]);
            audioRef.current.srcObject = stream;
            audioRef.current.play().catch(() => {});
          }
        });
      });

      session.on('ended', () => {
        setStatus('encerrada');
        sessionRef.current = null;
        setTimeout(() => {
          setStatus('idle');
        }, 3000);
      });

      session.on('failed', (e) => {
        setStatus('erro');
        setErro('Chamada falhou: ' + (e.cause || 'erro desconhecido'));
        sessionRef.current = null;
      });

    } catch (e) {
      setStatus('erro');
      setErro(e.message);
    }
  };

  const desligar = (silencioso = false) => {
    if (sessionRef.current) {
      try { sessionRef.current.terminate(); } catch {}
      sessionRef.current = null;
    }
    if (uaRef.current) {
      try { uaRef.current.stop(); } catch {}
      uaRef.current = null;
    }
    if (!silencioso) {
      setStatus('idle');
      setErro('');
    }
  };

  const toggleMudo = () => {
    if (!sessionRef.current) return;
    if (muted) {
      sessionRef.current.unmute({ audio: true });
    } else {
      sessionRef.current.mute({ audio: true });
    }
    setMuted(!muted);
  };

  const isAtiva = status === 'ativa';
  const isLigando = status === 'ligando' || status === 'registrando';

  const statusTexto = {
    idle: '',
    registrando: '🔄 Conectando ao servidor SIP...',
    ligando: '📞 Chamando...',
    ativa: '✅ Chamada em andamento',
    encerrada: '✔️ Chamada encerrada',
    erro: '',
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) desligar(); onOpenChange(v); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Phone className="w-5 h-5 text-green-600" />
            Nova Chamada
          </DialogTitle>
        </DialogHeader>

        {/* Elemento de áudio invisível */}
        <audio ref={audioRef} autoPlay hidden />

        <div className="space-y-4 py-2">

          {loadingConfig && (
            <div className="flex items-center gap-2 text-sm text-slate-400">
              <Loader2 className="w-4 h-4 animate-spin" /> Carregando configuração...
            </div>
          )}

          {!loadingConfig && status === 'erro' && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
              ❌ {erro}
            </div>
          )}

          {!loadingConfig && !isAtiva && !isLigando && status !== 'encerrada' && (
            <div className="space-y-2">
              <Label>Número do Cliente *</Label>
              <Input
                placeholder="Ex: 87991426333 (DDD + número)"
                value={called}
                onChange={e => setCalled(e.target.value.replace(/\D/g, ''))}
                onKeyDown={e => e.key === 'Enter' && handleLigar()}
                autoFocus
                disabled={isLigando}
              />
              <p className="text-xs text-slate-400">DDD + número, sem 0 e sem +55</p>
            </div>
          )}

          {statusTexto[status] && (
            <div className={`rounded-lg p-3 text-sm font-medium text-center ${isAtiva ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-blue-50 text-blue-700 border border-blue-200'}`}>
              {statusTexto[status]}
              {isLigando && <span className="ml-2 inline-block animate-pulse">●●●</span>}
            </div>
          )}

          {status === 'encerrada' && (
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-sm text-slate-600 text-center">
              ✔️ Chamada encerrada
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => { desligar(); onOpenChange(false); }}>
              Fechar
            </Button>

            {isAtiva && (
              <Button
                variant="outline"
                onClick={toggleMudo}
                className={muted ? 'border-orange-400 text-orange-600' : ''}
              >
                {muted ? <MicOff className="w-4 h-4 mr-1" /> : <Mic className="w-4 h-4 mr-1" />}
                {muted ? 'Desmutar' : 'Mutar'}
              </Button>
            )}

            {(isAtiva || isLigando) && (
              <Button onClick={() => desligar()} className="bg-red-600 hover:bg-red-700 text-white">
                <PhoneOff className="w-4 h-4 mr-2" />
                Desligar
              </Button>
            )}

            {!isAtiva && !isLigando && status !== 'encerrada' && !loadingConfig && (
              <Button
                onClick={handleLigar}
                disabled={!!erro || status === 'erro'}
                className="bg-green-600 hover:bg-green-700 text-white"
              >
                <Phone className="w-4 h-4 mr-2" />
                Ligar
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}