import React, { useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Upload, Camera, FileText, Loader2, X, ScanLine, Info } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';

const ACCEPTED = '.pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png';
const MAX_SIZE = 8 * 1024 * 1024; // 8MB

/**
 * Seção "Importar dados pelos documentos" exibida no topo do formulário de Novo Cliente.
 *
 * Props:
 *  - onPreencher(documentos): chamado após leitura IA, recebe array de documentos extraídos
 *  - onDocumentosAdicionados(documentos): registra os arquivos enviados (para persistir no submit)
 */
export default function ImportarDocumentosSecao({ onPreencher, onDocumentosAdicionados, desabilitado }) {
  const [arquivos, setArquivos] = useState([]); // [{file, url, nome, tamanho, uploading, erro}]
  const [lendo, setLendo] = useState(false);
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);

  const validarArquivo = (file) => {
    if (!file) return false;
    const ok = /pdf|jpeg|jpg|png/i.test(file.type) || /\.(pdf|jpe?g|png)$/i.test(file.name);
    if (!ok) {
      toast.error(`Formato não suportado: ${file.name}`);
      return false;
    }
    if (file.size > MAX_SIZE) {
      toast.error(`Arquivo muito grande (máx 8MB): ${file.name}`);
      return false;
    }
    return true;
  };

  const handleArquivos = async (fileList) => {
    const novos = Array.from(fileList || []).filter(validarArquivo);
    if (novos.length === 0) return;

    // Evita duplicar mesmo arquivo
    const atuais = [...arquivos];
    for (const file of novos) {
      if (atuais.some(a => a.file && a.file.name === file.name && a.file.size === file.size)) {
        continue;
      }
      atuais.push({ file, url: null, nome: file.name, tamanho: file.size, uploading: true, erro: null });
    }
    setArquivos(atuais);

    // Faz upload de cada arquivo novo
    const atualizados = [...atuais];
    for (let i = 0; i < atualizados.length; i++) {
      if (!atualizados[i].file || atualizados[i].url || !atualizados[i].uploading) continue;
      try {
        const { file_url } = await base44.integrations.Core.UploadFile({ file: atualizados[i].file });
        atualizados[i] = { ...atualizados[i], url: file_url, uploading: false };
        setArquivos([...atualizados]);
      } catch (e) {
        atualizados[i] = { ...atualizados[i], uploading: false, erro: e?.message || 'Erro no upload' };
        setArquivos([...atualizados]);
        toast.error(`Falha no upload: ${atualizados[i].nome}`);
      }
    }
    notificarAdicionados(atualizados);
  };

  const notificarAdicionados = (lista) => {
    const prontos = lista.filter(a => a.url).map(a => ({
      arquivo_url: a.url, arquivo_nome: a.nome, arquivo_tamanho: a.tamanho
    }));
    onDocumentosAdicionados?.(prontos);
  };

  const removerArquivo = (idx) => {
    const novos = arquivos.filter((_, i) => i !== idx);
    setArquivos(novos);
    notificarAdicionados(novos);
  };

  const podeLer = arquivos.length > 0 && arquivos.every(a => a.url && !a.uploading);

  const handlePreencher = async () => {
    if (!podeLer || lendo) return;
    const urls = arquivos.filter(a => a.url).map(a => a.url);
    if (urls.length === 0) {
      toast.error('Nenhum arquivo enviado.');
      return;
    }

    setLendo(true);
    try {
      const resp = await base44.functions.invoke('lerDocumentosCliente', { file_urls: urls });
      const dados = resp?.data;
      if (dados?.error) throw new Error(dados.error);
      const documentos = (dados?.documentos || []).map((d, i) => ({
        ...d,
        arquivo_url: arquivos[i]?.url || d.arquivo_url,
        arquivo_nome: arquivos[i]?.nome || d.arquivo_nome || '',
        arquivo_tamanho: arquivos[i]?.tamanho || null
      }));
      const comErro = documentos.filter(d => d.erro);
      if (comErro.length > 0) {
        toast.warning(`${comErro.length} documento(s) não puderam ser lidos.`);
      }
      const lidos = documentos.filter(d => !d.erro && d.tipo_documento !== 'outro');
      if (lidos.length === 0 && documentos.length > 0) {
        toast.info('Documentos enviados, mas nenhum foi reconhecido como CNH/RG/Comprovante.');
      } else {
        toast.success(`${lidos.length} documento(s) lido(s).`);
      }
      onPreencher?.(documentos);
    } catch (e) {
      console.error(e);
      toast.error('Erro ao ler documentos: ' + (e?.message || 'desconhecido'));
    } finally {
      setLendo(false);
    }
  };

  return (
    <Card className="border-emerald-200">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <ScanLine className="w-5 h-5 text-emerald-600" />
          Importar dados pelos documentos
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-start gap-2 rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2">
          <Info className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
          <p className="text-xs text-emerald-900">
            Envie a <strong>CNH</strong>, <strong>RG</strong> ou <strong>comprovante de residência</strong> para preencher o cadastro automaticamente.
            Formatos aceitos: PDF, JPG, JPEG e PNG. Você pode enviar mais de um documento.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={desabilitado || lendo}
            onClick={() => fileInputRef.current?.click()}
            className="gap-1"
          >
            <Upload className="w-4 h-4" /> Selecionar arquivos
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={desabilitado || lendo}
            onClick={() => cameraInputRef.current?.click()}
            className="gap-1"
          >
            <Camera className="w-4 h-4" /> Tirar foto
          </Button>
          <Button
            type="button"
            disabled={!podeLer || lendo || desabilitado}
            onClick={handlePreencher}
            className="gap-1 bg-emerald-600 hover:bg-emerald-700"
          >
            {lendo ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
            {lendo ? 'Lendo documentos...' : 'Preencher cadastro automaticamente'}
          </Button>

          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED}
            multiple
            className="hidden"
            onChange={(e) => { handleArquivos(e.target.files); e.target.value = ''; }}
          />
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            className="hidden"
            onChange={(e) => { handleArquivos(e.target.files); e.target.value = ''; }}
          />
        </div>

        {arquivos.length > 0 && (
          <div className="space-y-2">
            {arquivos.map((a, i) => (
              <div key={i} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2">
                <FileText className="w-4 h-4 text-slate-500 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{a.nome}</p>
                  {a.uploading && <p className="text-xs text-slate-500">Enviando...</p>}
                  {a.erro && <p className="text-xs text-red-600">{a.erro}</p>}
                </div>
                <button
                  type="button"
                  onClick={() => removerArquivo(i)}
                  className="p-1 rounded hover:bg-slate-100"
                  disabled={lendo}
                >
                  <X className="w-4 h-4 text-slate-500" />
                </button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}