import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Search, X, ChevronLeft, ChevronRight, Loader2, Filter, Calendar, ArrowUpDown,
} from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { formatarDataHora } from './galeria/helpers';

const FILTROS_CATEGORY = [
  { id: 'todas', label: 'Todas' },
  { id: 'texto', label: 'Texto' },
  { id: 'imagem', label: 'Imagem' },
  { id: 'video', label: 'Vídeo' },
  { id: 'audio', label: 'Áudio' },
  { id: 'documento', label: 'Documento' },
  { id: 'links', label: 'Links' },
];

const FILTROS_REMETENTE = [
  { id: 'todas', label: 'Todos' },
  { id: 'enviada', label: 'Enviadas' },
  { id: 'recebida', label: 'Recebidas' },
];

const MAX_RESULTADOS = 300;

/**
 * Barra de busca de mensagens — abre no cabeçalho da conversa quando o
 * usuário clica na lupa. Faz a busca no servidor (não apenas no que está
 * carregado na tela), navegável por setas, com filtros opcionais.
 */
export default function BuscarMensagensBar({
  conversaId,
  onFechar,
  onLocalizarMensagem,
}) {
  const [termo, setTermo] = useState('');
  const [categoria, setCategoria] = useState('todas');
  const [remetente, setRemetente] = useState('todas');
  const [ordem, setOrdem] = useState('recente');
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');
  const [mostrarFiltros, setMostrarFiltros] = useState(false);

  const [resultados, setResultados] = useState([]);
  const [total, setTotal] = useState(0);
  const [indice, setIndice] = useState(0);
  const [loading, setLoading] = useState(false);

  const debounceRef = useRef(null);
  const ultimoTermoRef = useRef('');
  const termoRef = useRef('');
  useEffect(() => { termoRef.current = termo; }, [termo]);

  // dispararBusca NÃO depende de `termo` para sua identidade — evita disparo
  // duplo a cada tecla (um imediato pelo effect de filtros + um debounced).
  const dispararBusca = useCallback(async () => {
    if (!conversaId) return;
    setLoading(true);
    setIndice(0);
    try {
      const filtros = {
        conversa_id: conversaId,
        modo: 'busca_texto',
        categoria,
        remetente,
        ordem,
        data_inicio: dataInicio ? new Date(dataInicio + 'T00:00:00').toISOString() : null,
        data_fim: dataFim ? new Date(dataFim + 'T23:59:59').toISOString() : null,
        q: termoRef.current.trim(),
        page: 1,
        limit: MAX_RESULTADOS,
      };
      const resp = await base44.functions.invoke('buscarMensagensBatePapo', filtros);
      const data = resp?.data || {};
      setResultados(Array.isArray(data.resultados) ? data.resultados : []);
      setTotal(data.total || 0);
    } catch (e) {
      // 429 = rate limit: não exibe toast (evita cascata), apenas zera resultados.
      if (e?.status !== 429 && e?.statusCode !== 429) {
        toast.error('Erro ao buscar: ' + (e?.message || 'falha'));
      }
      setResultados([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [conversaId, categoria, remetente, ordem, dataInicio, dataFim]);

  useEffect(() => {
    if (!conversaId) return;
    // Dispara quando filtros mudam (não dispara por termo — dep变换 não inclui termo)
    dispararBusca();
  }, [dispararBusca, conversaId, categoria, remetente, ordem, dataInicio, dataFim]);

  useEffect(() => {
    // Debounce apenas do termo (450ms)
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (ultimoTermoRef.current === termo) return;
    debounceRef.current = setTimeout(() => {
      ultimoTermoRef.current = termo;
      dispararBusca();
    }, 450);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [termo, dispararBusca]);

  // Atalhos do teclado: ESC fecha, Enter/SetaDireita próximo, SetaEsquerda anterior
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') { onFechar?.(); }
      else if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); setIndice(i => Math.min(i + 1, Math.max(resultados.length - 1, 0))); }
      else if (e.key === 'Enter' && e.shiftKey) { e.preventDefault(); setIndice(i => Math.max(i - 1, 0)); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [resultados.length, onFechar]);

  // Selecionar resultado atual: localiza a mensagem na conversa
  useEffect(() => {
    if (!resultados.length) return;
    const alvo = resultados[indice];
    if (!alvo) return;
    onLocalizarMensagem?.(alvo.id, termo.trim());
  }, [indice, resultados, onLocalizarMensagem, termo]);

  const atual = resultados[indice];
  const temResultados = resultados.length > 0;

  return (
    <div className="flex flex-col bg-slate-50 border-b border-slate-200 px-2 sm:px-3 py-2 shrink-0">
      <style>{`
        @keyframes ringDestaque { 0%{box-shadow:0 0 0 0 rgba(16,185,129,.65)} 100%{box-shadow:0 0 0 8px rgba(16,185,129,0)} }
      `}</style>

      <div className="flex items-center gap-1.5 sm:gap-2">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            value={termo}
            onChange={(e) => setTermo(e.target.value)}
            placeholder="Buscar nesta conversa..."
            autoFocus
            className="h-8 pl-8 pr-2 text-xs sm:text-sm rounded-md bg-white border-slate-200"
          />
        </div>
        <Button size="icon" variant="outline" className="h-8 w-8 shrink-0" onClick={() => setMostrarFiltros(v => !v)} title="Filtros">
          <Filter className="h-4 w-4" />
        </Button>
        <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={() => onFechar?.()} title="Fechar busca">
          <X className="h-4 w-4" />
        </Button>
      </div>

      {mostrarFiltros && (
        <div className="flex flex-wrap items-center gap-1.5 mt-2">
          {FILTROS_CATEGORY.map((f) => (
            <button
              key={f.id}
              onClick={() => setCategoria(f.id)}
              className={`text-[10px] px-2 py-0.5 rounded-full font-medium transition-colors ${categoria === f.id ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
            >
              {f.label}
            </button>
          ))}
          <span className="text-slate-300 mx-1">|</span>
          {FILTROS_REMETENTE.map((f) => (
            <button
              key={f.id}
              onClick={() => setRemetente(f.id)}
              className={`text-[10px] px-2 py-0.5 rounded-full font-medium transition-colors ${remetente === f.id ? 'bg-slate-700 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
            >
              {f.label}
            </button>
          ))}
          <span className="text-slate-300 mx-1">|</span>
          <button
            onClick={() => setOrdem(o => (o === 'recente' ? 'antigo' : 'recente'))}
            className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-medium bg-slate-100 text-slate-600 hover:bg-slate-200"
            title="Ordem"
          >
            <ArrowUpDown className="w-3 h-3" /> {ordem === 'recente' ? 'Recentes' : 'Antigos'}
          </button>
          <div className="inline-flex items-center gap-1">
            <Calendar className="w-3 h-3 text-slate-400" />
            <Input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} className="h-6 w-[120px] text-[10px] px-1 rounded border-slate-200" />
            <span>–</span>
            <Input type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} className="h-6 w-[120px] text-[10px] px-1 rounded border-slate-200" />
          </div>
        </div>
      )}

      {/* Status: contador e preview */}
      <div className="flex items-center justify-between mt-1.5 gap-2">
        <button
          type="button"
          disabled={!temResultados || loading || !atual}
          onClick={() => {
            if (!temResultados || !atual?.id) return;
            onLocalizarMensagem?.(atual.id, termo.trim());
          }}
          className={`text-left text-[11px] truncate flex-1 rounded-md transition-colors ${(temResultados && !loading && atual) ? 'text-slate-700 px-2 py-1 -mx-2 hover:bg-emerald-50 hover:text-emerald-800 cursor-pointer' : 'text-slate-500 cursor-default'}`}
          title={(temResultados && !loading && atual) ? 'Clique para ir até a mensagem' : ''}
        >
          {loading ? 'Buscando...' :
           !termo.trim() && categoria === 'todas' && remetente === 'todas' ? 'Digite uma palavra ou use filtros' :
           temResultados ? (atual?.texto ? `"${String(atual.texto).slice(0, 60)}${atual.texto?.length > 60 ? '…' : ''}" · ${atual.remetente === 'vendedor' ? 'Enviado' : 'Recebido'} · ${formatarDataHora(atual.data_envio || atual.created_date)}` : `${atual?.arquivo_nome || 'Mídia'} · ${formatarDataHora(atual?.data_envio)}`) :
           'Nenhum resultado encontrado'}
        </button>
        <div className="flex items-center gap-1 shrink-0">
          <Tooltip>
            <TooltipTrigger asChild>
              <span className={`text-[11px] font-medium text-slate-600 mr-1 ${temResultados ? '' : 'opacity-40'}`}>
                {temResultados ? `${indice + 1}` : '0'} de {total}
              </span>
            </TooltipTrigger>
            <TooltipContent>{resultados.length} resultados carregados de {total}</TooltipContent>
          </Tooltip>
          <Button size="icon" variant="ghost" className="h-7 w-7 disabled:opacity-30" disabled={!temResultados || indice === 0} onClick={() => setIndice(i => Math.max(i - 1, 0))} title="Resultado anterior (Shift+Enter)">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="ghost" className="h-7 w-7 disabled:opacity-30" disabled={!temResultados || indice >= resultados.length - 1} onClick={() => setIndice(i => Math.min(i + 1, resultados.length - 1))} title="Próximo resultado (Enter)">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}