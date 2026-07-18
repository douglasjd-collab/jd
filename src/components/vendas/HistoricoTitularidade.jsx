import React from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatDateBR } from '@/components/utils/dateHelpers';

export default function HistoricoTitularidade({ venda, empresaId }) {
  const { data: historico = [], isLoading } = useQuery({
    queryKey: ['historico-titularidade', venda?.grupo, venda?.cota, venda?.administradora_id],
    enabled: !!venda?.grupo && !!venda?.cota && !!venda?.administradora_id,
    queryFn: async () => {
      // Buscar todas as transferências para a mesma administradora+grupo+cota
      const filter = {
        empresa_id: empresaId,
        administradora_id: venda.administradora_id,
        grupo: venda.grupo,
        cota: venda.cota,
      };
      const transfers = await base44.entities.TransferenciaCota.filter(filter, '-data_aprovacao');
      // Filtrar apenas aprovadas (e não estornadas)
      return transfers.filter((t) => t.situacao === 'aprovada' && !t.estornado);
    },
  });

  // Buscar propostas (origem/destino) para contexto
  const { data: propostasRelacionadas = [] } = useQuery({
    queryKey: ['propostas-relacionadas-titularidade', venda?.grupo, venda?.cota, venda?.administradora_id],
    enabled: !!venda?.grupo && !!venda?.cota && !!venda?.administradora_id,
    queryFn: async () => {
      const all = await base44.entities.Venda.filter({
        empresa_id: empresaId,
        administradora_id: venda.administradora_id,
        grupo: venda.grupo,
        cota: venda.cota,
      });
      return all;
    },
  });

  const formatarData = (d) => (d ? formatDateBR(d) : '-');

  // Montar histórico cronológico
  const linhas = [];
  if (historico.length > 0) {
    // Para cada transferência aprovada
    historico.forEach((t) => {
      const origem = propostasRelacionadas.find((p) => p.id === t.proposta_origem_id);
      const destino = propostasRelacionadas.find((p) => p.id === t.proposta_destino_id);
      linhas.push({
        id: t.id,
        titular_anterior_nome: t.cliente_origem_nome,
        titular_anterior_cpf: t.cliente_origem_cpf,
        data_inicio: origem?.titularidade_inicio || origem?.data_venda || t.data_solicitacao,
        data_encerramento: t.data_aprovacao,
        motivo_encerramento: t.motivo || 'Transferência de cota',
        titular_atual_nome: t.cliente_destino_nome,
        titular_atual_cpf: t.cliente_destino_cpf,
        proposta_origem_id: t.proposta_origem_id,
        proposta_destino_id: t.proposta_destino_id,
        solicitado_por_nome: t.solicitado_por_nome || t.aprovado_por_nome,
      });
    });
  }

  // A primeira linha do histórico (origem sem transferência aprovada) — só se a venda atual não tem origem
  const temHistoricoAnterior = propostasRelacionadas.some((p) => p.proposta_destino_id === venda.id);

  // Link para a proposta anterior/posterior
  const propostaAnterior = venda.proposta_origem_id ? propostasRelacionadas.find((p) => p.id === venda.proposta_origem_id) : null;
  const propostaPosterior = venda.proposta_destino_id ? propostasRelacionadas.find((p) => p.id === venda.proposta_destino_id) : null;

  if (isLoading) {
    return (
      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle>Histórico de titularidade</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (linhas.length === 0 && !propostaAnterior && !propostaPosterior) {
    return null;
  }

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader>
        <CardTitle>Histórico de titularidade</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Links cross-proposal */}
        <div className="flex flex-wrap gap-3">
          {propostaAnterior && (
            <Link
              to={`${createPageUrl('VendaDetalhes')}?id=${propostaAnterior.id}`}
              className="text-sm text-blue-600 hover:underline"
            >
              ↩ Ver titular anterior ({propostaAnterior.cliente_nome})
            </Link>
          )}
          {propostaPosterior && (
            <Link
              to={`${createPageUrl('VendaDetalhes')}?id=${propostaPosterior.id}`}
              className="text-sm text-blue-600 hover:underline"
            >
              ↪ Ver proposta do novo titular ({propostaPosterior.cliente_nome})
            </Link>
          )}
        </div>

        {linhas.length > 0 ? (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Titular anterior</TableHead>
                  <TableHead>CPF</TableHead>
                  <TableHead>Início</TableHead>
                  <TableHead>Encerramento</TableHead>
                  <TableHead>Motivo</TableHead>
                  <TableHead>Titular atual</TableHead>
                  <TableHead>Propostas</TableHead>
                  <TableHead>Solicitado por</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {linhas.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="font-medium">{l.titular_anterior_nome}</TableCell>
                    <TableCell>{l.titular_anterior_cpf}</TableCell>
                    <TableCell>{formatarData(l.data_inicio)}</TableCell>
                    <TableCell>{formatarData(l.data_encerramento)}</TableCell>
                    <TableCell className="text-sm text-slate-600">{l.motivo_encerramento}</TableCell>
                    <TableCell className="font-medium">{l.titular_atual_nome} ({l.titular_atual_cpf})</TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-0.5 text-xs">
                        <Link className="text-blue-600 hover:underline" to={`${createPageUrl('VendaDetalhes')}?id=${l.proposta_origem_id}`}>
                          Ver origem
                        </Link>
                        {l.proposta_destino_id && (
                          <Link className="text-blue-600 hover:underline" to={`${createPageUrl('VendaDetalhes')}?id=${l.proposta_destino_id}`}>
                            Ver destino
                          </Link>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">{l.solicitado_por_nome || '-'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <p className="text-sm text-slate-500">Sem titularidade registrada ainda para esta cota.</p>
        )}
      </CardContent>
    </Card>
  );
}