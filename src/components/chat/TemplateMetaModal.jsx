import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Search, Send, Loader2, RefreshCw, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { ScrollArea } from '@/components/ui/scroll-area';

export default function TemplateMetaModal({ open, onOpenChange, empresaId, telefoneDestino, conversaId, onEnviado }) {
  const [search, setSearch] = useState('');
  const [enviando, setEnviando] = useState(null); // id do template sendo enviado
  const [sincronizando, setSincronizando] = useState(false);
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

  const enviarTemplate = async (t) => {
    const d = parseTemplate(t);
    const numLimpo = (telefoneDestino || '').replace(/\D/g, '');
    if (!numLimpo) { toast.error('Número inválido'); return; }

    setEnviando(t.id);
    try {
      const textoPreview = d.corpo || `📋 Template: ${d.nome}`;
      const resp = await base44.functions.invoke('dispararCampanhaMetaOficial', {
        empresa_id: empresaId,
        template_name: d.nome,
        template_language: d.idioma || 'pt_BR',
        variaveis: {},
        contatos: [numLimpo],
        conversa_id: conversaId || null,
        texto_preview: textoPreview,
      });

      if (resp?.data?.erros > 0 && resp?.data?.enviados === 0) {
        const motivo = resp?.data?.resultados?.[0]?.motivo || 'Erro desconhecido';
        toast.error('Erro ao enviar: ' + motivo);
      } else {
        toast.success(`✅ Template "${d.nome}" enviado!`);
        onOpenChange(false);
        // Aguardar 800ms para o banco processar e então forçar refetch
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

  return (
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
                      </div>
                      <Button
                        size="sm"
                        className="gap-1.5 bg-green-600 hover:bg-green-700 text-xs h-8 flex-shrink-0"
                        onClick={() => enviarTemplate(t)}
                        disabled={isEnviando}
                      >
                        {isEnviando
                          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          : <Send className="w-3.5 h-3.5" />
                        }
                        Enviar
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}