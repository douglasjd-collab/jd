import React, { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { RefreshCw, CheckCircle, XCircle, AlertTriangle, Wifi, WifiOff, Play, Clock, Zap } from 'lucide-react';

export default function MonitorEvolutionAPI() {
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState(null);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingAtualizar, setLoadingAtualizar] = useState(false);
  const [loadingReiniciar, setLoadingReiniciar] = useState(false);
  const [ultimaVerificacao, setUltimaVerificacao] = useState(null);
  const [erro, setErro] = useState(null);

  useEffect(() => {
    base44.auth.me().then(setUser).catch(() => {});
  }, []);

  useEffect(() => {
    if (user) {
      verificarAgora(false);
      carregarLogs();
    }
  }, [user]);

  const carregarLogs = async () => {
    try {
      const data = await base44.entities.LogVersaoWhatsApp.list('-created_date', 20);
      setLogs(data);
    } catch (_) {}
  };

  const verificarAgora = useCallback(async (comLog = true) => {
    setLoading(true);
    setErro(null);
    try {
      const res = await base44.functions.invoke('verificarVersaoWhatsAppWeb', {
        empresa_id: user?.empresa_id,
        salvar_log: comLog
      });
      setStatus(res.data);
      setUltimaVerificacao(new Date());
      if (comLog) carregarLogs();
    } catch (e) {
      setErro(e.message || 'Erro ao verificar status');
    } finally {
      setLoading(false);
    }
  }, [user]);

  const atualizarVersao = async (comReinicio = false) => {
    if (!confirm(`Deseja atualizar a versão do WhatsApp Web${comReinicio ? ' e reiniciar as instâncias' : ''}?`)) return;
    setLoadingAtualizar(true);
    setErro(null);
    try {
      const res = await base44.functions.invoke('atualizarVersaoWhatsAppEvolution', {
        empresa_id: user?.empresa_id,
        reiniciar: comReinicio
      });
      const data = res.data;
      alert(
        `✅ Versão atualizada!\n\n` +
        `Anterior: ${data.versao_anterior || 'N/A'}\n` +
        `Nova: ${data.versao_nova}\n` +
        (data.aviso ? `\n⚠️ ${data.aviso}` : '')
      );
      await verificarAgora(false);
      carregarLogs();
    } catch (e) {
      setErro(e.message || 'Erro ao atualizar versão');
    } finally {
      setLoadingAtualizar(false);
    }
  };

  const reiniciarInstancias = async () => {
    if (!confirm('Reiniciar todas as instâncias Evolution API? As sessões serão preservadas.')) return;
    setLoadingReiniciar(true);
    setErro(null);
    try {
      const res = await base44.functions.invoke('atualizarVersaoWhatsAppEvolution', {
        empresa_id: user?.empresa_id,
        reiniciar: true
      });
      alert('✅ Comando de reinício enviado para as instâncias!');
      await verificarAgora(false);
      carregarLogs();
    } catch (e) {
      setErro(e.message || 'Erro ao reiniciar instâncias');
    } finally {
      setLoadingReiniciar(false);
    }
  };

  const versoesDiferentes = status?.versao_mais_recente && status?.versao_configurada &&
    status.versao_mais_recente !== status.versao_configurada;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Monitor Evolution API</h1>
          <p className="text-slate-500 text-sm mt-1">Monitoramento e atualização automática do WhatsApp Web</p>
        </div>
        <Button
          onClick={() => verificarAgora(true)}
          disabled={loading}
          className="bg-blue-500 hover:bg-blue-600 text-white gap-2"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          {loading ? 'Verificando...' : 'Verificar Agora'}
        </Button>
      </div>

      {erro && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm flex items-center gap-2">
          <XCircle className="w-4 h-4 flex-shrink-0" />
          {erro}
        </div>
      )}

      {/* Cards de Status */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Evolution Online */}
        <Card className={`border-2 ${status?.evolution_online ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Evolution API</p>
                <p className={`text-xl font-bold mt-1 ${status?.evolution_online ? 'text-green-700' : 'text-red-700'}`}>
                  {status === null ? '...' : status.evolution_online ? 'Online' : 'Offline'}
                </p>
              </div>
              {status?.evolution_online
                ? <Wifi className="w-8 h-8 text-green-500" />
                : <WifiOff className="w-8 h-8 text-red-500" />
              }
            </div>
          </CardContent>
        </Card>

        {/* Instâncias */}
        <Card className={`border-2 ${status?.todas_conectadas ? 'border-green-200 bg-green-50' : status?.total_instancias > 0 ? 'border-yellow-200 bg-yellow-50' : 'border-slate-200'}`}>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Instâncias</p>
                <p className="text-xl font-bold mt-1 text-slate-800">
                  {status === null ? '...' : `${(status.total_instancias || 0) - (status.instancias_desconectadas || 0)}/${status.total_instancias || 0}`}
                </p>
                <p className="text-xs text-slate-500">conectadas</p>
              </div>
              {status?.todas_conectadas
                ? <CheckCircle className="w-8 h-8 text-green-500" />
                : <AlertTriangle className="w-8 h-8 text-yellow-500" />
              }
            </div>
          </CardContent>
        </Card>

        {/* Versão Configurada */}
        <Card className={`border-2 ${versoesDiferentes ? 'border-orange-200 bg-orange-50' : 'border-slate-200'}`}>
          <CardContent className="pt-5 pb-4">
            <div>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Versão Configurada</p>
              <p className="text-lg font-bold mt-1 text-slate-800 font-mono">
                {status?.versao_configurada || '—'}
              </p>
              {versoesDiferentes && (
                <Badge className="bg-orange-100 text-orange-700 text-xs mt-1">
                  ⚠️ Desatualizada
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Versão Disponível */}
        <Card className={`border-2 ${versoesDiferentes ? 'border-blue-200 bg-blue-50' : 'border-slate-200'}`}>
          <CardContent className="pt-5 pb-4">
            <div>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Última Versão Disponível</p>
              <p className="text-lg font-bold mt-1 text-slate-800 font-mono">
                {status?.versao_mais_recente || '—'}
              </p>
              <p className="text-xs text-slate-400">via {status?.fonte_versao || 'N/A'}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Aviso de versão desatualizada */}
      {versoesDiferentes && (
        <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-orange-500 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-semibold text-orange-800">Nova versão do WhatsApp Web disponível!</p>
            <p className="text-sm text-orange-700 mt-1">
              Versão atual: <code className="bg-orange-100 px-1 rounded">{status.versao_configurada}</code> →
              Nova versão: <code className="bg-orange-100 px-1 rounded">{status.versao_mais_recente}</code>
            </p>
            <p className="text-xs text-orange-600 mt-1">
              Atualizar pode evitar problemas de desconexão das instâncias.
            </p>
          </div>
        </div>
      )}

      {/* Botões de ação */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Ações</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button
            onClick={() => atualizarVersao(false)}
            disabled={loadingAtualizar || loading}
            className="bg-blue-500 hover:bg-blue-600 text-white gap-2"
          >
            <Zap className="w-4 h-4" />
            {loadingAtualizar ? 'Atualizando...' : 'Atualizar Versão Agora'}
          </Button>
          <Button
            onClick={() => atualizarVersao(true)}
            disabled={loadingAtualizar || loading}
            variant="outline"
            className="gap-2 border-orange-300 text-orange-700 hover:bg-orange-50"
          >
            <RefreshCw className="w-4 h-4" />
            Atualizar + Reiniciar Instâncias
          </Button>
          <Button
            onClick={reiniciarInstancias}
            disabled={loadingReiniciar || loading}
            variant="outline"
            className="gap-2 border-slate-300 text-slate-700 hover:bg-slate-50"
          >
            <Play className="w-4 h-4" />
            {loadingReiniciar ? 'Reiniciando...' : 'Reiniciar Instâncias'}
          </Button>
        </CardContent>
      </Card>

      {/* Aviso sobre atualização manual VPS */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-sm text-slate-600">
        <p className="font-semibold text-slate-700 mb-1">ℹ️ Sobre a atualização automática</p>
        <p>
          O CRM salva a versão no banco e tenta atualizar via API da Evolution. Porém, para aplicar
          definitivamente no servidor, você também deve atualizar a variável <code className="bg-slate-100 px-1 rounded font-mono text-xs">CONFIG_SESSION_PHONE_VERSION</code> no EasyPanel/VPS com o valor:
          <code className="bg-blue-100 text-blue-800 px-2 py-0.5 rounded font-mono ml-1">{status?.versao_mais_recente || '...'}</code>
        </p>
      </div>

      {/* Lista de Instâncias */}
      {status?.instancias?.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Instâncias</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {status.instancias.map((inst, i) => {
                const conectado = ['open', 'connected', 'CONNECTED'].includes(inst.status);
                return (
                  <div key={i} className={`flex items-center justify-between p-3 rounded-lg border ${conectado ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                    <div className="flex items-center gap-2">
                      {conectado
                        ? <CheckCircle className="w-4 h-4 text-green-500" />
                        : <XCircle className="w-4 h-4 text-red-500" />
                      }
                      <span className="font-medium text-sm">{inst.nome}</span>
                    </div>
                    <Badge className={conectado ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}>
                      {inst.status}
                    </Badge>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Última verificação */}
      {ultimaVerificacao && (
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <Clock className="w-3 h-3" />
          Última verificação: {ultimaVerificacao.toLocaleString('pt-BR')}
        </div>
      )}

      {/* Logs */}
      {logs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Histórico de Verificações</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {logs.map((log, i) => (
                <div key={i} className={`p-3 rounded-lg border text-sm ${log.sucesso ? 'bg-slate-50 border-slate-200' : 'bg-red-50 border-red-200'}`}>
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      {log.sucesso
                        ? <CheckCircle className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
                        : <XCircle className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />
                      }
                      <Badge className="text-xs bg-slate-200 text-slate-700">{log.acao}</Badge>
                      {log.versao_nova && (
                        <span className="text-slate-600">
                          {log.versao_anterior && <><code className="bg-slate-100 px-1 rounded">{log.versao_anterior}</code> → </>}
                          <code className="bg-blue-100 text-blue-700 px-1 rounded">{log.versao_nova}</code>
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-slate-400">
                      {new Date(log.created_date).toLocaleString('pt-BR')}
                    </span>
                  </div>
                  {log.detalhes && (
                    <p className="text-xs text-slate-500 mt-1 ml-5 truncate">{log.detalhes}</p>
                  )}
                  {log.erro && (
                    <p className="text-xs text-red-600 mt-1 ml-5">{log.erro}</p>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}