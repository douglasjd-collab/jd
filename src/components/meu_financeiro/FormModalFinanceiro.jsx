import React, { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Loader2, Paperclip, X, Calculator, Building2, Settings } from 'lucide-react';
import { format } from 'date-fns';
import GerenciarCategoriasModal from '@/components/meu_financeiro/GerenciarCategoriasModal';

const hoje = () => format(new Date(), 'yyyy-MM-dd');
const fmtMoeda = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
const parseNum = (v) => { if (!v) return 0; const n = String(v).replace(/\D/g, ''); return n ? parseFloat(n) / 100 : 0; };
const formatCurrency = (v) => { if (!v) return ''; const n = parseFloat(v); return isNaN(n) ? '' : n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };

// Formata o input monetário enquanto digita — retorna string formatada "X.XXX,XX"
const handleCurrencyInput = (raw, setter) => {
  const digits = String(raw).replace(/\D/g, '');
  if (!digits) { setter(''); return; }
  const num = parseFloat(digits) / 100;
  setter(num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
};

export default function FormModalFinanceiro({ open, onClose, item, tipo, user, onSaved }) {
  const editando = !!item;
  const titulo = tipo === 'receita' ? (editando ? 'Editar Receita' : 'Nova Receita') : (editando ? 'Editar Despesa' : 'Nova Despesa');

  const [valor, setValor] = useState('');
  const [statusPago, setStatusPago] = useState(tipo === 'receita' ? true : false);
  const [data, setData] = useState(hoje());
  const [descricao, setDescricao] = useState('');
  const [categoriaId, setCategoriaId] = useState('');
  const [subcategoriaId, setSubcategoriaId] = useState('');
  const [contaBancariaId, setContaBancariaId] = useState('');
  const [observacao, setObservacao] = useState('');
  const [fixa, setFixa] = useState(false);
  const [repetir, setRepetir] = useState(false);
  const [fileUrl, setFileUrl] = useState('');
  const [fileName, setFileName] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [categoriasList, setCategoriasList] = useState([]);
  const [contas, setContas] = useState([]);
  const [carregandoOpc, setCarregandoOpc] = useState(false);
  const [modalCategoriasOpen, setModalCategoriasOpen] = useState(false);

  // Carregar opções ao abrir
  useEffect(() => {
    if (!open) return;
    const carregar = async () => {
      setCarregandoOpc(true);
      try {
        const [catsData, contasData] = await Promise.all([
          base44.entities.MeuFinanceiroCategoria.filter({ usuario_id: user.id, empresa_id: user.empresa_id, tipo }, 'ordem', 200),
          base44.entities.MeuFinanceiroContaBancaria.filter({ usuario_id: user.id, empresa_id: user.empresa_id, status: 'ativa' }, 'nome_conta', 30),
        ]);
        setCategoriasList(catsData);
        setContas(contasData);
      } catch (e) { /* silencioso */ } finally { setCarregandoOpc(false); }
    };
    carregar();
  }, [open, tipo, user]);

  // Preencher formulário ao editar
  useEffect(() => {
    if (!open) return;
    if (item) {
      setValor(formatCurrency(item.valor));
      setStatusPago(tipo === 'receita' ? item.status === 'recebida' : item.status === 'pago');
      setData(item.data || hoje());
      setDescricao(item.descricao || '');
      setCategoriaId(item.categoria_id || '');
      setSubcategoriaId(item.subcategoria_id || '');
      setContaBancariaId(item.conta_bancaria_id || '');
      setObservacao(item.observacao || '');
      setFixa(!!item.fixa);
      setRepetir(!!item.repetir);
      setFileUrl(item.comprovante_url || '');
      setFileName(item.comprovante_nome || '');
    } else {
      setValor('');
      setStatusPago(tipo === 'receita' ? true : false);
      setData(hoje());
      setDescricao('');
      setCategoriaId('');
      setSubcategoriaId('');
      setContaBancariaId('');
      setObservacao('');
      setFixa(false);
      setRepetir(false);
      setFileUrl('');
      setFileName('');
    }
  }, [open, item, tipo]);

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      setFileUrl(file_url);
      setFileName(file.name);
    } catch (err) { toast.error('Erro ao enviar arquivo'); } finally { setUploading(false); e.target.value = ''; }
  };

  const handleSalvar = async () => {
    const v = parseNum(valor);
    if (!v || v <= 0) { toast.error('Informe um valor válido'); return; }
    if (!descricao.trim()) { toast.error('Informe a descrição'); return; }
    setSalvando(true);
    try {
      const catPrincipal = categoriasList.find(c => c.id === categoriaId);
      const catSub = categoriasList.find(c => c.id === subcategoriaId);
      const categoriaLabel = catSub ? `${catPrincipal?.nome || ''} > ${catSub.nome}` : (catPrincipal?.nome || 'Geral');
      const payload = {
        descricao: descricao.trim(),
        categoria: categoriaLabel,
        valor: v,
        data,
        observacao: observacao.trim(),
        empresa_id: user.empresa_id,
        usuario_id: user.id,
        usuario_nome: user.nome_perfil || user.full_name,
        conta_bancaria_id: contaBancariaId || null,
        categoria_id: categoriaId || null,
        subcategoria_id: subcategoriaId || null,
        comprovante_url: fileUrl || null,
      };
      if (tipo === 'receita') {
        payload.status = statusPago ? 'recebida' : 'pendente';
        payload.data_recebimento = statusPago ? data : null;
      } else {
        payload.status = statusPago ? 'pago' : 'pendente';
        payload.data_vencimento = data;
        payload.data_pagamento = statusPago ? data : null;
      }
      const entidade = tipo === 'receita' ? 'MeuFinanceiroReceita' : 'MeuFinanceiroDespesa';
      if (editando) await base44.entities[entidade].update(item.id, payload);
      else await base44.entities[entidade].create(payload);
      toast.success(editando ? 'Atualizado com sucesso!' : `${tipo === 'receita' ? 'Receita' : 'Despesa'} lançada!`);
      onSaved();
      onClose();
    } catch (e) { toast.error('Erro ao salvar'); console.error(e); } finally { setSalvando(false); }
  };

  const botaoSalvar = tipo === 'receita' ? 'Lançar Receita' : 'Lançar Despesa';
  const corBotao = tipo === 'receita' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700';
  const corToggle = tipo === 'receita' ? 'data-[state=checked]:bg-green-500' : 'data-[state=checked]:bg-red-500';

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[95vh] overflow-y-auto bg-slate-50">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold text-slate-800">{titulo}</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 py-2">
          {/* Coluna Principal */}
          <div className="md:col-span-3 space-y-4">
            {/* Valor */}
            <div>
              <Label className="text-xs uppercase tracking-wider text-slate-500">Valor</Label>
              <div className="relative mt-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-medium">R$</span>
                <Input
                 className="pl-10 text-2xl font-bold h-14"
                 inputMode="decimal"
                 value={valor}
                 onChange={e => handleCurrencyInput(e.target.value, setValor)}
                 placeholder="0,00"
                />
              </div>
            </div>

            {/* Status toggle */}
            <div className="flex items-center justify-between py-2">
              <Label className="text-sm text-slate-700">{tipo === 'receita' ? 'Foi recebida' : 'Foi paga'}</Label>
              <Switch checked={statusPago} onCheckedChange={setStatusPago} className={corToggle} />
            </div>

            {/* Data */}
            <div>
              <Label className="text-xs uppercase tracking-wider text-slate-500">Data</Label>
              <div className="flex gap-2 mt-1">
                <Button
                  size="sm"
                  variant={data === hoje() ? 'default' : 'outline'}
                  className={data === hoje() ? (tipo === 'receita' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700') : ''}
                  onClick={() => setData(hoje())}
                >Hoje</Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    const d = new Date(); d.setDate(d.getDate() - 1);
                    setData(format(d, 'yyyy-MM-dd'));
                  }}
                >Ontem</Button>
                <Input type="date" value={data} onChange={e => setData(e.target.value)} className="h-8 w-40" />
              </div>
            </div>

            {/* Descrição */}
            <div>
              <Label className="text-xs uppercase tracking-wider text-slate-500">Descrição *</Label>
              <Input className="mt-1" value={descricao} onChange={e => setDescricao(e.target.value)} placeholder="Ex: Comissão de venda" />
            </div>

            {/* Categoria */}
            <div>
              <div className="flex items-center gap-1 mb-1">
                <Label className="text-xs uppercase tracking-wider text-slate-500">Categoria</Label>
                <button onClick={() => setModalCategoriasOpen(true)} className="p-1 rounded hover:bg-slate-200 text-slate-400 hover:text-slate-600 transition-colors" title="Gerenciar categorias">
                  <Settings className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="flex gap-2 mt-1">
                <Select value={categoriaId} onValueChange={v => { setCategoriaId(v); setSubcategoriaId(''); }}>
                  <SelectTrigger className="w-full"><SelectValue placeholder="Selecione a categoria..." /></SelectTrigger>
                  <SelectContent>
                    {categoriasList.filter(c => !c.parent_id).map(cat => (
                      <SelectItem key={cat.id} value={cat.id}>{cat.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {/* Subcategoria — aparece ao selecionar categoria que possui subs */}
              {categoriaId && categoriasList.filter(c => c.parent_id === categoriaId).length > 0 && (
                <div className="mt-2">
                  <Label className="text-xs text-slate-400 mb-1 block">Subcategoria</Label>
                  <Select value={subcategoriaId} onValueChange={setSubcategoriaId}>
                    <SelectTrigger><SelectValue placeholder="Selecione a subcategoria..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={null}>Nenhuma</SelectItem>
                      {categoriasList.filter(c => c.parent_id === categoriaId).map(sub => (
                        <SelectItem key={sub.id} value={sub.id}>{sub.nome}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
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
                        {c.nome_conta} ({c.banco})
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Anexar Arquivo */}
            <div>
              <Label className="text-xs uppercase tracking-wider text-slate-500">Anexar Arquivo</Label>
              <div className="mt-1">
                {fileUrl ? (
                  <div className="flex items-center gap-2 bg-white border rounded-lg p-2">
                    <Paperclip className="w-4 h-4 text-slate-400" />
                    <span className="text-sm text-slate-600 flex-1 truncate">{fileName || 'Comprovante'}</span>
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setFileUrl(''); setFileName(''); }}>
                      <X className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                ) : (
                  <label className="cursor-pointer flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700 border border-dashed rounded-lg p-3 justify-center hover:bg-slate-100 transition-colors">
                    <Paperclip className="w-4 h-4" />
                    {uploading ? 'Enviando...' : 'Escolher arquivo'}
                    <input type="file" className="hidden" onChange={handleUpload} disabled={uploading} />
                  </label>
                )}
              </div>
            </div>
          </div>

          {/* Coluna Lateral */}
          <div className="md:col-span-2 space-y-4">
            {/* Observação */}
            <div>
              <Label className="text-xs uppercase tracking-wider text-slate-500">Observação</Label>
              <textarea
                className="w-full mt-1 border rounded-md p-3 text-sm min-h-[100px] bg-white focus:outline-none focus:ring-1 focus:ring-slate-300 resize-none"
                value={observacao}
                onChange={e => setObservacao(e.target.value)}
                placeholder="Detalhes adicionais..."
              />
            </div>

            {/* Toggles */}
            <div className="space-y-3 bg-white border rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-700">{tipo === 'receita' ? 'Receita fixa' : 'Despesa fixa'}</p>
                  <p className="text-xs text-slate-400">Recorrente todo mês</p>
                </div>
                <Switch checked={fixa} onCheckedChange={setFixa} className={corToggle} />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-700">Repetir</p>
                  <p className="text-xs text-slate-400">Repetir este lançamento</p>
                </div>
                <Switch checked={repetir} onCheckedChange={setRepetir} className={corToggle} />
              </div>
            </div>
          </div>
        </div>

        <GerenciarCategoriasModal open={modalCategoriasOpen} onClose={() => setModalCategoriasOpen(false)} tipo={tipo} user={user} onSaved={() => {
          // Recarregar categorias
          base44.entities.MeuFinanceiroCategoria.filter({ usuario_id: user.id, empresa_id: user.empresa_id, tipo }, 'ordem', 200).then(setCategoriasList).catch(() => {});
        }} />

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={salvando}>Cancelar</Button>
          <Button onClick={handleSalvar} disabled={salvando} className={corBotao}>
            {salvando ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null}
            {botaoSalvar}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}