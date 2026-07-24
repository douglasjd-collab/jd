import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { toast } from 'react-hot-toast';
import { Loader2, Upload, X, CheckCircle2, Image as ImageIcon, Video } from 'lucide-react';

// Upload de mídia para o cabeçalho do template (IMAGE ou VIDEO).
// 1) Salva o arquivo no storage do CRM (UploadFile)
// 2) Envia para a biblioteca de mídia da Meta (uploadMidiaMetaTemplate)
//    → devolve um handle (media_id) usado no header_handle do template.
export default function TemplateMediaUploader({ type, empresaId, value, onChange }) {
  const [uploading, setUploading] = useState(false);
  const [stage, setStage] = useState(''); // 'storage' | 'meta'

  const accept = type === 'IMAGE' ? 'image/jpeg,image/png' : 'video/mp4';
  const maxSize = type === 'IMAGE' ? 5 * 1024 * 1024 : 16 * 1024 * 1024;
  const Icon = type === 'IMAGE' ? ImageIcon : Video;
  const label = type === 'IMAGE' ? 'imagem' : 'vídeo';

  const handleFile = async (file) => {
    if (!file) return;
    if (!empresaId) {
      toast.error('Empresa não identificada para o upload.');
      return;
    }
    const rawType = (file.type || '').split(';')[0].trim().toLowerCase();
    if (type === 'IMAGE' && !['image/jpeg', 'image/png'].includes(rawType)) {
      toast.error('Use apenas JPEG ou PNG.');
      return;
    }
    if (type === 'VIDEO' && rawType !== 'video/mp4') {
      toast.error('Use apenas vídeo MP4 (H.264).');
      return;
    }
    if (file.size > maxSize) {
      toast.error(`Arquivo excede o tamanho máximo (${type === 'IMAGE' ? '5 MB' : '16 MB'}).`);
      return;
    }

    setUploading(true);
    try {
      // 1) Storage do CRM
      setStage('storage');
      const up = await base44.integrations.Core.UploadFile({ file });
      const fileUrl = up?.file_url;
      if (!fileUrl) throw new Error('Falha ao salvar o arquivo no storage.');

      // 2) Biblioteca de mídia da Meta (via D-API/Meta token)
      setStage('meta');
      const resMeta = await base44.functions.invoke('uploadMidiaMetaTemplate', {
        empresa_id: empresaId,
        midia_url: fileUrl,
        tipo_midia: type,
      });
      const mediaId = resMeta?.data?.media_id;
      if (!resMeta?.data?.ok || !mediaId) {
        throw new Error(resMeta?.data?.error || 'A Meta não retornou o identificador da mídia.');
      }

      onChange({
        header_media_url: fileUrl,
        header_media_id: mediaId,
        header_media_mime: file.type,
        header_media_name: file.name,
        header_media_size: file.size,
      });
      toast.success(label === 'imagem' ? 'Imagem enviada para a Meta.' : 'Vídeo enviado para a Meta.');
    } catch (e) {
      console.error('uploadMidiaTemplate', e);
      const msg = e?.response?.data?.error || e?.message || 'Erro ao enviar mídia para a Meta.';
      onChange({ header_media_id: '' });
      toast.error(msg);
    } finally {
      setUploading(false);
      setStage('');
    }
  };

  const handleRemove = () => {
    onChange({ header_media_url: '', header_media_id: '', header_media_mime: '', header_media_name: '', header_media_size: null });
  };

  const koBytes = (v) => (v ? Math.round(v / 1024) + ' KB' : '');

  if (value?.header_media_id) {
    return (
      <div className="mt-1 rounded-md border border-emerald-200 bg-emerald-50 p-3 space-y-2">
        <div className="flex items-start gap-3">
          {value?.header_media_url && type === 'IMAGE' ? (
            <img src={value.header_media_url} alt="prévia" className="w-16 h-16 object-cover rounded border border-emerald-200" />
          ) : (
            <div className="w-16 h-16 rounded border border-emerald-200 bg-white flex items-center justify-center">
              <Icon className="w-7 h-7 text-emerald-600" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1 text-xs font-semibold text-emerald-800">
              <CheckCircle2 className="w-3.5 h-3.5" /> Mídia enviada para a Meta
            </div>
            <div className="text-[10px] text-emerald-700 truncate">{value?.header_media_name || 'arquivo'}</div>
            {value?.header_media_size ? <div className="text-[10px] text-emerald-700">{koBytes(value.header_media_size)}</div> : null}
            <button
              type="button"
              onClick={handleRemove}
              className="mt-1 inline-flex items-center gap-1 text-[10px] text-emerald-700 hover:text-red-600"
            >
              <X className="w-3 h-3" /> Trocar/Remover
            </button>
          </div>
        </div>
        <div className="text-[10px] text-emerald-700 font-mono break-all">handle: {value.header_media_id}</div>
      </div>
    );
  }

  return (
    <div className="mt-1 rounded-md border border-dashed border-slate-300 bg-slate-50 p-4">
      <label className="flex flex-col items-center justify-center gap-2 cursor-pointer text-center">
        <div className={`w-10 h-10 rounded-full ${uploading ? 'bg-slate-100' : 'bg-[#10353C]/10'} flex items-center justify-center`}>
          {uploading ? <Loader2 className="w-5 h-5 text-[#10353C] animate-spin" /> : <Upload className="w-5 h-5 text-[#10353C]" />}
        </div>
        <span className="text-xs font-semibold text-slate-700">
          {uploading
            ? (stage === 'storage' ? 'Salvando arquivo...' : 'Enviando para a Meta...')
            : `Clique para enviar a ${label}`}
        </span>
        <span className="text-[10px] text-slate-500">
          {type === 'IMAGE' ? 'JPEG ou PNG · até 5 MB' : 'MP4 (H.264) · até 16 MB'}
        </span>
        <input
          type="file"
          accept={accept}
          className="hidden"
          disabled={uploading}
          onChange={(e) => { const f = e.target.files?.[0]; handleFile(f); e.target.value = ''; }}
        />
      </label>
    </div>
  );
}