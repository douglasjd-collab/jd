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
  const [debugDialogOpen, setDebugDialogOpen] = useState(false);
  const [debugData, setDebugData] = useState(null);
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
            
            // Atualizar status no banco se foi retornado e é válido
            if (statusData && statusData.status && statusData.status !== 'undefined') {
              const needsUpdate = statusData.status !== connection.status ||
                                 (statusData.phoneNumber && statusData.phoneNumber !== connection.phone_number);
              
              if (needsUpdate) {
                const updateData = {
                  status: statusData.status,
                  last_health_check_at: new Date().toISOString()
                };
                
                if (statusData.phoneNumber) {
                  updateData.phone_number = statusData.phoneNumber;
                }
                
                if (statusData.profileName) {
                  updateData.profile_name = statusData.profileName;
                }
                
                await base44.entities.WhatsappConnection.update(connection.id, updateData);
                refetch();
              }
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
      // Validar e limpar API Key antes de salvar
      const apiKeyClean = (data.api_key || '').trim();
      
      // Validar formato UUID (opcional, mas recomendado para D-API)
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(apiKeyClean)) {
        console.warn('⚠️ API Key não parece ser UUID válido');
      }
      
      // Criptografar API Key em base64
      const api_key_encrypted = btoa(apiKeyClean);
      
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
        // Validar e limpar API Key antes de salvar
        const apiKeyClean = (data.api_key || '').trim();
        
        // Validar formato UUID (opcional, mas recomendado para D-API)
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(apiKeyClean)) {
          console.warn('⚠️ API Key não parece ser UUID válido');
        }
        
        updateData.api_key_encrypted = btoa(apiKeyClean);
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

  const updateWebhookMutation = useMutation({
    mutationFn: async ({ connectionId, webhookUrl }) => {
      const response = await base44.functions.invoke('whatsappService', {
        connectionId,
        action: 'updateWebhook',
        webhookUrl
      });
      return response.data;
    },
    onSuccess: async (data) => {
      console.log('Update webhook result:', data);
      if (data.success) {
        toast.success('Webhook atualizado com sucesso!');
        // Atualizar status para confirmar webhook configurado
        const connection = connections.find(c => c.id === data.data?.session?.id);
        if (connection) {
          await handleRefreshStatus(connection);
        }
      } else {
        const errorMsg = data.data?.error || data.data?.responseData?.message || data.error || 'Erro desconhecido';
        toast.error('Erro ao atualizar webhook: ' + errorMsg);
      }
      refetch();
    },
    onError: (error) => {
      toast.error('Erro ao atualizar webhook: ' + error.message);
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
    // URL pública do webhook do CRM para receber eventos da D-API
    const webhookUrl = `${window.location.origin}/functions/receberWebhookDapi`;
    
    console.log('🔗 Criando sessão com webhook:', {
      connectionId: connection.id,
      connectionNome: connection.nome,
      sessionId: connection.session_id,
      webhookUrl
    });
    
    createSessionMutation.mutate({ connectionId: connection.id, webhookUrl });
  };

  const handleGetQrCode = async (connectionId) => {
    // Primeiro verificar status para ver se sessão existe
    try {
      const statusResponse = await base44.functions.invoke('whatsappService', {
        connectionId,
        action: 'getStatus'
      });
      
      const statusData = statusResponse.data;
      
      // Se sessão não existe (404 ou erro), criar primeiro
      if (!statusData.success || statusData.httpStatus === 404) {
        console.log('⚠️ Sessão não existe, criando...');
        const connection = connections.find(c => c.id === connectionId);
        if (connection) {
          const webhookUrl = `${window.location.origin}/functions/receberWebhookDapi`;
          await base44.functions.invoke('whatsappService', {
            connectionId,
            action: 'createSession',
            webhookUrl
          });
          toast.success('Sessão criada! Gerando QR Code...');
        }
      }
    } catch (error) {
      console.error('Erro ao verificar status:', error);
    }
    
    // Agora buscar QR Code
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
        console.log('Polling QR Status:', statusData);
        
        // Usar o status retornado
        if (statusData && statusData.status) {
          setSessionStatus({
            connected: statusData.connected || statusData.status === 'conectado',
            dapiStatus: statusData.dapiStatus,
            status: statusData.status,
            phoneNumber: statusData.phoneNumber
          });
          
          // Se conectou, parar polling e fechar modal
          if (statusData.connected || statusData.status === 'conectado') {
            clearInterval(interval);
            toast.success('WhatsApp conectado com sucesso!');
            setQrDialogOpen(false);
            refetch();
          }
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

  const handleUpdateWebhook = async (connection) => {
    const webhookUrl = `${window.location.origin}/functions/receberWebhookDapi`;
    
    try {
      const response = await base44.functions.invoke('whatsappService', {
        connectionId: connection.id,
        action: 'updateWebhook',
        webhookUrl
      });
      
      const result = response.data;
      console.log('Resultado atualização webhook:', result);
      
      if (result.success) {
        toast.success('Webhook atualizado com sucesso!');
        
        // Atualizar webhook no banco
        await base44.entities.WhatsappConnection.update(connection.id, {
          webhook_url: webhookUrl
        });
        
        // Verificar status após atualização
        const statusResponse = await base44.functions.invoke('whatsappService', {
          connectionId: connection.id,
          action: 'getStatus'
        });
        
        const statusData = statusResponse.data;
        console.log('Status após webhook:', statusData);
        
        // Mostrar resultado no debug
        const debugInfo = {
          connectionNome: connection.nome,
          sessionId: connection.session_id,
          endpoint: statusData.endpoint || 'N/A',
          httpStatus: statusData.httpStatus || 'N/A',
          statusCRM: statusData.status || 'undefined',
          statusDapi: statusData.dapiStatus || statusData.status || 'N/A',
          connected: statusData.connected,
          phoneNumber: statusData.phoneNumber,
          profileName: statusData.profileName,
          webhookUrl: statusData.webhookUrl,
          webhookConfigurado: !!statusData.webhookUrl,
          errorMessage: statusData.errorMessage || statusData.error,
          traceId: statusData.traceId || statusData.responseData?.traceId,
          responseCompleta: statusData
        };
        setDebugData(debugInfo);
        setDebugDialogOpen(true);
        
        // Atualizar status no banco
        const updateData = {
          status: statusData.status,
          last_health_check_at: new Date().toISOString()
        };
        
        if (statusData.phoneNumber) {
          updateData.phone_number = statusData.phoneNumber;
        }
        
        if (statusData.profileName) {
          updateData.profile_name = statusData.profileName;
        }
        
        await base44.entities.WhatsappConnection.update(connection.id, updateData);
        refetch();
      } else {
        const errorMsg = result.data?.error || result.error || 'Erro desconhecido';
        toast.error('Erro ao atualizar webhook: ' + errorMsg);
      }
    } catch (error) {
      console.error('Erro ao atualizar webhook:', error);
      toast.error('Erro ao atualizar webhook: ' + (error.message || 'Erro desconhecido'));
    }
  };

  const handleRefreshStatus = async (connection) => {
    try {
      const response = await base44.functions.invoke('whatsappService', {
        connectionId: connection.id,
        action: 'getStatus'
      });
      
      const statusData = response.data;
      console.log('Status atualizado:', statusData);
      
      // Salvar dados de debug para exibição - estrutura correta
      const debugInfo = {
        connectionNome: connection.nome,
        sessionId: connection.session_id,
        endpoint: statusData.endpoint || 'N/A',
        httpStatus: statusData.httpStatus || 'N/A',
        statusCRM: statusData.status || 'undefined',
        statusDapi: statusData.dapiStatus || statusData.status || 'N/A',
        connected: statusData.connected,
        phoneNumber: statusData.phoneNumber,
        profileName: statusData.profileName,
        webhookUrl: statusData.webhookUrl,
        webhookConfigurado: !!statusData.webhookUrl,
        errorMessage: statusData.errorMessage || statusData.error,
        traceId: statusData.traceId || statusData.responseData?.traceId,
        attempt: statusData.attempt,
        responseCompleta: statusData
      };
      setDebugData(debugInfo);
      setDebugDialogOpen(true);
      
      // Validar status retornado e mostrar erro claro
      if (statusData.httpStatus === 401) {
        toast.error(
          `API Key inválida (HTTP 401). ` +
          `Verifique se a chave cadastrada está correta (6de82303-9c7e-4fef-9732-f00568f6088d), ` +
          `sem espaços, sem "Bearer", e salve novamente.`
        );
      } else if (statusData.httpStatus === 500) {
        const traceId = statusData.traceId || statusData.responseData?.traceId || 'N/A';
        toast.error(
          `Erro interno da D-API. HTTP 500. TraceId: ${traceId}. ` +
          `Contate suporte D-API com o traceId.`
        );
      } else if (!statusData || !statusData.status || statusData.status === 'undefined') {
        console.error('Status inválido retornado:', statusData);
        toast.error(
          `Status não identificado. HTTP: ${statusData?.httpStatus || 'N/A'}. ` +
          `Verifique modal de diagnóstico.`
        );
      }
      
      // Atualizar no banco de dados
      const updateData = {
        status: statusData.status,
        last_health_check_at: new Date().toISOString()
      };
      
      if (statusData.phoneNumber) {
        updateData.phone_number = statusData.phoneNumber;
      }
      
      if (statusData.profileName) {
        updateData.profile_name = statusData.profileName;
      }
      
      if (statusData.errorMessage) {
        updateData.last_error_message = statusData.errorMessage;
      }
      
      await base44.entities.WhatsappConnection.update(connection.id, updateData);
      
      // Mapear status para exibição amigável
      const statusMap = {
        conectado: 'Conectado',
        desconectado: 'Desconectado',
        aguardando_qr: 'Aguardando QR Code',
        reiniciando: 'Conectando',
        erro_recebimento: 'Erro',
        erro_envio: 'Erro de Envio',
        api_offline: 'API Offline'
      };
      
      const statusExibicao = statusMap[statusData.status] || 'Desconhecido';
      toast.success(`Status atualizado: ${statusExibicao}`);
      refetch();
    } catch (error) {
      console.error('Erro ao atualizar status:', error);
      toast.error('Erro ao atualizar status: ' + (error.message || 'Erro desconhecido'));
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
                          onClick={() => handleUpdateWebhook(connection)}
                          title="Atualizar Webhook"
                        >
                          <Zap className="w-4 h-4" />
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
                <Badge className={
                  sessionStatus.connected || sessionStatus.status === 'conectado' ? 'bg-green-500' :
                  sessionStatus.status === 'aguardando_qr' ? 'bg-yellow-500' :
                  sessionStatus.status === 'reiniciando' ? 'bg-blue-500' :
                  'bg-red-500'
                }>
                  {sessionStatus.connected || sessionStatus.status === 'conectado' ? 'Conectado' :
                   sessionStatus.status === 'aguardando_qr' ? 'Aguardando QR Code' :
                   sessionStatus.status === 'reiniciando' ? 'Conectando' :
                   sessionStatus.dapiStatus || 'Aguardando...'}
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

      {/* Dialog Debug Status */}
      <Dialog open={debugDialogOpen} onOpenChange={setDebugDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-hidden">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-blue-500" />
              Diagnóstico Status D-API
            </DialogTitle>
          </DialogHeader>
          <div className="mt-4 space-y-4 max-h-[60vh] overflow-y-auto">
            {debugData && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-slate-500">Conexão</p>
                    <p className="font-medium">{debugData.connectionNome}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Session ID</p>
                    <p className="font-mono text-sm">{debugData.sessionId}</p>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div className="p-3 rounded-lg bg-slate-100">
                    <p className="text-xs text-slate-500">HTTP Status</p>
                    <p className={`font-bold ${debugData.httpStatus === 200 ? 'text-green-600' : 'text-red-600'}`}>
                      {debugData.httpStatus}
                    </p>
                  </div>
                  <div className="p-3 rounded-lg bg-slate-100">
                    <p className="text-xs text-slate-500">Status CRM</p>
                    <p className="font-bold text-slate-800">{debugData.statusCRM}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-slate-100">
                    <p className="text-xs text-slate-500">Status D-API</p>
                    <p className="font-bold text-slate-800">{debugData.statusDapi}</p>
                  </div>
                </div>

                {debugData.attempt && (
                  <div className="p-3 rounded-lg bg-blue-50 border border-blue-200">
                    <p className="text-xs text-blue-700">Endpoint Usado</p>
                    <p className="font-medium text-blue-900">Tentativa {debugData.attempt} de 3</p>
                  </div>
                )}

                {debugData.traceId && (
                  <div className="p-3 rounded-lg bg-yellow-50 border border-yellow-200">
                    <p className="text-xs text-yellow-700">TraceId (Suporte D-API)</p>
                    <p className="font-mono text-sm text-yellow-900">{debugData.traceId}</p>
                  </div>
                )}

                {debugData.phoneNumber && (
                  <div className="p-3 rounded-lg bg-green-50 border border-green-200">
                    <p className="text-xs text-green-700">Telefone</p>
                    <p className="font-medium text-green-900">{debugData.phoneNumber}</p>
                  </div>
                )}

                {debugData.profileName && (
                  <div className="p-3 rounded-lg bg-blue-50 border border-blue-200">
                    <p className="text-xs text-blue-700">Nome do Perfil</p>
                    <p className="font-medium text-blue-900">{debugData.profileName}</p>
                  </div>
                )}

                {debugData.webhookConfigurado && (
                  <div className="p-3 rounded-lg bg-green-50 border border-green-200">
                    <p className="text-xs text-green-700">Webhook Configurado</p>
                    <p className="font-mono text-xs text-green-900 break-all">{debugData.webhookUrl}</p>
                  </div>
                )}

                {!debugData.webhookConfigurado && debugData.httpStatus === 200 && (
                  <div className="p-3 rounded-lg bg-yellow-50 border border-yellow-200">
                    <p className="text-xs text-yellow-700">⚠️ Webhook Não Configurado</p>
                    <p className="font-medium text-yellow-900">Clique no botão "Atualizar Webhook" para configurar</p>
                  </div>
                )}

                {debugData.errorMessage && (
                  <div className="p-3 rounded-lg bg-red-50 border border-red-200">
                    <p className="text-xs text-red-700">Erro</p>
                    <p className="font-medium text-red-900">{debugData.errorMessage}</p>
                  </div>
                )}

                <div>
                  <p className="text-xs text-slate-500 mb-2">Endpoint Chamado</p>
                  <code className="block p-3 bg-slate-100 rounded text-xs font-mono text-slate-700 break-all">
                    {debugData.endpoint}
                  </code>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs text-slate-500">Resposta Completa da D-API</p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        navigator.clipboard.writeText(JSON.stringify(debugData.responseCompleta, null, 2));
                        toast.success('Resposta copiada!');
                      }}
                    >
                      Copiar JSON
                    </Button>
                  </div>
                  <pre className="block p-3 bg-slate-900 rounded text-xs font-mono text-green-400 overflow-auto max-h-64">
                    {JSON.stringify(debugData.responseCompleta, null, 2)}
                  </pre>
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button onClick={() => setDebugDialogOpen(false)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}