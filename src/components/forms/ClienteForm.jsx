import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
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

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Loader2, User, Building2, Upload, X, FileText } from 'lucide-react';
import { base44 } from '@/api/base44Client';

export default function ClienteForm({ open, onOpenChange, cliente, onSubmit, isLoading }) {
  const [uploadingDoc, setUploadingDoc] = useState(null);
  
  const { register, handleSubmit, setValue, watch, reset, formState: { errors } } = useForm({
    defaultValues: cliente || {
      tipo_pessoa: 'Física',
      status: 'ativo',
      // Checkboxes PF
      doc_documento_testemunhas: false,
      doc_documento_testemunhas_urls: [],
      doc_identidade: false,
      doc_identidade_urls: [],
      doc_comprovante_endereco: false,
      doc_comprovante_endereco_urls: [],
      doc_comprovante_renda: false,
      doc_comprovante_renda_urls: [],
      doc_proposta_assinada: false,
      doc_proposta_assinada_urls: [],
      banco_nao_deseja_informar: false,
      banco_nao_possui_conta: false,
      // Checkboxes PJ
      pj_doc_contrato_ou_estatuto_social: false,
      pj_doc_contrato_ou_estatuto_social_urls: [],
      pj_doc_cartao_cnpj: false,
      pj_doc_cartao_cnpj_urls: [],
      pj_doc_documento_socios_ou_representante: false,
      pj_doc_documento_socios_ou_representante_urls: [],
      pj_doc_relacao_faturamento: false,
      pj_doc_relacao_faturamento_urls: [],
      pj_doc_proposta_assinada: false,
      pj_doc_proposta_assinada_urls: [],
      pj_banco_nao_deseja_informar: false,
      pj_banco_nao_possui_conta: false,
    }
  });

  const tipoPessoa = watch('tipo_pessoa');
  const bancoNaoDeseja = watch('banco_nao_deseja_informar');
  const bancoNaoPossui = watch('banco_nao_possui_conta');
  const pjBancoNaoDeseja = watch('pj_banco_nao_deseja_informar');
  const pjBancoNaoPossui = watch('pj_banco_nao_possui_conta');

  useEffect(() => {
    if (cliente) {
      Object.keys(cliente).forEach(key => {
        setValue(key, cliente[key]);
      });
    } else {
      reset({
        tipo_pessoa: 'Física',
        status: 'ativo',
        // Checkboxes PF
        doc_documento_testemunhas: false,
        doc_documento_testemunhas_urls: [],
        doc_identidade: false,
        doc_identidade_urls: [],
        doc_comprovante_endereco: false,
        doc_comprovante_endereco_urls: [],
        doc_comprovante_renda: false,
        doc_comprovante_renda_urls: [],
        doc_proposta_assinada: false,
        doc_proposta_assinada_urls: [],
        banco_nao_deseja_informar: false,
        banco_nao_possui_conta: false,
        // Checkboxes PJ
        pj_doc_contrato_ou_estatuto_social: false,
        pj_doc_contrato_ou_estatuto_social_urls: [],
        pj_doc_cartao_cnpj: false,
        pj_doc_cartao_cnpj_urls: [],
        pj_doc_documento_socios_ou_representante: false,
        pj_doc_documento_socios_ou_representante_urls: [],
        pj_doc_relacao_faturamento: false,
        pj_doc_relacao_faturamento_urls: [],
        pj_doc_proposta_assinada: false,
        pj_doc_proposta_assinada_urls: [],
        pj_banco_nao_deseja_informar: false,
        pj_banco_nao_possui_conta: false,
      });
    }
  }, [cliente, setValue, reset]);

  // Converter valores de moeda para número
  const parseCurrencyToNumber = (value) => {
    if (!value || value === '') return null;
    if (typeof value === 'number') return value;
    // Remove tudo exceto dígitos e vírgula, depois substitui vírgula por ponto
    const numericString = String(value)
      .replace(/[^\d,]/g, '')  // Remove tudo exceto números e vírgula
      .replace(/\./g, '')       // Remove pontos de milhar
      .replace(',', '.');       // Substitui vírgula decimal por ponto
    const number = parseFloat(numericString);
    return isNaN(number) ? null : number;
  };

  // Gerar código do cliente ao submeter
  const handleFormSubmit = async (data) => {
    console.log('🟢 Processando submit do formulário...', data);
    
    if (!data.cliente_code) {
      try {
        const clientes = await base44.entities.Cliente.list();
        const ultimoCodigo = clientes
          .map(c => c.cliente_code)
          .filter(code => code && code.startsWith('CLI'))
          .map(code => parseInt(code.replace('CLI', '')))
          .filter(num => !isNaN(num))
          .sort((a, b) => b - a)[0] || 0;
        
        data.cliente_code = `CLI${String(ultimoCodigo + 1).padStart(3, '0')}`;
        console.log('🟢 Código gerado:', data.cliente_code);
      } catch (error) {
        console.warn('⚠️ Erro ao gerar código, usando CLI001');
        data.cliente_code = `CLI001`;
      }
    }

    // Converter campos de moeda para número (remover se vazio ou nulo)
    data.valor_patrimonial = data.valor_patrimonial ? parseCurrencyToNumber(data.valor_patrimonial) : null;
    data.renda = data.renda ? parseCurrencyToNumber(data.renda) : null;
    data.pj_valor_patrimonial = data.pj_valor_patrimonial ? parseCurrencyToNumber(data.pj_valor_patrimonial) : null;
    data.pj_capital_social = data.pj_capital_social ? parseCurrencyToNumber(data.pj_capital_social) : null;
    data.pj_faturamento_medio = data.pj_faturamento_medio ? parseCurrencyToNumber(data.pj_faturamento_medio) : null;
    
    console.log('🟢 Dados processados, chamando onSubmit...');
    const clienteCriado = await onSubmit(data);
    console.log('✅ onSubmit concluído');
    return clienteCriado;
  };

  const formatCPF = (value) => {
    return value
      .replace(/\D/g, '')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d{1,2})/, '$1-$2')
      .replace(/(-\d{2})\d+?$/, '$1');
  };

  const formatCNPJ = (value) => {
    return value
      .replace(/\D/g, '')
      .replace(/(\d{2})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1/$2')
      .replace(/(\d{4})(\d)/, '$1-$2')
      .replace(/(-\d{2})\d+?$/, '$1');
  };

  const formatPhone = (value, countryCode = '+55') => {
    const numbers = value.replace(/\D/g, '');
    
    if (countryCode === '+55') {
      // Brasil: (XX) XXXXX-XXXX
      return numbers
        .replace(/(\d{2})(\d)/, '($1) $2')
        .replace(/(\d{5})(\d)/, '$1-$2')
        .replace(/(-\d{4})\d+?$/, '$1');
    } else {
      // Outros países: XXX XXX XXX (ou menos dígitos)
      return numbers
        .replace(/(\d{3})(\d)/, '$1 $2')
        .replace(/(\d{3}\s\d{3})(\d)/, '$1 $2')
        .replace(/(\d{3}\s\d{3}\s\d{3})\d+?$/, '$1');
    }
  };

  const countryCodeOptions = [
    { code: '+55', label: '+55 Brasil' },
    { code: '+1', label: '+1 EUA/Canadá' },
    { code: '+34', label: '+34 Espanha' },
    { code: '+33', label: '+33 França' },
    { code: '+44', label: '+44 Reino Unido' },
    { code: '+39', label: '+39 Itália' },
    { code: '+49', label: '+49 Alemanha' },
    { code: '+351', label: '+351 Portugal' },
  ];

  const formatCEP = (value) => {
    return value
      .replace(/\D/g, '')
      .replace(/(\d{5})(\d)/, '$1-$2')
      .replace(/(-\d{3})\d+?$/, '$1');
  };

  const formatCurrency = (value) => {
    if (!value) return '';
    const numericValue = value.replace(/\D/g, '');
    const number = parseFloat(numericValue) / 100;
    return number.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };

  const ufs = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'];

  const handleFileUpload = async (files, fieldName) => {
    if (!files || files.length === 0) return;
    
    setUploadingDoc(fieldName);
    
    try {
      const uploadedUrls = [];
      for (const file of files) {
        const { file_url } = await base44.integrations.Core.UploadFile({ file });
        uploadedUrls.push(file_url);
      }
      
      const currentUrls = watch(fieldName) || [];
      setValue(fieldName, [...currentUrls, ...uploadedUrls]);
      toast.success(`${files.length} arquivo(s) anexado(s)`);
    } catch (error) {
      toast.error('Erro ao fazer upload');
      console.error(error);
    } finally {
      setUploadingDoc(null);
    }
  };

  const removeFile = (fieldName, urlToRemove) => {
    const currentUrls = watch(fieldName) || [];
    setValue(fieldName, currentUrls.filter(url => url !== urlToRemove));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{cliente ? 'Editar Cliente' : 'Novo Cliente'}</DialogTitle>
          <DialogDescription>
            Complete o cadastro do cliente com todos os dados necessários
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            e.stopPropagation();
            handleSubmit(handleFormSubmit)(e);
          }}
          className="space-y-6"
        >
          {/* Tipo de Pessoa */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Tipo de Pessoa</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-4">
                <div>
                  <Label>Tipo de Pessoa *</Label>
                  <Select
                    value={watch('tipo_pessoa') || 'Física'}
                    onValueChange={(value) => setValue('tipo_pessoa', value)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Física">
                        <div className="flex items-center gap-2">
                          <User className="w-4 h-4" />
                          Pessoa Física
                        </div>
                      </SelectItem>
                      <SelectItem value="Jurídica">
                        <div className="flex items-center gap-2">
                          <Building2 className="w-4 h-4" />
                          Pessoa Jurídica
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* PESSOA FÍSICA */}
          {tipoPessoa === 'Física' && (
            <>
              {/* Dados Pessoais */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg flex items-center justify-between">
                      <span>Dados Pessoais</span>
                      <div className="bg-amber-50 border-2 border-amber-400 rounded-lg px-4 py-2 shadow-md">
                        <Label className="text-xs font-medium text-amber-900 mb-1 block">🔐 Senha GOV</Label>
                        <Input
                          {...register('senha_gov')}
                          type="text"
                          placeholder="Digite a senha GOV"
                          className="h-9 w-48 bg-white border-amber-300 focus:border-amber-500"
                        />
                      </div>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-3">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="col-span-2">
                        <Label htmlFor="nome_completo">Nome Completo *</Label>
                        <Input
                          id="nome_completo"
                          {...register('nome_completo', { required: tipoPessoa === 'Física' && 'Nome é obrigatório' })}
                          placeholder="Nome completo do cliente"
                        />
                        {errors.nome_completo && <p className="text-sm text-red-500 mt-1">{errors.nome_completo.message}</p>}
                      </div>
                      
                      <div>
                        <Label htmlFor="cpf">CPF *</Label>
                        <Input
                          id="cpf"
                          {...register('cpf', { required: tipoPessoa === 'Física' && 'CPF é obrigatório' })}
                          placeholder="000.000.000-00"
                          onChange={(e) => setValue('cpf', formatCPF(e.target.value))}
                        />
                        {errors.cpf && <p className="text-sm text-red-500 mt-1">{errors.cpf.message}</p>}
                      </div>

                      <div>
                        <Label htmlFor="data_nascimento">Data de Nascimento</Label>
                        <Input
                          id="data_nascimento"
                          type="date"
                          {...register('data_nascimento')}
                        />
                      </div>

                      <div>
                        <Label htmlFor="rg">RG</Label>
                        <Input id="rg" {...register('rg')} />
                      </div>

                      <div>
                        <Label htmlFor="rg_data_emissao">Data Emissão RG</Label>
                        <Input type="date" id="rg_data_emissao" {...register('rg_data_emissao')} />
                      </div>

                      <div>
                        <Label htmlFor="rg_orgao_emissor">Órgão Emissor</Label>
                        <Input id="rg_orgao_emissor" {...register('rg_orgao_emissor')} placeholder="Ex: SSP" />
                      </div>

                      <div>
                        <Label htmlFor="estado_civil">Estado Civil</Label>
                        <Input id="estado_civil" {...register('estado_civil')} />
                      </div>

                      <div>
                        <Label htmlFor="profissao">Profissão</Label>
                        <Input id="profissao" {...register('profissao')} />
                      </div>

                      <div>
                        <Label>Sexo *</Label>
                        <RadioGroup
                          value={watch('sexo')}
                          onValueChange={(value) => setValue('sexo', value)}
                          className="flex gap-4 mt-2"
                        >
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem value="Masculino" id="sexo-masculino" />
                            <Label htmlFor="sexo-masculino" className="cursor-pointer font-normal">Masculino</Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem value="Feminino" id="sexo-feminino" />
                            <Label htmlFor="sexo-feminino" className="cursor-pointer font-normal">Feminino</Label>
                          </div>
                        </RadioGroup>
                      </div>

                      <div>
                        <Label>Politicamente exposto *</Label>
                        <RadioGroup
                          value={watch('politicamente_exposto')}
                          onValueChange={(value) => setValue('politicamente_exposto', value)}
                          className="flex gap-4 mt-2"
                        >
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem value="Sim" id="pe-sim" />
                            <Label htmlFor="pe-sim" className="cursor-pointer font-normal">Sim</Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem value="Não" id="pe-nao" />
                            <Label htmlFor="pe-nao" className="cursor-pointer font-normal">Não</Label>
                          </div>
                        </RadioGroup>
                      </div>

                      <div>
                        <Label htmlFor="valor_patrimonial">Valor Patrimonial</Label>
                        <Input
                          id="valor_patrimonial"
                          {...register('valor_patrimonial')}
                          placeholder="R$ 0,00"
                          onChange={(e) => setValue('valor_patrimonial', formatCurrency(e.target.value))}
                        />
                      </div>

                      <div>
                        <Label htmlFor="celular">Celular</Label>
                        <div className="flex gap-2">
                          <Select
                            value={watch('celular_pais') || '+55'}
                            onValueChange={(value) => setValue('celular_pais', value)}
                          >
                            <SelectTrigger className="w-32">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {countryCodeOptions.map(opt => (
                                <SelectItem key={opt.code} value={opt.code}>{opt.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Input
                            id="celular"
                            {...register('celular')}
                            placeholder={watch('celular_pais') === '+55' ? "(00) 00000-0000" : "XXX XXX XXX"}
                            onChange={(e) => setValue('celular', formatPhone(e.target.value, watch('celular_pais') || '+55'))}
                            className="flex-1"
                          />
                        </div>
                      </div>

                      <div>
                        <Label htmlFor="telefone_fixo">Telefone Fixo</Label>
                        <div className="flex gap-2">
                          <Select
                            value={watch('telefone_fixo_pais') || '+55'}
                            onValueChange={(value) => setValue('telefone_fixo_pais', value)}
                          >
                            <SelectTrigger className="w-32">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {countryCodeOptions.map(opt => (
                                <SelectItem key={opt.code} value={opt.code}>{opt.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Input
                            id="telefone_fixo"
                            {...register('telefone_fixo')}
                            placeholder={watch('telefone_fixo_pais') === '+55' ? "(00) 0000-0000" : "XXX XXX XXX"}
                            onChange={(e) => setValue('telefone_fixo', formatPhone(e.target.value, watch('telefone_fixo_pais') || '+55'))}
                            className="flex-1"
                          />
                        </div>
                      </div>
                      
                      <div className="col-span-2">
                        <Label htmlFor="email">Email</Label>
                        <Input
                          id="email"
                          type="email"
                          {...register('email')}
                          placeholder="email@exemplo.com"
                        />
                      </div>

                      <div>
                        <Label>Ocupou cargo público nos últimos anos? *</Label>
                        <RadioGroup
                          value={watch('ocupou_cargo_publico_ultimos_anos')}
                          onValueChange={(value) => setValue('ocupou_cargo_publico_ultimos_anos', value)}
                          className="flex gap-4 mt-2"
                        >
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem value="Sim" id="cargo-sim" />
                            <Label htmlFor="cargo-sim" className="cursor-pointer font-normal">Sim</Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem value="Não" id="cargo-nao" />
                            <Label htmlFor="cargo-nao" className="cursor-pointer font-normal">Não</Label>
                          </div>
                        </RadioGroup>
                      </div>

                      <div>
                        <Label>Parente ocupou cargo público (últimos 5 anos)? *</Label>
                        <RadioGroup
                          value={watch('parente_cargo_publico_ultimos_5_anos')}
                          onValueChange={(value) => setValue('parente_cargo_publico_ultimos_5_anos', value)}
                          className="flex gap-4 mt-2"
                        >
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem value="Sim" id="parente-sim" />
                            <Label htmlFor="parente-sim" className="cursor-pointer font-normal">Sim</Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem value="Não" id="parente-nao" />
                            <Label htmlFor="parente-nao" className="cursor-pointer font-normal">Não</Label>
                          </div>
                        </RadioGroup>
                      </div>

                      <div>
                        <Label>Status</Label>
                        <Select
                          value={watch('status')}
                          onValueChange={(value) => setValue('status', value)}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="ativo">Ativo</SelectItem>
                            <SelectItem value="inativo">Inativo</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </CardContent>
                </Card>

              {/* Endereço Residencial */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Endereço Residencial</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>CEP</Label>
                        <Input
                          {...register('res_cep')}
                          placeholder="00000-000"
                          onChange={(e) => setValue('res_cep', formatCEP(e.target.value))}
                        />
                      </div>

                      <div>
                        <Label>Tipo de Logradouro</Label>
                        <Select
                          value={watch('res_tipo_logradouro') || ''}
                          onValueChange={(value) => setValue('res_tipo_logradouro', value)}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione" />
                          </SelectTrigger>
                          <SelectContent position="popper" align="start" sideOffset={4}>
                            <SelectItem value="RUA">Rua</SelectItem>
                            <SelectItem value="AVENIDA">Avenida</SelectItem>
                            <SelectItem value="ALAMEDA">Alameda</SelectItem>
                            <SelectItem value="TRAVESSA">Travessa</SelectItem>
                            <SelectItem value="PRAÇA">Praça</SelectItem>
                            <SelectItem value="RODOVIA">Rodovia</SelectItem>
                            <SelectItem value="ESTRADA">Estrada</SelectItem>
                            <SelectItem value="VIA">Via</SelectItem>
                            <SelectItem value="BLOCO">Bloco</SelectItem>
                            <SelectItem value="CONJUNTO">Conjunto</SelectItem>
                            <SelectItem value="QUADRA">Quadra</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="col-span-2">
                        <Label>Endereço</Label>
                        <Input {...register('res_endereco')} placeholder="Nome da rua/avenida" />
                      </div>

                      <div>
                        <Label>Número</Label>
                        <Input {...register('res_numero')} />
                      </div>

                      <div>
                        <Label>Complemento</Label>
                        <Input {...register('res_complemento')} />
                      </div>

                      <div>
                        <Label>Bairro</Label>
                        <Input {...register('res_bairro')} />
                      </div>

                      <div>
                        <Label>Cidade</Label>
                        <Input {...register('res_cidade')} />
                      </div>

                      <div>
                        <Label>UF</Label>
                        <Select
                          value={watch('res_uf')}
                          onValueChange={(value) => setValue('res_uf', value)}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione" />
                          </SelectTrigger>
                          <SelectContent>
                            {ufs.map(uf => (
                              <SelectItem key={uf} value={uf}>{uf}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </CardContent>
                </Card>

              {/* Endereço Comercial */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Endereço Comercial</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>CEP</Label>
                        <Input
                          {...register('com_cep')}
                          placeholder="00000-000"
                          onChange={(e) => setValue('com_cep', formatCEP(e.target.value))}
                        />
                      </div>

                      <div>
                        <Label>Tipo de Logradouro</Label>
                        <Select
                          value={watch('com_tipo_logradouro') || ''}
                          onValueChange={(value) => setValue('com_tipo_logradouro', value)}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione" />
                          </SelectTrigger>
                          <SelectContent position="popper" align="start" sideOffset={4}>
                            <SelectItem value="RUA">Rua</SelectItem>
                            <SelectItem value="AVENIDA">Avenida</SelectItem>
                            <SelectItem value="ALAMEDA">Alameda</SelectItem>
                            <SelectItem value="TRAVESSA">Travessa</SelectItem>
                            <SelectItem value="PRAÇA">Praça</SelectItem>
                            <SelectItem value="RODOVIA">Rodovia</SelectItem>
                            <SelectItem value="ESTRADA">Estrada</SelectItem>
                            <SelectItem value="VIA">Via</SelectItem>
                            <SelectItem value="BLOCO">Bloco</SelectItem>
                            <SelectItem value="CONJUNTO">Conjunto</SelectItem>
                            <SelectItem value="QUADRA">Quadra</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="col-span-2">
                        <Label>Endereço</Label>
                        <Input {...register('com_endereco')} placeholder="Nome da rua/avenida" />
                      </div>

                      <div>
                        <Label>Número</Label>
                        <Input {...register('com_numero')} />
                      </div>

                      <div>
                        <Label>Complemento</Label>
                        <Input {...register('com_complemento')} />
                      </div>

                      <div>
                        <Label>Bairro</Label>
                        <Input {...register('com_bairro')} />
                      </div>

                      <div>
                        <Label>Cidade</Label>
                        <Input {...register('com_cidade')} />
                      </div>

                      <div>
                        <Label>UF</Label>
                        <Select
                          value={watch('com_uf')}
                          onValueChange={(value) => setValue('com_uf', value)}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione" />
                          </SelectTrigger>
                          <SelectContent>
                            {ufs.map(uf => (
                              <SelectItem key={uf} value={uf}>{uf}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </CardContent>
                </Card>

              {/* Dados Complementares */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Dados Complementares</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>Nome do Pai</Label>
                        <Input {...register('nome_pai')} />
                      </div>

                      <div>
                        <Label>Nome da Mãe</Label>
                        <Input {...register('nome_mae')} />
                      </div>

                      <div>
                        <Label>Nacionalidade</Label>
                        <Input {...register('nacionalidade')} />
                      </div>

                      <div>
                        <Label>UF de Nascimento</Label>
                        <Select
                          value={watch('uf_nascimento')}
                          onValueChange={(value) => setValue('uf_nascimento', value)}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione" />
                          </SelectTrigger>
                          <SelectContent>
                            {ufs.map(uf => (
                              <SelectItem key={uf} value={uf}>{uf}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="col-span-2">
                        <Label>Local de Nascimento</Label>
                        <Input {...register('local_nascimento')} placeholder="Cidade de nascimento" />
                      </div>

                      <div>
                        <Label>Renda</Label>
                        <Input
                          {...register('renda')}
                          placeholder="R$ 0,00"
                          onChange={(e) => setValue('renda', formatCurrency(e.target.value))}
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>

              {/* Checklist de Documentos */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Checklist de Documentos</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="space-y-6">
                      {/* Documento de Testemunhas */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-2">
                            <Checkbox
                              id="doc_documento_testemunhas"
                              checked={watch('doc_documento_testemunhas') || false}
                              onCheckedChange={(checked) => setValue('doc_documento_testemunhas', checked)}
                            />
                            <Label htmlFor="doc_documento_testemunhas" className="cursor-pointer">
                              Documento de Testemunhas
                            </Label>
                          </div>
                          <div>
                            <input
                              type="file"
                              id="upload-doc_documento_testemunhas_urls"
                              multiple
                              accept="image/*,.pdf"
                              onChange={(e) => handleFileUpload(Array.from(e.target.files), 'doc_documento_testemunhas_urls')}
                              className="hidden"
                            />
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={uploadingDoc === 'doc_documento_testemunhas_urls'}
                              onClick={() => document.getElementById('upload-doc_documento_testemunhas_urls').click()}
                            >
                              {uploadingDoc === 'doc_documento_testemunhas_urls' ? (
                                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Enviando...</>
                              ) : (
                                <><Upload className="w-4 h-4 mr-2" /> Anexar</>
                              )}
                            </Button>
                          </div>
                        </div>
                        {watch('doc_documento_testemunhas_urls')?.length > 0 && (
                          <div className="ml-6 space-y-1">
                            {watch('doc_documento_testemunhas_urls').map((url, idx) => (
                              <div key={idx} className="flex items-center gap-2 text-xs bg-slate-50 p-2 rounded">
                                <FileText className="w-3 h-3 text-slate-400" />
                                <a href={url} target="_blank" rel="noopener noreferrer" className="flex-1 truncate text-blue-600 hover:underline">
                                  Arquivo {idx + 1}
                                </a>
                                <button
                                  type="button"
                                  onClick={() => removeFile('doc_documento_testemunhas_urls', url)}
                                  className="text-red-500 hover:text-red-700"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Identidade */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-2">
                            <Checkbox
                              id="doc_identidade"
                              checked={watch('doc_identidade') || false}
                              onCheckedChange={(checked) => setValue('doc_identidade', checked)}
                            />
                            <Label htmlFor="doc_identidade" className="cursor-pointer">
                              Identidade (RG)
                            </Label>
                          </div>
                          <div>
                            <input
                              type="file"
                              id="upload-doc_identidade_urls"
                              multiple
                              accept="image/*,.pdf"
                              onChange={(e) => handleFileUpload(Array.from(e.target.files), 'doc_identidade_urls')}
                              className="hidden"
                            />
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={uploadingDoc === 'doc_identidade_urls'}
                              onClick={() => document.getElementById('upload-doc_identidade_urls').click()}
                            >
                              {uploadingDoc === 'doc_identidade_urls' ? (
                                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Enviando...</>
                              ) : (
                                <><Upload className="w-4 h-4 mr-2" /> Anexar</>
                              )}
                            </Button>
                          </div>
                        </div>
                        {watch('doc_identidade_urls')?.length > 0 && (
                          <div className="ml-6 space-y-1">
                            {watch('doc_identidade_urls').map((url, idx) => (
                              <div key={idx} className="flex items-center gap-2 text-xs bg-slate-50 p-2 rounded">
                                <FileText className="w-3 h-3 text-slate-400" />
                                <a href={url} target="_blank" rel="noopener noreferrer" className="flex-1 truncate text-blue-600 hover:underline">
                                  Arquivo {idx + 1}
                                </a>
                                <button
                                  type="button"
                                  onClick={() => removeFile('doc_identidade_urls', url)}
                                  className="text-red-500 hover:text-red-700"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Comprovante de Endereço */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-2">
                            <Checkbox
                              id="doc_comprovante_endereco"
                              checked={watch('doc_comprovante_endereco') || false}
                              onCheckedChange={(checked) => setValue('doc_comprovante_endereco', checked)}
                            />
                            <Label htmlFor="doc_comprovante_endereco" className="cursor-pointer">
                              Comprovante de Endereço
                            </Label>
                          </div>
                          <div>
                            <input
                              type="file"
                              id="upload-doc_comprovante_endereco_urls"
                              multiple
                              accept="image/*,.pdf"
                              onChange={(e) => handleFileUpload(Array.from(e.target.files), 'doc_comprovante_endereco_urls')}
                              className="hidden"
                            />
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={uploadingDoc === 'doc_comprovante_endereco_urls'}
                              onClick={() => document.getElementById('upload-doc_comprovante_endereco_urls').click()}
                            >
                              {uploadingDoc === 'doc_comprovante_endereco_urls' ? (
                                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Enviando...</>
                              ) : (
                                <><Upload className="w-4 h-4 mr-2" /> Anexar</>
                              )}
                            </Button>
                          </div>
                        </div>
                        {watch('doc_comprovante_endereco_urls')?.length > 0 && (
                          <div className="ml-6 space-y-1">
                            {watch('doc_comprovante_endereco_urls').map((url, idx) => (
                              <div key={idx} className="flex items-center gap-2 text-xs bg-slate-50 p-2 rounded">
                                <FileText className="w-3 h-3 text-slate-400" />
                                <a href={url} target="_blank" rel="noopener noreferrer" className="flex-1 truncate text-blue-600 hover:underline">
                                  Arquivo {idx + 1}
                                </a>
                                <button
                                  type="button"
                                  onClick={() => removeFile('doc_comprovante_endereco_urls', url)}
                                  className="text-red-500 hover:text-red-700"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Comprovante de Renda */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-2">
                            <Checkbox
                              id="doc_comprovante_renda"
                              checked={watch('doc_comprovante_renda') || false}
                              onCheckedChange={(checked) => setValue('doc_comprovante_renda', checked)}
                            />
                            <Label htmlFor="doc_comprovante_renda" className="cursor-pointer">
                              Comprovante de Renda
                            </Label>
                          </div>
                          <div>
                            <input
                              type="file"
                              id="upload-doc_comprovante_renda_urls"
                              multiple
                              accept="image/*,.pdf"
                              onChange={(e) => handleFileUpload(Array.from(e.target.files), 'doc_comprovante_renda_urls')}
                              className="hidden"
                            />
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={uploadingDoc === 'doc_comprovante_renda_urls'}
                              onClick={() => document.getElementById('upload-doc_comprovante_renda_urls').click()}
                            >
                              {uploadingDoc === 'doc_comprovante_renda_urls' ? (
                                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Enviando...</>
                              ) : (
                                <><Upload className="w-4 h-4 mr-2" /> Anexar</>
                              )}
                            </Button>
                          </div>
                        </div>
                        {watch('doc_comprovante_renda_urls')?.length > 0 && (
                          <div className="ml-6 space-y-1">
                            {watch('doc_comprovante_renda_urls').map((url, idx) => (
                              <div key={idx} className="flex items-center gap-2 text-xs bg-slate-50 p-2 rounded">
                                <FileText className="w-3 h-3 text-slate-400" />
                                <a href={url} target="_blank" rel="noopener noreferrer" className="flex-1 truncate text-blue-600 hover:underline">
                                  Arquivo {idx + 1}
                                </a>
                                <button
                                  type="button"
                                  onClick={() => removeFile('doc_comprovante_renda_urls', url)}
                                  className="text-red-500 hover:text-red-700"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Proposta Assinada */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-2">
                            <Checkbox
                              id="doc_proposta_assinada"
                              checked={watch('doc_proposta_assinada') || false}
                              onCheckedChange={(checked) => setValue('doc_proposta_assinada', checked)}
                            />
                            <Label htmlFor="doc_proposta_assinada" className="cursor-pointer">
                              Proposta Assinada
                            </Label>
                          </div>
                          <div>
                            <input
                              type="file"
                              id="upload-doc_proposta_assinada_urls"
                              multiple
                              accept="image/*,.pdf"
                              onChange={(e) => handleFileUpload(Array.from(e.target.files), 'doc_proposta_assinada_urls')}
                              className="hidden"
                            />
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={uploadingDoc === 'doc_proposta_assinada_urls'}
                              onClick={() => document.getElementById('upload-doc_proposta_assinada_urls').click()}
                            >
                              {uploadingDoc === 'doc_proposta_assinada_urls' ? (
                                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Enviando...</>
                              ) : (
                                <><Upload className="w-4 h-4 mr-2" /> Anexar</>
                              )}
                            </Button>
                          </div>
                        </div>
                        {watch('doc_proposta_assinada_urls')?.length > 0 && (
                          <div className="ml-6 space-y-1">
                            {watch('doc_proposta_assinada_urls').map((url, idx) => (
                              <div key={idx} className="flex items-center gap-2 text-xs bg-slate-50 p-2 rounded">
                                <FileText className="w-3 h-3 text-slate-400" />
                                <a href={url} target="_blank" rel="noopener noreferrer" className="flex-1 truncate text-blue-600 hover:underline">
                                  Arquivo {idx + 1}
                                </a>
                                <button
                                  type="button"
                                  onClick={() => removeFile('doc_proposta_assinada_urls', url)}
                                  className="text-red-500 hover:text-red-700"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="pt-4">
                        <Label>Observações</Label>
                        <Textarea
                          {...register('doc_observacoes')}
                          placeholder="Observações sobre os documentos..."
                          rows={4}
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>

              {/* Dados Bancários */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Dados Bancários</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="space-y-4">
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="banco_nao_deseja_informar"
                          checked={watch('banco_nao_deseja_informar') || false}
                          onCheckedChange={(checked) => setValue('banco_nao_deseja_informar', checked)}
                        />
                        <Label htmlFor="banco_nao_deseja_informar" className="cursor-pointer">
                          Não deseja informar dados bancários
                        </Label>
                      </div>

                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="banco_nao_possui_conta"
                          checked={watch('banco_nao_possui_conta') || false}
                          onCheckedChange={(checked) => setValue('banco_nao_possui_conta', checked)}
                        />
                        <Label htmlFor="banco_nao_possui_conta" className="cursor-pointer">
                          Não possui conta bancária
                        </Label>
                      </div>

                      {!bancoNaoDeseja && !bancoNaoPossui && (
                        <div className="grid grid-cols-2 gap-4 pt-4">
                          <div>
                            <Label>Banco</Label>
                            <Input {...register('banco_nome')} placeholder="Nome do banco" />
                          </div>

                          <div>
                            <Label>Código do Banco</Label>
                            <Input {...register('banco_codigo')} placeholder="Ex: 001" />
                          </div>

                          <div>
                            <Label>Agência</Label>
                            <Input {...register('agencia')} />
                          </div>

                          <div>
                            <Label>Conta</Label>
                            <Input {...register('conta')} />
                          </div>

                          <div>
                            <Label>Tipo de Conta</Label>
                            <Select
                              value={watch('tipo_conta')}
                              onValueChange={(value) => setValue('tipo_conta', value)}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Selecione" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="Corrente">Corrente</SelectItem>
                                <SelectItem value="Poupança">Poupança</SelectItem>
                                <SelectItem value="Salário">Salário</SelectItem>
                                <SelectItem value="Pix">Pix</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>

                          <div>
                            <Label>Chave PIX</Label>
                            <Input {...register('pix_chave')} placeholder="CPF, email, telefone ou chave aleatória" />
                          </div>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
            </>
          )}

          {/* PESSOA JURÍDICA */}
          {tipoPessoa === 'Jurídica' && (
            <>
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Dados da Empresa</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="col-span-2">
                        <Label>Razão Social *</Label>
                        <Input
                          {...register('pj_razao_social', { required: tipoPessoa === 'Jurídica' && 'Razão social é obrigatória' })}
                          placeholder="Razão social da empresa"
                        />
                        {errors.pj_razao_social && <p className="text-sm text-red-500 mt-1">{errors.pj_razao_social.message}</p>}
                      </div>

                      <div className="col-span-2">
                        <Label>Nome Fantasia</Label>
                        <Input {...register('pj_nome_fantasia')} placeholder="Nome fantasia" />
                      </div>

                      <div>
                        <Label>CNPJ *</Label>
                        <Input
                          {...register('pj_cnpj', { required: tipoPessoa === 'Jurídica' && 'CNPJ é obrigatório' })}
                          placeholder="00.000.000/0000-00"
                          onChange={(e) => setValue('pj_cnpj', formatCNPJ(e.target.value))}
                        />
                        {errors.pj_cnpj && <p className="text-sm text-red-500 mt-1">{errors.pj_cnpj.message}</p>}
                      </div>

                      <div>
                        <Label>Inscrição Estadual</Label>
                        <Input {...register('pj_inscricao_estadual')} />
                      </div>

                      <div>
                        <Label>Valor Patrimonial</Label>
                        <Input
                          {...register('pj_valor_patrimonial')}
                          placeholder="R$ 0,00"
                          onChange={(e) => setValue('pj_valor_patrimonial', formatCurrency(e.target.value))}
                        />
                      </div>

                      <div>
                        <Label>Capital Social</Label>
                        <Input
                          {...register('pj_capital_social')}
                          placeholder="R$ 0,00"
                          onChange={(e) => setValue('pj_capital_social', formatCurrency(e.target.value))}
                        />
                      </div>

                      <div>
                        <Label>Faturamento Médio</Label>
                        <Input
                          {...register('pj_faturamento_medio')}
                          placeholder="R$ 0,00"
                          onChange={(e) => setValue('pj_faturamento_medio', formatCurrency(e.target.value))}
                        />
                      </div>

                      <div>
                        <Label>Data de Fundação</Label>
                        <Input type="date" {...register('pj_data_fundacao')} />
                      </div>

                      <div className="col-span-2">
                        <Label>Ramo de Atividade</Label>
                        <Input {...register('pj_ramo_atividade')} />
                      </div>

                      <div>
                        <Label>Telefone Fixo</Label>
                        <div className="flex gap-2">
                          <Select
                            value={watch('pj_telefone_fixo_pais') || '+55'}
                            onValueChange={(value) => setValue('pj_telefone_fixo_pais', value)}
                          >
                            <SelectTrigger className="w-32">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {countryCodeOptions.map(opt => (
                                <SelectItem key={opt.code} value={opt.code}>{opt.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Input
                            {...register('pj_telefone_fixo')}
                            placeholder={watch('pj_telefone_fixo_pais') === '+55' ? "(00) 0000-0000" : "XXX XXX XXX"}
                            onChange={(e) => setValue('pj_telefone_fixo', formatPhone(e.target.value, watch('pj_telefone_fixo_pais') || '+55'))}
                            className="flex-1"
                          />
                        </div>
                      </div>

                      <div>
                        <Label>Celular</Label>
                        <div className="flex gap-2">
                          <Select
                            value={watch('pj_celular_pais') || '+55'}
                            onValueChange={(value) => setValue('pj_celular_pais', value)}
                          >
                            <SelectTrigger className="w-32">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {countryCodeOptions.map(opt => (
                                <SelectItem key={opt.code} value={opt.code}>{opt.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Input
                            {...register('pj_celular')}
                            placeholder={watch('pj_celular_pais') === '+55' ? "(00) 00000-0000" : "XXX XXX XXX"}
                            onChange={(e) => setValue('pj_celular', formatPhone(e.target.value, watch('pj_celular_pais') || '+55'))}
                            className="flex-1"
                          />
                        </div>
                      </div>

                      <div className="col-span-2">
                        <Label>Email</Label>
                        <Input type="email" {...register('pj_email')} />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Sócio Majoritário</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="col-span-2">
                        <Label>Nome do Sócio *</Label>
                        <Input
                          {...register('pj_socio_majoritario_nome', { required: tipoPessoa === 'Jurídica' && 'Nome do sócio é obrigatório' })}
                          placeholder="Nome completo"
                        />
                        {errors.pj_socio_majoritario_nome && <p className="text-sm text-red-500 mt-1">{errors.pj_socio_majoritario_nome.message}</p>}
                      </div>

                      <div>
                        <Label>CPF do Sócio *</Label>
                        <Input
                          {...register('pj_socio_majoritario_cpf', { required: tipoPessoa === 'Jurídica' && 'CPF do sócio é obrigatório' })}
                          placeholder="000.000.000-00"
                          onChange={(e) => setValue('pj_socio_majoritario_cpf', formatCPF(e.target.value))}
                        />
                        {errors.pj_socio_majoritario_cpf && <p className="text-sm text-red-500 mt-1">{errors.pj_socio_majoritario_cpf.message}</p>}
                      </div>

                      <div>
                        <Label>RG</Label>
                        <Input {...register('pj_socio_majoritario_rg')} />
                      </div>

                      <div>
                        <Label>Data de Nascimento</Label>
                        <Input type="date" {...register('pj_socio_majoritario_data_nascimento')} />
                      </div>

                      <div>
                        <Label>Órgão Emissor</Label>
                        <Input {...register('pj_socio_majoritario_orgao_emissor')} placeholder="Ex: SSP" />
                      </div>

                      <div>
                        <Label>Estado Civil</Label>
                        <Input {...register('pj_socio_majoritario_estado_civil')} />
                      </div>

                      <div>
                        <Label>Sexo</Label>
                        <Select
                          value={watch('pj_socio_majoritario_sexo')}
                          onValueChange={(value) => setValue('pj_socio_majoritario_sexo', value)}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Masculino">Masculino</SelectItem>
                            <SelectItem value="Feminino">Feminino</SelectItem>
                            <SelectItem value="Outro">Outro</SelectItem>
                            <SelectItem value="Prefiro não informar">Prefiro não informar</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div>
                        <Label>Politicamente Exposto? *</Label>
                        <Select
                          value={watch('pj_socio_majoritario_politicamente_exposto')}
                          onValueChange={(value) => setValue('pj_socio_majoritario_politicamente_exposto', value)}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Sim">Sim</SelectItem>
                            <SelectItem value="Não">Não</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div>
                        <Label>% Participação</Label>
                        <Input type="number" step="0.01" {...register('pj_percent_participacao_socio')} placeholder="Ex: 50" />
                      </div>
                    </div>
                  </CardContent>
                </Card>

              {/* Endereço da Empresa */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Endereço da Empresa</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>CEP</Label>
                        <Input
                          {...register('pj_cep')}
                          placeholder="00000-000"
                          onChange={(e) => setValue('pj_cep', formatCEP(e.target.value))}
                        />
                      </div>

                      <div>
                        <Label>Tipo de Logradouro</Label>
                        <Select
                          value={watch('pj_tipo_logradouro') || ''}
                          onValueChange={(value) => setValue('pj_tipo_logradouro', value)}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione" />
                          </SelectTrigger>
                          <SelectContent position="popper" align="start" sideOffset={4}>
                            <SelectItem value="RUA">Rua</SelectItem>
                            <SelectItem value="AVENIDA">Avenida</SelectItem>
                            <SelectItem value="ALAMEDA">Alameda</SelectItem>
                            <SelectItem value="TRAVESSA">Travessa</SelectItem>
                            <SelectItem value="PRAÇA">Praça</SelectItem>
                            <SelectItem value="RODOVIA">Rodovia</SelectItem>
                            <SelectItem value="ESTRADA">Estrada</SelectItem>
                            <SelectItem value="VIA">Via</SelectItem>
                            <SelectItem value="BLOCO">Bloco</SelectItem>
                            <SelectItem value="CONJUNTO">Conjunto</SelectItem>
                            <SelectItem value="QUADRA">Quadra</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="col-span-2">
                        <Label>Endereço</Label>
                        <Input {...register('pj_endereco')} placeholder="Nome da rua/avenida" />
                      </div>

                      <div>
                        <Label>Número</Label>
                        <Input {...register('pj_numero')} />
                      </div>

                      <div>
                        <Label>Complemento</Label>
                        <Input {...register('pj_complemento')} />
                      </div>

                      <div>
                        <Label>Bairro</Label>
                        <Input {...register('pj_bairro')} />
                      </div>

                      <div>
                        <Label>Cidade</Label>
                        <Input {...register('pj_cidade')} />
                      </div>

                      <div>
                        <Label>UF</Label>
                        <Select
                          value={watch('pj_uf')}
                          onValueChange={(value) => setValue('pj_uf', value)}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione" />
                          </SelectTrigger>
                          <SelectContent>
                            {ufs.map(uf => (
                              <SelectItem key={uf} value={uf}>{uf}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </CardContent>
                </Card>

              {/* Dados Complementares PJ */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Dados Complementares</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="col-span-2">
                        <Label>Atividade Principal</Label>
                        <Input {...register('pj_atividade_principal')} />
                      </div>

                      <div>
                        <Label>Forma de Constituição</Label>
                        <Input {...register('pj_forma_constituicao')} />
                      </div>

                      <div>
                        <Label>Data de Constituição</Label>
                        <Input type="date" {...register('pj_data_constituicao')} />
                      </div>

                      <div>
                        <Label>Nacionalidade do Sócio</Label>
                        <Input {...register('pj_nacionalidade')} />
                      </div>

                      <div>
                        <Label>UF de Nascimento</Label>
                        <Select
                          value={watch('pj_uf_nascimento')}
                          onValueChange={(value) => setValue('pj_uf_nascimento', value)}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione" />
                          </SelectTrigger>
                          <SelectContent>
                            {ufs.map(uf => (
                              <SelectItem key={uf} value={uf}>{uf}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="col-span-2">
                        <Label>Local de Nascimento</Label>
                        <Input {...register('pj_local_nascimento')} />
                      </div>

                      <div>
                        <Label>Nome do Pai</Label>
                        <Input {...register('pj_nome_pai')} />
                      </div>

                      <div>
                        <Label>Nome da Mãe</Label>
                        <Input {...register('pj_nome_mae')} />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Documento Adicional</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>CPF do Documento</Label>
                        <Input
                          {...register('pj_doc_cpf')}
                          placeholder="000.000.000-00"
                          onChange={(e) => setValue('pj_doc_cpf', formatCPF(e.target.value))}
                        />
                      </div>

                      <div>
                        <Label>Tipo de Documento</Label>
                        <Input {...register('pj_doc_tipo')} />
                      </div>

                      <div>
                        <Label>Número do Documento</Label>
                        <Input {...register('pj_doc_numero')} />
                      </div>

                      <div>
                        <Label>Data de Emissão</Label>
                        <Input type="date" {...register('pj_doc_data_emissao')} />
                      </div>

                      <div className="col-span-2">
                        <Label>Órgão Expedidor</Label>
                        <Input {...register('pj_doc_orgao_expedidor')} />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Compliance - COAF/PEP</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 gap-4">
                      <div>
                        <Label>Sócios exerceram cargo público nos últimos 5 anos? *</Label>
                        <Select
                          value={watch('pj_socios_cargo_publico_ultimos_5_anos')}
                          onValueChange={(value) => setValue('pj_socios_cargo_publico_ultimos_5_anos', value)}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Sim">Sim</SelectItem>
                            <SelectItem value="Não">Não</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div>
                        <Label>Parentes de sócios exerceram cargo público nos últimos 5 anos? *</Label>
                        <Select
                          value={watch('pj_socios_parentes_cargo_publico_ultimos_5_anos')}
                          onValueChange={(value) => setValue('pj_socios_parentes_cargo_publico_ultimos_5_anos', value)}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Sim">Sim</SelectItem>
                            <SelectItem value="Não">Não</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </CardContent>
                </Card>

              {/* Checklist de Documentos PJ */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Checklist de Documentos</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="space-y-6">
                      {/* Contrato ou Estatuto Social */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-2">
                            <Checkbox
                              id="pj_doc_contrato_ou_estatuto_social"
                              checked={watch('pj_doc_contrato_ou_estatuto_social') || false}
                              onCheckedChange={(checked) => setValue('pj_doc_contrato_ou_estatuto_social', checked)}
                            />
                            <Label htmlFor="pj_doc_contrato_ou_estatuto_social" className="cursor-pointer">
                              Contrato ou Estatuto Social
                            </Label>
                          </div>
                          <div>
                            <input
                              type="file"
                              id="upload-pj_doc_contrato_ou_estatuto_social_urls"
                              multiple
                              accept="image/*,.pdf"
                              onChange={(e) => handleFileUpload(Array.from(e.target.files), 'pj_doc_contrato_ou_estatuto_social_urls')}
                              className="hidden"
                            />
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={uploadingDoc === 'pj_doc_contrato_ou_estatuto_social_urls'}
                              onClick={() => document.getElementById('upload-pj_doc_contrato_ou_estatuto_social_urls').click()}
                            >
                              {uploadingDoc === 'pj_doc_contrato_ou_estatuto_social_urls' ? (
                                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Enviando...</>
                              ) : (
                                <><Upload className="w-4 h-4 mr-2" /> Anexar</>
                              )}
                            </Button>
                          </div>
                        </div>
                        {watch('pj_doc_contrato_ou_estatuto_social_urls')?.length > 0 && (
                          <div className="ml-6 space-y-1">
                            {watch('pj_doc_contrato_ou_estatuto_social_urls').map((url, idx) => (
                              <div key={idx} className="flex items-center gap-2 text-xs bg-slate-50 p-2 rounded">
                                <FileText className="w-3 h-3 text-slate-400" />
                                <a href={url} target="_blank" rel="noopener noreferrer" className="flex-1 truncate text-blue-600 hover:underline">
                                  Arquivo {idx + 1}
                                </a>
                                <button
                                  type="button"
                                  onClick={() => removeFile('pj_doc_contrato_ou_estatuto_social_urls', url)}
                                  className="text-red-500 hover:text-red-700"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Cartão CNPJ */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-2">
                            <Checkbox
                              id="pj_doc_cartao_cnpj"
                              checked={watch('pj_doc_cartao_cnpj') || false}
                              onCheckedChange={(checked) => setValue('pj_doc_cartao_cnpj', checked)}
                            />
                            <Label htmlFor="pj_doc_cartao_cnpj" className="cursor-pointer">
                              Cartão CNPJ
                            </Label>
                          </div>
                          <div>
                            <input
                              type="file"
                              id="upload-pj_doc_cartao_cnpj_urls"
                              multiple
                              accept="image/*,.pdf"
                              onChange={(e) => handleFileUpload(Array.from(e.target.files), 'pj_doc_cartao_cnpj_urls')}
                              className="hidden"
                            />
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={uploadingDoc === 'pj_doc_cartao_cnpj_urls'}
                              onClick={() => document.getElementById('upload-pj_doc_cartao_cnpj_urls').click()}
                            >
                              {uploadingDoc === 'pj_doc_cartao_cnpj_urls' ? (
                                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Enviando...</>
                              ) : (
                                <><Upload className="w-4 h-4 mr-2" /> Anexar</>
                              )}
                            </Button>
                          </div>
                        </div>
                        {watch('pj_doc_cartao_cnpj_urls')?.length > 0 && (
                          <div className="ml-6 space-y-1">
                            {watch('pj_doc_cartao_cnpj_urls').map((url, idx) => (
                              <div key={idx} className="flex items-center gap-2 text-xs bg-slate-50 p-2 rounded">
                                <FileText className="w-3 h-3 text-slate-400" />
                                <a href={url} target="_blank" rel="noopener noreferrer" className="flex-1 truncate text-blue-600 hover:underline">
                                  Arquivo {idx + 1}
                                </a>
                                <button
                                  type="button"
                                  onClick={() => removeFile('pj_doc_cartao_cnpj_urls', url)}
                                  className="text-red-500 hover:text-red-700"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Documentos dos Sócios/Representante */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-2">
                            <Checkbox
                              id="pj_doc_documento_socios_ou_representante"
                              checked={watch('pj_doc_documento_socios_ou_representante') || false}
                              onCheckedChange={(checked) => setValue('pj_doc_documento_socios_ou_representante', checked)}
                            />
                            <Label htmlFor="pj_doc_documento_socios_ou_representante" className="cursor-pointer">
                              Documentos dos Sócios/Representante
                            </Label>
                          </div>
                          <div>
                            <input
                              type="file"
                              id="upload-pj_doc_documento_socios_ou_representante_urls"
                              multiple
                              accept="image/*,.pdf"
                              onChange={(e) => handleFileUpload(Array.from(e.target.files), 'pj_doc_documento_socios_ou_representante_urls')}
                              className="hidden"
                            />
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={uploadingDoc === 'pj_doc_documento_socios_ou_representante_urls'}
                              onClick={() => document.getElementById('upload-pj_doc_documento_socios_ou_representante_urls').click()}
                            >
                              {uploadingDoc === 'pj_doc_documento_socios_ou_representante_urls' ? (
                                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Enviando...</>
                              ) : (
                                <><Upload className="w-4 h-4 mr-2" /> Anexar</>
                              )}
                            </Button>
                          </div>
                        </div>
                        {watch('pj_doc_documento_socios_ou_representante_urls')?.length > 0 && (
                          <div className="ml-6 space-y-1">
                            {watch('pj_doc_documento_socios_ou_representante_urls').map((url, idx) => (
                              <div key={idx} className="flex items-center gap-2 text-xs bg-slate-50 p-2 rounded">
                                <FileText className="w-3 h-3 text-slate-400" />
                                <a href={url} target="_blank" rel="noopener noreferrer" className="flex-1 truncate text-blue-600 hover:underline">
                                  Arquivo {idx + 1}
                                </a>
                                <button
                                  type="button"
                                  onClick={() => removeFile('pj_doc_documento_socios_ou_representante_urls', url)}
                                  className="text-red-500 hover:text-red-700"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Relação de Faturamento */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-2">
                            <Checkbox
                              id="pj_doc_relacao_faturamento"
                              checked={watch('pj_doc_relacao_faturamento') || false}
                              onCheckedChange={(checked) => setValue('pj_doc_relacao_faturamento', checked)}
                            />
                            <Label htmlFor="pj_doc_relacao_faturamento" className="cursor-pointer">
                              Relação de Faturamento
                            </Label>
                          </div>
                          <div>
                            <input
                              type="file"
                              id="upload-pj_doc_relacao_faturamento_urls"
                              multiple
                              accept="image/*,.pdf"
                              onChange={(e) => handleFileUpload(Array.from(e.target.files), 'pj_doc_relacao_faturamento_urls')}
                              className="hidden"
                            />
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={uploadingDoc === 'pj_doc_relacao_faturamento_urls'}
                              onClick={() => document.getElementById('upload-pj_doc_relacao_faturamento_urls').click()}
                            >
                              {uploadingDoc === 'pj_doc_relacao_faturamento_urls' ? (
                                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Enviando...</>
                              ) : (
                                <><Upload className="w-4 h-4 mr-2" /> Anexar</>
                              )}
                            </Button>
                          </div>
                        </div>
                        {watch('pj_doc_relacao_faturamento_urls')?.length > 0 && (
                          <div className="ml-6 space-y-1">
                            {watch('pj_doc_relacao_faturamento_urls').map((url, idx) => (
                              <div key={idx} className="flex items-center gap-2 text-xs bg-slate-50 p-2 rounded">
                                <FileText className="w-3 h-3 text-slate-400" />
                                <a href={url} target="_blank" rel="noopener noreferrer" className="flex-1 truncate text-blue-600 hover:underline">
                                  Arquivo {idx + 1}
                                </a>
                                <button
                                  type="button"
                                  onClick={() => removeFile('pj_doc_relacao_faturamento_urls', url)}
                                  className="text-red-500 hover:text-red-700"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Proposta Assinada */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-2">
                            <Checkbox
                              id="pj_doc_proposta_assinada"
                              checked={watch('pj_doc_proposta_assinada') || false}
                              onCheckedChange={(checked) => setValue('pj_doc_proposta_assinada', checked)}
                            />
                            <Label htmlFor="pj_doc_proposta_assinada" className="cursor-pointer">
                              Proposta Assinada
                            </Label>
                          </div>
                          <div>
                            <input
                              type="file"
                              id="upload-pj_doc_proposta_assinada_urls"
                              multiple
                              accept="image/*,.pdf"
                              onChange={(e) => handleFileUpload(Array.from(e.target.files), 'pj_doc_proposta_assinada_urls')}
                              className="hidden"
                            />
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={uploadingDoc === 'pj_doc_proposta_assinada_urls'}
                              onClick={() => document.getElementById('upload-pj_doc_proposta_assinada_urls').click()}
                            >
                              {uploadingDoc === 'pj_doc_proposta_assinada_urls' ? (
                                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Enviando...</>
                              ) : (
                                <><Upload className="w-4 h-4 mr-2" /> Anexar</>
                              )}
                            </Button>
                          </div>
                        </div>
                        {watch('pj_doc_proposta_assinada_urls')?.length > 0 && (
                          <div className="ml-6 space-y-1">
                            {watch('pj_doc_proposta_assinada_urls').map((url, idx) => (
                              <div key={idx} className="flex items-center gap-2 text-xs bg-slate-50 p-2 rounded">
                                <FileText className="w-3 h-3 text-slate-400" />
                                <a href={url} target="_blank" rel="noopener noreferrer" className="flex-1 truncate text-blue-600 hover:underline">
                                  Arquivo {idx + 1}
                                </a>
                                <button
                                  type="button"
                                  onClick={() => removeFile('pj_doc_proposta_assinada_urls', url)}
                                  className="text-red-500 hover:text-red-700"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="pt-4">
                        <Label>Observações</Label>
                        <Textarea
                          {...register('pj_doc_observacoes')}
                          placeholder="Observações sobre os documentos..."
                          rows={4}
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>

              {/* Dados Bancários PJ */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Dados Bancários</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="space-y-4">
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="pj_banco_nao_deseja_informar"
                          checked={watch('pj_banco_nao_deseja_informar') || false}
                          onCheckedChange={(checked) => setValue('pj_banco_nao_deseja_informar', checked)}
                        />
                        <Label htmlFor="pj_banco_nao_deseja_informar" className="cursor-pointer">
                          Não deseja informar dados bancários
                        </Label>
                      </div>

                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="pj_banco_nao_possui_conta"
                          checked={watch('pj_banco_nao_possui_conta') || false}
                          onCheckedChange={(checked) => setValue('pj_banco_nao_possui_conta', checked)}
                        />
                        <Label htmlFor="pj_banco_nao_possui_conta" className="cursor-pointer">
                          Não possui conta bancária
                        </Label>
                      </div>

                      {!pjBancoNaoDeseja && !pjBancoNaoPossui && (
                        <div className="grid grid-cols-2 gap-4 pt-4">
                          <div>
                            <Label>Banco</Label>
                            <Input {...register('pj_banco')} placeholder="Nome do banco" />
                          </div>

                          <div>
                            <Label>Tipo de Conta</Label>
                            <Select
                              value={watch('pj_tipo_conta')}
                              onValueChange={(value) => setValue('pj_tipo_conta', value)}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Selecione" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="Corrente">Corrente</SelectItem>
                                <SelectItem value="Poupança">Poupança</SelectItem>
                                <SelectItem value="Salário">Salário</SelectItem>
                                <SelectItem value="Pix">Pix</SelectItem>
                                <SelectItem value="Outros">Outros</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>

                          <div>
                            <Label>Agência</Label>
                            <Input {...register('pj_agencia')} />
                          </div>

                          <div>
                            <Label>Dígito da Agência</Label>
                            <Input {...register('pj_agencia_digito')} maxLength={1} />
                          </div>

                          <div>
                            <Label>Conta</Label>
                            <Input {...register('pj_conta')} />
                          </div>

                          <div>
                            <Label>Dígito da Conta</Label>
                            <Input {...register('pj_conta_digito')} maxLength={2} />
                          </div>

                          <div className="col-span-2">
                            <Label>Variação</Label>
                            <Input {...register('pj_variacao')} />
                          </div>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
            </>
          )}
          
          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button 
              type="button" 
              variant="outline" 
              onClick={(e) => {
                e.preventDefault();
                onOpenChange(false);
              }}
              disabled={isLoading}
            >
              Cancelar
            </Button>
            <Button 
              type="submit" 
              disabled={isLoading} 
              className="bg-[#23BE84] hover:bg-[#1da570]"
            >
              {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {cliente ? 'Salvar' : 'Cadastrar'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}