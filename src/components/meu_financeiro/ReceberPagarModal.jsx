import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Loader2, Paperclip, X, Building2 } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const fmtMoeda = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

export default function ReceberPagarModal({ open, onClose, item, tipo, user, onConfirmar }) {
  const editando = !!item;
  const titulo = tipo === 'receita' 
    ? (item?.status === 'recebida' ? 'Editar Recebimento' : 'Receber Receita') 
    : (item?.status === 'pago' ? 'Editar Pagamento' : 'Pagar Despesa');

  const [valor, setValor] = useState('');
  const [statusPago, setStatusPago] = useState(tipo === 'receita' ? item?.status === 'recebida' : item?.status === 'pago');
  const [data, setData] = useState('');
  const [contaBancariaId, setContaBancariaId] = useState('');
  const [observacao, setObservacao] = useState('');
  const [fileUrl, setFileUrl] = useState('');
  const [fileName, setFileName] = useState('');
  const [contas, setContas] = useState([]);
  const [carregando, setCarregando] = useState(false);
  const [uploading, setUploading] = useState(false);
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
      } catch (e) { console.error(e); }
    };
    carregarContas();
  }, [open, user]);

  // Preencher formulário ao editar
  useEffect(() => {
    if (!open || !item) return;
    
    setValor(fmtMoeda(item.valor));
    setStatusPago(tipo === 'receita' ? item.status === 'recebida' : item.status === 'pago');
    setData(item.data_recebimento || item.data_pagamento || item.data || '');
    setContaBancariaId(item.conta_bancaria_id || '');
    setObservacao(item.observacao || '');
    setFileUrl(item.comprovante_url || '');
    setFileName(item.comprovante_nome || '');
  }, [open, item, tipo]);

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      setFileUrl(file_url);
      setFileName(file.name);
      toast.success('Arquivo enviado!');
    } catch (err) { 
      toast.error('Erro ao enviar arquivo'); 
    } finally { 
      setUploading(false); 
      e.target.value = ''; 
    }
  };

  const handleConfirmar = async () => {
    if (!statusPago) {
      toast.error(tipo === 'receita' ? 'Marque como recebida' : 'Marque como paga');
      return;
    }
    
    if (!data) {
      toast.error('Informe a data');
      return;
    }

    setSalvando(true);
    try {
      const payload = {
        observacao: observacao.trim(),
        conta_bancaria_id: contaBancariaId || null,
        comprovante_url: fileUrl || null,
      };

      if (tipo === 'receita') {
        payload.status = statusPago ? 'recebida' : 'pendente';
        payload.data_recebimento = statusPago ? data : null;
      } else {
        payload.status = statusPago ? 'pago' : 'pendente';
        payload.data_pagamento = statusPago ? data : null;
      }

      const entidade = tipo === 'receita' ? 'MeuFinanceiroReceita' : 'MeuFinanceiroDespesa';
      await base44.entities[entidade].update(item.id, payload);

      // Atualizar saldo da conta bancária
      if (contaBancariaId && statusPago) {
        const valorNum = item.valor || 0;
        const ajuste = tipo === 'receita' ? valorNum : -valorNum;
        
        try {
          const conta = await base44.entities.MeuFinanceiroContaBancaria.get(contaBancariaId);
          if (conta) {
            const novoSaldo = (conta.saldo_atual || 0) + ajuste;
            await base44.entities.MeuFinanceiroContaBancaria.update(contaBancariaId, { saldo_atual: novoSaldo });
          }
        } catch (e) { console.error('Erro ao atualizar saldo:', e); }
      }

      toast.success(
        item.status === (tipo === 'receita' ? 'recebida' : 'pago') 
          ? 'Alterações salvas!' 
          : (tipo === 'receita' ? 'Recebimento confirmado!' : 'Pagamento confirmado!')
      );
      onConfirmar();
      onClose();
    } catch (e) { 
      toast.error('Erro ao salvar'); 
      console.error(e); 
    } finally { 
      setSalvando(false); 
    }
  };

  const corBotao = tipo === 'receita' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700';
  const corToggle = tipo === 'receita' ? 'data-[state=checked]:bg-green-500' : 'data-[state=checked]:bg-red-500';
  const jaPago = statusPago;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold text-slate-800">{titulo}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Informações da transação */}
          <div className={`rounded-lg p-4 ${tipo === 'receita' ? 'bg-green-50' : 'bg-red-50'}`}>
            <p className="text-sm font-medium text-slate-500">
              {tipo === 'receita' ? 'Receita' : 'Despesa'}
            </p>
            <p className="text-lg font-bold text-slate-800">{item?.descricao}</p>
            <p className={`text-2xl font-bold mt-1 ${tipo === 'receita' ? 'text-green-600' : 'text-red-600'}`}>
              {tipo === 'receita' ? '+' : '-'} {fmtMoeda(item?.valor)}
            </p>
            {item?.categoria && (
              <p className="text-sm text-slate-500 mt-1">{item.categoria}</p>
            )}
          </div>

          {/* Status toggle */}
          <div className="flex items-center justify-between bg-white border rounded-lg px-4 py-3">
            <div>
              <p className="text-sm font-medium text-slate-700">
                {tipo === 'receita' ? 'Foi recebida' : 'Foi paga'}
              </p>
              <p className="text-xs text-slate-400">
                {jaPago ? 'Sim' : 'Não'}
              </p>
            </div>
            <Switch checked={statusPago} onCheckedChange={setStatusPago} className={corToggle} />
          </div>

          {/* Data */}
          <div>
            <Label className="text-xs uppercase tracking-wider text-slate-500">
              {tipo === 'receita' ? 'Data do Recebimento' : 'Data do Pagamento'} *
            </Label>
            <Input 
              type="date" 
              value={data} 
              onChange={e => setData(e.target.value)} 
              className="mt-1"
            />
          </div>

          {/* Conta Bancária */}
          <div>
            <Label className="text-xs uppercase tracking-wider text-slate-500">Conta Bancária</Label>
            <Select value={contaBancariaId} onValueChange={setContaBancariaId}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Selecione a conta..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={null}>Nenhuma</SelectItem>
                {contas.map(c => (
                  <SelectItem key={c.id} value={c.id}>
                    <span className="flex items-center gap-2">
                      <Building2 className="w-3.5 h-3.5" />
                      {c.nome_conta} {c.banco && `(${c.banco})`}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Observação */}
          <div>
            <Label className="text-xs uppercase tracking-wider text-slate-500">Observação</Label>
            <textarea
              className="w-full mt-1 border rounded-md p-3 text-sm min-h-[80px] bg-white focus:outline-none focus:ring-1 focus:ring-slate-300 resize-none"
              value={observacao}
              onChange={e => setObservacao(e.target.value)}
              placeholder="Detalhes adicionais..."
            />
          </div>

          {/* Anexar Arquivo */}
          <div>
            <Label className="text-xs uppercase tracking-wider text-slate-500">Comprovante</Label>
            <div className="mt-1">
              {fileUrl ? (
                <div className="flex items-center gap-2 bg-white border rounded-lg p-2">
                  <Paperclip className="w-4 h-4 text-slate-400" />
                  <span className="text-sm text-slate-600 flex-1 truncate">{fileName}</span>
                  <Button 
                    size="icon" 
                    variant="ghost" 
                    className="h-7 w-7" 
                    onClick={() => { setFileUrl(''); setFileName(''); }}
                  >
                    <X className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ) : (
                <label className="cursor-pointer flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700 border border-dashed rounded-lg p-3 justify-center hover:bg-slate-100 transition-colors">
                  <Paperclip className="w-4 h-4" />
                  {uploading ? 'Enviando...' : 'Escolher arquivo (PDF, JPG, PNG)'}
                  <input type="file" className="hidden" onChange={handleUpload} disabled={uploading} accept=".pdf,.jpg,.jpeg,.png" />
                </label>
              )}
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={salvando}>
            Cancelar
          </Button>
          <Button 
            onClick={handleConfirmar} 
            disabled={salvando} 
            className={corBotao}
          >
            {salvando ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null}
            {jaPago ? 'Salvar Alterações' : (tipo === 'receita' ? 'Confirmar Recebimento' : 'Confirmar Pagamento')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}