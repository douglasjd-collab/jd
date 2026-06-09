import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { FileText, Image, Music, Video, Download, Upload, Paperclip, MessageSquare } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';

const CATEGORIAS = ['Todos', 'WhatsApp', 'Interno', 'Documentos', 'CNH', 'Comprovante', 'Contrato', 'Simulação', 'Fotos', 'Outros'];

function getIconeAnexo(nome) {
  const ext = nome?.split('.').pop()?.toLowerCase() || '';
  if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext)) return { icon: Image, color: 'text-blue-500', bg: 'bg-blue-50' };
  if (['mp3', 'wav', 'ogg', 'm4a'].includes(ext)) return { icon: Music, color: 'text-purple-500', bg: 'bg-purple-50' };
  if (['mp4', 'mov', 'avi'].includes(ext)) return { icon: Video, color: 'text-green-500', bg: 'bg-green-50' };
  return { icon: FileText, color: 'text-slate-500', bg: 'bg-slate-50' };
}

function isImagem(nome, url) {
  const ext = nome?.split('.').pop()?.toLowerCase() || '';
  return ['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext) || isImagemUrl(url);
}

function isImagemUrl(url = '') {
  if (!url) return false;
  const s = url.toLowerCase().split('?')[0];
  return s.endsWith('.png') || s.endsWith('.jpg') || s.endsWith('.jpeg') || s.endsWith('.gif') || s.endsWith('.webp');
}

function isPdfUrl(url = '') {
  if (!url) return false;
  return url.toLowerCase().split('?')[0].endsWith('.pdf');
}

export default function OportunidadeAbaAnexos({ oportunidade, currentUser, comentarios = [] }) {
  const queryClient = useQueryClient();
  const [categoria, setCategoria] = useState('Todos');
  const [enviando, setEnviando] = useState(false);

  // Extrai anexos dos comentários internos
  const ANEXO_REGEX = /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g;
  const anexosComentarios = comentarios.flatMap(c => {
    const ms = [];
    let m;
    const rx = new RegExp(ANEXO_REGEX.source, 'g');
    while ((m = rx.exec(c.mensagem || '')) !== null) {
      ms.push({
        nome: m[1], url: m[2],
        usuario_nome: c.usuario_nome,
        created_date: c.created_date,
        fonte: 'interno',
      });
    }
    return ms;
  });

  // Busca conversa WhatsApp pelo telefone do lead
  const telefone = oportunidade?.telefone_lead || oportunidade?.cliente_telefone;
  const { data: conversa } = useQuery({
    queryKey: ['conversa-whatsapp-lead', telefone, oportunidade?.empresa_id],
    enabled: !!telefone && !!oportunidade?.empresa_id,
    queryFn: async () => {
      const convs = await base44.entities.ConversaWhatsapp.filter({
        empresa_id: oportunidade.empresa_id,
        cliente_telefone: telefone,
      });
      return convs[0] || null;
    },
  });

  const { data: mensagensWhatsApp = [] } = useQuery({
    queryKey: ['mensagens-whatsapp-anexos', conversa?.id],
    enabled: !!conversa?.id,
    queryFn: async () => {
      const msgs = await base44.entities.MensagemWhatsapp.filter(
        { conversa_id: conversa.id },
        '-data_envio',
        500
      );
      // Filtra apenas mensagens com arquivo (imagem ou pdf)
      return msgs.filter(m =>
        m.arquivo_url &&
        (m.tipo_conteudo === 'imagem' || m.tipo_conteudo === 'pdf' || m.tipo_conteudo === 'documento' ||
         isImagemUrl(m.arquivo_url) || isPdfUrl(m.arquivo_url))
      );
    },
  });

  // Monta lista de anexos do WhatsApp
  const anexosWhatsApp = mensagensWhatsApp.map(m => ({
    nome: m.arquivo_nome || (isImagemUrl(m.arquivo_url) ? 'imagem.jpg' : isPdfUrl(m.arquivo_url) ? 'documento.pdf' : 'arquivo'),
    url: m.arquivo_url,
    usuario_nome: m.remetente === 'cliente' ? (oportunidade?.cliente_nome || 'Cliente') : (m.usuario_nome || 'Vendedor'),
    created_date: m.data_envio || m.created_date,
    fonte: 'whatsapp',
    remetente: m.remetente,
  }));

  // Todos os anexos combinados
  const todosAnexos = [...anexosComentarios, ...anexosWhatsApp];
  
  // Filtro por categoria
  const anexos = categoria === 'WhatsApp'
    ? anexosWhatsApp
    : categoria === 'Interno'
    ? anexosComentarios
    : todosAnexos;

  const handleUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setEnviando(true);
    try {
      for (const file of files) {
        const { file_url } = await base44.integrations.Core.UploadFile({ file });
        await base44.entities.ComentarioOportunidade.create({
          oportunidade_id: oportunidade.id,
          empresa_id: oportunidade.empresa_id,
          usuario_id: currentUser?.id,
          usuario_nome: currentUser?.nome_perfil || currentUser?.full_name || '',
          mensagem: `📎 [${file.name}](${file_url})`,
          tipo: 'comentario',
        });
      }
      queryClient.invalidateQueries({ queryKey: ['comentarios-oportunidade', oportunidade.id] });
      toast.success('Arquivo(s) enviado(s) com sucesso!');
    } finally {
      setEnviando(false);
      e.target.value = '';
    }
  };

  return (
    <div className="p-6">
      {/* Toolbar */}
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        {/* Categorias */}
        <div className="flex flex-wrap gap-1.5">
          {CATEGORIAS.map(cat => {
            const count = cat === 'Todos' ? todosAnexos.length
              : cat === 'WhatsApp' ? anexosWhatsApp.length
              : cat === 'Interno' ? anexosComentarios.length
              : null;
            return (
              <button
                key={cat}
                onClick={() => setCategoria(cat)}
                className={`text-xs px-3 py-1.5 rounded-full font-medium transition-colors flex items-center gap-1 ${
                  categoria === cat
                    ? 'bg-[#1e3a5f] text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {cat === 'WhatsApp' && <MessageSquare className="w-3 h-3" />}
                {cat}
                {count != null && count > 0 && (
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${categoria === cat ? 'bg-white/20' : 'bg-slate-200'}`}>{count}</span>
                )}
              </button>
            );
          })}
        </div>

        {/* Upload */}
        <label className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium cursor-pointer transition-colors ${
          enviando ? 'bg-slate-200 text-slate-400' : 'bg-[#1e3a5f] text-white hover:bg-[#2a4a73]'
        }`}>
          {enviando
            ? <div className="w-4 h-4 border-2 border-slate-300 border-t-slate-500 rounded-full animate-spin" />
            : <Upload className="w-4 h-4" />
          }
          {enviando ? 'Enviando...' : 'Enviar arquivo'}
          <input type="file" multiple className="hidden" onChange={handleUpload} disabled={enviando} />
        </label>
      </div>

      {/* Lista de anexos */}
      {anexos.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-400">
          <Paperclip className="w-14 h-14 opacity-15 mb-4" />
          <p className="text-sm font-medium">Nenhum anexo encontrado</p>
          <p className="text-xs mt-1">Faça upload de documentos, imagens ou arquivos</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {anexos.map((a, i) => {
            const { icon: Icon, color, bg } = getIconeAnexo(a.nome);
                const ehImagem = isImagem(a.nome, a.url);
            return (
              <div key={i} className="border border-slate-200 rounded-xl overflow-hidden bg-white hover:border-blue-300 hover:shadow-sm transition-all group">
                {/* Preview */}
                <div className={`h-28 flex items-center justify-center ${ehImagem ? '' : bg}`}>
                  {ehImagem ? (
                    <img src={a.url} alt={a.nome} className="w-full h-full object-cover"
                      onError={e => { e.target.style.display = 'none'; }} />
                  ) : (
                    React.createElement(Icon, { className: `w-10 h-10 ${color}` })
                  )}
                </div>

                {/* Info */}
                <div className="px-3 py-2.5">
                  <p className="text-sm font-medium text-slate-800 truncate">{a.nome}</p>
                  <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1">
                    {a.fonte === 'whatsapp' && <MessageSquare className="w-3 h-3 text-green-500" />}
                    {a.usuario_nome} · {a.created_date ? format(new Date(a.created_date), 'dd/MM/yyyy HH:mm') : ''}
                  </p>
                </div>

                {/* Ações */}
                <div className="px-3 pb-3 flex gap-2">
                  <a
                    href={a.url} target="_blank" rel="noopener noreferrer" download={a.nome}
                    className="flex-1 flex items-center justify-center gap-1.5 text-xs text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg py-1.5 transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" /> Baixar
                  </a>
                  <a
                    href={a.url} target="_blank" rel="noopener noreferrer"
                    className="flex-1 flex items-center justify-center text-xs text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg py-1.5 transition-colors"
                  >
                    Visualizar
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}