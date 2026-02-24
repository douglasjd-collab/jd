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
import { Loader2, ShieldCheck, ShieldX } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';

const TODOS_MENUS = [
  { key: 'dashboard',             label: 'Dashboard',               descricao: 'Painel principal com resumos e indicadores' },
  { key: 'nova_venda',            label: 'Nova Venda',              descricao: 'Cadastrar novas vendas de consórcio/empréstimo' },
  { key: 'emprestimos',           label: 'Empréstimos',             descricao: 'Gerenciar propostas de empréstimos' },
  { key: 'consorcio',             label: 'Consórcio',               descricao: 'Propostas, planos e simulações de consórcio' },
  { key: 'funil_vendas',          label: 'Funil de Vendas',         descricao: 'Acompanhar oportunidades no funil' },
  { key: 'clientes',              label: 'Clientes',                descricao: 'Cadastro e gerenciamento de clientes' },
  { key: 'cartas_contempladas',   label: 'Cartas Contempladas',     descricao: 'Gestão de cartas contempladas' },
  { key: 'agenda',                label: 'Agenda',                  descricao: 'Compromissos e lembretes' },
  { key: 'bate_papo',             label: 'Bate-papo',               descricao: 'Chat via WhatsApp com clientes' },
  { key: 'financeiro',            label: 'Financeiro',              descricao: 'Dashboard financeiro e comissões' },
  { key: 'cadastros',             label: 'Cadastros',               descricao: 'Cadastros de empresas, bancos, administradoras, etc.' },
  { key: 'importacao',            label: 'Importação',              descricao: 'Importar arquivos de comissão e produção' },
  { key: 'saques',                label: 'Saques',                  descricao: 'Solicitação e gerenciamento de saques' },
  { key: 'relatorios',            label: 'Relatórios',              descricao: 'Relatórios de vendas e comissões' },
  { key: 'configuracoes',         label: 'Configurações',           descricao: 'Configurações gerais do sistema' },
  { key: 'configuracao_whatsapp', label: 'Configuração WhatsApp',   descricao: 'Configurar instância WhatsApp/Evolution' },
];

export default function GerenciarPermissoesModal({ open, onOpenChange, usuario, onSuccess }) {
  const [selecionados, setSelecionados] = useState([]);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (open && usuario) {
      // Se não tem permissões definidas, marca todos como permitidos
      if (!usuario.menus_permitidos || usuario.menus_permitidos.length === 0) {
        setSelecionados(TODOS_MENUS.map(m => m.key));
      } else {
        setSelecionados(usuario.menus_permitidos);
      }
    }
  }, [open, usuario]);

  const toggleMenu = (key) => {
    setSelecionados(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );
  };

  const marcarTodos = () => setSelecionados(TODOS_MENUS.map(m => m.key));
  const desmarcarTodos = () => setSelecionados([]);

  const handleSalvar = async () => {
    setSalvando(true);
    try {
      const todosPermitidos = selecionados.length === TODOS_MENUS.length;
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

  const totalBloqueados = TODOS_MENUS.length - selecionados.length;

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
                  {totalBloqueados} {totalBloqueados === 1 ? 'menu bloqueado' : 'menus bloqueados'}
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
            {TODOS_MENUS.map((menu) => {
              const permitido = selecionados.includes(menu.key);
              return (
                <label
                  key={menu.key}
                  htmlFor={`perm-${menu.key}`}
                  className={`flex items-start gap-3 px-4 py-3 cursor-pointer transition-colors ${
                    permitido ? 'bg-white hover:bg-slate-50' : 'bg-red-50 hover:bg-red-100'
                  }`}
                >
                  <Checkbox
                    id={`perm-${menu.key}`}
                    checked={permitido}
                    onCheckedChange={() => toggleMenu(menu.key)}
                    className="mt-0.5"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-medium ${permitido ? 'text-slate-900' : 'text-red-700'}`}>
                        {menu.label}
                      </span>
                      {!permitido && (
                        <Badge className="bg-red-100 text-red-600 border-0 text-xs px-1.5 py-0">
                          Bloqueado
                        </Badge>
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
            {selecionados.length} de {TODOS_MENUS.length} menus liberados
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