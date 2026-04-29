import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Save, Shield, Search } from 'lucide-react';
import { toast } from 'sonner';
import { addYears, addMonths, subDays, format } from 'date-fns';

const INICIAL = {
  tipo_seguro: 'auto', tipo_plano: 'anual', forma_pagamento: 'boleto',
  status: 'em_dia', score_renovacao: 'medio', numero_renovacao: 0,
};

export default function PropostaSeguroModal({ open, onOpenChange, proposta, empresaId, onSalvo }) {
  const [form, setForm] = useState(INICIAL);
  const [salvando, setSalvando] = useState(false);
  const [buscaCliente, setBuscaCliente] = useState('');
  const [clientesFiltrados, setClientesFiltrados] = useState([]);
  const [buscandoCliente, setBuscandoCliente] = useState(false);
  const [colaboradores, setColaboradores] = useState([]);
  const [buscandoPlaca, setBuscandoPlaca] = useState(false);

  const { data: seguradoras = [] } = useQuery({
    queryKey: ['seguradoras', empresaId],
    enabled: !!empresaId && open,
    queryFn: () => base44.entities.Seguradora.filter({ empresa_id: empresaId, status: 'ativa' }, 'nome'),
  });

  useEffect(() => {
    if (!open) return;
    if (proposta) {
      setForm({ ...proposta });
      setBuscaCliente(proposta.cliente_nome || '');
    } else {
      setForm({ ...INICIAL, empresa_id: empresaId });
      setBuscaCliente('');
    }
    // Carregar colaboradores
    base44.entities.Colaborador.filter({ empresa_id: empresaId, status: 'ativo' }, 'nome', 200)
      .then(setColaboradores).catch(() => {});
  }, [open, proposta, empresaId]);

  // Calcular datas automaticamente
  useEffect(() => {
    if (!form.data_inicio || proposta) return;
    const inicio = new Date(form.data_inicio);
    let fim, renovacao;
    if (form.tipo_plano === 'anual') {
      fim = addYears(inicio, 1);
      renovacao = subDays(fim, 30);
    } else {
      fim = addMonths(inicio, 1);
      renovacao = null;
    }
    setForm(f => ({
      ...f,
      data_vencimento: format(fim, 'yyyy-MM-dd'),
      data_renovacao: renovacao ? format(renovacao, 'yyyy-MM-dd') : '',
    }));
  }, [form.data_inicio, form.tipo_plano]);

  // Calcular comissão ao selecionar seguradora
  useEffect(() => {
    if (!form.seguradora_id) return;
    const seg = seguradoras.find(s => s.id === form.seguradora_id);
    if (seg) {
      setForm(f => ({ ...f, seguradora_nome: seg.nome, percentual_comissao: seg.comissao_percentual || 0 }));
    }
  }, [form.seguradora_id, seguradoras]);

  // Calcular adesão automaticamente
  useEffect(() => {
    if (!form.valor_parcela || !form.percentual_comissao) return;
    const adesao = (form.valor_parcela * (form.percentual_comissao / 100));
    setForm(f => ({ ...f, valor_adesao: parseFloat(adesao.toFixed(2)) }));
  }, [form.valor_parcela, form.percentual_comissao]);

  const buscarClientes = async (q) => {
    if (q.length < 2) { setClientesFiltrados([]); return; }
    setBuscandoCliente(true);
    try {
      const qLower = q.toLowerCase().trim();
      // Busca ampla: traz todos os clientes da empresa e filtra localmente
      // Para evitar limite de 200, busca em lotes maiores
      const res = await base44.entities.Cliente.filter({ empresa_id: empresaId }, 'nome_completo', 2000);
      const filtrado = res.filter(c => {
        const nome = (c.nome_completo || '').toLowerCase();
        const cpf = (c.cpf || '').replace(/\D/g, '');
        const qDigits = q.replace(/\D/g, '');
        return nome.includes(qLower) ||
          (qDigits.length >= 3 && cpf.includes(qDigits)) ||
          (c.celular || '').includes(q);
      }).slice(0, 10);
      setClientesFiltrados(filtrado);
    } catch { } finally { setBuscandoCliente(false); }
  };

  const selecionarCliente = (c) => {
    setForm(f => ({
      ...f,
      cliente_id: c.id,
      cliente_nome: c.nome_completo,
      cliente_cpf: c.cpf || '',
      cliente_telefone: c.celular || c.telefone_fixo || '',
    }));
    setBuscaCliente(c.nome_completo);
    setClientesFiltrados([]);
  };

  const handleSalvar = async () => {
    if (!form.cliente_id) { toast.error('Selecione um cliente'); return; }
    if (!form.seguradora_id) { toast.error('Selecione uma seguradora'); return; }
    if (!form.data_inicio) { toast.error('Informe a data de início'); return; }
    if (!form.valor_parcela) { toast.error('Informe o valor da parcela'); return; }

    setSalvando(true);
    try {
      const dados = { ...form, empresa_id: empresaId };
      if (proposta?.id) {
        await base44.entities.PropostaSeguro.update(proposta.id, dados);
        toast.success('Proposta atualizada!');
      } else {
        // Gerar número da proposta
        const todasPropostas = await base44.entities.PropostaSeguro.filter({ empresa_id: empresaId }, '-created_date', 1);
        const seq = (todasPropostas.length || 0) + 1;
        dados.numero_proposta = `SEG${String(seq).padStart(4, '0')}`;
        await base44.entities.PropostaSeguro.create(dados);
        toast.success('Proposta criada com sucesso!');
      }
      onSalvo?.();
    } catch (e) {
      toast.error('Erro ao salvar: ' + e.message);
    } finally {
      setSalvando(false);
    }
  };

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }));

  const consultarPlaca = async () => {
    const placa = form.veiculo_placa;
    if (!placa || placa.replace(/[^A-Za-z0-9]/g, '').length !== 7) {
      toast.error('Informe uma placa válida com 7 caracteres.');
      return;
    }
    setBuscandoPlaca(true);
    try {
      const res = await base44.functions.invoke('buscarVeiculoPorPlaca', { placa });
      const data = res.data;
      if (!data.sucesso) {
        toast.error(data.mensagem || 'Erro ao consultar placa.');
        return;
      }
      setForm(f => ({
        ...f,
        veiculo_marca: data.marca || f.veiculo_marca,
        veiculo_modelo: data.modelo || f.veiculo_modelo,
        veiculo_ano: data.ano || f.veiculo_ano,
        valor_fipe: data.valor_fipe || f.valor_fipe,
      }));
      if (data.valor_fipe) {
        toast.success('Dados do veículo e FIPE preenchidos automaticamente!');
      } else {
        toast.success('Dados do veículo preenchidos. FIPE não localizada — preencha manualmente.');
      }
    } catch (e) {
      toast.error('Erro ao consultar placa: ' + e.message);
    } finally {
      setBuscandoPlaca(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-blue-600" />
            {proposta ? 'Editar Proposta' : 'Nova Proposta de Seguro'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Cliente */}
          <div className="relative">
            <Label className="text-xs font-semibold">Cliente *</Label>
            <Input
              value={buscaCliente}
              onChange={e => { setBuscaCliente(e.target.value); buscarClientes(e.target.value); }}
              placeholder="Digite nome, CPF ou telefone..."
              className="mt-1 h-8"
            />
            {buscandoCliente && <Loader2 className="absolute right-3 top-7 w-4 h-4 animate-spin text-slate-400" />}
            {clientesFiltrados.length > 0 && (
              <div className="absolute z-50 mt-1 w-full bg-white border rounded-lg shadow-lg max-h-48 overflow-y-auto">
                {clientesFiltrados.map(c => (
                  <button key={c.id} onClick={() => selecionarCliente(c)}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 border-b last:border-0">
                    <span className="font-medium">{c.nome_completo}</span>
                    <span className="text-slate-400 text-xs ml-2">{c.cpf}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Grid 2 colunas */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs font-semibold">Seguradora *</Label>
              <Select value={form.seguradora_id || ''} onValueChange={v => set('seguradora_id', v)}>
                <SelectTrigger className="mt-1 h-8"><SelectValue placeholder="Selecionar..." /></SelectTrigger>
                <SelectContent>
                  {seguradoras.map(s => <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs font-semibold">Tipo de Seguro</Label>
              <Select value={form.tipo_seguro || 'auto'} onValueChange={v => set('tipo_seguro', v)}>
                <SelectTrigger className="mt-1 h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[['auto','🚗 Auto'],['vida','❤️ Vida'],['residencial','🏠 Residencial'],['empresarial','🏢 Empresarial'],['saude','🏥 Saúde'],['outros','📋 Outros']].map(([v, l]) =>
                    <SelectItem key={v} value={v}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs font-semibold">Tipo de Plano *</Label>
              <Select value={form.tipo_plano || 'anual'} onValueChange={v => set('tipo_plano', v)}>
                <SelectTrigger className="mt-1 h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="mensal">Mensal</SelectItem>
                  <SelectItem value="anual">Anual</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs font-semibold">Forma de Pagamento</Label>
              <Select value={form.forma_pagamento || 'boleto'} onValueChange={v => set('forma_pagamento', v)}>
                <SelectTrigger className="mt-1 h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[['boleto','Boleto'],['cartao_credito','Cartão Crédito'],['cartao_debito','Cartão Débito'],['pix','PIX'],['debito_automatico','Débito Automático']].map(([v, l]) =>
                    <SelectItem key={v} value={v}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs font-semibold">Data de Início *</Label>
              <Input type="date" value={form.data_inicio || ''} onChange={e => set('data_inicio', e.target.value)} className="mt-1 h-8" />
            </div>
            <div>
              <Label className="text-xs font-semibold">Data de Renovação</Label>
              <Input type="date" value={form.data_renovacao || ''} onChange={e => {
                const novaRenovacao = e.target.value;
                // Vencimento = renovação + 30 dias
                const venc = new Date(novaRenovacao);
                venc.setDate(venc.getDate() + 30);
                set('data_renovacao', novaRenovacao);
                setForm(f => ({ ...f, data_renovacao: novaRenovacao, data_vencimento: format(venc, 'yyyy-MM-dd') }));
              }} className="mt-1 h-8" />
              {form.data_vencimento && (
                <p className="text-[10px] text-slate-400 mt-0.5">Vencimento: {format(new Date(form.data_vencimento), 'dd/MM/yyyy')}</p>
              )}
            </div>
            <div>
              <Label className="text-xs font-semibold">Valor da Parcela (R$) *</Label>
              <Input type="number" step="0.01" value={form.valor_parcela || ''} onChange={e => set('valor_parcela', parseFloat(e.target.value))} className="mt-1 h-8" />
            </div>
            <div>
              <Label className="text-xs font-semibold">Comissão (%)</Label>
              <Input type="number" step="0.01" value={form.percentual_comissao || ''} onChange={e => set('percentual_comissao', parseFloat(e.target.value))} className="mt-1 h-8" />
            </div>
            <div>
              <Label className="text-xs font-semibold">Recorrência Mensal (%)</Label>
              <Input type="number" step="0.01" value={form.valor_adesao || ''} onChange={e => set('valor_adesao', parseFloat(e.target.value))} className="mt-1 h-8 bg-emerald-50" />
            </div>
          </div>

          {/* Veículo (se auto) */}
          {form.tipo_seguro === 'auto' && (
            <div>
              <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Dados do Veículo</Label>
              {/* Placa com botão de consulta automática */}
              <div className="flex gap-2 mt-1 mb-2">
                <div className="flex-1">
                  <Input
                    placeholder="Placa (ex: ABC1234)"
                    value={form.veiculo_placa || ''}
                    onChange={e => set('veiculo_placa', e.target.value.toUpperCase())}
                    className="h-9 text-sm font-mono tracking-widest uppercase"
                    maxLength={8}
                  />
                </div>
                <Button
                  type="button"
                  onClick={consultarPlaca}
                  disabled={buscandoPlaca}
                  className="h-9 bg-blue-600 hover:bg-blue-700 text-white gap-1.5 px-4 text-xs whitespace-nowrap"
                >
                  {buscandoPlaca ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                  {buscandoPlaca ? 'Consultando...' : 'Consultar Placa'}
                </Button>
              </div>
              <p className="text-[10px] text-slate-400 mb-2">Digite a placa e clique em "Consultar Placa" para preencher marca, modelo, ano e FIPE automaticamente.</p>
              <div className="grid grid-cols-4 gap-2">
                <Input placeholder="Marca" value={form.veiculo_marca || ''} onChange={e => set('veiculo_marca', e.target.value)} className="h-8 text-xs" />
                <Input placeholder="Modelo" value={form.veiculo_modelo || ''} onChange={e => set('veiculo_modelo', e.target.value)} className="h-8 text-xs" />
                <Input placeholder="Ano" value={form.veiculo_ano || ''} onChange={e => set('veiculo_ano', e.target.value)} className="h-8 text-xs" />
                <Input
                  type="text"
                  placeholder="FIPE (R$)"
                  value={form.valor_fipe ? Number(form.valor_fipe).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : ''}
                  onChange={e => {
                    const raw = e.target.value.replace(/\D/g, '');
                    set('valor_fipe', raw ? parseFloat(raw) / 100 : '');
                  }}
                  className="h-8 text-xs"
                />
              </div>
            </div>
          )}

          {/* Vendedor e Status */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs font-semibold">Vendedor</Label>
              <Select value={form.vendedor_id || ''} onValueChange={v => {
                const c = colaboradores.find(x => x.id === v);
                set('vendedor_id', v); set('vendedor_nome', c?.nome || '');
              }}>
                <SelectTrigger className="mt-1 h-8"><SelectValue placeholder="Selecionar..." /></SelectTrigger>
                <SelectContent>
                  {colaboradores.map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs font-semibold">Status</Label>
              <Select value={form.status || 'em_dia'} onValueChange={v => set('status', v)}>
                <SelectTrigger className="mt-1 h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[['em_dia','Em Dia'],['atrasado','Atrasado'],['em_renovacao','Em Renovação'],['vencido','Vencido'],['cancelado','Cancelado'],['pendente','Pendente']].map(([v,l]) =>
                    <SelectItem key={v} value={v}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label className="text-xs font-semibold">Observações</Label>
            <Textarea value={form.observacoes || ''} onChange={e => set('observacoes', e.target.value)} className="mt-1 h-20 resize-none text-sm" />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSalvar} disabled={salvando} className="gap-1.5 bg-blue-600 hover:bg-blue-700">
            {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Salvar Proposta
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}