import React, { useState, useEffect, useRef } from 'react';
import PageHeader from '@/components/ui/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Upload, Loader2, AlertTriangle, FileText, X, CheckCircle2, Settings } from 'lucide-react';
import { toast } from 'sonner';
import { base44 } from '@/api/base44Client';
import { createPageUrl } from '@/utils';

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
      const eps = await base44.entities.EmpresaParceira.filter({ empresa_id: eid, ativo: true }, 'nome');
      setEmpresasParceiras(eps);
    }
    setLoading(false);
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
    const layoutSel = layouts.find(l => l.id === layoutId);

    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    const resp = await base44.functions.invoke('importarPropostasEmprestimo', {
      file_url,
      empresa_parceira_id: empresaParceiraId,
      layout: layoutSel?.mapeamento || null,
    });

    const data = resp.data;
    if (data.error) {
      toast.error(data.error);
      setResultado({ erro: data.error });
    } else {
      const total = (data.criadas || 0) + (data.atualizadas || 0);
      toast.success(`${total} proposta(s) processada(s) com sucesso!`);
      setResultado(data);
    }
    setIsProcessing(false);
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
                    onClick={() => window.open(createPageUrl(`LayoutImportacaoConfig?empresa_parceira_id=${empresaParceiraId}&tipo=producao`), '_blank')}
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
                    <Button type="button" variant="ghost" size="icon" onClick={() => setFile(null)} disabled={isProcessing}>
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                )}
              </div>
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
                <div className="flex items-start gap-3 p-4 bg-green-50 border border-green-200 rounded-xl">
                  <CheckCircle2 className="w-5 h-5 text-green-600 mt-0.5" />
                  <div>
                    <p className="font-semibold text-green-800">Importação concluída!</p>
                    <p className="text-sm text-green-700">
                      <strong>{resultado.criadas || 0}</strong> nova(s) criada(s)
                      {resultado.atualizadas > 0 && <>, <strong>{resultado.atualizadas}</strong> atualizada(s)</>}
                      {resultado.ignoradas > 0 && `, ${resultado.ignoradas} ignorada(s)`}
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
    </div>
  );
}