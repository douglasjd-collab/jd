import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Download, MessageCircle } from 'lucide-react';
import { toast } from 'sonner';

export default function ExportarHistoricoConversa() {
  const [telefone, setTelefone] = useState('558791426333');
  const [loading, setLoading] = useState(false);
  const [historico, setHistorico] = useState(null);
  const [resumo, setResumo] = useState(null);

  const handlePuxarHistorico = async () => {
    if (!telefone) {
      toast.error('Preencha o telefone');
      return;
    }

    setLoading(true);
    setHistorico(null);
    setResumo(null);

    try {
      const response = await base44.functions.invoke('exportarHistoricoConversaBD', {
        telefone,
      });

      if (response.data.success) {
        setResumo(response.data.resumo);
        setHistorico(response.data.historico);
        toast.success('Histórico carregado!');
      } else {
        toast.error(response.data.error);
      }
    } catch (error) {
      toast.error('Erro: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleExportarCSV = () => {
    if (!historico || historico.length === 0) {
      toast.error('Nenhuma mensagem para exportar');
      return;
    }

    const csv = [
      ['Sequência', 'Data/Hora', 'Remetente', 'Tipo', 'Conteúdo', 'Usuário'].join(','),
      ...historico.map(msg => [
        msg.sequencia,
        msg.data_hora,
        msg.remetente,
        msg.tipo,
        `"${msg.conteudo.replace(/"/g, '""')}"`,
        msg.usuario,
      ].join(','))
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `historico_${resumo.telefone}_${new Date().getTime()}.csv`);
    link.click();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-100 p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-800 mb-2">📜 Histórico de Conversa</h1>
          <p className="text-gray-600">Puxe e exporte o histórico completo do WhatsApp</p>
        </div>

        {/* Input */}
        <Card className="shadow-lg">
          <CardHeader className="bg-blue-50 border-b">
            <CardTitle className="flex items-center gap-2">
              <MessageCircle className="w-5 h-5" />
              Buscar Conversa
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6 space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">Telefone (apenas números)</label>
              <div className="flex gap-2">
                <Input
                  placeholder="558791426333"
                  value={telefone}
                  onChange={(e) => setTelefone(e.target.value)}
                  disabled={loading}
                  className="flex-1"
                />
                <Button
                  onClick={handlePuxarHistorico}
                  disabled={loading}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                  Puxar
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Resumo */}
        {resumo && (
          <Card className="shadow-lg bg-gradient-to-r from-blue-50 to-indigo-50">
            <CardHeader className="border-b bg-white/50">
              <CardTitle className="text-lg">📊 Resumo</CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <p className="text-sm text-gray-600">Cliente</p>
                  <p className="font-bold text-lg">{resumo.cliente_nome}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Total de Mensagens</p>
                  <p className="font-bold text-lg">{resumo.total_mensagens}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Do Cliente</p>
                  <p className="font-bold text-lg text-blue-600">{resumo.mensagens_cliente}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Do Vendedor</p>
                  <p className="font-bold text-lg text-green-600">{resumo.mensagens_vendedor}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Primeira Mensagem</p>
                  <p className="text-sm">{resumo.primeira_mensagem}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Última Mensagem</p>
                  <p className="text-sm">{resumo.ultima_mensagem}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Duração</p>
                  <p className="font-bold text-lg">{resumo.duracao_dias} dias</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Telefone</p>
                  <p className="font-mono text-sm">{resumo.telefone}</p>
                </div>
              </div>

              {historico && historico.length > 0 && (
                <Button
                  onClick={handleExportarCSV}
                  className="mt-4 bg-green-600 hover:bg-green-700"
                >
                  <Download className="w-4 h-4 mr-2" />
                  Exportar CSV
                </Button>
              )}
            </CardContent>
          </Card>
        )}

        {/* Histórico de Mensagens */}
        {historico && historico.length > 0 && (
          <Card className="shadow-lg">
            <CardHeader className="bg-slate-50 border-b sticky top-0 z-10">
              <CardTitle className="text-lg">💬 {historico.length} Mensagens</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="space-y-1 max-h-[600px] overflow-y-auto">
                {historico.map((msg, idx) => (
                  <div
                    key={idx}
                    className={`p-3 rounded border ${
                      msg.remetente === '👤 Cliente'
                        ? 'bg-blue-50 border-blue-200 ml-0'
                        : 'bg-green-50 border-green-200 mr-0'
                    }`}
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <p className="font-semibold text-sm">{msg.remetente}</p>
                        <p className="text-sm text-gray-600">{msg.tipo} {msg.conteudo.slice(0, 80)}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-gray-500 ml-2 whitespace-nowrap">{msg.data_hora}</p>
                        {msg.usuario && <p className="text-xs text-gray-500 ml-2">{msg.usuario}</p>}
                      </div>
                    </div>
                    {msg.conteudo.length > 80 && (
                      <p className="text-sm text-gray-700 mt-2 p-2 bg-white/50 rounded">
                        {msg.conteudo}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Vazio */}
        {!historico && !loading && (
          <Card className="text-center py-12">
            <MessageCircle className="w-16 h-16 mx-auto text-gray-300 mb-4" />
            <p className="text-gray-500">Clique em "Puxar" para carregar o histórico da conversa</p>
          </Card>
        )}

        {loading && (
          <Card className="text-center py-12">
            <Loader2 className="w-8 h-8 mx-auto animate-spin text-blue-600 mb-4" />
            <p className="text-gray-600">Carregando histórico...</p>
          </Card>
        )}
      </div>
    </div>
  );
}