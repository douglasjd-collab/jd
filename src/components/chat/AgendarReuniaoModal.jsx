import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { CalendarCheck } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

export default function AgendarReuniaoModal({ open, onOpenChange, conversa, user }) {
  const [loading, setLoading] = useState(false);

  const clienteNome = conversa?.cliente_nome || conversa?.contato_nome || '';
  const clienteTelefone = conversa?.cliente_telefone || '';

  const amanhaCedo = new Date();
  amanhaCedo.setDate(amanhaCedo.getDate() + 1);
  amanhaCedo.setHours(9, 0, 0, 0);

  const [form, setForm] = useState({
    titulo: clienteNome ? `Reunião - ${clienteNome}` : 'Nova Reunião',
    inicio: format(amanhaCedo, "yyyy-MM-dd'T'HH:mm"),
    fim: '',
    local: '',
    descricao: '',
  });

  // Atualiza o título se o clienteNome mudar (quando o modal abre)
  useEffect(() => {
    if (open) {
      const amanha = new Date();
      amanha.setDate(amanha.getDate() + 1);
      amanha.setHours(9, 0, 0, 0);
      setForm({
        titulo: clienteNome ? `Reunião - ${clienteNome}` : 'Nova Reunião',
        inicio: format(amanha, "yyyy-MM-dd'T'HH:mm"),
        fim: '',
        local: '',
        descricao: '',
      });
    }
  }, [open, clienteNome]);

  const handleSalvar = async () => {
    if (!form.titulo || !form.inicio) {
      toast.error('Preencha título e data/hora');
      return;
    }
    setLoading(true);
    try {
      await base44.entities.Agenda.create({
        empresa_id: user?.empresa_id,
        usuario_id: user?.auth_id || user?.id,
        titulo: form.titulo,
        tipo: 'reuniao',
        inicio: new Date(form.inicio).toISOString(),
        fim: form.fim ? new Date(form.fim).toISOString() : null,
        local: form.local || '',
        descricao: form.descricao || '',
        status: 'agendado',
        telefone: clienteTelefone,
        cliente_nome: clienteNome,
        telegram_chat_id: user?.telegram_chat_id || '',
      });
      toast.success('✅ Reunião agendada com sucesso!');
      onOpenChange(false);
    } catch (e) {
      toast.error('Erro ao agendar: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarCheck className="w-5 h-5 text-blue-600" />
            Agendar Reunião
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {/* Cliente (readonly) */}
          {clienteNome && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 flex items-center gap-2 text-sm">
              <span className="text-blue-700 font-medium">👤 {clienteNome}</span>
              {clienteTelefone && (
                <span className="text-blue-500 text-xs ml-auto">{clienteTelefone}</span>
              )}
            </div>
          )}

          <div>
            <Label>Título *</Label>
            <Input
              value={form.titulo}
              onChange={e => setForm(f => ({ ...f, titulo: e.target.value }))}
              placeholder="Ex: Reunião Consórcio Imóvel"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Data e hora início *</Label>
              <Input
                type="datetime-local"
                value={form.inicio}
                onChange={e => setForm(f => ({ ...f, inicio: e.target.value }))}
              />
            </div>
            <div>
              <Label>Término (opcional)</Label>
              <Input
                type="datetime-local"
                value={form.fim}
                onChange={e => setForm(f => ({ ...f, fim: e.target.value }))}
              />
            </div>
          </div>

          <div>
            <Label>Local</Label>
            <Input
              value={form.local}
              onChange={e => setForm(f => ({ ...f, local: e.target.value }))}
              placeholder="Ex: Online, Escritório..."
            />
          </div>

          <div>
            <Label>Observações</Label>
            <Textarea
              value={form.descricao}
              onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))}
              rows={2}
              placeholder="Detalhes da reunião..."
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button
            className="bg-blue-600 hover:bg-blue-700 gap-2"
            onClick={handleSalvar}
            disabled={loading}
          >
            <CalendarCheck className="w-4 h-4" />
            {loading ? 'Salvando...' : 'Agendar reunião'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}