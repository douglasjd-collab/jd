import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Instagram, Copy, CheckCircle2, Info, ExternalLink, Webhook } from 'lucide-react';
import { toast } from 'sonner';

const WEBHOOK_URL = 'https://app-6950a9860c8af0e2ff10fc9e.base44.app/api/apps/6950a9860c8af0e2ff10fc9e/functions/webhookMetaPublico';
const VERIFY_TOKEN = 'WAZE_CRM_WEBHOOK_2024';

export default function IntegracaoInstagram() {
  const [copied, setCopied] = useState(null);

  const copiar = (texto, chave) => {
    navigator.clipboard.writeText(texto);
    setCopied(chave);
    toast.success('Copiado!');
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Status */}
      <Card className="border-l-4 border-l-pink-500 bg-gradient-to-br from-pink-50 to-white">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-gradient-to-br from-pink-500 to-purple-600">
              <Instagram className="w-5 h-5 text-white" />
            </div>
            <div>
              <CardTitle>Instagram Direct — Integração via Meta</CardTitle>
              <CardDescription>Receba mensagens do Instagram Direct diretamente no Bate-Papo</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg">
            <CheckCircle2 className="w-5 h-5 text-green-600" />
            <span className="text-sm font-medium text-green-800">
              Webhook configurado e pronto para receber mensagens do Instagram
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Dados do Webhook */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Webhook className="w-5 h-5 text-pink-600" />
            Dados do Webhook
          </CardTitle>
          <CardDescription>Use estas informações no painel do Meta for Developers</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>URL de Retorno de Chamada (Callback URL)</Label>
            <div className="flex gap-2">
              <Input value={WEBHOOK_URL} readOnly className="font-mono text-xs bg-slate-50" />
              <Button
                variant="outline"
                size="icon"
                onClick={() => copiar(WEBHOOK_URL, 'url')}
              >
                {copied === 'url' ? <CheckCircle2 className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Verificar Token (Verify Token)</Label>
            <div className="flex gap-2">
              <Input value={VERIFY_TOKEN} readOnly className="font-mono text-sm bg-slate-50" />
              <Button
                variant="outline"
                size="icon"
                onClick={() => copiar(VERIFY_TOKEN, 'token')}
              >
                {copied === 'token' ? <CheckCircle2 className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Passo a passo */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Info className="w-5 h-5 text-blue-600" />
            Como configurar no Meta for Developers
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            {[
              {
                n: 1,
                titulo: 'Acesse o Meta for Developers',
                desc: 'Vá em developers.facebook.com → Meus Aplicativos → selecione o app do Instagram',
              },
              {
                n: 2,
                titulo: 'Configure o Webhook (Seção 3)',
                desc: 'Cole a URL de Callback e o Verify Token acima. Clique em "Verificar e Salvar".',
              },
              {
                n: 3,
                titulo: 'Inscreva no campo "messages"',
                desc: 'Na lista de Campos do Webhook, encontre "messages" e clique em "Inscrever-se".',
              },
              {
                n: 4,
                titulo: 'Configure o Login Comercial (Seção 4)',
                desc: 'Clique em "Configurar" e coloque como URL de redirecionamento: https://app-6950a9860c8af0e2ff10fc9e.base44.app',
              },
              {
                n: 5,
                titulo: 'Publique o aplicativo',
                desc: 'O app precisa estar publicado (não em modo de desenvolvimento) para receber mensagens de usuários externos.',
              },
            ].map(({ n, titulo, desc }) => (
              <div key={n} className="flex gap-3">
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-pink-500 to-purple-600 text-white text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                  {n}
                </div>
                <div>
                  <p className="font-medium text-sm text-slate-900">{titulo}</p>
                  <p className="text-xs text-slate-600 mt-0.5">{desc}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="pt-2">
            <Button
              variant="outline"
              className="gap-2 border-pink-300 text-pink-700 hover:bg-pink-50"
              onClick={() => window.open('https://developers.facebook.com/apps', '_blank')}
            >
              <ExternalLink className="w-4 h-4" />
              Abrir Meta for Developers
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Como funciona */}
      <Card className="bg-slate-50 border-dashed">
        <CardContent className="pt-4">
          <div className="flex gap-3">
            <Instagram className="w-5 h-5 text-pink-500 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-slate-700 space-y-1">
              <p className="font-medium">Como funciona após configurado:</p>
              <ul className="space-y-1 text-xs text-slate-600 list-disc list-inside">
                <li>Mensagens do Instagram Direct chegam automaticamente no <strong>Bate-Papo</strong></li>
                <li>O contato é identificado pelo PSID do Instagram (ID único do usuário)</li>
                <li>Imagens e vídeos são suportados</li>
                <li>Você pode responder pelo Bate-Papo normalmente</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}