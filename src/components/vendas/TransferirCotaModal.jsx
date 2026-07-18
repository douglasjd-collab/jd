import React, { useState, useEffect, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Loader2, Search, UserPlus, Lock, FileUp, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

const SITUACOES = [
  { value: 'aguardando_documentos', label: 'Aguardando documentos' },
  { value: 'aguardando_aprovacao', label: 'Aguardando aprovação' },
  { value: 'aprovada', label: 'Aprovada' },
  { value: 'reprovada', label: 'Reprovada' },
  { value: 'cancelada', label: 'Cancelada' },
];

const TIPO_LABELS = {
  automovel: 'Automóvel',
  imovel: 'Imóvel',
  motocicleta: 'Motocicleta',
  servico: 'Serviço',
  bens_moveis: 'Bens Móveis',
};

function sanitizeCpf(v = '') {
  return (v || '').replace(/\D/g, '');
}

export default function TransferirCotaModal({ open, onOpenChange, venda, currentUser, onConcluido }) {
  const [step, setStep] = useState(1);
  const [busca, setBusca] = useState('');
  const [clienteSelecionado, setClienteSelecionado] = useState(null);
  const [novoClienteOpen, setNovoClienteOpen] = useState(false);
  const [novoCliente, setNovoCliente] = useState({ nome_completo: '', cpf: '', celular: '', email: '' });
  const [cpfDigitado, setCpfDigitado] = useState('');
  const [form, setForm] = useState({
    data_solicitacao: format(new Date(), 'yyyy-MM-dd'),
    data_efetiva: '',
    motivo: '',
    observacoes: '',
    taxa_transferencia: '',
    protocolo_administradora: '',
    vendedor_responsavel_id: '',
    vendedor_responsavel_nome: '',
    manter_contrato: true,
    contrato_novo: '',
    valor_credito_novo: '',
    situacao: 'aguardando_documentos',
    documentos_urls: [],
    documentos_nomes: [],
    comprovante_urls: [],
    comprovante_nomes: [],
  });
  const [erroCpf, setErroCpf] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [transferenciaExistente, setTransferenciaExistente] = useState(null);
  const queryClient = useQueryClient();

  // Carregar vendedores (colaboradores)
  const { data: colaboradores = [] } = useQuery({
    queryKey: ['colaboradores-transfer', venda?.empresa_id],
    enabled: open && !!venda?.empresa_id,
    queryFn: () =>
      base44.entities.Colaborador.filter(
        venda?.empresa_id ? { empresa_id: venda.empresa_id, status: 'ativo' } : { status: 'ativo' },
        'nome'
      ),
  });

  // Busca de cliente
  const cpfBusca = sanitizeCpf(busca);
  const { data: clientesEncontrados = [], isLoading: buscandoCliente } = useQuery({
    queryKey: ['clientes-busca-transfer', cpfBusca, busca],
    enabled: open && busca.length >= 3,
    queryFn: async () => {
      // Tentar filtro por CPF quando só contiver dígitos
      if (/^\d+$/.test(busca) && busca.length >= 8) {
        return base44.entities.Cliente.filter({ cpf: busca }, '-created_date', 20);
      }
      const todos = await base44.entities.Cliente.filter(
        venda?.empresa_id ? { empresa_id: venda.empresa_id } : {},
        '-created_date',
        5000
      );
      const l = busca.toLowerCase();
      return todos.filter(
        (c) =>
          (c.nome_completo || '').toLowerCase().includes(l) ||
          (c.cpf || '').includes(busca) ||
          (c.celular || '').includes(busca)
      );
    },
  });

  // Carregar transferência existente (se a venda já tem transferencia_id)
  useEffect(() => {
    if (!open || !venda) return;
    setStep(1);
    setBusca('');
    setClienteSelecionado(null);
    setNovoClienteOpen(false);
    setNovoCliente({ nome_completo: '', cpf: '', celular: '', email: '' });
    setCpfDigitado('');
    setErroCpf('');
    setForm((f) => ({
      ...f,
      data_solicitacao: format(new Date(), 'yyyy-MM-dd'),
      data_efetiva: '',
      motivo: '',
      observacoes: '',
      taxa_transferencia: '',
      protocolo_administradora: '',
      vendedor_responsavel_id: venda.vendedor_id || '',
      vendedor_responsavel_nome: venda.vendedor_nome || '',
      manter_contrato: true,
      contrato_novo: '',
      valor_credito_novo: venda.valorCredito || '',
      situacao: 'aguardando_documentos',
      documentos_urls: [],
      documentos_nomes: [],
      comprovante_urls: [],
      comprovante_nomes: [],
    }));
    if (venda.transferencia_id) {
      base44.entities.TransferenciaCota.filter({ id: venda.transferencia_id })
        .then((res) => {
          if (res[0]) {
            const t = res[0];
            setTransferenciaExistente(t);
            setForm({
              data_solicitacao: t.data_solicitacao || format(new Date(), 'yyyy-MM-dd'),
              data_efetiva: t.data_efetiva || '',
              motivo: t.motivo || '',
              observacoes: t.observacoes || '',
              taxa_transferencia: t.taxa_transferencia ?? '',
              protocolo_administradora: t.protocolo_administradora || '',
              vendedor_responsavel_id: t.vendedor_responsavel_id || venda.vendedor_id || '',
              vendedor_responsavel_nome: t.vendedor_responsavel_nome || venda.vendedor_nome || '',
              manter_contrato: t.manter_contrato ?? true,
              contrato_novo: t.contrato_novo || '',
              valor_credito_novo: (t.valor_credito_novo ?? venda.valorCredito) || '',
              situacao: t.situacao,
              documentos_urls: t.documentos_urls || [],
              documentos_nomes: t.documentos_nomes || [],
              comprovante_urls: t.comprovante_urls || [],
              comprovante_nomes: t.comprovante_nomes || [],
            });
            if (t.cliente_destino_id) {
              base44.entities.Cliente.filter({ id: t.cliente_destino_id })
                .then((cs) => cs[0] && setClienteSelecionado(cs[0]))
                .catch(() => {});
            }
          }
        })
        .catch(() => setTransferenciaExistente(null));
    } else {
      setTransferenciaExistente(null);
    }
  }, [open, venda]);

  const isAprovador = useMemo(
    () => ['admin', 'super_admin', 'master', 'gerente'].includes(currentUser?.perfil),
    [currentUser]
  );
  const soVisualiza = !!transferenciaExistente && !isAprovador && transferenciaExistente?.situacao !== 'aguardando_documentos' && transferenciaExistente?.situacao !== 'cancelada' && transferenciaExistente?.situacao !== 'reprovada';

  // Verificar duplicidade de CPF (origem vs destino)
  useEffect(() => {
    if (!clienteSelecionado || !venda) {
      setErroCpf('');
      return;
    }
    if (sanitizeCpf(clienteSelecionado.cpf) && sanitizeCpf(clienteSelecionado.cpf) === sanitizeCpf(venda.cliente_cpf)) {
      setErroCpf('O novo titular não pode ser a mesma pessoa do cliente atual.');
    } else {
      setErroCpf('');
    }
  }, [clienteSelecionado, venda]);

  const handleUploadDocumento = async (e, tipo) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const res = await base44.integrations.Core.UploadFile({ file });
      const url = res.file_url;
      if (tipo === 'doc') {
        setForm((f) => ({
          ...f,
          documentos_urls: [...f.documentos_urls, url],
          documentos_nomes: [...f.documentos_nomes, file.name],
        }));
      } else {
        setForm((f) => ({
          ...f,
          comprovante_urls: [...f.comprovante_urls, url],
          comprovante_nomes: [...f.comprovante_nomes, file.name],
        }));
      }
      toast.success('Arquivo anexado.');
    } catch (err) {
      toast.error('Erro ao anexar: ' + (err.message || 'erro'));
    }
  };

  const removerAnexo = (tipo, idx) => {
    if (tipo === 'doc') {
      setForm((f) => {
        const urls = [...f.documentos_urls];
        const nomes = [...f.documentos_nomes];
        urls.splice(idx, 1);
        nomes.splice(idx, 1);
        return { ...f, documentos_urls: urls, documentos_nomes: nomes };
      });
    } else {
      setForm((f) => {
        const urls = [...f.comprovante_urls];
        const nomes = [...f.comprovante_nomes];
        urls.splice(idx, 1);
        nomes.splice(idx, 1);
        return { ...f, comprovante_urls: urls, comprovante_nomes: nomes };
      });
    }
  };

  const criarNovoCliente = async () => {
    if (!novoCliente.nome_completo || !novoCliente.cpf) {
      toast.error('Nome e CPF do novo cliente são obrigatórios.');
      return;
    }
    const cpfLimpo = sanitizeCpf(novoCliente.cpf);
    // Verificar duplicidade
    const existentes = await base44.entities.Cliente.filter({ cpf: cpfLimpo });
    if (existentes && existentes.length > 0) {
      toast.warning('Já existe um cliente com este CPF. Selecionando-o.');
      setClienteSelecionado(existentes[0]);
      setNovoClienteOpen(false);
      return;
    }
    try {
      const criado = await base44.entities.Cliente.create({
        empresa_id: venda.empresa_id,
        tipo_pessoa: 'Física',
        nome_completo: novoCliente.nome_completo,
        cpf: cpfLimpo,
        celular: novoCliente.celular || undefined,
        email: novoCliente.email || undefined,
        status: 'ativo',
      });
      toast.success('Novo cliente cadastrado.');
      setClienteSelecionado(criado);
      setNovoClienteOpen(false);
    } catch (err) {
      toast.error('Erro ao cadastrar cliente: ' + (err.message || 'erro'));
    }
  };

  const podeAvancar = !!clienteSelecionado && !erroCpf;

  const handleSubmit = async (acaoFinal) => {
    if (!venda) return;
    if (!clienteSelecionado) {
      toast.error('Selecione o novo titular da cota.');
      return;
    }
    if (erroCpf) {
      toast.error(erroCpf);
      return;
    }
    if (!form.motivo && acaoFinal !== 'salvar_pendente') {
      toast.error('Informe o motivo da transferência.');
      return;
    }
    if (!form.manter_contrato && !form.contrato_novo) {
      toast.error('Novo número de contrato é obrigatório ao gerar novo contrato.');
      return;
    }
    setSalvando(true);
    try {
      // Se já existe transferência, usar transferirCota.atualizar
      if (transferenciaExistente) {
        const situacaoFinal = acaoFinal === 'solicitar' ? 'aguardando_aprovacao' : form.situacao;
        const res = await base44.functions.invoke('transferirCota', {
          transferencia_id: transferenciaExistente.id,
          acao: 'atualizar',
          dados: {
            motivo: form.motivo,
            observacoes: form.observacoes,
            taxa_transferencia: form.taxa_transferencia ? Number(form.taxa_transferencia) : null,
            protocolo_administradora: form.protocolo_administradora,
            data_solicitacao: form.data_solicitacao,
            data_efetiva: form.data_efetiva,
            manter_contrato: form.manter_contrato,
            contrato_novo: form.contrato_novo,
            valor_credito_novo: form.valor_credito_novo ? Number(form.valor_credito_novo) : null,
            vendedor_responsavel_id: form.vendedor_responsavel_id,
            vendedor_responsavel_nome: form.vendedor_responsavel_nome,
            documentos_urls: form.documentos_urls,
            documentos_nomes: form.documentos_nomes,
            comprovante_urls: form.comprovante_urls,
            comprovante_nomes: form.comprovante_nomes,
            situacao: situacaoFinal,
          },
        });
        if (res.data?.error) throw new Error(res.data.error);
        toast.success('Transferência atualizada.');
        queryClient.invalidateQueries({ queryKey: ['vendas'] });
        onConcluido?.();
        onOpenChange(false);
        return;
      }

      // Criar nova transferência
      const novoDoc = {
        empresa_id: venda.empresa_id,
        proposta_origem_id: venda.id,
        cliente_origem_id: venda.cliente_id,
        cliente_origem_nome: venda.cliente_nome,
        cliente_origem_cpf: venda.cliente_cpf,
        cliente_destino_id: clienteSelecionado.id,
        cliente_destino_nome: clienteSelecionado.nome_completo || clienteSelecionado.nome || '',
        cliente_destino_cpf: clienteSelecionado.cpf || '',
        administradora_id: venda.administradora_id,
        administradora_nome: venda.administradora_nome,
        tipo_consorcio: venda.tipo,
        grupo: venda.grupo,
        cota: venda.cota,
        contrato_anterior: venda.contrato,
        manter_contrato: form.manter_contrato,
        contrato_novo: form.manter_contrato ? null : form.contrato_novo,
        valor_credito_anterior: venda.valorCredito,
        valor_credito_novo: form.valor_credito_novo ? Number(form.valor_credito_novo) : venda.valorCredito,
        vendedor_responsavel_id: form.vendedor_responsavel_id,
        vendedor_responsavel_nome: form.vendedor_responsavel_nome,
        data_solicitacao: form.data_solicitacao,
        data_efetiva: form.data_efetiva || null,
        motivo: form.motivo,
        observacoes: form.observacoes,
        taxa_transferencia: form.taxa_transferencia ? Number(form.taxa_transferencia) : null,
        protocolo_administradora: form.protocolo_administradora,
        situacao: acaoFinal === 'solicitar' ? 'aguardando_aprovacao' : 'aguardando_documentos',
        documentos_urls: form.documentos_urls,
        documentos_nomes: form.documentos_nomes,
        comprovante_urls: form.comprovante_urls,
        comprovante_nomes: form.comprovante_nomes,
        solicitado_por_id: currentUser?.auth_id || currentUser?.id,
        solicitado_por_nome: currentUser?.nome_perfil || currentUser?.full_name,
      };

      const criado = await base44.entities.TransferenciaCota.create(novoDoc);

      // Marcar a venda de origem como "transferência em andamento"
      await base44.entities.Venda.update(venda.id, {
        status: 'transferencia_andamento',
        transferencia_id: criado.id,
      });
      toast.success(acaoFinal === 'solicitar' ? 'Solicitação de transferência enviada para aprovação.' : 'Transferência salva como pendente.');
      queryClient.invalidateQueries({ queryKey: ['vendas'] });
      onConcluido?.();
      onOpenChange(false);
    } catch (err) {
      toast.error('Erro: ' + (err.message || 'erro'));
    } finally {
      setSalvando(false);
    }
  };

  const handleAprovar = async () => {
    if (!transferenciaExistente) return;
    if (!form.manter_contrato && !form.contrato_novo) {
      toast.error('É obrigatório informar o novo contrato para aprovar a transferência.');
      return;
    }
    setSalvando(true);
    try {
      // Atualizar dados e depois aprovar
      await base44.functions.invoke('transferirCota', {
        transferencia_id: transferenciaExistente.id,
        acao: 'atualizar',
        dados: {
          motivo: form.motivo,
          observacoes: form.observacoes,
          taxa_transferencia: form.taxa_transferencia ? Number(form.taxa_transferencia) : null,
          protocolo_administradora: form.protocolo_administradora,
          data_efetiva: form.data_efetiva,
          manter_contrato: form.manter_contrato,
          contrato_novo: form.contrato_novo,
          valor_credito_novo: form.valor_credito_novo ? Number(form.valor_credito_novo) : null,
          vendedor_responsavel_id: form.vendedor_responsavel_id,
          vendedor_responsavel_nome: form.vendedor_responsavel_nome,
          documentos_urls: form.documentos_urls,
          documentos_nomes: form.documentos_nomes,
          comprovante_urls: form.comprovante_urls,
          comprovante_nomes: form.comprovante_nomes,
          situacao: 'aguardando_aprovacao',
        },
      });
      const res = await base44.functions.invoke('transferirCota', {
        transferencia_id: transferenciaExistente.id,
        acao: 'aprovar',
      });
      if (res.data?.error) throw new Error(res.data.error);
      toast.success(res.data?.mensagem || 'Transferência aprovada com sucesso.');
      queryClient.invalidateQueries({ queryKey: ['vendas'] });
      onConcluido?.();
      onOpenChange(false);
    } catch (err) {
      toast.error('Erro ao aprovar: ' + (err.message || 'erro'));
    } finally {
      setSalvando(false);
    }
  };

  const handleReprovar = async () => {
    if (!transferenciaExistente) return;
    const just = window.prompt('Justificativa da reprovação:');
    if (!just) return;
    setSalvando(true);
    try {
      const res = await base44.functions.invoke('transferirCota', {
        transferencia_id: transferenciaExistente.id,
        acao: 'reprovar',
        justificativa: just,
      });
      if (res.data?.error) throw new Error(res.data.error);
      toast.success('Transferência reprovada.');
      queryClient.invalidateQueries({ queryKey: ['vendas'] });
      onConcluido?.();
      onOpenChange(false);
    } catch (err) {
      toast.error('Erro ao reprovar: ' + (err.message || 'erro'));
    } finally {
      setSalvando(false);
    }
  };

  if (!venda) return null;
  const tipoLabel = TIPO_LABELS[venda.tipo] || venda.tipo || '-';
  const jaTransferida = venda.status === 'transferida';

  return (
    <Dialog open={open} onOpenChange={(o) => !salvando && onOpenChange(o)}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileUp className="w-5 h-5 text-[#23BE84]" />
            {transferenciaExistente ? 'Editar transferência de cota' : 'Transferência de cota'}
          </DialogTitle>
          <DialogDescription>
            {jaTransferida
              ? 'Esta cota já foi transferida. Veja os dados abaixo.'
              : transferenciaExistente
              ? `Situação atual: ${SITUACOES.find((s) => s.value === transferenciaExistente.situacao)?.label}`
              : 'Selecione o novo titular e preencha os dados da transferência.'}
          </DialogDescription>
        </DialogHeader>

        {/* Step 1 — Dados da cota de origem (read-only) */}
        <section className="border rounded-xl p-4 bg-slate-50 space-y-2">
          <div className="flex items-center gap-2 mb-1">
            <Lock className="w-4 h-4 text-slate-400" />
            <h3 className="font-medium text-slate-700">Dados da cota de origem</h3>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <div>
              <p className="text-xs text-slate-500">Cliente atual</p>
              <p className="font-medium">{venda.cliente_nome || '-'}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">CPF atual</p>
              <p className="font-medium">{venda.cliente_cpf || '-'}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Administradora</p>
              <p className="font-medium">{venda.administradora_nome || '-'}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Tipo do consórcio</p>
              <p className="font-medium">{tipoLabel}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Grupo</p>
              <p className="font-medium">{venda.grupo || '-'}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Cota</p>
              <p className="font-medium">{venda.cota || '-'}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Contrato</p>
              <p className="font-medium">{venda.contrato || '-'}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Valor do crédito</p>
              <p className="font-medium">{(venda.valorCredito || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Situação da cota</p>
              <p className="font-medium capitalize">{(venda.status || 'ativa').replace(/_/g, ' ')}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Vendedor</p>
              <p className="font-medium">{venda.vendedor_nome || '-'}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Data da proposta</p>
              <p className="font-medium">{venda.data_venda ? format(new Date(venda.data_venda + 'T12:00:00'), 'dd/MM/yyyy') : '-'}</p>
            </div>
          </div>
        </section>

        {/* Step 2 — Seleção do novo titular */}
        {!jaTransferida && !transferenciaExistente?.cliente_destino_id && (
          <section className="space-y-3">
            <h3 className="font-medium text-slate-700">Novo titular da cota</h3>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                  placeholder="Buscar por nome, CPF ou telefone…"
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Button type="button" variant="outline" onClick={() => setNovoClienteOpen((v) => !v)}>
                <UserPlus className="w-4 h-4 mr-2" /> Cadastrar novo cliente
              </Button>
            </div>
            {buscandoCliente && <Loader2 className="w-4 h-4 animate-spin text-slate-400" />}
            <div className="max-h-40 overflow-y-auto border rounded-lg divide-y">
              {clientesEncontrados.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setClienteSelecionado(c)}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-slate-50 ${
                    clienteSelecionado?.id === c.id ? 'bg-emerald-50' : ''
                  }`}
                >
                  <p className="font-medium">{c.nome_completo || c.nome || '-'}</p>
                  <p className="text-xs text-slate-500">CPF: {c.cpf || '-'} • Cel: {c.celular || '-'}</p>
                </button>
              ))}
              {busca.length >= 3 && !buscandoCliente && clientesEncontrados.length === 0 && (
                <p className="px-3 py-3 text-sm text-slate-500">Nenhum cliente encontrado.</p>
              )}
            </div>

            {novoClienteOpen && (
              <div className="border rounded-xl p-3 space-y-3 bg-slate-50">
                <p className="text-sm font-medium">Cadastrar novo cliente</p>
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    placeholder="Nome completo *"
                    value={novoCliente.nome_completo}
                    onChange={(e) => setNovoCliente({ ...novoCliente, nome_completo: e.target.value })}
                  />
                  <Input
                    placeholder="CPF *"
                    value={novoCliente.cpf}
                    onChange={(e) => setNovoCliente({ ...novoCliente, cpf: e.target.value })}
                  />
                  <Input
                    placeholder="Celular"
                    value={novoCliente.celular}
                    onChange={(e) => setNovoCliente({ ...novoCliente, celular: e.target.value })}
                  />
                  <Input
                    placeholder="E-mail"
                    value={novoCliente.email}
                    onChange={(e) => setNovoCliente({ ...novoCliente, email: e.target.value })}
                  />
                </div>
                <Button size="sm" onClick={criarNovoCliente}>
                  Salvar novo cliente
                </Button>
              </div>
            )}

            {clienteSelecionado && (
              <div className="flex items-center justify-between p-3 rounded-xl bg-emerald-50 border border-emerald-200">
                <div>
                  <p className="text-xs text-emerald-700">Novo titular selecionado</p>
                  <p className="font-medium">{clienteSelecionado.nome_completo || clienteSelecionado.nome} — CPF: {clienteSelecionado.cpf}</p>
                </div>
                {!transferenciaExistente && (
                  <Button size="sm" variant="ghost" onClick={() => setClienteSelecionado(null)}>
                    Trocar
                  </Button>
                )}
              </div>
            )}
            {erroCpf && (
              <div className="flex items-center gap-2 text-sm text-red-600">
                <AlertTriangle className="w-4 h-4" /> {erroCpf}
              </div>
            )}
          </section>
        )}

        {/* Step 3 — Dados da transferência */}
        {!jaTransferida && (
          <section className="space-y-3">
            <h3 className="font-medium text-slate-700">Dados da transferência</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-sm">Data da solicitação</Label>
                <Input
                  type="date"
                  value={form.data_solicitacao}
                  onChange={(e) => setForm({ ...form, data_solicitacao: e.target.value })}
                />
              </div>
              <div>
                <Label className="text-sm">Data efetiva da transferência</Label>
                <Input
                  type="date"
                  value={form.data_efetiva}
                  onChange={(e) => setForm({ ...form, data_efetiva: e.target.value })}
                />
              </div>
              <div className="col-span-2">
                <Label className="text-sm">Motivo da transferência *</Label>
                <Input
                  value={form.motivo}
                  onChange={(e) => setForm({ ...form, motivo: e.target.value })}
                  placeholder="Ex.: Transferência de titularidade por acordo entre as partes"
                />
              </div>
              <div className="col-span-2">
                <Label className="text-sm">Observações</Label>
                <Textarea
                  rows={2}
                  value={form.observacoes}
                  onChange={(e) => setForm({ ...form, observacoes: e.target.value })}
                />
              </div>
              <div>
                <Label className="text-sm">Taxa de transferência (R$)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={form.taxa_transferencia}
                  onChange={(e) => setForm({ ...form, taxa_transferencia: e.target.value })}
                />
              </div>
              <div>
                <Label className="text-sm">Protocolo da administradora</Label>
                <Input
                  value={form.protocolo_administradora}
                  onChange={(e) => setForm({ ...form, protocolo_administradora: e.target.value })}
                />
              </div>
              <div>
                <Label className="text-sm">Vendedor responsável</Label>
                <Select
                  value={form.vendedor_responsavel_id}
                  onValueChange={(v) => {
                    const colab = colaboradores.find((c) => c.id === v);
                    setForm({
                      ...form,
                      vendedor_responsavel_id: v,
                      vendedor_responsavel_nome: colab?.nome || form.vendedor_responsavel_nome,
                    });
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o vendedor" />
                  </SelectTrigger>
                  <SelectContent>
                    {colaboradores.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-sm">Valor de crédito atualizado (R$)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={form.valor_credito_novo}
                  onChange={(e) => setForm({ ...form, valor_credito_novo: e.target.value })}
                />
              </div>
              <div className="col-span-2 grid grid-cols-2 gap-3">
                <div className="flex items-center gap-2">
                  <input
                    type="radio"
                    id="manter_sim"
                    checked={form.manter_contrato === true}
                    onChange={() => setForm({ ...form, manter_contrato: true })}
                  />
                  <Label htmlFor="manter_sim" className="text-sm cursor-pointer">Manter número do contrato atual</Label>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="radio"
                    id="manter_nao"
                    checked={form.manter_contrato === false}
                    onChange={() => setForm({ ...form, manter_contrato: false })}
                  />
                  <Label htmlFor="manter_nao" className="text-sm cursor-pointer">Informar novo número de contrato</Label>
                </div>
                {!form.manter_contrato && (
                  <Input
                    className="col-span-2"
                    placeholder="Novo número do contrato *"
                    value={form.contrato_novo}
                    onChange={(e) => setForm({ ...form, contrato_novo: e.target.value })}
                  />
                )}
              </div>
              {transferenciaExistente && isAprovador && (
                <div className="col-span-2">
                  <Label className="text-sm">Situação da transferência</Label>
                  <Select value={form.situacao} onValueChange={(v) => setForm({ ...form, situacao: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SITUACOES.map((s) => (
                        <SelectItem key={s.value} value={s.value}>
                          {s.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            {/* Anexos */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-sm">Anexar documentos</Label>
                <input type="file" onChange={(e) => handleUploadDocumento(e, 'doc')} className="text-xs" />
                <ul className="text-xs space-y-1">
                  {form.documentos_nomes.map((n, i) => (
                    <li key={i} className="flex items-center justify-between bg-slate-50 rounded px-2 py-1">
                      <span className="truncate flex-1">{n}</span>
                      <Button size="sm" variant="ghost" onClick={() => removerAnexo('doc', i)}>
                        ×
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="space-y-2">
                <Label className="text-sm">Anexar comprovante / termo de transferência</Label>
                <input type="file" onChange={(e) => handleUploadDocumento(e, 'comprovante')} className="text-xs" />
                <ul className="text-xs space-y-1">
                  {form.comprovante_nomes.map((n, i) => (
                    <li key={i} className="flex items-center justify-between bg-slate-50 rounded px-2 py-1">
                      <span className="truncate flex-1">{n}</span>
                      <Button size="sm" variant="ghost" onClick={() => removerAnexo('comprovante', i)}>
                        ×
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </section>
        )}

        {/* Resumo + Confirmação */}
        {clienteSelecionado && !jaTransferida && (
          <section className="rounded-xl border bg-amber-50 p-4 space-y-2">
            <p className="font-medium text-amber-800">Resumo da transferência</p>
            <p className="text-sm">
              Você está transferindo o Grupo <strong>{venda.grupo}</strong>, Cota <strong>{venda.cota}</strong>,
              Contrato <strong>{venda.contrato || '-'}</strong>, do cliente <strong>{venda.cliente_nome}</strong> para{' '}
              <strong>{clienteSelecionado.nome_completo || clienteSelecionado.nome}</strong>.
            </p>
            <p className="text-xs text-amber-700">
              A transferência somente será concluída após a aprovação. O histórico da proposta original será preservado.
            </p>
          </section>
        )}

        {/* Quando já transferida, mostrar destino */}
        {jaTransferida && (
          <div className="rounded-xl border bg-blue-50 p-4 text-sm text-blue-800">
            Cota transferida para <strong>{venda.transferencia_cliente_destino_nome || 'novo titular'}</strong>
            {venda.transferencia_data ? ` em ${format(new Date(venda.transferencia_data), 'dd/MM/yyyy')}` : ''}.
          </div>
        )}

        {/* Botões */}
        <div className="flex flex-wrap justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={salvando}>
            Cancelar
          </Button>

          {!jaTransferida && !transferenciaExistente && (
            <>
              <Button variant="secondary" onClick={() => handleSubmit('salvar_pendente')} disabled={salvando || !podeAvancar}>
                {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Salvar como pendente'}
              </Button>
              <Button className="bg-[#23BE84] hover:bg-[#1da570]" onClick={() => handleSubmit('solicitar')} disabled={salvando || !podeAvancar}>
                {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Solicitar transferência'}
              </Button>
            </>
          )}

          {!jaTransferida && transferenciaExistente && isAprovador && transferenciaExistente.situacao !== 'aprovada' && transferenciaExistente.situacao !== 'reprovada' && (
            <>
              <Button variant="destructive" onClick={handleReprovar} disabled={salvando}>
                Reprovar
              </Button>
              <Button className="bg-[#23BE84] hover:bg-[#1da570]" onClick={handleAprovar} disabled={salvando}>
                {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Aprovar transferência'}
              </Button>
            </>
          )}

          {!jaTransferida && transferenciaExistente && !isAprovador && (
            <Button
              variant="secondary"
              onClick={() => handleSubmit('salvar_pendente')}
              disabled={salvando || transferenciaExistente.situacao === 'aprovada'}
            >
              {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Salvar alterações'}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}