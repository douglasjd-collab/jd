import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Flame, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';

export default function SincronizacaoAgressivaMensagens() {
  const [telefone, setTelefone] = useState('558791426333');
  const [loading, setLoading] = useState(false);
  const [resultado, setResultado] = useState(null);

  const handleSincronizar = async () => {
    if (!telefone) {
      toast.error('Preencha o telefone');
      return;
    }

    setLoading(true);
    setResultado(null);

    try {
      const response = await base44.functions.invoke('forcarSincronizacaoMensagensAgressiva', {
        telefone,
      });

      setResultado(response.data);
      toast.success(`✅ ${response.data.sincronizadas} mensagens sincronizadas!`);
    } catch (error) {
      toast.error('Erro: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-red-50 to-orange-100 p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-red-800 mb-2">🔥 Sincronização AGRESSIVA</h1>
          <p className="text-red-700">Força TODAS as mensagens da Evolution para o CRM</p>
        </div>

        {/* Aviso */}
        <Card className="border-red-400 bg-red-50">
          <CardContent className="pt-6">
            <p className="text-red-800 font-bold">⚠️ ATENÇÃO!</p>
            <p className="text-red-700 mt-2">
              Esta operação vai:
            </p>
            <ul className="text-red-700 mt-2 ml-4 space-y-1">
              <li>✅ Puxar TODAS as mensagens da Evolution API</li>
              <li>✅ Criar cliente automaticamente se não existir</li>
              <li>✅ Criar conversa automaticamente se não existir</li>
              <li>✅ Inserir todas as mensagens no CRM</li>
              <li>⏭️ Pular mensagens duplicadas</li>
            </ul>
          </CardContent>
        </Card>

        {/* Input */}
        <Card>
          <CardContent className="pt-6 space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">Telefone (apenas números)</label>
              <Input
                placeholder="558791426333"
                value={telefone}
                onChange={(e) => setTelefone(e.target.value)}
                disabled={loading}
              />
            </div>

            <Button
              onClick={handleSincronizar}
              disabled={loading}
              className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-6 text-lg"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  Sincronizando AGRESSIVAMENTE...
                </>
              ) : (
                <>
                  <Flame className="w-5 h-5 mr-2" />
                  FORÇAR SINCRONIZAÇÃO AGRESSIVA
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Resultado */}
        {resultado && (
          <Card className="border-green-400 bg-green-50">
            <CardHeader className="bg-green-100 border-b">
              <CardTitle className="flex items-center gap-2">
                <CheckCircle className="w-6 h-6 text-green-600" />
                ✅ Sincronização Concluída!
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6 space-y-4">
              <div className="grid md:grid-cols-2 gap-4">
                <div className="bg-white p-4 rounded border">
                  <p className="text-sm text-gray-600">Total na Evolution</p>
                  <p className="text-3xl font-bold text-blue-600">{resultado.total_evolution}</p>
                </div>
                <div className="bg-white p-4 rounded border border-green-300">
                  <p className="text-sm text-gray-600">Sincronizadas</p>
                  <p className="text-3xl font-bold text-green-600">{resultado.sincronizadas}</p>
                </div>
                <div className="bg-white p-4 rounded border">
                  <p className="text-sm text-gray-600">Duplicatas (puladas)</p>
                  <p className="text-3xl font-bold text-amber-600">{resultado.duplicatas}</p>
                </div>
                <div className="bg-white p-4 rounded border">
                  <p className="text-sm text-gray-600">Erros</p>
                  <p className="text-3xl font-bold text-red-600">{resultado.erros}</p>
                </div>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded p-4">
                <p className="text-sm text-blue-800">
                  <strong>Cliente:</strong> {resultado.cliente_id}
                </p>
                <p className="text-sm text-blue-800 mt-1">
                  <strong>Conversa:</strong> {resultado.conversa_id}
                </p>
              </div>

              <Button
                onClick={() => window.location.href = '/StatusRecebimentoMensagens?telefone=' + telefone}
                className="w-full bg-blue-600 hover:bg-blue-700"
              >
                Ver Status Agora
              </Button>
            </CardContent>
          </Card>
        )}

        {!resultado && !loading && (
          <Card className="text-center py-12 bg-white">
            <p className="text-gray-600">
              Clique em "FORÇAR SINCRONIZAÇÃO AGRESSIVA" para puxar todas as mensagens da Evolution
            </p>
          </Card>
        )}
      </div>
    </div>
  );
}