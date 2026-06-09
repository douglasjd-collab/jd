import React, { useState, useRef, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Mic, MicOff, Upload, FileText, Square, Pause, Play, Loader2, X, Headphones, Sparkles } from 'lucide-react';
import { toast } from 'sonner';

function fmt(s) {
  return `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;
}

export default function IAInputAudio({ onAnalisar, loading }) {
  const [modo, setModo] = useState(null); // 'gravar' | 'enviar' | 'digitar'
  const [gravando, setGravando] = useState(false);
  const [pausado, setPausado] = useState(false);
  const [timer, setTimer] = useState(0);
  const [audioBlob, setAudioBlob] = useState(null);
  const [audioUrl, setAudioUrl] = useState(null);
  const [texto, setTexto] = useState('');
  const [processando, setProcessando] = useState(false);

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const timerRef = useRef(null);
  const streamRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (gravando && !pausado) {
      timerRef.current = setInterval(() => setTimer(t => t + 1), 1000);
    } else {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [gravando, pausado]);

  const iniciarGravacao = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mr = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      audioChunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      mr.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        setAudioBlob(blob);
        setAudioUrl(URL.createObjectURL(blob));
      };
      mr.start(1000);
      mediaRecorderRef.current = mr;
      setGravando(true);
      setPausado(false);
      setTimer(0);
      setAudioBlob(null);
      setAudioUrl(null);
    } catch (e) {
      toast.error('Permissão de microfone negada. Verifique as configurações do navegador.');
    }
  };

  const pausarResumir = () => {
    if (!mediaRecorderRef.current) return;
    if (mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.pause();
      setPausado(true);
    } else if (mediaRecorderRef.current.state === 'paused') {
      mediaRecorderRef.current.resume();
      setPausado(false);
    }
  };

  const finalizarGravacao = () => {
    mediaRecorderRef.current?.stop();
    streamRef.current?.getTracks().forEach(t => t.stop());
    setGravando(false);
    setPausado(false);
  };

  const cancelarGravacao = () => {
    mediaRecorderRef.current?.stop();
    streamRef.current?.getTracks().forEach(t => t.stop());
    setGravando(false);
    setPausado(false);
    setTimer(0);
    setAudioBlob(null);
    setAudioUrl(null);
    audioChunksRef.current = [];
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAudioBlob(file);
    setAudioUrl(URL.createObjectURL(file));
  };

  const analisarAudio = async () => {
    if (!audioBlob) return;
    setProcessando(true);
    try {
      toast.info('Fazendo upload do áudio...');
      const { file_url } = await base44.integrations.Core.UploadFile({ file: audioBlob });
      toast.info('Transcrevendo com IA...');
      const transcricao = await base44.integrations.Core.TranscribeAudio({ audio_url: file_url });
      if (!transcricao) throw new Error('Transcrição retornou vazia.');
      await onAnalisar({ transcricao, audio_url: file_url, duracao_segundos: timer });
    } catch (e) {
      toast.error('Erro ao processar áudio: ' + (e.message || 'Tente novamente'));
    } finally {
      setProcessando(false);
    }
  };

  const analisarTexto = async () => {
    if (!texto.trim()) return;
    await onAnalisar({ transcricao: texto, audio_url: null, duracao_segundos: 0 });
  };

  const resetar = () => {
    setModo(null);
    setGravando(false);
    setPausado(false);
    setAudioBlob(null);
    setAudioUrl(null);
    setTexto('');
    setTimer(0);
    audioChunksRef.current = [];
  };

  const isProcessando = processando || loading;

  return (
    <div className="bg-gradient-to-br from-violet-50 to-purple-50 border border-violet-200 rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-8 h-8 rounded-full bg-violet-600 flex items-center justify-center flex-shrink-0">
          <Mic className="w-4 h-4 text-white" />
        </div>
        <div>
          <p className="font-bold text-violet-800 text-sm">🎤 Análise por Áudio</p>
          <p className="text-xs text-violet-600">Grave ou envie um áudio resumindo a conversa. A IA transcreve e gera insights comerciais.</p>
        </div>
        {modo && (
          <button onClick={resetar} className="ml-auto text-slate-400 hover:text-slate-600 transition-colors">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Mode selector */}
      {!modo && (
        <div className="flex gap-2 flex-wrap">
          <Button size="sm" variant="outline" className="gap-2 border-violet-300 text-violet-700 hover:bg-violet-100 bg-white"
            onClick={() => setModo('gravar')}>
            <Mic className="w-4 h-4" /> Gravar Áudio
          </Button>
          <Button size="sm" variant="outline" className="gap-2 border-violet-300 text-violet-700 hover:bg-violet-100 bg-white"
            onClick={() => setModo('enviar')}>
            <Upload className="w-4 h-4" /> Enviar Áudio
          </Button>
          <Button size="sm" variant="outline" className="gap-2 border-violet-300 text-violet-700 hover:bg-violet-100 bg-white"
            onClick={() => setModo('digitar')}>
            <FileText className="w-4 h-4" /> Digitar Resumo
          </Button>
        </div>
      )}

      {/* GRAVAR */}
      {modo === 'gravar' && (
        <div className="space-y-3">
          {!gravando && !audioBlob && (
            <Button onClick={iniciarGravacao} className="gap-2 bg-red-600 hover:bg-red-700 w-full">
              <Mic className="w-4 h-4" /> Iniciar Gravação
            </Button>
          )}

          {gravando && (
            <div className="space-y-3">
              <div className="flex items-center justify-between bg-white rounded-xl px-4 py-3 border border-red-200">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
                  <span className="text-sm font-bold text-red-600">{pausado ? '⏸ Pausado' : '● Gravando'}</span>
                </div>
                <span className="font-mono font-bold text-lg text-slate-700">{fmt(timer)}</span>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" className="flex-1 gap-1.5" onClick={pausarResumir}>
                  {pausado ? <><Play className="w-3.5 h-3.5" /> Continuar</> : <><Pause className="w-3.5 h-3.5" /> Pausar</>}
                </Button>
                <Button size="sm" className="flex-1 gap-1.5 bg-green-600 hover:bg-green-700" onClick={finalizarGravacao}>
                  <Square className="w-3.5 h-3.5" /> Finalizar
                </Button>
                <Button size="sm" variant="ghost" className="gap-1.5 text-red-500 hover:bg-red-50 hover:text-red-700" onClick={cancelarGravacao}>
                  <X className="w-3.5 h-3.5" /> Cancelar
                </Button>
              </div>
            </div>
          )}

          {!gravando && audioBlob && audioUrl && (
            <div className="space-y-3">
              <div className="bg-white border rounded-xl p-3">
                <p className="text-xs text-slate-500 mb-2 flex items-center gap-1.5">
                  <Headphones className="w-3.5 h-3.5" /> Prévia do áudio gravado ({fmt(timer)})
                </p>
                <audio src={audioUrl} controls className="w-full h-8" />
              </div>
              <div className="flex gap-2">
                <Button className="flex-1 gap-2 bg-violet-600 hover:bg-violet-700" onClick={analisarAudio} disabled={isProcessando}>
                  {isProcessando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mic className="w-4 h-4" />}
                  {isProcessando ? 'Processando...' : 'Transcrever e Analisar'}
                </Button>
                <Button size="sm" variant="outline" onClick={() => { setAudioBlob(null); setAudioUrl(null); setTimer(0); }}>
                  Regravar
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ENVIAR */}
      {modo === 'enviar' && (
        <div className="space-y-3">
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/mp3,audio/wav,audio/m4a,audio/ogg,audio/webm,audio/mpeg,audio/*"
            className="hidden"
            onChange={handleFileChange}
          />
          {!audioBlob ? (
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-full border-2 border-dashed border-violet-300 rounded-xl p-6 text-center hover:border-violet-500 hover:bg-white transition-all cursor-pointer"
            >
              <Upload className="w-8 h-8 text-violet-400 mx-auto mb-2" />
              <p className="text-sm font-medium text-violet-700">Clique para selecionar áudio</p>
              <p className="text-xs text-slate-400 mt-1">MP3, WAV, M4A, OGG, áudios do WhatsApp</p>
            </button>
          ) : (
            <div className="space-y-3">
              <div className="bg-white border rounded-xl p-3">
                <p className="text-xs text-slate-500 mb-2 flex items-center gap-1.5">
                  <Headphones className="w-3.5 h-3.5" /> Áudio selecionado
                </p>
                <audio src={audioUrl} controls className="w-full h-8" />
              </div>
              <div className="flex gap-2">
                <Button className="flex-1 gap-2 bg-violet-600 hover:bg-violet-700" onClick={analisarAudio} disabled={isProcessando}>
                  {isProcessando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                  {isProcessando ? 'Processando...' : 'Transcrever e Analisar'}
                </Button>
                <Button size="sm" variant="outline" onClick={() => { setAudioBlob(null); setAudioUrl(null); }}>
                  Trocar arquivo
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* DIGITAR */}
      {modo === 'digitar' && (
        <div className="space-y-3">
          <Textarea
            placeholder={`Descreva como foi o atendimento com o cliente...\n\nExemplos:\n• "Conversei com Maria Eliane. Ela deseja financiar um veículo de R$ 60.000. Achou a entrada alta e pediu nova simulação com entrada menor."\n• "Cliente interessado em proteção veicular para uma Hilux 2022. Ficou interessado e pediu retorno amanhã."`}
            value={texto}
            onChange={e => setTexto(e.target.value)}
            className="min-h-[140px] text-sm bg-white resize-none"
            autoFocus
          />
          <div className="flex gap-2">
            <Button className="flex-1 gap-2 bg-violet-600 hover:bg-violet-700" onClick={analisarTexto} disabled={!texto.trim() || isProcessando}>
              {isProcessando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {isProcessando ? 'Analisando...' : '🤖 Analisar Texto'}
            </Button>
            {texto && (
              <Button size="sm" variant="ghost" className="gap-1 text-slate-500 hover:bg-slate-100 px-3" title="Limpar texto" onClick={() => setTexto('')}>
                <X className="w-4 h-4" />
              </Button>
            )}
            <Button size="sm" variant="outline" className="gap-1 text-slate-500 px-3" onClick={() => { setTexto(''); setModo(null); }}>
              Cancelar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}