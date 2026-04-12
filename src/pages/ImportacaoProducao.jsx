import React, { useState, useEffect, useRef } from 'react';
import PageHeader from '@/components/ui/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Upload, Loader2, AlertTriangle, FileText, X, CheckCircle2, Settings, Tag, Eye, History, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { base44 } from '@/api/base44Client';
import { createPageUrl } from '@/utils';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';

export default function ImportacaoProducao() {
  const [user, setUser] = useState(null);
  const [empresaId, setEmpresaId] = useState(null);
  const [empresasParceiras, setEmpresasParceiras] = useState([]);
  const [empresaParceiraId, setEmpresaParceiraId] = useState('');
  const [layouts, setLayouts] = useState([]);
  const [layoutId, setLayoutId] = useState('');
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [preview, setPreview] = useState(null); // { headers, rows }
  const [historico, setHistorico] = useState([]);
  const [desfazendoId, setDesfazendoId] = useState(null);
  const [confirmDesfazer, setConfirmDesfazer] = useState(null); // log a desfazer
  const [visualizarLog, setVisualizarLog] = useState(null);
  const [visualizarOpen, setVisualizarOpen] = useState(false);
  const [visualizarPropostas, setVisualizarPropostas] = useState([]);
  const [loadingVisualizar, setLoadingVisualizar] = useState(false);
  const [visualizarAba, setVisualizarAba] = useState('criadas');
  const inputRef = useRef(null);

  useEffect(() => { init(); }, []);

  const init = async () => {
    setLoading(true);
    const me = await base44.auth.me();
    setUser(me);
    let eid = null;
    if (me.role === 'super_admin' || me.perfil === 'super_admin') {
      const empresas = await base44.entities.Empresa.filter({ status: 'ativa' });
      if (empresas.length > 0) eid = empresas[0].id;
    } else {
      const colabs = await base44.entities.Colaborador.filter({ user_id: me.id, status: 'ativo' });
      if (colabs.length > 0) eid = colabs[0].empresa_id;
    }
    setEmpresaId(eid);
    if (eid) {
      const [eps, hist] = await Promise.all([
        base44.entities.EmpresaParceira.filter({ empresa_id: eid, ativo: true }, 'nome'),
        base44.entities.ImportacaoPropostasLog.filter({ empresa_id: eid }, '-created_date', 20),
      ]);
      setEmpresasParceiras(eps);
      setHistorico(hist);
    }
    setLoading(false);
  };

  const recarregarHistorico = async () => {
    if (!empresaId) return;
    const hist = await base44.entities.ImportacaoPropostasLog.filter({ empresa_id: empresaId }, '-created_date', 20);
    setHistorico(hist);
  };

  const handleVisualizar = async (log) => {
    setVisualizarLog(log);
    setVisualizarOpen(true);
    setVisualizarAba('criadas');
    setVisualizarPropostas([]);
    setLoadingVisualizar(true);
    try {
      const ids = log.propostas_ids_criadas ? JSON.parse(log.propostas_ids_criadas) : [];
      if (ids.length > 0) {
        const propostas = await Promise.all(
          // buscar em lotes de 50 para não sobrecarregar
          Array.from({ length: Math.ceil(ids.length / 50) }, (_, i) =>
            base44.entities.Proposta.filter({ empresa_id: log.empresa_id }, null, 1000)
          )
        );
        const flat = propostas.flat();
        const filtradas = flat.filter(p => ids.includes(p.id));
        setVisualizarPropostas(filtradas);
      }
    } catch (err) {
      toast.error('Erro ao carregar propostas: ' + err.message);
    } finally {
      setLoadingVisualizar(false);
    }
  };

  const handleDesfazer = async (log) => {
    setDesfazendoId(log.id);
    try {
      const resp = await base44.functions.invoke('desfazerImportacaoPropostas', { log_id: log.id });
      if (resp.data.error) {
        toast.error(resp.data.error);
      } else {
        toast.success(`${resp.data.excluidas} proposta(s) excluída(s) com sucesso!`);
        recarregarHistorico();
      }
    } catch (err) {
      toast.error('Erro ao desfazer: ' + err.message);
    } finally {
      setDesfazendoId(null);
      setConfirmDesfazer(null);
    }
  };

  const handleEmpresaChange = async (epId) => {
    setEmpresaParceiraId(epId);
    setLayoutId('');
    setLayouts([]);
    const lays = await base44.entities.LayoutImportacao.filter({ empresa_parceira_id: epId, tipo: 'producao' });
    setLayouts(lays);
    if (lays.length === 1) setLayoutId(lays[0].id);
  };

  const handleFile = (f) => {
    if (!f) return;
    const ext = f.name.split('.').pop().toLowerCase();
    if (!['xlsx', 'xls', 'csv'].includes(ext)) {
      toast.error('Apenas arquivos Excel (.xlsx, .xls) ou CSV são aceitos');
      return;
    }
    setFile(f);
    setResultado(null);
    setPreview(null);
    // Gerar pré-visualização lendo as primeiras linhas do arquivo
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target.result;
        const lines = text.split(/\r?\n/).filter(l => l.trim()).slice(0, 8);
        const delimiter = (lines[0] || '').includes(';') ? ';' : ',';
        const parsed = lines.map(l => l.split(delimiter).map(c => c.trim().replace(/^"|"$/g, '')));
        if (parsed.length > 0) {
          setPreview({ headers: parsed[0], rows: parsed.slice(1, 6) });
        }
      } catch {}
    };
    reader.readAsText(f, 'ISO-8859-1');
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    handleFile(e.dataTransfer.files[0]);
  };

  const handleImportar = async () => {
    if (!empresaParceiraId) { toast.error('Selecione a empresa parceira'); return; }
    if (!layoutId) { toast.error('Selecione o layout de importação'); return; }
    if (!file) { toast.error('Selecione o arquivo'); return; }

    setIsProcessing(true);
    try {
      const layoutSel = layouts.find(l => l.id === layoutId);

      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      const resp = await base44.functions.invoke('importarPropostasEmprestimo', {
        file_url,
        empresa_parceira_id: empresaParceiraId,
        layout: layoutSel?.mapeamento || null,
        layout_id: layoutId,
        arquivo_nome: file.name,
        atualizar_telefone: layoutSel?.atualizar_telefone || false,
      });

      const data = resp.data;
      if (data.error) {
        toast.error(data.error);
        setResultado({ erro: data.error });
      } else if (data.success === false) {
        toast.error(data.error || 'Erro desconhecido na importação');
        setResultado({ erro: data.error || 'Erro desconhecido' });
      } else {
        const total = (data.criadas || 0) + (data.atualizadas || 0);
        toast.success(`${total} proposta(s) processada(s) com sucesso!`);
        setResultado(data);
        recarregarHistorico();
      }
    } catch (err) {
      console.error('Erro ao importar:', err);
      const mensagem = err.response?.data?.error || err.message || 'Erro desconhecido na importação';
      toast.error(mensagem);
      setResultado({ erro: mensagem });
    } finally {
      setIsProcessing(false);
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center h-96">
      <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
    </div>
  );

  const empresaParcelaSel = empresasParceiras.find(e => e.id === empresaParceiraId);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Importar Propostas de Empréstimos"
        subtitle="Importe propostas de empréstimos"
        backTo="Importacao"
      />

      <Card className="border-0 shadow-sm">
        <CardContent className="p-6 space-y-6">

          {/* 1. Empresa parceira */}
          <div>
            <Label className="text-sm font-semibold">1. Selecione a Empresa Parceira *</Label>
            <p className="text-xs text-slate-500 mb-2">O layout de importação é configurado por empresa parceira</p>
            <div className="flex items-center gap-3">
              <Select value={empresaParceiraId} onValueChange={handleEmpresaChange}>
                <SelectTrigger className="w-72">
                  <SelectValue placeholder="Selecione a empresa parceira..." />
                </SelectTrigger>
                <SelectContent>
                  {empresasParceiras.map(ep => (
                    <SelectItem key={ep.id} value={ep.id}>{ep.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {empresaParceiraId && (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2 text-blue-600 border-blue-300 hover:bg-blue-50"
                  onClick={() => window.location.href = createPageUrl(`LayoutImportacaoConfig?empresa_parceira_id=${empresaParceiraId}&tipo=producao`)}
                >
                  <Settings className="w-4 h-4" />
                  Configurar Layout
                </Button>
              )}
            </div>
          </div>

          {/* 2. Layout */}
          {empresaParceiraId && (
            <div>
              <Label className="text-sm font-semibold">2. Selecione o Layout *</Label>
              {layouts.length === 0 ? (
                <div className="mt-2 flex items-center gap-3 p-4 bg-yellow-50 border border-yellow-200 rounded-xl">
                  <AlertTriangle className="w-5 h-5 text-yellow-600 flex-shrink-0" />
                  <div className="text-sm text-yellow-800">
                    <p className="font-medium">Nenhum layout configurado para {empresaParcelaSel?.nome}</p>
                    <p>Configure um layout de produção antes de importar.</p>
                  </div>
                  <Button
                    size="sm"
                    className="ml-auto gap-2 bg-yellow-600 hover:bg-yellow-700"
                    onClick={() => window.location.href = createPageUrl(`LayoutImportacaoConfig?empresa_parceira_id=${empresaParceiraId}&tipo=producao`)}
                  >
                    <Settings className="w-4 h-4" /> Configurar Agora
                  </Button>
                </div>
              ) : (
                <Select value={layoutId} onValueChange={setLayoutId}>
                  <SelectTrigger className="w-72 mt-1">
                    <SelectValue placeholder="Selecione o layout..." />
                  </SelectTrigger>
                  <SelectContent>
                    {layouts.map(l => (
                      <SelectItem key={l.id} value={l.id}>{l.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}

          {/* 3. Arquivo */}
          {empresaParceiraId && layouts.length > 0 && (
            <div>
              <Label className="text-sm font-semibold">3. Selecione o Arquivo *</Label>
              <div className="mt-2">
                {!file ? (
                  <div
                    className={`border-2 border-dashed rounded-xl p-10 flex flex-col items-center gap-3 cursor-pointer transition-colors ${
                      dragging ? 'border-green-500 bg-green-50' : 'border-slate-300 hover:border-green-400 hover:bg-slate-50'
                    }`}
                    onClick={() => inputRef.current?.click()}
                    onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                    onDragLeave={() => setDragging(false)}
                    onDrop={handleDrop}
                  >
                    <Upload className="w-10 h-10 text-slate-400" />
                    <div className="text-center">
                      <p className="font-medium text-slate-700">Clique para selecionar ou arraste o arquivo</p>
                      <p className="text-sm text-slate-400 mt-1">Formatos aceitos: .xlsx, .xls, .csv</p>
                    </div>
                    <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden"
                      onChange={(e) => handleFile(e.target.files[0])} />
                  </div>
                ) : (
                  <div className="border-2 border-green-400 bg-green-50 rounded-xl p-5 flex items-center gap-4">
                    <FileText className="w-8 h-8 text-green-600 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-green-900 truncate">{file.name}</p>
                      <p className="text-sm text-green-700">{(file.size / 1024).toFixed(1)} KB</p>
                    </div>
                    <Button type="button" variant="ghost" size="icon" onClick={() => { setFile(null); setPreview(null); }} disabled={isProcessing}>
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Pré-visualização do arquivo */}
          {preview && !resultado && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Eye className="w-4 h-4 text-blue-600" />
                <Label className="text-sm font-semibold text-blue-800">Pré-visualização ({preview.rows.length} primeiras linhas)</Label>
              </div>
              <div className="overflow-x-auto rounded-xl border border-blue-100">
                <table className="w-full text-xs">
                  <thead className="bg-blue-50">
                    <tr>
                      {preview.headers.map((h, i) => (
                        <th key={i} className="p-2 text-left font-semibold text-blue-800 whitespace-nowrap border-r border-blue-100 last:border-0">{h || `Col ${i+1}`}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.map((row, ri) => (
                      <tr key={ri} className={ri % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                        {preview.headers.map((_, ci) => (
                          <td key={ci} className="p-2 text-slate-700 whitespace-nowrap border-r border-slate-100 last:border-0 max-w-[180px] overflow-hidden text-ellipsis">{row[ci] ?? ''}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-slate-400 mt-1">Verifique se as colunas correspondem ao layout configurado antes de importar.</p>
            </div>
          )}

          {/* Resultado */}
          {resultado && (
            <div>
              {resultado.erro ? (
                <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-xl">
                  <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5" />
                  <div>
                    <p className="font-semibold text-red-800">Erro na importação</p>
                    <p className="text-sm text-red-700">{resultado.erro}</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-start gap-3 p-4 bg-green-50 border border-green-200 rounded-xl">
                    <CheckCircle2 className="w-5 h-5 text-green-600 mt-0.5" />
                    <div>
                      <p className="font-semibold text-green-800">Importação concluída!</p>
                      <p className="text-sm text-green-700">
                        <strong>{resultado.criadas || 0}</strong> nova(s) criada(s)
                        {resultado.atualizadas > 0 && <>, <strong>{resultado.atualizadas}</strong> atualizada(s)</>}
                        {resultado.ignoradas > 0 && `, ${resultado.ignoradas} ignorada(s)`}
                        {resultado.vinculados_auto > 0 && <>, <strong className="text-blue-700">{resultado.vinculados_auto} vendedor(es) vinculado(s) automaticamente</strong></>}
                        {resultado.pendentes_tipo > 0 && <>, <strong className="text-orange-700">{resultado.pendentes_tipo} com tipo pendente</strong></>}
                      </p>
                      {resultado.erros?.length > 0 && (
                        <div className="mt-2">
                          {resultado.erros.map((e, i) => (
                            <p key={i} className="text-xs text-yellow-700">{e}</p>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {resultado.pendentes_tipo > 0 && resultado.tipos_nao_mapeados?.length > 0 && (
                    <div className="flex items-start gap-3 p-4 bg-orange-50 border border-orange-300 rounded-xl">
                      <Tag className="w-5 h-5 text-orange-600 mt-0.5 flex-shrink-0" />
                      <div className="flex-1">
                        <p className="font-semibold text-orange-800">⚠️ Tipos de empréstimo não reconhecidos</p>
                        <p className="text-sm text-orange-700 mt-1">
                          {resultado.pendentes_tipo} proposta(s) foram importadas com tipo pendente de vinculação. Os seguintes tipos vieram no arquivo mas não estão cadastrados:
                        </p>
                        <div className="flex flex-wrap gap-2 mt-2">
                          {resultado.tipos_nao_mapeados.map((t, i) => (
                            <span key={i} className="bg-orange-100 border border-orange-300 text-orange-800 text-xs font-mono px-2 py-1 rounded">
                              {t}
                            </span>
                          ))}
                        </div>
                        <p className="text-xs text-orange-600 mt-2">
                          Acesse <strong>Cadastros → Tipos de Empréstimo</strong> e adicione esses tipos com os aliases de importação correspondentes. Em seguida, reimporte o arquivo para que as propostas sejam vinculadas corretamente.
                        </p>
                        <button
                          onClick={() => window.location.href = createPageUrl('TiposEmprestimo')}
                          className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-orange-700 underline hover:text-orange-900"
                        >
                          <Tag className="w-3.5 h-3.5" /> Ir para Tipos de Empréstimo
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Botão importar */}
          {empresaParceiraId && layouts.length > 0 && (
            <div className="flex justify-end">
              <Button
                disabled={!file || !layoutId || isProcessing}
                className="bg-green-600 hover:bg-green-700 gap-2"
                onClick={handleImportar}
              >
                {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                {isProcessing ? 'Importando...' : 'Importar Propostas'}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
      {/* Histórico de importações */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-6">
          <h3 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
            <History className="w-4 h-4" /> Histórico de Importações
          </h3>
          {historico.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-6">Nenhuma importação registrada ainda.</p>
          ) : (
            <div className="space-y-2">
              {historico.map(log => (
                <div key={log.id} className={`flex items-center gap-4 p-3 rounded-xl border ${log.status === 'desfeita' ? 'bg-slate-50 border-slate-200 opacity-60' : 'bg-white border-slate-200'}`}>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm text-slate-800 truncate">{log.arquivo_nome || 'Arquivo sem nome'}</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {log.empresa_parceira_nome} · {log.criadas} criada(s), {log.atualizadas} atualizada(s) ·{' '}
                      {new Date(log.created_date).toLocaleString('pt-BR')} · {log.usuario_nome}
                    </p>
                  </div>
                  <button
                    onClick={() => handleVisualizar(log)}
                    className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 border border-blue-200 hover:border-blue-400 px-3 py-1.5 rounded-lg transition-colors"
                    title="Visualizar propostas"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    Ver
                  </button>
                  {log.status === 'desfeita' ? (
                    <span className="text-xs text-slate-400 font-medium px-2 py-1 bg-slate-100 rounded-full">Desfeita</span>
                  ) : (
                    <button
                      onClick={() => setConfirmDesfazer(log)}
                      disabled={desfazendoId === log.id}
                      className="flex items-center gap-1.5 text-xs text-red-600 hover:text-red-800 border border-red-200 hover:border-red-400 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Desfazer
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modal confirmação desfazer */}
      <Dialog open={!!confirmDesfazer} onOpenChange={() => setConfirmDesfazer(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-red-700">Desfazer Importação</DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-2 text-sm text-slate-700">
            <p>Isso irá <strong>excluir permanentemente</strong> as <strong>{confirmDesfazer?.criadas}</strong> proposta(s) criadas nesta importação:</p>
            <div className="bg-slate-50 border rounded-lg p-3 text-xs space-y-1">
              <p><span className="text-slate-500">Arquivo:</span> {confirmDesfazer?.arquivo_nome}</p>
              <p><span className="text-slate-500">Parceira:</span> {confirmDesfazer?.empresa_parceira_nome}</p>
              <p><span className="text-slate-500">Importado por:</span> {confirmDesfazer?.usuario_nome}</p>
              <p><span className="text-slate-500">Data:</span> {confirmDesfazer && new Date(confirmDesfazer.created_date).toLocaleString('pt-BR')}</p>
            </div>
            <p className="text-red-600 font-medium">⚠️ As propostas atualizadas (não criadas) NÃO serão revertidas.</p>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setConfirmDesfazer(null)}>Cancelar</Button>
            <Button
              className="bg-red-600 hover:bg-red-700 text-white gap-2"
              disabled={desfazendoId === confirmDesfazer?.id}
              onClick={() => handleDesfazer(confirmDesfazer)}
            >
              {desfazendoId === confirmDesfazer?.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              Confirmar Exclusão
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Visualizar Propostas da Importação */}
      <Dialog open={visualizarOpen} onOpenChange={setVisualizarOpen}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Propostas da Importação — {visualizarLog?.arquivo_nome}</DialogTitle>
            <p className="text-xs text-slate-500">{visualizarLog?.empresa_parceira_nome} · {visualizarLog && new Date(visualizarLog.created_date).toLocaleString('pt-BR')} · {visualizarLog?.usuario_nome}</p>
          </DialogHeader>

          {/* Resumo */}
          <div className="grid grid-cols-3 gap-3 my-2">
            <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-center">
              <p className="text-2xl font-bold text-green-700">{visualizarLog?.criadas || 0}</p>
              <p className="text-xs text-green-600 mt-0.5">Criadas</p>
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-center">
              <p className="text-2xl font-bold text-blue-700">{visualizarLog?.atualizadas || 0}</p>
              <p className="text-xs text-blue-600 mt-0.5">Atualizadas</p>
            </div>
            <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 text-center">
              <p className="text-2xl font-bold text-orange-700">{visualizarPropostas.filter(p => p.pendente_vinculacao_tipo).length}</p>
              <p className="text-xs text-orange-600 mt-0.5">Pendentes (tipo)</p>
            </div>
          </div>

          {/* Abas */}
          <div className="flex gap-1 border-b pb-0">
            {[
              { key: 'criadas', label: `Criadas (${visualizarPropostas.filter(p => !p.pendente_vinculacao_tipo).length})`, color: 'green' },
              { key: 'pendentes', label: `Pendentes (${visualizarPropostas.filter(p => p.pendente_vinculacao_tipo).length})`, color: 'orange' },
              { key: 'atualizadas', label: `Atualizadas (${visualizarLog?.atualizadas || 0})`, color: 'blue' },
            ].map(aba => (
              <button
                key={aba.key}
                onClick={() => setVisualizarAba(aba.key)}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                  visualizarAba === aba.key
                    ? `border-${aba.color}-600 text-${aba.color}-700`
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                {aba.label}
              </button>
            ))}
          </div>

          {/* Conteúdo */}
          <div className="flex-1 overflow-y-auto">
            {loadingVisualizar ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-7 h-7 animate-spin text-slate-400" />
                <span className="ml-3 text-slate-500">Carregando propostas...</span>
              </div>
            ) : (
              <>
                {visualizarAba === 'criadas' && (
                  <PropostasTable
                    propostas={visualizarPropostas.filter(p => !p.pendente_vinculacao_tipo)}
                    emptyMsg="Nenhuma proposta criada com sucesso nesta importação."
                  />
                )}
                {visualizarAba === 'pendentes' && (
                  <PropostasTable
                    propostas={visualizarPropostas.filter(p => p.pendente_vinculacao_tipo)}
                    emptyMsg="Nenhuma proposta pendente de tipo nesta importação."
                    showTipoPendente
                  />
                )}
                {visualizarAba === 'atualizadas' && (
                  <div className="p-6 text-center text-slate-500">
                    <p className="text-sm">Esta importação atualizou <strong>{visualizarLog?.atualizadas || 0}</strong> proposta(s) já existentes.</p>
                    <p className="text-xs text-slate-400 mt-2">Os IDs das propostas atualizadas não são armazenados no histórico — apenas as criadas são rastreadas individualmente.</p>
                  </div>
                )}
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PropostasTable({ propostas, emptyMsg, showTipoPendente }) {
  const fmt = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
  if (propostas.length === 0) {
    return <div className="p-8 text-center text-slate-400 text-sm">{emptyMsg}</div>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 border-b sticky top-0">
          <tr>
            <th className="px-3 py-2 text-left font-semibold text-slate-700">Cliente</th>
            <th className="px-3 py-2 text-left font-semibold text-slate-700">CPF</th>
            <th className="px-3 py-2 text-left font-semibold text-slate-700">Contrato</th>
            <th className="px-3 py-2 text-left font-semibold text-slate-700">Banco/Parceira</th>
            <th className="px-3 py-2 text-left font-semibold text-slate-700">Vendedor</th>
            <th className="px-3 py-2 text-right font-semibold text-slate-700">Valor</th>
            {showTipoPendente && <th className="px-3 py-2 text-left font-semibold text-slate-700">Tipo Original</th>}
            <th className="px-3 py-2 text-left font-semibold text-slate-700">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {propostas.map((p, i) => (
            <tr key={p.id || i} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
              <td className="px-3 py-2 max-w-[160px] truncate">{p.cliente_nome || '-'}</td>
              <td className="px-3 py-2 font-mono text-xs">{p.cliente_cpf || '-'}</td>
              <td className="px-3 py-2 font-mono">{p.contrato || '-'}</td>
              <td className="px-3 py-2">{p.administradora_nome || p.empresa_parceira_nome || '-'}</td>
              <td className="px-3 py-2">{p.vendedor_nome || '-'}</td>
              <td className="px-3 py-2 text-right font-semibold">{fmt(p.valor_credito || p.valor_liquido)}</td>
              {showTipoPendente && <td className="px-3 py-2 text-xs font-mono text-orange-700">{p.tipo_importacao_original || p.emprestimo_tipo || '-'}</td>}
              <td className="px-3 py-2">
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  p.pendente_vinculacao_tipo
                    ? 'bg-orange-100 text-orange-700'
                    : 'bg-green-100 text-green-700'
                }`}>
                  {p.pendente_vinculacao_tipo ? '⚠ Tipo pendente' : '✓ OK'}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}