import React, { useState, useEffect, useRef, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Save, Car, Search, UserPlus, X } from 'lucide-react';
import { toast } from 'sonner';

const STATUS_OPTIONS = [
  { value: 'em_analise', label: 'Em Análise' },
  { value: 'aguardando_documentacao', label: 'Aguardando Documentação' },
  { value: 'aprovado', label: 'Aprovado' },
  { value: 'reprovado', label: 'Reprovado' },
  { value: 'contrato_emitido', label: 'Contrato Emitido' },
  { value: 'pago_pelo_banco', label: 'Pago pelo Banco' },
  { value: 'comissao_recebida', label: 'Comissão Recebida' },
  { value: 'cancelado', label: 'Cancelado' },
];

const EMPTY = {
  cliente_id: '', cliente_nome: '', cliente_cpf: '', cliente_telefone: '', cliente_renda: '', cliente_profissao: '',
  tipo_veiculo: 'carro', veiculo_marca: '', veiculo_modelo: '', veiculo_ano: '', veiculo_placa: '',
  valor_veiculo: '', valor_entrada: '', valor_financiado: '', banco: '', prazo_meses: '',
  valor_parcela: '', taxa_juros: '',
  tarifa_cadastral: '', tarifa_cadastral_status: 'aguardando_pagamento',
  custos_operacionais: '',
  vendedor_id: '', vendedor_nome: '',
  empresa_id: '', empresa_nome: '',
  filial_id: '', filial_nome: '',
  status: 'em_analise',
  data_proposta: '', data_aprovacao: '', data_pagamento: '',
  observacoes: '',
};

const F = ({ label, children, className = '' }) => (
  <div className={`space-y-1 ${className}`}>
    <Label className="text-xs font-medium text-slate-600">{label}</Label>
    {children}
  </div>
);

export default function PropostaFinanciamentoModal({ open, onOpenChange, proposta, onSalvar, user }) {
  const [form, setForm] = useState(EMPTY);
  const [vendedores, setVendedores] = useState([]);
  const [filiais, setFiliais] = useState([]);
  const [saving, setSaving] = useState(false);

  // Busca de cliente
  const [buscaCliente, setBuscaCliente] = useState('');
  const [clientesFiltrados, setClientesFiltrados] = useState([]);
  const [buscandoCliente, setBuscandoCliente] = useState(false);
  const [cadastrandoCliente, setCadastrandoCliente] = useState(false);
  const [novoCliente, setNovoCliente] = useState({ nome_completo: '', cpf: '', rg: '', data_nascimento: '', estado_civil: '', nome_mae: '', nacionalidade: '', local_nascimento: '', celular: '', email: '', cep: '', endereco: '', numero: '', complemento: '', bairro: '', cidade: '', estado: '' });
  const [salvandoCliente, setSalvandoCliente] = useState(false);
  const [buscandoPlaca, setBuscandoPlaca] = useState(false);
  const [buscandoCep, setBuscandoCep] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (proposta) {
      setForm({ ...EMPTY, ...proposta });
      setBuscaCliente(proposta.cliente_nome || '');
    } else {
      setForm({ ...EMPTY, data_proposta: new Date().toISOString().split('T')[0] });
      setBuscaCliente('');
    }
    setCadastrandoCliente(false);
    setClientesFiltrados([]);
  }, [proposta, open]);

  useEffect(() => {
    if (!user?.empresa_id) return;
    base44.entities.Colaborador.filter({ empresa_id: user.empresa_id, status: 'ativo' }, 'nome', 200)
      .then(setVendedores).catch(() => {});
    base44.entities.Filial.filter({ empresa_id: user.empresa_id, situacao: 'ativa' }, 'nome', 100)
      .then(setFiliais).catch(() => {});
  }, [user]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const debounceRef = useRef(null);

  const buscarClientes = useCallback((q) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (q.length < 2) { setClientesFiltrados([]); return; }
    debounceRef.current = setTimeout(async () => {
      setBuscandoCliente(true);
      try {
        const qLower = q.toLowerCase().trim();
        const res = await base44.entities.Cliente.filter({ empresa_id: user?.empresa_id }, 'nome_completo', 2000);
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
    }, 400);
  }, [user?.empresa_id]);

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

  const buscarCep = async (cep) => {
    const digits = cep.replace(/\D/g, '');
    if (digits.length !== 8) return;
    setBuscandoCep(true);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
      const data = await res.json();
      if (!data.erro) {
        setNovoCliente(n => ({ ...n, endereco: data.logradouro || n.endereco, bairro: data.bairro || n.bairro, cidade: data.localidade || n.cidade, estado: data.uf || n.estado }));
      }
    } catch { } finally { setBuscandoCep(false); }
  };

  const abrirCadastroCliente = () => {
    setNovoCliente({ nome_completo: buscaCliente, cpf: '', rg: '', data_nascimento: '', estado_civil: '', nome_mae: '', nacionalidade: '', local_nascimento: '', celular: '', email: '', cep: '', endereco: '', numero: '', complemento: '', bairro: '', cidade: '', estado: '' });
    setCadastrandoCliente(true);
    setClientesFiltrados([]);
  };

  const salvarNovoCliente = async () => {
    if (!novoCliente.nome_completo.trim()) { toast.error('Informe o nome do cliente'); return; }
    setSalvandoCliente(true);
    try {
      const criado = await base44.entities.Cliente.create({
        empresa_id: user.empresa_id,
        tipo_pessoa: 'Física',
        nome_completo: novoCliente.nome_completo.trim(),
        apelido: novoCliente.apelido || '',
        cpf: novoCliente.cpf || '',
        rg: novoCliente.rg || '',
        data_nascimento: novoCliente.data_nascimento || '',
        estado_civil: novoCliente.estado_civil || '',
        nome_mae: novoCliente.nome_mae || '',
        nacionalidade: novoCliente.nacionalidade || '',
        local_nascimento: novoCliente.local_nascimento || '',
        celular: novoCliente.celular || '',
        email: novoCliente.email || '',
        cep: novoCliente.cep || '',
        endereco: novoCliente.endereco || '',
        numero: novoCliente.numero || '',
        complemento: novoCliente.complemento || '',
        bairro: novoCliente.bairro || '',
        cidade: novoCliente.cidade || '',
        estado: novoCliente.estado || '',
      });
      selecionarCliente(criado);
      setCadastrandoCliente(false);
      toast.success('Cliente cadastrado e selecionado!');
    } catch (e) {
      toast.error('Erro ao cadastrar cliente: ' + e.message);
    } finally {
      setSalvandoCliente(false);
    }
  };

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
      if (!data.sucesso) { toast.error(data.mensagem || 'Erro ao consultar placa.'); return; }
      setForm(f => ({
        ...f,
        veiculo_marca: data.marca || f.veiculo_marca,
        veiculo_modelo: data.modelo || f.veiculo_modelo,
        veiculo_ano: data.ano || f.veiculo_ano,
      }));
      toast.success('Dados do veículo preenchidos automaticamente!');
    } catch (e) {
      toast.error('Erro ao consultar placa: ' + e.message);
    } finally {
      setBuscandoPlaca(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.cliente_nome && !buscaCliente) { toast.error('Informe o nome do cliente'); return; }
    setSaving(true);
    try {
      const dados = { ...form, cliente_nome: form.cliente_nome || buscaCliente };
      ['cliente_renda', 'valor_veiculo', 'valor_entrada', 'valor_financiado', 'prazo_meses',
        'valor_parcela', 'taxa_juros', 'tarifa_cadastral', 'custos_operacionais']
        .forEach(k => { if (dados[k] !== '' && dados[k] !== undefined) dados[k] = parseFloat(String(dados[k]).replace(',', '.')) || 0; });
      await onSalvar(dados);
    } catch (err) {
      toast.error('Erro ao salvar: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Car className="w-5 h-5 text-[#10353C]" />
            {proposta ? 'Editar Proposta' : 'Nova Proposta — Financiamento de Veículo'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6 pt-2">

          {/* Dados do Cliente */}
          <div>
            <h3 className="text-sm font-semibold text-slate-700 mb-3 pb-1 border-b flex items-center gap-1.5">
              🧾 Dados do Cliente
            </h3>

            <div className="relative mb-4">
              <Label className="text-xs font-semibold">Cliente * <span className="text-slate-400 font-normal">(buscar pelo nome, CPF ou telefone)</span></Label>
              <Input
                value={buscaCliente}
                onChange={e => {
                  const v = e.target.value;
                  setBuscaCliente(v);
                  if (form.cliente_id) setForm(f => ({ ...f, cliente_id: '' }));
                  if (cadastrandoCliente) setCadastrandoCliente(false);
                  buscarClientes(v);
                }}
                placeholder="Digite nome, CPF ou telefone..."
                className="mt-1"
                autoComplete="off"
              />
              {buscandoCliente && <Loader2 className="absolute right-3 top-8 w-4 h-4 animate-spin text-slate-400" />}

              {!cadastrandoCliente && (clientesFiltrados.length > 0 || (buscaCliente.length >= 2 && !buscandoCliente && !form.cliente_id)) && (
                <div className="absolute z-50 mt-1 w-full bg-white border rounded-lg shadow-lg max-h-48 overflow-y-auto">
                  {clientesFiltrados.map(c => (
                    <button key={c.id} type="button" onClick={() => selecionarCliente(c)}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 border-b last:border-0">
                      <span className="font-medium">{c.nome_completo}</span>
                      <span className="text-slate-400 text-xs ml-2">{c.cpf}</span>
                    </button>
                  ))}
                  {clientesFiltrados.length === 0 && buscaCliente.length >= 2 && !buscandoCliente && !form.cliente_id && (
                    <div className="px-3 py-2">
                      <p className="text-xs text-slate-400 mb-1">Nenhum cliente encontrado para "{buscaCliente}"</p>
                      <button type="button" onClick={abrirCadastroCliente}
                        className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700 font-medium">
                        <UserPlus className="w-4 h-4" />
                        Cadastrar "{buscaCliente}" como novo cliente
                      </button>
                    </div>
                  )}
                </div>
              )}

              {cadastrandoCliente && (
                <div className="mt-2 border border-blue-200 rounded-lg bg-blue-50 p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-blue-700 flex items-center gap-1.5"><UserPlus className="w-3.5 h-3.5" /> Cadastrar novo cliente</p>
                    <button type="button" onClick={() => setCadastrandoCliente(false)} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <Input placeholder="Nome completo *" value={novoCliente.nome_completo}
                      onChange={e => setNovoCliente(n => ({ ...n, nome_completo: e.target.value }))}
                      className="h-8 text-sm bg-white col-span-2" />
                    <Input placeholder="Apelido" value={novoCliente.apelido || ''}
                      onChange={e => setNovoCliente(n => ({ ...n, apelido: e.target.value }))}
                      className="h-8 text-sm bg-white" />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Input placeholder="CPF" value={novoCliente.cpf} onChange={e => setNovoCliente(n => ({ ...n, cpf: e.target.value }))} className="h-8 text-sm bg-white" />
                    <Input placeholder="RG" value={novoCliente.rg} onChange={e => setNovoCliente(n => ({ ...n, rg: e.target.value }))} className="h-8 text-sm bg-white" />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <p className="text-[10px] text-slate-500 mb-0.5">Data de Nascimento</p>
                      <Input type="date" value={novoCliente.data_nascimento} onChange={e => setNovoCliente(n => ({ ...n, data_nascimento: e.target.value }))} className="h-8 text-sm bg-white" />
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-500 mb-0.5">Estado Civil</p>
                      <select value={novoCliente.estado_civil} onChange={e => setNovoCliente(n => ({ ...n, estado_civil: e.target.value }))}
                        className="h-8 w-full rounded-md border border-input bg-white px-2 text-sm">
                        <option value="">Selecionar...</option>
                        {['Solteiro(a)', 'Casado(a)', 'Divorciado(a)', 'Viúvo(a)', 'União Estável'].map(v => <option key={v} value={v}>{v}</option>)}
                      </select>
                    </div>
                  </div>
                  <Input placeholder="Nome da mãe" value={novoCliente.nome_mae} onChange={e => setNovoCliente(n => ({ ...n, nome_mae: e.target.value }))} className="h-8 text-sm bg-white" />
                  <div className="grid grid-cols-2 gap-2">
                    <Input placeholder="Celular" value={novoCliente.celular} onChange={e => setNovoCliente(n => ({ ...n, celular: e.target.value }))} className="h-8 text-sm bg-white" />
                    <Input placeholder="E-mail" type="email" value={novoCliente.email} onChange={e => setNovoCliente(n => ({ ...n, email: e.target.value }))} className="h-8 text-sm bg-white" />
                  </div>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Input placeholder="CEP *" value={novoCliente.cep}
                        onChange={e => { const v = e.target.value; setNovoCliente(n => ({ ...n, cep: v })); buscarCep(v); }}
                        className="h-8 text-sm bg-white" maxLength={9} />
                      {buscandoCep && <Loader2 className="absolute right-2 top-2 w-3.5 h-3.5 animate-spin text-slate-400" />}
                    </div>
                    <Input placeholder="Número" value={novoCliente.numero} onChange={e => setNovoCliente(n => ({ ...n, numero: e.target.value }))} className="h-8 text-sm bg-white w-24" />
                  </div>
                  <Input placeholder="Rua / Logradouro" value={novoCliente.endereco} onChange={e => setNovoCliente(n => ({ ...n, endereco: e.target.value }))} className="h-8 text-sm bg-white" />
                  <div className="grid grid-cols-3 gap-2">
                    <Input placeholder="Cidade" value={novoCliente.cidade} onChange={e => setNovoCliente(n => ({ ...n, cidade: e.target.value }))} className="h-8 text-sm bg-white col-span-2" />
                    <Input placeholder="UF" value={novoCliente.estado} onChange={e => setNovoCliente(n => ({ ...n, estado: e.target.value }))} className="h-8 text-sm bg-white" maxLength={2} />
                  </div>
                  <Button type="button" size="sm" onClick={salvarNovoCliente} disabled={salvandoCliente}
                    className="w-full h-9 bg-blue-600 hover:bg-blue-700 text-sm gap-1.5">
                    {salvandoCliente ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                    Cadastrar e Selecionar
                  </Button>
                </div>
              )}

              {form.cliente_id && !cadastrandoCliente && (
                <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <F label="CPF">
                    <Input value={form.cliente_cpf} onChange={e => set('cliente_cpf', e.target.value)} placeholder="000.000.000-00" autoComplete="off" />
                  </F>
                  <F label="Telefone">
                    <Input value={form.cliente_telefone} onChange={e => set('cliente_telefone', e.target.value)} autoComplete="off" />
                  </F>
                  <F label="Profissão">
                    <Input value={form.cliente_profissao} onChange={e => set('cliente_profissao', e.target.value)} autoComplete="off" />
                  </F>
                  <F label="Renda (R$)">
                    <Input type="number" value={form.cliente_renda} onChange={e => set('cliente_renda', e.target.value)} autoComplete="off" />
                  </F>
                </div>
              )}
            </div>
          </div>

          {/* Empresa, Filial e Vendedor */}
          <div>
            <h3 className="text-sm font-semibold text-slate-700 mb-3 pb-1 border-b">🏢 Responsáveis</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <F label="Vendedor responsável">
                <Select value={form.vendedor_id || 'none'} onValueChange={v => {
                  if (v === 'none') { set('vendedor_id', ''); set('vendedor_nome', ''); return; }
                  const vend = vendedores.find(x => x.id === v);
                  set('vendedor_id', v); set('vendedor_nome', vend?.nome || '');
                }}>
                  <SelectTrigger><SelectValue placeholder="Selecionar vendedor" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nenhum</SelectItem>
                    {vendedores.map(v => <SelectItem key={v.id} value={v.id}>{v.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </F>
              <F label="Filial">
                <Select value={form.filial_id || 'none'} onValueChange={v => {
                  if (v === 'none') { set('filial_id', ''); set('filial_nome', ''); return; }
                  const fil = filiais.find(x => x.id === v);
                  set('filial_id', v); set('filial_nome', fil?.nome || '');
                }}>
                  <SelectTrigger><SelectValue placeholder="Selecionar filial" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nenhuma</SelectItem>
                    {filiais.map(f => <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </F>
              <F label="Status da proposta *">
                <Select value={form.status} onValueChange={v => set('status', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </F>
            </div>
          </div>

          {/* Dados do veículo */}
          <div>
            <h3 className="text-sm font-semibold text-slate-700 mb-3 pb-1 border-b">🚗 Dados do Veículo</h3>
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
              <F label="Placa">
                <div className="flex gap-2">
                  <Input value={form.veiculo_placa} onChange={e => set('veiculo_placa', e.target.value.toUpperCase())} placeholder="ABC-1234" maxLength={8} className="font-mono tracking-widest uppercase" />
                  <Button type="button" onClick={consultarPlaca} disabled={buscandoPlaca}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-3 shrink-0">
                    {buscandoPlaca ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                  </Button>
                </div>
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
              <F label="Valor do veículo (R$)">
                <Input type="number" value={form.valor_veiculo} onChange={e => set('valor_veiculo', e.target.value)} />
              </F>
            </div>
          </div>

          {/* Dados do financiamento */}
          <div>
            <h3 className="text-sm font-semibold text-slate-700 mb-3 pb-1 border-b">💰 Dados do Financiamento</h3>
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

          {/* Tarifa e Custos */}
          <div>
            <h3 className="text-sm font-semibold text-slate-700 mb-3 pb-1 border-b">🏦 Tarifa Cadastral e Custos Operacionais</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <F label="Tarifa Cadastral (R$)">
                <Input type="number" value={form.tarifa_cadastral} onChange={e => set('tarifa_cadastral', e.target.value)}
                  placeholder="0,00" />
                <p className="text-xs text-slate-400">Gera Receita Prevista automaticamente</p>
              </F>
              <F label="Status da Tarifa">
                <Select value={form.tarifa_cadastral_status} onValueChange={v => set('tarifa_cadastral_status', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="aguardando_pagamento">Aguardando Pagamento</SelectItem>
                    <SelectItem value="recebida">Recebida</SelectItem>
                    <SelectItem value="cancelada">Cancelada</SelectItem>
                  </SelectContent>
                </Select>
              </F>
              <F label="Custos Operacionais (R$)">
                <Input type="number" value={form.custos_operacionais} onChange={e => set('custos_operacionais', e.target.value)}
                  placeholder="0,00" />
                <p className="text-xs text-slate-400">Gera Despesa automaticamente</p>
              </F>
            </div>
          </div>

          {/* Datas */}
          <div>
            <h3 className="text-sm font-semibold text-slate-700 mb-3 pb-1 border-b">📅 Datas</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <F label="Data da proposta">
                <Input type="date" value={form.data_proposta} onChange={e => set('data_proposta', e.target.value)} />
              </F>
              <F label="Data da aprovação">
                <Input type="date" value={form.data_aprovacao} onChange={e => set('data_aprovacao', e.target.value)} />
              </F>
              <F label="Data de pagamento pelo banco">
                <Input type="date" value={form.data_pagamento} onChange={e => set('data_pagamento', e.target.value)} />
              </F>
            </div>
          </div>

          <F label="Observações">
            <Textarea value={form.observacoes} onChange={e => set('observacoes', e.target.value)} rows={3} />
          </F>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={saving} className="gap-1.5 bg-[#10353C] hover:bg-[#10353C]/90">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {proposta ? 'Salvar alterações' : 'Cadastrar proposta'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}