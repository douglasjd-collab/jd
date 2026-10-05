import React, { useEffect, useState } from 'react';
import moment from 'moment';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import ComprovantesAnexos from './ComprovantesAnexos';
import { PERFIS_ADIANTAMENTO, PESSOA_LABELS, fmt, parseComprovantes, valoresAdiantamento } from './adiantamentoHelpers';

const formVazio = () => ({
  pessoa_tipo: 'vendedor',
  colaborador_id: '',
  colaborador_nome: '',
  parceiro_id: '',
  parceiro_nome: '',
  valor: '',
  data: moment().format('YYYY-MM-DD'),
  motivo: '',
  observacoes: '',
  status: 'pendente',
});

export default function AdiantamentoFormModal({ open, onOpenChange, adiantamento = null, user, colaboradores = [], parceiros = [], onSalvo }) {
  const [form, setForm] = useState(formVazio);
  const [comprovantes, setComprovantes] = useState([]);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (adiantamento) {
      setForm({
        pessoa_tipo: adiantamento.pessoa_tipo || 'vendedor',
        colaborador_id: adiantamento.colaborador_id || '',
        colaborador_nome: adiantamento.colaborador_nome || '',
        parceiro_id: adiantamento.parceiro_id || '',
        parceiro_nome: adiantamento.parceiro_nome || '',
        valor: String(adiantamento.valor ?? ''),
        data: adiantamento.data || moment().format('YYYY-MM-DD'),
        motivo: adiantamento.motivo || '',
        observacoes: adiantamento.observacoes || adiantamento.observacao || '',
        status: adiantamento.status || 'pendente',
      });
      setComprovantes(parseComprovantes(adiantamento));
    } else {
      setForm(formVazio());
      setComprovantes([]);
    }
  }, [open, adiantamento]);

  const valoresAtuais = adiantamento ? valoresAdiantamento(adiantamento) : null;

  const handleSalvar = async () => {
    if (!form.valor || parseFloat(form.valor) <= 0) { toast.error('Informe o valor'); return; }
    if (!form.data) { toast.error('Informe a data'); return; }
    if (!form.colaborador_id && !form.parceiro_id) {
      toast.error(`Selecione o ${(PESSOA_LABELS[form.pessoa_tipo] || 'beneficiário').toLowerCase()}`);
      return;
    }

    setIsSaving(true);
    try {
      const data = {
        empresa_id: user.empresa_id,
        pessoa_tipo: form.pessoa_tipo,
        colaborador_id: form.colaborador_id || null,
        colaborador_nome: form.colaborador_nome || null,
        parceiro_id: form.parceiro_id || null,
        parceiro_nome: form.parceiro_nome || null,
        valor: parseFloat(form.valor),
        data: form.data,
        motivo: form.motivo || '',
        observacoes: form.observacoes || '',
        status: form.status || adiantamento?.status || 'pendente',
        comprovantes_json: JSON.stringify(comprovantes),
        // Limpar data_desconto ao reabrir
        ...(form.status === 'pendente' ? { data_desconto: null, lote_pagamento_id: null } : {}),
      };
      if (adiantamento) {
        await base44.entities.Adiantamento.update(adiantamento.id, data);
        toast.success('Adiantamento atualizado!');
      } else {
        await base44.entities.Adiantamento.create(data);
        toast.success('Adiantamento registrado!');
      }
      onSalvo?.();
      onOpenChange(false);
    } catch (err) {
      toast.error('Erro ao salvar o adiantamento');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{adiantamento ? 'Editar Adiantamento' : 'Novo Adiantamento'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {valoresAtuais?.descontoParcial && (
            <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 text-xs text-orange-800 space-y-1">
              <p className="font-semibold">Adiantamento com desconto parcial</p>
              <p>Valor original {fmt(valoresAtuais.valorOriginal)} • já descontado {fmt(valoresAtuais.valorDescontado)} • saldo pendente {fmt(valoresAtuais.saldoPendente)}.</p>
              <p>O campo “Valor” representa o <strong>saldo restante</strong> — altere apenas se necessário.</p>
            </div>
          )}

          <div>
            <Label className="text-xs font-semibold text-slate-500 mb-1.5 block">Tipo de Pessoa *</Label>
            <Select value={form.pessoa_tipo} onValueChange={v => setForm(f => ({ ...f, pessoa_tipo: v, colaborador_id: '', colaborador_nome: '', parceiro_id: '', parceiro_nome: '' }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PERFIS_ADIANTAMENTO.map(perfil => (
                  <SelectItem key={perfil.value} value={perfil.value}>{perfil.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {form.pessoa_tipo === 'parceiro' ? (
            <div>
              <Label className="text-xs font-semibold text-slate-500 mb-1.5 block">Parceiro *</Label>
              <Select
                value={form.colaborador_id ? `colaborador:${form.colaborador_id}` : form.parceiro_id ? `empresa:${form.parceiro_id}` : ''}
                onValueChange={v => {
                  const [origem, id] = v.split(':');
                  if (origem === 'colaborador') {
                    const c = colaboradores.find(x => x.id === id);
                    setForm(f => ({ ...f, colaborador_id: id, colaborador_nome: c?.nome || '', parceiro_id: '', parceiro_nome: '' }));
                  } else {
                    const p = parceiros.find(x => x.id === id);
                    setForm(f => ({ ...f, parceiro_id: id, parceiro_nome: p?.nome || '', colaborador_id: '', colaborador_nome: '' }));
                  }
                }}
              >
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  {colaboradores.filter(c => c.perfil === 'parceiro').map(c => (
                    <SelectItem key={`colaborador:${c.id}`} value={`colaborador:${c.id}`}>{c.nome}</SelectItem>
                  ))}
                  {parceiros.map(p => (
                    <SelectItem key={`empresa:${p.id}`} value={`empresa:${p.id}`}>{p.nome} — Empresa Parceira</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div>
              <Label className="text-xs font-semibold text-slate-500 mb-1.5 block">{PESSOA_LABELS[form.pessoa_tipo]} *</Label>
              <Select value={form.colaborador_id} onValueChange={v => {
                const c = colaboradores.find(x => x.id === v);
                setForm(f => ({ ...f, colaborador_id: v, colaborador_nome: c?.nome || '', parceiro_id: '', parceiro_nome: '' }));
              }}>
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  {colaboradores
                    .filter(c => c.perfil === form.pessoa_tipo)
                    .map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs font-semibold text-slate-500 mb-1.5 block">Valor (R$) *</Label>
              <Input type="number" min="0" step="0.01" placeholder="0,00" value={form.valor} onChange={e => setForm(f => ({ ...f, valor: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs font-semibold text-slate-500 mb-1.5 block">Data *</Label>
              <Input type="date" value={form.data} onChange={e => setForm(f => ({ ...f, data: e.target.value }))} />
            </div>
          </div>

          <div>
            <Label className="text-xs font-semibold text-slate-500 mb-1.5 block">Motivo</Label>
            <Input placeholder="Ex: Adiantamento de salário, auxílio..." value={form.motivo} onChange={e => setForm(f => ({ ...f, motivo: e.target.value }))} />
          </div>

          <div>
            <Label className="text-xs font-semibold text-slate-500 mb-1.5 block">Observações</Label>
            <Input placeholder="Observações adicionais..." value={form.observacoes} onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))} />
          </div>

          <div className="border-t border-slate-100 pt-4">
            <ComprovantesAnexos
              comprovantes={comprovantes}
              onChange={async (lista) => setComprovantes(lista)}
              podeEditar
            />
          </div>

          {adiantamento?.status === 'descontado' && (
            <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 space-y-2">
              <p className="text-xs font-semibold text-orange-700">⚠️ Este adiantamento está marcado como descontado. Para reabrir (ex: desconto parcial), altere o status abaixo:</p>
              <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="descontado">✅ Descontado</SelectItem>
                  <SelectItem value="pendente">⏳ Pendente (reabrir)</SelectItem>
                  <SelectItem value="cancelado">❌ Cancelado</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 mt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>Cancelar</Button>
          <Button onClick={handleSalvar} disabled={isSaving} className="bg-[#10353C] hover:bg-[#1a5060] text-white">
            {isSaving ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Salvando...</> : 'Salvar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}