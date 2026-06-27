import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { X, Calculator, Calendar, Building2, ChevronDown } from 'lucide-react';
import { format, parseISO, subDays } from 'date-fns';

const fmtMoeda = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

export default function ReceberPagarModal({ open, onClose, item, tipo, user, onConfirmar }) {
  const editando = !!item;
  const titulo = tipo === 'receita' 
    ? (item?.status === 'recebida' ? 'Deseja editar este recebimento?' : 'Deseja efetivar esta receita?') 
    : (item?.status === 'pago' ? 'Deseja editar este pagamento?' : 'Deseja efetivar esta despesa?');
  
  const subtitle = tipo === 'receita'
    ? 'Ao efetivar esta receita, o valor será creditado na conta.'
    : 'Ao efetivar esta despesa, o valor será descontado na conta.';

  const [valor, setValor] = useState('');
  const [dataSelecionada, setDataSelecionada] = useState('hoje');
  const [dataPersonalizada, setDataPersonalizada] = useState('');
  const [contaBancariaId, setContaBancariaId] = useState('');
  const [contas, setContas] = useState([]);
  const [salvando, setSalvando] = useState(false);

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
        }
      } catch (e) { console.error(e); }
    };
    carregarContas();
  }, [open, user]);

  // Preencher formulário ao editar
  useEffect(() => {
    if (!open || !item) return;
    
    setValor(item.valor || 0);
    const dataRef = item.data_recebimento || item.data_pagamento || item.data || '';
    const hoje = new Date().toISOString().split('T')[0];
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
  }, [open, item]);

  const getDataFinal = () => {
    if (dataSelecionada === 'hoje') return new Date().toISOString().split('T')[0];
    if (dataSelecionada === 'ontem') return subDays(new Date(), 1).toISOString().split('T')[0];
    return dataPersonalizada || new Date().toISOString().split('T')[0];
  };

  const handleConfirmar = async () => {
    if (!contaBancariaId) {
      toast.error('Selecione uma conta bancária');
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
      });

      // Atualizar saldo da conta bancária
      const conta = await base44.entities.MeuFinanceiroContaBancaria.get(contaBancariaId);
      if (conta) {
        const ajuste = tipo === 'receita' ? (item.valor || 0) : -(item.valor || 0);
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

  const corPrimaria = tipo === 'receita' ? 'bg-green-500 hover:bg-green-600' : 'bg-red-500 hover:bg-red-600';
  const corTexto = tipo === 'receita' ? 'text-green-600' : 'text-red-600';
  const corBorda = tipo === 'receita' ? 'border-green-500' : 'border-red-500';

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md p-0 overflow-hidden rounded-xl shadow-2xl">
        {/* Header */}
        <div className="bg-white px-6 py-4 border-b border-slate-100">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-800">{titulo}</h2>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
              <X className="w-5 h-5" />
            </button>
          </div>
          <p className="text-sm text-slate-500 mt-1">{subtitle}</p>
        </div>

        {/* Body */}
        <div className="bg-white px-6 py-4 space-y-4">
          {/* Valor */}
          <div className="flex items-center justify-between py-3 border-b border-slate-100">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-full ${tipo === 'receita' ? 'bg-green-100' : 'bg-red-100'} flex items-center justify-center`}>
                <Calculator className={`w-5 h-5 ${corTexto}`} />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-800">{fmtMoeda(valor)}</p>
                <p className="text-xs text-slate-400">Valor {tipo === 'receita' ? 'da receita' : 'da despesa'}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <span>BRL</span>
              <ChevronDown className="w-4 h-4" />
            </div>
          </div>

          {/* Data */}
          <div className="flex items-center gap-3 py-3 border-b border-slate-100">
            <div className={`w-10 h-10 rounded-full ${tipo === 'receita' ? 'bg-green-100' : 'bg-red-100'} flex items-center justify-center flex-shrink-0`}>
              <Calendar className={`w-5 h-5 ${corTexto}`} />
            </div>
            <div className="flex-1 flex gap-2">
              <button
                onClick={() => setDataSelecionada('hoje')}
                className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
                  dataSelecionada === 'hoje' 
                    ? `${corPrimaria} text-white shadow-md` 
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Hoje
              </button>
              <button
                onClick={() => setDataSelecionada('ontem')}
                className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
                  dataSelecionada === 'ontem' 
                    ? `${corPrimaria} text-white shadow-md` 
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Ontem
              </button>
              <button
                onClick={() => setDataSelecionada('outros')}
                className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
                  dataSelecionada === 'outros' 
                    ? `${corPrimaria} text-white shadow-md` 
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Outros...
              </button>
            </div>
          </div>

          {/* Campo de data personalizada (se selecionado) */}
          {dataSelecionada === 'outros' && (
            <div className="px-14 pb-2">
              <input
                type="date"
                value={dataPersonalizada}
                onChange={e => setDataPersonalizada(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
              />
            </div>
          )}

          {/* Conta Bancária */}
          <div className="flex items-center gap-3 py-3">
            <div className={`w-10 h-10 rounded-full ${tipo === 'receita' ? 'bg-green-100' : 'bg-red-100'} flex items-center justify-center flex-shrink-0`}>
              <Building2 className={`w-5 h-5 ${corTexto}`} />
            </div>
            <div className="flex-1">
              <Select value={contaBancariaId} onValueChange={setContaBancariaId}>
                <SelectTrigger className="w-full border-2 border-yellow-400 bg-white rounded-full px-4 py-3 h-auto">
                  <SelectValue placeholder="Selecione a conta..." />
                </SelectTrigger>
                <SelectContent>
                  {contas.map(c => (
                    <SelectItem key={c.id} value={c.id}>
                      <div className="flex items-center gap-2">
                        {c.logo_url ? (
                          <img src={c.logo_url} alt={c.banco} className="w-5 h-5 object-contain" />
                        ) : (
                          <Building2 className="w-4 h-4" />
                        )}
                        <span>{c.nome_conta} {c.banco && `- ${c.banco}`}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <ChevronDown className="w-5 h-5 text-slate-400" />
          </div>
        </div>

        {/* Footer */}
        <div className="bg-slate-50 px-6 py-4 flex items-center justify-end gap-3 border-t border-slate-100">
          <Button 
            variant="outline" 
            onClick={onClose} 
            disabled={salvando}
            className={`border-2 ${tipo === 'receita' ? 'border-green-500 text-green-600 hover:bg-green-50' : 'border-red-500 text-red-600 hover:bg-red-50'} rounded-full px-6`}
          >
            CANCELAR
          </Button>
          <Button 
            onClick={handleConfirmar} 
            disabled={salvando}
            className={`${corPrimaria} rounded-full px-8 font-semibold shadow-lg`}
          >
            {salvando ? 'CONFIRMANDO...' : (tipo === 'receita' ? 'RECEBER' : 'PAGAR')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}