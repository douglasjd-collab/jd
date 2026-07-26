import React, { useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Plus, Search, Eye, Copy, Ban, Download, BarChart3, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

const STATUS_LIST = ['rascunho', 'agendada', 'executando', 'concluida', 'cancelada', 'pausada', 'erro'];

export default function CampanhasLista({ empresaId, user, onNova }) {
  const [search, setSearch] = useState('');
  const [filtroStatus, setFiltroStatus] = useState('todos');
  const [detalhe, setDetalhe] = useState(null);
  const [copiando, setCopiando] = useState(false);
  const queryClient = useQueryClient();

  const { data: campanhas = [], isLoading } = useQuery({
    queryKey: ['campanhas-lista', empresaId],
    queryFn: () => base44.entities.Campanha.filter({ empresa_id: empresaId }, '-created_date', 500),
    enabled: !!empresaId,
  });

  const filtradas = useMemo(() => {
    return (campanhas || []).filter((c) => {
      const matchSearch = !search || (c.nome || '').toLowerCase().includes(search.toLowerCase());
      const matchStatus = filtroStatus === 'todos' || c.status === filtroStatus;
      return matchSearch && matchStatus;
    });
  }, [campanhas, search, filtroStatus]);

  const duplicar = async (c) => {
    setCopiando(true);
    try {
      await base44.entities.Campanha.create({
        empresa_id: c.empresa_id,
        criador_id: user.id,
        criador_nome: user.full_name || user.email,
        nome: `${c.nome} (cópia)`,
        descricao: c.descricao,
        canal: c.canal || 'whatsapp_meta_oficial',
        template_id: c.template_id,
        template_nome: c.template_nome,
        template_category: c.template_category,
        template_language: c.template_language,
        template_components_json: c.template_components_json,
        template_variables_json: c.template_variables_json,
        status: 'rascunho',
        total_destinatarios: c.total_destinatarios || 0,
        velocidade_envio: c.velocidade_envio || 60,
        pausa_apos: c.pausa_apos || null,
        duracao_pausa_min: c.duracao_pausa_min || null,
        config_json: c.config_json,
      });
      toast.success('Campanha duplicada como rascunho');
      queryClient.invalidateQueries(['campanhas-lista', empresaId]);
      queryClient.invalidateQueries(['campanhas-dashboard', empresaId]);
    } catch (e) {
      toast.error('Erro ao duplicar: ' + (e.message || 'desconhecido'));
    } finally {
      setCopiando(false);
    }
  };

  const cancelar = async (c) => {
    if (!confirm(`Cancelar a campanha "${c.nome}"?`)) return;
    try {
      await base44.entities.Campanha.update(c.id, { status: 'cancelada' });
      toast.success('Campanha cancelada');
      queryClient.invalidateQueries(['campanhas-lista', empresaId]);
      queryClient.invalidateQueries(['campanhas-dashboard', empresaId]);
    } catch (e) {
      toast.error('Erro ao cancelar: ' + (e.message || 'desconhecido'));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Campanhas</h1>
          <p className="text-sm text-slate-500">Todas as campanhas de marketing da empresa</p>
        </div>
        <Button onClick={onNova} className="gap-1.5">
          <Plus className="w-4 h-4" /> Nova Campanha
        </Button>
      </div>

      <Card className="border border-slate-200 shadow-sm">
        <CardContent className="p-3 flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar campanha por nome…"
              className="pl-9"
            />
          </div>
          <select
            value={filtroStatus}
            onChange={(e) => setFiltroStatus(e.target.value)}
            className="border border-slate-200 rounded-md px-3 py-2 text-sm bg-white"
          >
            <option value="todos">Todos status</option>
            {STATUS_LIST.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </CardContent>
      </Card>

      <Card className="border border-slate-200 shadow-sm">
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <Th>Nome</Th>
                <Th>Criador</Th>
                <Th>Template</Th>
                <Th>Status</Th>
                <Th className="text-right">Total</Th>
                <Th className="text-right">Enviadas</Th>
                <Th className="text-right">Conversão</Th>
                <Th className="text-center">Ações</Th>
              </tr>
            </thead>
            <tbody>
              {filtradas.map((c) => {
                const conv = c.total_destinatarios > 0 ? (c.vendas_realizadas / c.total_destinatarios) * 100 : 0;
                return (
                  <tr key={c.id} className="border-t border-slate-100 hover:bg-slate-50">
                    <Td>
                      <p className="font-medium text-slate-800">{c.nome}</p>
                      <p className="text-xs text-slate-400">{format(new Date(c.created_date), 'dd/MM/yyyy HH:mm')}</p>
                    </Td>
                    <Td>{c.criador_nome || '-'}</Td>
                    <Td>{c.template_nome || '-'}</Td>
                    <Td><StatusBadge status={c.status} /></Td>
                    <Td className="text-right">{c.total_destinatarios || 0}</Td>
                    <Td className="text-right">{c.enviados || 0}</Td>
                    <Td className="text-right">{conv.toFixed(1)}%</Td>
                    <Td>
                      <div className="flex items-center justify-center gap-1">
                        <IconBtn title="Visualizar" onClick={() => setDetalhe(c)}><Eye className="w-4 h-4" /></IconBtn>
                        <IconBtn title="Duplicar" onClick={() => duplicar(c)} disabled={copiando}><Copy className="w-4 h-4" /></IconBtn>
                        <IconBtn title="Cancelar" onClick={() => cancelar(c)} disabled={c.status === 'cancelada' || c.status === 'concluida'}><Ban className="w-4 h-4" /></IconBtn>
                        <IconBtn title="Exportar" onClick={() => toast.info('Exportação em breve')}><Download className="w-4 h-4" /></IconBtn>
                        <IconBtn title="Relatório" onClick={() => toast.info('Relatórios em breve')}><BarChart3 className="w-4 h-4" /></IconBtn>
                      </div>
                    </Td>
                  </tr>
                );
              })}
              {filtradas.length === 0 && (
                <tr>
                  <td colSpan={8} className="text-center py-10 text-slate-400">
                    {isLoading ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : 'Nenhuma campanha found com esses filtros.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Dialog open={!!detalhe} onOpenChange={(o) => !o && setDetalhe(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{detalhe?.nome}</DialogTitle>
          </DialogHeader>
          {detalhe && (
            <div className="grid grid-cols-2 gap-3 text-sm">
              <Info label="Criador" value={detalhe.criador_nome} />
              <Info label="Status" value={<StatusBadge status={detalhe.status} />} />
              <Info label="Template" value={detalhe.template_nome} />
              <Info label="Canal" value={detalhe.canal} />
              <Info label="Total destinatários" value={detalhe.total_destinatarios} />
              <Info label="Enviadas" value={detalhe.enviados} />
              <Info label="Entregues" value={detalhe.entregues} />
              <Info label="Lidas" value={detalhe.lidos} />
              <Info label="Respondidas" value={detalhe.respondidos} />
              <Info label="Falhas" value={detalhe.falhas} />
              <Info label="Propostas" value={detalhe.propostas_geradas} />
              <Info label="Vendas" value={detalhe.vendas_realizadas} />
              <Info label="Valor vendido" value={(detalhe.valor_vendido || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} />
              <Info label="Comissão gerada" value={(detalhe.comissao_gerada || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} />
              <Info label="Agendada para" value={detalhe.agendada_para ? format(new Date(detalhe.agendada_para), 'dd/MM/yyyy HH:mm') : '-'} />
              <Info label="Início execução" value={detalhe.inicio_execucao ? format(new Date(detalhe.inicio_execucao), 'dd/MM/yyyy HH:mm') : '-'} />
              <Info label="Fim execução" value={detalhe.fim_execucao ? format(new Date(detalhe.fim_execucao), 'dd/MM/yyyy HH:mm') : '-'} />
              {detalhe.descricao && (
                <div className="col-span-2">
                  <p className="text-xs text-slate-500 mb-1">Descrição</p>
                  <p className="text-slate-700">{detalhe.descricao}</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Th({ children, className = '' }) {
  return <th className={`text-left font-medium px-3 py-2 ${className}`}>{children}</th>;
}
function Td({ children, className = '' }) {
  return <td className={`px-3 py-2 align-top ${className}`}>{children}</td>;
}
function Info({ label, value }) {
  return (
    <div>
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-slate-700 font-medium">{value ?? '-'}</p>
    </div>
  );
}
function IconBtn({ children, ...props }) {
  return (
    <Button variant="ghost" size="icon" className="h-8 w-8" {...props}>
      {children}
    </Button>
  );
}
function StatusBadge({ status }) {
  const map = {
    rascunho: 'bg-slate-100 text-slate-600',
    agendada: 'bg-blue-100 text-blue-700',
    executando: 'bg-amber-100 text-amber-700',
    concluida: 'bg-emerald-100 text-emerald-700',
    cancelada: 'bg-rose-100 text-rose-700',
    pausada: 'bg-orange-100 text-orange-700',
    erro: 'bg-red-100 text-red-700',
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${map[status] || 'bg-slate-100 text-slate-600'}`}>
      {status}
    </span>
  );
}