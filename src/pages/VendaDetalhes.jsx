import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import PageHeader from '@/components/ui/PageHeader';
import StatusBadge from '@/components/ui/StatusBadge';
import ImportarComissaoVenda from '@/components/importacao/ImportarComissaoVenda';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { 
  User, 
  Building2, 
  Calendar, 
  Hash, 
  Wallet,
  CheckCircle,
  AlertCircle,
  Phone,
  Mail,
  MapPin,
  CreditCard,
  Cake
} from 'lucide-react';
import { format } from 'date-fns';
import { formatDateBR } from '@/components/utils/dateHelpers';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import HistoricoTitularidade from '@/components/vendas/HistoricoTitularidade';

export default function VendaDetalhes() {
  const urlParams = new URLSearchParams(window.location.search);
  const vendaId = urlParams.get('id');
  const queryClient = useQueryClient();

  const { data: venda, isLoading: loadingVenda } = useQuery({
    queryKey: ['venda', vendaId],
    queryFn: async () => {
      const vendas = await base44.entities.Venda.filter({ id: vendaId });
      return vendas[0];
    },
    enabled: !!vendaId
  });

  // Buscar dados completos do cliente
  const { data: cliente } = useQuery({
    queryKey: ['cliente-detalhes', venda?.cliente_id],
    queryFn: async () => {
      if (!venda?.cliente_id) return null;
      const clientes = await base44.entities.Cliente.filter({ id: venda.cliente_id });
      return clientes[0];
    },
    enabled: !!venda?.cliente_id
  });

  const { data: parcelas = [], isLoading: loadingParcelas } = useQuery({
    queryKey: ['parcelas', vendaId],
    queryFn: () => base44.entities.Parcela.filter({ venda_id: vendaId }),
    enabled: !!vendaId
  });

  const { data: recebimentos = [] } = useQuery({
    queryKey: ['recebimentos-comissao', vendaId],
    queryFn: () => base44.entities.RecebimentoComissao.filter({ venda_id: vendaId }),
    enabled: !!vendaId
  });

  const { data: comissoes = [] } = useQuery({
    queryKey: ['comissoes', vendaId],
    queryFn: () => base44.entities.Comissao.filter({ venda_id: vendaId }),
    enabled: !!vendaId
  });

  const { data: historicoLances = [] } = useQuery({
    queryKey: ['historico-lances', vendaId],
    queryFn: () => base44.entities.OfertaLance.filter({ venda_id: vendaId }),
    enabled: !!vendaId
  });

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value || 0);
  };

  if (loadingVenda || !venda) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#1e3a5f]"></div>
      </div>
    );
  }

  const parcelasRecebidas = recebimentos.length;
  const totalParcelas = parcelas.length;
  const valorRecebido = recebimentos.reduce((acc, r) => acc + (r.valor_recebido || 0), 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Venda - ${venda.grupo}/${venda.cota}`}
        subtitle={venda.cliente_nome}
        backTo="Vendas"
      />

      {/* Status Card */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <Card className="border-0 shadow-sm">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-xl bg-blue-50">
                <Wallet className="w-6 h-6 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-slate-500">Valor da Carta</p>
                <p className="text-xl font-bold">{formatCurrency(venda.valorCredito)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-xl bg-emerald-50">
                <CheckCircle className="w-6 h-6 text-emerald-600" />
              </div>
              <div>
                <p className="text-sm text-slate-500">Comissão Recebida</p>
                <p className="text-xl font-bold">{formatCurrency(valorRecebido)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-xl bg-amber-50">
                <AlertCircle className="w-6 h-6 text-amber-600" />
              </div>
              <div>
                <p className="text-sm text-slate-500">Comissão Prevista</p>
                <p className="text-xl font-bold">{formatCurrency(venda.comissao_total_prevista)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-xl bg-purple-50">
                <Hash className="w-6 h-6 text-purple-600" />
              </div>
              <div>
                <p className="text-sm text-slate-500">Parcelas</p>
                <p className="text-xl font-bold">{parcelasRecebidas}/{totalParcelas}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Dados do Cliente */}
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle>Dados do Cliente</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
              <User className="w-5 h-5 text-slate-400" />
              <div className="flex-1">
                <p className="text-sm text-slate-500">Nome Completo</p>
                <p className="font-medium">{venda.cliente_nome}</p>
              </div>
            </div>

            <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
              <CreditCard className="w-5 h-5 text-slate-400" />
              <div className="flex-1">
                <p className="text-sm text-slate-500">CPF</p>
                <p className="font-medium">{venda.cliente_cpf}</p>
              </div>
            </div>

            {cliente?.data_nascimento && (
              <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
                <Cake className="w-5 h-5 text-slate-400" />
                <div className="flex-1">
                  <p className="text-sm text-slate-500">Data de Nascimento</p>
                  <p className="font-medium">{formatDateBR(cliente.data_nascimento)}</p>
                </div>
              </div>
            )}

            {cliente?.celular && (
              <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
                <Phone className="w-5 h-5 text-slate-400" />
                <div className="flex-1">
                  <p className="text-sm text-slate-500">Celular</p>
                  <p className="font-medium">{cliente.celular}</p>
                </div>
              </div>
            )}

            {cliente?.telefone_fixo && (
              <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
                <Phone className="w-5 h-5 text-slate-400" />
                <div className="flex-1">
                  <p className="text-sm text-slate-500">Telefone Fixo</p>
                  <p className="font-medium">{cliente.telefone_fixo}</p>
                </div>
              </div>
            )}

            {cliente?.email && (
              <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
                <Mail className="w-5 h-5 text-slate-400" />
                <div className="flex-1">
                  <p className="text-sm text-slate-500">E-mail</p>
                  <p className="font-medium">{cliente.email}</p>
                </div>
              </div>
            )}

            {(cliente?.res_endereco || cliente?.res_cidade) && (
              <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-xl">
                <MapPin className="w-5 h-5 text-slate-400 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm text-slate-500">Endereço Residencial</p>
                  <p className="font-medium">
                    {cliente.res_tipo_logradouro && `${cliente.res_tipo_logradouro} `}
                    {cliente.res_endereco && `${cliente.res_endereco}`}
                    {cliente.res_numero && `, ${cliente.res_numero}`}
                    {cliente.res_complemento && ` - ${cliente.res_complemento}`}
                  </p>
                  {(cliente.res_bairro || cliente.res_cidade || cliente.res_uf) && (
                    <p className="text-sm text-slate-600 mt-1">
                      {cliente.res_bairro && `${cliente.res_bairro}, `}
                      {cliente.res_cidade && `${cliente.res_cidade}`}
                      {cliente.res_uf && ` - ${cliente.res_uf}`}
                      {cliente.res_cep && ` | CEP: ${cliente.res_cep}`}
                    </p>
                  )}
                </div>
              </div>
            )}

            {(cliente?.com_endereco || cliente?.com_cidade) && (
              <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-xl">
                <MapPin className="w-5 h-5 text-slate-400 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm text-slate-500">Endereço Comercial</p>
                  <p className="font-medium">
                    {cliente.com_tipo_logradouro && `${cliente.com_tipo_logradouro} `}
                    {cliente.com_endereco && `${cliente.com_endereco}`}
                    {cliente.com_numero && `, ${cliente.com_numero}`}
                    {cliente.com_complemento && ` - ${cliente.com_complemento}`}
                  </p>
                  {(cliente.com_bairro || cliente.com_cidade || cliente.com_uf) && (
                    <p className="text-sm text-slate-600 mt-1">
                      {cliente.com_bairro && `${cliente.com_bairro}, `}
                      {cliente.com_cidade && `${cliente.com_cidade}`}
                      {cliente.com_uf && ` - ${cliente.com_uf}`}
                      {cliente.com_cep && ` | CEP: ${cliente.com_cep}`}
                    </p>
                  )}
                </div>
              </div>
            )}

            {cliente?.renda && (
              <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
                <Wallet className="w-5 h-5 text-slate-400" />
                <div className="flex-1">
                  <p className="text-sm text-slate-500">Renda</p>
                  <p className="font-medium">{formatCurrency(cliente.renda)}</p>
                </div>
              </div>
            )}

            {cliente?.profissao && (
              <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
                <Building2 className="w-5 h-5 text-slate-400" />
                <div className="flex-1">
                  <p className="text-sm text-slate-500">Profissão</p>
                  <p className="font-medium">{cliente.profissao}</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Informações da Venda */}
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle>Informações da Venda</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
              <Building2 className="w-5 h-5 text-slate-400" />
              <div>
                <p className="text-sm text-slate-500">Administradora</p>
                <p className="font-medium">{venda.administradora_nome}</p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="flex items-start gap-2 p-3 bg-slate-50 rounded-xl">
                <Hash className="w-5 h-5 text-slate-400 mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-slate-500">Grupo</p>
                  <p className="font-medium truncate">{venda.grupo || '-'}</p>
                </div>
              </div>

              <div className="flex items-start gap-2 p-3 bg-slate-50 rounded-xl">
                <Hash className="w-5 h-5 text-slate-400 mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-slate-500">Cota</p>
                  <p className="font-medium truncate">{venda.cota || '-'}</p>
                </div>
              </div>

              <div className="flex items-start gap-2 p-3 bg-slate-50 rounded-xl">
                <Hash className="w-5 h-5 text-slate-400 mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-slate-500">Contrato</p>
                  <p className="font-medium truncate">{venda.contrato || '-'}</p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
              <Wallet className="w-5 h-5 text-slate-400" />
              <div>
                <p className="text-sm text-slate-500">Valor do Crédito</p>
                <p className="font-medium">{formatCurrency(venda.valorCredito)}</p>
              </div>
            </div>

            <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
              <Hash className="w-5 h-5 text-slate-400" />
              <div>
                <p className="text-sm text-slate-500">Prazo</p>
                <p className="font-medium">{venda.prazo} meses</p>
              </div>
            </div>

            <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
              <Hash className="w-5 h-5 text-slate-400" />
              <div>
                <p className="text-sm text-slate-500">Taxa de Administração</p>
                <p className="font-medium">{venda.taxaAdministracao}%</p>
              </div>
            </div>

            <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
              <Calendar className="w-5 h-5 text-slate-400" />
              <div>
                <p className="text-sm text-slate-500">Data da Venda</p>
                <p className="font-medium">{format(new Date(venda.data_venda + 'T12:00:00'), 'dd/MM/yyyy')}</p>
              </div>
            </div>

            <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
              <User className="w-5 h-5 text-slate-400" />
              <div>
                <p className="text-sm text-slate-500">Vendedor / Gerente</p>
                <p className="font-medium">{venda.vendedor_nome || '-'}</p>
                <p className="text-sm text-slate-500">{venda.gerente_nome || '-'}</p>
              </div>
            </div>

            <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
              <span className="text-slate-500">Status</span>
              <StatusBadge status={venda.status} />
            </div>
          </CardContent>
        </Card>

        {/* Parcelas de Comissão Recebidas */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Parcelas de Comissão</CardTitle>
            <ImportarComissaoVenda 
              venda={venda}
              onSuccess={() => queryClient.invalidateQueries({ queryKey: ['recebimentos-comissao', vendaId] })}
            />
          </CardHeader>
          <CardContent>
            {recebimentos.length > 0 ? (
              <div className="max-h-96 overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Parcela</TableHead>
                      <TableHead>Data Recebimento</TableHead>
                      <TableHead>Valor Recebido</TableHead>
                      <TableHead>Status Pagamento</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recebimentos.sort((a, b) => {
                      const dateA = a.data_recebimento ? new Date(a.data_recebimento) : new Date(0);
                      const dateB = b.data_recebimento ? new Date(b.data_recebimento) : new Date(0);
                      return dateB - dateA;
                    }).map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium">
                          {r.parcela_informada || '-'}
                        </TableCell>
                        <TableCell>
                          {formatDateBR(r.data_recebimento)}
                        </TableCell>
                        <TableCell className="font-semibold text-green-600">
                          {formatCurrency(r.valor_recebido)}
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={r.status_pagamento} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <p className="text-center text-slate-500 py-8">Nenhuma parcela cadastrada</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Comissões */}
      {comissoes.length > 0 && (
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle>Comissões</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Usuário</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {comissoes.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{c.usuario_nome}</p>
                        <p className="text-sm text-slate-500">{c.usuario_perfil}</p>
                      </div>
                    </TableCell>
                    <TableCell><StatusBadge status={c.tipo} /></TableCell>
                    <TableCell className="font-medium">{formatCurrency(c.valor)}</TableCell>
                    <TableCell><StatusBadge status={c.status} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Alerta de transferência */}
      {venda.status === 'transferida' && (
        <div className="rounded-xl border bg-blue-50 p-4 text-sm text-blue-800 flex flex-col gap-1">
          <p className="font-medium">Cota transferida para {venda.transferencia_cliente_destino_nome || 'novo titular'}</p>
          {venda.transferencia_data && (
            <p>em {format(new Date(venda.transferencia_data), 'dd/MM/yyyy')}</p>
          )}
          {venda.proposta_destino_id && (
            <Link to={`${createPageUrl('VendaDetalhes')}?id=${venda.proposta_destino_id}`} className="text-blue-600 hover:underline mt-1">
              ↪ Ver proposta do novo titular
            </Link>
          )}
        </div>
      )}
      {venda.status === 'transferencia_andamento' && (
        <div className="rounded-xl border bg-orange-50 p-4 text-sm text-orange-800">
          Transferência em andamento — aguardando aprovação. A cota permanece ativa apenas para o cliente atual.
        </div>
      )}
      {venda.status === 'transferencia_reprovada' && (
        <div className="rounded-xl border bg-red-50 p-4 text-sm text-red-800">
          Transferência reprovada. A cota mantém-se vinculada ao cliente atual.
        </div>
      )}
      {venda.proposta_origem_id && (
        <div className="rounded-xl border bg-slate-50 p-4 text-sm text-slate-700">
          Esta proposta foi originada por transferência de titularidade.
          <Link to={`${createPageUrl('VendaDetalhes')}?id=${venda.proposta_origem_id}`} className="text-blue-600 hover:underline ml-1">
            ↩ Ver titular anterior
          </Link>
        </div>
      )}

      {/* Histórico de Lances */}
      <HistoricoTitularidade venda={venda} empresaId={venda.empresa_id} />

      {/* Histórico de Lances */}
      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle>Histórico de Lances</CardTitle>
        </CardHeader>
        <CardContent>
          {historicoLances.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Competência</TableHead>
                  <TableHead>Percentual</TableHead>
                  <TableHead>Valor Lance</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead>Usuário</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {historicoLances.sort((a, b) => new Date(b.data_oferta) - new Date(a.data_oferta)).map((lance) => (
                  <TableRow key={lance.id}>
                    <TableCell className="font-medium">{lance.competencia}</TableCell>
                    <TableCell>{lance.percentual_lance}%</TableCell>
                    <TableCell>{formatCurrency(lance.valor_lance)}</TableCell>
                    <TableCell className="capitalize">{lance.tipo_lance?.replace('_', ' ')}</TableCell>
                    <TableCell>{format(new Date(lance.data_oferta), 'dd/MM/yyyy HH:mm')}</TableCell>
                    <TableCell>{lance.usuario_nome}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-center text-slate-500 py-8">Nenhum lance ofertado ainda</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}