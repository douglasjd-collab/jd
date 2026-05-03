import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';

const STATUS_OPTIONS = [
  { value: 'em_analise', label: 'Em análise' },
  { value: 'aguardando_documentacao', label: 'Aguardando documentação' },
  { value: 'aprovado', label: 'Aprovado' },
  { value: 'reprovado', label: 'Reprovado' },
  { value: 'contrato_emitido', label: 'Contrato emitido' },
  { value: 'pago', label: 'Pago / Finalizado' },
  { value: 'cancelado', label: 'Cancelado' },
];

const STATUS_COMISSAO = [
  { value: 'pendente', label: 'Pendente' },
  { value: 'recebida', label: 'Recebida' },
  { value: 'paga', label: 'Paga' },
];

const EMPTY = {
  cliente_nome: '', cliente_cpf: '', cliente_telefone: '', cliente_renda: '', cliente_profissao: '',
  tipo_veiculo: 'carro', veiculo_marca: '', veiculo_modelo: '', veiculo_ano: '', veiculo_placa: '',
  valor_veiculo: '', valor_entrada: '', valor_financiado: '', banco: '', prazo_meses: '', valor_parcela: '',
  taxa_juros: '', status: 'em_analise', vendedor_id: '', vendedor_nome: '',
  data_proposta: '', data_aprovacao: '', data_pagamento: '',
  valor_comissao_recebida: '', percentual_comissao: '', comissao_vendedor: '',
  status_comissao: 'pendente', observacoes: '',
};

function Field({ label, children }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs font-semibold text-slate-600">{label}</Label>
      {children}
    </div>
  );
}

export default function PropostaFinanciamentoModal({ open, onClose, proposta, user, onSuccess }) {
  const [form, setForm] = useState(EMPTY);
  const [vendedores, setVendedores] = useState([]);
  const [saving, setSaving] = useState(false);

  const empresaId = user?.empresa_id;

  useEffect(() => {
    if (empresaId) {
      base44.entities.Colaborador.filter({ empresa_id: empresaId }, 'nome', 200).then(v => setVendedores(v || []));
    }
  }, [empresaId]);

  useEffect(() => {
    if (proposta) {
      setForm({ ...EMPTY, ...proposta });
    } else {
      setForm({ ...EMPTY, data_proposta: new Date().toLocaleDateString('fr-CA') });
    }
  }, [proposta, open]);

  const set = (field, val) => setForm(prev => ({ ...prev, [field]: val }));

  const handleSalvar = async () => {
    if (!form.cliente_nome) { toast.error('Nome do cliente é obrigatório'); return; }
    setSaving(true);
    const data = {
      ...form,
      empresa_id: empresaId,
      valor_veiculo: parseFloat(form.valor_veiculo) || 0,
      valor_entrada: parseFloat(form.valor_entrada) || 0,
      valor_financiado: parseFloat(form.valor_financiado) || 0,
      valor_parcela: parseFloat(form.valor_parcela) || 0,
      taxa_juros: parseFloat(form.taxa_juros) || 0,
      prazo_meses: parseInt(form.prazo_meses) || 0,
      cliente_renda: parseFloat(form.cliente_renda) || 0,
      valor_comissao_recebida: parseFloat(form.valor_comissao_recebida) || 0,
      percentual_comissao: parseFloat(form.percentual_comissao) || 0,
      comissao_vendedor: parseFloat(form.comissao_vendedor) || 0,
    };

    if (!data.numero_proposta) {
      data.numero_proposta = 'FIN' + Date.now().toString().slice(-6);
    }

    if (proposta?.id) {
      await base44.entities.FinanciamentoVeiculo.update(proposta.id, data);
      toast.success('Proposta atualizada!');
    } else {
      await base44.entities.FinanciamentoVeiculo.create(data);
      toast.success('Proposta cadastrada!');
    }
    setSaving(false);
    onSuccess();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{proposta ? 'Editar Proposta' : 'Nova Proposta — Financiamento de Veículo'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-2">
          {/* Dados do Cliente */}
          <div>
            <p className="text-sm font-bold text-slate-700 mb-3 border-b pb-1">📋 Dados do Cliente</p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <Field label="Nome do Cliente *">
                <Input value={form.cliente_nome} onChange={e => set('cliente_nome', e.target.value)} placeholder="Nome completo" />
              </Field>
              <Field label="CPF">
                <Input value={form.cliente_cpf} onChange={e => set('cliente_cpf', e.target.value)} placeholder="000.000.000-00" />
              </Field>
              <Field label="Telefone">
                <Input value={form.cliente_telefone} onChange={e => set('cliente_telefone', e.target.value)} placeholder="(00) 00000-0000" />
              </Field>
              <Field label="Renda (R$)">
                <Input type="number" value={form.cliente_renda} onChange={e => set('cliente_renda', e.target.value)} placeholder="0,00" />
              </Field>
              <Field label="Profissão">
                <Input value={form.cliente_profissao} onChange={e => set('cliente_profissao', e.target.value)} />
              </Field>
            </div>
          </div>

          {/* Dados do Veículo */}
          <div>
            <p className="text-sm font-bold text-slate-700 mb-3 border-b pb-1">🚗 Dados do Veículo</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Field label="Tipo de Veículo">
                <Select value={form.tipo_veiculo} onValueChange={v => set('tipo_veiculo', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="carro">Carro</SelectItem>
                    <SelectItem value="moto">Moto</SelectItem>
                    <SelectItem value="caminhao">Caminhão</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Marca">
                <Input value={form.veiculo_marca} onChange={e => set('veiculo_marca', e.target.value)} placeholder="Ex: Honda" />
              </Field>
              <Field label="Modelo">
                <Input value={form.veiculo_modelo} onChange={e => set('veiculo_modelo', e.target.value)} placeholder="Ex: Civic" />
              </Field>
              <Field label="Ano">
                <Input value={form.veiculo_ano} onChange={e => set('veiculo_ano', e.target.value)} placeholder="2023" />
              </Field>
              <Field label="Placa">
                <Input value={form.veiculo_placa} onChange={e => set('veiculo_placa', e.target.value)} placeholder="ABC-1234" />
              </Field>
              <Field label="Valor do Veículo (R$)">
                <Input type="number" value={form.valor_veiculo} onChange={e => set('valor_veiculo', e.target.value)} />
              </Field>
              <Field label="Valor de Entrada (R$)">
                <Input type="number" value={form.valor_entrada} onChange={e => set('valor_entrada', e.target.value)} />
              </Field>
              <Field label="Valor Financiado (R$)">
                <Input type="number" value={form.valor_financiado} onChange={e => set('valor_financiado', e.target.value)} />
              </Field>
            </div>
          </div>

          {/* Dados do Financiamento */}
          <div>
            <p className="text-sm font-bold text-slate-700 mb-3 border-b pb-1">🏦 Dados do Financiamento</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Field label="Banco">
                <Input value={form.banco} onChange={e => set('banco', e.target.value)} placeholder="Ex: Bradesco" />
              </Field>
              <Field label="Prazo (meses)">
                <Input type="number" value={form.prazo_meses} onChange={e => set('prazo_meses', e.target.value)} placeholder="48" />
              </Field>
              <Field label="Valor da Parcela (R$)">
                <Input type="number" value={form.valor_parcela} onChange={e => set('valor_parcela', e.target.value)} />
              </Field>
              <Field label="Taxa (% a.m.)">
                <Input type="number" value={form.taxa_juros} onChange={e => set('taxa_juros', e.target.value)} placeholder="1.5" />
              </Field>
              <Field label="Status da Proposta">
                <Select value={form.status} onValueChange={v => set('status', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Vendedor Responsável">
                <Select value={form.vendedor_id || ''} onValueChange={v => {
                  const vend = vendedores.find(x => x.id === v);
                  set('vendedor_id', v);
                  set('vendedor_nome', vend?.nome || '');
                }}>
                  <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
                  <SelectContent>
                    {vendedores.map(v => <SelectItem key={v.id} value={v.id}>{v.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Data da Proposta">
                <Input type="date" value={form.data_proposta} onChange={e => set('data_proposta', e.target.value)} />
              </Field>
              <Field label="Data da Aprovação">
                <Input type="date" value={form.data_aprovacao} onChange={e => set('data_aprovacao', e.target.value)} />
              </Field>
              <Field label="Data do Pagamento">
                <Input type="date" value={form.data_pagamento} onChange={e => set('data_pagamento', e.target.value)} />
              </Field>
            </div>
          </div>

          {/* Comissão */}
          <div>
            <p className="text-sm font-bold text-slate-700 mb-3 border-b pb-1">💰 Comissão</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Field label="Valor Comissão Recebida (R$)">
                <Input type="number" value={form.valor_comissao_recebida} onChange={e => set('valor_comissao_recebida', e.target.value)} />
              </Field>
              <Field label="Percentual Comissão (%)">
                <Input type="number" value={form.percentual_comissao} onChange={e => set('percentual_comissao', e.target.value)} />
              </Field>
              <Field label="Comissão do Vendedor (R$)">
                <Input type="number" value={form.comissao_vendedor} onChange={e => set('comissao_vendedor', e.target.value)} />
              </Field>
              <Field label="Status da Comissão">
                <Select value={form.status_comissao} onValueChange={v => set('status_comissao', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STATUS_COMISSAO.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
            </div>
          </div>

          {/* Observações */}
          <Field label="Observações">
            <Textarea value={form.observacoes} onChange={e => set('observacoes', e.target.value)} rows={3} />
          </Field>
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSalvar} disabled={saving} className="bg-blue-600 hover:bg-blue-700 text-white">
            {saving ? 'Salvando...' : proposta ? 'Salvar Alterações' : 'Cadastrar Proposta'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}