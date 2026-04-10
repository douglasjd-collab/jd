import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Loader2, CheckCircle, AlertCircle, RefreshCw, Building2, FileText } from 'lucide-react';

const formatCurrency = (v) => v ? `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '-';
const formatCPF = (v) => v ? v.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') : '';

const STATUS_COLORS = {
  simulacao: 'bg-blue-100 text-blue-700',
  saldo_aprovado: 'bg-green-100 text-green-700',
  aprovacao_pendente: 'bg-yellow-100 text-yellow-700',
};

export default function IntegracaoFinantoBank() {
  const [user, setUser] = useState(null);
  const [aba, setAba] = useState('simular'); // simular | propostas
  const [loading, setLoading] = useState(false);
  const [propostas, setPropostas] = useState([]);
  const [loadingPropostas, setLoadingPropostas] = useState(false);
  const [resultadoSimulacao, setResultadoSimulacao] = useState(null);
  const [aprovandoId, setAprovandoId] = useState(null);

  const [form, setForm] = useState({
    client_name: '',
    document: '',
    benefit_number: '',
    amount: '',
    installments: '',
    phone: '',
    email: '',
    type: 'novo',
    source_bank_code: '',
    // Dados bancários
    bank_code: '',
    bank_agency: '',
    bank_account_number: '',
    bank_account_digit: '',
    bank_account_type: 'corrente',
    // Endereço
    street: '',
    number: '',
    complement: '',
    neighborhood: '',
    city: '',
    state: '',
    zip_code: '',
  });

  useEffect(() => {
    base44.auth.me().then(setUser).catch(() => {});
    carregarPropostas();
  }, []);

  const carregarPropostas = async () => {
    setLoadingPropostas(true);
    try {
      const me = await base44.auth.me();
      const filtro = me?.empresa_id
        ? { empresa_id: me.empresa_id, emprestimo_tipo: 'inss' }
        : { emprestimo_tipo: 'inss' };
      const result = await base44.entities.Proposta.filter(filtro, '-created_date', 50);
      setPropostas(result.filter(p => p.finantobank_id));
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingPropostas(false);
    }
  };

  const handleChange = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  const handleSimular = async () => {
    if (!form.client_name || !form.document || !form.benefit_number || !form.amount || !form.installments) {
      toast.error('Preencha todos os campos obrigatórios');
      return;
    }
    setLoading(true);
    setResultadoSimulacao(null);
    try {
      const payload = {
        empresa_id: user?.empresa_id,
        vendedor_id: user?.colaborador_id,
        vendedor_nome: user?.nome_perfil,
        amount: parseFloat(form.amount),
        document: form.document.replace(/\D/g, ''),
        type: form.type,
        installments: parseInt(form.installments),
        benefit_number: form.benefit_number,
        client_name: form.client_name,
        phone: form.phone,
        email: form.email,
        source_bank_code: form.source_bank_code || undefined,
        bank_account: {
          bank_code: form.bank_code,
          agency: form.bank_agency,
          account: form.bank_account_number,
          digit: form.bank_account_digit,
          type: form.bank_account_type,
        },
        address: {
          street: form.street,
          number: form.number,
          complement: form.complement,
          neighborhood: form.neighborhood,
          city: form.city,
          state: form.state,
          zip_code: form.zip_code.replace(/\D/g, ''),
        },
      };

      const resp = await base44.functions.invoke('simularPropostaFinantoINSS', payload);
      setResultadoSimulacao(resp.data);
      toast.success('Simulação realizada e proposta criada no CRM!');
      carregarPropostas();
      setAba('propostas');
    } catch (e) {
      toast.error('Erro ao simular: ' + (e.response?.data?.error || e.message));
    } finally {
      setLoading(false);
    }
  };

  const handleAprovarSaldo = async (proposta) => {
    setAprovandoId(proposta.id);
    try {
      const resp = await base44.functions.invoke('aprovarSaldoFinantoINSS', {
        finantobank_id: proposta.finantobank_id,
        proposta_id: proposta.id,
        amount: proposta.valor_credito,
        document: proposta.cliente_cpf,
        benefit_number: proposta.emprestimo_numero_beneficio,
      });
      if (resp.data.aprovado) {
        toast.success('Saldo aprovado com sucesso!');
      } else {
        toast.warning('Aprovação enviada. Aguarde retorno do banco.');
      }
      carregarPropostas();
    } catch (e) {
      toast.error('Erro ao aprovar saldo: ' + (e.response?.data?.error || e.message));
    } finally {
      setAprovandoId(null);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center">
          <Building2 className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-800">FinantoBank — INSS</h1>
          <p className="text-sm text-slate-500">Simulação e criação de propostas via API</p>
        </div>
      </div>

      {/* Abas */}
      <div className="flex gap-2 border-b">
        <button
          onClick={() => setAba('simular')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${aba === 'simular' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
        >
          Nova Simulação
        </button>
        <button
          onClick={() => { setAba('propostas'); carregarPropostas(); }}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${aba === 'propostas' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
        >
          Propostas FinantoBank ({propostas.length})
        </button>
      </div>

      {/* Aba Simular */}
      {aba === 'simular' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Dados do Cliente */}
          <Card>
            <CardHeader><CardTitle className="text-base">Dados do Cliente</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label>Nome Completo *</Label>
                <Input placeholder="Nome do cliente" value={form.client_name} onChange={e => handleChange('client_name', e.target.value)} />
              </div>
              <div>
                <Label>CPF *</Label>
                <Input placeholder="000.000.000-00" value={form.document} onChange={e => handleChange('document', e.target.value)} maxLength={14} />
              </div>
              <div>
                <Label>Número do Benefício INSS *</Label>
                <Input placeholder="Número do benefício" value={form.benefit_number} onChange={e => handleChange('benefit_number', e.target.value)} />
              </div>
              <div>
                <Label>Telefone</Label>
                <Input placeholder="(11) 99999-9999" value={form.phone} onChange={e => handleChange('phone', e.target.value)} />
              </div>
              <div>
                <Label>E-mail</Label>
                <Input placeholder="email@exemplo.com" value={form.email} onChange={e => handleChange('email', e.target.value)} />
              </div>
            </CardContent>
          </Card>

          {/* Dados da Proposta */}
          <Card>
            <CardHeader><CardTitle className="text-base">Dados da Proposta</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label>Tipo de Operação *</Label>
                <Select value={form.type} onValueChange={v => handleChange('type', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="novo">Novo</SelectItem>
                    <SelectItem value="portabilidade">Portabilidade</SelectItem>
                    <SelectItem value="refinanciamento">Refinanciamento</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {(form.type === 'portabilidade' || form.type === 'refinanciamento') && (
                <div>
                  <Label>Código do Banco Anterior</Label>
                  <Input placeholder="Ex: 341" value={form.source_bank_code} onChange={e => handleChange('source_bank_code', e.target.value)} />
                </div>
              )}
              <div>
                <Label>Valor do Empréstimo (R$) *</Label>
                <Input type="number" placeholder="5000.00" value={form.amount} onChange={e => handleChange('amount', e.target.value)} />
              </div>
              <div>
                <Label>Número de Parcelas *</Label>
                <Input type="number" placeholder="84" value={form.installments} onChange={e => handleChange('installments', e.target.value)} />
              </div>
            </CardContent>
          </Card>

          {/* Dados Bancários */}
          <Card>
            <CardHeader><CardTitle className="text-base">Dados Bancários para Crédito</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>Código do Banco</Label>
                  <Input placeholder="Ex: 341" value={form.bank_code} onChange={e => handleChange('bank_code', e.target.value)} />
                </div>
                <div>
                  <Label>Tipo de Conta</Label>
                  <Select value={form.bank_account_type} onValueChange={v => handleChange('bank_account_type', v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="corrente">Corrente</SelectItem>
                      <SelectItem value="poupanca">Poupança</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>Agência</Label>
                  <Input placeholder="0001" value={form.bank_agency} onChange={e => handleChange('bank_agency', e.target.value)} />
                </div>
                <div>
                  <Label>Conta</Label>
                  <Input placeholder="12345" value={form.bank_account_number} onChange={e => handleChange('bank_account_number', e.target.value)} />
                </div>
              </div>
              <div>
                <Label>Dígito</Label>
                <Input placeholder="0" value={form.bank_account_digit} onChange={e => handleChange('bank_account_digit', e.target.value)} maxLength={1} />
              </div>
            </CardContent>
          </Card>

          {/* Endereço */}
          <Card>
            <CardHeader><CardTitle className="text-base">Endereço</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2">
                  <Label>Rua</Label>
                  <Input placeholder="Rua Principal" value={form.street} onChange={e => handleChange('street', e.target.value)} />
                </div>
                <div>
                  <Label>Número</Label>
                  <Input placeholder="100" value={form.number} onChange={e => handleChange('number', e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>Bairro</Label>
                  <Input placeholder="Centro" value={form.neighborhood} onChange={e => handleChange('neighborhood', e.target.value)} />
                </div>
                <div>
                  <Label>Complemento</Label>
                  <Input placeholder="Apto 10" value={form.complement} onChange={e => handleChange('complement', e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-1">
                  <Label>CEP</Label>
                  <Input placeholder="00000-000" value={form.zip_code} onChange={e => handleChange('zip_code', e.target.value)} maxLength={9} />
                </div>
                <div>
                  <Label>Cidade</Label>
                  <Input placeholder="São Paulo" value={form.city} onChange={e => handleChange('city', e.target.value)} />
                </div>
                <div>
                  <Label>UF</Label>
                  <Input placeholder="SP" value={form.state} onChange={e => handleChange('state', e.target.value)} maxLength={2} />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Botão simular */}
          <div className="md:col-span-2">
            <Button onClick={handleSimular} disabled={loading} className="w-full h-12 text-base bg-blue-600 hover:bg-blue-700">
              {loading ? <><Loader2 className="w-5 h-5 animate-spin mr-2" /> Simulando...</> : 'Simular e Criar Proposta'}
            </Button>
          </div>

          {/* Resultado */}
          {resultadoSimulacao && (
            <div className="md:col-span-2">
              <Card className="border-green-200 bg-green-50">
                <CardContent className="pt-4">
                  <div className="flex items-center gap-2 mb-3">
                    <CheckCircle className="w-5 h-5 text-green-600" />
                    <span className="font-semibold text-green-700">Proposta criada com sucesso!</span>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div><p className="text-slate-500">ID FinantoBank</p><p className="font-mono font-semibold">{resultadoSimulacao.finantobank_id || '-'}</p></div>
                    <div><p className="text-slate-500">ID no CRM</p><p className="font-mono font-semibold">{resultadoSimulacao.proposta_id?.slice(0,8)}...</p></div>
                    <div><p className="text-slate-500">Parcela</p><p className="font-semibold">{formatCurrency(resultadoSimulacao.simulacao?.installment_value)}</p></div>
                    <div><p className="text-slate-500">Status</p><p className="font-semibold">{resultadoSimulacao.simulacao?.status || 'Criado'}</p></div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      )}

      {/* Aba Propostas */}
      {aba === 'propostas' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={carregarPropostas} disabled={loadingPropostas}>
              <RefreshCw className={`w-4 h-4 mr-2 ${loadingPropostas ? 'animate-spin' : ''}`} />
              Atualizar
            </Button>
          </div>

          {loadingPropostas ? (
            <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-blue-600" /></div>
          ) : propostas.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <FileText className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>Nenhuma proposta FinantoBank encontrada</p>
            </div>
          ) : (
            <div className="space-y-3">
              {propostas.map(p => (
                <Card key={p.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="pt-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                        <div>
                          <p className="text-slate-500 text-xs">Cliente</p>
                          <p className="font-semibold">{p.cliente_nome || '-'}</p>
                          <p className="text-xs text-slate-400">{formatCPF(p.cliente_cpf)}</p>
                        </div>
                        <div>
                          <p className="text-slate-500 text-xs">ID FinantoBank</p>
                          <p className="font-mono text-sm">{p.finantobank_id}</p>
                          <p className="text-xs text-slate-400">Tipo: {p.finantobank_tipo || '-'}</p>
                        </div>
                        <div>
                          <p className="text-slate-500 text-xs">Valor / Parcelas</p>
                          <p className="font-semibold">{formatCurrency(p.valor_credito)}</p>
                          <p className="text-xs text-slate-400">{p.emprestimo_prazo}x {formatCurrency(p.finantobank_valor_parcela)}</p>
                        </div>
                        <div>
                          <p className="text-slate-500 text-xs">Status</p>
                          <Badge className={`text-xs ${STATUS_COLORS[p.status_atual] || 'bg-slate-100 text-slate-600'}`}>
                            {p.status_finantobank || p.status || '-'}
                          </Badge>
                          {p.finantobank_saldo_aprovado && (
                            <div className="flex items-center gap-1 mt-1">
                              <CheckCircle className="w-3 h-3 text-green-600" />
                              <span className="text-xs text-green-600">Saldo aprovado</span>
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-col gap-2">
                        {!p.finantobank_saldo_aprovado && p.finantobank_id && (
                          <Button
                            size="sm"
                            className="bg-green-600 hover:bg-green-700 text-white whitespace-nowrap"
                            disabled={aprovandoId === p.id}
                            onClick={() => handleAprovarSaldo(p)}
                          >
                            {aprovandoId === p.id ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Aprovar Saldo'}
                          </Button>
                        )}
                        {p.finantobank_saldo_aprovado && (
                          <Badge className="bg-green-100 text-green-700 text-xs">✓ Saldo Aprovado</Badge>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}