import React, { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { 
  Activity, 
  CheckCircle2, 
  AlertCircle, 
  XCircle, 
  RefreshCw, 
  Wifi, 
  WifiOff,
  MessageSquare,
  QrCode,
  Settings,
  Trash2,
  Plus,
  Loader2,
  Eye,
  TestTube,
  Facebook,
  LayoutGrid
} from 'lucide-react';
import { toast } from 'sonner';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export default function MonitoramentoInstancias() {
  const [instancias, setInstancias] = useState([]);
  const [loading, setLoading] = useState(true);
  const [testeEnvio, setTesteEnvio] = useState({ open: false, instancia: null, telefone: '' });
  const [testando, setTestando] = useState(false);
  const [empresa, setEmpresa] = useState(null);

  const carregarEmpresa = useCallback(async () => {
    try {
      const me = await base44.auth.me();
      const colabs = await base44.entities.Colaborador.filter({ user_id: me.id, status: 'ativo' });
      const empId = colabs?.[0]?.empresa_id || me.empresa_id;
      if (empId) {
        const emps = await base44.entities.Empresa.filter({ id: empId });
        if (emps && emps.length > 0) setEmpresa(emps[0]);
      }
    } catch (e) {
      console.error('Erro ao carregar empresa:', e);
    }
  }, []);

  useEffect(() => {
    carregarEmpresa();
  }, [carregarEmpresa]);

  const metaConectado = !!(empresa?.whatsapp_access_token && empresa?.whatsapp_phone_number_id);

  const desconectarMeta = async () => {
    if (!empresa?.id) return;
    if (!window.confirm('Desconectar a API Oficial da Meta?')) return;
    try {
      await base44.entities.Empresa.update(empresa.id, {
        whatsapp_access_token: '',
        whatsapp_phone_number_id: '',
        whatsapp_business_account_id: '',
        whatsapp_token_tipo: 'temporario',
        meta_phone_status: '',
        meta_display_phone_number: '',
        meta_verified_name: '',
        meta_quality_rating: '',
      });
      toast.success('Conexão Meta desconectada.');
      carregarEmpresa();
    } catch (e) {
      toast.error('Erro ao desconectar: ' + e.message);
    }
  };

  const carregarInstancias = useCallback(async () => {
    setLoading(true);
    try {
      const configs = await base44.entities.ConfiguracaoSistema.filter({ 
        chave: { $regex: 'evolution_.*_status' } 
      });
      
      const dados = configs.map(c => {
        try {
          const status = JSON.parse(c.valor || '{}');
          const instancia = c.chave.replace('evolution_', '').replace('_status', '');
          return {
            id: c.id,
            instancia,
            ...status,
            chave: c.chave,
          };
        } catch {
          return null;
        }
      }).filter(Boolean);

      setInstancias(dados);
    } catch (e) {
      console.error('Erro ao carregar instâncias:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    carregarInstancias();
    const interval = setInterval(carregarInstancias, 30000); // Atualizar a cada 30s
    return () => clearInterval(interval);
  }, [carregarInstancias]);

  const testarEnvio = async () => {
    if (!testeEnvio.instancia || !testeEnvio.telefone) {
      toast.error('Preencha o telefone para teste');
      return;
    }

    setTestando(true);
    try {
      const resp = await base44.functions.invoke('testarConexaoEvolution', {
        instancia: testeEnvio.instancia,
        telefone: testeEnvio.telefone,
      });

      if (resp.data.success) {
        toast.success('✅ Mensagem de teste enviada com sucesso!');
        setTesteEnvio({ open: false, instancia: null, telefone: '' });
        carregarInstancias();
      } else {
        toast.error('❌ Falha no envio: ' + (resp.data.error || 'Erro desconhecido'));
      }
    } catch (e) {
      toast.error('Erro ao testar: ' + e.message);
    } finally {
      setTestando(false);
    }
  };

  const reconectar = async (instancia) => {
    try {
      const resp = await base44.functions.invoke('desconectarWhatsappEvolution', {
        instancia,
      });
      toast.success('Instância desconectada. Escaneie o QR Code para reconectar.');
      carregarInstancias();
    } catch (e) {
      toast.error('Erro ao desconectar: ' + e.message);
    }
  };

  const limparStatus = async (id, chave) => {
    if (!confirm('Limpar o status desta instância?')) return;
    try {
      await base44.entities.ConfiguracaoSistema.delete(id);
      toast.success('Status limpo!');
      carregarInstancias();
    } catch (e) {
      toast.error('Erro ao limpar: ' + e.message);
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'operacional': return 'bg-green-500';
      case 'instavel': return 'bg-yellow-500';
      case 'falhando': return 'bg-red-500';
      case 'offline': return 'bg-slate-500';
      default: return 'bg-slate-400';
    }
  };

  const getQrStatus = (qr) => {
    switch (qr) {
      case 'conectado': return { icon: CheckCircle2, color: 'text-green-600', label: 'Conectado' };
      case 'aguardando_leitura': return { icon: QrCode, color: 'text-yellow-600', label: 'Aguardando QR' };
      case 'necessario_reconectar': return { icon: AlertCircle, color: 'text-red-600', label: 'Reconectar' };
      default: return { icon: WifiOff, color: 'text-slate-400', label: 'Desconhecido' };
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <LayoutGrid className="w-6 h-6 text-emerald-600" />
            Instâncias WhatsApp
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Acompanhe o status da sua conexão com a API Oficial Meta
          </p>
        </div>
        <Button onClick={() => { carregarInstancias(); carregarEmpresa(); }} variant="outline" size="sm">
          <RefreshCw className="w-4 h-4 mr-2" />
          Atualizar
        </Button>
      </div>

      {/* Barra de resumo */}
      <div className="text-sm text-slate-700">
        Conectadas: <strong className="text-emerald-700">
          {instancias.filter(i => i.status_envio === 'operacional').length + (metaConectado ? 1 : 0)}
        </strong> | Conectando: <strong className="text-yellow-600">
          {instancias.filter(i => i.status_envio === 'instavel').length}
        </strong> | Desconectadas: <strong className="text-red-600">
          {instancias.filter(i => i.status_envio === 'falhando' || i.status_envio === 'offline').length}
        </strong>
      </div>

      {/* Instância WhatsApp Oficial Meta (Coexistência) */}
      {metaConectado && (
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-b border-slate-100">
            <div className="flex items-center gap-3 min-w-0">
              <Facebook className="w-5 h-5 text-blue-600 flex-shrink-0" />
              <div className="min-w-0">
                <p className="font-bold text-slate-900 truncate flex items-center gap-2 flex-wrap">
                  WhatsApp Oficial - Coexistência
                  <Badge className="bg-emerald-700 text-white">API Oficial - Coexistente</Badge>
                </p>
                <p className="text-xs text-slate-600 mt-0.5">
                  {empresa?.meta_display_phone_number || empresa?.whatsapp_phone_number_id || '-'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <Badge className="bg-green-500 text-white gap-1">
                <CheckCircle2 className="w-3 h-3" /> Conectado
              </Badge>
              <Button variant="ghost" size="icon" onClick={carregarEmpresa} title="Atualizar">
                <RefreshCw className="w-4 h-4 text-slate-600" />
              </Button>
              <Button variant="ghost" size="icon" onClick={desconectarMeta} title="Desconectar">
                <Trash2 className="w-4 h-4 text-red-600" />
              </Button>
            </div>
          </div>

          <div className="bg-emerald-50/60 p-4 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
              <div>
                <p className="text-xs font-semibold uppercase text-slate-500">NOME</p>
                <p className="font-medium text-slate-800">WhatsApp Oficial - Coexistência</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase text-slate-500">STATUS</p>
                <p className="font-medium text-emerald-700">Conectado</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase text-slate-500">NÚMERO</p>
                <p className="font-medium text-slate-800">
                  {empresa?.meta_display_phone_number || empresa?.whatsapp_phone_number_id || '-'}
                </p>
              </div>
            </div>
            <div className="text-sm space-y-1">
              <p className="text-emerald-700 font-medium">
                Conectado via login Facebook — credenciais automáticas
              </p>
              <p className="text-slate-700">WABA: {empresa?.whatsapp_business_account_id || '-'}</p>
              <p className="text-slate-700">Phone ID: {empresa?.whatsapp_phone_number_id || '-'}</p>
              <p className="text-slate-500 text-xs">
                Gerencie a conexão no painel 'WhatsApp — API Oficial Meta' abaixo.
              </p>
            </div>
          </div>

          <div className="p-3 border-t border-slate-100 flex items-center justify-between">
            <p className="text-xs text-slate-500">
              Última conexão:{' '}
              {empresa?.whatsapp_token_atualizado_em
                ? format(parseISO(empresa.whatsapp_token_atualizado_em), 'dd/MM/yyyy, HH:mm:ss', { locale: ptBR })
                : '-'}
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => { window.location.href = '/RobosIntegracoes'; }}
            >
              Ver Logs
            </Button>
          </div>
        </div>
      )}


      {/* Cards de resumo */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
                <CheckCircle2 className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-xs text-slate-500">Operacionais</p>
                <p className="text-lg font-bold text-green-600">
                  {instancias.filter(i => i.status_envio === 'operacional').length}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-yellow-100 flex items-center justify-center">
                <AlertCircle className="w-5 h-5 text-yellow-600" />
              </div>
              <div>
                <p className="text-xs text-slate-500">Instáveis</p>
                <p className="text-lg font-bold text-yellow-600">
                  {instancias.filter(i => i.status_envio === 'instavel').length}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                <XCircle className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <p className="text-xs text-slate-500">Com Falhas</p>
                <p className="text-lg font-bold text-red-600">
                  {instancias.filter(i => i.status_envio === 'falhando' || i.status_envio === 'offline').length}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                <Activity className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-xs text-slate-500">Total</p>
                <p className="text-lg font-bold text-blue-600">
                  {instancias.length}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Lista de instâncias */}
      {instancias.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-slate-400">
            <WifiOff className="w-12 h-12 mx-auto mb-3 text-slate-300" />
            <p>Nenhuma instância monitorada</p>
            <p className="text-xs mt-1">As instâncias aparecerão aqui após o primeiro envio</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {instancias.map((inst) => {
            const qrInfo = getQrStatus(inst.status_qr);
            const QrIcon = qrInfo.icon;
            
            return (
              <Card key={inst.id} className="border-l-4 border-l-green-500">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base flex items-center gap-2">
                      <div className={`w-2.5 h-2.5 rounded-full ${getStatusColor(inst.status_envio)}`} />
                      {inst.instancia}
                    </CardTitle>
                    <Badge variant={inst.status_envio === 'operacional' ? 'default' : 'destructive'} className="text-xs">
                      {inst.status_envio || 'desconhecido'}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {/* Status QR */}
                  <div className="flex items-center gap-2 text-sm">
                    <QrIcon className={`w-4 h-4 ${qrInfo.color}`} />
                    <span className={qrInfo.color}>{qrInfo.label}</span>
                  </div>

                  {/* Estatísticas */}
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="bg-slate-50 rounded p-2">
                      <p className="text-slate-500">Último envio</p>
                      <p className="font-medium text-slate-700">
                        {inst.data_ultimo_envio 
                          ? format(parseISO(inst.data_ultimo_envio), 'dd/MM HH:mm')
                          : 'Nunca'}
                      </p>
                    </div>
                    <div className="bg-slate-50 rounded p-2">
                      <p className="text-slate-500">Tentativas falhas</p>
                      <p className={`font-medium ${inst.tentativas_falhas > 0 ? 'text-red-600' : 'text-green-600'}`}>
                        {inst.tentativas_falhas || 0}
                      </p>
                    </div>
                  </div>

                  {/* Último erro */}
                  {inst.ultimo_erro_envio && (
                    <div className="bg-red-50 border border-red-200 rounded p-2 text-xs text-red-700">
                      <p className="font-semibold mb-1">Último erro:</p>
                      <p className="truncate">{inst.ultimo_erro_envio}</p>
                    </div>
                  )}

                  {/* Ações */}
                  <div className="flex gap-2 pt-2">
                    <Button 
                      size="sm" 
                      variant="outline"
                      onClick={() => setTesteEnvio({ open: true, instancia: inst.instancia, telefone: '' })}
                    >
                      <TestTube className="w-3.5 h-3.5 mr-1" />
                      Testar
                    </Button>
                    <Button 
                      size="sm" 
                      variant="outline"
                      onClick={() => reconectar(inst.instancia)}
                    >
                      <QrCode className="w-3.5 h-3.5 mr-1" />
                      Reconectar
                    </Button>
                    <Button 
                      size="sm" 
                      variant="ghost"
                      onClick={() => limparStatus(inst.id, inst.chave)}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Modal de teste */}
      {testeEnvio.open && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle>Testar Envio - {testeEnvio.instancia}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium text-slate-700">Telefone para teste</label>
                <Input
                  placeholder="Ex: 5511999999999"
                  value={testeEnvio.telefone}
                  onChange={(e) => setTesteEnvio(prev => ({ ...prev, telefone: e.target.value }))}
                  className="mt-1"
                />
                <p className="text-xs text-slate-400 mt-1">Inclua DDD e código do país (55)</p>
              </div>
              <div className="flex gap-2">
                <Button 
                  variant="outline" 
                  className="flex-1"
                  onClick={() => setTesteEnvio({ open: false, instancia: null, telefone: '' })}
                >
                  Cancelar
                </Button>
                <Button 
                  className="flex-1"
                  onClick={testarEnvio}
                  disabled={testando}
                >
                  {testando ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Enviando...
                    </>
                  ) : (
                    <>
                      <MessageSquare className="w-4 h-4 mr-2" />
                      Enviar Teste
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}