import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Search, Send, Loader2, RefreshCw, FileText, Eye, X, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { ScrollArea } from '@/components/ui/scroll-area';

export default function TemplateMetaModal({ open, onOpenChange, empresaId, telefoneDestino, conversaId, onEnviado }) {
  const [search, setSearch] = useState('');
  const [enviando, setEnviando] = useState(null);
  const [sincronizando, setSincronizando] = useState(false);
  const [deletando, setDeletando] = useState(null);
  const [previewTemplate, setPreviewTemplate] = useState(null); // template em prévia
  const queryClient = useQueryClient();

  const { data: templates = [], refetch } = useQuery({
    queryKey: ['meta-templates', empresaId],
    enabled: !!empresaId && open,
    queryFn: async () => {
      try {
        return await base44.entities.CampanhaLog.filter(
          { empresa_id: empresaId, tipo_campanha: 'meta_template_definition' },
          '-created_date', 200
        );
      } catch { return []; }
    },
  });

  const parseTemplate = (t) => {
    try { return JSON.parse(t.motivo_erro || '{}'); } catch { return {}; }
  };

  const aprovados = templates.filter(t => {
    const d = parseTemplate(t);
    return d.status_meta === 'aprovado';
  });

  const filtrados = aprovados.filter(t => {
    const d = parseTemplate(t);
    const nome = d.nome || t.cliente_nome || '';
    return !search || nome.toLowerCase().includes(search.toLowerCase()) || (d.corpo || '').toLowerCase().includes(search.toLowerCase());
  });

  const sincronizar = async () => {
    setSincronizando(true);
    try {
      const resp = await base44.functions.invoke('sincronizarTemplatesMeta', { empresa_id: empresaId });
      if (resp?.data?.ok) {
        toast.success(`✅ ${resp.data.total} templates sincronizados`);
        refetch();
      } else {
        toast.error('Erro ao sincronizar: ' + (resp?.data?.error || 'Desconhecido'));
      }
    } catch (e) {
      toast.error('Erro: ' + e.message);
    } finally {
      setSincronizando(false);
    }
  };

  const enviarTemplate = async (d, tId) => {
    const numLimpo = (telefoneDestino || '').replace(/\D/g, '');
    if (!numLimpo) { toast.error('Número inválido'); return; }

    setEnviando(tId);
    try {
      const resp = await base44.functions.invoke('dispararCampanhaMetaOficial', {
        empresa_id: empresaId,
        template_name: d.nome,
        template_language: d.idioma || 'pt_BR',
        variaveis: {},
        contatos: [numLimpo],
        conversa_id: conversaId || null,
        texto_preview: d.corpo || `📋 Template: ${d.nome}`,
        template_header_type: d.tipo_cabecalho || '',
        template_header_url: d.cabecalho_midia_url || '',
        template_botoes: d.botoes || [],
        nome_campanha: d.nome,
      });

      if (resp?.data?.erros > 0 && resp?.data?.enviados === 0) {
        const motivo = resp?.data?.resultados?.[0]?.motivo || 'Erro desconhecido';
        toast.error('Erro ao enviar: ' + motivo);
      } else {
        toast.success(`✅ Template "${d.nome}" enviado!`);
        setPreviewTemplate(null);
        onOpenChange(false);
        if (conversaId) {
          setTimeout(() => {
            queryClient.invalidateQueries({ queryKey: ['mensagens-whatsapp', conversaId] });
            queryClient.refetchQueries({ queryKey: ['mensagens-whatsapp', conversaId] });
          }, 800);
        }
        onEnviado?.();
      }
    } catch (e) {
      toast.error('Erro: ' + e.message);
    } finally {
      setEnviando(null);
    }
  };

  const deletarTemplate = async (d, tId) => {
    if (!confirm(`Excluir o template "${d.nome || 'sem nome'}"? Esta ação não pode ser desfeita.`)) return;
    setDeletando(tId);
    try {
      await base44.entities.CampanhaLog.delete(tId);
      toast.success(`Template "${d.nome}" excluído`);
      refetch();
    } catch (e) {
      toast.error('Erro ao excluir: ' + e.message);
    } finally {
      setDeletando(null);
    }
  };

  // Renderiza o painel de prévia do template
  const renderPreview = () => {
    if (!previewTemplate) return null;
    const d = previewTemplate.d;
    const tId = previewTemplate.tId;
    const isEnviando = enviando === tId;
    const cabecalhoTipo = (d.tipo_cabecalho || '').toUpperCase();
    const urlMidia = String(d.cabecalho_midia_url || '').trim();
    const isNumericHandle = /^\d{10,}$/.test(urlMidia);
    const isMetaCdn = /fbcdn\.net|fbsbx\.com|facebook\.com/.test(urlMidia);
    const urlUtilizavel = urlMidia && !isNumericHandle && !isMetaCdn;
    const hasImage = cabecalhoTipo === 'IMAGE' && urlUtilizavel;
    const hasVideo = cabecalhoTipo === 'VIDEO' && urlUtilizavel;
    const isHandle = (cabecalhoTipo === 'IMAGE' || cabecalhoTipo === 'VIDEO') && d.cabecalho_midia_url && (isNumericHandle || isMetaCdn);
    const botoes = Array.isArray(d.botoes) ? d.botoes : [];

    return (
      <Dialog open={true} onOpenChange={() => setPreviewTemplate(null)}>
        <DialogContent className="max-w-sm max-h-[90vh] flex flex-col p-0 overflow-hidden">
          <DialogHeader className="px-4 pt-4 pb-2 border-b">
            <DialogTitle className="text-sm flex items-center justify-between">
              <span>Visualizar Template</span>
              <button onClick={() => setPreviewTemplate(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </DialogTitle>
            <div className="flex items-center gap-1.5 flex-wrap mt-1">
              <span className="text-xs font-semibold text-slate-700">{d.nome}</span>
              <Badge className="bg-emerald-100 text-emerald-700 text-[10px] border-emerald-200">Aprovado</Badge>
              {d.categoria && <Badge variant="outline" className="text-[10px]">{d.categoria}</Badge>}
              {d.idioma && <Badge variant="outline" className="text-[10px]">{d.idioma}</Badge>}
            </div>
          </DialogHeader>

          <p className="text-[10px] text-slate-400 px-4 pt-2 font-semibold uppercase tracking-wide">PRÉVIA DA MENSAGEM</p>

          <ScrollArea className="flex-1 px-4 py-2">
            {/* Balão de prévia estilo WhatsApp */}
            <div className="bg-blue-500 text-white rounded-2xl rounded-br-sm overflow-hidden shadow-md max-w-xs mx-auto">
              {/* Imagem do cabeçalho */}
              {hasImage && (
                <img
                  src={d.cabecalho_midia_url}
                  alt="Header"
                  className="w-full object-cover max-h-48"
                  onError={e => { e.target.style.display = 'none'; }}
                />
              )}
              {/* Vídeo do cabeçalho */}
              {hasVideo && (
                <video
                  src={d.cabecalho_midia_url}
                  controls
                  className="w-full max-h-48"
                  onError={e => { e.target.style.display = 'none'; }}
                />
              )}
              {isHandle && (
                <div className="w-full py-8 flex flex-col items-center justify-center bg-blue-400/50 text-white/80 text-xs gap-1.5">
                  <span className="text-lg">{cabecalhoTipo === 'VIDEO' ? '🎬' : '🖼️'}</span>
                  <span className="font-medium">{cabecalhoTipo === 'VIDEO' ? 'Vídeo do template' : 'Imagem do template'}</span>
                  {isMetaCdn && (
                    <span className="text-[10px] text-white/50 max-w-[200px] text-center leading-tight">
                      URL temporária da Meta. Clique em Sync para baixar a mídia.
                    </span>
                  )}
                </div>
              )}
              {/* Corpo */}
              <div className="px-3 py-2.5">
                <p className="text-sm whitespace-pre-wrap break-words">{d.corpo || ''}</p>
                {d.rodape && <p className="text-[11px] text-white/60 mt-1">{d.rodape}</p>}
              </div>
              {/* Botões */}
              {botoes.length > 0 && (
                <div className="border-t border-white/20">
                  {botoes.map((btn, i) => (
                    <div
                      key={i}
                      className={`py-2 px-3 text-center text-xs font-semibold text-white/90 flex items-center justify-center gap-1.5 ${i > 0 ? 'border-t border-white/20' : ''}`}
                    >
                      {btn.tipo === 'QUICK_REPLY' && <span className="text-[10px] opacity-60">↩</span>}
                      {btn.texto || btn.text}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </ScrollArea>

          <div className="px-4 pb-4 pt-2 flex gap-2 border-t mt-2">
            <Button variant="outline" className="flex-1" onClick={() => setPreviewTemplate(null)}>
              Fechar
            </Button>
            <Button
              className="flex-1 bg-green-600 hover:bg-green-700 gap-1.5"
              onClick={() => enviarTemplate(d, tId)}
              disabled={isEnviando}
            >
              {isEnviando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              Usar no Disparo
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <FileText className="w-4 h-4 text-green-600" />
              Enviar Template Meta
            </DialogTitle>
          </DialogHeader>

          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-slate-400" />
              <Input
                placeholder="Buscar template..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-8 text-sm h-9"
              />
            </div>
            <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={sincronizar} disabled={sincronizando}>
              {sincronizando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              Sync
            </Button>
          </div>

          <p className="text-xs text-slate-400">{filtrados.length} template(s) aprovado(s)</p>

          <ScrollArea className="flex-1 -mx-1 px-1">
            {filtrados.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 text-slate-400 gap-2">
                <FileText className="w-8 h-8 opacity-30" />
                <p className="text-sm">Nenhum template aprovado</p>
                <p className="text-xs text-center">Clique em Sync para sincronizar da Meta</p>
              </div>
            ) : (
              <div className="space-y-2 py-1">
                {filtrados.map(t => {
                  const d = parseTemplate(t);
                  const isEnviando = enviando === t.id;
                  const cabecalhoTipoItem = (d.tipo_cabecalho || '').toUpperCase();
                  const hasMedia = cabecalhoTipoItem && cabecalhoTipoItem !== 'NONE' && cabecalhoTipoItem !== 'TEXT' && d.cabecalho_midia_url;
                  const hasBotoes = Array.isArray(d.botoes) && d.botoes.length > 0;
                  return (
                    <div key={t.id} className="border rounded-xl p-3 hover:border-green-300 hover:bg-green-50/50 transition-colors">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap mb-1">
                            <p className="text-sm font-semibold text-slate-900">{d.nome || t.cliente_nome}</p>
                            <Badge className="bg-emerald-100 text-emerald-700 text-[10px] border-emerald-200">Aprovado</Badge>
                            {d.categoria && <Badge variant="outline" className="text-[10px]">{d.categoria}</Badge>}
                          </div>
                          {d.corpo && (
                            <p className="text-xs text-slate-500 line-clamp-2">{d.corpo}</p>
                          )}
                          <div className="flex items-center gap-2 mt-1">
                            {hasMedia && (
                              <span className="text-[10px] text-slate-400">{cabecalhoTipoItem === 'VIDEO' ? '🎬' : '🖼️'} {cabecalhoTipoItem}</span>
                            )}
                            {hasBotoes && (
                              <span className="text-[10px] text-slate-400">🔘 {d.botoes.length} botão(ões)</span>
                          )}
                          </div>
                        </div>
                        <div className="flex flex-col gap-1 flex-shrink-0">
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1 text-xs h-7 px-2"
                            onClick={() => setPreviewTemplate({ d, tId: t.id })}
                          >
                            <Eye className="w-3 h-3" />
                            Ver
                          </Button>
                          <Button
                            size="sm"
                            className="gap-1.5 bg-green-600 hover:bg-green-700 text-xs h-7 px-2"
                            onClick={() => enviarTemplate(d, t.id)}
                            disabled={isEnviando}
                          >
                            {isEnviando
                              ? <Loader2 className="w-3 h-3 animate-spin" />
                              : <Send className="w-3 h-3" />
                            }
                            Enviar
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1 text-xs h-7 px-2 border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
                            onClick={() => deletarTemplate(d, t.id)}
                            disabled={deletando === t.id}
                          >
                            {deletando === t.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                            Excluir
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Modal de prévia do template */}
      {previewTemplate && renderPreview()}
    </>
  );
}