import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, User, Building2, Calendar, DollarSign, FileText, Percent, ArrowLeft, Phone, CreditCard, Key, Shield } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { format } from 'date-fns';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import TermoAutorizacaoTab from '@/components/emprestimos/TermoAutorizacaoTab';

const fmt = (v) => v != null ? (v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '-';
const fmtDate = (d) => d ? format(new Date(d + 'T12:00:00'), 'dd/MM/yyyy') : '-';

function InfoItem({ label, value, highlight, always }) {
  if (!always && !value && value !== 0) return null;
  return (
    <div>
      <span className="text-xs text-slate-500 font-medium uppercase tracking-wide">{label}</span>
      <p className={`font-semibold mt-0.5 ${highlight ? 'text-green-700 text-lg' : 'text-slate-800'}`}>{value || '-'}</p>
    </div>
  );
}

export default function PropostaEmprestimoDetalhes() {
  const navigate = useNavigate();
  const urlParams = new URLSearchParams(window.location.search);
  const propostaId = urlParams.get('id');
  const [user, setUser] = useState(null);

  useEffect(() => { loadUser(); }, []);

  const loadUser = async () => {
    const me = await base44.auth.me();
    if (me.role === 'super_admin') { setUser({ ...me, perfil: 'super_admin', empresa_id: null }); return; }
    const colabs = await base44.entities.Colaborador.filter({ user_id: me.id, status: 'ativo' });
    if (colabs.length > 0) {
      const c = colabs[0];
      setUser({ ...me, perfil: c.perfil, empresa_id: c.empresa_id, colaborador_id: c.id });
    }
  };

  const { data: proposta, isLoading } = useQuery({
    queryKey: ['proposta-emp-detalhes', propostaId],
    enabled: !!propostaId,
    queryFn: () => base44.entities.Proposta.filter({ id: propostaId }).then(r => r[0] || null),
  });

  const { data: cliente } = useQuery({
    queryKey: ['cliente-proposta', proposta?.cliente_id],
    enabled: !!proposta?.cliente_id,
    queryFn: () => base44.entities.Cliente.filter({ id: proposta.cliente_id }).then(r => r[0] || null),
  });

  const { data: empresa } = useQuery({
    queryKey: ['empresa-proposta', proposta?.empresa_id],
    enabled: !!proposta?.empresa_id,
    queryFn: () => base44.entities.Empresa.filter({ id: proposta.empresa_id }).then(r => r[0] || null),
  });

  const { data: statusList = [] } = useQuery({
    queryKey: ['status-propostas-det'],
    queryFn: () => base44.entities.StatusProposta.filter({ ativo: true }),
  });

  const getStatusConfig = (p) => {
    if (!p) return null;
    return p.status_id ? statusList.find(s => s.id === p.status_id) : statusList.find(s => s.nome?.toLowerCase() === p.status?.toLowerCase());
  };

  const STATUS_COLOR_MAP = {
    blue: 'bg-blue-100 text-blue-700',
    green: 'bg-green-100 text-green-700',
    red: 'bg-red-100 text-red-700',
    yellow: 'bg-yellow-100 text-yellow-700',
    purple: 'bg-purple-100 text-purple-700',
    orange: 'bg-orange-100 text-orange-700',
    emerald: 'bg-emerald-100 text-emerald-700',
    slate: 'bg-slate-100 text-slate-600',
  };

  const isAdmin = ['master', 'super_admin', 'admin', 'gerente'].includes(user?.perfil);

  if (isLoading || !user) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  if (!proposta) {
    return (
      <div className="p-6 text-center">
        <p className="text-slate-500">Proposta não encontrada.</p>
        <Button className="mt-4" onClick={() => navigate(createPageUrl('VendasEmprestimos'))}>Voltar</Button>
      </div>
    );
  }

  const statusConfig = getStatusConfig(proposta);
  const statusColorClass = statusConfig ? (STATUS_COLOR_MAP[statusConfig.cor] || STATUS_COLOR_MAP.slate) : 'bg-slate-100 text-slate-600';

  // Calcula comissão empresa e vendedor
  const percEmpresa = proposta.valor_comissao && proposta.valor_credito
    ? ((proposta.valor_comissao / proposta.valor_credito) * 100).toFixed(2)
    : null;
  const percVendedor = proposta.percentual_comissao_vendedor ?? percEmpresa;
  const vlVendedor = proposta.valor_comissao_vendedor_pago ?? (proposta.valor_credito && percVendedor ? (proposta.valor_credito * percVendedor / 100) : null);

  return (
    <div className="max-w-4xl mx-auto space-y-6 p-4 lg:p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate(createPageUrl('VendasEmprestimos'))}
          className="flex items-center gap-2 text-slate-500 hover:text-slate-800 transition-colors text-sm font-medium"
        >
          <ArrowLeft className="w-4 h-4" /> Voltar
        </button>
        {statusConfig && (
          <Badge className={`${statusColorClass} px-3 py-1 text-sm font-semibold`}>{statusConfig.nome}</Badge>
        )}
      </div>

      {/* Título */}
      <div className="bg-gradient-to-r from-[#10353C] to-[#1a5060] rounded-2xl p-6 text-white">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-white/20 border-2 border-white/30 flex items-center justify-center text-white font-bold text-xl">
            {proposta.cliente_nome?.charAt(0)?.toUpperCase() || '?'}
          </div>
          <div>
            <h1 className="text-xl font-bold">{proposta.cliente_nome || '-'}</h1>
            <p className="text-white/80 text-sm mt-0.5 font-medium">
              {(proposta.cliente_cpf || cliente?.cpf) ? `CPF: ${proposta.cliente_cpf || cliente?.cpf}` : ''}
              {proposta.contrato ? `${(proposta.cliente_cpf || cliente?.cpf) ? ' | ' : ''}Contrato: ${proposta.contrato}` : ''}
              {proposta.emprestimo_valor_parcela ? ` /Parcela ${fmt(proposta.emprestimo_valor_parcela)}` : ''}
            </p>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mt-5 pt-5 border-t border-white/20">
          <div>
            <p className="text-white/60 text-xs font-medium uppercase">Valor Liberado</p>
            <p className="text-white font-bold text-lg mt-0.5">{fmt(proposta.valor_liquido || proposta.valor_credito)}</p>
            {proposta.valor_liquido && <p className="text-white/60 text-xs mt-0.5">Bruto: {fmt(proposta.valor_credito)}</p>}
          </div>
          <div>
            <p className="text-white/60 text-xs font-medium uppercase">Banco</p>
            <p className="text-white font-semibold mt-0.5">{proposta.administradora_nome || '-'}</p>
          </div>
          <div>
            <p className="text-white/60 text-xs font-medium uppercase">Tipo</p>
            <p className="text-white font-semibold mt-0.5">{proposta.emprestimo_tipo || '-'}</p>
          </div>
        </div>
      </div>

      <Tabs defaultValue="detalhes">
        <TabsList>
          <TabsTrigger value="detalhes">Detalhes</TabsTrigger>
          <TabsTrigger value="termo">Termo de Autorização</TabsTrigger>
        </TabsList>
        <TabsContent value="detalhes" className="space-y-6 mt-4">
      {/* Cliente */}
      <Card className="border-l-4 border-l-purple-500">
        <CardHeader className="bg-purple-50/50 pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <User className="w-4 h-4 text-purple-600" /> Dados do Cliente
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4 space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            <InfoItem label="Nome" value={proposta.cliente_nome} />
            {(proposta.cliente_cpf || cliente?.cpf) && <InfoItem label="CPF" value={proposta.cliente_cpf || cliente?.cpf} />}
            {cliente?.pj_cnpj && <InfoItem label="CNPJ" value={cliente.pj_cnpj} />}
            {cliente?.celular && <InfoItem label="Celular" value={cliente.celular} />}
            {cliente?.telefone_fixo && <InfoItem label="Telefone" value={cliente.telefone_fixo} />}
            {cliente?.email && <InfoItem label="E-mail" value={cliente.email} />}
            {proposta.emprestimo_numero_beneficio && <InfoItem label="Nº Benefício" value={proposta.emprestimo_numero_beneficio} />}
            {cliente?.senha_gov && (
              <div className="col-span-full">
                <div className="flex items-center gap-2 bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                  <Key className="w-4 h-4 text-yellow-600 flex-shrink-0" />
                  <div>
                    <span className="text-xs text-yellow-700 font-medium uppercase tracking-wide">Senha GOV</span>
                    <p className="font-bold text-yellow-900 text-lg tracking-widest">{cliente.senha_gov}</p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Endereço Residencial */}
          {(cliente?.res_endereco || cliente?.res_cidade) && (
            <div className="pt-4 border-t">
              <h4 className="font-bold text-sm text-slate-700 mb-3">📍 Endereço Residencial</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                {cliente?.res_endereco && <InfoItem label="Logradouro" value={cliente.res_endereco} />}
                {cliente?.res_numero && <InfoItem label="Nº" value={cliente.res_numero} />}
                {cliente?.res_complemento && <InfoItem label="Complemento" value={cliente.res_complemento} />}
                {cliente?.res_bairro && <InfoItem label="Bairro" value={cliente.res_bairro} />}
                {cliente?.res_cidade && <InfoItem label="Cidade" value={cliente.res_cidade} />}
                {cliente?.res_uf && <InfoItem label="UF" value={cliente.res_uf} />}
                {cliente?.res_cep && <InfoItem label="CEP" value={cliente.res_cep} />}
              </div>
            </div>
          )}

          {/* Endereço Comercial */}
          {(cliente?.com_endereco || cliente?.com_cidade) && (
            <div className="pt-4 border-t">
              <h4 className="font-bold text-sm text-slate-700 mb-3">🏢 Endereço Comercial</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                {cliente?.com_endereco && <InfoItem label="Logradouro" value={cliente.com_endereco} />}
                {cliente?.com_numero && <InfoItem label="Nº" value={cliente.com_numero} />}
                {cliente?.com_complemento && <InfoItem label="Complemento" value={cliente.com_complemento} />}
                {cliente?.com_bairro && <InfoItem label="Bairro" value={cliente.com_bairro} />}
                {cliente?.com_cidade && <InfoItem label="Cidade" value={cliente.com_cidade} />}
                {cliente?.com_uf && <InfoItem label="UF" value={cliente.com_uf} />}
                {cliente?.com_cep && <InfoItem label="CEP" value={cliente.com_cep} />}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dados do Empréstimo */}
      <Card className="border-l-4 border-l-blue-500">
        <CardHeader className="bg-blue-50/50 pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText className="w-4 h-4 text-blue-600" /> Dados do Empréstimo
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            <InfoItem label="Banco / Administradora" value={proposta.administradora_nome} always />
            <InfoItem label="Convênio" value={proposta.emprestimo_convenio_nome} always />
            <InfoItem label="Tipo" value={proposta.emprestimo_tipo} always />
            <InfoItem label="Prazo" value={proposta.emprestimo_prazo ? `${proposta.emprestimo_prazo} meses` : null} always />
            <InfoItem label="Nº Contrato" value={proposta.contrato} always />
            <InfoItem label="Valor da Parcela" value={proposta.emprestimo_valor_parcela ? fmt(proposta.emprestimo_valor_parcela) : null} always />
            <InfoItem label="Valor Liberado (Líquido)" value={proposta.valor_liquido ? fmt(proposta.valor_liquido) : fmt(proposta.valor_credito)} highlight always />
            <InfoItem label="Valor Bruto (Crédito)" value={fmt(proposta.valor_credito)} always />
            <InfoItem label="Valor Base Comissão" value={proposta.comissao_banco_base_comissao ? fmt(proposta.comissao_banco_base_comissao) : null} always />
            <InfoItem label="Tabela de Comissão" value={proposta.tabela_comissao_nome} always />
            <InfoItem label="Nº ADE" value={proposta.emprestimo_numero_ade} always />
            <InfoItem label="Banco Anterior" value={proposta.emprestimo_banco_anterior} always />
            <InfoItem label="Saldo Devedor" value={proposta.emprestimo_saldo_devedor ? fmt(proposta.emprestimo_saldo_devedor) : null} always />
            <InfoItem label="Data da Venda" value={fmtDate(proposta.data_venda)} always />
            <InfoItem label="Data de Liberação" value={fmtDate(proposta.emprestimo_data_liberacao)} always />
            <InfoItem label="Vendedor" value={proposta.vendedor_nome} always />
          </div>
        </CardContent>
      </Card>

      {/* Comissões (apenas admin/gerente) */}
      {isAdmin && (
        <Card className="border-l-4 border-l-amber-500">
          <CardHeader className="bg-amber-50/50 pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Percent className="w-4 h-4 text-amber-600" /> Comissões
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div className="bg-blue-50 rounded-xl p-4 space-y-3">
                <h4 className="font-bold text-sm text-blue-800 uppercase tracking-wide flex items-center gap-1.5">
                  <Building2 className="w-4 h-4" /> Comissão Empresa
                </h4>
                <div className="grid grid-cols-2 gap-3">
                  {percEmpresa && (
                    <div>
                      <span className="text-xs text-slate-500">Percentual</span>
                      <p className="font-bold text-blue-700 text-lg">{percEmpresa}%</p>
                    </div>
                  )}
                  {proposta.valor_comissao != null && (
                    <div>
                      <span className="text-xs text-slate-500">Valor</span>
                      <p className="font-bold text-blue-700 text-lg">{fmt(proposta.valor_comissao)}</p>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${proposta.comissao_banco_recebida ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>
                    {proposta.comissao_banco_recebida ? '✅ Recebida do banco' : '⏳ Aguardando banco'}
                  </span>
                </div>
              </div>

              <div className="bg-green-50 rounded-xl p-4 space-y-3">
                <h4 className="font-bold text-sm text-green-800 uppercase tracking-wide flex items-center gap-1.5">
                  <User className="w-4 h-4" /> Comissão Vendedor
                </h4>
                <div className="grid grid-cols-2 gap-3">
                  {percVendedor != null && (
                    <div>
                      <span className="text-xs text-slate-500">Percentual</span>
                      <p className="font-bold text-green-700 text-lg">{percVendedor}%</p>
                    </div>
                  )}
                  {vlVendedor != null && (
                    <div>
                      <span className="text-xs text-slate-500">Valor</span>
                      <p className="font-bold text-green-700 text-lg">{fmt(vlVendedor)}</p>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${proposta.comissao_vendedor_paga ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>
                    {proposta.comissao_vendedor_paga ? `✅ Pago em ${fmtDate(proposta.comissao_vendedor_data_pagamento)}` : '⏳ Pendente'}
                  </span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Observações */}
      {proposta.observacoes && (
        <Card className="border-l-4 border-l-slate-400">
          <CardHeader className="bg-slate-50/50 pb-3">
            <CardTitle className="text-base text-slate-700">Observações</CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <p className="text-slate-700 whitespace-pre-wrap">{proposta.observacoes}</p>
          </CardContent>
        </Card>
      )}
        </TabsContent>
        <TabsContent value="termo" className="mt-4">
          <TermoAutorizacaoTab proposta={proposta} cliente={cliente} empresa={empresa} currentUser={user} />
        </TabsContent>
      </Tabs>
    </div>
  );
}