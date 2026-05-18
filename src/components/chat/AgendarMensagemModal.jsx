import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { CalendarClock, Trash2, RefreshCw, Send } from 'lucide-react';

export default function AgendarMensagemModal({ open, onOpenChange, conversa, currentUser }) {
  const [tab, setTab] = useState('novo'); // 'novo' | 'agendados'
  const [tipo, setTipo] = useState('unica');
  const [mensagem, setMensagem] = useState('');
  const [dataEnvio, setDataEnvio] = useState('');
  const [horaEnvio, setHoraEnvio] = useState('08:00');
  const [saving, setSaving] = useState(false);
  const [agendados, setAgendados] = useState([]);
  const [loadingAgendados, setLoadingAgendados] = useState(false);

  useEffect(() => {
    if (open && conversa) {
      loadAgendados();
      // Data mínima = hoje
      setDataEnvio(format(new Date(), 'yyyy-MM-dd'));
    }
  }, [open, conversa]);

  const loadAgendados = async () => {
    if (!conversa?.id) return;
    setLoadingAgendados(true);
    try {
      const lista = await base44.entities.MensagemAgendada.filter(
        { conversa_id: conversa.id },
        '-created_date',
        50
      );
      setAgendados(lista.filter(a => a.status !== 'cancelada'));
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingAgendados(false);
    }
  };

  const handleSalvar = async () => {
    if (!mensagem.trim()) { toast.error('Digite a mensagem'); return; }
    if (!dataEnvio) { toast.error('Selecione a data'); return; }
    if (!horaEnvio) { toast.error('Selecione o horário'); return; }

    // Calcular proxima_execucao
    const proximaExecucao = new Date(`${dataEnvio}T${horaEnvio}:00`).toISOString();

    setSaving(true);
    try {
      await base44.entities.MensagemAgendada.create({
        empresa_id: currentUser?.empresa_id || '',
        conversa_id: conversa.id,
        cliente_id: conversa.cliente_id || '',
        telefone: conversa.cliente_telefone || '',
        mensagem: mensagem.trim(),
        tipo,
        recorrencia: tipo === 'recorrente' ? 'mensal' : '',
        data_envio: dataEnvio,
        hora_envio: horaEnvio,
        status: 'agendada',
        responsavel_id: currentUser?.id || '',
        responsavel_nome: currentUser?.nome_perfil || currentUser?.full_name || '',
        instancia_whatsapp: conversa.instancia || '',
        proxima_execucao: proximaExecucao,
      });
      toast.success('✅ Mensagem agendada com sucesso!');
      setMensagem('');
      setTab('agendados');
      loadAgendados();
    } catch (e) {
      toast.error('Erro ao agendar mensagem');
    } finally {
      setSaving(false);
    }
  };

  const handleCancelar = async (id) => {
    await base44.entities.MensagemAgendada.update(id, { status: 'cancelada' });
    toast.success('Agendamento cancelado');
    loadAgendados();
  };

  const statusColor = {
    agendada: 'bg-blue-100 text-blue-700',
    enviada: 'bg-green-100 text-green-700',
    falha: 'bg-red-100 text-red-700',
    cancelada: 'bg-gray-100 text-gray-500',
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarClock className="w-5 h-5 text-blue-600" />
            Agendar Mensagem
          </DialogTitle>
        </DialogHeader>

        {/* Tabs */}
        <div className="flex gap-2 border-b pb-2">
          <button
            onClick={() => setTab('novo')}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${tab === 'novo' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
          >
            Novo agendamento
          </button>
          <button
            onClick={() => { setTab('agendados'); loadAgendados(); }}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${tab === 'agendados' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
          >
            Agendados {agendados.length > 0 && `(${agendados.length})`}
          </button>
        </div>

        {tab === 'novo' ? (
          <div className="space-y-4 mt-1">
            {/* Tipo */}
            <div>
              <Label>Tipo de agendamento</Label>
              <Select value={tipo} onValueChange={setTipo}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unica">📅 Mensagem única</SelectItem>
                  <SelectItem value="recorrente">🔁 Lembrete recorrente (mensal)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Mensagem */}
            <div>
              <Label>Mensagem</Label>
              <Textarea
                className="mt-1"
                rows={4}
                placeholder="Digite a mensagem que será enviada ao cliente..."
                value={mensagem}
                onChange={(e) => setMensagem(e.target.value)}
              />
            </div>

            {/* Data e hora */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Data de envio</Label>
                <Input
                  type="date"
                  className="mt-1"
                  value={dataEnvio}
                  min={format(new Date(), 'yyyy-MM-dd')}
                  onChange={(e) => setDataEnvio(e.target.value)}
                />
              </div>
              <div>
                <Label>Horário</Label>
                <Input
                  type="time"
                  className="mt-1"
                  value={horaEnvio}
                  onChange={(e) => setHoraEnvio(e.target.value)}
                />
              </div>
            </div>

            {tipo === 'recorrente' && (
              <div className="p-3 bg-blue-50 rounded-lg border border-blue-200 text-sm text-blue-700">
                🔁 A mensagem será enviada todo mês no dia <strong>{dataEnvio ? new Date(dataEnvio + 'T12:00').getDate() : '?'}</strong> às <strong>{horaEnvio}</strong>, até ser cancelada manualmente.
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
              <Button onClick={handleSalvar} disabled={saving} className="bg-blue-600 hover:bg-blue-700 gap-2">
                <CalendarClock className="w-4 h-4" />
                {saving ? 'Agendando...' : 'Agendar mensagem'}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-2 mt-1 max-h-96 overflow-y-auto">
            {loadingAgendados ? (
              <p className="text-center text-slate-400 py-4">Carregando...</p>
            ) : agendados.length === 0 ? (
              <p className="text-center text-slate-400 py-8">Nenhuma mensagem agendada para esta conversa.</p>
            ) : (
              agendados.map(a => (
                <div key={a.id} className="border rounded-lg p-3 space-y-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm text-slate-800 flex-1">{a.mensagem}</p>
                    {a.status === 'agendada' && (
                      <button onClick={() => handleCancelar(a.id)} className="text-red-500 hover:text-red-700 flex-shrink-0" title="Cancelar">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor[a.status]}`}>
                      {a.status}
                    </span>
                    {a.tipo === 'recorrente' && (
                      <span className="text-xs text-blue-600 flex items-center gap-1"><RefreshCw className="w-3 h-3" /> Mensal</span>
                    )}
                    <span className="text-xs text-slate-500">
                      📅 {a.data_envio} às {a.hora_envio}
                    </span>
                  </div>
                  {a.status === 'falha' && a.erro_detalhe && (
                    <p className="text-xs text-red-500">{a.erro_detalhe}</p>
                  )}
                  {a.ultima_execucao && (
                    <p className="text-xs text-slate-400">Último envio: {format(new Date(a.ultima_execucao), 'dd/MM/yyyy HH:mm')}</p>
                  )}
                </div>
              ))
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}