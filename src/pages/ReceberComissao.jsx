import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Loader2, Search, CheckCircle2 } from 'lucide-react';
import { toast } from 'react-hot-toast';

const fmt = (v) => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export default function ReceberComissao() {
  const [busca, setBusca] = useState('');
  const [isBuscando, setIsBuscando] = useState(false);
  const [contratos, setContratos] = useState([]);
  const [contratoSelecionado, setContratoSelecionado] = useState(null);
  const [formaRecebimento, setFormaRecebimento] = useState('percentual');
  const [percentual, setPercentual] = useState('60');
  const [valor, setValor] = useState('');
  const [dataRecebimento, setDataRecebimento] = useState('');
  const [numeroParcela, setNumeroParcela] = useState('');
  const [observacao, setObservacao] = useState('');
  const [isSalvando, setIsSalvando] = useState(false);

  const valorCalculado =
    contratoSelecionado && percentual
      ? (contratoSelecionado.valor_base_comissao * Number(percentual || 0)) / 100
      : 0;

  const handleBuscarContrato = async () => {
    if (!busca.trim()) {
      toast.error('Digite algo para buscar');
      return;
    }

    try {
      setIsBuscando(true);
      const { data } = await base44.functions.invoke('buscarContratosComissao', { termo: busca });
      setContratos(data || []);
      if (!data || data.length === 0) toast.info('Nenhum contrato encontrado');
    } catch (err) {
      console.error(err);
      toast.error('Erro ao buscar contratos');
    } finally {
      setIsBuscando(false);
    }
  };

  const handleSelecionarContrato = (id) => {
    const contrato = contratos.find((c) => c.id === id) || null;
    setContratoSelecionado(contrato);
    setPercentual('60');
    setValor('');
    setNumeroParcela('');
    setDataRecebimento('');
    setObservacao('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!contratoSelecionado) {
      toast.error('Selecione um contrato');
      return;
    }
    if (!dataRecebimento) {
      toast.error('Informe a data de recebimento');
      return;
    }
    if (!numeroParcela) {
      toast.error('Informe o número da parcela');
      return;
    }

    let valorComissaoFinal = 0;
    if (formaRecebimento === 'percentual') {
      valorComissaoFinal = valorCalculado;
      if (!percentual) {
        toast.error('Informe o percentual');
        return;
      }
    } else {
      if (!valor) {
        toast.error('Informe o valor');
        return;
      }
      valorComissaoFinal = Number(String(valor).replace('.', '').replace(',', '.'));
    }

    if (valorComissaoFinal <= 0) {
      toast.error('Valor deve ser maior que zero');
      return;
    }

    try {
      setIsSalvando(true);
      const payload = {
        venda_id: contratoSelecionado.venda_id,
        cliente_id: contratoSelecionado.cliente_id,
        vendedor_id: contratoSelecionado.vendedor_id,
        administradora_id: contratoSelecionado.administradora_id,
        empresa_id: contratoSelecionado.empresa_id,
        numero_contrato: contratoSelecionado.numero_contrato,
        grupo: contratoSelecionado.grupo,
        cota: contratoSelecionado.cota,
        cliente_nome: contratoSelecionado.cliente_nome,
        administradora_nome: contratoSelecionado.administradora_nome,
        vendedor_nome: contratoSelecionado.vendedor_nome,
        forma_recebimento: formaRecebimento,
        percentual: formaRecebimento === 'percentual' ? Number(percentual) : null,
        valor_comissao: valorComissaoFinal,
        data_recebimento: dataRecebimento,
        numero_parcela: Number(numeroParcela),
        observacao,
        origem: 'manual',
      };

      await base44.functions.invoke('receberComissaoManual', payload);
      toast.success('Comissão registrada com sucesso!');
      
      setContratoSelecionado(null);
      setBusca('');
      setContratos([]);
      setValor('');
      setObservacao('');
    } catch (err) {
      console.error(err);
      toast.error('Erro ao registrar comissão');
    } finally {
      setIsSalvando(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Receber Comissão</h1>
        <p className="text-slate-500 text-sm mt-1">Registre manualmente o recebimento de comissões de consórcio.</p>
      </div>

      {/* Buscar contrato */}
      <Card>
        <CardHeader>
          <CardTitle>Localizar contrato</CardTitle>
          <CardDescription>Busque pelo contrato, cliente ou grupo/cota</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 md:flex-row md:items-end">
          <div className="flex-1 space-y-2">
            <Label>Buscar</Label>
            <div className="flex gap-2">
              <Input
                placeholder="Ex.: 004400, 8310/693 ou nome do cliente"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleBuscarContrato()}
              />
              <Button onClick={handleBuscarContrato} disabled={isBuscando} className="bg-[#10353C] hover:bg-[#1a5060]">
                {isBuscando ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Buscando...
                  </>
                ) : (
                  <>
                    <Search className="mr-2 h-4 w-4" />
                    Buscar
                  </>
                )}
              </Button>
            </div>
          </div>
          {contratos.length > 0 && (
            <div className="w-full md:w-72 space-y-2">
              <Label>Contratos encontrados</Label>
              <Select value={contratoSelecionado?.id ?? ''} onValueChange={handleSelecionarContrato}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um contrato" />
                </SelectTrigger>
                <SelectContent>
                  {contratos.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.numero_contrato} • {c.cliente_nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dados do contrato */}
      {contratoSelecionado && (
        <Card>
          <CardHeader>
            <CardTitle>Contrato selecionado</CardTitle>
            <CardDescription>Confira os dados antes de registrar</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-3">
            <div>
              <Label className="text-xs text-slate-500">Cliente</Label>
              <p className="font-semibold text-slate-900">{contratoSelecionado.cliente_nome}</p>
            </div>
            <div>
              <Label className="text-xs text-slate-500">Administradora</Label>
              <p className="font-semibold text-slate-900">{contratoSelecionado.administradora_nome}</p>
            </div>
            <div>
              <Label className="text-xs text-slate-500">Vendedor</Label>
              <p className="font-semibold text-slate-900">{contratoSelecionado.vendedor_nome}</p>
            </div>
            <div>
              <Label className="text-xs text-slate-500">Contrato</Label>
              <p className="font-semibold text-slate-900">{contratoSelecionado.numero_contrato}</p>
            </div>
            <div>
              <Label className="text-xs text-slate-500">Grupo / Cota</Label>
              <p className="font-semibold text-slate-900">
                {contratoSelecionado.grupo} / {contratoSelecionado.cota}
              </p>
            </div>
            <div>
              <Label className="text-xs text-slate-500">Base de comissão</Label>
              <p className="font-semibold text-slate-900">{fmt(contratoSelecionado.valor_base_comissao)}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Formulário */}
      {contratoSelecionado && (
        <form onSubmit={handleSubmit}>
          <Card>
            <CardHeader>
              <CardTitle>Registrar recebimento</CardTitle>
              <CardDescription>Informe os dados da comissão recebida</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Forma de recebimento */}
              <div className="space-y-3">
                <Label>Forma de recebimento</Label>
                <div className="flex gap-6">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      value="percentual"
                      checked={formaRecebimento === 'percentual'}
                      onChange={(e) => setFormaRecebimento(e.target.value)}
                      className="w-4 h-4"
                    />
                    <span>Comissão em %</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      value="valor"
                      checked={formaRecebimento === 'valor'}
                      onChange={(e) => setFormaRecebimento(e.target.value)}
                      className="w-4 h-4"
                    />
                    <span>Comissão em valor (R$)</span>
                  </label>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                {formaRecebimento === 'percentual' && (
                  <>
                    <div className="space-y-2">
                      <Label>Percentual (%)</Label>
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        step={0.01}
                        value={percentual}
                        onChange={(e) => setPercentual(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <Label>Valor calculado</Label>
                      <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                        <span className="text-sm text-slate-500">Comissão estimada:</span>
                        <span className="font-bold text-slate-900">{fmt(valorCalculado)}</span>
                      </div>
                    </div>
                  </>
                )}

                {formaRecebimento === 'valor' && (
                  <div className="space-y-2">
                    <Label>Valor da comissão (R$)</Label>
                    <Input placeholder="Ex.: 606,00" value={valor} onChange={(e) => setValor(e.target.value)} />
                  </div>
                )}

                <div className="space-y-2">
                  <Label>Data de recebimento</Label>
                  <Input type="date" value={dataRecebimento} onChange={(e) => setDataRecebimento(e.target.value)} />
                </div>

                <div className="space-y-2">
                  <Label>Número da parcela</Label>
                  <Input
                    type="number"
                    min={1}
                    value={numeroParcela}
                    onChange={(e) => setNumeroParcela(e.target.value)}
                    placeholder="Ex.: 3"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Observações (opcional)</Label>
                <Input
                  placeholder="Ex.: ajuste manual, diferença de rateio"
                  value={observacao}
                  onChange={(e) => setObservacao(e.target.value)}
                />
              </div>
            </CardContent>
            <CardFooter className="flex justify-between gap-4">
              <div className="flex items-start gap-2 text-sm text-slate-600">
                <CheckCircle2 className="h-4 w-4 mt-0.5 flex-shrink-0 text-green-600" />
                <span>Ao confirmar, a proposta e financeiro serão atualizados automaticamente.</span>
              </div>
              <Button type="submit" disabled={isSalvando} className="bg-[#10353C] hover:bg-[#1a5060] text-white">
                {isSalvando ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Registrando...
                  </>
                ) : (
                  'Receber comissão'
                )}
              </Button>
            </CardFooter>
          </Card>
        </form>
      )}
    </div>
  );
}