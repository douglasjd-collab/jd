import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckCircle2, RefreshCw, Trash2, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

/**
 * Card "Instâncias WhatsApp" — exibe a conexão ativa da API Oficial Meta
 * (telefone, WABA, Phone ID, nome verificado, status) quando as credenciais
 * já estão salvas na empresa.
 */
export default function InstanciasWhatsAppMeta({ empresa, onSync, syncLoading = false, onDesconectar }) {
  if (!empresa) return null;
  const temCredenciais = Boolean(empresa.whatsapp_access_token && empresa.whatsapp_phone_number_id);
  if (!temCredenciais) return null;

  const conectado = (empresa.meta_phone_status === 'CONNECTED') || empresa.whatsapp_conectado;

  const ultimaConexao = empresa.whatsapp_token_atualizado_em
    ? new Date(empresa.whatsapp_token_atualizado_em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'medium' })
    : '—';

  return (
    <Card className="border-2 border-emerald-200 bg-gradient-to-br from-emerald-50/50 to-white">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2">
          <span>📲</span> Instâncias WhatsApp
        </CardTitle>
        <p className="text-sm text-slate-500">Acompanhe o status da sua conexão com a API Oficial Meta</p>
        <div className="text-xs text-slate-600 mt-1">
          <span><strong className="text-emerald-700">Conectadas: 1</strong> | Conectando: 0 | Desconectadas: 0</span>
        </div>
      </CardHeader>

      <CardContent>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          {/* Topo do card */}
          <div className="flex items-center justify-between gap-3 p-3 border-b border-slate-100">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-lg bg-[#007BFF] text-white flex items-center justify-center font-bold text-sm flex-shrink-0">
                <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor">
                  <path d="M12 2a10 10 0 0 0-9 14.4L2 22l5.8-1A10 10 0 1 0 12 2Zm0 18a8 8 0 0 1-4.2-1.2l-.3-.2-3.4.6.6-3.3-.2-.3A8 8 0 1 1 12 20Zm4.4-5.9c-.2-.1-1.4-.7-1.7-.8s-.4-.1-.6.1-.7.8-.8 1-.3.2-.5.1a6.5 6.5 0 0 1-1.9-1.2 7.3 7.3 0 0 1-1.4-1.7c-.1-.2 0-.4.1-.5l.4-.5.3-.5v-.4l-.8-1.9c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3A2.8 2.8 0 0 0 6.4 10a5 5 0 0 0 1 2.4 11 11 0 0 0 4.3 3.8c.6.3 1.1.4 1.5.4a2.4 2.4 0 0 0 1.5-1.1 2 2 0 0 0 .1-1.1c0-.1-.2-.2-.4-.3Z"/>
                </svg>
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-bold text-sm truncate">WhatsApp Oficial</p>
                  <Badge className="bg-emerald-500 hover:bg-emerald-500 text-white">API Oficial</Badge>
                </div>
                <p className="text-xs text-slate-500 truncate">{empresa.meta_display_phone_number || empresa.whatsapp_phone_number_id}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {conectado ? (
                <Badge className="bg-emerald-500 hover:bg-emerald-500 text-white gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> Conectado</Badge>
              ) : (
                <Badge variant="secondary" className="gap-1 text-amber-700 bg-amber-100">Aguardando</Badge>
              )}
              {onSync && (
                <Button variant="ghost" size="icon" onClick={onSync} title="Sincronizar status" className="h-8 w-8 text-slate-500 hover:text-slate-700">
                  {syncLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                </Button>
              )}
              {onDesconectar && (
                <Button variant="ghost" size="icon" onClick={onDesconectar} title="Desconectar" className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50">
                  <Trash2 className="w-4 h-4" />
                </Button>
              )}
            </div>
          </div>

          {/* Corpo do card */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-4 bg-emerald-50/30">
            <div>
              <p className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">NOME</p>
              <p className="font-semibold text-sm truncate">{empresa.meta_verified_name || 'WhatsApp Oficial'}</p>
              <p className="text-xs text-emerald-700">Conectado via login Facebook — credenciais automáticas</p>
              <p className="text-xs text-slate-500 mt-1">WABA: {empresa.whatsapp_business_account_id || '—'}</p>
              <p className="text-xs text-slate-500">Phone ID: {empresa.whatsapp_phone_number_id || '—'}</p>
              <p className="text-xs text-slate-400 mt-1">Gerencie a conexão no painel abaixo.</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">STATUS</p>
              <p className="font-semibold text-sm">{conectado ? 'Conectado' : 'Desconectado'}</p>
              {empresa.meta_quality_rating && (
                <p className="text-xs text-slate-500 mt-1">Qualidade: {empresa.meta_quality_rating}</p>
              )}
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">NÚMERO</p>
              <p className="font-semibold text-sm">{empresa.meta_display_phone_number || '—'}</p>
              <p className="text-xs text-slate-500 mt-1">Última conexão:</p>
              <p className="text-xs text-slate-600">{ultimaConexao}</p>
            </div>
          </div>

          <div className="p-3 border-t border-slate-100 flex justify-end">
            <Button variant="outline" size="sm" onClick={() => window.location.href = '/LogsWebhookDapi'}>
              Ver Logs
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}