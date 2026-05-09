import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { base44 } from '@/api/base44Client';

const VAZIO = {
  nome_completo: '', cpf: '', rg: '', data_nascimento: '', estado_civil: '',
  nome_mae: '', nacionalidade: '', local_nascimento: '', celular: '', email: '',
  cep: '', endereco: '', numero: '', complemento: '', bairro: '', cidade: '', estado: '',
};

const formatarCelular = (v) => {
  const nums = v.replace(/\D/g, '').slice(0, 11);
  if (nums.length <= 2) return nums;
  if (nums.length <= 7) return `(${nums.slice(0,2)}) ${nums.slice(2)}`;
  return `(${nums.slice(0,2)}) ${nums.slice(2,3)} ${nums.slice(3,7)}-${nums.slice(7,11)}`;
};

const formatarCPF = (v) => {
  const nums = v.replace(/\D/g, '').slice(0, 11);
  if (nums.length <= 3) return nums;
  if (nums.length <= 6) return `${nums.slice(0,3)}.${nums.slice(3)}`;
  if (nums.length <= 9) return `${nums.slice(0,3)}.${nums.slice(3,6)}.${nums.slice(6)}`;
  return `${nums.slice(0,3)}.${nums.slice(3,6)}.${nums.slice(6,9)}-${nums.slice(9,11)}`;
};

export default function CadastrarClienteModal({ open, onOpenChange, nomeInicial = '', empresaId, onClienteCriado }) {
  const [form, setForm] = useState({ ...VAZIO, nome_completo: nomeInicial });
  const [salvando, setSalvando] = useState(false);
  const [buscandoCep, setBuscandoCep] = useState(false);

  React.useEffect(() => {
    if (open) setForm({ ...VAZIO, nome_completo: nomeInicial });
  }, [open, nomeInicial]);

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }));

  const buscarCep = async (cep) => {
    const digits = cep.replace(/\D/g, '');
    if (digits.length !== 8) return;
    setBuscandoCep(true);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
      const data = await res.json();
      if (!data.erro) {
        setForm(f => ({ ...f, endereco: data.logradouro || f.endereco, bairro: data.bairro || f.bairro, cidade: data.localidade || f.cidade, estado: data.uf || f.estado }));
      }
    } catch {} finally { setBuscandoCep(false); }
  };

  const handleSalvar = async () => {
    if (!form.nome_completo.trim()) { toast.error('Informe o nome do cliente'); return; }
    if (!form.data_nascimento) { toast.error('Informe a data de nascimento'); return; }
    setSalvando(true);
    try {
      const criado = await base44.entities.Cliente.create({
        empresa_id: empresaId,
        tipo_pessoa: 'Física',
        nome_completo: form.nome_completo.trim(),
        cpf: form.cpf || '',
        rg: form.rg || '',
        data_nascimento: form.data_nascimento || '',
        estado_civil: form.estado_civil || '',
        nome_mae: form.nome_mae || '',
        nacionalidade: form.nacionalidade || '',
        local_nascimento: form.local_nascimento || '',
        celular: form.celular || '',
        email: form.email || '',
        cep: form.cep || '',
        endereco: form.endereco || '',
        numero: form.numero || '',
        complemento: form.complemento || '',
        bairro: form.bairro || '',
        cidade: form.cidade || '',
        estado: form.estado || '',
        status: 'ativo',
      });
      toast.success('Cliente cadastrado com sucesso!');
      onClienteCriado?.(criado);
      onOpenChange(false);
    } catch (e) {
      toast.error('Erro ao cadastrar cliente: ' + e.message);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-blue-600" />
            Cadastrar Novo Cliente
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {/* Dados Pessoais */}
          <p className="text-[10px] font-bold text-blue-600 uppercase tracking-wide">🧾 Dados Pessoais</p>
          <div className="grid grid-cols-3 gap-2">
            <Input placeholder="Nome completo *" value={form.nome_completo}
              onChange={e => set('nome_completo', e.target.value)}
              className="h-8 text-sm col-span-2" />
            <Input placeholder="Apelido" value={form.apelido || ''}
              onChange={e => set('apelido', e.target.value)}
              className="h-8 text-sm" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Input placeholder="CPF ex: 101.765.654-55" value={form.cpf}
              onChange={e => set('cpf', formatarCPF(e.target.value))}
              className="h-8 text-sm" />
            <Input placeholder="RG" value={form.rg}
              onChange={e => set('rg', e.target.value)}
              className="h-8 text-sm" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <p className="text-[10px] text-slate-500 mb-0.5">Data de Nascimento *</p>
              <Input type="date" value={form.data_nascimento}
                onChange={e => set('data_nascimento', e.target.value)}
                className="h-8 text-sm" />
            </div>
            <div>
              <p className="text-[10px] text-slate-500 mb-0.5">Estado Civil</p>
              <select value={form.estado_civil}
                onChange={e => set('estado_civil', e.target.value)}
                className="h-8 w-full rounded-md border border-input bg-white px-2 text-sm">
                <option value="">Selecionar...</option>
                {['Solteiro(a)','Casado(a)','Divorciado(a)','Viúvo(a)','União Estável'].map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
          </div>
          <Input placeholder="Nome da mãe" value={form.nome_mae}
            onChange={e => set('nome_mae', e.target.value)}
            className="h-8 text-sm" />
          <div className="grid grid-cols-2 gap-2">
            <Input placeholder="Nacionalidade" value={form.nacionalidade}
              onChange={e => set('nacionalidade', e.target.value)}
              className="h-8 text-sm" />
            <Input placeholder="Naturalidade (cidade/UF)" value={form.local_nascimento}
              onChange={e => set('local_nascimento', e.target.value)}
              className="h-8 text-sm" />
          </div>

          {/* Contato */}
          <p className="text-[10px] font-bold text-blue-600 uppercase tracking-wide">📞 Contato</p>
          <div className="grid grid-cols-2 gap-2">
            <Input placeholder="Celular ex: (87) 9 8128-5628" value={form.celular}
              onChange={e => set('celular', formatarCelular(e.target.value))}
              className="h-8 text-sm" />
            <Input placeholder="E-mail" type="email" value={form.email}
              onChange={e => set('email', e.target.value)}
              className="h-8 text-sm" />
          </div>

          {/* Endereço */}
          <p className="text-[10px] font-bold text-blue-600 uppercase tracking-wide">📍 Endereço</p>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Input placeholder="CEP" value={form.cep}
                onChange={e => { set('cep', e.target.value); buscarCep(e.target.value); }}
                className="h-8 text-sm" maxLength={9} />
              {buscandoCep && <Loader2 className="absolute right-2 top-2 w-3.5 h-3.5 animate-spin text-slate-400" />}
            </div>
            <Input placeholder="Número" value={form.numero}
              onChange={e => set('numero', e.target.value)}
              className="h-8 text-sm w-24" />
          </div>
          <Input placeholder="Rua / Logradouro" value={form.endereco}
            onChange={e => set('endereco', e.target.value)}
            className="h-8 text-sm" />
          <div className="grid grid-cols-2 gap-2">
            <Input placeholder="Complemento" value={form.complemento}
              onChange={e => set('complemento', e.target.value)}
              className="h-8 text-sm" />
            <Input placeholder="Bairro" value={form.bairro}
              onChange={e => set('bairro', e.target.value)}
              className="h-8 text-sm" />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Input placeholder="Cidade" value={form.cidade}
              onChange={e => set('cidade', e.target.value)}
              className="h-8 text-sm col-span-2" />
            <Input placeholder="UF" value={form.estado}
              onChange={e => set('estado', e.target.value)}
              className="h-8 text-sm" maxLength={2} />
          </div>
        </div>

        <div className="flex gap-2 pt-2 border-t">
          <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button className="flex-1 bg-blue-600 hover:bg-blue-700 gap-1.5" onClick={handleSalvar} disabled={salvando}>
            {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
            Cadastrar e Selecionar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}