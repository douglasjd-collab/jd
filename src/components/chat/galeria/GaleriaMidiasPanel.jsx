import React, { useState, useMemo, useEffect } from 'react';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Search, X, ImageIcon, FileText, Headphones, Link as LinkIconLucide, Filter } from 'lucide-react';
import AbaMidias from './AbaMidias';
import AbaDocumentos from './AbaDocumentos';
import AbaAudios from './AbaAudios';
import AbaLinks from './AbaLinks';
import VisualizadorMidia from './VisualizadorMidia';
import VisualizadorPdf from './VisualizadorPdf';

const ABAS = [
  { id: 'midias', label: 'Mídias', icon: ImageIcon },
  { id: 'documentos', label: 'Documentos', icon: FileText },
  { id: 'audios', label: 'Áudios', icon: Headphones },
  { id: 'links', label: 'Links', icon: LinkIconLucide },
];

/**
 * Painel lateral (Sheet) com as abas Mídias/Documentos/Áudios/Links.
 * Compartilha filtros entre abas, abre visualizador de mídia/PDF e
 * localiza a mensagem na conversa.
 */
export default function GaleriaMidiasPanel({ open, onOpenChange, conversaId, onLocalizarMensagem, onEncaminharMensagem }) {
  const [aba, setAba] = useState('midias');
  const [q, setQ] = useState('');
  const [remetente, setRemetente] = useState('todas');
  const [ordem, setOrdem] = useState('recente');
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');
  const [mostrarFiltros, setMostrarFiltros] = useState(false);
  const [visualizadorMidia, setVisualizadorMidia] = useState(null);
  const [pdfAberto, setPdfAberto] = useState(null);

  useEffect(() => {
    if (!open) {
      setVisualizadorMidia(null);
      setPdfAberto(null);
    }
  }, [open]);

  useEffect(() => {
    if (!open) {
      setQ(''); setRemetente('todas'); setOrdem('recente');
      setDataInicio(''); setDataFim(''); setMostrarFiltros(false);
    }
  }, [open]);

  const filtros = useMemo(() => ({
    q, remetente, ordem,
    dataInicio: dataInicio ? new Date(dataInicio + 'T00:00:00').toISOString() : null,
    dataFim: dataFim ? new Date(dataFim + 'T23:59:59').toISOString() : null,
  }), [q, remetente, ordem, dataInicio, dataFim]);

  const handleLocalizar = (msgId) => {
    onLocalizarMensagem?.(msgId);
    onOpenChange?.(false);
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" hideDefaultClose className="w-full sm:w-[420px] md:w-[480px] p-0 flex flex-col gap-0">
          <div className="p-3 border-b border-slate-100 shrink-0">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold">Mídias, links e documentos</h3>
              <button
                type="button"
                onClick={() => onOpenChange?.(false)}
                className="h-7 w-7 rounded-full flex items-center justify-center bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-700 transition-colors"
                title="Fechar"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="flex items-center gap-1.5">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Buscar por nome ou texto…"
                  className="h-8 pl-8 pr-2 text-xs rounded-md bg-slate-50 border-slate-200"
                />
              </div>
              <Button
                size="icon"
                variant={mostrarFiltros ? 'secondary' : 'outline'}
                className="h-8 w-8 shrink-0"
                onClick={() => setMostrarFiltros(v => !v)}
                title="Filtros"
              >
                <Filter className="h-4 w-4" />
              </Button>
            </div>

            {mostrarFiltros && (
              <div className="grid grid-cols-2 gap-1.5 mt-2">
                <Select value={remetente} onValueChange={setRemetente}>
                  <SelectTrigger className="h-8 text-xs rounded-md"><SelectValue placeholder="Remetente" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todas">Todos os remetentes</SelectItem>
                    <SelectItem value="enviada">Enviadas</SelectItem>
                    <SelectItem value="recebida">Recebidas</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={ordem} onValueChange={setOrdem}>
                  <SelectTrigger className="h-8 text-xs rounded-md"><SelectValue placeholder="Ordem" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="recente">Mais recente primeiro</SelectItem>
                    <SelectItem value="antigo">Mais antigo primeiro</SelectItem>
                  </SelectContent>
                </Select>
                <Input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} className="h-8 text-xs rounded-md" />
                <Input type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} className="h-8 text-xs rounded-md" />
              </div>
            )}

            <div className="flex items-center gap-1 mt-2.5 border-b border-slate-100 -mx-3 px-3 pb-0">
              {ABAS.map((t) => {
                const Icon = t.icon;
                const ativa = aba === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => setAba(t.id)}
                    className={`flex items-center gap-1 px-2 py-1.5 text-xs font-medium rounded-t-md transition-colors ${ativa ? 'text-emerald-700 border-b-2 border-emerald-600' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'}`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">{t.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {aba === 'midias' && (
              <AbaMidias conversaId={conversaId} filtros={filtros} onLocalizarMensagem={handleLocalizar} onAbrirMidia={(idx, midias) => setVisualizadorMidia({ indice: idx, midias })} />
            )}
            {aba === 'documentos' && (
              <AbaDocumentos conversaId={conversaId} filtros={filtros} onLocalizarMensagem={handleLocalizar} onAbrirPdf={setPdfAberto} />
            )}
            {aba === 'audios' && (
              <AbaAudios conversaId={conversaId} filtros={filtros} onLocalizarMensagem={handleLocalizar} />
            )}
            {aba === 'links' && (
              <AbaLinks conversaId={conversaId} filtros={filtros} onLocalizarMensagem={handleLocalizar} />
            )}
          </div>
        </SheetContent>
      </Sheet>

      {visualizadorMidia && (
        <VisualizadorMidia
          midias={visualizadorMidia.midias}
          indiceInicial={visualizadorMidia.indice}
          onFechar={() => setVisualizadorMidia(null)}
          onLocalizarMensagem={handleLocalizar}
          onEncaminhar={onEncaminharMensagem}
        />
      )}

      {pdfAberto && (
        <VisualizadorPdf mensagem={pdfAberto} onFechar={() => setPdfAberto(null)} onLocalizarMensagem={handleLocalizar} onEncaminhar={onEncaminharMensagem} />
      )}
    </>
  );
}