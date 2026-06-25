import React, { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import {
  Bot, Send, MessageSquare, Activity, Loader2, CheckCircle2,
  XCircle, RefreshCw, Webhook, Copy, AlertTriangle, Clock,
  ArrowUpCircle, ArrowDownCircle, Info, Eye, EyeOff
} from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import IntegracaoInstagram from '@/components/configuracoes/IntegracaoInstagram';

// ─── Helpers ────────────────────────────────────────────────
const fmtDate = (d) => d ? new Date(d).toLocaleString('pt-BR') : '—';
const maskToken = (t) => t ? t.substring(0, 8) + '...' + t.substring(t.length - 4) : '';

export default function RobosIntegracoes() {
  const [user, setUser] = useState(null);
  const [empresa, setEmpresa] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const me = await base44.auth.me();
        setUser(me);
        const colabs = await base44.entities.Colaborador.filter({ user_id: me.id, status: 'ativo' });
        const empId = colabs?.[0]?.empresa_id || me.empresa_id;
        if (empId) {
          const emps = await base44.entities.Empresa.filter({ id: empId });
          if (emps?.length > 0) setEmpresa(emps[0]);
        }
      } catch (e) { console.error(e); } finally { setLoading(false); }
    })();
  }, []);

  if (loading) return (
    <div className="flex justify-center py-20">
      <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
    </div>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Robôs e Integrações"
        subtitle="Gerencie as configurações do Telegram, Instagram, IA e visualize os logs"
      />

      <Tabs defaultValue="telegram">
        <TabsList className="flex-wrap">
          <TabsTrigger value="telegram"><Send className="w-4 h-4 mr-1.5" />Telegram</TabsTrigger>
          <TabsTrigger value="instagram"><span className="mr-1.5">📸</span>Instagram</TabsTrigger>
          <TabsTrigger value="ia"><Bot className="w-4 h-4 mr-1.5" />IA</TabsTrigger>
          <TabsTrigger value="logs"><Activity className="w-4 h-4 mr-1.5" />Logs</TabsTrigger>
        </TabsList>

        <TabsContent value="telegram" className="mt-4">
          <TelegramTab empresa={empresa} />
        </TabsContent>

        <TabsContent value="instagram" className="mt-4">
          <InstagramTab empresa={empresa} />
        </TabsContent>

        <TabsContent value="ia" className="mt-4">
          <IATab />
        </TabsContent>

        <TabsContent value="logs" className="mt-4">
          <LogsTab empresa={empresa} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─── Aba Telegram ────────────────────────────────────────────
function TelegramTab({ empresa }) {
  const [status, setStatus] = useState(null);
  const [testando, setTestando] = useState(false);
  const [reiniciando, setReiniciando] = useState(false);
  const [atualizandoWebhook, setAtualizandoWebhook] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [webhookInfo, setWebhookInfo] = useState(null);

  const TELEGRAM_BOT_TOKEN_HINT = 'Configurado via variável de ambiente TELEGRAM_BOT_TOKEN';
  const TELEGRAM_CHAT_ID_HINT = 'Configurado via variável de ambiente TELEGRAM_CHAT_ID';
  const WEBHOOK_URL = `https://app-6950a9860c8af0e2ff10fc9e.base44.app/api/apps/6950a9860c8af0e2ff10fc9e/functions/telegramWebhook`;

  const testarConexao = async () => {
    setTestando(true);
    setStatus(null);
    try {
      const res = await base44.functions.invoke('testarConfigTelegram', {});
      if (res.data?.success) {
        setStatus({ ok: true, msg: 'Conexão com Telegram OK!', data: res.data });
        toast.success('Telegram conectado com sucesso!');
      } else {
        setStatus({ ok: false, msg: res.data?.error || 'Falha na conexão' });
        toast.error('Falha ao conectar ao Telegram');
      }
    } catch (e) {
      setStatus({ ok: false, msg: e.message });
      toast.error('Erro ao testar: ' + e.message);
    } finally { setTestando(false); }
  };

  const atualizarWebhook = async () => {
    setAtualizandoWebhook(true);
    try {
      const res = await base44.functions.invoke('telegramSetWebhook', {});
      if (res.data?.ok) {
        toast.success('Webhook do Telegram atualizado!');
        setWebhookInfo(res.data);
      } else {
        toast.error('Erro ao atualizar webhook: ' + JSON.stringify(res.data));
      }
    } catch (e) {
      toast.error('Erro: ' + e.message);
    } finally { setAtualizandoWebhook(false); }
  };

  const reiniciarConexao = async () => {
    setReiniciando(true);
    try {
      await base44.functions.invoke('telegramSetWebhook', {});
      toast.success('Conexão do Telegram reiniciada!');
    } catch (e) {
      toast.error('Erro ao reiniciar: ' + e.message);
    } finally { setReiniciando(false); }
  };

  const copiar = (texto) => {
    navigator.clipboard.writeText(texto);
    toast.success('Copiado!');
  };

  return (
    <div className="space-y-5">
      {/* Status card */}
      <Card className="border-l-4 border-l-blue-500 bg-gradient-to-br from-blue-50 to-white">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-blue-500 text-white text-2xl flex items-center justify-center">
              <Send className="w-6 h-6" />
            </div>
            <div>
              <CardTitle>Telegram Bot</CardTitle>
              <CardDescription>Integração com bot do Telegram para notificações e comandos</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {status ? (
            <div className={`flex items-center gap-2 p-3 rounded-lg border ${status.ok ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
              {status.ok ? <CheckCircle2 className="w-5 h-5 text-green-600" /> : <XCircle className="w-5 h-5 text-red-600" />}
              <span className={`text-sm font-medium ${status.ok ? 'text-green-800' : 'text-red-800'}`}>{status.msg}</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 p-3 bg-slate-50 border border-slate-200 rounded-lg">
              <Info className="w-4 h-4 text-slate-500" />
              <span className="text-sm text-slate-600">Clique em "Testar Conexão" para verificar o status</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Configurações (somente leitura — gerenciadas por env vars) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Configurações Atuais</CardTitle>
          <CardDescription>Valores configurados via variáveis de ambiente do sistema</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Token do Bot</Label>
            <div className="flex gap-2 items-center">
              <Input value={TELEGRAM_BOT_TOKEN_HINT} readOnly className="bg-slate-50 text-slate-500 text-sm" />
            </div>
            <p className="text-xs text-slate-400">Variável: <code className="bg-slate-100 px-1 rounded">TELEGRAM_BOT_TOKEN</code></p>
          </div>
          <div className="space-y-2">
            <Label>Chat ID Autorizado</Label>
            <div className="flex gap-2 items-center">
              <Input value={TELEGRAM_CHAT_ID_HINT} readOnly className="bg-slate-50 text-slate-500 text-sm" />
            </div>
            <p className="text-xs text-slate-400">Variável: <code className="bg-slate-100 px-1 rounded">TELEGRAM_CHAT_ID</code></p>
          </div>
          <div className="space-y-2">
            <Label>URL do Webhook</Label>
            <div className="flex gap-2">
              <Input value={WEBHOOK_URL} readOnly className="bg-slate-50 font-mono text-xs" />
              <Button variant="outline" size="icon" onClick={() => copiar(WEBHOOK_URL)}>
                <Copy className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Ações */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Ações</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            <Button onClick={testarConexao} disabled={testando} variant="outline" className="gap-2 border-blue-300 text-blue-700 hover:bg-blue-50">
              {testando ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              Testar Conexão
            </Button>
            <Button onClick={reiniciarConexao} disabled={reiniciando} variant="outline" className="gap-2">
              {reiniciando ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              Reiniciar Conexão
            </Button>
            <Button onClick={atualizarWebhook} disabled={atualizandoWebhook} variant="outline" className="gap-2 border-green-300 text-green-700 hover:bg-green-50">
              {atualizandoWebhook ? <Loader2 className="w-4 h-4 animate-spin" /> : <Webhook className="w-4 h-4" />}
              Atualizar Webhook
            </Button>
          </div>
          {webhookInfo && (
            <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-lg text-xs text-green-800 font-mono">
              {JSON.stringify(webhookInfo, null, 2)}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Aba Instagram ───────────────────────────────────────────
function InstagramTab({ empresa }) {
  return <IntegracaoInstagram empresaId={empresa?.id} />;
}

// ─── Aba IA ──────────────────────────────────────────────────
function IATab() {
  const CONFIG_IA = [
    { label: 'Modelo', value: 'gpt-4o-mini (automático)', icon: '🧠' },
    { label: 'Temperatura', value: '0.7 (padrão)', icon: '🌡️' },
    { label: 'Máximo de Tokens', value: '2048 (padrão)', icon: '📊' },
    { label: 'Status', value: 'Ativo', icon: '✅', badge: true, badgeColor: 'bg-green-100 text-green-700' },
    { label: 'Prompt Padrão', value: 'Configurado no sistema', icon: '📝' },
    { label: 'Chave da API', value: 'Configurada via OPENAI_API_KEY', icon: '🔑' },
  ];

  return (
    <div className="space-y-5">
      <Card className="border-l-4 border-l-violet-500 bg-gradient-to-br from-violet-50 to-white">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-violet-600 text-white">
              <Bot className="w-6 h-6" />
            </div>
            <div>
              <CardTitle>Configurações de IA</CardTitle>
              <CardDescription>Visualização das configurações atuais do módulo de inteligência artificial</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <AlertTriangle className="w-4 h-4 text-amber-600" />
            <span className="text-sm text-amber-800">
              <strong>Fase 1 — Somente leitura.</strong> Edição de configurações será habilitada na Fase 2.
            </span>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {CONFIG_IA.map((item, i) => (
          <Card key={i} className="bg-white">
            <CardContent className="p-4 flex items-center gap-3">
              <span className="text-2xl">{item.icon}</span>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-slate-500 font-medium">{item.label}</p>
                {item.badge ? (
                  <Badge className={`mt-1 ${item.badgeColor} border-0`}>{item.value}</Badge>
                ) : (
                  <p className="text-sm font-semibold text-slate-700 truncate">{item.value}</p>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Info className="w-4 h-4 text-blue-500" />
            Funcionalidades futuras (Fase 2)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm text-slate-600">
            {[
              'Treinamento com exemplos personalizados',
              'Prompt personalizado por empresa',
              'Memória de conversas',
              'Regras inteligentes de resposta',
              'Classificação automática de despesas, receitas, agenda e tarefas',
            ].map((item, i) => (
              <li key={i} className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-violet-300 flex-shrink-0" />
                {item}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Aba Logs ────────────────────────────────────────────────
function LogsTab({ empresa }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState('todos');

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const filtroBase = empresa?.id ? { empresa_id: empresa.id } : {};
      const data = await base44.entities.LogRecebimentoWebhook.filter(filtroBase, '-created_date', 200);
      setLogs(data);
    } catch (e) { console.error(e); } finally { setLoading(false); }
  }, [empresa]);

  useEffect(() => { carregar(); }, [carregar]);

  const FILTROS = [
    { key: 'todos', label: 'Todos' },
    { key: 'mensagem_recebida', label: 'Recebidas' },
    { key: 'mensagem_salva', label: 'Salvas' },
    { key: 'erro', label: 'Erros' },
  ];

  const logsFiltrados = filtro === 'todos' ? logs : logs.filter(l => l.tipo_evento === filtro || (filtro === 'erro' && l.status === 'erro'));

  const contadores = {
    total: logs.length,
    erros: logs.filter(l => l.status === 'erro').length,
    sucesso: logs.filter(l => l.status === 'sucesso').length,
  };

  return (
    <div className="space-y-5">
      {/* Resumo */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="bg-white">
          <CardContent className="p-4 text-center">
            <p className="text-xs text-slate-500">Total de Eventos</p>
            <p className="text-2xl font-bold text-slate-800">{contadores.total}</p>
          </CardContent>
        </Card>
        <Card className="bg-white">
          <CardContent className="p-4 text-center">
            <p className="text-xs text-slate-500">Sucessos</p>
            <p className="text-2xl font-bold text-green-600">{contadores.sucesso}</p>
          </CardContent>
        </Card>
        <Card className="bg-white">
          <CardContent className="p-4 text-center">
            <p className="text-xs text-slate-500">Erros</p>
            <p className="text-2xl font-bold text-red-600">{contadores.erros}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-2 items-center justify-between">
        <div className="flex flex-wrap gap-2">
          {FILTROS.map(f => (
            <button
              key={f.key}
              onClick={() => setFiltro(f.key)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                filtro === f.key ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-600 border-slate-300 hover:border-slate-500'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <Button variant="outline" size="sm" onClick={carregar} disabled={loading} className="gap-1.5">
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          Atualizar
        </Button>
      </div>

      {/* Lista de logs */}
      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>
      ) : logsFiltrados.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <Activity className="w-10 h-10 mx-auto mb-3 text-slate-300" />
          <p>Nenhum log encontrado para este filtro.</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
              <tr>
                <th className="text-left px-4 py-3">Tipo</th>
                <th className="text-left px-4 py-3">Telefone</th>
                <th className="text-left px-4 py-3 hidden md:table-cell">Conteúdo</th>
                <th className="text-center px-4 py-3">Status</th>
                <th className="text-left px-4 py-3 hidden lg:table-cell">Data</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {logsFiltrados.map(log => (
                <tr key={log.id} className={`hover:bg-slate-50 ${log.status === 'erro' ? 'bg-red-50' : ''}`}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      {log.tipo_evento === 'mensagem_recebida' ? <ArrowDownCircle className="w-3.5 h-3.5 text-blue-500" /> :
                       log.tipo_evento === 'mensagem_salva' ? <ArrowUpCircle className="w-3.5 h-3.5 text-green-500" /> :
                       log.tipo_evento === 'erro' ? <XCircle className="w-3.5 h-3.5 text-red-500" /> :
                       <Activity className="w-3.5 h-3.5 text-slate-400" />}
                      <span className="text-xs text-slate-600 capitalize">{log.tipo_evento?.replace(/_/g, ' ') || '—'}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-600 text-xs font-mono">{log.telefone || '—'}</td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    <span className="text-xs text-slate-500 truncate block max-w-xs">
                      {log.mensagem_erro || log.conteudo || '—'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <Badge className={log.status === 'sucesso' ? 'bg-green-100 text-green-700 border-0' : 'bg-red-100 text-red-700 border-0'}>
                      {log.status || '—'}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell text-xs text-slate-400">
                    <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{fmtDate(log.created_date)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}