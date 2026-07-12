import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

const SectionTitle = ({ children }) => (
  <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 border-b pb-2 mb-4">{children}</h3>
);

const FieldGroup = ({ children, cols = 2 }) => (
  <div className={`grid grid-cols-${cols} gap-3 mb-4`}>{children}</div>
);

const Field = ({ label, children, span = 1 }) => (
  <div className={span === 2 ? 'col-span-2' : ''}>
    <Label className="text-xs mb-1 block text-slate-600">{label}</Label>
    {children}
  </div>
);

const MoneyInput = ({ value, onChange }) => (
  <div className="relative">
    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs">R$</span>
    <Input
      type="number"
      step="0.01"
      min="0"
      className="pl-9"
      value={value || ''}
      onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
    />
  </div>
);

export default function PropostaEditModal({ proposta, open, onOpenChange, currentUser }) {
  const [formData, setFormData] = useState(proposta || {});
  const [isLoading, setIsLoading] = useState(false);
  const [bancoAlterado, setBancoAlterado] = useState(false);
  const [empresaParceiraAlterada, setEmpresaParceiraAlterada] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (proposta) {
      setFormData(proposta);
      setBancoAlterado(false);
      setEmpresaParceiraAlterada(false);
    }
  }, [proposta]);

  // Se a proposta não tem banco_id salvo mas tem o nome do banco, localiza o id correspondente
  // apenas para exibição correta no select (não marca como alterado, preservando o valor original ao salvar)
  useEffect(() => {
    if (proposta && bancos.length > 0 && !proposta.banco_id && proposta.administradora_nome && !formData.banco_id) {
      const match = bancos.find(b => b.nome === proposta.administradora_nome);
      if (match) {
        setFormData(prev => ({ ...prev, banco_id: match.id }));
      }
    }
  }, [proposta, bancos]);

  const set = (field) => (val) => setFormData(prev => ({ ...prev, [field]: val }));
  const setE = (field) => (e) => setFormData(prev => ({ ...prev, [field]: e.target.value }));

  const { data: administradoras = [] } = useQuery({
    queryKey: ['administradoras'],
    queryFn: () => base44.entities.Administradora.filter({ status: 'ativa' }),
  });
  const { data: bancos = [] } = useQuery({
    queryKey: ['bancos-edit'],
    queryFn: () => base44.entities.Banco.filter({ ativo: true }),
  });
  const { data: vendedores = [] } = useQuery({
    queryKey: ['vendedores-edit'],
    queryFn: () => base44.entities.Colaborador.filter({ status: 'ativo' }, 'nome', 200),
  });
  const { data: statusList = [] } = useQuery({
    queryKey: ['status-propostas-edit'],
    queryFn: () => base44.entities.StatusProposta.filter({ ativo: true }),
  });
  const { data: convenios = [] } = useQuery({
    queryKey: ['convenios-edit'],
    queryFn: () => base44.entities.Convenio.filter({ ativo: true }),
  });
  const { data: tiposEmprestimo = [] } = useQuery({
    queryKey: ['tipos-emprestimo-edit'],
    queryFn: () => base44.entities.TipoEmprestimo.filter({ ativo: true }, 'nome'),
  });
  const { data: tabelasEmprestimo = [] } = useQuery({
    queryKey: ['tabelas-emprestimo-edit', currentUser?.empresa_id],
    queryFn: () => base44.entities.TabelaEmprestimo.filter(
      currentUser?.empresa_id ? { empresa_id: currentUser.empresa_id } : {},
      undefined, 500
    ),
    enabled: !!currentUser,
  });
  const { data: empresasParceiras = [] } = useQuery({
    queryKey: ['empresas-parceiras-edit', currentUser?.empresa_id],
    queryFn: () => currentUser?.empresa_id
      ? base44.entities.EmpresaParceira.filter({ empresa_id: currentUser.empresa_id }, 'nome', 200)
      : base44.entities.EmpresaParceira.list('nome', 200),
  });

  const updateMutation = useMutation({
    mutationFn: (data) => base44.entities.Proposta.update(proposta.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vendas-emprestimos'] });
      queryClient.invalidateQueries({ queryKey: ['propostas'] });
      toast.success('Proposta atualizada com sucesso!');
      onOpenChange(false);
    },
    onError: (error) => {
      toast.error('Erro ao atualizar proposta');
      console.error(error);
    }
  });

  const handleSave = async () => {
    setIsLoading(true);
    try {
      const dataToUpdate = {
        valor_credito: parseFloat(formData.valor_credito) || 0,
        valor_liquido: parseFloat(formData.valor_liquido) || 0,
        valor_comissao: parseFloat(formData.valor_comissao) || 0,
        comissao_recebida: parseFloat(formData.comissao_recebida) || 0,
        status: formData.status,
        status_id: formData.status_id || '',
        observacoes: formData.observacoes || '',
        grupo: formData.grupo || '',
        cota: formData.cota || '',
        contrato: formData.contrato || '',
        data_venda: formData.data_venda || '',
        vendedor_id: formData.vendedor_id || '',
        vendedor_nome: formData.vendedor_nome || '',
        administradora_id: bancoAlterado ? (formData.administradora_id || '') : (proposta.administradora_id || ''),
        administradora_nome: bancoAlterado ? (formData.administradora_nome || '') : (proposta.administradora_nome || ''),
        banco_id: bancoAlterado ? (formData.banco_id || '') : (proposta.banco_id || ''),
        empresa_parceira_id: empresaParceiraAlterada ? (formData.empresa_parceira_id || '') : (proposta.empresa_parceira_id || ''),
        empresa_parceira_nome: empresaParceiraAlterada ? (formData.empresa_parceira_nome || '') : (proposta.empresa_parceira_nome || ''),
      };

      if (formData.produto === 'emprestimo') {
        dataToUpdate.emprestimo_tipo = formData.emprestimo_tipo || '';
        dataToUpdate.emprestimo_convenio_id = formData.emprestimo_convenio_id || '';
        dataToUpdate.emprestimo_convenio_nome = formData.emprestimo_convenio_nome || '';
        dataToUpdate.emprestimo_numero_beneficio = formData.emprestimo_numero_beneficio || '';
        dataToUpdate.emprestimo_numero_ade = formData.emprestimo_numero_ade || '';
        dataToUpdate.emprestimo_prazo = parseInt(formData.emprestimo_prazo) || 0;
        dataToUpdate.emprestimo_valor_parcela = parseFloat(formData.emprestimo_valor_parcela) || 0;
        dataToUpdate.emprestimo_banco_anterior = formData.emprestimo_banco_anterior || '';
        dataToUpdate.emprestimo_saldo_devedor = parseFloat(formData.emprestimo_saldo_devedor) || 0;
        dataToUpdate.emprestimo_data_liberacao = formData.emprestimo_data_liberacao || '';
        dataToUpdate.tabela_comissao_id = formData.tabela_comissao_id || '';
        dataToUpdate.tabela_comissao_nome = formData.tabela_comissao_nome || '';
      }

      await updateMutation.mutateAsync(dataToUpdate);
    } finally {
      setIsLoading(false);
    }
  };

  const podeVerEmpresaParceira = ['master', 'super_admin', 'admin', 'gerente', 'colaborador'].includes(currentUser?.perfil);
  const produtoLabels = { consorcio: 'Consórcio', emprestimo: 'Empréstimo', financiamento: 'Financiamento' };
  const isPortabilidade = formData.emprestimo_tipo === 'PORTABILIDADE_PURA' || formData.emprestimo_tipo === 'REFIN_PORTABILIDADE';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar Proposta</DialogTitle>
          <DialogDescription>{formData.cliente_nome} — {produtoLabels[formData.produto] || formData.produto}</DialogDescription>
        </DialogHeader>

        {proposta && (
          <div className="space-y-6 pt-2">

            {/* Informações Básicas */}
            <div>
              <SectionTitle>Informações Básicas</SectionTitle>
              <FieldGroup>
                <Field label="Cliente">
                  <Input disabled value={formData.cliente_nome || ''} />
                </Field>
                <Field label="CPF">
                  <Input disabled value={formData.cliente_cpf || ''} />
                </Field>
                <Field label="Produto">
                  <Input disabled value={produtoLabels[formData.produto] || formData.produto} />
                </Field>
                <Field label="Vendedor">
                  <Select value={formData.vendedor_id || ''} onValueChange={(v) => {
                    const vend = vendedores.find(x => x.id === v);
                    setFormData(prev => ({ ...prev, vendedor_id: v, vendedor_nome: vend?.nome || '' }));
                  }}>
                    <SelectTrigger><SelectValue placeholder="Selecione">{formData.vendedor_nome || 'Selecione'}</SelectValue></SelectTrigger>
                    <SelectContent>{vendedores.map(v => <SelectItem key={v.id} value={v.id}>{v.nome}</SelectItem>)}</SelectContent>
                  </Select>
                </Field>
                <Field label="Data da Venda">
                  <Input type="date" value={formData.data_venda || ''} onChange={setE('data_venda')} />
                </Field>
                {podeVerEmpresaParceira && (
                  <Field label="Empresa Parceira" span={2}>
                    <Select value={formData.empresa_parceira_id || ''} onValueChange={(v) => {
                      setEmpresaParceiraAlterada(true);
                      if (!v) {
                        setFormData(prev => ({ ...prev, empresa_parceira_id: '', empresa_parceira_nome: '' }));
                      } else {
                        const ep = empresasParceiras.find(x => x.id === v);
                        setFormData(prev => ({ ...prev, empresa_parceira_id: v, empresa_parceira_nome: ep?.nome || '' }));
                      }
                    }}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione (opcional)">
                          {formData.empresa_parceira_nome || 'Nenhuma'}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={null}>Nenhuma</SelectItem>
                        {empresasParceiras.map(ep => <SelectItem key={ep.id} value={ep.id}>{ep.nome}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </Field>
                )}
              </FieldGroup>
            </div>

            {/* Dados do Empréstimo */}
            {formData.produto === 'emprestimo' && (
              <div>
                <SectionTitle>Dados do Empréstimo</SectionTitle>
                <FieldGroup>
                  <Field label="Tipo de Empréstimo">
                    <Select value={formData.emprestimo_tipo || ''} onValueChange={set('emprestimo_tipo')}>
                      <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>
                        {tiposEmprestimo.length > 0 ? (
                          tiposEmprestimo.map(t => <SelectItem key={t.id} value={t.slug}>{t.nome}</SelectItem>)
                        ) : (
                          <>
                            <SelectItem value="NOVO">Novo</SelectItem>
                            <SelectItem value="REFINANCIAMENTO">Refinanciamento</SelectItem>
                            <SelectItem value="PORTABILIDADE_PURA">Portabilidade Pura</SelectItem>
                            <SelectItem value="REFIN_PORTABILIDADE">Refin + Portabilidade</SelectItem>
                            <SelectItem value="CARTAO_CONSIGNADO">Cartão Consignado</SelectItem>
                            <SelectItem value="CARTAO_CONSIGNADO_SAQUE">Cartão com Saque</SelectItem>
                          </>
                        )}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Convênio">
                    <Select value={formData.emprestimo_convenio_id || ''} onValueChange={(v) => {
                      const conv = convenios.find(c => c.id === v);
                      setFormData(prev => ({ ...prev, emprestimo_convenio_id: v, emprestimo_convenio_nome: conv?.nome || '' }));
                    }}>
                      <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>{convenios.map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}</SelectContent>
                    </Select>
                  </Field>
                  <Field label="Número do Benefício">
                    <Input value={formData.emprestimo_numero_beneficio || ''} onChange={setE('emprestimo_numero_beneficio')} />
                  </Field>
                  <Field label="Número ADE">
                    <Input value={formData.emprestimo_numero_ade || ''} onChange={setE('emprestimo_numero_ade')} />
                  </Field>
                  <Field label="Número do Contrato">
                    <Input value={formData.contrato || ''} onChange={setE('contrato')} />
                  </Field>
                  <Field label="Prazo (meses)">
                    <Input type="number" value={formData.emprestimo_prazo || ''} onChange={(e) => setFormData(prev => ({ ...prev, emprestimo_prazo: parseInt(e.target.value) || 0 }))} />
                  </Field>
                  <Field label="Valor da Parcela">
                    <MoneyInput value={formData.emprestimo_valor_parcela} onChange={set('emprestimo_valor_parcela')} />
                  </Field>
                  <Field label="Data de Liberação">
                    <Input type="date" value={formData.emprestimo_data_liberacao || ''} onChange={setE('emprestimo_data_liberacao')} />
                  </Field>
                  <Field label="Tabela de Comissão" span={2}>
                    <Select value={formData.tabela_comissao_id || 'nenhuma'} onValueChange={(v) => {
                      if (v === 'nenhuma') {
                        setFormData(prev => ({ ...prev, tabela_comissao_id: '', tabela_comissao_nome: '' }));
                      } else {
                        const tab = tabelasEmprestimo.find(t => t.id === v);
                        setFormData(prev => ({ ...prev, tabela_comissao_id: v, tabela_comissao_nome: tab?.nome || '' }));
                      }
                    }}>
                      <SelectTrigger><SelectValue placeholder="Selecione (opcional)" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="nenhuma">Nenhuma</SelectItem>
                        {tabelasEmprestimo.map(t => <SelectItem key={t.id} value={t.id}>{t.nome}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </Field>
                  {isPortabilidade && (
                    <>
                      <Field label="Banco Anterior">
                        <Input value={formData.emprestimo_banco_anterior || ''} onChange={setE('emprestimo_banco_anterior')} />
                      </Field>
                      <Field label="Saldo Devedor">
                        <MoneyInput value={formData.emprestimo_saldo_devedor} onChange={set('emprestimo_saldo_devedor')} />
                      </Field>
                    </>
                  )}
                </FieldGroup>
              </div>
            )}

            {/* Dados do Consórcio */}
            {formData.produto === 'consorcio' && (
              <div>
                <SectionTitle>Dados do Consórcio</SectionTitle>
                <FieldGroup>
                  <Field label="Grupo">
                    <Input value={formData.grupo || ''} onChange={setE('grupo')} />
                  </Field>
                  <Field label="Cota">
                    <Input value={formData.cota || ''} onChange={setE('cota')} />
                  </Field>
                  <Field label="Contrato" span={2}>
                    <Input value={formData.contrato || ''} onChange={setE('contrato')} />
                  </Field>
                </FieldGroup>
              </div>
            )}

            {/* Valores */}
            <div>
              <SectionTitle>Valores Financeiros</SectionTitle>
              <FieldGroup>
                <Field label="Banco / Administradora" span={2}>
                  {formData.produto === 'emprestimo' ? (
                    <Select value={formData.banco_id || formData.administradora_id || ''} onValueChange={(v) => {
                      const banco = bancos.find(b => b.id === v);
                      setBancoAlterado(true);
                      setFormData(prev => ({ ...prev, banco_id: v, administradora_id: v, administradora_nome: banco?.nome || '' }));
                    }}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione">
                          {formData.administradora_nome || bancos.find(b => b.id === (formData.banco_id || formData.administradora_id))?.nome || 'Selecione'}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>{bancos.map(b => <SelectItem key={b.id} value={b.id}>{b.nome}</SelectItem>)}</SelectContent>
                    </Select>
                  ) : (
                    <Select value={formData.administradora_id || ''} onValueChange={(v) => {
                      const adm = administradoras.find(a => a.id === v);
                      setBancoAlterado(true);
                      setFormData(prev => ({ ...prev, administradora_id: v, administradora_nome: adm?.nome_fantasia || adm?.razao_social || '' }));
                    }}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione">
                          {formData.administradora_nome || administradoras.find(a => a.id === formData.administradora_id)?.nome_fantasia || administradoras.find(a => a.id === formData.administradora_id)?.razao_social || 'Selecione'}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>{administradoras.map(a => <SelectItem key={a.id} value={a.id}>{a.nome_fantasia || a.razao_social}</SelectItem>)}</SelectContent>
                    </Select>
                  )}
                </Field>
                <Field label="Valor Bruto (Crédito)">
                  <MoneyInput value={formData.valor_credito} onChange={set('valor_credito')} />
                </Field>
                <Field label="Valor Líquido (retirado pelo cliente)">
                  <MoneyInput value={formData.valor_liquido} onChange={set('valor_liquido')} />
                </Field>
                <Field label="Valor da Comissão (estimado)">
                  <MoneyInput value={formData.valor_comissao} onChange={set('valor_comissao')} />
                </Field>
                <Field label="Comissão Recebida">
                  <MoneyInput value={formData.comissao_recebida} onChange={set('comissao_recebida')} />
                </Field>
              </FieldGroup>
            </div>

            {/* Status */}
            <div>
              <SectionTitle>Status e Observações</SectionTitle>
              <div className="space-y-3">
                <Field label="Status">
                  <Select value={formData.status_id || formData.status || ''} onValueChange={(v) => {
                    const s = statusList.find(x => x.id === v);
                    setFormData(prev => ({ ...prev, status_id: v, status: s?.nome || v }));
                  }}>
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      {statusList.length > 0
                        ? statusList.sort((a, b) => (a.ordem || 0) - (b.ordem || 0)).map(s => <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>)
                        : <><SelectItem value="ativa">Ativa</SelectItem><SelectItem value="pendente">Pendente</SelectItem><SelectItem value="cancelada">Cancelada</SelectItem></>
                      }
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Observações">
                  <Textarea value={formData.observacoes || ''} onChange={setE('observacoes')} rows={3} />
                </Field>
              </div>
            </div>

            {/* Ações */}
            <div className="flex justify-end gap-3 pt-4 border-t">
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>Cancelar</Button>
              <Button onClick={handleSave} disabled={isLoading} className="bg-[#1e3a5f] hover:bg-[#2a4a73]">
                {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Salvar Alterações
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}