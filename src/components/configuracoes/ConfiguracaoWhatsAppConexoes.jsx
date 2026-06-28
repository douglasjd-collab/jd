import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import PageHeader from '@/components/ui/PageHeader';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { 
  Plus, 
  Trash2, 
  Pencil, 
  Loader2, 
  Zap, 
  MessageSquare,
  QrCode,
  LogOut,
  RotateCcw,
  Send,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Eye,
  EyeOff,
  RefreshCw
} from 'lucide-react';
import { toast } from 'sonner';

export default function ConfiguracaoWhatsApp() {
  const [user, setUser] = useState(null);
  const [selectedConnection, setSelectedConnection] = useState(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [qrDialogOpen, setQrDialogOpen] = useState(false);
  const [testDialogOpen, setTestDialogOpen] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [qrCodeImage, setQrCodeImage] = useState(null);
  const [testingConnection, setTestingConnection] = useState(false);
  const [sessionStatus, setSessionStatus] = useState(null);
  const [pollingInterval, setPollingInterval] = useState(null);
  const [formData, setFormData] = useState({
    nome: '',
    provider_type: 'dapi',
    base_url: 'https://api.d-api.cloud',
    api_key: '',
    session_id: 'CRM JD',
    is_active: true,
    is_default: false
  });

  useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    try {
      const me = await base44.auth.me();
      setUser(me);
    } catch (error) {
      console.error('Erro ao carregar usuário:', error);
    }
  };

  const { data: connections = [], isLoading, refetch } = useQuery({
    queryKey: ['whatsapp-connections'],
    queryFn: async () => {
      if (!user?.empresa_id) return [];
      const all = await base44.entities.WhatsappConnection.filter({ empresa_id: user.empresa_id });
      return all.sort((a, b) => (b.is_default ? 1 : 0) - (a.is_default ? 1 : 0));
    },
    enabled: !!user?.empresa_id,
    refetchInterval: 10000 // Atualizar a cada 10 segundos
  });

  // Polling de status para sincronizar com D-API
  useEffect(() => {
    if (!connections || connections.length === 0) return;

    const checkStatusInterval = setInterval(async () => {
      connections.forEach(async (connection) => {
        if (connection.provider_type === 'dapi' && connection.is_active) {
          try {
            const response = await base44.functions.invoke('whatsappService', {
              connectionId: connection.id,
              action: 'getStatus'
            });

            const statusData = response.data;
            
            // Atualizar status no banco se mudou
            if (statusData.data && statusData.status !== connection.status) {
              await base44.entities.WhatsappConnection.update(connection.id, {
                status: statusData.status,
                phone_number: statusData.phoneNumber || connection.phone_number,
                last_health_check_at: new Date().toISOString()
              });
              refetch();
            }
          } catch (error) {
            console.error('Erro ao verificar status da conexão:', connection.nome, error);
          }
        }
      });
    }, 15000); // Verificar status a cada 15 segundos

    return () => clearInterval(checkStatusInterval);
  }, [connections, user?.empresa_id]);

  const queryClient = useQueryClient();

  const createMutation = useMutation({
    mutationFn: async (data) => {
      // Criptografar API Key (simples - em produção usar função de criptografia)
      const api_key_encrypted = btoa(data.api_key);
      
      return await base44.entities.WhatsappConnection.create({
        ...data,
        empresa_id: user.empresa_id,
        api_key_encrypted,
        api_key: undefined
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-connections'] });
      toast.success('Conexão criada com sucesso!');
      setEditDialogOpen(false);
      resetForm();
    },
    onError: (error) => {
      toast.error('Erro ao criar conexão: ' + error.message);
    }
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }) => {
      const updateData = { ...data };
      
      if (data.api_key && data.api_key !== '***hidden***') {
        updateData.api_key_encrypted = btoa(data.api_key);
        updateData.api_key = undefined;
      } else {
        delete updateData.api_key;
      }
      
      return await base44.entities.WhatsappConnection.update(id, updateData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-connections'] });
      toast.success('Conexão atualizada com sucesso!');
      setEditDialogOpen(false);
      resetForm();
    },
    onError: (error) => {
      toast.error('Erro ao atualizar conexão: ' + error.message);
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (id) => {
      return await base44.entities.WhatsappConnection.delete(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-connections'] });
      toast.success('Conexão removida com sucesso!');
    },
    onError: (error) => {
      toast.error('Erro ao remover conexão: ' + error.message);
    }
  });

  const testConnectionMutation = useMutation({
    mutationFn: async (connectionId) => {
      setTestingConnection(true);
      try {
        const response = await base44.functions.invoke('whatsappService', {
          connectionId,
          action: 'healthCheck'
        });
        return response.data;
      } finally {
        setTestingConnection(false);
      }
    },
    onSuccess: (data) => {
      console.log('Health check result:', data);
      if (data.success && data.data?.success) {
        toast.success('D-API online e respondendo corretamente!');
      } else {
        const errorMsg = data.data?.error || data.data?.responseData?.message || data.error || 'Erro desconhecido';
        toast.error('Erro ao testar conexão: ' + errorMsg);
      }
      refetch();
    },
    onError: (error) => {
      toast.error('Erro ao testar conexão: ' + error.message);
    }
  });

  const createSessionMutation = useMutation({
    mutationFn: async ({ connectionId, webhookUrl }) => {
      const response = await base44.functions.invoke('whatsappService', {
        connectionId,
        action: 'createSession',
        webhookUrl
      });
      return response.data;
    },
    onSuccess: (data) => {
      console.log('Create session result:', data);
      if (data.success) {
        const msg = data.data?.exists ? 'Sessão já existe' : 'Sessão criada com sucesso!';
        toast.success(msg);
      } else {
        const errorMsg = data.data?.error || data.data?.responseData?.message || data.error || 'Erro desconhecido';
        toast.error('Erro ao criar sessão: ' + errorMsg);
      }
      refetch();
    },
    onError: (error) => {
      toast.error('Erro ao criar sessão: ' + error.message);
    }
  });

  const getQrCodeMutation = useMutation({
    mutationFn: async (connectionId) => {
      const response = await base44.functions.invoke('whatsappService', {
        connectionId,
        action: 'getQr'
      });
      return response.data;
    },
    onSuccess: (data) => {
      console.log('Get QR result:', data);
      if (data.success && (data.base64 || data.qrCode)) {
        // Se vier como base64 direto ou precisar converter
        setQrCodeImage(data.base64 || `data:image/png;base64,${data.qrCode}`);
        setQrDialogOpen(true);
      } else {
        const errorMsg = data.message || 'QR Code não disponível. Sessão pode estar conectada ou expirada.';
        toast.error(errorMsg);
      }
      refetch();
    },
    onError: (error) => {
      toast.error('Erro ao obter QR Code: ' + error.message);
    }
  });

  const disconnectMutation = useMutation({
    mutationFn: async (connectionId) => {
      const response = await base44.functions.invoke('whatsappService', {
        connectionId,
        action: 'disconnect'
      });
      return response.data;
    },
    onSuccess: (data) => {
      if (data.success) {
        toast.success('Conexão desconectada com sucesso!');
      } else {
        toast.error('Erro ao desconectar: ' + (data.data?.error || data.error || 'Erro desconhecido'));
      }
      refetch();
    },
    onError: (error) => {
      toast.error('Erro ao desconectar: ' + error.message);
    }
  });

  const reconnectMutation = useMutation({
    mutationFn: async (connectionId) => {
      const response = await base44.functions.invoke('whatsappService', {
        connectionId,
        action: 'reconnect'
      });
      return response.data;
    },
    onSuccess: (data) => {
      if (data.success) {
        toast.success('Sessão reconectando...');
      } else {
        toast.error('Erro ao reconectar: ' + (data.data?.error || data.error || 'Erro desconhecido'));
      }
      refetch();
    },
    onError: (error) => {
      toast.error('Erro ao reconectar: ' + error.message);
    }
  });

  const resetForm = () => {
    setFormData({
      nome: '',
      provider_type: 'dapi',
      base_url: 'https://api.d-api.cloud',
      api_key: '',
      session_id: 'CRM JD',
      is_active: true,
      is_default: false
    });
    setSelectedConnection(null);
  };

  const handleEdit = (connection) => {
    setSelectedConnection(connection);
    setFormData({
      nome: connection.nome,
      provider_type: connection.provider_type,
      base_url: connection.base_url || 'https://api.d-api.cloud',
      api_key: '***hidden***',
      session_id: connection.session_id || 'CRM JD',
      is_active: connection.is_active,
      is_default: connection.is_default
    });
    setEditDialogOpen(true);
  };

  const handleSave = () => {
    if (!formData.nome || !formData.api_key) {
      toast.error('Preencha todos os campos obrigatórios');
      return;
    }

    if (selectedConnection) {
      updateMutation.mutate({ id: selectedConnection.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const handleDelete = (id) => {
    if (window.confirm('Tem certeza que deseja remover esta conexão?')) {
      deleteMutation.mutate(id);
    }
  };

  const handleTest = (connectionId) => {
    testConnectionMutation.mutate(connectionId);
  };

  const handleCreateSession = (connection) => {
    const webhookUrl = `${window.location.origin}/api/webhooks/whatsapp/d-api/${connection.id}`;
    createSessionMutation.mutate({ connectionId: connection.id, webhookUrl });
  };

  const handleGetQrCode = (connectionId) => {
    getQrCodeMutation.mutate(connectionId);
    // Iniciar polling de status
    if (pollingInterval) {
      clearInterval(pollingInterval);
    }
    const interval = setInterval(async () => {
      try {
        const response = await base44.functions.invoke('whatsappService', {
          connectionId,
          action: 'getStatus'
        });
        const statusData = response.data;
        setSessionStatus(statusData.data);
        
        // Se conectou, parar polling e fechar modal
        if (statusData.connected) {
          clearInterval(interval);
          toast.success('WhatsApp conectado com sucesso!');
          setQrDialogOpen(false);
          refetch();
        }
      } catch (error) {
        console.error('Erro ao verificar status:', error);
      }
    }, 3000); // Verificar a cada 3 segundos
    setPollingInterval(interval);
  };

  const handleDisconnect = (connectionId) => {
    if (window.confirm('Deseja desconectar esta instância?')) {
      disconnectMutation.mutate(connectionId);
    }
  };

  const handleReconnect = (connectionId) => {
    reconnectMutation.mutate(connectionId);
  };

  const handleRefreshStatus = async (connection) => {
    try {
      const response = await base44.functions.invoke('whatsappService', {
        connectionId: connection.id,
        action: 'getStatus'
      });
      
      const statusData = response.data;
      console.log('Status atualizado:', statusData);
      
      // Atualizar no banco de dados
      if (statusData.data) {
        await base44.entities.WhatsappConnection.update(connection.id, {
          status: statusData.status,
          phone_number: statusData.phoneNumber || connection.phone_number,
          last_health_check_at: new Date().toISOString()
        });
        
        toast.success(`Status atualizado: ${statusData.status}`);
        refetch();
      }
    } catch (error) {
      toast.error('Erro ao atualizar status: ' + error.message);
    }
  };

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollingInterval) {
        clearInterval(pollingInterval);
      }
    };
  }, [pollingInterval]);

  const getStatusBadge = (status) => {
    const statusConfig = {
      conectado: { color: 'bg-green-500', label: 'Conectado' },
      desconectado: { color: 'bg-slate-500', label: 'Desconectado' },
      aguardando_qr: { color: 'bg-yellow-500', label: 'Aguardando QR' },
      erro_envio: { color: 'bg-red-500', label: 'Erro Envio' },
      erro_recebimento: { color: 'bg-red-500', label: 'Erro Recebimento' },
      api_offline: { color: 'bg-red-500', label: 'API Offline' },
      reiniciando: { color: 'bg-blue-500', label: 'Reiniciando' }
    };

    const config = statusConfig[status] || statusConfig.desconectado;

    return (
      <Badge className={`${config.color} text-white`}>
        {config.label}
      </Badge>
    );
  };

  const isAdmin = user?.perfil === 'master' || user?.perfil === 'super_admin' || user?.perfil === 'admin';

  if (!isAdmin) {
    return (
      <div className="space-y-6">
        <PageHeader title="WhatsApp" subtitle="Configurações de WhatsApp" />
        <Card>
          <CardContent className="p-6">
            <p className="text-slate-600">Apenas administradores podem acessar esta página.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="WhatsApp" subtitle="Gerencie suas conexões WhatsApp" />

      {/* Lista de Conexões */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Conexões WhatsApp</CardTitle>
            <CardDescription>
              Configure e gerencie suas conexões com diferentes provedores
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => refetch()}>
              <RefreshCw className="w-4 h-4 mr-2" />
              Atualizar
            </Button>
            <Button onClick={() => { resetForm(); setEditDialogOpen(true); }}>
              <Plus className="w-4 h-4 mr-2" />
              Nova Conexão
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center p-8">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          ) : connections.length === 0 ? (
            <div className="text-center p-8 text-slate-500">
              <MessageSquare className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p>Nenhuma conexão configurada</p>
              <p className="text-sm">Clique em "Nova Conexão" para começar</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Session ID</TableHead>
                  <TableHead>Telefone</TableHead>
                  <TableHead>Padrão</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {connections.map((connection) => (
                  <TableRow key={connection.id}>
                    <TableCell className="font-medium">{connection.nome}</TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {connection.provider_type === 'dapi' ? 'D-API' : 
                         connection.provider_type === 'evolution' ? 'Evolution' : 
                         connection.provider_type === 'meta_oficial' ? 'Meta Oficial' : connection.provider_type}
                      </Badge>
                    </TableCell>
                    <TableCell>{getStatusBadge(connection.status)}</TableCell>
                    <TableCell className="font-mono text-sm">{connection.session_id || '-'}</TableCell>
                    <TableCell>{connection.phone_number || '-'}</TableCell>
                    <TableCell>
                      {connection.is_default && <CheckCircle2 className="w-4 h-4 text-green-600" />}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleRefreshStatus(connection)}
                          title="Atualizar status"
                        >
                          <RefreshCw className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleTest(connection.id)}
                          title="Testar conexão"
                        >
                          <Zap className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleReconnect(connection.id)}
                          title="Reiniciar sessão"
                        >
                          <RotateCcw className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleGetQrCode(connection.id)}
                          title="Gerar QR Code"
                        >
                          <QrCode className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleCreateSession(connection)}
                          title="Criar sessão"
                        >
                          <Send className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDisconnect(connection.id)}
                          title="Desconectar"
                        >
                          <LogOut className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleEdit(connection)}
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDelete(connection.id)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Dialog de Edição */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {selectedConnection ? 'Editar Conexão WhatsApp' : 'Nova Conexão WhatsApp'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Nome da conexão *</Label>
                <Input
                  value={formData.nome}
                  onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                  placeholder="Ex: CRM JD"
                  className="mt-2"
                />
              </div>
              <div>
                <Label>Tipo da API *</Label>
                <Select
                  value={formData.provider_type}
                  onValueChange={(value) => setFormData({ ...formData, provider_type: value })}
                >
                  <SelectTrigger className="mt-2">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="dapi">D-API</SelectItem>
                    <SelectItem value="evolution">Evolution API</SelectItem>
                    <SelectItem value="meta_oficial">Meta Oficial</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label>URL Base *</Label>
              <Input
                value={formData.base_url}
                onChange={(e) => setFormData({ ...formData, base_url: e.target.value })}
                placeholder="https://api.d-api.cloud"
                className="mt-2"
              />
            </div>

            <div>
              <Label>API Key *</Label>
              <div className="flex gap-2 mt-2">
                <Input
                  type={showApiKey ? 'text' : 'password'}
                  value={formData.api_key}
                  onChange={(e) => setFormData({ ...formData, api_key: e.target.value })}
                  placeholder="Sua API Key"
                  className="flex-1"
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setShowApiKey(!showApiKey)}
                >
                  {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </Button>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                A API Key será criptografada e armazenada com segurança
              </p>
            </div>

            <div>
              <Label>Session ID</Label>
              <Input
                value={formData.session_id}
                onChange={(e) => setFormData({ ...formData, session_id: e.target.value })}
                placeholder="CRM JD"
                className="mt-2"
              />
            </div>

            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="is_active"
                  checked={formData.is_active}
                  onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                  className="w-4 h-4"
                />
                <Label htmlFor="is_active">Ativo</Label>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="is_default"
                  checked={formData.is_default}
                  onChange={(e) => setFormData({ ...formData, is_default: e.target.checked })}
                  className="w-4 h-4"
                />
                <Label htmlFor="is_default">Conexão padrão</Label>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={createMutation.isPending || updateMutation.isPending}>
              {createMutation.isPending || updateMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <Plus className="w-4 h-4 mr-2" />
              )}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog QR Code */}
      <Dialog open={qrDialogOpen} onOpenChange={(open) => {
        setQrDialogOpen(open);
        if (!open && pollingInterval) {
          clearInterval(pollingInterval);
          setPollingInterval(null);
        }
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Conectar WhatsApp</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center justify-center p-4">
            {qrCodeImage ? (
              <img src={qrCodeImage} alt="QR Code" className="w-64 h-64 object-contain" />
            ) : (
              <div className="w-64 h-64 flex items-center justify-center bg-slate-100 rounded-lg">
                <Loader2 className="w-8 h-8 animate-spin" />
              </div>
            )}
            
            {/* Status da sessão */}
            {sessionStatus && (
              <div className="mt-4 w-full">
                <Badge className={sessionStatus.connected ? 'bg-green-500' : 'bg-yellow-500'}>
                  {sessionStatus.connected ? 'Conectado' : sessionStatus.dapiStatus || 'Aguardando...'}
                </Badge>
                {sessionStatus.phoneNumber && (
                  <p className="text-xs text-slate-600 mt-2">
                    Telefone: {sessionStatus.phoneNumber}
                  </p>
                )}
              </div>
            )}
            
            <p className="text-sm text-slate-600 mt-4 text-center">
              Abra o WhatsApp &gt; Aparelhos conectados &gt; Conectar aparelho
            </p>
          </div>
          <DialogFooter className="gap-2">
            <Button 
              variant="outline" 
              onClick={() => handleGetQrCode(selectedConnection?.id)}
              disabled={!qrCodeImage}
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Atualizar QR Code
            </Button>
            <Button onClick={() => setQrDialogOpen(false)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}