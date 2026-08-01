import React, { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { CalendarClock, Trash2, RefreshCw, Image as ImageIcon, Video, FileText, Upload, X, FileCheck2, Layers, RotateCw, Loader2 } from 'lucide-react';
import SelecionarTemplateMetaModal from './SelecionarTemplateMetaModal';

// Calcula o primeiro nome resolvido do cliente (igual ao backend) para
// exibir na lista de agendamentos template: "{{1}} será enviado como: Maria".
// O backend resolve no disparo; aqui apenas mostramos a prévia ao usuário.
function primeiroNomeResolvidoPreview(cliente) {
  if (!cliente) return '';
  const fonte = String(
    cliente.primeiro_nome ||
    cliente.nome_completo ||
    cliente.nome ||
    cliente.pj_nome_fantasia ||
    cliente.pj_razao_social ||
    cliente.cliente_nome ||
    ''
  ).trim();
  if (!fonte || /^\d+$/.test(fonte)) return '';
  const partes = fonte.split(/\s+/).filter(Boolean);
  if (partes.length === 0) return '';
  const nome = partes[0];
  return nome.charAt(0).toUpperCase() + nome.slice(1).toLowerCase();
}

export default function AgendarMensagemModal({ open, onOpenChange, conversa, currentUser }) {
  const [tab, setTab] = useState('novo');
  const [tipo, setTipo] = useState('unica');
  const [tipoEnvio, setTipoEnvio] = useState('texto');
  const [apiPreferida, setApiPreferida] = useState('dapi');
  const [mensagem, setMensagem] = useState('');
  const [dataEnvio, setDataEnvio] = useState('');
  const [horaEnvio, setHoraEnvio] = useState('08:00');
  const [saving, setSaving] = useState(false);
  const [agendados, setAgendados] = useState([]);
  const [loadingAgendados, setLoadingAgendados] = useState(false);

  // Mídia
  const [arquivo, setArquivo] = useState(null); // File object
  const [arquivoPreview, setArquivoPreview] = useState(null); // URL preview
  const [uploadando, setUploadando] = useState(false);
  const fileInputRef = useRef(null);

  // Template Meta (api_preferida = meta_oficial)
  const [popupTemplateOpen, setPopupTemplateOpen] = useState(false);
  const [templateSelecionado, setTemplateSelecionado] = useState(null);
  const [bodyTemplate, setBodyTemplate] = useState('');
  const [valoresVarsArr, setValoresVarsArr] = useState([]);
  const [componentsJson, setComponentsJson] = useState('');
  const [cliente, setCliente] = useState(null);
  const [conexaoOficial, setConexaoOficial] = useState(null); // conexão da API Oficial ativa da empresa
  const presetandoApiRef = useRef(false);
  const [reenviandoId, setReenviandoId] = useState(null);

  useEffect(() => {
    if (open && conversa) {
      loadAgendados();
      setDataEnvio(format(new Date(), 'yyyy-MM-dd'));
      // Pré-selecionar a API conforme canal fixo da conversa (sem abrir popup)
      presetandoApiRef.current = true;
      const canalMeta =
        conversa.tipo_conexao === 'meta_oficial' ||
        conversa.canal_origem === 'meta' ||
        conversa.provider === 'whatsapp_meta';
      setApiPreferida(canalMeta ? 'meta_oficial' : 'dapi');
      // Buscar dados do cliente para pré-preencher variáveis do template
      if (conversa.cliente_id) {
        base44.entities.Cliente.get(conversa.cliente_id).then(setCliente).catch(() => setCliente(null));
      }
      // Carregar a conexão oficial ativa da empresa (salva no agendamento)
      const empresaId = currentUser?.empresa_id || conversa.empresa_id;
      if (empresaId) {
        base44.entities.WhatsappConnection.filter({ empresa_id: empresaId, is_active: true }, '-created_date', 50)
          .then((conns) => {
            const cloud = conns.find((c) => c.provider_type === 'dapi' && /^cloud-/i.test(String(c.session_id || '').trim()));
            const meta = conns.find((c) => c.provider_type === 'meta_oficial');
            setConexaoOficial(cloud || meta || null);
          })
          .catch(() => setConexaoOficial(null));
      }
    }
    if (!open) resetForm();
  }, [open, conversa]);

  // Quando usuário muda a API manualmente via dropdown
  const handleApiPreferidaChange = (value) => {
    setApiPreferida(value);
    if (presetandoApiRef.current) {
      presetandoApiRef.current = false;
      return;
    }
    if (value === 'meta_oficial') {
      setPopupTemplateOpen(true);
    } else {
      // Limpar template ao trocar para D-API
      setTemplateSelecionado(null);
      setBodyTemplate('');
      setValoresVarsArr([]);
      setComponentsJson('');
      setTipoEnvio('texto');
    }
  };

  const resetForm = () => {
    setMensagem('');
    setTipo('unica');
    setTipoEnvio('texto');
    setApiPreferida('dapi');
    setArquivo(null);
    setArquivoPreview(null);
    setTemplateSelecionado(null);
    setBodyTemplate('');
    setValoresVarsArr([]);
    setComponentsJson('');
    setPopupTemplateOpen(false);
  };

  const loadAgendados = async () => {
    if (!conversa?.id) return;
    setLoadingAgendados(true);
    try {
      const lista = await base44.entities.MensagemAgendada.filter(
        { conversa_id: conversa.id },
        '-created_date',
        50
      );
      setAgendados(lista.filter(a => a.status !== 'cancelada'));
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingAgendados(false);
    }
  };

  const handleTipoEnvioChange = (val) => {
    setTipoEnvio(val);
    // Limpar arquivo ao mudar tipo
    setArquivo(null);
    setArquivoPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validar formato
    if (tipoEnvio === 'texto_imagem') {
      const allowed = ['image/jpeg', 'image/png', 'image/webp'];
      if (!allowed.includes(file.type)) {
        toast.error('Formato inválido. Use JPG, PNG ou WEBP.');
        return;
      }
    }
    if (tipoEnvio === 'texto_video') {
      const allowed = ['video/mp4', 'video/quicktime'];
      if (!allowed.includes(file.type)) {
        toast.error('Formato inválido. Use MP4 ou MOV.');
        return;
      }
    }

    setArquivo(file);
    const url = URL.createObjectURL(file);
    setArquivoPreview(url);
  };

  const removeArquivo = () => {
    setArquivo(null);
    setArquivoPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSalvar = async () => {
    // Meta Oficial exige template aprovado selecionado
    if (apiPreferida === 'meta_oficial' && !templateSelecionado) {
      toast.error('Selecione um template aprovado da Meta para envio via API Oficial.');
      setPopupTemplateOpen(true);
      return;
    }
    if (!templateSelecionado && !mensagem.trim()) { toast.error('Digite a mensagem'); return; }
    if (!dataEnvio) { toast.error('Selecione a data'); return; }
    if (!horaEnvio) { toast.error('Selecione o horário'); return; }
    if (!templateSelecionado && tipoEnvio !== 'texto' && !arquivo) {
      toast.error('Anexe o arquivo de mídia ou mude o tipo para "Somente texto".');
      return;
    }

    const proximaExecucao = new Date(`${dataEnvio}T${horaEnvio}:00`).toISOString();

    setSaving(true);
    try {
      let arquivoUrl = '';
      let arquivoTipo = '';
      let arquivoNome = '';

      // Upload da mídia (apenas para envios livres, não para template Meta)
      if (!templateSelecionado && arquivo) {
        setUploadando(true);
        const { file_url } = await base44.integrations.Core.UploadFile({ file: arquivo });
        arquivoUrl = file_url;
        arquivoTipo = arquivo.type;
        arquivoNome = arquivo.name;
        setUploadando(false);
      }

      // Para templates da Meta, salvar o body_text BRUTO (com {{1}}) — backend
      // resolve a variável no disparo, preservando a referência dinâmica. O
      // preview não vira texto fixo no agendamento.
      const mensagemFinal = templateSelecionado
        ? (templateSelecionado.body_text || bodyTemplate || mensagem.trim())
        : mensagem.trim();

      await base44.entities.MensagemAgendada.create({
        empresa_id: currentUser?.empresa_id || '',
        conversa_id: conversa.id,
        cliente_id: conversa.cliente_id || '',
        telefone: conversa.cliente_telefone || '',
        mensagem: mensagemFinal,
        tipo,
        recorrencia: tipo === 'recorrente' ? 'mensal' : '',
        tipo_envio: templateSelecionado ? 'template' : tipoEnvio,
        api_preferida: apiPreferida,
        canal: apiPreferida === 'meta_oficial' ? 'META_OFFICIAL' : 'DAPI',
        template_id: templateSelecionado?.id || '',
        template_nome: templateSelecionado?.name || '',
        template_language: templateSelecionado?.language || '',
        template_category: templateSelecionado?.category || '',
        template_variables_json: templateSelecionado ? JSON.stringify(valoresVarsArr) : '',
        template_components_json: templateSelecionado ? componentsJson : '',
        // Conexão oficial fixa no agendamento: garante disparo pela mesma
        // conexão no horário agendado, independentemente do canal selecionado
        // na conversa no momento.
        official_connection_id: templateSelecionado ? (conexaoOficial?.id || '') : '',
        // Fixar também a sessão da API JD Promotora. Sem isso, o backend
        // poderia escolher outra conexão D-API ativa (inclusive a Cloud API Oficial).
        session_id: templateSelecionado
          ? (conexaoOficial?.session_id || '')
          : (conversa.instancia || ''),
        arquivo_url: arquivoUrl,
        arquivo_tipo: arquivoTipo,
        arquivo_nome: arquivoNome,
        legenda: !templateSelecionado && tipoEnvio !== 'texto' ? mensagem.trim() : '',
        data_envio: dataEnvio,
        hora_envio: horaEnvio,
        status: 'agendada',
        responsavel_id: currentUser?.id || '',
        responsavel_nome: currentUser?.nome_perfil || currentUser?.full_name || '',
        instancia_whatsapp: conversa.instancia || '',
        proxima_execucao: proximaExecucao,
      });

      toast.success('✅ Mensagem agendada com sucesso!');
      resetForm();
      setTab('agendados');
      loadAgendados();
    } catch (e) {
      toast.error('Erro ao agendar mensagem: ' + (e.message || ''));
    } finally {
      setSaving(false);
      setUploadando(false);
    }
  };

  const handleCancelar = async (id) => {
    await base44.entities.MensagemAgendada.update(id, { status: 'cancelada' });
    toast.success('Agendamento cancelado');
    loadAgendados();
  };

  // Reenvio manual: reexecuta o envio usando a conexão oficial corrigida,
  // sem criar novo agendamento nem duplicar a mensagem no histórico.
  const handleTentarNovamente = async (id) => {
    setReenviandoId(id);
    try {
      const resp = await base44.functions.invoke('reenviarMensagemAgendada', {
        mensagem_id: id,
      });
      const data = resp?.data || {};
      if (data.success) {
        toast.success('Mensagem reenviada com sucesso!');
        loadAgendados();
      } else {
        toast.error('Falha ao reenviar: ' + (data.error || 'erro desconhecido'));
        loadAgendados();
      }
    } catch (e) {
      toast.error('Erro ao reenviar: ' + (e.message || ''));
      loadAgendados();
    } finally {
      setReenviandoId(null);
    }
  };

  const statusColor = {
    agendada: 'bg-blue-100 text-blue-700',
    processando: 'bg-amber-100 text-amber-700',
    enviada: 'bg-green-100 text-green-700',
    falha: 'bg-red-100 text-red-700',
    cancelada: 'bg-gray-100 text-gray-500',
  };

  const tipoEnvioLabel = {
    texto: '💬 Somente texto',
    texto_imagem: '🖼️ Texto + imagem',
    texto_video: '🎬 Texto + vídeo',
  };

  const aceitaArquivo = tipoEnvio === 'texto_imagem'
    ? 'image/jpeg,image/png,image/webp'
    : tipoEnvio === 'texto_video'
    ? 'video/mp4,video/quicktime'
    : '';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarClock className="w-5 h-5 text-blue-600" />
            Agendar Mensagem
          </DialogTitle>
        </DialogHeader>

        {/* Tabs */}
        <div className="flex gap-2 border-b pb-2">
          <button
            onClick={() => setTab('novo')}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${tab === 'novo' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
          >
            Novo agendamento
          </button>
          <button
            onClick={() => { setTab('agendados'); loadAgendados(); }}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${tab === 'agendados' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
          >
            Agendados {agendados.length > 0 && `(${agendados.length})`}
          </button>
        </div>

        {tab === 'novo' ? (
          <div className="space-y-4 mt-1">
            {/* API de envio */}
            <div>
              <Label>Qual API deseja usar para enviar?</Label>
              <Select value={apiPreferida} onValueChange={handleApiPreferidaChange}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="meta_oficial">🟢 API Oficial (Meta)</SelectItem>
                  <SelectItem value="dapi">🟦 API - JD Promotora (D-API)</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-slate-500 mt-1">
                {apiPreferida === 'meta_oficial'
                  ? 'Usa o número oficial Meta cadastrado. Recomendado para disparos confiáveis.'
                  : 'Usa a conexão D-API da empresa (multi-número).'}
              </p>
            </div>

            {/* Template da Meta (apenas quando API Oficial) */}
            {apiPreferida === 'meta_oficial' && (
              <div>
                <Label>Template da Meta</Label>
                {templateSelecionado ? (
                  <div className="mt-1 border border-emerald-200 bg-emerald-50/40 rounded-lg p-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2 min-w-0">
                        <FileCheck2 className="w-4 h-4 text-emerald-600 mt-0.5 flex-shrink-0" />
                        <div className="min-w-0">
                          <p className="font-medium text-slate-800 text-sm">
                            {templateSelecionado.display_name || templateSelecionado.name}
                          </p>
                          <p className="text-[10px] text-slate-500 font-mono">
                            {templateSelecionado.name} · {templateSelecionado.language} · {templateSelecionado.category}
                          </p>
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setPopupTemplateOpen(true)}
                      >
                        Trocar
                      </Button>
                    </div>
                    <div className="bg-white rounded p-2 border border-slate-200">
                      <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wide mb-1">
                        Texto aprovado pela Meta
                      </p>
                      <p className="text-xs text-slate-700 whitespace-pre-wrap">
                        {templateSelecionado.body_text}
                      </p>
                    </div>
                    {valoresVarsArr.length > 0 && (
                      <div className="text-[10px] text-slate-500 space-y-0.5">
                        {valoresVarsArr.map((vv) => (
                          <div key={vv.position} className="flex items-center gap-1">
                            <span className="font-mono">{`{{${vv.position}}}`}</span>
                            {vv.value === '__AUTO_PRIMEIRO_NOME__' ? (
                              <span className="text-emerald-700 font-medium">— Primeiro nome do cliente · preenchimento automático</span>
                            ) : (
                              <span>— {vv.value}</span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    {/* PRÉVIA RESOLVIDA PARA ESTE CLIENTE — área separada.
                        Mostra como a mensagem chegará ao destinatário. Nunca
                        sobrescreve o texto original; é apenas visualização. */}
                    <div className="bg-slate-50 rounded p-2 border border-slate-200">
                      <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wide mb-1">
                        Prévia para este cliente
                      </p>
                      <p className="text-xs text-slate-700 whitespace-pre-wrap">{bodyTemplate}</p>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setPopupTemplateOpen(true)}
                    className="mt-1 w-full border-2 border-dashed border-blue-300 rounded-lg p-4 flex flex-col items-center gap-1 text-blue-600 hover:bg-blue-50 transition-colors"
                  >
                    <Layers className="w-6 h-6" />
                    <span className="text-sm font-medium">Selecionar template aprovado</span>
                    <span className="text-xs">A Meta exige um template aprovado para envios fora da janela de 24h</span>
                  </button>
                )}
              </div>
            )}

            {/* Tipo de agendamento */}
            <div>
              <Label>Tipo de agendamento</Label>
              <Select value={tipo} onValueChange={setTipo}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unica">📅 Mensagem única</SelectItem>
                  <SelectItem value="recorrente">🔁 Lembrete recorrente (mensal)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Tipo de envio (oculto quando template Meta selecionado) */}
            {!templateSelecionado && (
              <div>
                <Label>Tipo de envio</Label>
                <Select value={tipoEnvio} onValueChange={handleTipoEnvioChange}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="texto">💬 Somente texto</SelectItem>
                    <SelectItem value="texto_imagem">🖼️ Texto + imagem (JPG, PNG, WEBP)</SelectItem>
                    <SelectItem value="texto_video">🎬 Texto + vídeo (MP4, MOV)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-slate-500 mt-1">
                  {tipoEnvio === 'texto' && 'Envia apenas a mensagem digitada.'}
                  {tipoEnvio === 'texto_imagem' && 'Envia a imagem com a mensagem como legenda.'}
                  {tipoEnvio === 'texto_video' && 'Envia o vídeo com a mensagem como legenda.'}
                </p>
              </div>
            )}

            {/* Mensagem (oculto quando template Meta selecionado) */}
            {!templateSelecionado && (
              <div>
                <Label>{tipoEnvio === 'texto' ? 'Mensagem' : 'Mensagem (legenda)'}</Label>
                <Textarea
                  className="mt-1"
                  rows={3}
                  placeholder="Digite a mensagem que será enviada ao cliente..."
                  value={mensagem}
                  onChange={(e) => setMensagem(e.target.value)}
                />
              </div>
            )}

            {/* Upload de mídia */}
            {tipoEnvio !== 'texto' && (
              <div>
                <Label>{tipoEnvio === 'texto_imagem' ? 'Imagem' : 'Vídeo'}</Label>
                {!arquivo ? (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="mt-1 w-full border-2 border-dashed border-slate-300 rounded-lg p-4 flex flex-col items-center gap-2 text-slate-500 hover:border-blue-400 hover:text-blue-600 transition-colors"
                  >
                    {tipoEnvio === 'texto_imagem'
                      ? <ImageIcon className="w-8 h-8" />
                      : <Video className="w-8 h-8" />}
                    <span className="text-sm font-medium">Clique para anexar</span>
                    <span className="text-xs">
                      {tipoEnvio === 'texto_imagem' ? 'JPG, PNG ou WEBP' : 'MP4 ou MOV'}
                    </span>
                  </button>
                ) : (
                  <div className="mt-1 relative border rounded-lg overflow-hidden bg-slate-50">
                    {tipoEnvio === 'texto_imagem' ? (
                      <img src={arquivoPreview} alt="preview" className="w-full max-h-48 object-contain" />
                    ) : (
                      <video src={arquivoPreview} className="w-full max-h-48" controls />
                    )}
                    <button
                      onClick={removeArquivo}
                      className="absolute top-2 right-2 bg-red-500 text-white rounded-full p-1 hover:bg-red-600"
                    >
                      <X className="w-3 h-3" />
                    </button>
                    <p className="text-xs text-slate-500 p-2 truncate">{arquivo.name}</p>
                  </div>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={aceitaArquivo}
                  className="hidden"
                  onChange={handleFileSelect}
                />
              </div>
            )}

            {/* Pré-visualização */}
            {mensagem.trim() && (
              <div>
                <Label className="text-slate-500 text-xs">Pré-visualização</Label>
                <div className="mt-1 bg-[#dcf8c6] rounded-xl rounded-br-none p-3 max-w-xs ml-auto shadow-sm">
                  {arquivo && arquivoPreview && tipoEnvio === 'texto_imagem' && (
                    <img src={arquivoPreview} alt="preview" className="w-full rounded-lg mb-1 max-h-32 object-cover" />
                  )}
                  {arquivo && arquivoPreview && tipoEnvio === 'texto_video' && (
                    <video src={arquivoPreview} className="w-full rounded-lg mb-1 max-h-32" />
                  )}
                  <p className="text-sm text-slate-800 whitespace-pre-wrap">{mensagem}</p>
                  <p className="text-[10px] text-slate-500 text-right mt-1">
                    {dataEnvio && horaEnvio ? `${dataEnvio} ${horaEnvio}` : 'Agendado'} · ⏰
                  </p>
                </div>
              </div>
            )}

            {/* Data e hora */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Data de envio</Label>
                <Input
                  type="date"
                  className="mt-1"
                  value={dataEnvio}
                  min={format(new Date(), 'yyyy-MM-dd')}
                  onChange={(e) => setDataEnvio(e.target.value)}
                />
              </div>
              <div>
                <Label>Horário</Label>
                <Input
                  type="time"
                  className="mt-1"
                  value={horaEnvio}
                  onChange={(e) => setHoraEnvio(e.target.value)}
                />
              </div>
            </div>

            {tipo === 'recorrente' && (
              <div className="p-3 bg-blue-50 rounded-lg border border-blue-200 text-sm text-blue-700">
                🔁 A mensagem será enviada todo mês no dia <strong>{dataEnvio ? new Date(dataEnvio + 'T12:00').getDate() : '?'}</strong> às <strong>{horaEnvio}</strong>, até ser cancelada manualmente.
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
              <Button onClick={handleSalvar} disabled={saving || uploadando} className="bg-blue-600 hover:bg-blue-700 gap-2">
                <CalendarClock className="w-4 h-4" />
                {uploadando ? 'Enviando arquivo...' : saving ? 'Agendando...' : 'Agendar mensagem'}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-2 mt-1 max-h-96 overflow-y-auto">
            {loadingAgendados ? (
              <p className="text-center text-slate-400 py-4">Carregando...</p>
            ) : agendados.length === 0 ? (
              <p className="text-center text-slate-400 py-8">Nenhuma mensagem agendada para esta conversa.</p>
            ) : (
              agendados.map(a => (
                <div key={a.id} className="border rounded-lg p-3 space-y-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      {/* Badge tipo envio */}
                      {a.tipo_envio && a.tipo_envio !== 'texto' && (
                        <span className="text-xs text-slate-500 mb-1 block">
                          {a.tipo_envio === 'texto_imagem' ? '🖼️ Imagem' : '🎬 Vídeo'}
                          {a.arquivo_nome && ` · ${a.arquivo_nome}`}
                        </span>
                      )}
                      {/* Prévia de mídia */}
                      {a.arquivo_url && a.tipo_envio === 'texto_imagem' && (
                        <img src={a.arquivo_url} alt="mídia" className="w-full max-h-24 object-cover rounded mb-1" />
                      )}
                      {a.arquivo_url && a.tipo_envio === 'texto_video' && (
                        <video src={a.arquivo_url} className="w-full max-h-24 rounded mb-1" />
                      )}
                      <p className="text-sm text-slate-800">{a.mensagem}</p>
                      {/* Prévia da variável {{1}} resolvida — o backend usa o
                          primeiro nome real do cliente no disparo, mas a UI
                          mostra o texto aprovado (com {{1}}) + esta linha. */}
                      {a.tipo_envio === 'template' && a.mensagem && /\{\{1\}\}/.test(a.mensagem) && (
                        <p className="text-[11px] text-emerald-700 mt-0.5">
                          <span className="font-mono">{`{{1}}`}</span> será enviado como:{' '}
                          <strong>{primeiroNomeResolvidoPreview(cliente) || 'por aí'}</strong>
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col gap-1 flex-shrink-0">
                      {a.status === 'agendada' && (
                        <button onClick={() => handleCancelar(a.id)} className="text-red-500 hover:text-red-700" title="Cancelar">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                      {a.status === 'falha' && (
                        <button
                          onClick={() => handleTentarNovamente(a.id)}
                          disabled={reenviandoId === a.id}
                          className="text-blue-600 hover:text-blue-800 disabled:opacity-50 flex items-center gap-1 justify-end"
                          title="Tentar enviar novamente pela conexão oficial ativa"
                        >
                          {reenviandoId === a.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <RotateCw className="w-4 h-4" />
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor[a.status]}`}>
                      {a.status}
                    </span>
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-slate-100 text-slate-600" title="API de envio">
                      {a.api_preferida === 'meta_oficial' ? '🟢 Meta Oficial' : '🟦 JD Promotora'}
                    </span>
                    {a.tipo === 'recorrente' && (
                      <span className="text-xs text-blue-600 flex items-center gap-1"><RefreshCw className="w-3 h-3" /> Mensal</span>
                    )}
                    <span className="text-xs text-slate-500">
                      📅 {a.data_envio} às {a.hora_envio}
                    </span>
                  </div>
                  {a.status === 'falha' && a.erro_detalhe && (
                    <p className="text-xs text-red-500">{a.erro_detalhe}</p>
                  )}
                  {a.ultima_execucao && (
                    <p className="text-xs text-slate-400">Último envio: {format(new Date(a.ultima_execucao), 'dd/MM/yyyy HH:mm')}</p>
                  )}
                </div>
              ))
            )}
          </div>
        )}
      </DialogContent>

      {/* Popup de seleção de template da Meta */}
      <SelecionarTemplateMetaModal
        open={popupTemplateOpen}
        onOpenChange={setPopupTemplateOpen}
        conversa={conversa}
        cliente={cliente}
        onSelect={({ template, valoresArr, bodyFinal, componentsJson: cj }) => {
          setTemplateSelecionado(template);
          setValoresVarsArr(valoresArr);
          setBodyTemplate(bodyFinal);
          setComponentsJson(cj);
        }}
      />
    </Dialog>
  );
}