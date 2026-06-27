import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { X, Calculator, Calendar, Building2, ChevronDown, Paperclip } from 'lucide-react';
import { format, parseISO, subDays } from 'date-fns';
import { useIsMobile } from '@/hooks/use-mobile';

const fmtMoeda = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

export default function ReceberPagarModal({ open, onClose, item, tipo, user, onConfirmar }) {
  const isMobile = useIsMobile();
  const editando = !!item;
  const titulo = tipo === 'receita' 
    ? 'Deseja efetivar esta receita?' 
    : 'Deseja efetivar esta despesa?';
  
  const subtitle = tipo === 'receita'
    ? 'Ao efetivar esta receita, o valor será creditado na conta.'
    : 'Ao efetivar esta despesa, o valor será descontado na conta.';

  const [valor, setValor] = useState('');
  const [dataSelecionada, setDataSelecionada] = useState('hoje');
  const [dataPersonalizada, setDataPersonalizada] = useState('');
  const [contaBancariaId, setContaBancariaId] = useState('');
  const [contas, setContas] = useState([]);
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
        observacao: observacao.trim(),
        comprovante_url: comprovanteUrl || null,
        comprovante_nome: comprovanteNome || null,
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

  const ConteudoModal = () => (
    <div className="space-y-4">
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

      {/* Observação */}
      <div className="py-3">
        <label className="text-sm font-medium text-slate-700 mb-2 block">Observação (opcional)</label>
        <textarea
          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm min-h-[80px] focus:outline-none focus:ring-2 focus:ring-slate-300 resize-none"
          value={observacao}
          onChange={e => setObservacao(e.target.value)}
          placeholder="Detalhes adicionais..."
        />
      </div>

      {/* Anexar Comprovante */}
      <div className="py-3">
        <label className="text-sm font-medium text-slate-700 mb-2 block">Comprovante (opcional)</label>
        {comprovanteUrl ? (
          <div className="flex items-center gap-2 border rounded-lg p-3 bg-slate-50">
            <Paperclip className="w-4 h-4 text-slate-400" />
            <span className="text-sm text-slate-600 flex-1 truncate">{comprovanteNome}</span>
            <Button 
              size="sm" 
              variant="ghost" 
              className="h-7 px-2" 
              onClick={() => { setComprovanteUrl(''); setComprovanteNome(''); }}
            >
              <X className="w-3.5 h-3.5" />
            </Button>
          </div>
        ) : (
          <label className="cursor-pointer flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700 border border-dashed rounded-lg p-3 justify-center hover:bg-slate-50 transition-colors">
            <Paperclip className="w-4 h-4" />
            {uploading ? 'Enviando...' : 'Escolher arquivo (PDF, JPG, PNG)'}
            <input type="file" className="hidden" onChange={handleUpload} disabled={uploading} accept=".pdf,.jpg,.jpeg,.png" />
          </label>
        )}
      </div>

      {/* Footer */}
      <div className="bg-slate-50 px-6 py-4 flex items-center justify-end gap-3 border-t border-slate-100 -mx-6 -mb-6 mt-6">
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
    </div>
  );

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={onClose}>
        <SheetContent side="bottom" className="h-[90vh] max-h-[90vh] p-0 flex flex-col">
          <SheetHeader className="px-6 py-4 border-b border-slate-100">
            <SheetTitle className="text-lg font-semibold text-slate-800">{titulo}</SheetTitle>
            <p className="text-sm text-slate-500 mt-1">{subtitle}</p>
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
      <DialogContent className="max-w-md p-0 overflow-hidden rounded-xl shadow-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader className="px-6 py-4 border-b border-slate-100">
          <DialogTitle className="text-lg font-semibold text-slate-800">{titulo}</DialogTitle>
          <p className="text-sm text-slate-500 mt-1">{subtitle}</p>
        </DialogHeader>
        <div className="px-6 py-4">
          <ConteudoModal />
        </div>
      </DialogContent>
    </Dialog>
  );
}