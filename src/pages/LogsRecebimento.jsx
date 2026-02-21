import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import PageHeader from '@/components/ui/PageHeader';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CheckCircle2, AlertCircle, Loader2, RefreshCw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

export default function LogsRecebimento() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtroTelefone, setFiltroTelefone] = useState('');
  const [filtroStatus, setFiltroStatus] = useState('todos');

  useEffect(() => {
    carregarLogs();
    const interval = setInterval(carregarLogs, 5000); // Atualizar a cada 5 segundos
    return () => clearInterval(interval);
  }, []);

  const carregarLogs = async () => {
    try {
      setLoading(true);
      // Usar função backend para garantir dados mais recentes (sem cache)
      const resp = await base44.functions.invoke('buscarLogsWebhook', {});
      const todosLogs = resp?.data?.logs || [];
      setLogs(todosLogs);
    } catch (error) {
      console.error('Erro ao carregar logs:', error);
      // Fallback direto
      try {
        const todosLogs = await base44.entities.LogRecebimentoWebhook.list('-created_date', 200);
        setLogs(todosLogs);
      } catch (e2) {
        toast.error('Erro ao carregar logs');
      }
    } finally {
      setLoading(false);
    }
  };

  const logsFiltrarados = logs.filter(log => {
    const matchTelefone = !filtroTelefone || log.telefone?.includes(filtroTelefone);
    const matchStatus = filtroStatus === 'todos' || log.status === filtroStatus;
    return matchTelefone && matchStatus;
  });

  const limparLogs = async () => {
    if (!window.confirm('Tem certeza que deseja limpar todos os logs?')) return;
    
    try {
      // Deletar todos os logs
      const todosLogs = await base44.entities.LogRecebimentoWebhook.list('', 1000);
      for (const log of todosLogs) {
        await base44.entities.LogRecebimentoWebhook.delete(log.id);
      }
      setLogs([]);
      toast.success('Logs limpos com sucesso');
    } catch (error) {
      toast.error('Erro ao limpar logs: ' + error.message);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Registros de Recebimento WhatsApp"
        subtitle="Monitor de eventos recebidos do webhook Evolution API"
      />

      {/* Filtros */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Filtros</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Filtrar por Telefone</label>
              <Input
                placeholder="Ex: 11987654321"
                value={filtroTelefone}
                onChange={(e) => setFiltroTelefone(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Status</label>
              <select
                value={filtroStatus}
                onChange={(e) => setFiltroStatus(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg text-sm"
              >
                <option value="todos">Todos</option>
                <option value="sucesso">Sucesso ✅</option>
                <option value="erro">Erro ❌</option>
              </select>
            </div>
            <div className="flex items-end gap-2">
              <Button
                onClick={carregarLogs}
                variant="outline"
                className="flex-1"
                disabled={loading}
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                Atualizar
              </Button>
              <Button
                onClick={limparLogs}
                variant="destructive"
                size="sm"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Estatísticas */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-3xl font-bold text-green-600">{logs.filter(l => l.status === 'sucesso').length}</div>
              <p className="text-sm text-slate-600 mt-2">Mensagens Recebidas</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-3xl font-bold text-red-600">{logs.filter(l => l.status === 'erro').length}</div>
              <p className="text-sm text-slate-600 mt-2">Erros</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-3xl font-bold text-blue-600">{new Set(logs.map(l => l.telefone)).size}</div>
              <p className="text-sm text-slate-600 mt-2">Clientes Únicos</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Lista de Logs */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Eventos Recebidos ({logsFiltrarados.length})</CardTitle>
          <CardDescription>
            {loading ? 'Carregando...' : `Mostrando ${logsFiltrarados.length} de ${logs.length} eventos`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading && logsFiltrarados.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
            </div>
          ) : logsFiltrarados.length === 0 ? (
            <div className="text-center py-12">
              <AlertCircle className="w-12 h-12 text-slate-300 mx-auto mb-4" />
              <p className="text-slate-500">Nenhum evento encontrado</p>
              <p className="text-sm text-slate-400 mt-2">
                {logs.length === 0 
                  ? 'Envie uma mensagem via WhatsApp para começar a registrar eventos'
                  : 'Ajuste os filtros e tente novamente'}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {logsFiltrarados.map((log) => (
                <div
                  key={log.id}
                  className={`p-4 rounded-lg border-l-4 ${
                    log.status === 'sucesso'
                      ? 'border-l-green-500 bg-green-50'
                      : 'border-l-red-500 bg-red-50'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        {log.status === 'sucesso' ? (
                          <CheckCircle2 className="w-5 h-5 text-green-600" />
                        ) : (
                          <AlertCircle className="w-5 h-5 text-red-600" />
                        )}
                        <span className="font-semibold text-slate-900">
                          {log.tipo_evento === 'mensagem_recebida' && '📨 Mensagem Recebida'}
                          {log.tipo_evento === 'conversa_criada' && '💬 Conversa Criada'}
                          {log.tipo_evento === 'mensagem_salva' && '💾 Mensagem Salva'}
                          {log.tipo_evento === 'erro' && '❌ Erro'}
                        </span>
                        <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                          log.status === 'sucesso'
                            ? 'bg-green-200 text-green-800'
                            : 'bg-red-200 text-red-800'
                        }`}>
                          {log.status === 'sucesso' ? '✅ Sucesso' : '❌ Erro'}
                        </span>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm mt-3">
                        {log.telefone && (
                          <div>
                            <span className="text-slate-600">📱 Telefone:</span>
                            <span className="ml-2 font-mono text-slate-900">{log.telefone}</span>
                          </div>
                        )}
                        {log.conteudo && (
                          <div>
                            <span className="text-slate-600">💬 Conteúdo:</span>
                            <span className="ml-2 text-slate-900">{log.conteudo}</span>
                          </div>
                        )}
                        {log.instancia && (
                          <div>
                            <span className="text-slate-600">🔌 Instância:</span>
                            <span className="ml-2 font-mono text-slate-900">{log.instancia}</span>
                          </div>
                        )}
                        {log.mensagem_erro && (
                          <div className="col-span-2">
                            <span className="text-slate-600">Erro:</span>
                            <span className="ml-2 text-red-600 font-mono">{log.mensagem_erro}</span>
                          </div>
                        )}
                      </div>

                      <div className="text-xs text-slate-500 mt-3">
                        {new Date(log.created_date).toLocaleString('pt-BR')}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}