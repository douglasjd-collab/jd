import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Pencil } from 'lucide-react';

const STATUS = {
  em_analise: 'Em Análise',
  aguardando_documentacao: 'Aguardando Documentação',
  aprovado: 'Aprovado',
  reprovado: 'Reprovado',
  contrato_emitido: 'Contrato Emitido',
  pago_pelo_banco: 'Operação Finalizada',
  comissao_recebida: 'Comissão Recebida',
  cancelado: 'Cancelado',
};

const RETORNO = {
  manual: 'Sem retorno / Comissão manual',
  retorno_3: 'Retorno 3',
  retorno_2: 'Retorno 2',
  retorno_1: 'Retorno 1',
  parceiro: 'Parceiro',
};

const TARIFA = {
  aguardando_pagamento: 'Aguardando pagamento',
  recebida: 'Recebida',
  isenta: 'Isenta',
  cancelada: 'Cancelada',
};

const TIPO = { carro: 'Carro', moto: 'Moto', caminhao: 'Caminhão' };
const dinheiro = valor => valor === null || valor === undefined || valor === ''
  ? '—'
  : Number(valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const data = valor => {
  if (!valor) return '—';
  const texto = String(valor);
  const d = new Date(texto.length === 10 ? `${texto}T12:00:00` : texto);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('pt-BR');
};
const texto = valor => valor || '—';

function Item({ label, value, destaque = false }) {
  return (
    <div className="rounded-lg border bg-white px-3 py-2.5">
      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{label}</p>
      <p className={`mt-1 text-sm ${destaque ? 'font-semibold text-slate-900' : 'text-slate-700'} whitespace-pre-wrap`}>{value}</p>
    </div>
  );
}

function Secao({ titulo, children }) {
  return (
    <section>
      <h3 className="mb-2 text-sm font-semibold text-slate-800">{titulo}</h3>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
    </section>
  );
}

export default function PropostaFinanciamentoDetalhes({ proposta, open, onOpenChange, onEditar }) {
  if (!proposta) return null;
  const cadastro = proposta.data_proposta || proposta.created_date;
  const atualizacao = proposta.updated_date;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            <span>{proposta.numero_proposta || 'Proposta de financiamento'}</span>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
              {STATUS[proposta.status] || proposta.status || 'Sem status'}
            </span>
          </DialogTitle>
          <p className="text-sm text-slate-500">{texto(proposta.cliente_nome)} · Cadastro em {data(cadastro)}</p>
        </DialogHeader>

        <div className="space-y-5">
          <Secao titulo="Cliente e responsáveis">
            <Item label="Cliente" value={texto(proposta.cliente_nome)} destaque />
            <Item label="CPF" value={texto(proposta.cliente_cpf)} />
            <Item label="Telefone" value={texto(proposta.cliente_telefone)} />
            <Item label="Vendedor" value={texto(proposta.vendedor_nome)} />
            <Item label="Loja parceira" value={texto(proposta.empresa_parceira_nome)} />
            <Item label="Filial" value={texto(proposta.filial_nome)} />
          </Secao>

          <Secao titulo="Veículo">
            <Item label="Tipo" value={TIPO[proposta.tipo_veiculo] || texto(proposta.tipo_veiculo)} />
            <Item label="Marca e modelo" value={`${proposta.veiculo_marca || ''} ${proposta.veiculo_modelo || ''}`.trim() || '—'} destaque />
            <Item label="Ano" value={texto(proposta.veiculo_ano)} />
            <Item label="Placa" value={texto(proposta.veiculo_placa)} />
            <Item label="Valor do veículo" value={dinheiro(proposta.valor_veiculo)} />
            <Item label="Entrada" value={dinheiro(proposta.valor_entrada)} />
          </Secao>

          <Secao titulo="Condições do financiamento">
            <Item label="Valor financiado" value={dinheiro(proposta.valor_financiado)} destaque />
            <Item label="Condição" value={proposta.prazo_meses ? `${proposta.prazo_meses} × ${dinheiro(proposta.valor_parcela)}` : '—'} destaque />
            <Item label="Banco" value={texto(proposta.banco)} />
            <Item label="Nº da proposta no banco" value={texto(proposta.numero_proposta_banco)} />
            <Item label="Taxa de juros" value={proposta.taxa_juros !== null && proposta.taxa_juros !== undefined && proposta.taxa_juros !== '' ? `${proposta.taxa_juros}% a.m.` : '—'} />
            <Item label="CET" value={proposta.cet_anual !== null && proposta.cet_anual !== undefined && proposta.cet_anual !== '' ? `${proposta.cet_anual}% a.a.` : '—'} />
          </Secao>

          <Secao titulo="Acompanhamento">
            <Item label="Data da proposta" value={data(proposta.data_proposta)} />
            <Item label="Última atualização" value={data(atualizacao)} />
            <Item label="Data da aprovação" value={data(proposta.data_aprovacao)} />
            <Item label="Validade da aprovação" value={data(proposta.validade_aprovacao)} />
            <Item label="Pagamento ao lojista" value={data(proposta.data_pagamento)} />
            <Item label="Pendências documentais" value={texto(proposta.pendencias_documentais)} />
            {(proposta.status === 'reprovado' || proposta.status === 'cancelado' || proposta.motivo_recusa_cancelamento) && (
              <Item label="Motivo da recusa/cancelamento" value={texto(proposta.motivo_recusa_cancelamento)} />
            )}
          </Secao>

          <Secao titulo="Controle financeiro da JD">
            <Item label="Tarifa cadastral" value={dinheiro(proposta.tarifa_cadastral)} />
            <Item label="Situação da tarifa" value={TARIFA[proposta.tarifa_cadastral_status] || texto(proposta.tarifa_cadastral_status)} />
            <Item label="Recebimento da tarifa" value={data(proposta.tarifa_cadastral_data_recebimento)} />
            <Item label="Retorno do lojista" value={RETORNO[proposta.retorno_lojista] || '—'} />
            <Item label="Comissão prevista" value={dinheiro(proposta.valor_comissao)} />
            <Item label="Percentual da comissão" value={proposta.percentual_comissao !== null && proposta.percentual_comissao !== undefined && proposta.percentual_comissao !== '' ? `${proposta.percentual_comissao}%` : '—'} />
            <Item label="Situação da comissão" value={texto(proposta.comissao_status)} />
            <Item label="Previsão de recebimento" value={data(proposta.comissao_data_prevista)} />
            <Item label="Recebimento da comissão" value={data(proposta.comissao_data_recebimento)} />
            <Item label="Custos operacionais" value={dinheiro(proposta.custos_operacionais)} />
          </Secao>

          {proposta.observacoes && (
            <Secao titulo="Observações">
              <div className="sm:col-span-2 lg:col-span-3">
                <Item label="Observações internas" value={proposta.observacoes} />
              </div>
            </Secao>
          )}
        </div>

        <DialogFooter className="mt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
          <Button onClick={onEditar} className="gap-2 bg-[#10353C] hover:bg-[#10353C]/90">
            <Pencil className="h-4 w-4" /> Editar proposta
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
