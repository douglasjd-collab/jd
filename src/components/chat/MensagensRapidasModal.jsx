import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Plus, ChevronDown, ChevronUp, Send, Pencil, Trash2, Loader2, Zap } from 'lucide-react';
import { toast } from 'sonner';

const TIPOS_MENSAGEM = [
  { value: 'texto', label: 'Texto' },
  { value: 'imagem', label: 'Imagem' },
  { value: 'video', label: 'Vídeo' },
  { value: 'audio', label: 'Áudio' },
  { value: 'documento', label: 'Documento (PDF)' },
];

export default function MensagensRapidasModal({ open, onOpenChange, empresaId, onUsar }) {
  const queryClient = useQueryClient();
  const [expandidas, setExpandidas] = useState({});
  const [abaAtiva, setAbaAtiva] = useState('mensagens');
  const [criandoNova, setCriandoNova] = useState(false);
  const [editando, setEditando] = useState(null);
  const [form, setForm] = useState({ categoria: '', titulo: '', tipo: 'texto', conteudo: '' });
  const [novaCategoria, setNovaCategoria] = useState('');

  // Buscar mensagens rápidas do banco
  const { data: mensagens = [], isLoading } = useQuery({
    queryKey: ['mensagens-rapidas', empresaId],
    enabled: !!empresaId && open,
    queryFn: async () => {
      try {
        return await base44.entities.CampanhaLog.filter({
          empresa_id: empresaId,
          tipo_campanha: 'mensagem_rapida',
        }, 'cliente_nome', 500);
      } catch { return []; }
    },
  });

  const parseMensagem = (m) => {
    try { return JSON.parse(m.motivo_erro || '{}'); } catch { return {}; }
  };

  // Agrupar por categoria
  const porCategoria = useMemo(() => {
    const mapa = {};
    mensagens.forEach(m => {
      const d = parseMensagem(m);
      const cat = d.categoria || 'Sem Categoria';
      if (!mapa[cat]) mapa[cat] = [];
      mapa[cat].push({ ...m, _parsed: d });
    });
    return mapa;
  }, [mensagens]);

  const categorias = Object.keys(porCategoria);

  const salvarMutation = useMutation({
    mutationFn: async (dados) => {
      const payload = {
        empresa_id: empresaId,
        tipo_campanha: 'mensagem_rapida',
        cliente_nome: dados.titulo,
        cliente_telefone: dados.categoria,
        status: 'enviada',
        motivo_erro: JSON.stringify({
          categoria: dados.categoria,
          titulo: dados.titulo,
          tipo: dados.tipo,
          conteudo: dados.conteudo,
        }),
      };
      if (dados.id) return base44.entities.CampanhaLog.update(dados.id, payload);
      return base44.entities.CampanhaLog.create(payload);
    },
    onSuccess: () => {
      toast.success('Mensagem rápida salva!');
      queryClient.invalidateQueries({ queryKey: ['mensagens-rapidas', empresaId] });
      setCriandoNova(false);
      setEditando(null);
      setForm({ categoria: '', titulo: '', tipo: 'texto', conteudo: '' });
    },
    onError: (e) => toast.error('Erro: ' + e.message),
  });

  const deletarMutation = useMutation({
    mutationFn: (id) => base44.entities.CampanhaLog.delete(id),
    onSuccess: () => {
      toast.success('Mensagem excluída');
      queryClient.invalidateQueries({ queryKey: ['mensagens-rapidas', empresaId] });
    },
    onError: (e) => toast.error('Erro: ' + e.message),
  });

  const handleEditar = (m) => {
    const d = m._parsed;
    setForm({ id: m.id, categoria: d.categoria || '', titulo: d.titulo || '', tipo: d.tipo || 'texto', conteudo: d.conteudo || '' });
    setEditando(m.id);
    setCriandoNova(true);
    setAbaAtiva('mensagens');
  };

  const handleUsar = (m) => {
    const d = m._parsed;
    onUsar({ tipo: d.tipo || 'texto', conteudo: d.conteudo || '' });
    onOpenChange(false);
  };

  const toggleCategoria = (cat) => {
    setExpandidas(prev => ({ ...prev, [cat]: !prev[cat] }));
  };

  const adicionarCategoria = () => {
    if (!novaCategoria.trim()) return;
    const nomeCat = novaCategoria.trim();
    setNovaCategoria('');
    setForm({ categoria: nomeCat, titulo: '', tipo: 'texto', conteudo: '' });
    setEditando(null);
    setCriandoNova(true);
    setAbaAtiva('mensagens');
    toast.info(`Categoria "${nomeCat}" pronta! Preencha o título e conteúdo para salvar.`);
  };

  const adicionarMensagemEmCategoria = (nomeCat) => {
    setForm({ categoria: nomeCat, titulo: '', tipo: 'texto', conteudo: '' });
    setEditando(null);
    setCriandoNova(true);
    setAbaAtiva('mensagens');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-yellow-500" />
            Mensagens Rápidas
          </DialogTitle>
        </DialogHeader>

        <Tabs value={abaAtiva} onValueChange={setAbaAtiva} className="flex-1 flex flex-col min-h-0">
          <TabsList className="w-full">
            <TabsTrigger value="mensagens" className="flex-1">Mensagens</TabsTrigger>
            <TabsTrigger value="categorias" className="flex-1">Categorias</TabsTrigger>
          </TabsList>

          <TabsContent value="mensagens" className="flex-1 flex flex-col min-h-0 mt-3">
            {/* Botão Criar Nova */}
            <div className="flex gap-2 mb-4 flex-shrink-0">
              <Button
                className="flex-1 gap-2 bg-green-600 hover:bg-green-700"
                onClick={() => { setCriandoNova(true); setEditando(null); setForm({ categoria: '', titulo: '', tipo: 'texto', conteudo: '' }); }}
              >
                <Plus className="w-4 h-4" />
                Criar Nova Mensagem
              </Button>
              {criandoNova && (
                <Button
                  variant="outline"
                  onClick={() => { setCriandoNova(false); setEditando(null); setForm({ categoria: '', titulo: '', tipo: 'texto', conteudo: '' }); }}
                >
                  Cancelar
                </Button>
              )}
            </div>

            {/* Formulário de criação/edição */}
            {criandoNova && (
              <div className="border rounded-xl p-4 space-y-3 mb-4 bg-slate-50 flex-shrink-0">
                <p className="text-sm font-semibold text-slate-700">{editando ? 'Editar Mensagem' : 'Criar Nova Mensagem'}</p>
                <div>
                  <Label className="text-xs mb-1 block">Categoria *</Label>
                  <Input
                    value={form.categoria}
                    onChange={e => setForm(p => ({ ...p, categoria: e.target.value }))}
                    placeholder="Ex: Script Para Prospecção, Follow-up..."
                    className="text-sm"
                  />
                </div>
                <div>
                  <Label className="text-xs mb-1 block">Título *</Label>
                  <Input
                    value={form.titulo}
                    onChange={e => setForm(p => ({ ...p, titulo: e.target.value }))}
                    placeholder="Ex: Boas-vindas, Proposta enviada..."
                    className="text-sm"
                  />
                </div>
                <div>
                  <Label className="text-xs mb-1 block">Tipo de Mensagem *</Label>
                  <Select value={form.tipo} onValueChange={v => setForm(p => ({ ...p, tipo: v }))}>
                    <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {TIPOS_MENSAGEM.map(t => (
                        <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs mb-1 block">
                    {form.tipo === 'texto' ? 'Conteúdo da Mensagem *' : 'URL do arquivo ou texto descritivo *'}
                  </Label>
                  <Textarea
                    value={form.conteudo}
                    onChange={e => setForm(p => ({ ...p, conteudo: e.target.value }))}
                    placeholder={form.tipo === 'texto' ? 'Digite o texto da mensagem...' : 'URL do arquivo ou descrição...'}
                    rows={4}
                    className="text-sm resize-none"
                  />
                </div>
                <Button
                  className="w-full bg-green-600 hover:bg-green-700"
                  onClick={() => salvarMutation.mutate({ ...form })}
                  disabled={salvarMutation.isPending || !form.categoria.trim() || !form.titulo.trim() || !form.conteudo.trim()}
                >
                  {salvarMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  {editando ? 'Salvar Alterações' : 'Criar Mensagem Rápida'}
                </Button>
              </div>
            )}

            {/* Lista agrupada por categoria */}
            <div className="flex-1 overflow-y-auto space-y-2">
              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
                </div>
              ) : categorias.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-slate-400 gap-2">
                  <Zap className="w-10 h-10 opacity-30" />
                  <p className="text-sm">Nenhuma mensagem rápida criada</p>
                  <p className="text-xs">Clique em "Criar Nova Mensagem" para começar</p>
                </div>
              ) : (
                <>
                  <p className="text-xs font-semibold text-slate-500 px-1">Mensagens por Categoria:</p>
                  {categorias.map(cat => {
                    const itens = porCategoria[cat];
                    const aberta = expandidas[cat] !== false; // aberta por padrão
                    return (
                      <div key={cat} className="border rounded-xl overflow-hidden">
                        <button
                          className="w-full flex items-center justify-between px-4 py-3 bg-white hover:bg-slate-50 transition-colors"
                          onClick={() => toggleCategoria(cat)}
                        >
                          <span className="text-sm font-semibold text-slate-800">{cat}</span>
                          <div className="flex items-center gap-2">
                            <span className="bg-slate-800 text-white text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center">{itens.length}</span>
                            {aberta ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                          </div>
                        </button>
                        {aberta && (
                          <div className="divide-y border-t">
                            {itens.map(m => (
                              <div key={m.id} className="px-4 py-2.5 bg-white hover:bg-slate-50 transition-colors">
                                <div className="flex items-start justify-between gap-2">
                                  <div className="flex-1 min-w-0">
                                    <p className="text-xs font-semibold text-slate-800 truncate">{m._parsed.titulo || m.cliente_nome}</p>
                                    <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-2">{m._parsed.conteudo}</p>
                                    <span className="text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded mt-1 inline-block">{m._parsed.tipo || 'texto'}</span>
                                  </div>
                                  <div className="flex items-center gap-1 flex-shrink-0">
                                    <button
                                      onClick={() => handleEditar(m)}
                                      className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600"
                                    >
                                      <Pencil className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      onClick={() => {
                                        if (confirm('Excluir esta mensagem rápida?')) deletarMutation.mutate(m.id);
                                      }}
                                      className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      onClick={() => handleUsar(m)}
                                      className="flex items-center gap-1 px-2.5 py-1.5 bg-green-600 hover:bg-green-700 text-white text-[11px] font-medium rounded-lg transition-colors"
                                    >
                                      <Send className="w-3 h-3" /> Usar
                                    </button>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          </TabsContent>

          <TabsContent value="categorias" className="mt-3">
            <div className="space-y-3">
              <p className="text-sm text-slate-500">Crie uma nova categoria. Você será redirecionado para adicionar a primeira mensagem nela.</p>
              <div className="flex gap-2">
                <Input
                  value={novaCategoria}
                  onChange={e => setNovaCategoria(e.target.value)}
                  placeholder="Nome da categoria..."
                  className="text-sm"
                  onKeyDown={e => e.key === 'Enter' && adicionarCategoria()}
                />
                <Button onClick={adicionarCategoria} disabled={!novaCategoria.trim()} className="bg-green-600 hover:bg-green-700 flex-shrink-0 gap-1">
                  <Plus className="w-4 h-4" /> Criar
                </Button>
              </div>
              <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                ⚠️ Categorias são criadas automaticamente ao salvar uma mensagem. Use esta aba para iniciar rapidamente uma categoria nova.
              </p>
              {categorias.length > 0 && (
                <div className="space-y-1.5 mt-2">
                  <p className="text-xs font-semibold text-slate-500">Categorias existentes:</p>
                  {categorias.map(cat => (
                    <div key={cat} className="flex items-center justify-between px-3 py-2 rounded-lg border border-slate-200 bg-slate-50">
                      <span className="text-sm font-medium text-slate-700">{cat}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-400">{porCategoria[cat].length} mensagem(s)</span>
                        <Button
                          size="sm"
                          className="bg-green-600 hover:bg-green-700 gap-1 h-7 px-2 text-xs"
                          onClick={() => adicionarMensagemEmCategoria(cat)}
                        >
                          <Plus className="w-3.5 h-3.5" /> Adicionar mensagem
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}