import React, { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogClose } from '@/components/ui/dialog';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  X, Calendar, User, Tag, CheckSquare, MessageSquare, Clock, AlertTriangle, Paperclip, FileText, Download,
  Sparkles, AlertCircle, Timer, CheckCircle2, Zap, RefreshCw, Loader2, ChevronDown, Check
} from 'lucide-react';
import ColaboracaoInterna from './ColaboracaoInterna';
import ChecklistAba from './ChecklistAba';

const PRIORIDADE_CORES = {
  baixa: 'bg-slate-100 text-slate-600',
  media: 'bg-yellow-100 text-yellow-700',
  alta: 'bg-orange-100 text-orange-700',
  urgente: 'bg-red-100 text-red-700',
};

const PRIORIDADE_LABEL = {
  baixa: 'Baixa', media: 'Média', alta: 'Alta', urgente: 'Urgente',
};

function Iniciais({ nome, foto, size = 'md' }) {
  const initials = (nome || '?').split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();
  const sz = size === 'sm' ? 'w-7 h-7 text-xs' : size === 'lg' ? 'w-14 h-14 text-lg' : 'w-9 h-9 text-sm';
  const colors = ['bg-blue-500', 'bg-purple-500', 'bg-green-500', 'bg-orange-500', 'bg-pink-500', 'bg-teal-500'];
  const color = colors[(initials.charCodeAt(0) || 0) % colors.length];
  if (foto) return <img src={foto} alt={nome} className={`${sz} rounded-full object-cover flex-shrink-0`} />;
  return (
    <div className={`${sz} ${color} rounded-full flex items-center justify-center text-white font-semibold flex-shrink-0`}>
      {initials}
    </div>
  );
}

function formatarData(data) {
  if (!data) return '-';
  try { return format(parseISO(data), 'dd/MM/yyyy', { locale: ptBR }); } catch { return data; }
}

export default function TarefaDetalhesModal({
  open, onOpenChange, tarefa, statusList = [], currentUser,
  onUpdate, colaboradores = [], subsetoresList = [], abaAtiva: abaInicial
}) {
  const [aba, setAba] = useState(abaInicial || 'detalhes');
  const queryClient = useQueryClient();

  useEffect(() => {
    if (open) {
      setAba(abaInicial || 'detalhes');
      setHistoricoIA(null);
      setErroIA(null);
    }
  }, [open, tarefa?.id, abaInicial]);

  const { data: comentarios = [] } = useQuery({
    queryKey: ['comentarios-tarefa', tarefa?.id],
    enabled: !!tarefa?.id && open,
    queryFn: () => base44.entities.ComentarioTarefa.filter({ tarefa_id: tarefa.id }, 'created_date'),
  });

  const { data: historico = [], isLoading: loadingHistorico } = useQuery({
    queryKey: ['historico-tarefa', tarefa?.id],
    enabled: !!tarefa?.id && open && aba === 'historico',
    queryFn: () => base44.entities.TarefaHistorico.filter({ tarefa_id: tarefa.id }, '-created_date'),
  });

  const [historicoIA, setHistoricoIA] = useState(null);
  const [loadingIA, setLoadingIA] = useState(false);
  const [erroIA, setErroIA] = useState(null);

  const gerarHistoricoIA = async () => {
    setLoadingIA(true);
    setErroIA(null);
    try {
      const res = await base44.functions.invoke('gerarHistoricoIA', { tarefa_id: tarefa.id });
      setHistoricoIA(res.data?.historico || []);
    } catch (e) {
      setErroIA('Erro ao gerar histórico. Tente novamente.');
    } finally {
      setLoadingIA(false);
    }
  };

  useEffect(() => {
    if (aba === 'historico' && open && tarefa?.id && historicoIA === null) {
      gerarHistoricoIA();
    }
  }, [aba, open, tarefa?.id]);

  const atualizarChecklist = async (novaLista) => {
    await onUpdate(tarefa.id, { checklist: JSON.stringify(novaLista) });
  };

  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);
  const statusDropdownRef = useRef(null);
  useEffect(() => {
    if (!statusDropdownOpen) return;
    const handler = (e) => {
      if (statusDropdownRef.current && !statusDropdownRef.current.contains(e.target)) {
        setStatusDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [statusDropdownOpen]);
  const [editandoPrazo, setEditandoPrazo] = useState(false);
  const [novoPrazo, setNovoPrazo] = useState('');
  const [salvandoPrazo, setSalvandoPrazo] = useState(false);

  const handleAlterarStatus = async (novoStatus) => {
    setStatusDropdownOpen(false);
    await onUpdate(tarefa.id, { status: novoStatus });
  };

  const handleSalvarPrazo = async () => {
    if (!novoPrazo) { setEditandoPrazo(false); return; }
    setSalvandoPrazo(true);
    await onUpdate(tarefa.id, { data_conclusao_prevista: novoPrazo });
    setSalvandoPrazo(false);
    setEditandoPrazo(false);
  };

  if (!tarefa) return null;

  const status = statusList.find(s => (s.slug || s.id) === tarefa.status);
  const responsavelPrincipal = colaboradores.find(c => c.id === tarefa.responsavel_principal_id);
  let responsaveisIds = [];
  try { responsaveisIds = tarefa.responsaveis_ids ? JSON.parse(tarefa.responsaveis_ids) : []; } catch {}
  const responsaveisColabs = responsaveisIds.map(id => colaboradores.find(c => c.id === id)).filter(Boolean);
  let checklistItems = [];
  try { checklistItems = tarefa.checklist ? JSON.parse(tarefa.checklist) : []; } catch {}
  const subsetor = subsetoresList.find(s => s.id === tarefa.subsetor_id);
  const hoje = format(new Date(), 'yyyy-MM-dd');
  const atrasada = tarefa.data_conclusao_prevista && tarefa.data_conclusao_prevista < hoje && tarefa.status !== 'concluido' && tarefa.status !== 'arquivado';

  // Extrair anexos dos comentários (formato: 📎 [nome](url))
  const ANEXO_REGEX = /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g;
  const anexos = comentarios.flatMap(c => {
    const matches = [];
    let m;
    const rx = new RegExp(ANEXO_REGEX.source, 'g');
    while ((m = rx.exec(c.mensagem || '')) !== null) {
      matches.push({
        nome: m[1],
        url: m[2],
        usuario_nome: c.usuario_nome,
        created_date: c.created_date,
      });
    }
    return matches;
  });

  const abas = [
    { key: 'detalhes', label: 'Detalhes', icon: Tag },
    { key: 'comentarios', label: 'Comentários', icon: MessageSquare, badge: comentarios.length },
    { key: 'checklist', label: 'Checklist', icon: CheckSquare, badge: checklistItems.length > 0 ? `${checklistItems.filter(i => i.checked).length}/${checklistItems.length}` : null },
    { key: 'anexos', label: 'Anexos', icon: Paperclip, badge: anexos.length || null },
    { key: 'historico', label: 'Histórico', icon: Clock },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl p-0 overflow-hidden flex flex-col gap-0 [&>button:last-of-type]:hidden" style={{ maxHeight: '92vh' }}>
        {/* Header */}
        <div className="flex items-start justify-between px-6 pt-5 pb-4 border-b bg-white">
          <div className="flex-1 min-w-0 pr-4">
            <div className="flex items-center gap-2 mb-1">
              {status && (
                <span className="text-xs font-semibold px-2.5 py-1 rounded-full text-white" style={{ backgroundColor: status.cor }}>
                  {status.nome}
                </span>
              )}
              {tarefa.prioridade && (
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full capitalize ${PRIORIDADE_CORES[tarefa.prioridade] || 'bg-slate-100 text-slate-600'}`}>
                  {PRIORIDADE_LABEL[tarefa.prioridade] || tarefa.prioridade}
                </span>
              )}
              {atrasada && (
                <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-red-100 text-red-700 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" /> Atrasada
                </span>
              )}
            </div>
            <h2 className="text-lg font-bold text-slate-900 leading-tight">{tarefa.titulo}</h2>
          </div>
          <button
            onClick={() => onOpenChange(false)}
            className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 hover:bg-slate-200 text-slate-400 hover:text-slate-700 transition-colors mt-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Abas */}
        <div className="flex border-b bg-white px-6 gap-1">
          {abas.map(a => (
            <button
              key={a.key}
              onClick={() => setAba(a.key)}
              className={`flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                aba === a.key ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              <a.icon className="w-4 h-4" />
              {a.label}
              {a.badge != null && a.badge !== 0 && (
                <span className="text-xs bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded-full font-semibold leading-none">
                  {a.badge}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Conteúdo */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {/* Detalhes */}
          {aba === 'detalhes' && (
            <div className="p-6 space-y-5 overflow-y-auto flex-1">
              {/* Responsável principal */}
              {(responsavelPrincipal || tarefa.responsavel_principal_nome) && (
                <div className="flex items-center gap-4 bg-slate-50 rounded-xl p-4">
                  <Iniciais
                    nome={responsavelPrincipal?.nome || tarefa.responsavel_principal_nome}
                    foto={responsavelPrincipal?.foto_perfil}
                    size="lg"
                  />
                  <div>
                    <p className="text-xs text-slate-400 font-medium uppercase tracking-wide mb-0.5">Responsável Principal</p>
                    <p className="text-base font-bold text-slate-900">{responsavelPrincipal?.nome || tarefa.responsavel_principal_nome}</p>
                    {responsavelPrincipal?.email && <p className="text-sm text-slate-500">{responsavelPrincipal.email}</p>}
                    {responsavelPrincipal?.telefone && <p className="text-sm text-slate-400">{responsavelPrincipal.telefone}</p>}
                  </div>
                </div>
              )}

              {/* Outros responsáveis */}
              {responsaveisColabs.length > 1 && (
                <div>
                  <p className="text-xs text-slate-400 font-semibold uppercase tracking-wide mb-2">Responsáveis</p>
                  <div className="flex flex-wrap gap-2">
                    {responsaveisColabs.map(c => (
                      <div key={c.id} className="flex items-center gap-2 bg-white border rounded-lg px-3 py-2">
                        <Iniciais nome={c.nome} foto={c.foto_perfil} size="sm" />
                        <span className="text-sm font-medium text-slate-700">{c.nome}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Ações rápidas: Status e Prazo */}
              <div className="flex gap-3">
                {/* Alterar Status */}
                <div className="relative flex-1" ref={statusDropdownRef}>
                  <p className="text-xs text-slate-400 font-medium mb-1.5">Status</p>
                  <button
                    onClick={() => setStatusDropdownOpen(v => !v)}
                    className="w-full flex items-center justify-between gap-2 px-3 py-2.5 border rounded-xl bg-white hover:bg-slate-50 transition-colors text-sm font-medium text-slate-700"
                  >
                    <span className="flex items-center gap-2">
                      {status && (
                        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: status.cor }} />
                      )}
                      {status?.nome || tarefa.status || 'Sem status'}
                    </span>
                    <ChevronDown className="w-4 h-4 text-slate-400 flex-shrink-0" />
                  </button>
                  {statusDropdownOpen && (
                    <div className="absolute z-50 top-full left-0 mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
                      {statusList.map(s => (
                        <button
                          key={s.id}
                          onClick={() => handleAlterarStatus(s.slug || s.id)}
                          className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm hover:bg-slate-50 transition-colors text-left"
                        >
                          <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: s.cor }} />
                          <span className="flex-1 font-medium text-slate-700">{s.nome}</span>
                          {(s.slug || s.id) === tarefa.status && <Check className="w-3.5 h-3.5 text-blue-500" />}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Alterar Prazo */}
                <div className="flex-1">
                  <p className="text-xs text-slate-400 font-medium mb-1.5">Prazo</p>
                  {editandoPrazo ? (
                    <div className="flex gap-1.5">
                      <input
                        type="date"
                        value={novoPrazo}
                        onChange={e => setNovoPrazo(e.target.value)}
                        className="flex-1 border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                        autoFocus
                      />
                      <button
                        onClick={handleSalvarPrazo}
                        disabled={salvandoPrazo}
                        className="px-3 py-2 bg-blue-500 text-white rounded-xl text-sm font-medium hover:bg-blue-600 disabled:opacity-50 transition-colors"
                      >
                        {salvandoPrazo ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                      </button>
                      <button
                        onClick={() => setEditandoPrazo(false)}
                        className="px-3 py-2 bg-slate-100 text-slate-600 rounded-xl text-sm hover:bg-slate-200 transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => { setNovoPrazo(tarefa.data_conclusao_prevista || ''); setEditandoPrazo(true); }}
                      className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 border rounded-xl hover:bg-slate-50 transition-colors text-sm font-medium ${atrasada ? 'bg-red-50 border-red-200 text-red-600 hover:bg-red-100' : 'bg-white text-slate-700'}`}
                    >
                      <span className="flex items-center gap-2">
                        <Calendar className={`w-4 h-4 ${atrasada ? 'text-red-400' : 'text-slate-400'}`} />
                        {tarefa.data_conclusao_prevista ? formatarData(tarefa.data_conclusao_prevista) : 'Sem prazo'}
                      </span>
                      <span className="text-xs text-slate-400 font-normal">Editar</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Grid de informações */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-white border rounded-xl p-3">
                  <p className="text-xs text-slate-400 mb-1 flex items-center gap-1"><Calendar className="w-3 h-3" /> Criado em</p>
                  <p className="text-sm font-semibold text-slate-800">{formatarData(tarefa.data_cadastro || tarefa.created_date)}</p>
                </div>
                <div className={`border rounded-xl p-3 ${atrasada ? 'bg-red-50 border-red-200' : 'bg-white'}`}>
                  <p className={`text-xs mb-1 flex items-center gap-1 ${atrasada ? 'text-red-400' : 'text-slate-400'}`}>
                    <Calendar className="w-3 h-3" /> Prazo
                  </p>
                  <p className={`text-sm font-semibold ${atrasada ? 'text-red-600' : 'text-slate-800'}`}>
                    {formatarData(tarefa.data_conclusao_prevista)}
                  </p>
                </div>
                {tarefa.cliente_nome && (
                  <div className="bg-white border rounded-xl p-3">
                    <p className="text-xs text-slate-400 mb-1 flex items-center gap-1"><User className="w-3 h-3" /> Cliente</p>
                    <p className="text-sm font-semibold text-slate-800">{tarefa.cliente_nome}</p>
                  </div>
                )}
                {(subsetor || tarefa.subsetor_nome) && (
                  <div className="bg-white border rounded-xl p-3">
                    <p className="text-xs text-slate-400 mb-1 flex items-center gap-1"><Tag className="w-3 h-3" /> Tipo</p>
                    <p className="text-sm font-semibold text-slate-800">{subsetor?.nome || tarefa.subsetor_nome}</p>
                  </div>
                )}
                {tarefa.setor_nome && (
                  <div className="bg-white border rounded-xl p-3">
                    <p className="text-xs text-slate-400 mb-1">Setor</p>
                    <p className="text-sm font-semibold text-slate-800">{tarefa.setor_nome}</p>
                  </div>
                )}
                {tarefa.senha_gov && (
                  <div className="bg-white border rounded-xl p-3">
                    <p className="text-xs text-slate-400 mb-1">Senha GOV</p>
                    <p className="text-sm font-semibold text-slate-800">{tarefa.senha_gov}</p>
                  </div>
                )}
              </div>

              {/* Descrição */}
              {tarefa.descricao && (
                <div className="bg-white border rounded-xl p-4">
                  <p className="text-xs text-slate-400 font-semibold uppercase tracking-wide mb-2">Descrição</p>
                  <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{tarefa.descricao}</p>
                </div>
              )}
            </div>
          )}

          {/* Colaboração Interna */}
          {aba === 'comentarios' && (
            <ColaboracaoInterna
              tarefa={tarefa}
              currentUser={currentUser}
              colaboradores={colaboradores}
              onUpdate={onUpdate}
            />
          )}

          {/* Checklist */}
          {aba === 'checklist' && (
            <div className="p-6 overflow-y-auto flex-1">
              <ChecklistAba
                checklist={checklistItems}
                empresaId={tarefa.empresa_id}
                onUpdate={atualizarChecklist}
              />
            </div>
          )}

          {/* Anexos */}
          {aba === 'anexos' && (
            <div className="p-6 overflow-y-auto flex-1">
              {anexos.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-slate-400">
                  <Paperclip className="w-12 h-12 opacity-20 mb-3" />
                  <p className="text-sm font-medium">Nenhum anexo encontrado</p>
                  <p className="text-xs mt-1">Arquivos enviados nos comentários aparecerão aqui</p>
                </div>
              ) : (
                <div className="grid gap-3">
                  {anexos.map((a, i) => {
                    const ext = a.nome.split('.').pop()?.toLowerCase() || '';
                    const isImg = ['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext);
                    return (
                      <div key={i} className="flex items-center gap-3 bg-white border border-slate-200 rounded-xl p-3 hover:border-blue-300 hover:shadow-sm transition-all group">
                        <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0">
                          {isImg
                            ? <img src={a.url} alt={a.nome} className="w-10 h-10 rounded-lg object-cover" onError={e => { e.target.style.display='none'; }} />
                            : <FileText className="w-5 h-5 text-slate-400" />
                          }
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-800 truncate">{a.nome}</p>
                          <p className="text-xs text-slate-400">
                            {a.usuario_nome} · {a.created_date ? format(new Date(a.created_date), 'dd/MM/yyyy HH:mm') : ''}
                          </p>
                        </div>
                        <a
                          href={a.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          download={a.nome}
                          className="p-2 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors opacity-0 group-hover:opacity-100"
                          title="Baixar"
                        >
                          <Download className="w-4 h-4" />
                        </a>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Histórico */}
          {aba === 'historico' && (
            <div className="p-6 overflow-y-auto flex-1 space-y-5">

              {/* Seção IA */}
              <div className="bg-gradient-to-br from-violet-50 to-blue-50 border border-violet-200 rounded-2xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-violet-600" />
                    <span className="text-sm font-semibold text-violet-800">Resumo Inteligente</span>
                    <span className="text-xs bg-violet-100 text-violet-600 px-2 py-0.5 rounded-full">IA</span>
                  </div>
                  <button
                    onClick={gerarHistoricoIA}
                    disabled={loadingIA}
                    className="flex items-center gap-1.5 text-xs text-violet-600 hover:text-violet-800 transition-colors disabled:opacity-50"
                  >
                    {loadingIA ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                    {loadingIA ? 'Analisando...' : 'Atualizar'}
                  </button>
                </div>

                {loadingIA && (
                  <div className="flex items-center gap-3 py-4 text-violet-500">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span className="text-sm">Analisando comentários com IA...</span>
                  </div>
                )}

                {erroIA && !loadingIA && (
                  <p className="text-sm text-red-500">{erroIA}</p>
                )}

                {!loadingIA && !erroIA && historicoIA !== null && historicoIA.length === 0 && (
                  <p className="text-sm text-slate-400 py-2">Nenhuma informação relevante encontrada nos comentários.</p>
                )}

                {!loadingIA && historicoIA && historicoIA.length > 0 && (
                  <div className="space-y-2">
                    {historicoIA.map((item, i) => {
                      const configs = {
                        solicitacao: { icon: MessageSquare, color: 'text-blue-600', bg: 'bg-blue-100', label: 'Solicitação' },
                        pendencia: { icon: AlertCircle, color: 'text-orange-600', bg: 'bg-orange-100', label: 'Pendência' },
                        prazo: { icon: Timer, color: 'text-red-600', bg: 'bg-red-100', label: 'Prazo' },
                        decisao: { icon: CheckCircle2, color: 'text-green-600', bg: 'bg-green-100', label: 'Decisão' },
                        atualizacao: { icon: Zap, color: 'text-violet-600', bg: 'bg-violet-100', label: 'Atualização' },
                        problema: { icon: AlertTriangle, color: 'text-red-600', bg: 'bg-red-100', label: 'Problema' },
                      };
                      const cfg = configs[item.tipo] || configs['atualizacao'];
                      const Icon = cfg.icon;
                      return (
                        <div key={i} className="flex items-start gap-3 bg-white/70 rounded-xl p-3">
                          <div className={`w-7 h-7 rounded-lg ${cfg.bg} flex items-center justify-center flex-shrink-0`}>
                            <Icon className={`w-3.5 h-3.5 ${cfg.color}`} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className={`text-xs font-semibold ${cfg.color}`}>{cfg.label}</span>
                              {item.data && <span className="text-xs text-slate-400">{item.data}</span>}
                              {item.autor && <span className="text-xs text-slate-400">· {item.autor}</span>}
                            </div>
                            <p className="text-sm text-slate-700 leading-snug">{item.descricao}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Histórico de movimentações */}
              {historico.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5" /> Movimentações
                  </p>
                  <div className="space-y-2">
                    {historico.map(h => (
                      <div key={h.id} className="flex gap-3 items-start">
                        <div className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                          <Clock className="w-3 h-3 text-slate-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-slate-700">{h.descricao}</p>
                          <p className="text-xs text-slate-400 mt-0.5">
                            {h.usuario_nome} · {h.created_date ? format(new Date(h.created_date), 'dd/MM/yyyy HH:mm') : ''}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}