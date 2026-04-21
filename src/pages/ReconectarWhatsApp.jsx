import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { QrCode, RefreshCw, CheckCircle2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

export default function ReconectarWhatsApp() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(false);
  const [qrCode, setQrCode] = useState(null);
  const [status, setStatus] = useState(null);

  useEffect(() => {
    base44.auth.me().then(setUser).catch(() => {});
  }, []);

  const buscarQrCode = async () => {
    setLoading(true);
    try {
      const res = await base44.functions.invoke('gerarQrCodeEvolution', {});
      if (res.data.qrcode) {
        setQrCode(res.data.qrcode);
        setStatus('Escaneie o QR Code com seu WhatsApp');
      } else {
        toast.error(res.data.erro || 'Erro ao gerar QR Code');
      }
    } catch (err) {
      toast.error('Erro: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const testarConexao = async () => {
    setLoading(true);
    try {
      const res = await base44.functions.invoke('diagnosticoRecebimentoMensagensCompleto', {});
      if (res.data.diagnostico.instancia.ok) {
        toast.success('✅ Instância conectada!');
        setStatus('Instância conectada com sucesso');
      } else {
        toast.error('❌ Instância ainda não conectada');
        setStatus('Aguarde alguns segundos e tente novamente');
      }
    } catch (err) {
      toast.error('Erro: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-6">
      <div className="max-w-md mx-auto">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <QrCode className="w-5 h-5" />
              Reconectar WhatsApp
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <div className="flex gap-2">
                <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-amber-900">
                  <p className="font-semibold mb-1">Instância desconectada</p>
                  <p>Escaneie o QR Code com seu WhatsApp para reconectar.</p>
                </div>
              </div>
            </div>

            {qrCode ? (
              <div className="space-y-4">
                <div className="bg-white p-4 rounded-lg border">
                  <img 
                    src={qrCode} 
                    alt="QR Code" 
                    className="w-full aspect-square object-contain"
                  />
                </div>
                <p className="text-sm text-slate-600 text-center">
                  {status}
                </p>
              </div>
            ) : null}

            <div className="space-y-2">
              <Button
                onClick={buscarQrCode}
                disabled={loading}
                className="w-full"
              >
                {loading ? (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    Gerando QR Code...
                  </>
                ) : (
                  <>
                    <QrCode className="w-4 h-4 mr-2" />
                    Gerar QR Code
                  </>
                )}
              </Button>

              {qrCode && (
                <Button
                  onClick={testarConexao}
                  disabled={loading}
                  variant="outline"
                  className="w-full"
                >
                  {loading ? (
                    <>
                      <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                      Testando...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4 mr-2" />
                      Verificar Conexão
                    </>
                  )}
                </Button>
              )}
            </div>

            <div className="text-xs text-slate-500 space-y-1">
              <p>📱 Instruções:</p>
              <ol className="list-decimal list-inside space-y-1">
                <li>Clique em "Gerar QR Code"</li>
                <li>Abra WhatsApp no seu celular</li>
                <li>Vá para Configurações → Aparelhos conectados</li>
                <li>Escaneie o QR Code</li>
                <li>Clique em "Verificar Conexão"</li>
              </ol>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}