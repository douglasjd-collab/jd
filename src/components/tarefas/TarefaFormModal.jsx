import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Checkbox } from '@/components/ui/checkbox';
import { Plus, Trash2, Star, X, Search, UserPlus, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { base44 } from '@/api/base44Client';
import CadastrarClienteModal from './CadastrarClienteModal';

function getInitials(name = '') {
  const parts = name.trim().split(/\s+/);
  return (parts[0]?.[0] || '') + (parts[1]?.[0] || '');
}

function normalize(str) {
  return (str || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

export default function TarefaFormModal({ open, onOpenChange, tarefa, onSave, colaboradores, clientes, statusList, templates, currentUser, onSaveTemplate, setoresList = [], subsetoresList = [], statusInicial = null, empresaId }) {
  const [form, setForm] = useState({});
  const [checklist, setChecklist] = useState([]);
  const [novoItem, setNovoItem] = useState('');
  const [responsaveisSel, setResponsaveisSel] = useState([]);
  const [nomeTemplate, setNomeTemplate] = useState('');
  const [salvarTemplate, setSalvarTemplate] = useState(false);
  const [templateFavorito, setTemplateFavorito] = useState(false);
  const [clienteSearch, setClienteSearch] = useState('');
  const [clienteDropdownOpen, setClienteDropdownOpen] = useState(false);
  const [responsavelSearch, setResponsavelSearch] = useState('');
  const [cadastrandoCliente, setCadastrandoCliente] = useState(false);
  const [nomeInicialCliente, setNomeInicialCliente] = useState('');
  const [subsetoresFiltrados, setSubsetoresFiltrados] = useState([]);
  const [loadingSetores, setLoadingSetores] = useState(false);
  const [clientesLocais, setClientesLocais] = useState([]); // clientes recém criados ainda não na prop

  useEffect(() => {
    if (form.setor_id) {
      const filtered = subsetoresList.filter(s => s.setor_id === form.setor_id && s.ativo);
      setSubsetoresFiltrados(filtered);
    } else {
      setSubsetoresFiltrados([]);
    }
  }, [form.setor_id, subsetoresList]);

  useEffect(() => {
    if (open) {
      if (tarefa) {
        setForm({
           titulo: tarefa.titulo || '',
           descricao: tarefa.descricao || '',
           cliente_id: tarefa.cliente_id || '',
           cliente_nome: tarefa.cliente_nome || '',
           cliente_cpf: tarefa.cliente_cpf || '',
           cliente_telefone: tarefa.cliente_telefone || '',
           senha_gov: tarefa.senha_gov || '',
           setor_id: tarefa.setor_id || '',
           setor_nome: tarefa.setor_nome || '',
           subsetor_id: tarefa.subsetor_id || tarefa.tipo_id || '',
           subsetor_nome: tarefa.subsetor_nome || tarefa.tipo_nome || '',
           origem: tarefa.origem || 'manual',
           data_cadastro: tarefa.data_cadastro || format(new Date(), 'yyyy-MM-dd'),
           data_conclusao_prevista: tarefa.data_conclusao_prevista || '',
           status: tarefa.status || 'a_fazer',
           prioridade: tarefa.prioridade || 'media',
           pendencia_com: tarefa.pendencia_com || '',
           responsavel_principal_id: tarefa.responsavel_principal_id || '',
         });
        try { setChecklist(tarefa.checklist ? JSON.parse(tarefa.checklist) : []); } catch { setChecklist([]); }
        try { setResponsaveisSel(tarefa.responsaveis_ids ? JSON.parse(tarefa.responsaveis_ids) : []); } catch { setResponsaveisSel([]); }
      } else {
        setForm({
           titulo: '', descricao: '', cliente_id: '', cliente_nome: '',
           setor_id: '', setor_nome: '', subsetor_id: '', subsetor_nome: '', origem: 'manual',
           data_cadastro: format(new Date(), 'yyyy-MM-dd'),
           data_conclusao_prevista: '',
           status: statusInicial || statusList?.[0]?.slug || statusList?.[0]?.id || 'a_fazer',
           prioridade: 'media',
           pendencia_com: '',
           responsavel_principal_id: currentUser?.colaborador_id || currentUser?.id || '',
         });
        setChecklist([]);
        setResponsaveisSel(currentUser?.colaborador_id ? [currentUser.colaborador_id] : (currentUser?.id ? [currentUser.id] : []));
      }
      setSalvarTemplate(false);
      setNomeTemplate('');
      setTemplateFavorito(false);
      setClienteSearch('');
      setClienteDropdownOpen(false);
      setResponsavelSearch('');
      setCadastrandoCliente(false);
      setNomeInicialCliente('');
    }
  }, [open, tarefa, statusInicial, statusList]);

  const toggleResponsavel = (id) => {
    setResponsaveisSel(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const adicionarItem = () => {
    if (!novoItem.trim()) return;
    setChecklist(prev => [...prev, { id: Date.now().toString(), texto: novoItem.trim(), checked: false }]);
    setNovoItem('');
  };

  const aplicarTemplate = (template) => {
    try {
      const itens = JSON.parse(template.itens);
      setChecklist(itens.map((texto, i) => ({ id: Date.now().toString() + i, texto, checked: false })));
      toast.success(`Template "${template.nome}" aplicado!`);
    } catch {}
  };

  const handleSave = () => {
    if (!form.titulo?.trim()) { toast.error('Informe o título da tarefa'); return; }
    if (!form.data_conclusao_prevista) { toast.error('Informe a data de conclusão'); return; }

    const responsaveisFinais = responsaveisSel.length > 0
      ? responsaveisSel
      : (currentUser?.colaborador_id ? [currentUser.colaborador_id] : []);

    if (responsaveisFinais.length === 0) { toast.error('Selecione ao menos um responsável'); return; }

    const responsaveisData = responsaveisFinais.map(id => {
      const c = colaboradores.find(x => x.id === id);
      return { id, nome: c?.nome || c?.full_name || '', foto: c?.foto_perfil || '' };
    });

    const cliente = todosClientes.find(c => c.id === form.cliente_id);
    const principalColab = colaboradores.find(c => c.id === (form.responsavel_principal_id || responsaveisFinais[0]));

    const setorSelecionado = setoresList.find(s => s.id === form.setor_id);
    const subsetorSelecionado = subsetoresFiltrados.find(s => s.id === form.subsetor_id);

    const data = {
      ...form,
      setor_nome: setorSelecionado?.nome || '',
      subsetor_id: form.subsetor_id || '',
      subsetor_nome: subsetorSelecionado?.nome || '',
      cliente_nome: cliente?.nome_completo || cliente?.pj_razao_social || form.cliente_nome || '',
      responsavel_principal_id: form.responsavel_principal_id || responsaveisFinais[0] || '',
      responsavel_principal_nome: principalColab?.nome || '',
      checklist: JSON.stringify(checklist),
      responsaveis_ids: JSON.stringify(responsaveisFinais),
      responsaveis_nomes: JSON.stringify(responsaveisData.map(r => r.nome)),
      responsaveis_fotos: JSON.stringify(responsaveisData.map(r => r.foto)),
    };

    if (salvarTemplate && nomeTemplate.trim() && checklist.length > 0) {
      onSaveTemplate?.({ nome: nomeTemplate.trim(), itens: JSON.stringify(checklist.map(i => i.texto)), favorito: templateFavorito });
    }

    onSave(data, tarefa?.id);
  };

  const favoriteTemplates = templates?.filter(t => t.favorito) || [];
  const todosClientes = [...clientes, ...clientesLocais.filter(cl => !clientes.find(c => c.id === cl.id))];
  const clientesFiltrados = todosClientes.filter(c => {
    if (!clienteSearch) return true;
    return normalize(c.nome_completo || c.pj_razao_social || '').includes(normalize(clienteSearch));
  });
  const colaboradoresFiltrados = colaboradores.filter(c => {
    if (!responsavelSearch) return true;
    return normalize(c.nome || c.full_name || '').includes(normalize(responsavelSearch));
  });

  const responsaveisSelecionadosDados = responsaveisSel.map(id => colaboradores.find(c => c.id === id)).filter(Boolean);

  const handleClienteCriado = (criado) => {
    setClientesLocais(prev => [...prev, criado]);
    setForm(f => ({ ...f, cliente_id: criado.id, cliente_nome: criado.nome_completo, cliente_telefone: criado.celular || '' }));
    setClienteDropdownOpen(false);
    setClienteSearch('');
    toast.success('Cliente cadastrado e selecionado!');
  };

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg">{tarefa ? 'Editar Tarefa' : 'Nova Tarefa'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Templates favoritos */}
          {!tarefa && favoriteTemplates.length > 0 && (
            <div>
              <Label className="text-xs text-slate-500 mb-1 block">Checklist rápido</Label>
              <div className="flex flex-wrap gap-2">
                {favoriteTemplates.map(t => (
                  <button key={t.id} onClick={() => aplicarTemplate(t)}
                    className="flex items-center gap-1 px-3 py-1 bg-yellow-50 border border-yellow-300 rounded-full text-xs text-yellow-800 hover:bg-yellow-100 transition-colors">
                    <Star className="w-3 h-3 fill-yellow-400 text-yellow-400" /> {t.nome}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Título */}
          <div>
            <Label>Título *</Label>
            <Input value={form.titulo || ''} onChange={e => setForm({ ...form, titulo: e.target.value })} placeholder="Título da tarefa" />
          </div>

          {/* Senha GOV */}
          <div>
            <Label>Senha GOV</Label>
            <Input value={form.senha_gov || ''} onChange={e => setForm({ ...form, senha_gov: e.target.value })} placeholder="Senha GOV do cliente (opcional)" />
          </div>

          {/* Cliente + Prioridade */}
          <div className="grid grid-cols-2 gap-4">
            <div className="relative">
              <Label>Cliente</Label>
              <div
                className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm cursor-pointer"
                onClick={() => setClienteDropdownOpen(o => !o)}
              >
                <span className={form.cliente_id ? 'text-foreground truncate pr-2' : 'text-muted-foreground'}>
                  {form.cliente_id
                    ? (todosClientes.find(c => c.id === form.cliente_id)?.nome_completo || todosClientes.find(c => c.id === form.cliente_id)?.pj_razao_social || 'Cliente')
                    : 'Selecionar cliente'}
                </span>
                <span className="text-slate-400 text-xs flex-shrink-0">▼</span>
              </div>
              {clienteDropdownOpen && (
                <div className="absolute z-50 mt-1 w-full bg-white border rounded-md shadow-lg">
                  <div className="p-2 border-b">
                    <div className="relative">
                      <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400" />
                      <input autoFocus className="w-full pl-7 pr-2 py-1 text-sm border rounded outline-none"
                        placeholder="Buscar cliente..." value={clienteSearch}
                        onChange={e => setClienteSearch(e.target.value)} onClick={e => e.stopPropagation()} />
                    </div>
                  </div>
                  <div className="max-h-52 overflow-y-auto">
                    {clientesFiltrados.length === 0 ? (
                      <div className="px-3 py-3 text-center">
                        <p className="text-sm text-slate-400 mb-2">Nenhum cliente encontrado</p>
                        <button
                          onClick={(e) => { e.stopPropagation(); setNomeInicialCliente(clienteSearch); setCadastrandoCliente(true); setClienteDropdownOpen(false); }}
                          className="flex items-center gap-1.5 mx-auto text-xs text-blue-600 hover:text-blue-800 font-medium px-3 py-1.5 border border-blue-300 rounded-lg hover:bg-blue-50 transition-colors"
                        >
                          <UserPlus className="w-3.5 h-3.5" /> Cadastrar novo cliente
                        </button>
                      </div>
                    ) : clientesFiltrados.map(c => (
                      <div key={c.id} className="px-3 py-2 text-sm cursor-pointer hover:bg-slate-100"
                        onClick={() => {
                          setForm({
                            ...form,
                            cliente_id: c.id,
                            cliente_cpf: c.cpf || '',
                            cliente_telefone: c.celular || c.telefone_fixo || '',
                          });
                          setClienteDropdownOpen(false);
                          setClienteSearch('');
                        }}>
                        {c.nome_completo || c.pj_razao_social}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div>
              <Label>Prioridade</Label>
              <Select value={form.prioridade || 'media'} onValueChange={v => setForm({ ...form, prioridade: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="urgente">🔴 Urgente</SelectItem>
                  <SelectItem value="alta">🔴 Alta</SelectItem>
                  <SelectItem value="media">🟡 Média</SelectItem>
                  <SelectItem value="baixa">🟢 Baixa</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Setor + Subsetor */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Setor</Label>
              <Select value={form.setor_id || ''} onValueChange={v => {
                setForm({ ...form, setor_id: v, subsetor_id: '', subsetor_nome: '' });
              }}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecionar setor" />
                </SelectTrigger>
                <SelectContent>
                  {setoresList.map(s => (
                    <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>
                  ))}
                  {setoresList.length === 0 && <SelectItem value="_vazio" disabled>Nenhum setor encontrado</SelectItem>}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Subsetor</Label>
              <Select value={form.subsetor_id || ''} onValueChange={v => {
                const subsetor = subsetoresFiltrados.find(s => s.id === v);
                setForm({ ...form, subsetor_id: v, subsetor_nome: subsetor?.nome || '' });
              }} disabled={!form.setor_id}>
                <SelectTrigger className={!form.setor_id ? 'opacity-50' : ''}>
                  <SelectValue placeholder={!form.setor_id ? "Selecione um setor primeiro" : "Selecionar subsetor"} />
                </SelectTrigger>
                <SelectContent>
                  {subsetoresFiltrados.map(s => <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>)}
                  {subsetoresFiltrados.length === 0 && !form.setor_id && <SelectItem value="_vazio" disabled>Selecione um setor</SelectItem>}
                  {subsetoresFiltrados.length === 0 && form.setor_id && <SelectItem value="_vazio" disabled>Nenhum subsetor neste setor</SelectItem>}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Datas */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Data de Cadastro</Label>
              <Input type="date" value={form.data_cadastro || ''} onChange={e => setForm({ ...form, data_cadastro: e.target.value })} />
            </div>
            <div>
              <Label>Data de Conclusão *</Label>
              <Input type="date" value={form.data_conclusao_prevista || ''} onChange={e => setForm({ ...form, data_conclusao_prevista: e.target.value })} />
            </div>
          </div>

          {/* Status */}
          <div>
            <Label>Status</Label>
            <Select value={form.status || ''} onValueChange={v => setForm({ ...form, status: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {statusList.map(s => <SelectItem key={s.slug || s.id} value={s.slug || s.id}>{s.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Pendência com */}
          <div>
            <Label>Pendência com</Label>
            <Select value={form.pendencia_com || ''} onValueChange={v => setForm({ ...form, pendencia_com: v })}>
              <SelectTrigger>
                <SelectValue placeholder="Quem está com a pendência?" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cliente">👤 Cliente</SelectItem>
                <SelectItem value="banco">🏦 Banco</SelectItem>
                <SelectItem value="administradora">🏢 Administradora</SelectItem>
                <SelectItem value="seguradora">🛡️ Seguradora</SelectItem>
                <SelectItem value="detran">🚗 Detran</SelectItem>
                <SelectItem value="cartorio">📋 Cartório</SelectItem>
                <SelectItem value="parceiro">🤝 Parceiro</SelectItem>
                <SelectItem value="equipe_interna">👨‍💼 Equipe Interna</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Descrição */}
          <div>
            <Label>Descrição</Label>
            <Textarea value={form.descricao || ''} onChange={e => setForm({ ...form, descricao: e.target.value })} rows={6} placeholder="Descreva detalhes da tarefa..." />
          </div>

          {/* Responsáveis */}
          <div>
            <Label className="mb-2 block">
              Responsáveis * <span className="text-xs text-slate-400">(selecione um ou mais)</span>
            </Label>

            {/* Tags dos selecionados */}
            {responsaveisSelecionadosDados.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-2">
                {responsaveisSelecionadosDados.map(c => (
                  <div key={c.id} className="flex items-center gap-1 bg-blue-50 border border-blue-200 px-2 py-1 rounded-full text-xs text-blue-800">
                    <Avatar className="h-4 w-4">
                      <AvatarImage src={c.foto_perfil} />
                      <AvatarFallback className="text-xs bg-blue-200 text-blue-800">{getInitials(c.nome || c.full_name || '')}</AvatarFallback>
                    </Avatar>
                    <span>{c.nome || c.full_name}</span>
                    {c.id === (form.responsavel_principal_id || responsaveisSel[0]) && (
                      <span className="text-blue-500 font-medium ml-0.5">★</span>
                    )}
                    <button onClick={() => toggleResponsavel(c.id)} className="ml-0.5 text-blue-400 hover:text-red-500">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="border rounded-lg overflow-hidden">
              <div className="p-2 border-b bg-slate-50">
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400" />
                  <input className="w-full pl-7 pr-2 py-1 text-sm border rounded outline-none bg-white"
                    placeholder="Buscar responsável..." value={responsavelSearch}
                    onChange={e => setResponsavelSearch(e.target.value)} />
                </div>
              </div>
              <div className="p-2 max-h-40 overflow-y-auto space-y-1">
                {colaboradoresFiltrados.map(c => (
                  <div key={c.id}
                    onClick={() => toggleResponsavel(c.id)}
                    className={`flex items-center gap-2 p-2 rounded cursor-pointer transition-colors ${responsaveisSel.includes(c.id) ? 'bg-blue-50 border border-blue-200' : 'hover:bg-slate-50'}`}
                  >
                    <Avatar className="h-7 w-7">
                      <AvatarImage src={c.foto_perfil} />
                      <AvatarFallback className="text-xs">{getInitials(c.nome || c.full_name || '')}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <p className="text-sm font-medium">{c.nome || c.full_name}</p>
                      <p className="text-xs text-slate-400 capitalize">{c.perfil}</p>
                    </div>
                    {responsaveisSel.includes(c.id) && (
                      <div className="h-5 w-5 bg-blue-600 rounded-full flex items-center justify-center">
                        <span className="text-white text-xs">✓</span>
                      </div>
                    )}
                  </div>
                ))}
                {colaboradoresFiltrados.length === 0 && (
                  <p className="text-xs text-slate-400 text-center py-3">Nenhum encontrado</p>
                )}
              </div>
            </div>

            {/* Responsável principal */}
            {responsaveisSel.length > 1 && (
              <div className="mt-2">
                <Label className="text-xs mb-1 block">Responsável principal ★</Label>
                <Select value={form.responsavel_principal_id || responsaveisSel[0]} onValueChange={v => setForm({ ...form, responsavel_principal_id: v })}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {responsaveisSel.map(id => {
                      const c = colaboradores.find(x => x.id === id);
                      return c ? <SelectItem key={id} value={id}>{c.nome || c.full_name}</SelectItem> : null;
                    })}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {/* Checklist */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label>Checklist</Label>
              {templates?.length > 0 && (
                <Select onValueChange={v => { const t = templates.find(x => x.id === v); if (t) aplicarTemplate(t); }}>
                  <SelectTrigger className="w-44 h-7 text-xs"><SelectValue placeholder="Usar template..." /></SelectTrigger>
                  <SelectContent>
                    {templates.map(t => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.favorito && <Star className="w-3 h-3 inline mr-1 fill-yellow-400 text-yellow-400" />}{t.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            <div className="space-y-2 mb-2">
              {checklist.map(item => (
                <div key={item.id} className="flex items-center gap-2 p-2 bg-slate-50 rounded-lg">
                  <Checkbox checked={item.checked} onCheckedChange={v => setChecklist(prev => prev.map(i => i.id === item.id ? { ...i, checked: !!v } : i))} />
                  <span className={`text-sm flex-1 ${item.checked ? 'line-through text-slate-400' : ''}`}>{item.texto}</span>
                  <button onClick={() => setChecklist(prev => prev.filter(i => i.id !== item.id))} className="text-slate-400 hover:text-red-500">
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <Input value={novoItem} onChange={e => setNovoItem(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && adicionarItem()}
                placeholder="Novo item do checklist..." className="flex-1" />
              <Button variant="outline" size="sm" onClick={adicionarItem}><Plus className="w-4 h-4" /></Button>
            </div>

            {checklist.length > 0 && (
              <div className="mt-3 p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-2">
                <div className="flex items-center gap-2">
                  <Checkbox id="salvar-tmpl" checked={salvarTemplate} onCheckedChange={setSalvarTemplate} />
                  <Label htmlFor="salvar-tmpl" className="text-sm cursor-pointer">Salvar como template</Label>
                </div>
                {salvarTemplate && (
                  <div className="flex items-center gap-2">
                    <Input value={nomeTemplate} onChange={e => setNomeTemplate(e.target.value)} placeholder="Nome do template" className="flex-1" />
                    <div className="flex items-center gap-1">
                      <Checkbox id="fav-tmpl" checked={templateFavorito} onCheckedChange={setTemplateFavorito} />
                      <Label htmlFor="fav-tmpl" className="text-xs cursor-pointer flex items-center gap-1"><Star className="w-3 h-3" /> Favorito</Label>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-3 pt-2 border-t">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button onClick={handleSave} className="bg-[#1e3a5f] hover:bg-[#2a4a73]">
              {tarefa ? 'Salvar alterações' : 'Criar Tarefa'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>

    <CadastrarClienteModal
      open={cadastrandoCliente}
      onOpenChange={setCadastrandoCliente}
      nomeInicial={nomeInicialCliente}
      empresaId={currentUser?.empresa_id}
      onClienteCriado={handleClienteCriado}
    />
    </>
  );
}