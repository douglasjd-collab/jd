import React, { useRef, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Paperclip, Camera, Image as ImageIcon, Loader2, AlertCircle, Eye, Download, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { baixarArquivo } from '@/components/chat/baixarArquivo';
import { fmtDataHora, fmtTamanho } from './adiantamentoHelpers';

const EXTENSOES = ['.jpg', '.jpeg', '.png', '.pdf'];
const TIPOS = ['image/jpeg', 'image/png', 'application/pdf'];
const TAMANHO_MAX = 15 * 1024 * 1024;

function validarArquivo(file) {
  const nome = String(file?.name || '').toLowerCase();
  if (!EXTENSOES.some(ext => nome.endsWith(ext)) || (file?.type && !TIPOS.includes(file.type))) {
    return 'Formato não permitido. Use JPG, PNG ou PDF.';
  }
  if (file.size > TAMANHO_MAX) return 'Arquivo maior que 15 MB.';
  return true;
}

export default function ComprovantesAnexos({ comprovantes = [], onChange, podeEditar = false }) {
  const inputArquivo = useRef(null);
  const inputGaleria = useRef(null);
  const inputCamera = useRef(null);
  const [envios, setEnvios] = useState([]);

  const anexar = async (files) => {
    const selecionados = Array.from(files || []);
    if (!selecionados.length) return;

    let acumulado = [...comprovantes];
    for (const file of selecionados) {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const validacao = validarArquivo(file);
      if (validacao !== true) {
        setEnvios(e => [...e, { id, nome: file.name, status: 'erro', erro: validacao }]);
        continue;
      }

      setEnvios(e => [...e, { id, nome: file.name, status: 'enviando' }]);
      try {
        const resp = await Promise.race([
          base44.integrations.Core.UploadPublicFile({ file }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('O envio excedeu 30 segundos. Tente novamente.')), 30000)),
        ]);
        const url = resp?.file_url;
        if (!url) throw new Error('O arquivo não retornou um endereço válido.');

        const novo = {
          id,
          nome: file.name,
          url,
          tipo: file.type || '',
          tamanho: file.size || 0,
          data_upload: new Date().toISOString(),
        };
        acumulado = [...acumulado, novo];
        await onChange(acumulado);
        setEnvios(e => e.filter(x => x.id !== id));
      } catch (e) {
        setEnvios(e => e.map(x => x.id === id ? { ...x, status: 'erro', erro: e?.message || 'Falha no envio do arquivo.' } : x));
      }
    }
  };

  const remover = async (item) => {
    if (!confirm(`Remover o comprovante "${item.nome}"?`)) return;
    await onChange(comprovantes.filter(c => c.id !== item.id));
  };

  return (
    <div className="space-y-2">
      <Label className="text-xs font-semibold text-slate-500">Comprovantes do adiantamento</Label>

      {podeEditar && (
        <div className="flex flex-wrap gap-2">
          <input ref={inputArquivo} type="file" accept=".pdf,.jpg,.jpeg,.png" multiple className="hidden"
            onChange={e => { anexar(e.target.files); e.target.value = ''; }} />
          <input ref={inputGaleria} type="file" accept="image/*" multiple className="hidden"
            onChange={e => { anexar(e.target.files); e.target.value = ''; }} />
          <input ref={inputCamera} type="file" accept="image/*" capture="environment" className="hidden"
            onChange={e => { anexar(e.target.files); e.target.value = ''; }} />

          <Button type="button" variant="outline" size="sm" onClick={() => inputArquivo.current?.click()}>
            <Paperclip className="w-3.5 h-3.5 mr-1.5" /> Anexar arquivo
          </Button>
          <Button type="button" variant="outline" size="sm" className="md:hidden" onClick={() => inputGaleria.current?.click()}>
            <ImageIcon className="w-3.5 h-3.5 mr-1.5" /> Galeria
          </Button>
          <Button type="button" variant="outline" size="sm" className="md:hidden" onClick={() => inputCamera.current?.click()}>
            <Camera className="w-3.5 h-3.5 mr-1.5" /> Tirar foto
          </Button>
          <span className="text-[11px] text-slate-400 self-center">JPG, PNG ou PDF — até 15 MB</span>
        </div>
      )}

      {envios.map(envio => (
        <div key={envio.id} className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs ${envio.status === 'erro' ? 'border-red-200 bg-red-50 text-red-700' : 'border-slate-200 bg-slate-50 text-slate-600'}`}>
          {envio.status === 'enviando' ? <Loader2 className="w-3.5 h-3.5 animate-spin flex-shrink-0" /> : <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />}
          <span className="truncate font-medium">{envio.nome}</span>
          <span className="flex-shrink-0">{envio.status === 'enviando' ? 'Enviando...' : envio.erro}</span>
        </div>
      ))}

      {comprovantes.length === 0 ? (
        <p className="text-xs text-slate-400 flex items-center gap-1.5">
          <Paperclip className="w-3.5 h-3.5" /> Sem comprovante
        </p>
      ) : (
        <div className="space-y-1.5">
          {comprovantes.map(item => (
            <div key={item.id} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5">
              <Paperclip className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-slate-700 truncate">{item.nome}</p>
                <p className="text-[11px] text-slate-400">
                  {fmtDataHora(item.data_upload)}{item.tamanho ? ` • ${fmtTamanho(item.tamanho)}` : ''}
                </p>
              </div>
              <Button type="button" variant="ghost" size="icon" className="h-7 w-7" title="Visualizar"
                onClick={() => window.open(item.url, '_blank', 'noopener')}>
                <Eye className="w-3.5 h-3.5 text-slate-500" />
              </Button>
              <Button type="button" variant="ghost" size="icon" className="h-7 w-7" title="Baixar"
                onClick={async () => {
                  const ok = await baixarArquivo(item.url, item.nome);
                  if (!ok) toast.error('Não foi possível baixar o arquivo.');
                }}>
                <Download className="w-3.5 h-3.5 text-slate-500" />
              </Button>
              {podeEditar && (
                <Button type="button" variant="ghost" size="icon" className="h-7 w-7" title="Remover"
                  onClick={() => remover(item)}>
                  <Trash2 className="w-3.5 h-3.5 text-red-500" />
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}