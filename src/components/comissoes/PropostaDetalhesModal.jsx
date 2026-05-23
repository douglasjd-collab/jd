import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import moment from 'moment';

const fmt = (v) => (v != null && v !== '' ? Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '-');
const fmtDate = (d) => d ? moment(d).format('DD/MM/YYYY') : '-';
const fmtPerc = (v) => (v != null && v !== '') ? `${parseFloat(v).toFixed(4)}%` : '-';

const Campo = ({ label, value, highlight }) => (
  <div className="bg-slate-50 rounded-lg px-3 py-2.5">
    <p className="text-xs text-slate-400 font-medium uppercase tracking-wide">{label}</p>
    <p className={`text-sm font-semibold mt-0.5 break-words ${highlight ? 'text-[#10353C]' : 'text-slate-800'}`}>
      {value || '-'}
    </p>
  </div>
);

const Secao = ({ titulo }) => (
  <div className="col-span-2 border-b border-slate-200 pb-1 mt-2">
    <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">{titulo}</p>
  </div>
);

export default function PropostaDetalhesModal({ proposta, onClose }) {
  if (!proposta) return null;

  const campos = [
    // Dados do cliente
    { secao: 'Dados do Cliente' },
    { label: 'Cliente', value: proposta.cliente_nome, full: true },
    { label: 'CPF', value: proposta.cliente_cpf },
    { label: 'Telefone', value: proposta.cliente_telefone },

    // Dados do contrato
    { secao: 'Dados do Contrato' },
    { label: 'Contrato', value: proposta.contrato },
    { label: 'Banco / Administradora', value: proposta.administradora_nome },
    { label: 'Tipo de Empréstimo', value: proposta.emprestimo_tipo },
    { label: 'Convenio', value: proposta.convenio_nome },
    { label: 'Status', value: proposta.status },
    { label: 'Data da Venda', value: fmtDate(proposta.data_venda) },
    { label: 'Data de Liberação', value: fmtDate(proposta.emprestimo_data_liberacao) },
    { label: 'Produto', value: proposta.produto },
    { label: 'Origem', value: proposta.origem },

    // Valores
    { secao: 'Valores' },
    { label: 'Valor do Crédito (Bruto)', value: fmt(proposta.valor_credito), highlight: true },
    { label: 'Valor Líquido', value: fmt(proposta.valor_liquido) },
    { label: 'Valor da Parcela', value: fmt(proposta.emprestimo_valor_parcela) },
    { label: 'Prazo (meses)', value: proposta.emprestimo_prazo ? String(proposta.emprestimo_prazo) : '-' },
    { label: 'Taxa de Juros', value: proposta.emprestimo_taxa_juros ? `${proposta.emprestimo_taxa_juros}%` : '-' },
    { label: 'Valor de Portabilidade', value: fmt(proposta.emprestimo_valor_portabilidade) },
    { label: 'Saldo Devedor', value: fmt(proposta.emprestimo_saldo_devedor) },
    { label: 'Troco', value: fmt(proposta.emprestimo_troco) },

    // Comissão da empresa
    { secao: 'Comissão da Empresa (Recebida do Banco)' },
    { label: 'Base de Cálculo Comissão', value: fmt(proposta.comissao_banco_base_comissao || proposta.valor_credito) },
    { label: 'Vl. Comissão Empresa', value: fmt(proposta.valor_comissao), highlight: true },
    { label: '% Comissão Empresa', value: fmtPerc(proposta.comissao_banco_percentual_recebido) },
    { label: 'Comissão Banco Recebida?', value: proposta.comissao_banco_recebida ? 'Sim ✅' : 'Não ⏳' },
    { label: 'Data Recebimento Banco', value: fmtDate(proposta.comissao_banco_data_recebimento) },
    { label: 'Valor Recebido do Banco', value: fmt(proposta.comissao_banco_valor_recebido) },

    // Comissão do vendedor
    { secao: 'Comissão do Vendedor' },
    { label: 'Vendedor', value: proposta.vendedor_nome },
    { label: '% Comissão Vendedor', value: proposta.percentual_comissao_vendedor != null ? `${proposta.percentual_comissao_vendedor}%` : '-' },
    { label: 'Vl. Comissão Vendedor Pago', value: fmt(proposta.valor_comissao_vendedor_pago) },
    { label: 'Comissão Vendedor Paga?', value: proposta.comissao_vendedor_paga ? 'Sim ✅' : 'Não ⏳' },
    { label: 'Data Pagamento Vendedor', value: fmtDate(proposta.comissao_vendedor_data_pagamento) },
    { label: 'Forma Pagamento Vendedor', value: proposta.comissao_vendedor_forma_pagamento },

    // Outros
    { secao: 'Outros' },
    { label: 'Observações', value: proposta.observacoes, full: true },
    { label: 'ID Interno', value: proposta.id },
    { label: 'Criado em', value: fmtDate(proposta.created_date) },
    { label: 'Atualizado em', value: fmtDate(proposta.updated_date) },
  ];

  return (
    <Dialog open={!!proposta} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-[#10353C]">Detalhes do Contrato</DialogTitle>
          <p className="text-xs text-slate-400">Duplo clique para fechar ou clique fora do modal</p>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-2 mt-2">
          {campos.map((c, i) => {
            if (c.secao) return <Secao key={`sec-${i}`} titulo={c.secao} />;
            if (!c.value || c.value === '-') return null;
            return (
              <div key={`${c.label}-${i}`} className={c.full ? 'col-span-2' : ''}>
                <Campo label={c.label} value={c.value} highlight={c.highlight} />
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}