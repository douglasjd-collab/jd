import React, { useState, useEffect, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Send,
  Loader2,
  Users,
  MessageSquare,
  Upload,
  FileText,
  CheckCircle2,
  AlertCircle,
  Clock,
  Search,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import ChatPopupModal from '@/components/chat/ChatPopupModal';

export default function DisparoEmMassa() {
  const [user, setUser] = useState(null);
  const [empresaId, setEmpresaId] = useState(null);
  const [mensagem, setMensagem] = useState('');
  const [listaSelecionada, setListaSelecionada] = useState('todos_clientes');
  const [searchTerm, setSearchTerm] = useState('');
  const [chatPopup, setChatPopup] = useState(null);
  const [confirmacaoOpen, setConfirmacaoOpen] = useState(false);
  const [previewRecipients, setPreviewRecipients] = useState([]);
  const queryClient = useQueryClient();

  useEffect(() => { loadUser(); }, []);

  const loadUser = async () => {
    try {
      const me = await base44.auth.me();
      if (me.role === 'super_admin' || me.perfil === 'super_admin') {
        setEmpresaId('699696c2c9f5bffc2e67402b');
      } else {
        const colabs = await base44.entities.Colaborador.filter({ user_id: me.id, status: 'ativo' });
        if (colabs.length > 0) setEmpresaId(colabs[0].empresa_id);
      }
      setUser(me);
    } catch (e) {
      toast.error('Erro ao carregar usuário');
    }
  };

  // Buscar clientes
  const { data: clientes = [], isLoading: loadingClientes } = useQuery({
    queryKey: ['clientes-disparo', empresaId],
    enabled: !!empresaId,
    queryFn: () => base44.entities.Cliente.filter({ empresa_id: empresaId }, '-created_date', 5000),
  });

  // Buscar histórico de disparos
  const { data: disparos = [], refetch: refetchDisparos } = useQuery({
    queryKey: ['disparos-massa', empresaId],
    enabled: !!empresaId,
    queryFn: () => base44.entities.CampanhaLog.filter({ 
      empresa_id: empresaId,
      tipo_campanha: 'disparo_em_massa'
    }, '-created_date', 500),
  });

  // Filtrar clientes por termo de busca
  const clientesFiltrados = clientes.filter(c => {
    const t = searchTerm.toLowerCase();
    return !t || (c.nome || '').toLowerCase().includes(t) || 
           (c.telefone || '').includes(t) ||
           (c.cpf || '').includes(t);
  });

  // Calcular destinatários baseados na lista selecionada
  const destinatarios = useMemo(() => {
    if (listaSelecionada === 'todos_clientes') {
      return clientesFiltrados.filter(c => c.telefone);
    }
    // Pode expandir para outros filtros no futuro
    return clientesFiltrados.filter(c => c.telefone);
  }, [listaSelecionada, clientesFiltrados]);

  // Executar disparo em massa
  const executarDisparoMutation = useMutation({
    mutationFn: async ({ mensagem, destinatarios }) => {
      if (!mensagem.trim()) throw new Error('Mensagem é obrigatória');
      if (destinatarios.length === 0) throw new Error('Nenhum destinatário selecionado');

      let enviados = 0;
      let erros = 0;

      for (const cliente of destinatarios) {
        try {
          await base44.functions.invoke('enviarMensagemWhatsapp', {
            empresa_id: empresaId,
            telefone: cliente.telefone,
            mensagem: mensagem,
          });

          await base44.entities.CampanhaLog.create({
            empresa_id: empresaId,
            cliente_id: cliente.id,
            cliente_nome: cliente.nome,
            cliente_telefone: cliente.telefone,
            tipo_campanha: 'disparo_em_massa',
            status: 'enviada',
          });

          enviados++;
        } catch (err) {
          erros++;
          await base44.entities.CampanhaLog.create({
            empresa_id: empresaId,
            cliente_id: cliente.id,
            cliente_nome: cliente.nome,
            cliente_telefone: cliente.telefone,
            tipo_campanha: 'disparo_em_massa',
            status: 'erro',
            motivo_erro: err.message,
          });
        }
      }

      return { enviados, erros, total: destinatarios.length };
    },
    onSuccess: (data) => {
      toast.success(`✅ ${data.enviados}/${data.total} mensagens enviadas${data.erros > 0 ? ` | ⚠️ ${data.erros} erros` : ''}`);
      setConfirmacaoOpen(false);
      setMensagem('');
      refetchDisparos();
      queryClient.invalidateQueries({ queryKey: ['campanhas'] });
    },
    onError: (e) => toast.error('Erro: ' + e.message),
  });

  // Estatísticas
  const stats = {
    total_clientes: clientes.length,
    com_telefone: clientes.filter(c => c.telefone).length,
    disparos_hoje: disparos.filter(d => {
      const hoje = new Date().toLocaleDateString('pt-BR');
      return new Date(d.created_date).toLocaleDateString('pt-BR') === hoje;
    }).length,
    taxa_sucesso: disparos.length > 0
      ? Math.round((disparos.filter(d => d.status === 'enviada').length / disparos.length) * 100)
      : 0,
  };

  if (!user || !empresaId) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Disparo em Massa</h1>
          <p className="text-sm text-slate-500 mt-1">Envie mensagens WhatsApp para múltiplos clientes simultaneamente</p>
        </div>
      </div>

      {/* Estatísticas */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-500 uppercase font-semibold">Total Clientes</p>
                <p className="text-3xl font-bold text-blue-600 mt-1">{stats.total_clientes}</p>
                <p className="text-xs text-slate-400 mt-0.5">na base</p>
              </div>
              <Users className="w-8 h-8 text-blue-400 opacity-60" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-500 uppercase font-semibold">Com Telefone</p>
                <p className="text-3xl font-bold text-emerald-600 mt-1">{stats.com_telefone}</p>
                <p className="text-xs text-slate-400 mt-0.5">podem receber</p>
              </div>
              <CheckCircle2 className="w-8 h-8 text-emerald-400 opacity-60" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-500 uppercase font-semibold">Disparos Hoje</p>
                <p className="text-3xl font-bold text-purple-600 mt-1">{stats.disparos_hoje}</p>
                <p className="text-xs text-slate-400 mt-0.5">mensagens enviadas</p>
              </div>
              <Send className="w-8 h-8 text-purple-400 opacity-60" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-500 uppercase font-semibold">Taxa de Sucesso</p>
                <p className="text-3xl font-bold text-amber-600 mt-1">{stats.taxa_sucesso}%</p>
                <p className="text-xs text-slate-400 mt-0.5">histórico</p>
              </div>
              <AlertCircle className="w-8 h-8 text-amber-400 opacity-60" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="novo_disparo">
        <TabsList className="mb-4">
          <TabsTrigger value="novo_disparo" className="gap-1.5">
            <Send className="w-4 h-4" />
            Novo Disparo
          </TabsTrigger>
          <TabsTrigger value="historico" className="gap-1.5">
            <Clock className="w-4 h-4" />
            Histórico
          </TabsTrigger>
        </TabsList>

        {/* ABA: Novo Disparo */}
        <TabsContent value="novo_disparo">
          <div className="grid lg:grid-cols-2 gap-6">
            {/* Formulário */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MessageSquare className="w-5 h-5 text-blue-500" />
                  Configurar Disparo
                </CardTitle>
                <CardDescription>
                  Selecione os destinatários e escreva a mensagem
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label className="text-sm mb-2 block">Lista de Destinatários</Label>
                  <Select value={listaSelecionada} onValueChange={setListaSelecionada}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione uma lista" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos_clientes">Todos os Clientes ({stats.com_telefone} com telefone)</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-slate-500 mt-1">
                    {destinatarios.length} clientes serão impactados
                  </p>
                </div>

                <div>
                  <Label className="text-sm mb-2 block">Mensagem *</Label>
                  <Textarea
                    value={mensagem}
                    onChange={(e) => setMensagem(e.target.value)}
                    placeholder="Digite sua mensagem aqui...

Ex: Olá! 👋

Temos uma oferta especial esperando por você.
Entre em contato conosco para saber mais!

Agradecemos a preferência. 😊"
                    rows={8}
                    className="resize-none text-sm"
                  />
                  <p className="text-xs text-slate-500 mt-1">
                    {mensagem.length} caracteres
                  </p>
                </div>

                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <p className="text-sm text-blue-800 font-semibold mb-1">
                    📊 Resumo do Disparo
                  </p>
                  <div className="flex items-center justify-between text-xs text-blue-700">
                    <span>Destinatários:</span>
                    <span className="font-bold">{destinatarios.length}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-blue-700 mt-1">
                    <span>Mensagem:</span>
                    <span className="font-bold">{mensagem.trim() ? 'Preenchida' : 'Em branco'}</span>
                  </div>
                </div>

                <Button
                  onClick={() => {
                    setPreviewRecipients(destinatarios.slice(0, 10));
                    setConfirmacaoOpen(true);
                  }}
                  disabled={destinatarios.length === 0 || !mensagem.trim() || executarDisparoMutation.isPending}
                  className="w-full gap-2 bg-blue-600 hover:bg-blue-700"
                >
                  {executarDisparoMutation.isPending ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Enviando...</>
                  ) : (
                    <><Send className="w-4 h-4" /> Enviar para {destinatarios.length} Clientes</>
                  )}
                </Button>
              </CardContent>
            </Card>

            {/* Lista de Clientes */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="w-5 h-5 text-slate-500" />
                  Clientes Disponíveis
                </CardTitle>
                <CardDescription>
                  Visualize os clientes que serão impactados
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                  <Input
                    placeholder="Buscar cliente..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-9"
                  />
                </div>

                <ScrollArea className="h-[480px] border rounded-lg">
                  <div className="p-3 space-y-2">
                    {loadingClientes ? (
                      <div className="flex items-center justify-center h-64 text-slate-400">
                        <Loader2 className="w-6 h-6 animate-spin" />
                      </div>
                    ) : clientesFiltrados.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-64 text-slate-400 gap-2">
                        <Users className="w-10 h-10 opacity-30" />
                        <p className="text-sm">Nenhum cliente encontrado</p>
                      </div>
                    ) : (
                      clientesFiltrados.slice(0, 50).map(cliente => (
                        <div
                          key={cliente.id}
                          className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-50 transition-colors"
                        >
                          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center text-white font-bold text-xs flex-shrink-0">
                            {cliente.nome?.charAt(0)?.toUpperCase() || '?'}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm text-slate-900 truncate">{cliente.nome || '-'}</p>
                            <p className="text-xs text-slate-500">
                              {cliente.telefone || 'Sem telefone'}
                            </p>
                          </div>
                          {cliente.telefone && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 w-7 p-0"
                              onClick={() => setChatPopup({ nome: cliente.nome, telefone: cliente.telefone })}
                            >
                              <MessageSquare className="w-3.5 h-3.5" />
                            </Button>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </ScrollArea>

                {clientesFiltrados.length > 50 && (
                  <p className="text-xs text-slate-500 text-center">
                    Mostrando 50 de {clientesFiltrados.length} clientes
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ABA: Histórico */}
        <TabsContent value="historico">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="w-5 h-5" />
                Histórico de Disparos em Massa
              </CardTitle>
              <CardDescription>
                Acompanhe todos os disparos realizados
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[500px] border rounded-lg">
                <div className="p-3 space-y-2">
                  {disparos.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-64 text-slate-400 gap-2">
                      <Clock className="w-10 h-10 opacity-30" />
                      <p className="text-sm">Nenhum disparo realizado</p>
                    </div>
                  ) : (
                    disparos.map(d => (
                      <div
                        key={d.id}
                        className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-200 hover:bg-slate-100 transition-colors"
                      >
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 flex-shrink-0">
                            <Send className="w-4 h-4" />
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium text-sm text-slate-900">{d.cliente_nome || 'Cliente'}</p>
                            <p className="text-xs text-slate-500">{d.cliente_telefone}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 ml-4">
                          <span className="text-xs text-slate-500">
                            {new Date(d.created_date).toLocaleString('pt-BR')}
                          </span>
                          <Badge variant={d.status === 'enviada' ? 'default' : 'destructive'}>
                            {d.status === 'enviada' ? '✓ Enviada' : '✗ Erro'}
                          </Badge>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Dialog de Confirmação */}
      <Dialog open={confirmacaoOpen} onOpenChange={setConfirmacaoOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-amber-500" />
              Confirmar Disparo em Massa
            </DialogTitle>
            <DialogDescription>
              Você está prestes a enviar {destinatarios.length} mensagens via WhatsApp
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
              <p className="text-sm text-amber-800 font-semibold mb-2">
                ⚠️ Atenção
              </p>
              <ul className="text-xs text-amber-700 space-y-1 list-disc list-inside">
                <li>Esta ação enviará mensagens para <strong>{destinatarios.length}</strong> clientes</li>
                <li>Não é possível cancelar após o envio</li>
                <li>Cada mensagem será enviada individualmente</li>
                <li>O processo pode levar alguns minutos</li>
              </ul>
            </div>

            <div>
              <Label className="text-sm mb-2 block">Mensagem que será enviada:</Label>
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                <p className="text-sm text-slate-700 whitespace-pre-wrap">{mensagem}</p>
              </div>
            </div>

            {previewRecipients.length > 0 && (
              <div>
                <Label className="text-sm mb-2 block">Primeiros destinatários (mostrando 10):</Label>
                <ScrollArea className="h-32 border rounded-lg">
                  <div className="p-2 space-y-1">
                    {previewRecipients.map(c => (
                      <p key={c.id} className="text-xs text-slate-600">
                        {c.nome} - {c.telefone}
                      </p>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <Button variant="outline" onClick={() => setConfirmacaoOpen(false)}>
                Cancelar
              </Button>
              <Button
                onClick={() => executarDisparoMutation.mutate({ mensagem, destinatarios })}
                disabled={executarDisparoMutation.isPending}
                className="gap-2 bg-blue-600 hover:bg-blue-700"
              >
                {executarDisparoMutation.isPending ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Enviando...</>
                ) : (
                  <><Send className="w-4 h-4" /> Confirmar Envio</>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Chat popup */}
      <ChatPopupModal
        open={!!chatPopup}
        onOpenChange={(v) => !v && setChatPopup(null)}
        contato={chatPopup}
        empresaId={empresaId}
        user={user}
      />
    </div>
  );
}