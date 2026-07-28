import React, { useEffect, useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import {
  Users,
  TrendingUp,
  Tag as TagIcon,
  ListChecks,
  Handshake,
  Filter as FilterIcon,
  Search,
  Check,
  X,
  Plus,
  Trash2,
  Loader2,
  ChevronDown,
  Phone,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import ImportarListaModal from './ImportarListaModal';

const FONTES = [
  { id: 'clientes', label: 'Clientes', icon: Users, desc: 'Base de clientes do CRM' },
  { id: 'funis', label: 'Funis', icon: TrendingUp, desc: 'Contatos por funil/produto' },
  { id: 'tags', label: 'Tags', icon: TagIcon, desc: 'Contatos por tag' },
  { id: 'listas', label: 'Listas importadas', icon: ListChecks, desc: 'Listas de contatos importados' },
  { id: 'parceiros', label: 'Parceiros', icon: Handshake, desc: 'Contatos por parceiro' },
  { id: 'personalizados', label: 'Personalizados', icon: FilterIcon, desc: 'Regras customizadas' },
];

const CLIENTES_OPCOES = [
  { id: 'todos', label: 'Todos os clientes' },
  { id: 'ativos', label: 'Somente clientes ativos' },
  { id: 'inativos', label: 'Somente clientes inativos' },
  { id: 'com_whatsapp', label: 'Clientes com WhatsApp' },
  { id: 'sem_whatsapp', label: 'Clientes sem WhatsApp' },
  { id: 'sem_atendimento', label: 'Clientes sem atendimento' },
  { id: 'com_propostas', label: 'Clientes com propostas' },
  { id: 'sem_propostas', label: 'Clientes sem propostas' },
];

const PERSONALIZADO_CAMPOS = [
  { value: 'res_cidade', label: 'Cidade (residencial)' },
  { value: 'com_cidade', label: 'Cidade (comercial)' },
  { value: 'res_uf', label: 'UF (residencial)' },
  { value: 'com_uf', label: 'UF (comercial)' },
  { value: 'res_cep', label: 'CEP (residencial)' },
  { value: 'status', label: 'Status do cliente', enum: ['ativo', 'inativo'] },
  { value: 'sexo', label: 'Sexo', enum: ['Masculino', 'Feminino', 'Outro', 'Prefiro não informar'] },
  { value: 'vendedor_id', label: 'Vendedor (ID)' },
  { value: 'created_date', label: 'Criado em', kind: 'date' },
  { value: 'renda', label: 'Renda', kind: 'number' },
  { value: 'valor_patrimonial', label: 'Valor patrimonial', kind: 'number' },
];

const OPERADORES = [
  { value: '=', label: '=' },
  { value: '!=', label: '≠' },
  { value: '>', label: '>' },
  { value: '<', label: '<' },
  { value: '>=', label: '≥' },
  { value: '<=', label: '≤' },
  { value: 'contains', label: 'contém' },
  { value: 'starts_with', label: 'começa com' },
];

export const normalizeTel = (s = '') => s.replace(/\D/g, '');

/**
 * Constrói o filtro de Cliente a partir de regras personalizadas (AND entre todas).
 */
function aplicarRegrasPersonalizadas(lista, regras) {
  if (!regras || regras.length === 0) return lista;
  return lista.filter((c) =>
    regras.every((r) => {
      if (!r.field || !r.op || r.value === '' || r.value == null) return true;
      const campoValor = c[r.field];
      const alvo = String(r.value ?? '').toLowerCase();
      const atual = campoValor == null ? '' : String(campoValor).toLowerCase();
      switch (r.op) {
        case '=': return atual === alvo;
        case '!=': return atual !== alvo;
        case '>': return parseFloat(campoValor) > parseFloat(r.value);
        case '<': return parseFloat(campoValor) < parseFloat(r.value);
        case '>=': return parseFloat(campoValor) >= parseFloat(r.value);
        case '<=': return parseFloat(campoValor) <= parseFloat(r.value);
        case 'contains': return atual.includes(alvo);
        case 'starts_with': return atual.startsWith(alvo);
        default: return true;
      }
    })
  );
}

export default function PublicoBuilder({ form, setForm, empresaId, user }) {
  const origens = form.origens || [];

  const [funis, setFunis] = useState([]);
  const [tags, setTags] = useState([]);
  const [listas, setListas] = useState([]);
  const [parceiros, setParceiros] = useState([]);
  const [loadingData, setLoadingData] = useState(false);

  const [buscaFunil, setBuscaFunil] = useState('');
  const [buscaTag, setBuscaTag] = useState('');
  const [buscaLista, setBuscaLista] = useState('');
  const [importarOpen, setImportarOpen] = useState(false);

  const isSuperAdmin = user?.perfil === 'super_admin' || user?.perfil === 'master';

  const onListaImportada = (lista) => {
    setListas((prev) => [lista, ...prev]);
  };

  // Carrega dados das fontes selecionadas
  useEffect(() => {
    let cancelled = false;
    async function load() {
      const needs = {
        funis: origens.includes('funis') && funis.length === 0,
        tags: origens.includes('tags') && tags.length === 0,
        listas: origens.includes('listas') && listas.length === 0,
        parceiros: origens.includes('parceiros') && parceiros.length === 0,
      };
      if (!Object.values(needs).some(Boolean)) return;
      setLoadingData(true);
      try {
        const filtroEmp = isSuperAdmin ? {} : (empresaId ? { empresa_id: empresaId } : {});
        const promises = [];
        if (needs.funis) promises.push(base44.entities.EtapaFunil.filter({ ...filtroEmp, status: 'ativa' }, 'ordem', 500).then((r) => !cancelled && setFunis(r)).catch(() => {}));
        if (needs.tags) promises.push(base44.entities.ContatoTag.filter(filtroEmp, null, 500).then((r) => !cancelled && setTags(r)).catch(() => {}));
        if (needs.listas) promises.push(base44.entities.ListaContatosImportada.filter({ ...filtroEmp, status: 'ativa' }, '-data_importacao', 200).then((r) => !cancelled && setListas(r)).catch(() => {}));
        if (needs.parceiros) promises.push(base44.entities.Colaborador.filter({ ...filtroEmp, perfil: 'parceiro', status: 'ativo' }, 'nome', 500).then((r) => !cancelled && setParceiros(r)).catch(() => {}));
        await Promise.all(promises);
      } finally {
        if (!cancelled) setLoadingData(false);
      }
    }
    load();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [origens.join(','), empresaId, isSuperAdmin]);

  const toggleOrigem = (id) => {
    const tem = origens.includes(id);
    setForm({ ...form, origens: tem ? origens.filter((o) => o !== id) : [...origens, id] });
  };

  const setClientesSub = (sub) => setForm({ ...form, clientes_sub: sub });

  const toggleArr = (key, id) => {
    const arr = form[key] || [];
    const tem = arr.includes(id);
    setForm({ ...form, [key]: tem ? arr.filter((x) => x !== id) : [...arr, id] });
  };

  const addRegra = () => {
    const regras = form.personalizado_regras || [];
    setForm({
      ...form,
      personalizado_regras: [...regras, { field: 'res_cidade', op: '=', value: '', condition: 'AND' }],
    });
  };
  const updateRegra = (idx, patch) => {
    const regras = [...(form.personalizado_regras || [])];
    const r = { ...regras[idx], ...patch };
    // reset value when changing to an enum-only field
    if (patch.field) {
      const campo = PERSONALIZADO_CAMPOS.find((c) => c.value === patch.field);
      if (campo?.enum && !campo.enum.includes(r.value)) r.value = '';
    }
    regras[idx] = r;
    setForm({ ...form, personalizado_regras: regras });
  };
  const removeRegra = (idx) => {
    const regras = [...(form.personalizado_regras || [])];
    regras.splice(idx, 1);
    setForm({ ...form, personalizado_regras: regras });
  };

  const selecaoResumo = useMemo(() => {
    const parts = [];
    if (origens.includes('clientes')) {
      const sub = CLIENTES_OPCOES.find((o) => o.id === (form.clientes_sub || 'todos'));
      parts.push({ fonte: 'Clientes', valor: sub?.label || 'Todos' });
    }
    if (origens.includes('funis')) {
      const n = (form.funis_selecionados || []).length;
      parts.push({ fonte: 'Funis', valor: `${n}.funil${n === 1 ? '' : 'is'}` });
    }
    if (origens.includes('tags')) {
      const n = (form.tags_selecionadas || []).length;
      parts.push({ fonte: 'Tags', valor: `${n} tag${n === 1 ? '' : 's'}` });
    }
    if (origens.includes('listas')) {
      const n = (form.listas_selecionadas || []).length;
      parts.push({ fonte: 'Listas', valor: `${n} lista${n === 1 ? '' : 's'}` });
    }
    if (origens.includes('parceiros')) {
      const n = (form.parceiros_selecionados || []).length;
      parts.push({ fonte: 'Parceiros', valor: `${n} parceiro${n === 1 ? '' : 's'}` });
    }
    if (origens.includes('personalizados')) {
      const n = (form.personalizado_regras || []).length;
      parts.push({ fonte: 'Personalizados', valor: `${n} regra${n === 1 ? '' : 's'}` });
    }
    return parts;
  }, [origens, form]);

  const temOrigem = origens.length > 0;

  return (
    <div className="space-y-4">
      <div>
        <Label className="block mb-2 text-sm font-semibold text-slate-700">
          Fontes de audiência (selecione uma ou várias)
        </Label>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5">
          {FONTES.map((f) => {
            const sel = origens.includes(f.id);
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => toggleOrigem(f.id)}
                className={cn(
                  'group relative p-3.5 rounded-xl border text-left transition-all flex flex-col items-start gap-2',
                  sel
                    ? 'border-emerald-500 bg-emerald-50 shadow-sm'
                    : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                )}
              >
                <div className="flex items-center justify-between w-full">
                  <div className={cn(
                    'w-9 h-9 rounded-lg flex items-center justify-center transition-colors',
                    sel ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-500 group-hover:bg-slate-200'
                  )}>
                    <f.icon className="w-5 h-5" />
                  </div>
                  {sel && (
                    <span className="w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center">
                      <Check className="w-3.5 h-3.5" />
                    </span>
                  )}
                </div>
                <div className="w-full">
                  <p className={cn('text-sm font-semibold', sel ? 'text-emerald-700' : 'text-slate-700')}>
                    {f.label}
                  </p>
                  <p className="text-[11px] text-slate-400 leading-tight line-clamp-1">{f.desc}</p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Selecionados - resumo pills */}
      {temOrigem && (
        <div className="flex items-center gap-2 flex-wrap p-3 rounded-lg bg-slate-50 border border-slate-200">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Selecionados:</span>
          {selecaoResumo.map((s, i) => (
            <span key={i} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700 text-xs font-medium border border-emerald-200">
              <span className="font-semibold">{s.fonte}:</span>
              <span>{s.valor}</span>
              <button
                type="button"
                onClick={() => toggleOrigem(s.fonte.toLowerCase() === 'listas importadas' ? 'listas' : s.fonte.toLowerCase())}
                className="ml-0.5 hover:text-emerald-900"
                title={`Remover ${s.fonte}`}
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Destino dos telefones */}
      {temOrigem && <DestinoTelefonesSelector form={form} setForm={setForm} />}

      {/* Painéis inline por fonte selecionada */}
      <div className="space-y-3">
        {origens.includes('clientes') && (
          <PainelFonte titulo="Clientes" icon={Users}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {CLIENTES_OPCOES.map((o) => {
                const sel = (form.clientes_sub || 'todos') === o.id;
                return (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => setClientesSub(o.id)}
                    className={cn(
                      'flex items-center gap-2 p-2.5 rounded-lg border text-sm text-left transition',
                      sel ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-200 hover:border-slate-300'
                    )}
                  >
                    <span className={cn(
                      'w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0',
                      sel ? 'border-emerald-600 bg-emerald-600' : 'border-slate-300'
                    )}>
                      {sel && <span className="w-1.5 h-1.5 bg-white rounded-full" />}
                    </span>
                    {o.label}
                  </button>
                );
              })}
            </div>
          </PainelFonte>
        )}

        {origens.includes('funis') && (
          <PainelFonte titulo="Funis" icon={TrendingUp}>
            <SearchBox value={buscaFunil} onChange={setBuscaFunil} placeholder="Pesquisar funil..." />
            <div className="max-h-56 overflow-auto mt-2 space-y-1 pr-1">
              {loadingData && funis.length === 0 ? (
                <div className="flex items-center gap-2 py-3 text-slate-500 text-sm">
                  <Loader2 className="w-4 h-4 animate-spin" /> Carregando funis...
                </div>
              ) : funis.length === 0 ? (
                <p className="text-xs text-slate-400 py-3">Nenhum funil cadastrado.</p>
              ) : (
                funis
                  .filter((f) => (f.produto || f.nome || '').toLowerCase().includes(buscaFunil.toLowerCase()))
                  .map((f) => {
                    const sel = (form.funis_selecionados || []).includes(f.produto || f.id);
                    return (
                      <label key={f.id} className={cn(
                        'flex items-center gap-2 p-2 rounded-lg border cursor-pointer text-sm transition',
                        sel ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200 hover:bg-slate-50'
                      )}>
                        <input
                          type="checkbox"
                          checked={sel}
                          onChange={() => toggleArr('funis_selecionados', f.produto || f.id)}
                          className="accent-emerald-600"
                        />
                        <span className="font-medium text-slate-700 capitalize">{f.produto || f.nome}</span>
                        {f.nome && f.produto && <span className="text-xs text-slate-400">· {f.nome}</span>}
                      </label>
                    );
                  })
              )}
            </div>
          </PainelFonte>
        )}

        {origens.includes('tags') && (
          <PainelFonte titulo="Tags" icon={TagIcon}>
            <SearchBox value={buscaTag} onChange={setBuscaTag} placeholder="Pesquisar tag..." />
            <div className="max-h-56 overflow-auto mt-2 space-y-1 pr-1">
              {loadingData && tags.length === 0 ? (
                <div className="flex items-center gap-2 py-3 text-slate-500 text-sm">
                  <Loader2 className="w-4 h-4 animate-spin" /> Carregando tags...
                </div>
              ) : tags.length === 0 ? (
                <p className="text-xs text-slate-400 py-3">Nenhuma tag cadastrada.</p>
              ) : (
                tags
                  .filter((t) => (t.nome || '').toLowerCase().includes(buscaTag.toLowerCase()))
                  .map((t) => {
                    const sel = (form.tags_selecionadas || []).includes(t.id);
                    return (
                      <label key={t.id} className={cn(
                        'flex items-center gap-2 p-2 rounded-lg border cursor-pointer text-sm transition',
                        sel ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200 hover:bg-slate-50'
                      )}>
                        <input
                          type="checkbox"
                          checked={sel}
                          onChange={() => toggleArr('tags_selecionadas', t.id)}
                          className="accent-emerald-600"
                        />
                        <span className="w-2.5 h-2.5 rounded-full" style={{ background: t.cor || '#9ca3af' }} />
                        <span className="font-medium text-slate-700">{t.nome}</span>
                      </label>
                    );
                  })
              )}
            </div>
          </PainelFonte>
        )}

        {origens.includes('listas') && (
          <PainelFonte titulo="Listas importadas" icon={ListChecks}>
            <div className="flex items-center justify-between gap-2 mb-2">
              <SearchBox value={buscaLista} onChange={setBuscaLista} placeholder="Pesquisar lista..." />
              <button
                type="button"
                onClick={() => setImportarOpen(true)}
                className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition whitespace-nowrap"
              >
                <Plus className="w-3.5 h-3.5" /> Importar nova lista
              </button>
            </div>
            <div className="max-h-64 overflow-auto mt-2 space-y-1.5 pr-1">
              {loadingData && listas.length === 0 ? (
                <div className="flex items-center gap-2 py-3 text-slate-500 text-sm">
                  <Loader2 className="w-4 h-4 animate-spin" /> Carregando listas...
                </div>
              ) : listas.length === 0 ? (
                <div className="text-xs text-slate-400 py-3 space-y-1">
                  <p>Nenhuma lista cadastrada ainda.</p>
                  <p className="text-slate-500">Importe listas em Contatos CRM para usá-las aqui.</p>
                </div>
              ) : (
                listas
                  .filter((l) => (l.nome || '').toLowerCase().includes(buscaLista.toLowerCase()))
                  .map((l) => {
                    const sel = (form.listas_selecionadas || []).includes(l.id);
                    return (
                      <label key={l.id} className={cn(
                        'flex items-start gap-2 p-2.5 rounded-lg border cursor-pointer text-sm transition',
                        sel ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200 hover:bg-slate-50'
                      )}>
                        <input
                          type="checkbox"
                          checked={sel}
                          onChange={() => toggleArr('listas_selecionadas', l.id)}
                          className="accent-emerald-600 mt-0.5"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-slate-700 truncate">{l.nome}</p>
                          <div className="flex items-center gap-2 flex-wrap text-[11px] text-slate-400 mt-0.5">
                            <span className="font-semibold text-slate-500">{l.total_contatos || 0} contatos</span>
                            {l.total_telefones ? (
                              <span className="font-semibold text-blue-500">· {l.total_telefones} telefones</span>
                            ) : null}
                            {l.data_importacao && (
                              <span>· {new Date(l.data_importacao).toLocaleDateString('pt-BR')}</span>
                            )}
                            {l.criado_por_nome && <span>· {l.criado_por_nome}</span>}
                          </div>
                        </div>
                      </label>
                    );
                  })
              )}
            </div>
          </PainelFonte>
        )}

        {origens.includes('parceiros') && (
          <PainelFonte titulo="Parceiros" icon={Handshake}>
            <div className="max-h-56 overflow-auto space-y-1 pr-1">
              {loadingData && parceiros.length === 0 ? (
                <div className="flex items-center gap-2 py-3 text-slate-500 text-sm">
                  <Loader2 className="w-4 h-4 animate-spin" /> Carregando parceiros...
                </div>
              ) : parceiros.length === 0 ? (
                <p className="text-xs text-slate-400 py-3">Nenhum parceiro cadastrado.</p>
              ) : (
                parceiros.map((p) => {
                  const sel = (form.parceiros_selecionados || []).includes(p.id);
                  return (
                    <label key={p.id} className={cn(
                      'flex items-center gap-2 p-2 rounded-lg border cursor-pointer text-sm transition',
                      sel ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200 hover:bg-slate-50'
                    )}>
                      <input
                        type="checkbox"
                        checked={sel}
                        onChange={() => toggleArr('parceiros_selecionados', p.id)}
                        className="accent-emerald-600"
                      />
                      <span className="font-medium text-slate-700">{p.nome || p.email}</span>
                    </label>
                  );
                })
              )}
            </div>
          </PainelFonte>
        )}

        {origens.includes('personalizados') && (
          <PainelFonte titulo="Personalizados (construtor de regras)" icon={FilterIcon}>
            <div className="space-y-2">
              {(form.personalizado_regras || []).length === 0 && (
                <p className="text-xs text-slate-400">Nenhuma regra ainda. Clique em "Adicionar regra".</p>
              )}
              {(form.personalizado_regras || []).map((r, idx) => (
                <div key={idx} className="rounded-lg border border-slate-200 p-2.5 bg-slate-50 space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    {idx > 0 && (
                      <span className="px-2 py-1 text-[11px] font-bold text-emerald-700 bg-emerald-100 rounded">
                        AND
                      </span>
                    )}
                    <select
                      value={r.field}
                      onChange={(e) => updateRegra(idx, { field: e.target.value })}
                      className="text-xs border border-slate-200 rounded px-2 py-1 bg-white flex-1 min-w-[140px]"
                    >
                      {PERSONALIZADO_CAMPOS.map((c) => (
                        <option key={c.value} value={c.value}>{c.label}</option>
                      ))}
                    </select>
                    <select
                      value={r.op}
                      onChange={(e) => updateRegra(idx, { op: e.target.value })}
                      className="text-xs border border-slate-200 rounded px-2 py-1 bg-white"
                    >
                      {OPERADORES.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                    {(() => {
                      const campo = PERSONALIZADO_CAMPOS.find((c) => c.value === r.field);
                      if (campo?.enum) {
                        return (
                          <select
                            value={r.value}
                            onChange={(e) => updateRegra(idx, { value: e.target.value })}
                            className="text-xs border border-slate-200 rounded px-2 py-1 bg-white flex-1 min-w-[120px]"
                          >
                            <option value="">Selecione...</option>
                            {campo.enum.map((v) => (
                              <option key={v} value={v}>{v}</option>
                            ))}
                          </select>
                        );
                      }
                      return (
                        <Input
                          type={campo?.kind === 'date' ? 'date' : campo?.kind === 'number' ? 'number' : 'text'}
                          value={r.value}
                          onChange={(e) => updateRegra(idx, { value: e.target.value })}
                          placeholder="Valor..."
                          className="text-xs h-8 flex-1 min-w-[120px]"
                        />
                      );
                    })()}
                    <button
                      type="button"
                      onClick={() => removeRegra(idx)}
                      className="p-1.5 rounded text-red-500 hover:bg-red-50"
                      title="Remover regra"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
              <button
                type="button"
                onClick={addRegra}
                className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-dashed border-emerald-300 text-emerald-700 hover:bg-emerald-50"
              >
                <Plus className="w-3.5 h-3.5" /> Adicionar regra
              </button>
              <p className="text-[11px] text-slate-400">
                As regras são combinadas com AND. Sem limite de condições.
              </p>
            </div>
          </PainelFonte>
        )}
      </div>

      {/* Modal de importação de lista */}
      <ImportarListaModal
        open={importarOpen}
        onOpenChange={setImportarOpen}
        empresaId={empresaId}
        user={user}
        onImported={onListaImportada}
      />

      {/* Aviso de deduplicação */}
      {temOrigem && (
        <div className="flex items-start gap-2 p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs">
          <Check className="w-4 h-4 mt-px flex-shrink-0" />
          <span>
            <strong>Dedução automática:</strong> contatos com o mesmo telefone aparecem uma única vez no envio.
            A chave de deduplicação é o <strong>telefone</strong>. Se alguém está em um funil, em uma tag e em uma lista, recebe apenas uma mensagem.
          </span>
        </div>
      )}
    </div>
  );
}

function DestinoTelefonesSelector({ form, setForm }) {
  const modos = [
    { id: 'principal', label: 'Apenas telefone principal', desc: '1 disparo por cliente (padrão recomendado)' },
    { id: 'todos', label: 'Todos os telefones válidos', desc: '1 disparo por telefone do cliente' },
    { id: 'whatsapp', label: 'Apenas telefones WhatsApp', desc: 'Só celular/WhatsApp do cadastro' },
  ];
  return (
    <div className="rounded-xl border border-slate-200 p-3 bg-white">
      <div className="flex items-center gap-2 mb-2.5">
        <Phone className="w-4 h-4 text-emerald-600" />
        <span className="text-sm font-semibold text-slate-700">Destino dos telefones</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {modos.map((m) => {
          const sel = (form.destino_telefones || 'principal') === m.id;
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => setForm({ ...form, destino_telefones: m.id })}
              className={cn('text-left p-2.5 rounded-lg border', sel ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200 hover:border-slate-300')}
            >
              <div className="flex items-center gap-2">
                <span className={cn('w-4 h-4 rounded-full border-2 flex items-center justify-center', sel ? 'border-emerald-600 bg-emerald-600' : 'border-slate-300')}>
                  {sel && <span className="w-1.5 h-1.5 bg-white rounded-full" />}
                </span>
                <span className={cn('text-sm font-medium', sel ? 'text-emerald-700' : 'text-slate-700')}>{m.label}</span>
              </div>
              <p className="text-[11px] text-slate-500 mt-1 leading-tight">{m.desc}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function PainelFonte({ titulo, icon: Icon, children }) {
  const [aberto, setAberto] = useState(true);
  return (
    <div className="rounded-xl border border-slate-200 overflow-hidden">
      <button
        type="button"
        onClick={() => setAberto(!aberto)}
        className="w-full flex items-center justify-between px-3 py-2.5 bg-white hover:bg-slate-50 text-sm font-semibold text-slate-700"
      >
        <span className="flex items-center gap-2">
          <Icon className="w-4 h-4 text-emerald-600" />
          {titulo}
        </span>
        <ChevronDown className={cn('w-4 h-4 transition-transform', aberto && 'rotate-180')} />
      </button>
      {aberto && <div className="p-3 bg-white border-t border-slate-100">{children}</div>}
    </div>
  );
}

function SearchBox({ value, onChange, placeholder }) {
  return (
    <div className="relative">
      <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-8 pl-8 text-xs"
      />
    </div>
  );
}