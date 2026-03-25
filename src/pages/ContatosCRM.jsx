import React, { useState, useEffect, useMemo, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Label } from '@/components/ui/label';
import {
  Search, Plus, MoreHorizontal, Tag, Download, Upload,
  MessageCircle, Phone, Cake, Filter, X, Trash2,
  Edit2, Users, Star, ChevronDown, Check, Loader2,
  RefreshCw, UserCircle, Building2
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import AvatarContato from '@/components/chat/AvatarContato';
import ChatPopupModal from '@/components/chat/ChatPopupModal';

// ─── Tag colors ────────────────────────────────────────────────
const TAG_COLORS = [
  { name: 'Azul',    bg: 'bg-blue-100',    text: 'text-blue-700',    hex: '#3b82f6' },
  { name: 'Verde',   bg: 'bg-green-100',   text: 'text-green-700',   hex: '#22c55e' },
  { name: 'Vermelho',bg: 'bg-red-100',     text: 'text-red-700',     hex: '#ef4444' },
  { name: 'Laranja', bg: 'bg-orange-100',  text: 'text-orange-700',  hex: '#f97316' },
  { name: 'Roxo',    bg: 'bg-purple-100',  text: 'text-purple-700',  hex: '#a855f7' },
  { name: 'Rosa',    bg: 'bg-pink-100',    text: 'text-pink-700',    hex: '#ec4899' },
  { name: 'Cinza',   bg: 'bg-slate-100',   text: 'text-slate-700',   hex: '#64748b' },
  { name: 'Amarelo', bg: 'bg-yellow-100',  text: 'text-yellow-700',  hex: '#eab308' },
];

const getTagStyle = (cor) => {
  const found = TAG_COLORS.find(c => c.hex === cor || c.name === cor);
  return found ? `${found.bg} ${found.text}` : 'bg-slate-100 text-slate-700';
};

// ─── Tag Badge ─────────────────────────────────────────────────
function TagBadge({ tag, onRemove }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${getTagStyle(tag.cor)}`}>
      {tag.nome}
      {onRemove && (
        <button onClick={onRemove} className="hover:opacity-70">
          <X className="w-3 h-3" />
        </button>
      )}
    </span>
  );
}

// ─── Modal Gerenciar Tags ───────────────────────────────────────
function GerenciarTagsModal({ open, onOpenChange, empresaId }) {
  const queryClient = useQueryClient();
  const [novoNome, setNovoNome] = useState('');
  const [novaCor, setNovaCor] = useState(TAG_COLORS[0].hex);

  const { data: tags = [] } = useQuery({
    queryKey: ['tags-crm', empresaId],
    enabled: !!empresaId,
    queryFn: () => base44.entities.ContatoTag?.filter({ empresa_id: empresaId }) || [],
  });

  const criarTag = async () => {
    if (!novoNome.trim()) return;
    await base44.entities.ContatoTag.create({ empresa_id: empresaId, nome: novoNome.trim(), cor: novaCor });
    queryClient.invalidateQueries({ queryKey: ['tags-crm', empresaId] });
    setNovoNome('');
    toast.success('Tag criada!');
  };

  const deletarTag = async (id) => {
    await base44.entities.ContatoTag.delete(id);
    queryClient.invalidateQueries({ queryKey: ['tags-crm', empresaId] });
    toast.success('Tag removida');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Gerenciar Tags</DialogTitle>
          <DialogDescription>Crie e gerencie tags para organizar seus contatos</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="flex gap-2">
            <Input
              placeholder="Nome da tag..."
              value={novoNome}
              onChange={e => setNovoNome(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && criarTag()}
              className="flex-1"
            />
            <div className="flex gap-1">
              {TAG_COLORS.map(c => (
                <button
                  key={c.hex}
                  onClick={() => setNovaCor(c.hex)}
                  className={`w-6 h-6 rounded-full border-2 transition-transform ${novaCor === c.hex ? 'border-slate-800 scale-110' : 'border-transparent'}`}
                  style={{ backgroundColor: c.hex }}
                />
              ))}
            </div>
            <Button onClick={criarTag} size="sm">Criar</Button>
          </div>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {tags.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-4">Nenhuma tag criada ainda</p>
            ) : tags.map(tag => (
              <div key={tag.id} className="flex items-center justify-between px-3 py-2 bg-slate-50 rounded-lg">
                <TagBadge tag={tag} />
                <button onClick={() => deletarTag(tag.id)} className="text-slate-400 hover:text-red-500">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Modal Editar Contato ───────────────────────────────────────
function EditarContatoModal({ contato, open, onOpenChange, empresaId, tags }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({});

  useEffect(() => {
    if (contato) setForm({ ...contato });
  }, [contato]);

  const salvar = async () => {
    await base44.entities.ContatoWhatsapp.update(contato.id, form);
    queryClient.invalidateQueries({ queryKey: ['contatos-crm', empresaId] });
    onOpenChange(false);
    toast.success('Contato atualizado!');
  };

  const toggleTag = (tagId) => {
    const atual = form.tags_ids || [];
    const novas = atual.includes(tagId) ? atual.filter(t => t !== tagId) : [...atual, tagId];
    setForm(prev => ({ ...prev, tags_ids: novas }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Editar Contato</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div>
            <Label>Nome</Label>
            <Input value={form.nome || ''} onChange={e => setForm(p => ({ ...p, nome: e.target.value }))} />
          </div>
          <div>
            <Label>Telefone</Label>
            <Input value={form.telefone || ''} onChange={e => setForm(p => ({ ...p, telefone: e.target.value }))} />
          </div>
          <div>
            <Label>Data de Aniversário</Label>
            <Input type="date" value={form.data_nascimento || ''} onChange={e => setForm(p => ({ ...p, data_nascimento: e.target.value }))} />
          </div>
          <div>
            <Label>Observações</Label>
            <Input value={form.observacoes || ''} onChange={e => setForm(p => ({ ...p, observacoes: e.target.value }))} />
          </div>
          {tags.length > 0 && (
            <div>
              <Label>Tags</Label>
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {tags.map(tag => {
                  const ativo = (form.tags_ids || []).includes(tag.id);
                  return (
                    <button key={tag.id} onClick={() => toggleTag(tag.id)}
                      className={`px-2.5 py-1 rounded-full text-xs font-medium border-2 transition-all ${ativo ? `${getTagStyle(tag.cor)} border-slate-400` : 'bg-slate-50 text-slate-400 border-slate-200'}`}>
                      {tag.nome}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button onClick={salvar}>Salvar</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Modal Aniversariantes ──────────────────────────────────────
function AniversariantesModal({ open, onOpenChange, contatos }) {
  const hoje = new Date();
  const mesAtual = hoje.getMonth() + 1;
  const diaAtual = hoje.getDate();

  const aniversariantes = contatos.filter(c => {
    if (!c.data_nascimento) return false;
    const d = new Date(c.data_nascimento + 'T12:00:00');
    return d.getMonth() + 1 === mesAtual;
  }).sort((a, b) => {
    const da = new Date(a.data_nascimento + 'T12:00:00').getDate();
    const db = new Date(b.data_nascimento + 'T12:00:00').getDate();
    return da - db;
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Cake className="w-5 h-5 text-pink-500" /> Aniversariantes do Mês</DialogTitle>
          <DialogDescription>{aniversariantes.length} aniversariante(s) em {hoje.toLocaleString('pt-BR', { month: 'long' })}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2 max-h-80 overflow-y-auto pt-2">
          {aniversariantes.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-6">Nenhum aniversariante este mês</p>
          ) : aniversariantes.map(c => {
            const dia = new Date(c.data_nascimento + 'T12:00:00').getDate();
            const isHoje = dia === diaAtual;
            return (
              <div key={c.id} className={`flex items-center gap-3 px-3 py-2.5 rounded-lg ${isHoje ? 'bg-pink-50 border border-pink-200' : 'bg-slate-50'}`}>
                <AvatarContato contato={c} className="w-9 h-9 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm">{c.nome || c.telefone}</p>
                  <p className="text-xs text-slate-500">{c.telefone}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className={`text-sm font-bold ${isHoje ? 'text-pink-600' : 'text-slate-700'}`}>Dia {dia}</p>
                  {isHoje && <p className="text-xs text-pink-500">🎂 Hoje!</p>}
                </div>
                <a href={`https://wa.me/${c.telefone}`} target="_blank" rel="noopener noreferrer"
                  className="flex-shrink-0 w-8 h-8 bg-green-100 text-green-600 rounded-full flex items-center justify-center hover:bg-green-200">
                  <MessageCircle className="w-4 h-4" />
                </a>
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Página Principal ───────────────────────────────────────────
export default function ContatosCRM() {
  const queryClient = useQueryClient();
  const [user, setUser] = useState(null);
  const [empresaId, setEmpresaId] = useState(null);
  const [busca, setBusca] = useState('');
  const [filtroTag, setFiltroTag] = useState('todos');
  const [selecionados, setSelecionados] = useState([]);
  const [gerenciarTagsOpen, setGerenciarTagsOpen] = useState(false);
  const [aniversariantesOpen, setAniversariantesOpen] = useState(false);
  const [editarOpen, setEditarOpen] = useState(false);
  const [contatoEditar, setContatoEditar] = useState(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [contatoDelete, setContatoDelete] = useState(null);
  const [tagsMassaOpen, setTagsMassaOpen] = useState(false);
  const [chatPopupOpen, setChatPopupOpen] = useState(false);
  const [contatoChat, setContatoChat] = useState(null);
  const [novoContatoOpen, setNovoContatoOpen] = useState(false);
  const [novoContatoForm, setNovoContatoForm] = useState({ nome: '', telefone: '', observacoes: '' });
  const [salvandoNovo, setSalvandoNovo] = useState(false);
  const [colartextoOpen, setColartextoOpen] = useState(false);
  const [contatosPasta, setContatosPasta] = useState('');
  const [salvandoPasta, setSalvandoPasta] = useState(false);
  const fileInputRef = useRef(null);

  const criarNovoContato = async () => {
    const telefone = novoContatoForm.telefone.replace(/\D/g, '');
    if (!telefone) return toast.error('Informe o telefone');
    setSalvandoNovo(true);
    try {
      await base44.entities.ContatoWhatsapp.create({
        empresa_id: empresaId,
        nome: novoContatoForm.nome.trim(),
        telefone,
        observacoes: novoContatoForm.observacoes.trim(),
      });
      queryClient.invalidateQueries({ queryKey: ['contatos-crm', empresaId] });
      setNovoContatoOpen(false);
      setNovoContatoForm({ nome: '', telefone: '', observacoes: '' });
      toast.success('Contato criado com sucesso!');
    } catch (e) {
      toast.error('Erro ao criar contato: ' + e.message);
    } finally {
      setSalvandoNovo(false);
    }
  };

  const colarContatosPasta = async () => {
    const linhas = contatosPasta.split('\n').filter(l => l.trim());
    if (linhas.length === 0) return toast.error('Cole algum texto');
    setSalvandoPasta(true);
    try {
      const resp = await base44.functions.invoke('importarContatosCRM', {
        contatos: linhas,
        empresa_id: empresaId
      });
      const dados = resp.data;
      toast.success(`✅ ${dados.criados} salvos`);
      queryClient.invalidateQueries({ queryKey: ['contatos-crm', empresaId] });
      setColartextoOpen(false);
      setContatosPasta('');
    } catch (e) {
      toast.error('Erro: ' + e.message);
    } finally {
      setSalvandoPasta(false);
    }
  };

  useEffect(() => { loadUser(); }, []);

  const loadUser = async () => {
    try {
      const me = await base44.auth.me();
      setUser(me);
      if (me.role === 'super_admin' || me.perfil === 'super_admin') {
        setEmpresaId('699696c2c9f5bffc2e67402b');
      } else {
        const colabs = await base44.entities.Colaborador.filter({ user_id: me.id, status: 'ativo' });
        if (colabs.length > 0) setEmpresaId(colabs[0].empresa_id);
      }
    } catch (e) { console.error(e); }
  };

  const { data: contatos = [], isLoading, refetch } = useQuery({
    queryKey: ['contatos-crm', empresaId],
    enabled: !!empresaId,
    queryFn: () => base44.entities.ContatoWhatsapp.filter({ empresa_id: empresaId }, 'nome', 500),
  });

  const { data: tags = [] } = useQuery({
    queryKey: ['tags-crm', empresaId],
    enabled: !!empresaId,
    queryFn: async () => {
      try { return await base44.entities.ContatoTag.filter({ empresa_id: empresaId }); }
      catch { return []; }
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.ContatoWhatsapp.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contatos-crm', empresaId] });
      setDeleteDialogOpen(false);
      toast.success('Contato excluído');
    },
  });

  const filteredContatos = useMemo(() => {
    return contatos.filter(c => {
      const q = busca.toLowerCase();
      const matchBusca = !busca ||
        (c.nome || '').toLowerCase().includes(q) ||
        (c.telefone || '').includes(q);
      const matchTag = filtroTag === 'todos' ||
        (c.tags_ids || []).includes(filtroTag);
      return matchBusca && matchTag;
    });
  }, [contatos, busca, filtroTag]);

  const toggleSelecionado = (id) => {
    setSelecionados(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const selecionarTodos = () => {
    setSelecionados(filteredContatos.map(c => c.id));
  };

  const deselecionarTodos = () => setSelecionados([]);

  const exportarCSV = () => {
    const linhas = [['Nome', 'Telefone', 'Data Nascimento', 'Observações', 'Tags']];
    const listaExportar = selecionados.length > 0
      ? filteredContatos.filter(c => selecionados.includes(c.id))
      : filteredContatos;
    listaExportar.forEach(c => {
      const tagsNomes = (c.tags_ids || []).map(tid => tags.find(t => t.id === tid)?.nome || '').filter(Boolean).join('; ');
      linhas.push([c.nome || '', c.telefone || '', c.data_nascimento || '', c.observacoes || '', tagsNomes]);
    });
    const csv = linhas.map(l => l.map(v => `"${v}"`).join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'contatos_crm.csv'; a.click();
    toast.success(`${listaExportar.length} contatos exportados`);
  };

  const importarCSV = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const lines = text.split('\n').filter(Boolean);
    const header = lines[0].replace(/"/g, '').split(',').map(h => h.trim().toLowerCase());
    let criados = 0;
    for (let i = 1; i < lines.length; i++) {
      const vals = lines[i].replace(/"/g, '').split(',');
      const obj = {};
      header.forEach((h, idx) => { obj[h] = (vals[idx] || '').trim(); });
      const nome = obj.nome || obj['name'] || '';
      const telefone = (obj.telefone || obj['phone'] || obj['celular'] || '').replace(/\D/g, '');
      if (!telefone) continue;
      await base44.entities.ContatoWhatsapp.create({ empresa_id: empresaId, nome, telefone });
      criados++;
    }
    queryClient.invalidateQueries({ queryKey: ['contatos-crm', empresaId] });
    toast.success(`${criados} contatos importados`);
    e.target.value = '';
  };

  const aniversariantesHoje = contatos.filter(c => {
    if (!c.data_nascimento) return false;
    const hoje = new Date();
    const d = new Date(c.data_nascimento + 'T12:00:00');
    return d.getDate() === hoje.getDate() && d.getMonth() === hoje.getMonth();
  }).length;

  if (!empresaId) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-3">
            <Users className="w-8 h-8 text-blue-600" />
            Contatos do CRM
          </h1>
          <p className="text-slate-500 mt-1">{contatos.length} contatos cadastrados</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
           <Button variant="outline" size="sm" className="gap-1.5 text-sm" onClick={() => setGerenciarTagsOpen(true)}>
             <Tag className="w-4 h-4" /> Gerenciar Tags
           </Button>
           <Button variant="outline" size="sm" className="gap-1.5 text-sm relative" onClick={() => setAniversariantesOpen(true)}>
             <Cake className="w-4 h-4 text-pink-500" /> Aniversariantes
             {aniversariantesHoje > 0 && (
               <span className="absolute -top-1 -right-1 bg-pink-500 text-white text-xs w-4 h-4 rounded-full flex items-center justify-center">{aniversariantesHoje}</span>
             )}
           </Button>
           <Button variant="outline" size="sm" className="gap-1.5 text-sm" onClick={exportarCSV}>
             <Download className="w-4 h-4" /> Exportar
           </Button>
           <Button variant="outline" size="sm" className="gap-1.5 text-sm" onClick={() => fileInputRef.current?.click()}>
             <Upload className="w-4 h-4" /> CSV
           </Button>
           <Button variant="outline" size="sm" className="gap-1.5 text-sm" onClick={() => setColartextoOpen(true)}>
             <MessageCircle className="w-4 h-4" /> Colar Números
           </Button>
           <input ref={fileInputRef} type="file" accept=".csv" className="hidden" onChange={importarCSV} />
           <Button size="sm" className="gap-1.5 bg-[#1e3a5f] hover:bg-[#2a4a73]" onClick={() => setNovoContatoOpen(true)}>
             <Plus className="w-4 h-4" /> Novo Contato
           </Button>
         </div>
      </div>

      {/* Stats rápidos */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-100 flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
            <Users className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <p className="text-xs text-slate-500">Total</p>
            <p className="text-xl font-bold text-slate-900">{contatos.length}</p>
          </div>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-100 flex items-center gap-3">
          <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
            <MessageCircle className="w-5 h-5 text-green-600" />
          </div>
          <div>
            <p className="text-xs text-slate-500">Com Conversa</p>
            <p className="text-xl font-bold text-slate-900">{contatos.filter(c => c.cliente_id).length}</p>
          </div>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-100 flex items-center gap-3">
          <div className="w-10 h-10 bg-pink-100 rounded-lg flex items-center justify-center">
            <Cake className="w-5 h-5 text-pink-600" />
          </div>
          <div>
            <p className="text-xs text-slate-500">Aniversariantes</p>
            <p className="text-xl font-bold text-slate-900">{aniversariantesHoje}</p>
            <p className="text-xs text-slate-400">hoje</p>
          </div>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-100 flex items-center gap-3">
          <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
            <Tag className="w-5 h-5 text-purple-600" />
          </div>
          <div>
            <p className="text-xs text-slate-500">Tags Criadas</p>
            <p className="text-xl font-bold text-slate-900">{tags.length}</p>
          </div>
        </div>
      </div>

      {/* Filtros e busca */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-3">
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              placeholder="Buscar por nome ou telefone..."
              value={busca}
              onChange={e => setBusca(e.target.value)}
              className="pl-9 border-0 bg-slate-50"
            />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setFiltroTag('todos')}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${filtroTag === 'todos' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
            >
              Todos
            </button>
            {tags.map(tag => (
              <button
                key={tag.id}
                onClick={() => setFiltroTag(filtroTag === tag.id ? 'todos' : tag.id)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all border-2 ${filtroTag === tag.id ? 'border-slate-800 ring-2 ring-slate-300' : 'border-transparent'} ${getTagStyle(tag.cor)}`}
              >
                {tag.nome}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Seleção em massa */}
      {selecionados.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 flex items-center justify-between">
          <p className="text-sm font-medium text-blue-800">{selecionados.length} contato(s) selecionado(s)</p>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" className="text-xs gap-1" onClick={exportarCSV}>
              <Download className="w-3.5 h-3.5" /> Exportar selecionados
            </Button>
            <Button size="sm" variant="outline" className="text-xs text-red-600 border-red-200 hover:bg-red-50 gap-1"
              onClick={async () => {
                if (confirm(`Excluir ${selecionados.length} contato(s)?`)) {
                  for (const id of selecionados) await base44.entities.ContatoWhatsapp.delete(id);
                  queryClient.invalidateQueries({ queryKey: ['contatos-crm', empresaId] });
                  setSelecionados([]);
                  toast.success('Contatos excluídos');
                }
              }}>
              <Trash2 className="w-3.5 h-3.5" /> Excluir
            </Button>
            <Button size="sm" variant="ghost" className="text-xs" onClick={deselecionarTodos}>Cancelar</Button>
          </div>
        </div>
      )}

      {/* Cabeçalho da lista */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <button
            onClick={selecionados.length === filteredContatos.length ? deselecionarTodos : selecionarTodos}
            className="text-xs text-slate-500 hover:text-slate-800 underline"
          >
            {selecionados.length === filteredContatos.length ? 'Deselecionar todos' : 'Selecionar todos'}
          </button>
          <span className="text-slate-300">|</span>
          <p className="text-sm text-slate-500">{filteredContatos.length} contato(s)</p>
        </div>
        <button onClick={() => refetch()} className="text-slate-400 hover:text-slate-600">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Lista de contatos */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
        </div>
      ) : filteredContatos.length === 0 ? (
        <div className="bg-white rounded-xl p-12 text-center shadow-sm border border-slate-100">
          <Users className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500 font-medium">Nenhum contato encontrado</p>
          <p className="text-sm text-slate-400 mt-1">Importe contatos via CSV ou sincronize com o WhatsApp</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredContatos.map(c => {
            const selecionado = selecionados.includes(c.id);
            const tagsContato = (c.tags_ids || []).map(tid => tags.find(t => t.id === tid)).filter(Boolean);
            const isAniversario = (() => {
              if (!c.data_nascimento) return false;
              const hoje = new Date();
              const d = new Date(c.data_nascimento + 'T12:00:00');
              return d.getDate() === hoje.getDate() && d.getMonth() === hoje.getMonth();
            })();

            return (
              <div
                key={c.id}
                className={`bg-white rounded-xl shadow-sm border transition-all flex items-center gap-4 px-4 py-3 ${selecionado ? 'border-blue-300 bg-blue-50/40' : 'border-slate-100 hover:shadow-md'}`}
              >
                {/* Checkbox */}
                <button
                  onClick={() => toggleSelecionado(c.id)}
                  className={`w-5 h-5 rounded flex items-center justify-center flex-shrink-0 border-2 transition-colors ${selecionado ? 'bg-blue-600 border-blue-600' : 'border-slate-300 hover:border-blue-400'}`}
                >
                  {selecionado && <Check className="w-3 h-3 text-white" />}
                </button>

                {/* Avatar */}
                <div className="relative flex-shrink-0">
                  <AvatarContato contato={c} className="w-11 h-11" />
                  {isAniversario && (
                    <span className="absolute -top-1 -right-1 text-base">🎂</span>
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-slate-900">{c.nome || 'Sem nome'}</p>
                    {isAniversario && <Badge className="bg-pink-100 text-pink-700 text-xs px-2">🎂 Aniversário hoje!</Badge>}
                    {tagsContato.map(tag => <TagBadge key={tag.id} tag={tag} />)}
                  </div>
                  <div className="flex items-center gap-3 mt-1 flex-wrap">
                    <span className="flex items-center gap-1 text-xs text-slate-500">
                      <Phone className="w-3 h-3" /> {c.telefone}
                    </span>
                    {c.data_nascimento && (
                      <span className="flex items-center gap-1 text-xs text-slate-500">
                        <Cake className="w-3 h-3" /> {format(new Date(c.data_nascimento + 'T12:00:00'), 'dd/MM/yyyy')}
                      </span>
                    )}
                    {c.observacoes && (
                      <span className="text-xs text-slate-400 truncate max-w-xs">{c.observacoes}</span>
                    )}
                  </div>
                </div>

                {/* Ações rápidas */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => { setContatoChat(c); setChatPopupOpen(true); }}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-green-500 text-white rounded-full text-xs font-medium hover:bg-green-600 transition-colors"
                    title="Ver conversa"
                  >
                    <MessageCircle className="w-3.5 h-3.5" />
                    Ver conversa
                  </button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400">
                        <MoreHorizontal className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => { setContatoEditar(c); setEditarOpen(true); }}>
                        <Edit2 className="w-4 h-4 mr-2" /> Editar contato
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-red-600 focus:text-red-600"
                        onClick={() => { setContatoDelete(c); setDeleteDialogOpen(true); }}
                      >
                        <Trash2 className="w-4 h-4 mr-2" /> Excluir
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modals */}
      <ChatPopupModal
        open={chatPopupOpen}
        onOpenChange={setChatPopupOpen}
        contato={contatoChat}
        empresaId={empresaId}
        user={user}
      />
      <GerenciarTagsModal open={gerenciarTagsOpen} onOpenChange={setGerenciarTagsOpen} empresaId={empresaId} />
      <AniversariantesModal open={aniversariantesOpen} onOpenChange={setAniversariantesOpen} contatos={contatos} />
      <EditarContatoModal
        contato={contatoEditar}
        open={editarOpen}
        onOpenChange={setEditarOpen}
        empresaId={empresaId}
        tags={tags}
      />

      {/* Modal Colar Contatos */}
      <Dialog open={colartextoOpen} onOpenChange={setColartextoOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageCircle className="w-5 h-5 text-blue-600" />
              Importar Contatos por Cola
            </DialogTitle>
            <DialogDescription>Cole números de telefone ou contatos (um por linha) e salve em massa</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <Label>Números/Contatos</Label>
              <textarea
                placeholder="Cole aqui, um por linha:&#10;555197884921&#10;JD PROMOTORA&#10;558721510008&#10;..."
                value={contatosPasta}
                onChange={e => setContatosPasta(e.target.value)}
                className="w-full h-48 p-3 border border-slate-200 rounded-lg font-mono text-sm mt-1 resize-none"
              />
              <p className="text-xs text-slate-400 mt-2">Aceita números, nomes, ou linhas mistas. Números serão normalizados automaticamente.</p>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={() => setColartextoOpen(false)}>Cancelar</Button>
              <Button 
                onClick={colarContatosPasta} 
                disabled={salvandoPasta || !contatosPasta.trim()} 
                className="bg-[#1e3a5f] hover:bg-[#2a4a73] gap-2"
              >
                {salvandoPasta ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                Importar Agora
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal Novo Contato */}
      <Dialog open={novoContatoOpen} onOpenChange={setNovoContatoOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserCircle className="w-5 h-5 text-blue-600" />
              Novo Contato
            </DialogTitle>
            <DialogDescription>Crie um novo contato/lead no CRM</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <Label>Nome <span className="text-slate-400 text-xs">(opcional)</span></Label>
              <Input
                placeholder="Ex: João Silva"
                value={novoContatoForm.nome}
                onChange={e => setNovoContatoForm(p => ({ ...p, nome: e.target.value }))}
                className="mt-1"
                autoFocus
              />
            </div>
            <div>
              <Label>Telefone/WhatsApp <span className="text-red-500">*</span></Label>
              <Input
                placeholder="Ex: 5511999999999"
                value={novoContatoForm.telefone}
                onChange={e => setNovoContatoForm(p => ({ ...p, telefone: e.target.value }))}
                className="mt-1"
                onKeyDown={e => e.key === 'Enter' && criarNovoContato()}
              />
              <p className="text-xs text-slate-400 mt-1">Inclua o DDI (55) e DDD. Ex: 5511999999999</p>
            </div>
            <div>
              <Label>Observações <span className="text-slate-400 text-xs">(opcional)</span></Label>
              <Input
                placeholder="Ex: Cliente interessado em consórcio..."
                value={novoContatoForm.observacoes}
                onChange={e => setNovoContatoForm(p => ({ ...p, observacoes: e.target.value }))}
                className="mt-1"
              />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={() => setNovoContatoOpen(false)}>Cancelar</Button>
              <Button onClick={criarNovoContato} disabled={salvandoNovo || !novoContatoForm.telefone.trim()} className="bg-[#1e3a5f] hover:bg-[#2a4a73]">
                {salvandoNovo ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Plus className="w-4 h-4 mr-1" />}
                Criar Contato
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir contato</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir <strong>{contatoDelete?.nome || contatoDelete?.telefone}</strong>? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={() => deleteMutation.mutate(contatoDelete?.id)}>
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}