import React, { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { RefreshCw, CheckCircle, XCircle, AlertTriangle, Wifi, WifiOff, Play, Clock, Zap, Server, TestTube2, Shield } from 'lucide-react';

export default function MonitorEvolutionAPI() {
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState(null);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingAtualizar, setLoadingAtualizar] = useState(false);
  const [loadingReiniciar, setLoadingReiniciar] = useState(false);
  const [loadingEasyPanel, setLoadingEasyPanel] = useState(false);
  const [loadingTesteEP, setLoadingTesteEP] = useState(false);
  const [resultadoEasyPanel, setResultadoEasyPanel] = useState(null);
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

  const atualizarViaEasyPanel = async (forcar = false) => {
    if (!confirm(`Atualizar CONFIG_SESSION_PHONE_VERSION no EasyPanel e reiniciar o serviço Evolution API?`)) return;
    setLoadingEasyPanel(true);
    setResultadoEasyPanel(null);
    try {
      const res = await base44.functions.invoke('atualizarVersaoEasyPanel', {
        versao_nova: status?.versao_mais_recente || null,
        forcar
      });
      setResultadoEasyPanel(res.data);
      await verificarAgora(false);
      carregarLogs();
    } catch (e) {
      setResultadoEasyPanel({ success: false, error: e.message });
    } finally {
      setLoadingEasyPanel(false);
    }
  };

  const testarEasyPanel = async () => {
    setLoadingTesteEP(true);
    setResultadoEasyPanel(null);
    try {
      const res = await base44.functions.invoke('testarEasyPanelAPI', {});
      setResultadoEasyPanel({ tipo: 'teste', ...res.data });
    } catch (e) {
      setResultadoEasyPanel({ success: false, error: e.message });
    } finally {
      setLoadingTesteEP(false);
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

      {/* Card EasyPanel - Atualização Automática Completa */}
      <Card className="border-2 border-blue-200 bg-blue-50">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2 text-blue-800">
            <Server className="w-4 h-4" />
            Atualização Automática via EasyPanel
            <Badge className="bg-blue-100 text-blue-700 text-xs">Novo</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-blue-700">
            Atualiza <code className="bg-blue-100 px-1 rounded font-mono text-xs">CONFIG_SESSION_PHONE_VERSION</code> diretamente no EasyPanel e reinicia apenas o serviço da Evolution API. Não apaga instâncias nem sessões.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => atualizarViaEasyPanel(false)}
              disabled={loadingEasyPanel || loadingTesteEP}
              className="bg-blue-600 hover:bg-blue-700 text-white gap-2"
            >
              <Zap className={`w-4 h-4 ${loadingEasyPanel ? 'animate-spin' : ''}`} />
              {loadingEasyPanel ? 'Atualizando EasyPanel...' : 'Atualizar EasyPanel + Reiniciar'}
            </Button>
            <Button
              onClick={() => atualizarViaEasyPanel(true)}
              disabled={loadingEasyPanel || loadingTesteEP}
              variant="outline"
              className="gap-2 border-orange-300 text-orange-700 hover:bg-orange-50"
            >
              <Shield className="w-4 h-4" />
              Forçar (ignorar proteção 15min)
            </Button>
            <Button
              onClick={testarEasyPanel}
              disabled={loadingEasyPanel || loadingTesteEP}
              variant="outline"
              className="gap-2 border-slate-300 text-slate-600 hover:bg-slate-50"
            >
              <TestTube2 className={`w-4 h-4 ${loadingTesteEP ? 'animate-spin' : ''}`} />
              {loadingTesteEP ? 'Testando...' : 'Testar Conexão EasyPanel'}
            </Button>
          </div>

          {/* Resultado do EasyPanel */}
          {resultadoEasyPanel && (
            <div className={`mt-3 p-3 rounded-lg border text-xs font-mono overflow-auto max-h-48 ${resultadoEasyPanel.success === false ? 'bg-red-50 border-red-200 text-red-800' : 'bg-green-50 border-green-200 text-green-800'}`}>
              {resultadoEasyPanel.tipo === 'teste' ? (
                <div className="space-y-1">
                  <p className="font-bold text-sm mb-2">🔬 Resultado do Teste EasyPanel:</p>
                  {resultadoEasyPanel.testes?.map((t, i) => (
                    <div key={i} className={`p-1.5 rounded ${t.ok ? 'bg-green-100' : 'bg-red-100'}`}>
                      <span className="font-semibold">{t.ok ? '✅' : '❌'} {t.endpoint}</span>
                      <span className="ml-2 text-slate-600">[{t.status}]</span>
                      <pre className="mt-1 whitespace-pre-wrap break-all text-xs">{t.resposta ? JSON.stringify(t.resposta, null, 2).substring(0, 300) : ''}</pre>
                    </div>
                  ))}
                </div>
              ) : (
                <div>
                  <p className="font-bold text-sm mb-1">{resultadoEasyPanel.success ? '✅ Sucesso!' : '❌ Falhou'}</p>
                  {resultadoEasyPanel.versao_nova && <p>Versão aplicada: <strong>{resultadoEasyPanel.versao_nova}</strong></p>}
                  {resultadoEasyPanel.reiniciou !== undefined && <p>Serviço reiniciado: {resultadoEasyPanel.reiniciou ? '✅ Sim' : '❌ Não'}</p>}
                  {resultadoEasyPanel.instancias_conectadas !== undefined && <p>Instâncias online: {resultadoEasyPanel.instancias_conectadas}/{resultadoEasyPanel.instancias?.length || 0}</p>}
                  {resultadoEasyPanel.error && <p className="text-red-600 mt-1">Erro: {resultadoEasyPanel.error}</p>}
                  {resultadoEasyPanel.aviso && <p className="text-orange-600 mt-1">⚠️ {resultadoEasyPanel.aviso}</p>}
                  {resultadoEasyPanel.bloqueado && <p className="text-orange-700 mt-1">🔒 Protegido: próximo reinício em {resultadoEasyPanel.proximo_restart_em} min</p>}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

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