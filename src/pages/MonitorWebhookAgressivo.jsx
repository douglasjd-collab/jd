import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, RefreshCw, Send, CheckCircle, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

export default function MonitorWebhookAgressivo() {
  const [telefone, setTelefone] = useState('558791426333');
  const [mensagem, setMensagem] = useState('Teste agressivo');
  const [loading, setLoading] = useState(false);
  const [logs, setLogs] = useState([]);
  const [stats, setStats] = useState(null);

  // Carregar últimas mensagens
  const loadStats = async () => {
    try {
      const empresas = await base44.asServiceRole.entities.Empresa.filter({ status: 'ativa' });
      if (!empresas.length) return;

      const empresaId = empresas[0].id;

      // Total de conversas
      const conversas = await base44.asServiceRole.entities.ConversaWhatsapp.filter(
        { empresa_id: empresaId },
        '-created_date',
        1000
      );

      // Total de mensagens
      const mensagens = await base44.asServiceRole.entities.MensagemWhatsapp.filter(
        { empresa_id: empresaId },
        '-created_date',
        1000
      );

      const recebidas = mensagens.filter(m => m.remetente === 'cliente').length;
      const enviadas = mensagens.filter(m => m.remetente === 'vendedor').length;

      setStats({
        totalConversas: conversas.length,
        totalMensagens: mensagens.length,
        recebidas,
        enviadas,
        ultimaMensagem: mensagens[0],
      });
    } catch (err) {
      console.error('Erro ao carregar stats:', err);
    }
  };

  useEffect(() => {
    loadStats();
    const interval = setInterval(loadStats, 3000); // Atualizar a cada 3s
    return () => clearInterval(interval);
  }, []);

  // Testar webhook agressivo
  const handleTestarAgressivo = async () => {
    if (!telefone || !mensagem) {
      toast.error('Preencha telefone e mensagem');
      return;
    }

    setLoading(true);
    const novoLog = {
      id: Date.now(),
      timestamp: new Date().toLocaleTimeString('pt-BR'),
      telefone,
      mensagem: mensagem.slice(0, 30),
      status: 'processando',
    };

    setLogs(prev => [novoLog, ...prev].slice(0, 20));

    try {
      const response = await base44.functions.invoke('receberWebhookWhatsAppAgressivo', {
        data: {
          message: {
            from: telefone,
            body: mensagem,
            id: `test_${Date.now()}`,
            contact: { name: `Teste ${telefone}` },
          },
        },
      });

      setLogs(prev => prev.map(l => 
        l.id === novoLog.id 
          ? { ...l, status: 'sucesso', conversaId: response.data.conversaId }
          : l
      ));

      toast.success('✅ Webhook processado!');
      setMensagem('');
      setTimeout(loadStats, 500);

    } catch (error) {
      setLogs(prev => prev.map(l => 
        l.id === novoLog.id 
          ? { ...l, status: 'erro', erro: error.message }
          : l
      ));
      toast.error('❌ Erro: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-red-50 to-orange-100 p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-800 mb-2">🚀 Monitor Webhook AGRESSIVO</h1>
          <p className="text-gray-600">Teste o webhook sem filtros - SALVA TUDO</p>
        </div>

        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="bg-white border-red-200">
              <CardContent className="pt-6">
                <p className="text-sm text-gray-600">Conversas</p>
                <p className="text-3xl font-bold text-red-600">{stats.totalConversas}</p>
              </CardContent>
            </Card>
            <Card className="bg-white border-orange-200">
              <CardContent className="pt-6">
                <p className="text-sm text-gray-600">Mensagens Total</p>
                <p className="text-3xl font-bold text-orange-600">{stats.totalMensagens}</p>
              </CardContent>
            </Card>
            <Card className="bg-white border-blue-200">
              <CardContent className="pt-6">
                <p className="text-sm text-gray-600">Recebidas</p>
                <p className="text-3xl font-bold text-blue-600">{stats.recebidas}</p>
              </CardContent>
            </Card>
            <Card className="bg-white border-green-200">
              <CardContent className="pt-6">
                <p className="text-sm text-gray-600">Enviadas</p>
                <p className="text-3xl font-bold text-green-600">{stats.enviadas}</p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Teste */}
        <Card className="shadow-lg">
          <CardHeader className="bg-red-50 border-b">
            <CardTitle className="flex items-center gap-2">
              <Send className="w-5 h-5" />
              Testar Webhook Agressivo
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6 space-y-4">
            <div className="grid md:grid-cols-3 gap-4">
              <Input
                placeholder="Telefone"
                value={telefone}
                onChange={(e) => setTelefone(e.target.value)}
                disabled={loading}
              />
              <Input
                placeholder="Mensagem"
                value={mensagem}
                onChange={(e) => setMensagem(e.target.value)}
                disabled={loading}
              />
              <Button
                onClick={handleTestarAgressivo}
                disabled={loading}
                className="bg-red-600 hover:bg-red-700"
              >
                {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                Enviar
              </Button>
            </div>
            <Button
              onClick={loadStats}
              variant="outline"
              className="w-full"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Atualizar Stats
            </Button>
          </CardContent>
        </Card>

        {/* Logs */}
        <Card className="shadow-lg">
          <CardHeader className="bg-slate-50 border-b">
            <CardTitle className="text-lg">📋 Histórico ({logs.length})</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {logs.length === 0 ? (
                <p className="text-gray-500 text-center py-8">Nenhum teste realizado</p>
              ) : (
                logs.map(log => (
                  <div
                    key={log.id}
                    className={`p-3 rounded border ${
                      log.status === 'sucesso'
                        ? 'bg-green-50 border-green-200'
                        : log.status === 'erro'
                        ? 'bg-red-50 border-red-200'
                        : 'bg-yellow-50 border-yellow-200'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          {log.status === 'sucesso' && <CheckCircle className="w-4 h-4 text-green-600" />}
                          {log.status === 'erro' && <AlertCircle className="w-4 h-4 text-red-600" />}
                          <span className="font-mono text-sm">{log.telefone}</span>
                        </div>
                        <p className="text-sm text-gray-600 mt-1">{log.mensagem}</p>
                        {log.erro && <p className="text-xs text-red-600 mt-1">Erro: {log.erro}</p>}
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-gray-500">{log.timestamp}</p>
                        <p className={`text-xs font-bold ${
                          log.status === 'sucesso' ? 'text-green-600' : 
                          log.status === 'erro' ? 'text-red-600' : 
                          'text-yellow-600'
                        }`}>
                          {log.status.toUpperCase()}
                        </p>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        {/* Info */}
        <Card className="bg-orange-50 border-orange-200">
          <CardHeader>
            <CardTitle className="text-lg">⚡ Modo Agressivo Ativado</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-gray-700">
            <p>✅ Sem verificação de duplicata</p>
            <p>✅ Cria empresa/cliente/conversa automaticamente</p>
            <p>✅ Detecta remetente (cliente vs vendedor)</p>
            <p>✅ Salva QUALQUER mensagem que chegar</p>
            <p>✅ Logs em tempo real a cada 3 segundos</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}