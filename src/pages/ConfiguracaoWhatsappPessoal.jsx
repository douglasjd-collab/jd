import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import PageHeader from '@/components/ui/PageHeader';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, Copy, Loader2, QrCode, RefreshCw, Smartphone, Wifi, XCircle, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

const BASE_WEBHOOK_URL = 'https://api.base44.com/apps/6950a9860c8af0e2ff10fc9e/functions/receberWebhookWhatsApp';

const limparUrl = (url) => url?.replace(/\/manager\/?$/, '').replace(/\/$/, '') || '';

export default function ConfiguracaoWhatsappPessoal() {
  const [colab, setColab] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editMode, setEditMode] = useState(false);

  const [evolutionUrl, setEvolutionUrl] = useState('');
  const [instanceName, setInstanceName] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [phoneNumberId, setPhoneNumberId] = useState('');
  const [apiPreferida, setApiPreferida] = useState('auto');

  // Temporários no modo edição
  const [tempUrl, setTempUrl] = useState('');
  const [tempInstance, setTempInstance] = useState('');
  const [tempApiKey, setTempApiKey] = useState('');
  const [tempAccessToken, setTempAccessToken] = useState('');
  const [tempPhoneNumberId, setTempPhoneNumberId] = useState('');
  const [tempApiPreferida, setTempApiPreferida] = useState('auto');

  // QR Code
  const [qrCode, setQrCode] = useState(null);
  const [qrLoading, setQrLoading] = useState(false);
  const [qrStatus, setQrStatus] = useState(null);
  const [qrPolling, setQrPolling] = useState(null);
  const [criandoInstancia, setCriandoInstancia] = useState(false);

  useEffect(() => {
    carregarDados();
    return () => { if (qrPolling) clearInterval(qrPolling); };
  }, []);

  const carregarDados = async () => {
    try {
      const me = await base44.auth.me();
      const colabs = await base44.entities.Colaborador.filter({ user_id: me.id, status: 'ativo' });
      const c = colabs?.[0];
      if (!c) { toast.error('Colaborador não encontrado'); return; }
      setColab(c);
      setEvolutionUrl(c.whatsapp_pessoal_evolution_url || '');
      setInstanceName(c.whatsapp_pessoal_instance_name || '');
      setApiKey(c.whatsapp_pessoal_api_key || '');
      setAccessToken(c.whatsapp_pessoal_access_token || '');
      setPhoneNumberId(c.whatsapp_pessoal_phone_number_id || '');
      setApiPreferida(c.whatsapp_pessoal_api_preferida || 'auto');
    } catch (e) {
      toast.error('Erro ao carregar: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleEditar = () => {
    setTempUrl(evolutionUrl);
    setTempInstance(instanceName);
    setTempApiKey(apiKey);
    setTempAccessToken(accessToken);
    setTempPhoneNumberId(phoneNumberId);
    setTempApiPreferida(apiPreferida);
    setEditMode(true);
  };

  const handleCancelar = () => setEditMode(false);

  const handleSalvar = async () => {
    setSaving(true);
    try {
      const resp = await base44.functions.invoke('salvarWhatsappPessoal', {
        evolution_url: tempUrl,
        instance_name: tempInstance,
        api_key: tempApiKey,
        access_token: tempAccessToken,
        phone_number_id: tempPhoneNumberId,
        api_preferida: tempApiPreferida,
      });

      if (!resp.data?.success) throw new Error(resp.data?.error || 'Erro ao salvar');

      setEvolutionUrl(tempUrl);
      setInstanceName(tempInstance);
      setApiKey(tempApiKey);
      setAccessToken(tempAccessToken);
      setPhoneNumberId(tempPhoneNumberId);
      setApiPreferida(tempApiPreferida);
      setEditMode(false);

      if (resp.data?.webhook_configurado) {
        toast.success('✅ Configurações salvas e webhook configurado automaticamente!');
      } else {
        toast.success('✅ Configurações salvas! Configure o webhook manualmente se necessário.');
      }
    } catch (e) {
      toast.error('Erro ao salvar: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  const copiar = (texto, label) => {
    navigator.clipboard.writeText(texto);
    toast.success(`${label} copiado!`);
  };

  const webhookUrl = instanceName
    ? `${BASE_WEBHOOK_URL}?instance=${encodeURIComponent(instanceName)}`
    : BASE_WEBHOOK_URL;

  // QR Code
  const getHeaders = () => ({ 'apikey': apiKey || tempApiKey, 'Content-Type': 'application/json' });
  const getBase = () => limparUrl(evolutionUrl || tempUrl);
  const getInstance = () => instanceName || tempInstance;

  const criarInstancia = async () => {
    const base = getBase();
    const key = apiKey || tempApiKey;
    const nome = instanceName || tempInstance || colab?.nome?.replace(/\s+/g, '').toUpperCase();
    if (!base) { toast.error('Preencha a URL da API'); return; }
    if (!key) { toast.error('Preencha a Chave de API'); return; }
    if (!nome) { toast.error('Preencha o Nome da Instância'); return; }
    setCriandoInstancia(true);
    try {
      const resp = await fetch(`${base}/instance/create`, {
        method: 'POST',
        headers: { 'apikey': key, 'Content-Type': 'application/json' },
        body: JSON.stringify({ instanceName: nome, qrcode: true, integration: 'WHATSAPP-BAILEYS' }),
      });
      const data = await resp.json();
      if (data?.instance?.instanceName || data?.hash || data?.instanceName) {
        toast.success(`✅ Instância "${nome}" criada! Gere o QR Code para conectar.`);
        const qr = data?.qrcode?.base64 || data?.base64;
        if (qr) { setQrCode(qr); setQrStatus('waiting'); iniciarPolling(); }
      } else if (resp.status === 409) {
        toast.info('Instância já existe. Gere o QR Code diretamente.');
      } else {
        toast.error('Erro: ' + JSON.stringify(data).slice(0, 150));
      }
    } catch (e) {
      toast.error('Erro ao criar instância: ' + e.message);
    } finally {
      setCriandoInstancia(false);
    }
  };

  const buscarQrCode = async () => {
    const base = getBase();
    const inst = getInstance();
    if (!base || !inst) { toast.error('Preencha URL e Nome da Instância antes'); return; }
    setQrLoading(true);
    setQrCode(null);
    setQrStatus(null);
    try {
      const statusResp = await fetch(`${base}/instance/connectionState/${inst}`, { headers: getHeaders() });
      const statusData = await statusResp.json();
      const state = statusData?.instance?.state || statusData?.state;
      if (state === 'open') { setQrStatus('connected'); return; }

      const resp = await fetch(`${base}/instance/connect/${inst}`, { headers: getHeaders() });
      const data = await resp.json();
      const qr = data?.base64 || data?.qrcode?.base64 || data?.qr?.base64 || data?.code;
      if (qr) {
        setQrCode(qr);
        setQrStatus('waiting');
        iniciarPolling();
      } else {
        toast.error('QR não encontrado. Verifique as credenciais ou crie a instância primeiro.');
      }
    } catch (e) {
      toast.error('Erro ao gerar QR Code: ' + e.message);
    } finally {
      setQrLoading(false);
    }
  };

  const iniciarPolling = () => {
    if (qrPolling) clearInterval(qrPolling);
    const interval = setInterval(async () => {
      try {
        const resp = await fetch(`${getBase()}/instance/connectionState/${getInstance()}`, { headers: getHeaders() });
        const data = await resp.json();
        if (data?.instance?.state === 'open' || data?.state === 'open') {
          setQrStatus('connected');
          setQrCode(null);
          clearInterval(interval);
          toast.success('✅ WhatsApp pessoal conectado!');
        }
      } catch {}
    }, 4000);
    setQrPolling(interval);
  };

  const conectado = colab?.whatsapp_pessoal_conectado && instanceName;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <PageHeader
        title="Meu WhatsApp Pessoal"
        subtitle={`Configure seu próprio WhatsApp — ${colab?.nome || ''}`}
      />

      {/* Status */}
      <Card className={`border-l-4 ${conectado ? 'border-l-green-500' : 'border-l-amber-400'}`}>
        <CardContent className="pt-5">
          <div className="flex items-center gap-3">
            {conectado ? (
              <CheckCircle2 className="w-6 h-6 text-green-500 flex-shrink-0" />
            ) : (
              <AlertCircle className="w-6 h-6 text-amber-500 flex-shrink-0" />
            )}
            <div className="flex-1">
              <p className="font-semibold text-sm">
                {conectado ? 'WhatsApp pessoal configurado' : 'Nenhum WhatsApp pessoal conectado'}
              </p>
              {instanceName && (
                <p className="text-xs text-slate-500 mt-0.5">Instância: <code className="bg-slate-100 px-1 rounded">{instanceName}</code></p>
              )}
            </div>
            <Badge className={conectado ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'}>
              {conectado ? '✅ Conectado' : '⚠️ Não configurado'}
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* O que é isso */}
      <Card className="bg-blue-50 border-blue-200">
        <CardContent className="pt-5">
          <div className="flex gap-3">
            <Smartphone className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-blue-900">O que é o WhatsApp Pessoal?</p>
              <p className="text-sm text-blue-800 mt-1">
                Cada colaborador pode conectar seu próprio número de WhatsApp. As conversas ficam separadas do WhatsApp comercial da empresa e são visíveis apenas para você.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Credenciais */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              ⚙️ Credenciais da Instância Pessoal
            </CardTitle>
            {!editMode && (
              <Button size="sm" onClick={handleEditar}>Editar</Button>
            )}
          </div>
          <CardDescription>Configure a instância Evolution API do seu WhatsApp pessoal</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">

          {/* URL da API */}
          <div>
            <Label className="mb-1.5 block">URL da API Evolution</Label>
            <div className="flex gap-2">
              <Input
                value={editMode ? tempUrl : evolutionUrl}
                onChange={e => editMode && setTempUrl(e.target.value)}
                readOnly={!editMode}
                placeholder="https://sua-evolution-api.com"
                className={!editMode ? 'bg-slate-50' : ''}
              />
              {!editMode && evolutionUrl && (
                <Button variant="outline" size="icon" onClick={() => copiar(evolutionUrl, 'URL')}>
                  <Copy className="w-4 h-4" />
                </Button>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-1">URL base sem <code>/manager/</code>. Ex: https://minha-api.easypanel.host</p>
          </div>

          {/* Nome da Instância */}
          <div>
            <Label className="mb-1.5 block">Nome da Instância</Label>
            <div className="flex gap-2">
              <Input
                value={editMode ? tempInstance : instanceName}
                onChange={e => editMode && setTempInstance(e.target.value)}
                readOnly={!editMode}
                placeholder={`Ex: ${colab?.nome?.split(' ')?.[0]?.toUpperCase() || 'MEU_WHATSAPP'}`}
                className={!editMode ? 'bg-slate-50' : ''}
              />
              {!editMode && instanceName && (
                <Button variant="outline" size="icon" onClick={() => copiar(instanceName, 'Nome da instância')}>
                  <Copy className="w-4 h-4" />
                </Button>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-1">Use um nome único para sua instância. Ex: JOAO, MARIA_VENDAS</p>
          </div>

          {/* API Key */}
          <div>
            <Label className="mb-1.5 block">Chave de API (API Key)</Label>
            <div className="flex gap-2">
              <Input
                value={editMode ? tempApiKey : apiKey}
                onChange={e => editMode && setTempApiKey(e.target.value)}
                readOnly={!editMode}
                placeholder="Chave de acesso da instância"
                type="text"
                className={!editMode ? 'bg-slate-50 font-mono' : ''}
              />
              {!editMode && apiKey && (
                <Button variant="outline" size="icon" onClick={() => copiar(apiKey, 'API Key')}>
                  <Copy className="w-4 h-4" />
                </Button>
              )}
            </div>
          </div>

          {/* Botões edição */}
          {editMode && (
            <div className="flex gap-2 justify-end pt-2 border-t mt-2">
              <Button variant="outline" onClick={handleCancelar} disabled={saving}>Cancelar</Button>
              <Button onClick={handleSalvar} disabled={saving}>
                {saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Salvando...</> : 'Salvar'}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Criar instância + QR Code */}
      {(evolutionUrl || instanceName) && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <QrCode className="w-5 h-5" /> Conectar via QR Code
            </CardTitle>
            <CardDescription>Escaneie o QR Code com seu WhatsApp pessoal</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">

            {/* Criar instância */}
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-sm font-semibold text-blue-800 mb-1">1. Criar Instância</p>
              <p className="text-xs text-blue-700 mb-3">Se ainda não criou sua instância na Evolution API, clique abaixo:</p>
              <Button
                size="sm"
                onClick={criarInstancia}
                disabled={criandoInstancia}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {criandoInstancia ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Criando...</> : '🆕 Criar Instância'}
              </Button>
            </div>

            {/* QR Code */}
            <div className="border-t pt-4">
              <p className="text-sm font-semibold text-slate-700 mb-3">2. Gerar QR Code e Escanear</p>
              {qrStatus === 'connected' ? (
                <div className="flex items-center gap-3 p-4 bg-green-50 border-2 border-green-400 rounded-xl">
                  <CheckCircle2 className="w-8 h-8 text-green-500" />
                  <div>
                    <p className="font-bold text-green-800">✅ WhatsApp Pessoal Conectado!</p>
                    <p className="text-sm text-green-700">Sua instância está ativa e pronta para uso.</p>
                  </div>
                </div>
              ) : qrCode ? (
                <div className="flex flex-col items-center gap-4 p-4 bg-slate-50 border rounded-xl">
                  <p className="text-sm text-slate-600 text-center">Abra seu WhatsApp → <strong>Aparelhos Conectados</strong> → <strong>Conectar aparelho</strong></p>
                  <img
                    src={qrCode.startsWith('data:') ? qrCode : `data:image/png;base64,${qrCode}`}
                    alt="QR Code"
                    className="w-52 h-52 border-4 border-slate-300 rounded-xl"
                  />
                  <p className="text-xs text-slate-400 animate-pulse">Aguardando leitura...</p>
                  <Button variant="outline" size="sm" onClick={buscarQrCode} disabled={qrLoading}>
                    <RefreshCw className="w-4 h-4 mr-2" /> Atualizar QR Code
                  </Button>
                </div>
              ) : (
                <Button onClick={buscarQrCode} disabled={qrLoading} className="bg-green-600 hover:bg-green-700">
                  {qrLoading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Gerando...</> : <><QrCode className="w-4 h-4 mr-2" /> Gerar QR Code</>}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* URL do Webhook */}
      {instanceName && (
        <Card className="border-l-4 border-l-green-500 bg-green-50">
          <CardHeader>
            <CardTitle className="text-green-900 flex items-center gap-2">
              <Wifi className="w-5 h-5" /> URL do Webhook (sua instância)
            </CardTitle>
            <CardDescription className="text-green-700">Configure esta URL na Evolution API para receber suas mensagens</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex gap-2">
              <Input
                value={webhookUrl}
                readOnly
                className="bg-white border-2 border-green-400 font-mono text-xs text-green-700"
              />
              <Button
                className="bg-green-600 hover:bg-green-700 whitespace-nowrap"
                onClick={() => copiar(webhookUrl, 'URL do Webhook')}
              >
                <Copy className="w-4 h-4 mr-2" /> Copiar
              </Button>
            </div>
            <p className="text-xs text-green-800">
              Esta URL garante que suas mensagens pessoais sejam roteadas apenas para você, sem interferir com outras contas.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}