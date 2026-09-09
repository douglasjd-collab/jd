import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { X, Calculator, Calendar, Building2, Paperclip, Upload, Check } from 'lucide-react';
import { subDays } from 'date-fns';
import { useIsMobile } from '@/hooks/use-mobile';

const fmtMoeda = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
const parseMoeda = (v) => {
  const texto = String(v ?? '').replace(/\s/g, '').replace('R$', '');
  const normalizado = texto.includes(',') ? texto.replace(/\./g, '').replace(',', '.') : texto;
  const numero = Number(normalizado);
  return Number.isFinite(numero) ? numero : 0;
};

export default function ReceberPagarModal({ open, onClose, item, tipo, user, onConfirmar }) {
  const isMobile = useIsMobile();
  const corPrimaria = tipo === 'receita' ? '#10b981' : '#e03131';
  const corTexto = tipo === 'receita' ? 'text-green-600' : 'text-red-600';
  const bgIcon = tipo === 'receita' ? 'bg-green-100' : 'bg-red-100';

  const [valor, setValor] = useState('');
  const [jurosMulta, setJurosMulta] = useState('');
  const [desconto, setDesconto] = useState('');
  const [dataSelecionada, setDataSelecionada] = useState('hoje');
  const [dataPersonalizada, setDataPersonalizada] = useState('');
  const [contaBancariaId, setContaBancariaId] = useState('');
  const [contas, setContas] = useState([]);
  const [saldoConta, setSaldoConta] = useState(0);
  const [observacao, setObservacao] = useState('');
  const [comprovanteUrl, setComprovanteUrl] = useState('');
  const [comprovanteNome, setComprovanteNome] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Carregar contas bancárias
  useEffect(() => {
    if (!open) return;
    const carregarContas = async () => {
      try {
        const contasData = await base44.entities.MeuFinanceiroContaBancaria.filter(
          { usuario_id: user.id, empresa_id: user.empresa_id, status: 'ativa' }, 
          'nome_conta', 
          30
        );
        setContas(contasData);
        if (contasData.length > 0 && !contaBancariaId) {
          setContaBancariaId(contasData[0].id);
          setSaldoConta(contasData[0].saldo_atual || 0);
        }
      } catch (e) { console.error(e); }
    };
    carregarContas();
  }, [open, user]);

  // Atualizar saldo quando mudar conta
  useEffect(() => {
    if (!contaBancariaId) return;
    const conta = contas.find(c => c.id === contaBancariaId);
    if (conta) {
      setSaldoConta(conta.saldo_atual || 0);
    }
  }, [contaBancariaId, contas]);

  // Preencher formulário ao editar
  useEffect(() => {
    if (!open || !item) return;
    
    setValor(item.valor || 0);
    setJurosMulta(item.juros_multa ? String(item.juros_multa).replace('.', ',') : '');
    setDesconto(item.desconto ? String(item.desconto).replace('.', ',') : '');
    const hoje = new Date().toISOString().split('T')[0];
    const dataRef = item.data_recebimento || item.data_pagamento || hoje;
    const ontem = subDays(new Date(), 1).toISOString().split('T')[0];
    
    if (dataRef === hoje) {
      setDataSelecionada('hoje');
    } else if (dataRef === ontem) {
      setDataSelecionada('ontem');
    } else if (dataRef) {
      setDataSelecionada('outros');
      setDataPersonalizada(dataRef);
    } else {
      setDataSelecionada('hoje');
    }
    
    setContaBancariaId(item.conta_bancaria_id || '');
    setObservacao(item.observacao || '');
    setComprovanteUrl(item.comprovante_url || '');
    setComprovanteNome(item.comprovante_nome || '');
  }, [open, item]);

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      setComprovanteUrl(file_url);
      setComprovanteNome(file.name);
      toast.success('Arquivo enviado!');
    } catch (err) { 
      toast.error('Erro ao enviar arquivo'); 
    } finally { 
      setUploading(false); 
      e.target.value = ''; 
    }
  };

  const getDataFinal = () => {
    if (dataSelecionada === 'hoje') return new Date().toISOString().split('T')[0];
    if (dataSelecionada === 'ontem') return subDays(new Date(), 1).toISOString().split('T')[0];
    return dataPersonalizada || new Date().toISOString().split('T')[0];
  };

  const dataPagamentoAtual = getDataFinal();
  const dataVencimento = item?.data_vencimento || item?.data || '';
  const pagamentoAtrasado = tipo === 'despesa' && !!dataVencimento && dataPagamentoAtual > dataVencimento;
  const pagamentoAntecipado = tipo === 'despesa' && !!dataVencimento && dataPagamentoAtual < dataVencimento;
  const valorOriginal = Number(item?.valor || 0);
  const jurosAplicado = pagamentoAtrasado ? Math.max(0, parseMoeda(jurosMulta)) : 0;
  const descontoAplicado = pagamentoAntecipado ? Math.max(0, parseMoeda(desconto)) : 0;
  const valorEfetivamentePago = Math.max(0, valorOriginal + jurosAplicado - descontoAplicado);

  const handleConfirmar = async () => {
    if (!contaBancariaId) {
      toast.error('Selecione uma conta bancária');
      return;
    }
    if (descontoAplicado > valorOriginal + jurosAplicado) {
      toast.error('O desconto não pode ser maior que o valor da despesa');
      return;
    }

    setSalvando(true);
    try {
      const dataFinal = getDataFinal();
      const entidade = tipo === 'receita' ? 'MeuFinanceiroReceita' : 'MeuFinanceiroDespesa';
      const campoStatus = tipo === 'receita' ? 'status' : 'status';
      const campoData = tipo === 'receita' ? 'data_recebimento' : 'data_pagamento';
      const novoStatus = tipo === 'receita' ? 'recebida' : 'pago';

      await base44.entities[entidade].update(item.id, {
        [campoStatus]: novoStatus,
        [campoData]: dataFinal,
        conta_bancaria_id: contaBancariaId,
        observacao: observacao.trim(),
        comprovante_url: comprovanteUrl || null,
        comprovante_nome: comprovanteNome || null,
        ...(tipo === 'despesa' ? {
          valor_original: valorOriginal,
          juros_multa: jurosAplicado,
          desconto: descontoAplicado,
          valor_pago: valorEfetivamentePago,
        } : {}),
      });

      // Atualizar saldo da conta bancária
      const conta = await base44.entities.MeuFinanceiroContaBancaria.get(contaBancariaId);
      if (conta) {
        const ajuste = tipo === 'receita' ? (item.valor || 0) : -valorEfetivamentePago;
        const novoSaldo = (conta.saldo_atual || 0) + ajuste;
        await base44.entities.MeuFinanceiroContaBancaria.update(contaBancariaId, { saldo_atual: novoSaldo });
      }

      toast.success(tipo === 'receita' ? 'Recebimento confirmado!' : 'Pagamento confirmado!');
      onConfirmar();
      onClose();
    } catch (e) { 
      toast.error('Erro ao confirmar'); 
      console.error(e); 
    } finally { 
      setSalvando(false); 
    }
  };

  const titulo = tipo === 'receita' 
    ? 'Deseja efetivar esta receita?' 
    : 'Deseja efetivar esta despesa?';
  
  const subtitle = tipo === 'receita'
    ? 'Ao efetivar esta receita, o valor será creditado na conta.'
    : 'Ao efetivar esta despesa, o valor será descontado na conta.';

  const labelValor = tipo === 'receita' ? 'Valor da receita' : 'Valor da despesa';
  const labelData = tipo === 'receita' ? 'Data do recebimento' : 'Data do pagamento';
  const labelConta = 'Conta bancária';
  const btnConfirmar = tipo === 'receita' ? 'Receber receita' : 'Pagar despesa';

  const ConteudoModal = () => (
    <div className="space-y-4">
      {/* Valor e Moeda */}
      <div className="bg-[#F9F7F7] rounded-lg p-4">
        <div className="flex items-center">
          <div className="flex-[3] pr-4">
            <p className="text-xs text-[#757575] mb-1">{labelValor}</p>
            <p className={`text-3xl font-bold ${corTexto}`}>{fmtMoeda(valor)}</p>
          </div>
          <div className="w-px h-10 bg-[#E0E0E0]"></div>
          <div className="flex-1 pl-4">
            <p className="text-xs text-[#757575] mb-1">Moeda</p>
            <div className="flex items-center gap-1">
              <span className="font-semibold text-[#263238]">BRL</span>
              <select className="bg-transparent text-sm outline-none cursor-pointer text-[#263238]">
                <option value="BRL">BRL</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Data */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <div className={`w-6 h-6 rounded ${bgIcon} flex items-center justify-center`}>
            <Calendar className={`w-3.5 h-3.5 ${corTexto}`} />
          </div>
          <label className="text-sm font-semibold text-slate-700">{labelData}</label>
        </div>
        <div className="flex gap-2 mb-2">
          <button
            onClick={() => setDataSelecionada('hoje')}
            className={`flex-1 py-2 rounded-full text-sm font-medium transition-all ${
              dataSelecionada === 'hoje' 
                ? 'bg-slate-200 text-slate-700' 
                : 'bg-transparent text-slate-600 hover:bg-slate-100'
            }`}
          >
            Hoje
          </button>
          <button
            onClick={() => setDataSelecionada('ontem')}
            className={`flex-1 py-2 rounded-full text-sm font-medium transition-all ${
              dataSelecionada === 'ontem' 
                ? 'bg-slate-200 text-slate-700' 
                : 'bg-transparent text-slate-600 hover:bg-slate-100'
            }`}
          >
            Ontem
          </button>
          <button
            onClick={() => setDataSelecionada('outros')}
            className={`flex-1 py-2 rounded-full text-sm font-medium transition-all ${
              dataSelecionada === 'outros' 
                ? 'text-white' 
                : 'bg-transparent text-slate-600 hover:bg-slate-100'
            }`}
            style={{ backgroundColor: dataSelecionada === 'outros' ? corPrimaria : 'transparent' }}
          >
            Outros...
          </button>
        </div>
        {dataSelecionada === 'outros' && (
          <div className="relative">
            <input
              type="date"
              value={dataPersonalizada}
              onChange={e => setDataPersonalizada(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
            />
            <Calendar className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
          </div>
        )}
      </div>

      {/* Ajustes por data de pagamento — somente despesas */}
      {tipo === 'despesa' && (
        <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
          {pagamentoAtrasado && (
            <div>
              <label className="text-sm font-semibold text-red-700">Juros/Multa por atraso</label>
              <div className="relative mt-1.5">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-500">R$</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={jurosMulta}
                  onChange={(e) => setJurosMulta(e.target.value)}
                  placeholder="0,00"
                  className="w-full rounded-lg border border-red-200 bg-white py-2.5 pl-10 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-200"
                />
              </div>
              <p className="mt-1 text-xs text-red-600">Pagamento após o vencimento de {dataVencimento.split('-').reverse().join('/')}.</p>
            </div>
          )}

          {pagamentoAntecipado && (
            <div>
              <label className="text-sm font-semibold text-green-700">Desconto por antecipação</label>
              <div className="relative mt-1.5">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-500">R$</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={desconto}
                  onChange={(e) => setDesconto(e.target.value)}
                  placeholder="0,00"
                  className="w-full rounded-lg border border-green-200 bg-white py-2.5 pl-10 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-200"
                />
              </div>
              <p className="mt-1 text-xs text-green-600">Pagamento antes do vencimento de {dataVencimento.split('-').reverse().join('/')}.</p>
            </div>
          )}

          <div className="space-y-1 border-t border-slate-200 pt-3 text-sm">
            <div className="flex justify-between text-slate-600"><span>Valor original</span><span>{fmtMoeda(valorOriginal)}</span></div>
            {jurosAplicado > 0 && <div className="flex justify-between text-red-600"><span>Juros/Multa</span><span>+ {fmtMoeda(jurosAplicado)}</span></div>}
            {descontoAplicado > 0 && <div className="flex justify-between text-green-600"><span>Desconto</span><span>- {fmtMoeda(descontoAplicado)}</span></div>}
            <div className="flex justify-between pt-1 text-base font-bold text-slate-800"><span>Total a pagar</span><span>{fmtMoeda(valorEfetivamentePago)}</span></div>
          </div>
        </div>
      )}

      {/* Conta Bancária */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <div className={`w-6 h-6 rounded ${bgIcon} flex items-center justify-center`}>
            <Building2 className={`w-3.5 h-3.5 ${corTexto}`} />
          </div>
          <label className="text-sm font-semibold text-slate-700">{labelConta}</label>
        </div>
        <Select value={contaBancariaId} onValueChange={setContaBancariaId}>
          <SelectTrigger className="w-full border-2 border-yellow-400 bg-white rounded-lg px-3 py-2.5 h-auto">
            <div className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-slate-400" />
              <SelectValue placeholder="Selecione a conta..." />
            </div>
          </SelectTrigger>
          <SelectContent>
            {contas.map(c => (
              <SelectItem key={c.id} value={c.id}>
                <div className="flex items-center gap-2">
                  {c.logo_url ? (
                    <img src={c.logo_url} alt={c.banco} className="w-4 h-4 object-contain" />
                  ) : (
                    <Building2 className="w-3 h-3" />
                  )}
                  <span>{c.nome_conta}</span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-slate-500 mt-1">
          Saldo atual: <span className="text-green-600 font-semibold">{fmtMoeda(saldoConta)}</span>
        </p>
      </div>

      {/* Observação */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <div className={`w-6 h-6 rounded ${bgIcon} flex items-center justify-center`}>
            <Paperclip className={`w-3.5 h-3.5 ${corTexto}`} />
          </div>
          <label className="text-sm font-semibold text-slate-700">Observação (opcional)</label>
        </div>
        <div className="relative">
          <textarea
            className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm min-h-[80px] focus:outline-none focus:ring-2 focus:ring-slate-300 resize-none"
            value={observacao}
            onChange={e => setObservacao(e.target.value)}
            placeholder="Detalhes adicionais..."
          />
          <span className="text-xs text-slate-400 absolute bottom-2 right-3">
            {observacao.length}/250
          </span>
        </div>
      </div>

      {/* Comprovante */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <div className={`w-6 h-6 rounded ${bgIcon} flex items-center justify-center`}>
            <Paperclip className={`w-3.5 h-3.5 ${corTexto}`} />
          </div>
          <label className="text-sm font-semibold text-slate-700">Comprovante (opcional)</label>
        </div>
        {comprovanteUrl ? (
          <div className="flex items-center gap-2 border border-slate-200 rounded-lg p-2 bg-slate-50">
            <Paperclip className="w-3 h-3 text-slate-400" />
            <span className="text-xs text-slate-600 flex-1 truncate">{comprovanteNome}</span>
            <Button 
              size="sm" 
              variant="ghost" 
              className="h-6 w-6 p-0" 
              onClick={() => { setComprovanteUrl(''); setComprovanteNome(''); }}
            >
              <X className="w-3 h-3" />
            </Button>
          </div>
        ) : (
          <label className="cursor-pointer flex items-center gap-3 border-2 border-dashed rounded-lg px-4 py-3 hover:bg-slate-50 transition-colors" style={{ borderColor: corPrimaria }}>
            <Upload className="w-5 h-5 flex-shrink-0" style={{ color: corPrimaria }} />
            <div>
              <p className="text-sm font-semibold text-slate-700">Clique para anexar ou arraste o arquivo aqui</p>
              <p className="text-xs text-slate-500">PDF, JPG, PNG (máx. 10MB)</p>
            </div>
            <input type="file" className="hidden" onChange={handleUpload} disabled={uploading} accept=".pdf,.jpg,.jpeg,.png" />
          </label>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center gap-3 pt-4 border-t border-slate-100">
        <Button 
          variant="outline" 
          onClick={onClose} 
          disabled={salvando}
          className="flex-1 h-11 rounded-lg border-slate-300 text-slate-700 hover:bg-slate-50"
        >
          Cancelar
        </Button>
        <Button 
          onClick={handleConfirmar} 
          disabled={salvando}
          className="flex-[2] h-11 rounded-lg text-white font-semibold shadow-lg flex items-center justify-center gap-2"
          style={{ backgroundColor: corPrimaria }}
        >
          <Check className="w-4 h-4" />
          {salvando ? 'Confirmando...' : btnConfirmar}
        </Button>
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={onClose}>
        <SheetContent side="bottom" className="h-[95vh] max-h-[95vh] p-0 flex flex-col">
          <SheetHeader className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-lg ${bgIcon} flex items-center justify-center`}>
                <Calculator className={`w-5 h-5 ${corTexto}`} />
              </div>
              <div>
                <SheetTitle className="text-lg font-bold text-slate-800">{titulo}</SheetTitle>
                <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>
              </div>
            </div>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto px-6 py-4">
            <ConteudoModal />
          </div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent showCloseButton={false} className="max-w-lg p-0 rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg ${bgIcon} flex items-center justify-center`}>
              <Calculator className={`w-5 h-5 ${corTexto}`} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-800">{titulo}</h2>
              <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="w-8 h-8 rounded-full border border-slate-300 flex items-center justify-center text-slate-500 hover:bg-slate-100 hover:border-slate-400 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-4">
          <ConteudoModal />
        </div>
      </DialogContent>
    </Dialog>
  );
}