import React, { useState, useEffect } from 'react';
import { Settings, Link as LinkIcon, Wifi, Loader2, CheckCircle2, XCircle, Power } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import LoginMetaOficialButton from '@/components/configuracoes/LoginMetaOficialButton';
import ConfiguracaoWhatsAppConexoes from '@/components/configuracoes/ConfiguracaoWhatsAppConexoes';

export default function CredenciaisWhatsApp({ empresaId }) {
  const [aba, setAba] = useState('meta');
  const [testando, setTestando] = useState(false);
  const [resultadoTeste, setResultadoTeste] = useState(null); // null | 'ok' | 'erro' | { detalhe }
  const queryClient = useQueryClient();

  const { data: empresa, refetch } = useQuery({
    queryKey: ['empresa-credenciais-meta', empresaId],
    queryFn: async () => {
      if (!empresaId) return null;
      return await base44.entities.Empresa.get(empresaId);
    },
    enabled: !!empresaId,
    // Poll enquanto ainda não conectado para detectar login concluído em outra aba/popup
    refetchInterval: (query) => {
      const e = query.state.data;
      return e && e.whatsapp_access_token && e.whatsapp_phone_number_id ? false : 4000;
    },
  });

  const conectado = !!(empresa?.whatsapp_access_token && empresa?.whatsapp_phone_number_id);

  // Re-busca a empresa quando a aba do CRM volta ao foco (voltou do Facebook/popup)
  useEffect(() => {
    const onFocus = () => refetch();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [refetch]);

  const handleTestar = async () => {
    if (!conectado) {
      toast.error('Faça o login com a Meta primeiro.');
      return;
    }
    setTestando(true);
    setResultadoTeste(null);
    try {
      const resp = await base44.functions.invoke('testarConexaoMetaOficial', {
        phone_number_id: empresa.whatsapp_phone_number_id,
        access_token: empresa.whatsapp_access_token,
      });
      const data = resp.data;
      if (data?.success) {
        setResultadoTeste({ ok: true, detalhe: data });
        toast.success('Conexão confirmada! Credenciais da Meta funcionando.');
      } else {
        setResultadoTeste({ ok: false, detalhe: data?.error || 'Erro desconhecido' });
        toast.error('Erro ao testar conexão: ' + (data?.error || 'Verifique as credenciais.'));
      }
    } catch (e) {
      setResultadoTeste({ ok: false, detalhe: e.message });
      toast.error('Erro ao testar conexão: ' + e.message);
    } finally {
      setTestando(false);
    }
  };

  const handleDesconectar = async () => {
    if (!empresaId) return;
    if (!window.confirm('Desconectar a API Oficial da Meta? Você precisará logar novamente para reativar.')) return;
    try {
      await base44.entities.Empresa.update(empresaId, {
        whatsapp_access_token: '',
        whatsapp_phone_number_id: '',
        whatsapp_business_account_id: '',
        whatsapp_token_tipo: 'temporario',
        meta_phone_status: '',
        meta_display_phone_number: '',
        meta_verified_name: '',
        meta_quality_rating: '',
      });
      setResultadoTeste(null);
      queryClient.invalidateQueries({ queryKey: ['empresa-credenciais-meta', empresaId] });
      toast.success('Conexão Meta desconectada.');
    } catch (e) {
      toast.error('Erro ao desconectar: ' + e.message);
    }
  };

  return (
    <div className="space-y-4">
      {/* Cabeçalho da seção */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Settings className="w-4 h-4 text-slate-600" />
          <h2 className="text-base font-bold text-slate-900">Credenciais WhatsApp</h2>
        </div>
        {aba === 'meta' && conectado && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleDesconectar}
            className="gap-2 text-slate-700"
          >
            <Power className="w-4 h-4" />
            Desconectar
          </Button>
        )}
      </div>

      {/* Navegação de abas */}
      <div className="flex items-center gap-2 border-b border-slate-200">
        <button
          onClick={() => setAba('meta')}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            aba === 'meta'
              ? 'border-slate-900 text-slate-900'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <span className="w-2 h-2 rounded-full bg-emerald-500" />
          Meta Oficial
        </button>
        <button
          onClick={() => setAba('conexoes')}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            aba === 'conexoes'
              ? 'border-slate-900 text-slate-900'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <LinkIcon className="w-3.5 h-3.5" />
          Conexões
        </button>
      </div>

      {/* Conteúdo da aba Meta Oficial */}
      {aba === 'meta' && (
        <div className="space-y-4">
          {/* Bloco de login / conectado */}
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 space-y-4">
            <div className="flex items-start gap-3">
              <span className="mt-1 w-2.5 h-2.5 rounded-full bg-emerald-500 flex-shrink-0" />
              <div>
                <p className="text-sm font-bold text-slate-900">
                  API Oficial do WhatsApp (Meta)
                </p>
                <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                  Faça login com sua conta Meta Business — as credenciais abaixo são preenchidas
                  automaticamente, sem precisar copiar nada manualmente.
                </p>
              </div>
            </div>

            {!conectado ? (
              <LoginMetaOficialButton
                empresaId={empresaId}
                onSuccess={() => {
                  queryClient.invalidateQueries({ queryKey: ['empresa-credenciais-meta', empresaId] });
                  refetch();
                }}
              />
            ) : (
              <div className="flex items-center gap-3 rounded-lg bg-emerald-100 border border-emerald-300 px-4 py-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-700 flex-shrink-0" />
                <div className="text-sm">
                  <p className="font-semibold text-emerald-900">
                    Conectado à Meta
                    {empresa?.meta_display_phone_number
                      ? ` · ${empresa.meta_display_phone_number}`
                      : ''}
                  </p>
                  <p className="text-emerald-800 text-xs">
                    {empresa?.meta_verified_name
                      ? `Perfil: ${empresa.meta_verified_name}`
                      : 'Credenciais salvas no CRM.'}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Bloco Status */}
          <div className="rounded-xl border bg-white p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-bold text-slate-900">Status da API Oficial (Meta)</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  Verifica se as credenciais da API Oficial estão corretas e funcionando.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleTestar}
                disabled={!conectado || testando}
                className="gap-2"
              >
                {testando && <Loader2 className="w-4 h-4 animate-spin" />}
                {!testando && <Wifi className="w-4 h-4" />}
                Testar Conexão
              </Button>
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50/60 px-4 py-3 flex items-start gap-3">
              {resultadoTeste?.ok === true ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
              ) : resultadoTeste?.ok === false ? (
                <XCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
              ) : (
                <Wifi className="w-5 h-5 text-slate-400 flex-shrink-0 mt-0.5" />
              )}
              <div>
                {resultadoTeste?.ok === true && (
                  <>
                    <p className="text-sm font-semibold text-emerald-900">Conexão ativa</p>
                    <p className="text-xs text-emerald-700 mt-0.5">
                      {resultadoTeste.detalhe?.verified_name
                        ? `Perfil: ${resultadoTeste.detalhe.verified_name}`
                        : 'As credenciais da Meta estão funcionando corretamente.'}
                      {resultadoTeste.detalhe?.phone_number
                        ? ` · ${resultadoTeste.detalhe.phone_number}`
                        : ''}
                    </p>
                  </>
                )}
                {resultadoTeste?.ok === false && (
                  <>
                    <p className="text-sm font-semibold text-red-700">Falha na conexão</p>
                    <p className="text-xs text-red-600 mt-0.5">
                      {resultadoTeste.detalhe || 'Verifique se as credenciais ainda são válidas na Meta Business.'}
                    </p>
                  </>
                )}
                {resultadoTeste === null && (
                  <>
                    <p className="text-sm font-semibold text-slate-700">
                      {conectado ? 'Conexão não testada' : 'Sem credenciais salvas'}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {!conectado
                        ? 'Faça o login com a Meta nesta aba primeiro.'
                        : 'Clique em "Testar Conexão" para validar o status da API Oficial.'}
                    </p>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Conteúdo da aba Conexões */}
      {aba === 'conexoes' && (
        <div className="rounded-xl border bg-white p-2">
          <ConfiguracaoWhatsAppConexoes />
        </div>
      )}
    </div>
  );
}