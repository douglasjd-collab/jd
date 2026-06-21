import React, { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, Smartphone, User, MapPin, Landmark, ShieldCheck, AlertCircle } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';

const formatCPF = (value) => {
  const c = value.replace(/\D/g, '');
  if (c.length <= 11) return c.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})/, '$1-$2').replace(/(-\d{2})\d+?$/, '$1');
  return c.replace(/(\d{2})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1/$2').replace(/(\d{4})(\d)/, '$1-$2').replace(/(-\d{2})\d+?$/, '$1');
};

const formatPhone = (value) => value.replace(/\D/g, '').replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{5})(\d)/, '$1-$2').replace(/(-\d{4})\d+?$/, '$1');

export default function UsuarioForm({ open, onOpenChange, usuario, onSubmit, isLoading, currentUser, inviteSuccess }) {
  const [gerentes, setGerentes] = useState([]);
  const [empresas, setEmpresas] = useState([]);
  const [buscandoCep, setBuscandoCep] = useState(false);
  const [activeTab, setActiveTab] = useState('pessoal');

  const { register, handleSubmit, setValue, watch, reset, formState: { errors } } = useForm({
    mode: 'onChange',
    defaultValues: usuario || {
      nome: '', email: '', cpf_cnpj: '', rg: '', data_nascimento: '',
      sexo: '', estado_civil: '', nome_mae: '', telefone: '',
      cep: '', logradouro: '', numero: '', complemento: '', bairro: '', cidade: '', estado: '',
      banco: '', banco_codigo: '', tipo_conta: 'corrente', agencia: '', digito_agencia: '',
      conta: '', digito_conta: '', operacao: '', favorecido_nome: '', favorecido_cpf: '',
      pix_tipo: 'cpf', pix_chave: '',
      perfil: 'vendedor', empresa_id: '', gerente_id: '', tipo_agente: 'agente_loja',
      percentual_comissao_agente: null, evolution_instance_name: '', status: 'ativo'
    }
  });

  const perfil = watch('perfil');
  const pixTipo = watch('pix_tipo');
  const isGerenteOuSuperior = ['gerente', 'admin', 'super_admin', 'master'].includes(currentUser?.perfil);
  const isMasterAdmin = ['master', 'super_admin', 'admin'].includes(currentUser?.perfil);

  useEffect(() => {
    loadGerentes();
    if (isMasterAdmin) loadEmpresas();
  }, [currentUser]);

  useEffect(() => {
    if (usuario) {
      const fields = [
        'nome', 'email', 'cpf_cnpj', 'rg', 'data_nascimento', 'sexo', 'estado_civil', 'nome_mae',
        'telefone', 'cep', 'logradouro', 'numero', 'complemento', 'bairro', 'cidade', 'estado',
        'banco', 'banco_codigo', 'tipo_conta', 'agencia', 'digito_agencia', 'conta', 'digito_conta',
        'operacao', 'favorecido_nome', 'favorecido_cpf', 'pix_tipo', 'pix_chave',
        'perfil', 'empresa_id', 'gerente_id', 'tipo_agente', 'percentual_comissao_agente',
        'evolution_instance_name', 'status', 'codigo_vendedor', 'usuario_canopus'
      ];
      fields.forEach(f => setValue(f, usuario[f] ?? ''));
      // Compatibilidade legado
      if (!usuario.pix_chave && usuario.chave_pix) setValue('pix_chave', usuario.chave_pix);
      if (!usuario.pix_tipo && usuario.tipo_chave_pix) setValue('pix_tipo', usuario.tipo_chave_pix);
    } else {
      reset({
        nome: '', email: '', cpf_cnpj: '', rg: '', data_nascimento: '',
        sexo: '', estado_civil: '', nome_mae: '', telefone: '',
        cep: '', logradouro: '', numero: '', complemento: '', bairro: '', cidade: '', estado: '',
        banco: '', banco_codigo: '', tipo_conta: 'corrente', agencia: '', digito_agencia: '',
        conta: '', digito_conta: '', operacao: '', favorecido_nome: '', favorecido_cpf: '',
        pix_tipo: 'cpf', pix_chave: '',
        perfil: 'vendedor', empresa_id: currentUser?.empresa_id || '', gerente_id: '', tipo_agente: 'agente_loja',
        percentual_comissao_agente: null, evolution_instance_name: '', status: 'ativo'
      });
    }
    setActiveTab('pessoal');
  }, [usuario, open]);

  const loadGerentes = async () => {
    try {
      const list = await base44.entities.Colaborador.filter({ perfil: 'gerente', status: 'ativo' });
      setGerentes(list);
    } catch { setGerentes([]); }
  };

  const loadEmpresas = async () => {
    try {
      const list = await base44.entities.Empresa.filter({ status: 'ativa' });
      setEmpresas(list);
    } catch { setEmpresas([]); }
  };

  const buscarCep = async (cep) => {
    const cepLimpo = cep.replace(/\D/g, '');
    if (cepLimpo.length !== 8) return;
    setBuscandoCep(true);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${cepLimpo}/json/`);
      const data = await res.json();
      if (!data.erro) {
        setValue('logradouro', data.logradouro || '');
        setValue('bairro', data.bairro || '');
        setValue('cidade', data.localidade || '');
        setValue('estado', data.uf || '');
        toast.success('Endereço preenchido automaticamente!');
      }
    } catch { /* silencioso */ } finally { setBuscandoCep(false); }
  };

  const handleFormSubmit = (data) => {
    const normalized = {
      ...data,
      cpf_cnpj: data.cpf_cnpj ? data.cpf_cnpj.replace(/\D/g, '') : '',
      telefone: data.telefone ? data.telefone.replace(/\D/g, '') : '',
      gerente_id: data.gerente_id || null,
      // Sincronizar pix para campos legado
      chave_pix: data.pix_chave || '',
      tipo_chave_pix: data.pix_tipo || '',
    };
    onSubmit(normalized, reset);
  };

  const FormField = ({ label, children, col2 = false, required = false }) => (
    <div className={col2 ? 'col-span-2' : ''}>
      <Label className="text-xs font-medium text-slate-600 mb-1 block">
        {label}{required && <span className="text-red-500 ml-1">*</span>}
      </Label>
      {children}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 pt-5 pb-3 border-b flex-shrink-0">
          <DialogTitle className="text-lg">{usuario ? 'Editar Usuário' : 'Novo Usuário'}</DialogTitle>
          {!usuario && (
            <p className="text-sm text-slate-500">Um e-mail de convite será enviado ao usuário.</p>
          )}
        </DialogHeader>

        <form onSubmit={handleSubmit(handleFormSubmit)} className="flex flex-col flex-1 min-h-0">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col flex-1 min-h-0">
            <TabsList className="mx-6 mt-3 mb-2 flex-shrink-0 grid grid-cols-4 h-9">
              <TabsTrigger value="pessoal" className="text-xs gap-1">
                <User className="w-3 h-3" />Pessoal
              </TabsTrigger>
              <TabsTrigger value="endereco" className="text-xs gap-1">
                <MapPin className="w-3 h-3" />Endereço
              </TabsTrigger>
              <TabsTrigger value="banco" className="text-xs gap-1">
                <Landmark className="w-3 h-3" />Banco / PIX
              </TabsTrigger>
              <TabsTrigger value="acesso" className="text-xs gap-1">
                <ShieldCheck className="w-3 h-3" />Acesso
              </TabsTrigger>
            </TabsList>

            <div className="flex-1 overflow-y-auto px-6 pb-2">

              {/* ABA 1 — DADOS PESSOAIS */}
              <TabsContent value="pessoal" className="mt-0 space-y-0">
                <div className="grid grid-cols-2 gap-3 pt-2">
                  <FormField label="Nome Completo" col2 required>
                    <Input {...register('nome', { required: true })} placeholder="Nome completo" />
                    {errors.nome && <p className="text-xs text-red-500 mt-1">Obrigatório</p>}
                  </FormField>

                  <FormField label="CPF/CNPJ" col2 required>
                    <Input
                      {...register('cpf_cnpj', { required: true })}
                      placeholder="000.000.000-00"
                      onChange={(e) => setValue('cpf_cnpj', formatCPF(e.target.value))}
                    />
                    {errors.cpf_cnpj && <p className="text-xs text-red-500 mt-1">Obrigatório</p>}
                  </FormField>

                  <FormField label="E-mail" col2 required>
                    <Input
                      type="email"
                      {...register('email', { required: true })}
                      placeholder="email@exemplo.com"
                      disabled={!!usuario && !isGerenteOuSuperior}
                    />
                    {errors.email && <p className="text-xs text-red-500 mt-1">Obrigatório</p>}
                  </FormField>

                  <FormField label="Telefone" required>
                    <Input
                      {...register('telefone', { required: true })}
                      placeholder="(00) 00000-0000"
                      onChange={(e) => setValue('telefone', formatPhone(e.target.value))}
                    />
                  </FormField>

                  <FormField label="RG">
                    <Input {...register('rg')} placeholder="0000000" />
                  </FormField>

                  <FormField label="Data de Nascimento/Fundação">
                    <Input type="date" {...register('data_nascimento')} />
                  </FormField>

                  <FormField label="Sexo">
                    <Select value={watch('sexo') || ''} onValueChange={(v) => setValue('sexo', v)}>
                      <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="masculino">Masculino</SelectItem>
                        <SelectItem value="feminino">Feminino</SelectItem>
                        <SelectItem value="outro">Outro</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormField>

                  <FormField label="Estado Civil">
                    <Input {...register('estado_civil')} placeholder="Solteiro, Casado..." />
                  </FormField>

                  <FormField label="Nome da Mãe" col2>
                    <Input {...register('nome_mae')} placeholder="Nome completo da mãe" />
                  </FormField>
                </div>
              </TabsContent>

              {/* ABA 2 — ENDEREÇO */}
              <TabsContent value="endereco" className="mt-0">
                <div className="grid grid-cols-2 gap-3 pt-2">
                  <FormField label="CEP">
                    <div className="relative">
                      <Input
                        {...register('cep')}
                        placeholder="00000-000"
                        maxLength={9}
                        onChange={(e) => {
                          const v = e.target.value.replace(/\D/g, '').replace(/(\d{5})(\d)/, '$1-$2');
                          setValue('cep', v);
                          if (v.replace(/\D/g, '').length === 8) buscarCep(v);
                        }}
                      />
                      {buscandoCep && <Loader2 className="absolute right-3 top-2.5 w-4 h-4 animate-spin text-slate-400" />}
                    </div>
                    <p className="text-xs text-slate-400 mt-1">Preenchimento automático ao digitar o CEP</p>
                  </FormField>

                  <FormField label="Estado (UF)">
                    <Input {...register('estado')} placeholder="CE, SP..." maxLength={2} />
                  </FormField>

                  <FormField label="Logradouro / Rua" col2>
                    <Input {...register('logradouro')} placeholder="Rua, Avenida..." />
                  </FormField>

                  <FormField label="Número">
                    <Input {...register('numero')} placeholder="123" />
                  </FormField>

                  <FormField label="Complemento">
                    <Input {...register('complemento')} placeholder="Apto, Bloco..." />
                  </FormField>

                  <FormField label="Bairro">
                    <Input {...register('bairro')} placeholder="Bairro" />
                  </FormField>

                  <FormField label="Cidade">
                    <Input {...register('cidade')} placeholder="Cidade" />
                  </FormField>
                </div>
              </TabsContent>

              {/* ABA 3 — BANCO / PIX */}
              <TabsContent value="banco" className="mt-0">
                <div className="grid grid-cols-2 gap-3 pt-2">
                  {/* PIX */}
                  <div className="col-span-2">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2 flex items-center gap-1">
                      <span>💸</span> Chave PIX
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      <FormField label="Tipo da Chave PIX">
                        <Select value={watch('pix_tipo') || 'cpf'} onValueChange={(v) => setValue('pix_tipo', v)}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="cpf">CPF</SelectItem>
                            <SelectItem value="celular">Celular</SelectItem>
                            <SelectItem value="email">E-mail</SelectItem>
                            <SelectItem value="aleatoria">Aleatória</SelectItem>
                          </SelectContent>
                        </Select>
                      </FormField>

                      <FormField label="Chave PIX">
                        <Input
                          {...register('pix_chave')}
                          placeholder={pixTipo === 'cpf' ? '000.000.000-00' : pixTipo === 'celular' ? '(00) 00000-0000' : pixTipo === 'email' ? 'email@exemplo.com' : 'Chave aleatória'}
                        />
                      </FormField>
                    </div>
                  </div>

                  {/* Dados bancários */}
                  <div className="col-span-2 border-t pt-3 mt-1">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2 flex items-center gap-1">
                      <span>🏦</span> Dados Bancários
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      <FormField label="Banco" col2>
                        <Input {...register('banco')} placeholder="Nome do banco" />
                      </FormField>

                      <FormField label="Código do Banco">
                        <Input {...register('banco_codigo')} placeholder="001, 033..." />
                      </FormField>

                      <FormField label="Tipo de Conta">
                        <Select value={watch('tipo_conta') || 'corrente'} onValueChange={(v) => setValue('tipo_conta', v)}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="corrente">Corrente</SelectItem>
                            <SelectItem value="poupanca">Poupança</SelectItem>
                            <SelectItem value="salario">Salário</SelectItem>
                          </SelectContent>
                        </Select>
                      </FormField>

                      <FormField label="Agência">
                        <Input {...register('agencia')} placeholder="0000" />
                      </FormField>

                      <FormField label="Dígito Agência">
                        <Input {...register('digito_agencia')} placeholder="0" maxLength={2} />
                      </FormField>

                      <FormField label="Conta">
                        <Input {...register('conta')} placeholder="00000" />
                      </FormField>

                      <FormField label="Dígito Conta">
                        <Input {...register('digito_conta')} placeholder="0" maxLength={2} />
                      </FormField>

                      <FormField label="Operação">
                        <Input {...register('operacao')} placeholder="013..." />
                      </FormField>

                      <FormField label="Nome do Favorecido" col2>
                        <Input {...register('favorecido_nome')} placeholder="Nome completo do favorecido" />
                      </FormField>

                      <FormField label="CPF do Favorecido" col2>
                        <Input
                          {...register('favorecido_cpf')}
                          placeholder="000.000.000-00"
                          onChange={(e) => setValue('favorecido_cpf', formatCPF(e.target.value))}
                        />
                      </FormField>
                    </div>
                  </div>
                </div>
              </TabsContent>

              {/* ABA 4 — ACESSO E PERMISSÕES */}
              <TabsContent value="acesso" className="mt-0">
                <div className="grid grid-cols-2 gap-3 pt-2">
                  {/* Seleção de empresa APENAS para master/super_admin sem empresa_id própria */}
                  {['master', 'super_admin'].includes(currentUser?.perfil) && !currentUser?.empresa_id && perfil !== 'super_admin' && (
                    <FormField label="Empresa" col2 required>
                      <Select
                        value={watch('empresa_id') || ''}
                        onValueChange={(v) => {
                          setValue('empresa_id', v);
                          const emp = empresas.find(e => e.id === v);
                          if (emp) setValue('empresa_nome', emp.nome);
                        }}
                      >
                        <SelectTrigger><SelectValue placeholder="Selecione a empresa" /></SelectTrigger>
                        <SelectContent>
                          {empresas.map((e) => (
                            <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FormField>
                  )}

                  <FormField label="Perfil" required>
                    <Select value={watch('perfil')} onValueChange={(v) => setValue('perfil', v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="colaborador">Colaborador</SelectItem>
                        <SelectItem value="colaborador_vendedor">Colaborador/Vendedor</SelectItem>
                        <SelectItem value="vendedor">Vendedor</SelectItem>
                        <SelectItem value="parceiro">Parceiro</SelectItem>
                        <SelectItem value="gerente">Gerente</SelectItem>
                        <SelectItem value="admin">Administrador</SelectItem>
                        {currentUser?.perfil === 'master' && <SelectItem value="super_admin">Super Admin</SelectItem>}
                        {currentUser?.perfil === 'master' && <SelectItem value="master">Master</SelectItem>}
                      </SelectContent>
                    </Select>
                  </FormField>

                  <FormField label="Status">
                    <Select value={watch('status')} onValueChange={(v) => setValue('status', v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ativo">Ativo</SelectItem>
                        <SelectItem value="inativo">Inativo</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormField>

                  <FormField label="Código Vendedor">
                    <Input {...register('codigo_vendedor')} placeholder="EMP01-V001" />
                  </FormField>

                  <FormField label="Usuário Canopus">
                    <Input {...register('usuario_canopus')} placeholder="0000022393" />
                  </FormField>

                  {(perfil === 'vendedor' || perfil === 'colaborador_vendedor') && (
                    <>
                      <FormField label="Gerente Responsável" col2>
                        <Select value={watch('gerente_id') || 'sem-gerente'} onValueChange={(v) => setValue('gerente_id', v === 'sem-gerente' ? null : v)}>
                          <SelectTrigger><SelectValue placeholder="Sem gerente" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="sem-gerente">Sem gerente</SelectItem>
                            {gerentes.map((g) => (
                              <SelectItem key={g.id} value={g.id}>{g.nome}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </FormField>

                      <FormField label="Tipo de Agente" col2>
                        <Select value={watch('tipo_agente') || 'agente_loja'} onValueChange={(v) => { setValue('tipo_agente', v); setValue('percentual_comissao_agente', null); }}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="agente_loja">Agente Loja — 20%</SelectItem>
                            <SelectItem value="agente_bronze">Agente Bronze — 60%</SelectItem>
                            <SelectItem value="agente_prata">Agente Prata — 70%</SelectItem>
                            <SelectItem value="agente_ouro">Agente Ouro — 80%</SelectItem>
                            <SelectItem value="agente_diamante">Agente Diamante — 85%</SelectItem>
                          </SelectContent>
                        </Select>
                      </FormField>

                      <FormField label="Comissão Personalizada (%)" col2>
                        <Input type="number" {...register('percentual_comissao_agente')} placeholder="Ex: 75" min="0" max="100" step="0.01" />
                        <p className="text-xs text-slate-400 mt-1">Sobrescreve o percentual padrão do tipo de agente</p>
                      </FormField>

                      <FormField label="Instância WhatsApp" col2>
                        <div className="relative">
                          <Smartphone className="absolute left-3 top-2.5 w-4 h-4 text-green-500" />
                          <Input {...register('evolution_instance_name')} placeholder="vendedor-joao" className="pl-9" />
                        </div>
                      </FormField>
                    </>
                  )}

                  {!usuario && (
                    <div className="col-span-2 p-3 bg-blue-50 border border-blue-200 rounded-lg flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
                      <p className="text-sm text-blue-700">Um e-mail de convite será enviado para o usuário criar sua senha de acesso.</p>
                    </div>
                  )}
                </div>
              </TabsContent>

            </div>
          </Tabs>

          {inviteSuccess && !usuario && (
            <div className="mx-6 mb-2 rounded-lg bg-green-50 border border-green-200 p-3 text-green-700 text-sm">
              ✅ Convite enviado com sucesso!
            </div>
          )}

          <div className="flex justify-between items-center gap-3 px-6 pt-3 pb-4 border-t bg-white flex-shrink-0">
            <div className="flex gap-1">
              {['pessoal', 'endereco', 'banco', 'acesso'].map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(tab)}
                  className={`w-2 h-2 rounded-full transition-colors ${activeTab === tab ? 'bg-[#10353C]' : 'bg-slate-200'}`}
                />
              ))}
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
              <Button type="submit" disabled={isLoading} className="bg-[#10353C] hover:bg-[#1a5060] text-white">
                {isLoading ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" />{usuario ? 'Salvando...' : 'Enviando...'}</>
                ) : (
                  usuario ? 'Salvar Alterações' : 'Enviar Convite'
                )}
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}