import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Copy, CheckCircle2, Info, ExternalLink, Webhook, Save, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

const WEBHOOK_URL = 'https://app-6950a9860c8af0e2ff10fc9e.base44.app/api/apps/6950a9860c8af0e2ff10fc9e/functions/webhookMetaPublico';
const VERIFY_TOKEN = 'WAZE_CRM_WEBHOOK_2024';

export default function IntegracaoInstagram({ empresaId }) {
  const [copied, setCopied] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [conectado, setConectado] = useState(false);
  const [form, setForm] = useState({
    instagram_user_id: '',
    instagram_access_token: '',
    instagram_username: '',
  });

  useEffect(() => {
    if (!empresaId) return;
    base44.entities.Empresa.list().then(res => {
      const emp = res?.find(e => e.id === empresaId);
      if (emp) {
        const uid = emp.instagram_user_id || '';
        const token = emp.instagram_access_token || '';
        setForm({
          instagram_user_id: uid,
          instagram_access_token: token,
          instagram_username: emp.instagram_username || '',
        });
        setConectado(!!(uid && token));
      }
    });
  }, [empresaId]);

  const copiar = (texto, chave) => {
    navigator.clipboard.writeText(texto);
    setCopied(chave);
    toast.success('Copiado!');
    setTimeout(() => setCopied(null), 2000);
  };

  const handleSalvar = async () => {
    if (!empresaId) { toast.error('Empresa não encontrada'); return; }
    if (!form.instagram_user_id || !form.instagram_access_token) {
      toast.error('Preencha o Instagram User ID e o Access Token');
      return;
    }
    setSalvando(true);
    try {
      await base44.entities.Empresa.update(empresaId, {
        ...form,
        instagram_conectado: true,
      });
      setConectado(true);
      toast.success('Configuração do Instagram salva com sucesso!');
    } catch (err) {
      toast.error('Erro ao salvar: ' + err.message);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Status */}
      <Card className="border-l-4 border-l-pink-500 bg-gradient-to-br from-pink-50 to-white">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-gradient-to-br from-pink-500 to-purple-600 text-2xl flex items-center justify-center">
              📸
            </div>
            <div>
              <CardTitle>Instagram Direct — Integração via Meta</CardTitle>
              <CardDescription>Receba mensagens do Instagram Direct diretamente no Bate-Papo</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {conectado ? (
            <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg">
              <CheckCircle2 className="w-5 h-5 text-green-600" />
              <span className="text-sm font-medium text-green-800">
                Instagram conectado — @{form.instagram_username || form.instagram_user_id}
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <Info className="w-5 h-5 text-amber-600" />
              <span className="text-sm font-medium text-amber-800">
                Instagram não configurado. Preencha os dados abaixo e clique em Salvar.
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Credenciais Instagram */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Save className="w-5 h-5 text-pink-600" />
            Credenciais da Conta Instagram
          </CardTitle>
          <CardDescription>Cole aqui os dados gerados no Meta for Developers</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Instagram User ID</Label>
            <Input
              value={form.instagram_user_id}
              onChange={e => setForm(f => ({ ...f, instagram_user_id: e.target.value }))}
              placeholder="Ex: 17841415547922478"
              className="font-mono"
            />
            <p className="text-xs text-slate-500">O ID numérico exibido abaixo do nome da conta no token gerado</p>
          </div>

          <div className="space-y-2">
            <Label>Access Token</Label>
            <Input
              value={form.instagram_access_token}
              onChange={e => setForm(f => ({ ...f, instagram_access_token: e.target.value }))}
              placeholder="IGAAvY..."
              className="font-mono text-xs"
            />
            <p className="text-xs text-slate-500">Token de acesso gerado no Meta for Developers (mantê-lo seguro)</p>
          </div>

          <div className="space-y-2">
            <Label>Username Instagram (opcional)</Label>
            <Input
              value={form.instagram_username}
              onChange={e => setForm(f => ({ ...f, instagram_username: e.target.value }))}
              placeholder="Ex: growsalesgroup"
            />
          </div>

          <Button
            onClick={handleSalvar}
            disabled={salvando}
            className="bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-600 hover:to-purple-700 text-white gap-2"
          >
            {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Salvar Configuração
          </Button>
        </CardContent>
      </Card>

      {/* Dados do Webhook */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Webhook className="w-5 h-5 text-pink-600" />
            Dados do Webhook (Meta for Developers)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>URL de Retorno de Chamada</Label>
            <div className="flex gap-2">
              <Input value={WEBHOOK_URL} readOnly className="font-mono text-xs bg-slate-50" />
              <Button variant="outline" size="icon" onClick={() => copiar(WEBHOOK_URL, 'url')}>
                {copied === 'url' ? <CheckCircle2 className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Verificar Token</Label>
            <div className="flex gap-2">
              <Input value={VERIFY_TOKEN} readOnly className="font-mono text-sm bg-slate-50" />
              <Button variant="outline" size="icon" onClick={() => copiar(VERIFY_TOKEN, 'token')}>
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
        <CardContent className="space-y-3">
          {[
            { n: 1, titulo: 'Gere o Access Token', desc: 'No Meta for Developers → seu app → Instagram → Gerar Token. Copie o User ID e o Access Token.' },
            { n: 2, titulo: 'Cole aqui e salve', desc: 'Preencha os campos acima com o User ID e o Access Token gerado.' },
            { n: 3, titulo: 'Configure o Webhook (Seção 3)', desc: 'Cole a URL de Callback e o Verify Token acima. Clique em "Verificar e Salvar". Assine o campo "messages".' },
            { n: 4, titulo: 'Configure o Login Comercial (Seção 4)', desc: 'URL de redirecionamento: https://app-6950a9860c8af0e2ff10fc9e.base44.app' },
            { n: 5, titulo: 'Publique o aplicativo', desc: 'O app precisa estar publicado para receber mensagens de usuários externos.' },
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
    </div>
  );
}