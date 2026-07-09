import React, { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  CheckCircle2,
  XCircle,
  Loader2,
  RefreshCw,
  Unplug,
  Wifi,
  Shield,
  Phone,
  FileText,
  Webhook,
  ExternalLink,
  AlertTriangle,
  Zap,
  MessageSquare,
} from 'lucide-react';
import { toast } from 'sonner';

const APP_ID = '1574136874002258';

export default function IntegracaoWhatsAppMeta({ empresaId }) {
  const [status, setStatus] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [conectando, setConectando] = useState(false);
  const [configurandoWebhook, setConfigurandoWebhook] = useState(false);
  const [desconectando, setDesconectando] = useState(false);

  const carregarStatus = useCallback(async () => {
    if (!empresaId) return;
    setCarregando(true);
    try {
      const resp = await base44.functions.invoke('metaEmbeddedSignup', {
        action: 'get_status',
        empresa_id: empresaId,
      });
      setStatus(resp.data);
    } catch (e) {
      console.error(e);
      setStatus({ conectado: false });
    } finally {
      setCarregando(false);
    }
  }, [empresaId]);

  useEffect(() => {
    carregarStatus();
  }, [carregarStatus]);

  // Inicializar Facebook SDK
  useEffect(() => {
    if (window.FB) return;
    window.fbAsyncInit = function () {
      window.FB.init({
        appId: APP_ID,
        autoLogAppEvents: true,
        xfbml: true,
        version: 'v21.0',
      });
    };
    const script = document.createElement('script');
    script.src = 'https://connect.facebook.net/pt_BR/sdk.js';
    script.async = true;
    script.defer = true;
    document.body.appendChild(script);
  }, []);

  const iniciarEmbeddedSignup = () => {
    if (!window.FB) {
      toast.error('SDK do Facebook ainda não carregou. Aguarde alguns segundos e tente novamente.');
      return;
    }
    setConectando(true);

    window.FB.login(
      async (response) => {
        if (response.authResponse && response.authResponse.code) {
          try {
            const resp = await base44.functions.invoke('metaEmbeddedSignup', {
              action: 'exchange_code',
              empresa_id: empresaId,
              code: response.authResponse.code,
            });

            if (resp.data?.ok) {
              toast.success(`✅ ${resp.data.message}`);
              await carregarStatus();
            } else {
              toast.error('Erro: ' + (resp.data?.error || 'Falha na conexão'));
            }
          } catch (e) {
            toast.error('Erro ao processar conexão: ' + e.message);
          }
        } else if (response.status === 'not_authorized') {
          toast.error('Você não autorizou o app. Tente novamente.');
        } else {
          toast.info('Conexão cancelada.');
        }
        setConectando(false);
      },
      {
        config_id: '', // deixar vazio para usar as permissões abaixo
        response_type: 'code',
        override_default_response_type: true,
        scope: 'whatsapp_business_management,whatsapp_business_messaging,business_management',
        extras: {
          feature: 'whatsapp_embedded_signup',
          sessionInfoVersion: 3,
        },
      }
    );
  };

  const configurarWebhook = async () => {
    setConfigurandoWebhook(true);
    try {
      const resp = await base44.functions.invoke('metaEmbeddedSignup', {
        action: 'configurar_webhook',
        empresa_id: empresaId,
      });
      if (resp.data?.ok) {
        toast.success('✅ Webhook configurado com sucesso!');
        await carregarStatus();
      } else {
        toast.error('Erro ao configurar webhook');
      }
    } catch (e) {
      toast.error('Erro: ' + e.message);
    } finally {
      setConfigurandoWebhook(false);
    }
  };

  const desconectar = async () => {
    if (!confirm('Tem certeza que deseja desconectar o WhatsApp Oficial?')) return;
    setDesconectando(true);
    try {
      const resp = await base44.functions.invoke('metaEmbeddedSignup', {
        action: 'desconectar',
        empresa_id: empresaId,
      });
      if (resp.data?.ok) {
        toast.success('WhatsApp desconectado.');
        setStatus({ conectado: false });
      }
    } catch (e) {
      toast.error('Erro: ' + e.message);
    } finally {
      setDesconectando(false);
    }
  };

  const StatusItem = ({ icon: Icon, label, ativo, extra }) => (
    <div className={`flex items-center justify-between p-3 rounded-xl border ${ativo ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200'}`}>
      <div className="flex items-center gap-3">
        <div className={`p-2 rounded-lg ${ativo ? 'bg-emerald-100' : 'bg-slate-100'}`}>
          <Icon className={`w-4 h-4 ${ativo ? 'text-emerald-600' : 'text-slate-400'}`} />
        </div>
        <div>
          <p className={`text-sm font-medium ${ativo ? 'text-emerald-900' : 'text-slate-600'}`}>{label}</p>
          {extra && <p className="text-xs text-slate-500 mt-0.5">{extra}</p>}
        </div>
      </div>
      {ativo
        ? <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0" />
        : <XCircle className="w-5 h-5 text-slate-300 flex-shrink-0" />}
    </div>
  );

  if (carregando) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-8 h-8 animate-spin text-green-500" />
      </div>
    );
  }

  const conectado = status?.conectado;
  const qualityColor = {
    GREEN: 'bg-emerald-100 text-emerald-700',
    YELLOW: 'bg-amber-100 text-amber-700',
    RED: 'bg-red-100 text-red-700',
  }[status?.quality_rating] || 'bg-slate-100 text-slate-600';

  return (
    <div className="space-y-5">
      {/* Header Card */}
      <Card className={`border-l-4 ${conectado ? 'border-l-emerald-500 bg-gradient-to-br from-emerald-50 to-white' : 'border-l-slate-300 bg-gradient-to-br from-slate-50 to-white'}`}>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className={`p-3 rounded-2xl ${conectado ? 'bg-emerald-600' : 'bg-slate-400'}`}>
                <MessageSquare className="w-6 h-6 text-white" />
              </div>
              <div>
                <CardTitle className="flex items-center gap-2 text-lg">
                  WhatsApp Cloud API — Meta Oficial
                  {conectado && (
                    <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-xs">
                      ● Conectado
                    </Badge>
                  )}
                </CardTitle>
                <CardDescription className="mt-1">
                  {conectado
                    ? `Número: ${status?.display_phone_number || '–'} • ${status?.verified_name || ''}`
                    : 'Conecte seu WhatsApp Business para enviar e receber mensagens pelo CRM'}
                </CardDescription>
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={carregarStatus} title="Atualizar status">
              <RefreshCw className="w-4 h-4" />
            </Button>
          </div>
        </CardHeader>

        {conectado && (
          <CardContent className="pt-0">
            <div className="flex items-center gap-2 flex-wrap">
              {status?.waba_id && (
                <span className="text-xs bg-slate-100 text-slate-600 px-2 py-1 rounded-full font-mono">
                  WABA: {status.waba_id}
                </span>
              )}
              {status?.phone_number_id && (
                <span className="text-xs bg-slate-100 text-slate-600 px-2 py-1 rounded-full font-mono">
                  Phone ID: {status.phone_number_id}
                </span>
              )}
              {status?.quality_rating && (
                <span className={`text-xs px-2 py-1 rounded-full font-semibold ${qualityColor}`}>
                  Qualidade: {status.quality_rating}
                </span>
              )}
            </div>
          </CardContent>
        )}
      </Card>

      {/* Status Grid */}
      {conectado && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-slate-700">Status da Integração</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <StatusItem
              icon={Wifi}
              label="Conectado"
              ativo={status?.conectado}
              extra="Integração ativa com a Meta"
            />
            <StatusItem
              icon={Shield}
              label="Token Válido"
              ativo={status?.token_valido}
              extra={status?.token_atualizado_em
                ? `Atualizado: ${new Date(status.token_atualizado_em).toLocaleDateString('pt-BR')}`
                : undefined}
            />
            <StatusItem
              icon={Phone}
              label="Número Ativo"
              ativo={status?.numero_ativo}
              extra={status?.display_phone_number || '–'}
            />
            <StatusItem
              icon={Webhook}
              label="Webhook Ativo"
              ativo={status?.webhook_ativo}
              extra="Recebendo mensagens em tempo real"
            />
            <StatusItem
              icon={FileText}
              label="Templates Sincronizados"
              ativo={(status?.templates_count || 0) > 0}
              extra={`${status?.templates_count || 0} templates`}
            />
            <StatusItem
              icon={Zap}
              label="Envio de Campanhas"
              ativo={status?.token_valido && status?.numero_ativo}
              extra="Disparos em massa habilitados"
            />
          </CardContent>
        </Card>
      )}

      {/* Ações */}
      <Card>
        <CardContent className="pt-6 space-y-4">
          {!conectado ? (
            <>
              {/* Instrução */}
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-800 space-y-1">
                <p className="font-semibold">Como funciona o Embedded Signup:</p>
                <ol className="list-decimal list-inside space-y-1 text-xs">
                  <li>Clique em "Conectar WhatsApp Oficial"</li>
                  <li>Uma janela da Meta será aberta</li>
                  <li>Faça login com sua conta Meta Business</li>
                  <li>Selecione ou crie a conta WhatsApp Business</li>
                  <li>Confirme as permissões solicitadas</li>
                  <li>O CRM conecta automaticamente!</li>
                </ol>
              </div>

              <Button
                className="w-full gap-2 bg-green-600 hover:bg-green-700 text-white h-12 text-base font-semibold"
                onClick={iniciarEmbeddedSignup}
                disabled={conectando}
              >
                {conectando
                  ? <><Loader2 className="w-5 h-5 animate-spin" /> Aguardando autorização...</>
                  : <><MessageSquare className="w-5 h-5" /> Conectar WhatsApp Oficial</>}
              </Button>

              <p className="text-xs text-center text-slate-400">
                Powered by Meta Business Platform • App JD Promotora
              </p>
            </>
          ) : (
            <div className="space-y-3">
              {/* Avisos */}
              {!status?.webhook_ativo && (
                <div className="flex items-start gap-3 p-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold">Webhook não configurado</p>
                    <p className="text-xs mt-0.5">Configure o webhook para receber mensagens no bate-papo em tempo real.</p>
                  </div>
                </div>
              )}

              {!status?.token_valido && (
                <div className="flex items-start gap-3 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-800">
                  <XCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold">Token expirado</p>
                    <p className="text-xs mt-0.5">Reconecte o WhatsApp para renovar o token de acesso.</p>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {!status?.webhook_ativo && (
                  <Button
                    variant="outline"
                    className="gap-2"
                    onClick={configurarWebhook}
                    disabled={configurandoWebhook}
                  >
                    {configurandoWebhook ? <Loader2 className="w-4 h-4 animate-spin" /> : <Webhook className="w-4 h-4" />}
                    Configurar Webhook
                  </Button>
                )}

                <Button
                  variant="outline"
                  className="gap-2"
                  onClick={iniciarEmbeddedSignup}
                  disabled={conectando}
                >
                  {conectando ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                  Reconectar / Atualizar Token
                </Button>

                <Button
                  variant="outline"
                  className="gap-2 text-slate-600"
                  onClick={() => window.open(`https://business.facebook.com/settings/whatsapp-business-accounts`, '_blank')}
                >
                  <ExternalLink className="w-4 h-4" />
                  Meta Business Manager
                </Button>

                <Button
                  variant="outline"
                  className="gap-2 text-red-600 hover:bg-red-50 border-red-200"
                  onClick={desconectar}
                  disabled={desconectando}
                >
                  {desconectando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Unplug className="w-4 h-4" />}
                  Desconectar
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Funcionalidades desbloqueadas */}
      {conectado && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-500" /> Funcionalidades Disponíveis
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {[
                '✅ Templates Oficiais',
                '✅ Campanhas em Massa',
                '✅ Bate-papo em Tempo Real',
                '✅ Automações com IA',
                '✅ Transferência de Atendimento',
                '✅ Tarefas Automáticas',
                '✅ Relatórios de Entrega',
                '✅ WhatsApp Flows',
                '✅ Botões Interativos',
              ].map(f => (
                <div key={f} className="text-xs bg-emerald-50 text-emerald-800 px-2.5 py-2 rounded-lg font-medium">
                  {f}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}