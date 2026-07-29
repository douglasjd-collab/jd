import React, { useEffect, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  FileText, Eye, Download, RefreshCw, Trash2, Upload, Paperclip, ShieldCheck, AlertCircle
} from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { format } from 'date-fns';

const TIPO_LABEL = {
  cnh: 'CNH',
  rg: 'RG',
  comprovante_residencia: 'Comprovante de Residência',
  comprovante_renda: 'Comprovante de Renda',
  outro: 'Outro'
};

const CONFIANCA_BADGE = {
  alta: 'bg-emerald-100 text-emerald-700',
  media: 'bg-amber-100 text-amber-700',
  baixa: 'bg-red-100 text-red-700',
  nao_identificado: 'bg-slate-100 text-slate-500'
};

/**
 * Seção "Documentos do cliente" exibida no rodapé do cadastro.
 * Lista os documentos vinculados ao cliente, com ações de visualizar/baixar/substituir/excluir
 * (conforme permissão) e resumo da auditoria.
 *
 * Props:
 *  - clienteId (string|null): quando nulo (novo cliente), mostra apenas os arquivos pendentes
 *  - empresaId
 *  - user (objeto com id, nome_perfil/full_name, perfil)
 *  - documentosPendentes (array): para novo cliente — arquivos já enviados ao storage但仍 não persistidos
 *  - onChange (callback): notifica o parent sobre os arquivos pendentes
 */
export default function DocumentosClienteSecao({
  clienteId, empresaId, user, documentosPendentes = [], onDocumentosChange
}) {
  const [documentos, setDocumentos] = useState([]);
  const [carregando, setCarregando] = useState(false);
  const [logando, setLogando] = useState(false);
  const isAdmin = ['admin', 'gerente', 'master', 'super_admin'].includes(user?.perfil);
  const canDelete = ['admin', 'gerente', 'master', 'super_admin'].includes(user?.perfil);

  const replaceInputRef = useRef(null);
  const replaceTargetRef = useRef(null);
  const pendInputRef = useRef(null);

  // Carrega documentos do cliente quando há clienteId
  const carregar = async () => {
    if (!clienteId) return;
    setCarregando(true);
    try {
      const docs = await base44.entities.ClienteDocumento.filter(
        { cliente_id: clienteId, excluido: false },
        '-data_envio',
        200
      );
      setDocumentos(docs);
    } catch (e) {
      console.error(e);
      toast.error('Erro ao carregar documentos do cliente.');
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => { carregar(); }, [clienteId]);

  const registrarAuditoria = async (acao, doc, dadosNovos = null, tipo = 'edicao') => {
    try {
      await base44.entities.LogAuditoria.create({
        usuario_id: user?.id || user?.auth_id || null,
        usuario_nome: user?.nome_perfil || user?.full_name || '',
        acao,
        entidade: 'ClienteDocumento',
        entidade_id: doc?.id || clienteId || null,
        dados_novos: dadosNovos ? JSON.stringify(dadosNovos) : null,
        tipo
      });
    } catch (e) {
      console.warn('Falha ao registrar auditoria:', e);
    }
  };

  const registrarAcaoLocal = async (docId, acaoLabel) => {
    // Anexa ao histórico do documento (campo historico_acoes_json)
    try {
      const doc = documentos.find(d => d.id === docId);
      if (!doc) return;
      let hist = [];
      try { hist = doc.historico_acoes_json ? JSON.parse(doc.historico_acoes_json) : []; } catch {}
      hist.push({
        acao: acaoLabel,
        usuario_id: user?.id || user?.auth_id || null,
        usuario_nome: user?.nome_perfil || user?.full_name || '',
        dataHora: new Date().toISOString()
      });
      await base44.entities.ClienteDocumento.update(docId, {
        historico_acoes_json: JSON.stringify(hist)
      });
    } catch (e) {
      console.warn('Falha ao atualizar histórico do documento:', e);
    }
  };

  const handleVisualizar = (doc) => {
    registrarAcaoLocal(doc.id, 'visualizou');
    registrarAuditoria(`Documento visualizado: ${doc.arquivo_nome}`, doc);
    window.open(doc.arquivo_url, '_blank');
  };

  const handleBaixar = (doc) => {
    registrarAcaoLocal(doc.id, 'baixou');
    registrarAuditoria(`Documento baixado: ${doc.arquivo_nome}`, doc);
    const a = document.createElement('a');
    a.href = doc.arquivo_url;
    a.download = doc.arquivo_nome || 'documento';
    a.target = '_blank';
    a.rel = 'noreferrer';
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const iniciarSubstituir = (doc) => {
    replaceTargetRef.current = doc;
    replaceInputRef.current?.click();
  };

  const handleSubstituir = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    const docAntigo = replaceTargetRef.current;
    replaceTargetRef.current = null;
    if (!file || !docAntigo) return;

    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      // Tenta re-ler via IA para identificar tipo/campos
      let tipo = docAntigo.tipo_documento;
      let camposJson = docAntigo.campos_extraidos_json;
      let confianca = docAntigo.nivel_confianca;
      let lado = docAntigo.lado;
      try {
        const resp = await base44.functions.invoke('lerDocumentosCliente', { file_urls: [file_url] });
        const d = resp?.data?.documentos?.[0];
        if (d && !d.erro) {
          tipo = d.tipo_documento || tipo;
          camposJson = JSON.stringify(d.campos || {});
          confianca = d.confianca_geral || confianca;
          lado = d.lado || lado;
        }
      } catch {}

      const novo = await base44.entities.ClienteDocumento.create({
        empresa_id: empresaId,
        cliente_id: clienteId,
        arquivo_url: file_url,
        arquivo_nome: file.name,
        arquivo_tamanho: file.size,
        arquivo_mime: file.type,
        tipo_documento: tipo,
        lado,
        campos_extraidos_json: camposJson,
        nivel_confianca: confianca,
        enviado_por_id: user?.id || user?.auth_id || null,
        enviado_por_nome: user?.nome_perfil || user?.full_name || '',
        data_envio: new Date().toISOString(),
        substitui_id: docAntigo.id
      });

      // Marca o antigo como excluído (soft)
      await base44.entities.ClienteDocumento.update(docAntigo.id, {
        excluido: true,
        excluido_por_id: user?.id || user?.auth_id || null,
        excluido_por_nome: user?.nome_perfil || user?.full_name || '',
        data_exclusao: new Date().toISOString()
      });

      await registrarAuditoria(`Documento substituído: ${docAntigo.arquivo_nome} → ${file.name}`, docAntigo, { novo_id: novo.id }, 'edicao');
      toast.success('Documento substituído.');
      carregar();
    } catch (err) {
      console.error(err);
      toast.error('Erro ao substituir documento: ' + (err?.message || ''));
    }
  };

  const handleExcluir = async (doc) => {
    if (!canDelete) {
      toast.error('Você não tem permissão para excluir documentos.');
      return;
    }
    if (!confirm(`Excluir o documento "${doc.arquivo_nome}"?`)) return;
    try {
      await base44.entities.ClienteDocumento.update(doc.id, {
        excluido: true,
        excluido_por_id: user?.id || user?.auth_id || null,
        excluido_por_nome: user?.nome_perfil || user?.full_name || '',
        data_exclusao: new Date().toISOString()
      });
      await registrarAuditoria(`Documento excluído: ${doc.arquivo_nome}`, doc, null, 'exclusao');
      toast.success('Documento excluído.');
      carregar();
    } catch (err) {
      toast.error('Erro ao excluir: ' + (err?.message || ''));
    }
  };

  const handlePendenteRemover = (idx) => {
    const novos = documentosPendentes.filter((_, i) => i !== idx);
    onDocumentosChange?.(novos);
  };

  const adicionarPendente = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (files.length === 0) return;
    try {
      const prontos = [];
      for (const f of files) {
        const { file_url } = await base44.integrations.Core.UploadFile({ file: f });
        prontos.push({ arquivo_url: file_url, arquivo_nome: f.name, arquivo_tamanho: f.size, arquivo_mime: f.type });
      }
      // Evita duplicar por arquivo_url
      const atuais = [...documentosPendentes];
      for (const p of prontos) {
        if (!atuais.some(d => d.arquivo_url === p.arquivo_url)) atuais.push(p);
      }
      onDocumentosChange?.(atuais);
      toast.success(`${prontos.length} arquivo(s) anexado(s).`);
    } catch (err) {
      toast.error('Erro ao anexar: ' + (err?.message || ''));
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3 flex flex-row items-center justify-between">
        <CardTitle className="text-lg flex items-center gap-2">
          <Paperclip className="w-5 h-5 text-slate-600" />
          Documentos do cliente
        </CardTitle>
        <div className="flex items-center gap-2">
          <Button type="button" size="sm" variant="outline" onClick={() => pendInputRef.current?.click()}>
            <Upload className="w-4 h-4 mr-1" /> Anexar documento
          </Button>
          <input ref={pendInputRef} type="file" multiple accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" className="hidden" onChange={adicionarPendente} />
          <input ref={replaceInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" className="hidden" onChange={handleSubstituir} />
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {carregando && <p className="text-sm text-slate-500">Carregando documentos...</p>}

        {/* Documentos pendentes (novo cliente, ainda não salvos) */}
        {documentosPendentes.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-slate-500 uppercase">Pendentes (serão vinculados ao salvar)</p>
            {documentosPendentes.map((d, i) => (
              <div key={i} className="flex items-center gap-3 p-2 rounded-lg border border-dashed border-slate-300 bg-slate-50">
                <FileText className="w-4 h-4 text-slate-500" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{d.arquivo_nome}</p>
                  <p className="text-xs text-slate-500">{(d.arquivo_tamanho / 1024).toFixed(1)} KB · a ser vinculado</p>
                </div>
                <a href={d.arquivo_url} target="_blank" rel="noreferrer" className="p-1.5 rounded hover:bg-slate-200" title="Visualizar">
                  <Eye className="w-4 h-4 text-slate-600" />
                </a>
                <button type="button" onClick={() => handlePendenteRemover(i)} className="p-1.5 rounded hover:bg-red-50" title="Remover">
                  <Trash2 className="w-4 h-4 text-red-500" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Documentos já vinculados ao cliente */}
        {!clienteId && documentosPendentes.length === 0 && (
          <p className="text-sm text-slate-500">Nenhum documento anexado. Envie pela seção de importação acima ou clique em "Anexar documento".</p>
        )}

        {clienteId && documentos.length === 0 && !carregando && documentosPendentes.length === 0 && (
          <p className="text-sm text-slate-500">Nenhum documento vinculado a este cliente.</p>
        )}

        {documentos.map((d) => (
          <div key={d.id} className="flex flex-col gap-2 p-3 rounded-lg border border-slate-200">
            <div className="flex items-center gap-3">
              <FileText className="w-5 h-5 text-slate-500 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{d.arquivo_nome}</p>
                <div className="flex items-center gap-2 flex-wrap text-[11px] text-slate-500">
                  <span className="px-1.5 py-0.5 rounded bg-slate-100">{TIPO_LABEL[d.tipo_documento] || d.tipo_documento}</span>
                  {d.lado && d.lado !== 'nao_identificado' && <span className="capitalize">{d.lado}</span>}
                  {d.nivel_confianca && (
                    <span className={`px-1.5 py-0.5 rounded ${CONFIANCA_BADGE[d.nivel_confianca] || CONFIANCA_BADGE.nao_identificado}`}>
                      confiança: {d.nivel_confianca}
                    </span>
                  )}
                  <span>• {d.data_envio ? format(new Date(d.data_envio), 'dd/MM/yyyy HH:mm') : '—'}</span>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button type="button" onClick={() => handleVisualizar(d)} className="p-1.5 rounded hover:bg-slate-100" title="Visualizar">
                  <Eye className="w-4 h-4 text-slate-600" />
                </button>
                <button type="button" onClick={() => handleBaixar(d)} className="p-1.5 rounded hover:bg-slate-100" title="Baixar">
                  <Download className="w-4 h-4 text-slate-600" />
                </button>
                <button type="button" onClick={() => iniciarSubstituir(d)} className="p-1.5 rounded hover:bg-slate-100" title="Substituir">
                  <RefreshCw className="w-4 h-4 text-slate-600" />
                </button>
                {canDelete && (
                  <button type="button" onClick={() => handleExcluir(d)} className="p-1.5 rounded hover:bg-red-50" title="Excluir">
                    <Trash2 className="w-4 h-4 text-red-500" />
                  </button>
                )}
              </div>
            </div>
            <div className="text-[11px] text-slate-500 flex items-center gap-2 pl-8">
              <ShieldCheck className="w-3 h-3" />
              Enviado por: <span className="font-medium text-slate-700">{d.enviado_por_nome || '—'}</span>
            </div>
          </div>
        ))}

        {!canDelete && documentos.length > 0 && (
          <div className="flex items-start gap-2 text-[11px] text-slate-500 pl-1">
            <AlertCircle className="w-3.5 h-3.5 mt-0.5" />
            Apenas administradores/gerentes podem substituir ou excluir documentos.
          </div>
        )}
      </CardContent>
    </Card>
  );
}