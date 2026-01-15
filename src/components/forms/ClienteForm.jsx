import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
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
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, User, Building2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';

export default function ClienteForm({ open, onOpenChange, cliente, onSubmit, isLoading }) {
  const { register, handleSubmit, setValue, watch, reset, formState: { errors } } = useForm({
    defaultValues: cliente || {
      tipo_pessoa: 'Física',
      status: 'ativo',
    }
  });

  const tipoPessoa = watch('tipo_pessoa');
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
      });
    }
  }, [cliente, setValue, reset]);

  // Gerar código do cliente ao submeter
  const handleFormSubmit = async (data) => {
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
      } catch (error) {
        data.cliente_code = `CLI001`;
      }
    }
    
    onSubmit(data);
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

  const formatPhone = (value) => {
    return value
      .replace(/\D/g, '')
      .replace(/(\d{2})(\d)/, '($1) $2')
      .replace(/(\d{5})(\d)/, '$1-$2')
      .replace(/(-\d{4})\d+?$/, '$1');
  };

  const formatCEP = (value) => {
    return value
      .replace(/\D/g, '')
      .replace(/(\d{5})(\d)/, '$1-$2')
      .replace(/(-\d{3})\d+?$/, '$1');
  };

  const ufs = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{cliente ? 'Editar Cliente' : 'Novo Cliente'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-6">
          {/* Tipo de Pessoa */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Tipo de Pessoa</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
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
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Dados Pessoais</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <Label htmlFor="nome">Nome Completo *</Label>
                    <Input
                      id="nome"
                      {...register('nome', { required: tipoPessoa === 'Física' && 'Nome é obrigatório' })}
                      placeholder="Nome completo do cliente"
                    />
                    {errors.nome && <p className="text-sm text-red-500 mt-1">{errors.nome.message}</p>}
                  </div>

                  <div className="col-span-2">
                    <Label htmlFor="apelido">Apelido</Label>
                    <Input
                      id="apelido"
                      {...register('apelido')}
                      placeholder="Como o cliente gosta de ser chamado"
                    />
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
                    <Label htmlFor="telefone">Telefone</Label>
                    <Input
                      id="telefone"
                      {...register('telefone')}
                      placeholder="(00) 00000-0000"
                      onChange={(e) => setValue('telefone', formatPhone(e.target.value))}
                    />
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
                  
                  <div className="col-span-2">
                    <Label htmlFor="endereco">Endereço</Label>
                    <Input
                      id="endereco"
                      {...register('endereco')}
                      placeholder="Rua, avenida, etc."
                    />
                  </div>

                  <div>
                    <Label htmlFor="numero">Número</Label>
                    <Input
                      id="numero"
                      {...register('numero')}
                      placeholder="Nº"
                    />
                  </div>

                  <div>
                    <Label htmlFor="cidade">Cidade</Label>
                    <Input
                      id="cidade"
                      {...register('cidade')}
                      placeholder="Nome da cidade"
                    />
                  </div>

                  <div>
                    <Label htmlFor="cep">CEP</Label>
                    <Input
                      id="cep"
                      {...register('cep')}
                      placeholder="00000-000"
                      onChange={(e) => setValue('cep', formatCEP(e.target.value))}
                    />
                  </div>

                  <div className="col-span-2">
                    <Label htmlFor="ponto_referencia">Ponto de Referência</Label>
                    <Input
                      id="ponto_referencia"
                      {...register('ponto_referencia')}
                      placeholder="Ex: Próximo ao mercado..."
                    />
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
          )}

          {/* PESSOA JURÍDICA */}
          {tipoPessoa === 'Jurídica' && (
            <Tabs defaultValue="empresa" className="w-full">
              <TabsList className="grid w-full grid-cols-5">
                <TabsTrigger value="empresa">Empresa</TabsTrigger>
                <TabsTrigger value="endereco">Endereço</TabsTrigger>
                <TabsTrigger value="complementares">Complementares</TabsTrigger>
                <TabsTrigger value="documentos">Documentos</TabsTrigger>
                <TabsTrigger value="bancarios">Bancários</TabsTrigger>
              </TabsList>

              {/* Aba: Dados da Empresa */}
              <TabsContent value="empresa" className="space-y-4">
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
                        <Label>Valor Patrimonial (R$)</Label>
                        <Input type="number" step="0.01" {...register('pj_valor_patrimonial')} />
                      </div>

                      <div>
                        <Label>Capital Social (R$)</Label>
                        <Input type="number" step="0.01" {...register('pj_capital_social')} />
                      </div>

                      <div>
                        <Label>Faturamento Médio (R$)</Label>
                        <Input type="number" step="0.01" {...register('pj_faturamento_medio')} />
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
                        <Input
                          {...register('pj_telefone_fixo')}
                          placeholder="(00) 0000-0000"
                          onChange={(e) => setValue('pj_telefone_fixo', formatPhone(e.target.value))}
                        />
                      </div>

                      <div>
                        <Label>Celular</Label>
                        <Input
                          {...register('pj_celular')}
                          placeholder="(00) 00000-0000"
                          onChange={(e) => setValue('pj_celular', formatPhone(e.target.value))}
                        />
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
              </TabsContent>

              {/* Aba: Endereço */}
              <TabsContent value="endereco">
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
                        <Input {...register('pj_tipo_logradouro')} placeholder="Rua, Avenida, etc" />
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
              </TabsContent>

              {/* Aba: Complementares */}
              <TabsContent value="complementares" className="space-y-4">
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
              </TabsContent>

              {/* Aba: Documentos */}
              <TabsContent value="documentos">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Checklist de Documentos</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="pj_doc_contrato_ou_estatuto_social"
                          checked={watch('pj_doc_contrato_ou_estatuto_social')}
                          onCheckedChange={(checked) => setValue('pj_doc_contrato_ou_estatuto_social', checked)}
                        />
                        <Label htmlFor="pj_doc_contrato_ou_estatuto_social" className="cursor-pointer">
                          Contrato ou Estatuto Social
                        </Label>
                      </div>

                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="pj_doc_cartao_cnpj"
                          checked={watch('pj_doc_cartao_cnpj')}
                          onCheckedChange={(checked) => setValue('pj_doc_cartao_cnpj', checked)}
                        />
                        <Label htmlFor="pj_doc_cartao_cnpj" className="cursor-pointer">
                          Cartão CNPJ
                        </Label>
                      </div>

                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="pj_doc_documento_socios_ou_representante"
                          checked={watch('pj_doc_documento_socios_ou_representante')}
                          onCheckedChange={(checked) => setValue('pj_doc_documento_socios_ou_representante', checked)}
                        />
                        <Label htmlFor="pj_doc_documento_socios_ou_representante" className="cursor-pointer">
                          Documentos dos Sócios/Representante
                        </Label>
                      </div>

                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="pj_doc_relacao_faturamento"
                          checked={watch('pj_doc_relacao_faturamento')}
                          onCheckedChange={(checked) => setValue('pj_doc_relacao_faturamento', checked)}
                        />
                        <Label htmlFor="pj_doc_relacao_faturamento" className="cursor-pointer">
                          Relação de Faturamento
                        </Label>
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
              </TabsContent>

              {/* Aba: Bancários */}
              <TabsContent value="bancarios">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Dados Bancários</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="pj_banco_nao_deseja_informar"
                          checked={watch('pj_banco_nao_deseja_informar')}
                          onCheckedChange={(checked) => setValue('pj_banco_nao_deseja_informar', checked)}
                        />
                        <Label htmlFor="pj_banco_nao_deseja_informar" className="cursor-pointer">
                          Não deseja informar dados bancários
                        </Label>
                      </div>

                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="pj_banco_nao_possui_conta"
                          checked={watch('pj_banco_nao_possui_conta')}
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
              </TabsContent>
            </Tabs>
          )}
          
          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isLoading} className="bg-[#23BE84] hover:bg-[#1da570]">
              {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {cliente ? 'Salvar' : 'Cadastrar'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}