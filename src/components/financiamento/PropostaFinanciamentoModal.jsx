import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

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
  valor_veiculo: '', valor_entrada: '', valor_financiado: '', banco: '', prazo_meses: '',
  valor_parcela: '', taxa_juros: '', status: 'em_analise', vendedor_id: '', vendedor_nome: '',
  data_proposta: '', data_aprovacao: '', data_pagamento: '',
  valor_comissao_recebida: '', percentual_comissao: '', comissao_vendedor: '',
  status_comissao: 'pendente', observacoes: '',
};

export default function PropostaFinanciamentoModal({ open, onOpenChange, proposta, onSalvar, user }) {
  const [form, setForm] = useState(EMPTY);
  const [vendedores, setVendedores] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (proposta) {
      setForm({ ...EMPTY, ...proposta });
    } else {
      setForm({ ...EMPTY, data_proposta: new Date().toISOString().split('T')[0] });
    }
  }, [proposta, open]);

  useEffect(() => {
    if (!user?.empresa_id) return;
    base44.entities.Colaborador.filter({ empresa_id: user.empresa_id, status: 'ativo' }, 'nome', 200)
      .then(setVendedores).catch(() => {});
  }, [user]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    const dados = { ...form };
    // Conversões numéricas
    ['cliente_renda', 'valor_veiculo', 'valor_entrada', 'valor_financiado', 'prazo_meses',
      'valor_parcela', 'taxa_juros', 'valor_comissao_recebida', 'percentual_comissao', 'comissao_vendedor']
      .forEach(k => { if (dados[k] !== '' && dados[k] !== undefined) dados[k] = parseFloat(String(dados[k]).replace(',', '.')) || 0; });
    await onSalvar(dados);
    setSaving(false);
  };

  const F = ({ label, children, className = '' }) => (
    <div className={`space-y-1 ${className}`}>
      <Label className="text-xs font-medium text-slate-600">{label}</Label>
      {children}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{proposta ? 'Editar Proposta' : 'Nova Proposta de Financiamento'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-6 pt-2">

          {/* Dados do cliente */}
          <div>
            <h3 className="text-sm font-semibold text-slate-700 mb-3 pb-1 border-b">Dados do Cliente</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <F label="Nome do cliente *" className="lg:col-span-2">
                <Input value={form.cliente_nome} onChange={e => set('cliente_nome', e.target.value)} required />
              </F>
              <F label="CPF">
                <Input value={form.cliente_cpf} onChange={e => set('cliente_cpf', e.target.value)} placeholder="000.000.000-00" />
              </F>
              <F label="Telefone">
                <Input value={form.cliente_telefone} onChange={e => set('cliente_telefone', e.target.value)} />
              </F>
              <F label="Renda (R$)">
                <Input type="number" value={form.cliente_renda} onChange={e => set('cliente_renda', e.target.value)} />
              </F>
              <F label="Profissão">
                <Input value={form.cliente_profissao} onChange={e => set('cliente_profissao', e.target.value)} />
              </F>
            </div>
          </div>

          {/* Dados do veículo */}
          <div>
            <h3 className="text-sm font-semibold text-slate-700 mb-3 pb-1 border-b">Dados do Veículo</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <F label="Tipo de veículo *">
                <Select value={form.tipo_veiculo} onValueChange={v => set('tipo_veiculo', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="carro">Carro</SelectItem>
                    <SelectItem value="moto">Moto</SelectItem>
                    <SelectItem value="caminhao">Caminhão</SelectItem>
                  </SelectContent>
                </Select>
              </F>
              <F label="Marca">
                <Input value={form.veiculo_marca} onChange={e => set('veiculo_marca', e.target.value)} />
              </F>
              <F label="Modelo">
                <Input value={form.veiculo_modelo} onChange={e => set('veiculo_modelo', e.target.value)} />
              </F>
              <F label="Ano">
                <Input value={form.veiculo_ano} onChange={e => set('veiculo_ano', e.target.value)} placeholder="2024" />
              </F>
              <F label="Placa">
                <Input value={form.veiculo_placa} onChange={e => set('veiculo_placa', e.target.value)} placeholder="ABC-1234" />
              </F>
              <F label="Valor do veículo (R$)">
                <Input type="number" value={form.valor_veiculo} onChange={e => set('valor_veiculo', e.target.value)} />
              </F>
            </div>
          </div>

          {/* Dados do financiamento */}
          <div>
            <h3 className="text-sm font-semibold text-slate-700 mb-3 pb-1 border-b">Dados do Financiamento</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <F label="Valor de entrada (R$)">
                <Input type="number" value={form.valor_entrada} onChange={e => set('valor_entrada', e.target.value)} />
              </F>
              <F label="Valor financiado (R$)">
                <Input type="number" value={form.valor_financiado} onChange={e => set('valor_financiado', e.target.value)} />
              </F>
              <F label="Banco">
                <Input value={form.banco} onChange={e => set('banco', e.target.value)} placeholder="Ex: Bradesco, Santander..." />
              </F>
              <F label="Prazo (meses)">
                <Input type="number" value={form.prazo_meses} onChange={e => set('prazo_meses', e.target.value)} />
              </F>
              <F label="Valor da parcela (R$)">
                <Input type="number" value={form.valor_parcela} onChange={e => set('valor_parcela', e.target.value)} />
              </F>
              <F label="Taxa de juros (% a.m.)">
                <Input type="number" step="0.01" value={form.taxa_juros} onChange={e => set('taxa_juros', e.target.value)} />
              </F>
            </div>
          </div>

          {/* Status e datas */}
          <div>
            <h3 className="text-sm font-semibold text-slate-700 mb-3 pb-1 border-b">Status e Datas</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <F label="Status da proposta *">
                <Select value={form.status} onValueChange={v => set('status', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </F>
              <F label="Vendedor responsável">
                <Select value={form.vendedor_id || 'none'} onValueChange={v => {
                  if (v === 'none') { set('vendedor_id', ''); set('vendedor_nome', ''); return; }
                  const vend = vendedores.find(x => x.id === v);
                  set('vendedor_id', v);
                  set('vendedor_nome', vend?.nome || '');
                }}>
                  <SelectTrigger><SelectValue placeholder="Selecionar vendedor" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nenhum</SelectItem>
                    {vendedores.map(v => <SelectItem key={v.id} value={v.id}>{v.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </F>
              <F label="Data da proposta">
                <Input type="date" value={form.data_proposta} onChange={e => set('data_proposta', e.target.value)} />
              </F>
              <F label="Data da aprovação">
                <Input type="date" value={form.data_aprovacao} onChange={e => set('data_aprovacao', e.target.value)} />
              </F>
              <F label="Data do pagamento">
                <Input type="date" value={form.data_pagamento} onChange={e => set('data_pagamento', e.target.value)} />
              </F>
            </div>
          </div>

          {/* Comissão */}
          <div>
            <h3 className="text-sm font-semibold text-slate-700 mb-3 pb-1 border-b">Comissão</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <F label="Vr. comissão recebida (R$)">
                <Input type="number" value={form.valor_comissao_recebida} onChange={e => set('valor_comissao_recebida', e.target.value)} />
              </F>
              <F label="Percentual comissão (%)">
                <Input type="number" step="0.01" value={form.percentual_comissao} onChange={e => set('percentual_comissao', e.target.value)} />
              </F>
              <F label="Comissão do vendedor (R$)">
                <Input type="number" value={form.comissao_vendedor} onChange={e => set('comissao_vendedor', e.target.value)} />
              </F>
              <F label="Status da comissão">
                <Select value={form.status_comissao} onValueChange={v => set('status_comissao', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STATUS_COMISSAO.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </F>
            </div>
          </div>

          <F label="Observações">
            <Textarea value={form.observacoes} onChange={e => set('observacoes', e.target.value)} rows={3} />
          </F>

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={saving} className="bg-[#10353C] hover:bg-[#10353C]/90">
              {saving ? 'Salvando...' : proposta ? 'Salvar alterações' : 'Cadastrar proposta'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}