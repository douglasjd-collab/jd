import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Loader2, ShieldCheck, ShieldX, ChevronDown } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

// Estrutura de menus/submenus — espelha o Layout
const MENU_ESTRUTURA = [
  { key: 'dashboard',    label: 'Dashboard',    descricao: 'Painel principal com resumos e indicadores' },
  { key: 'bate_papo',   label: 'Bate - Papo',  descricao: 'Chat via WhatsApp/Instagram com clientes' },
  { key: 'funil_vendas', label: 'Funil de Vendas', descricao: 'Acompanhar oportunidades no funil' },
  { key: 'call_center',  label: 'Call Center',  descricao: 'Central de chamadas e ramal SIP' },
  {
    key: 'emprestimos',
    label: 'Empréstimos',
    descricao: 'Gerenciar propostas de empréstimos',
    submenu: [
      { key: 'emprestimos:NovaVendaConsignado', label: 'Nova Venda' },
      { key: 'emprestimos:VendasEmprestimos',    label: 'Propostas' },
      { key: 'emprestimos:PropostasSemVendedor', label: 'Propostas sem Vendedor' },
    ],
  },
  {
    key: 'consorcio',
    label: 'Consórcio',
    descricao: 'Propostas, planos e simulações de consórcio',
    submenu: [
      { key: 'consorcio:NovaVenda',                    label: '+ Nova Venda' },
      { key: 'consorcio:Vendas',                       label: 'Propostas' },
      { key: 'consorcio:PlanosCanopus',                label: 'Planos Canopus' },
      { key: 'consorcio:SimuladorEscolha',             label: 'Simulador' },
      { key: 'consorcio:SimuladorInteligente',         label: 'Simulador Inteligente' },
      { key: 'consorcio:HistoricoResultadoAssembleia', label: 'Resultado de Assembleia' },
      { key: 'consorcio:OfertaLance',                  label: 'Oferta de Lance' },
      { key: 'consorcio:CartasContempladas',           label: 'Cartas Contempladas' },
    ],
  },
  {
    key: 'seguros',
    label: 'Seguros',
    descricao: 'Propostas e renovações de seguros',
    submenu: [
      { key: 'seguros:DashboardSeguros',    label: 'Dashboard' },
      { key: 'seguros:Seguros',             label: 'Propostas' },
      { key: 'seguros:RenovacoesSeguro',    label: 'Renovações' },
      { key: 'seguros:CobrancaSeguro',      label: 'Cobrança' },
      { key: 'seguros:ConfiguracaoSeguros', label: 'Configurações' },
    ],
  },
  { key: 'financiamento_veiculos', label: 'Financiamento de Veículos', descricao: 'Propostas de financiamento de veículos' },
  { key: 'tarefas',      label: 'Tarefas',          descricao: 'Gerenciamento de tarefas e atividades' },
  { key: 'clientes',     label: 'Clientes',         descricao: 'Cadastro e gerenciamento de clientes' },
  { key: 'agenda',       label: 'Agenda',           descricao: 'Compromissos e lembretes' },
  { key: 'contatos_crm', label: 'Contatos CRM',     descricao: 'Contatos e leads do CRM' },
  { key: 'campanhas',    label: 'Campanhas',        descricao: 'Campanhas de marketing e mensagens em massa' },
  { key: 'saques',       label: 'Minhas Comissões', descricao: 'Solicitação e gerenciamento de saques' },
  { key: 'relatorios',   label: 'Relatórios',       descricao: 'Relatórios de vendas e comissões' },
  { key: 'finanto_bank', label: 'FinantoBank INSS', descricao: 'Integração com FinantoBank para propostas INSS' },
  {
    key: 'importacao',
    label: 'Importação',
    descricao: 'Importação de propostas, comissões e planilhas',
    submenu: [
      { key: 'importacao:ImportacaoProducao',            label: 'IMP. Propostas Empréstimo' },
      { key: 'importacao:ImportacaoComissao',             label: 'IMP. Comissão Consórcio' },
      { key: 'importacao:ImportacaoComissaoEmprestimo',   label: 'IMP. Comissão Empréstimo' },
      { key: 'importacao:ImportacaoPlanos',               label: 'Importar Planos' },
      { key: 'importacao:ImportarResultadoAssembleia',    label: 'Importar Resultado Assembleia' },
      { key: 'importacao:Importacao',                     label: 'Histórico Geral' },
    ],
  },
  { key: 'configuracoes', label: 'Configurações',      descricao: 'Configurações do sistema e WhatsApp' },
  {
    key: 'financeiro',
    label: 'Financeiro',
    descricao: 'Gestão financeira, contas e comissões',
    submenu: [
      { key: 'financeiro:RelatoriosFinanceiros',  label: 'Dashboard Financeiro' },
      { key: 'financeiro:ContasBancarias',         label: 'Contas Bancárias' },
      { key: 'financeiro:Transacoes',              label: 'Movimentações Financeiras' },
      { key: 'financeiro:ReceberComissao',         label: 'Receber Comissão' },
      { key: 'financeiro:ComissoesPagar',          label: 'Comissões a Pagar (Consórcio)' },
      { key: 'financeiro:ComissoesEmprestimos',    label: 'Comissões a Pagar (Empréstimos)' },
      { key: 'financeiro:Adiantamentos',           label: 'Adiantamentos' },
      { key: 'financeiro:ComissoesPagas',          label: 'Comissões Pagas (Consórcio)' },
    ],
  },
  {
    key: 'cadastros',
    label: 'Cadastros',
    descricao: 'Cadastros e tabelas auxiliares do sistema',
    submenu: [
      { key: 'cadastros:Empresas',                    label: 'Empresas' },
      { key: 'cadastros:Filiais',                     label: 'Filiais' },
      { key: 'cadastros:CentrosCusto',                label: 'Centros de Custo' },
      { key: 'cadastros:Convenios',                   label: 'Convênios' },
      { key: 'cadastros:Bancos',                      label: 'Bancos' },
      { key: 'cadastros:Administradoras',             label: 'Administradoras' },
      { key: 'cadastros:EmpresasParceiras',           label: 'Empresas Parceiras' },
      { key: 'cadastros:StatusPropostas',             label: 'Status de Propostas' },
      { key: 'cadastros:TabelasEmprestimo',           label: 'Tabela de Comissão Empresa' },
      { key: 'cadastros:TabelasConsorcio',            label: 'Tabelas de Consórcio' },
      { key: 'cadastros:PlanosConsorcio',             label: 'Planos de Consórcio' },
      { key: 'cadastros:TiposEmprestimo',             label: 'Tipos de Empréstimo' },
      { key: 'cadastros:TabelasComissaoEmprestimo',   label: 'Comissão Empresa (Empréstimos)' },
      { key: 'cadastros:TabelasComissaoVendedor',     label: 'Comissão Vendedor (Níveis)' },
      { key: 'cadastros:ImportarPlanosPrint',         label: 'Importar Planos (Print)' },
    ],
  },
];

// Todas as chaves "folha" (menus simples + submenus)
function todasAsChaves() {
  const chaves = [];
  MENU_ESTRUTURA.forEach(m => {
    if (m.submenu) {
      m.submenu.forEach(s => chaves.push(s.key));
    } else {
      chaves.push(m.key);
    }
  });
  return chaves;
}

// Chaves dos submenus de um menu pai
function chavesDoMenu(menu) {
  if (menu.submenu) return menu.submenu.map(s => s.key);
  return [menu.key];
}

export default function GerenciarPermissoesModal({ open, onOpenChange, usuario, onSuccess }) {
  const [selecionados, setSelecionados] = useState([]);
  const [salvando, setSalvando] = useState(false);
  const [expandidos, setExpandidos] = useState({});

  const TODAS_CHAVES = todasAsChaves();

  useEffect(() => {
    if (open && usuario) {
      if (!usuario.menus_permitidos || usuario.menus_permitidos.length === 0) {
        setSelecionados(TODAS_CHAVES);
      } else {
        // Compatibilidade: se veio chave antiga sem submenu (ex: 'emprestimos'),
        // expandir para todas as sub-chaves desse menu
        const expandidas = [];
        usuario.menus_permitidos.forEach(k => {
          const menuPai = MENU_ESTRUTURA.find(m => m.key === k && m.submenu);
          if (menuPai) {
            menuPai.submenu.forEach(s => expandidas.push(s.key));
          } else {
            expandidas.push(k);
          }
        });
        setSelecionados(expandidas);
      }
      setExpandidos({});
    }
  }, [open, usuario]);

  const toggleItem = (key) => {
    setSelecionados(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );
  };

  const toggleMenuInteiro = (menu) => {
    const chaves = chavesDoMenu(menu);
    const todasMarcadas = chaves.every(k => selecionados.includes(k));
    if (todasMarcadas) {
      setSelecionados(prev => prev.filter(k => !chaves.includes(k)));
    } else {
      setSelecionados(prev => [...new Set([...prev, ...chaves])]);
    }
  };

  const estadoMenu = (menu) => {
    const chaves = chavesDoMenu(menu);
    const qtd = chaves.filter(k => selecionados.includes(k)).length;
    if (qtd === 0) return 'nenhum';
    if (qtd === chaves.length) return 'todos';
    return 'parcial';
  };

  const marcarTodos = () => setSelecionados(TODAS_CHAVES);
  const desmarcarTodos = () => setSelecionados([]);

  const toggleExpandido = (key) => {
    setExpandidos(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSalvar = async () => {
    setSalvando(true);
    try {
      const todosPermitidos = selecionados.length === TODAS_CHAVES.length;
      await base44.entities.Colaborador.update(usuario.id, {
        menus_permitidos: todosPermitidos ? [] : selecionados,
      });
      toast.success('Permissões atualizadas com sucesso!');
      onSuccess?.();
      onOpenChange(false);
    } catch (err) {
      console.error(err);
      toast.error('Erro ao salvar permissões');
    } finally {
      setSalvando(false);
    }
  };

  const totalBloqueados = TODAS_CHAVES.length - selecionados.length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-[#23BE84]" />
            Permissões de Menu
          </DialogTitle>
          {usuario && (
            <div className="mt-1">
              <p className="text-sm text-slate-600">
                <span className="font-medium">{usuario.nome}</span>
                {' · '}
                <span className="capitalize text-slate-500">{usuario.perfil}</span>
              </p>
              {totalBloqueados > 0 && (
                <Badge className="mt-1 bg-red-100 text-red-700 border-0">
                  {totalBloqueados} {totalBloqueados === 1 ? 'item bloqueado' : 'itens bloqueados'}
                </Badge>
              )}
            </div>
          )}
        </DialogHeader>

        <div className="flex-1 overflow-y-auto py-2 space-y-1 px-1">
          <div className="flex gap-2 mb-3">
            <Button variant="outline" size="sm" onClick={marcarTodos} className="text-xs">
              <ShieldCheck className="w-3.5 h-3.5 mr-1 text-green-600" />
              Liberar todos
            </Button>
            <Button variant="outline" size="sm" onClick={desmarcarTodos} className="text-xs">
              <ShieldX className="w-3.5 h-3.5 mr-1 text-red-500" />
              Bloquear todos
            </Button>
          </div>

          <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg overflow-hidden">
            {MENU_ESTRUTURA.map((menu) => {
              if (menu.submenu) {
                const estado = estadoMenu(menu);
                const aberto = expandidos[menu.key];
                return (
                  <div key={menu.key}>
                    {/* Linha do menu pai */}
                    <div className={cn(
                      "flex items-center gap-3 px-4 py-3 transition-colors",
                      estado === 'nenhum' ? 'bg-red-50' : 'bg-white'
                    )}>
                      <Checkbox
                        checked={estado === 'todos'}
                        // indeterminate visual via data attribute
                        data-state={estado === 'parcial' ? 'indeterminate' : undefined}
                        onCheckedChange={() => toggleMenuInteiro(menu)}
                        className={cn("mt-0.5", estado === 'parcial' && "opacity-70")}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={cn(
                            "text-sm font-semibold",
                            estado === 'nenhum' ? 'text-red-700' : 'text-slate-900'
                          )}>
                            {menu.label}
                          </span>
                          {estado === 'nenhum' && (
                            <Badge className="bg-red-100 text-red-600 border-0 text-xs px-1.5 py-0">Bloqueado</Badge>
                          )}
                          {estado === 'parcial' && (
                            <Badge className="bg-amber-100 text-amber-700 border-0 text-xs px-1.5 py-0">Parcial</Badge>
                          )}
                        </div>
                        <p className="text-xs text-slate-400 mt-0.5">{menu.descricao}</p>
                      </div>
                      <button
                        onClick={() => toggleExpandido(menu.key)}
                        className="p-1 rounded hover:bg-slate-100 transition-colors"
                      >
                        <ChevronDown className={cn("w-4 h-4 text-slate-400 transition-transform", aberto && "rotate-180")} />
                      </button>
                    </div>

                    {/* Submenus */}
                    {aberto && (
                      <div className="bg-slate-50 border-t border-slate-100">
                        {menu.submenu.map((sub) => {
                          const permitido = selecionados.includes(sub.key);
                          return (
                            <label
                              key={sub.key}
                              htmlFor={`perm-${sub.key}`}
                              className={cn(
                                "flex items-center gap-3 pl-10 pr-4 py-2.5 cursor-pointer transition-colors border-b border-slate-100 last:border-0",
                                permitido ? 'hover:bg-slate-100' : 'bg-red-50 hover:bg-red-100'
                              )}
                            >
                              <Checkbox
                                id={`perm-${sub.key}`}
                                checked={permitido}
                                onCheckedChange={() => toggleItem(sub.key)}
                              />
                              <span className={cn(
                                "text-sm",
                                permitido ? 'text-slate-700' : 'text-red-600'
                              )}>
                                {sub.label}
                              </span>
                              {!permitido && (
                                <Badge className="ml-auto bg-red-100 text-red-600 border-0 text-xs px-1.5 py-0">Bloqueado</Badge>
                              )}
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              }

              // Menu simples (sem submenu)
              const permitido = selecionados.includes(menu.key);
              return (
                <label
                  key={menu.key}
                  htmlFor={`perm-${menu.key}`}
                  className={cn(
                    "flex items-start gap-3 px-4 py-3 cursor-pointer transition-colors",
                    permitido ? 'bg-white hover:bg-slate-50' : 'bg-red-50 hover:bg-red-100'
                  )}
                >
                  <Checkbox
                    id={`perm-${menu.key}`}
                    checked={permitido}
                    onCheckedChange={() => toggleItem(menu.key)}
                    className="mt-0.5"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={cn("text-sm font-medium", permitido ? 'text-slate-900' : 'text-red-700')}>
                        {menu.label}
                      </span>
                      {!permitido && (
                        <Badge className="bg-red-100 text-red-600 border-0 text-xs px-1.5 py-0">Bloqueado</Badge>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">{menu.descricao}</p>
                  </div>
                </label>
              );
            })}
          </div>
        </div>

        <div className="flex justify-between items-center pt-4 border-t flex-shrink-0">
          <p className="text-xs text-slate-500">
            {selecionados.length} de {TODAS_CHAVES.length} itens liberados
          </p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={salvando}>
              Cancelar
            </Button>
            <Button
              onClick={handleSalvar}
              disabled={salvando}
              className="bg-[#10353C] hover:bg-[#1a5060]"
            >
              {salvando ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Salvar Permissões
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}