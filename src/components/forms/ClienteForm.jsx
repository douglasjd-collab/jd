import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Loader2, User, Building2, Info, AlertTriangle } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import DocUploadItem from './DocUploadItem';
import ImportarDocumentosSecao from '@/components/clientes/ImportarDocumentosSecao';
import DocumentosClienteSecao from '@/components/clientes/DocumentosClienteSecao';
import ConfirmarAtualizacaoModal from '@/components/clientes/ConfirmarAtualizacaoModal';

// Mapeia campos extraídos dos documentos -> campos do CRM (Pessoa Física)
const MAPA_CAMPOS_DOC = [
  { extractKey: 'nome_completo', field: 'nome_completo', label: 'Nome Completo' },
  { extractKey: 'cpf', field: 'cpf', label: 'CPF' },
  { extractKey: 'rg', field: 'rg', label: 'RG' },
  { extractKey: 'rg_orgao_emissor', field: 'rg_orgao_emissor', label: 'Órgão Emissor' },
  { extractKey: 'rg_data_emissao', field: 'rg_data_emissao', label: 'Data de Emissão do RG' },
  { extractKey: 'data_nascimento', field: 'data_nascimento', label: 'Data de Nascimento' },
  { extractKey: 'naturalidade', field: 'local_nascimento', label: 'Local de Nascimento' },
  { extractKey: 'nacionalidade', field: 'nacionalidade', label: 'Nacionalidade' },
  { extractKey: 'nome_mae', field: 'nome_mae', label: 'Nome da Mãe' },
  { extractKey: 'nome_pai', field: 'nome_pai', label: 'Nome do Pai' },
  // Comprovante de residência -> Endereço Residencial
  { extractKey: 'cep', field: 'res_cep', label: 'CEP' },
  { extractKey: 'uf', field: 'res_uf', label: 'UF (Residencial)' },
  { extractKey: 'cidade', field: 'res_cidade', label: 'Cidade (Residencial)' },
  { extractKey: 'bairro', field: 'res_bairro', label: 'Bairro (Residencial)' },
  { extractKey: 'logradouro', field: 'res_endereco', label: 'Endereço (Residencial)' },
  { extractKey: 'numero', field: 'res_numero', label: 'Número (Residencial)' },
  { extractKey: 'complemento', field: 'res_complemento', label: 'Complemento (Residencial)' },
];

const TIPO_DOC_LABEL = {
  cnh: 'CNH', rg: 'RG', comprovante_residencia: 'Comprovante de Residência',
  comprovante_renda: 'Comprovante de Renda', outro: 'Outro'
};

const normCpf = (v) => String(v || '').replace(/\D/g, '');

const confiancaParaCampo = (doc, extractKey) => {
  if (!doc) return null;
  const g = doc.confianca_geral || 'nao_identificado';
  if (Array.isArray(doc.campos_baixa_confianca) && doc.campos_baixa_confianca.includes(extractKey)) return 'baixa';
  if (g === 'alta') return 'alta';
  if (g === 'media') return 'media';
  if (g === 'baixa') return 'baixa';
  return g === 'nao_identificado' ? 'media' : g;
};

export default function ClienteForm({ open, onOpenChange, cliente, onSubmit, isLoading, clientes, currentUser, onClienteExistenteCarregado }) {
  const [uploadingDoc, setUploadingDoc] = useState(null);

  // Estado do preenchimento automático via documentos
  const [documentosPendentes, setDocumentosPendentes] = useState([]); // [{arquivo_url, arquivo_nome, arquivo_tamanho, arquivo_mime, tipo_documento, lado, campos_extraidos_json, nivel_confianca}]
  const [camposAuto, setCamposAuto] = useState({}); // {field: {valor, confianca, origem}}
  const [divergencias, setDivergencias] = useState({}); // {field: {valorAtual, valorNovo, origem, label}}
  const [preencherPendente, setPreencherPendente] = useState(null); // documentos extraídos para aplicar após reset
  const [modalAtualizacao, setModalAtualizacao] = useState(null); // {clienteExistente, camposPreencher}
  
  const { register, handleSubmit, setValue, watch, reset, formState: { errors } } = useForm({
    defaultValues: cliente || {
      tipo_pessoa: 'Física',
      status: 'ativo',
      // Checkboxes PF
      doc_documento_testemunhas: false,
      doc_documento_testemunhas_urls: [],
      doc_identidade: false,
      doc_identidade_urls: [],
      doc_comprovante_endereco: false,
      doc_comprovante_endereco_urls: [],
      doc_comprovante_renda: false,
      doc_comprovante_renda_urls: [],
      doc_proposta_assinada: false,
      doc_proposta_assinada_urls: [],
      banco_nao_deseja_informar: false,
      banco_nao_possui_conta: false,
      // Checkboxes PJ
      pj_doc_contrato_ou_estatuto_social: false,
      pj_doc_contrato_ou_estatuto_social_urls: [],
      pj_doc_cartao_cnpj: false,
      pj_doc_cartao_cnpj_urls: [],
      pj_doc_documento_socios_ou_representante: false,
      pj_doc_documento_socios_ou_representante_urls: [],
      pj_doc_relacao_faturamento: false,
      pj_doc_relacao_faturamento_urls: [],
      pj_doc_proposta_assinada: false,
      pj_doc_proposta_assinada_urls: [],
      pj_banco_nao_deseja_informar: false,
      pj_banco_nao_possui_conta: false,
    }
  });

  const tipoPessoa = watch('tipo_pessoa');
  const bancoNaoDeseja = watch('banco_nao_deseja_informar');
  const bancoNaoPossui = watch('banco_nao_possui_conta');
  const pjBancoNaoDeseja = watch('pj_banco_nao_deseja_informar');
  const pjBancoNaoPossui = watch('pj_banco_nao_possui_conta');

  useEffect(() => {
    if (cliente) {
      Object.keys(cliente).forEach(key => {
        setValue(key, cliente[key]);
      });
    } else {
      reset({
        tipo_pessoa: 'Física',
        status: 'ativo',
        doc_documento_testemunhas: false, doc_documento_testemunhas_urls: [],
        doc_identidade: false, doc_identidade_urls: [],
        doc_comprovante_endereco: false, doc_comprovante_endereco_urls: [],
        doc_comprovante_renda: false, doc_comprovante_renda_urls: [],
        doc_proposta_assinada: false, doc_proposta_assinada_urls: [],
        banco_nao_deseja_informar: false, banco_nao_possui_conta: false,
        pj_doc_contrato_ou_estatuto_social: false, pj_doc_contrato_ou_estatuto_social_urls: [],
        pj_doc_cartao_cnpj: false, pj_doc_cartao_cnpj_urls: [],
        pj_doc_documento_socios_ou_representante: false, pj_doc_documento_socios_ou_representante_urls: [],
        pj_doc_relacao_faturamento: false, pj_doc_relacao_faturamento_urls: [],
        pj_doc_proposta_assinada: false, pj_doc_proposta_assinada_urls: [],
        pj_banco_nao_deseja_informar: false, pj_banco_nao_possui_conta: false,
      });
    }
    // Aplica preenchimento automático pendente (após carregar cliente existente, se houver)
    if (preencherPendente && preencherPendente.length > 0) {
      const pendente = preencherPendente;
      setPreencherPendente(null);
      // Aplica após o reset síncrono para garantir valores atuais
      setTimeout(() => aplicarPreenchimentoEmVazios(pendente), 0);
    } else {
      // Zera estados ao trocar contexto sem preenchimento
      setCamposAuto({});
      setDivergencias({});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cliente, setValue, reset]);

  // Limpa estados ao fechar o formulário
  useEffect(() => {
    if (!open) {
      setDocumentosPendentes([]);
      setCamposAuto({});
      setDivergencias({});
      setPreencherPendente(null);
      setModalAtualizacao(null);
    }
  }, [open]);

  // Retorna o valor "atual" de um campo do form, considerando formatação. null/''/undefined = vazio.
  const valorAtualCampo = (field) => {
    const v = watch(field);
    if (v === null || v === undefined || v === '') return null;
    return String(v).trim() !== '' ? v : null;
  };

  // Aplica o preenchimento SOMENTE em campos vazios do formulário.
  // Campos já preenchidos não são substituídos; divergências são registradas.
  const aplicarPreenchimentoEmVazios = (documentosExtraidos) => {
    const novosCamposAuto = {};
    const novasDivergencias = {};

    for (const doc of documentosExtraidos) {
      if (!doc || doc.erro) continue;
      const origem = `${TIPO_DOC_LABEL[doc.tipo_documento] || doc.tipo_documento || 'Documento'}${doc.lado && doc.lado !== 'nao_identificado' ? ` (${doc.lado})` : ''}`;
      const campos = doc.campos || {};
      for (const { extractKey, field, label } of MAPA_CAMPOS_DOC) {
        const valorExtraido = campos[extractKey];
        if (valorExtraido === null || valorExtraido === undefined || valorExtraido === '') continue;
        const conf = confiancaParaCampo(doc, extractKey);
        const atual = valorAtualCampo(field);
        if (atual === null) {
          // campo vazio -> preenche (não substitui nothing)
          // evita sobrescrever se já preenchido por doc anterior com confiança maior
          const prev = novosCamposAuto[field];
          const prevConfRank = prev ? ({ alta: 3, media: 2, baixa: 1, nao_identificado: 0 }[prev.confianca] || 0) : -1;
          const currConfRank = ({ alta: 3, media: 2, baixa: 1, nao_identificado: 0 }[conf] || 0);
          if (!prev || currConfRank > prevConfRank) {
            setValue(field, valorExtraido);
            novosCamposAuto[field] = { valor: valorExtraido, confianca: conf, origem, label };
          }
        } else {
          // campo já preenchido -> compara. Se diferente, registra divergência (sem alterar)
          const atualStr = String(atual).replace(/\D/g, '').toLowerCase();
          const extraStr = String(valorExtraido).replace(/\D/g, '').toLowerCase();
          // para datas, normaliza
          if (atualStr && extraStr && atualStr !== extraStr && !novasDivergencias[field]) {
            novasDivergencias[field] = {
              valorAtual: String(atual),
              valorNovo: String(valorExtraido),
              origem, label
            };
          }
        }
      }
    }

    setCamposAuto(prev => ({ ...prev, ...novosCamposAuto }));
    setDivergencias(prev => ({ ...prev, ...novasDivergencias }));
  };

  // Callback do ImportarDocumentosSecao: recebe documentos extraídos pela IA
  const handlePreencher = async (documentosExtraidos) => {
    if (!documentosExtraidos || documentosExtraidos.length === 0) return;

    // Merge dos dados extraídos de volta em documentosPendentes (por arquivo_url)
    setDocumentosPendentes(prev => prev.map(p => {
      const doc = documentosExtraidos.find(d => d.arquivo_url === p.arquivo_url);
      if (!doc) return p;
      return {
        ...p,
        tipo_documento: doc.tipo_documento || p.tipo_documento || 'outro',
        lado: doc.lado || p.lado || 'nao_identificado',
        campos_extraidos_json: JSON.stringify(doc.campos || {}),
        nivel_confianca: doc.confianca_geral || p.nivel_confianca || 'nao_identificado'
      };
    }));

    // Descobre CPF extraído (com maior confiança)
    let cpfExtraido = null;
    for (const doc of documentosExtraidos) {
      if (doc?.campos?.cpf) {
        const c = normCpf(doc.campos.cpf);
        if (c && c.length === 11) { cpfExtraido = c; break; }
      }
    }

    // Verifica se CPF já está cadastrado
    let clienteExistente = null;
    if (cpfExtraido && Array.isArray(clientes)) {
      clienteExistente = clientes.find(c => c.tipo_pessoa === 'Física' && normCpf(c.cpf) === cpfExtraido);
    }

    if (clienteExistente && !cliente) {
      // Novo fluxo, mas CPF já existe -> não duplicar; abrir modal de confirmação
      const preview = [];
      for (const doc of documentosExtraidos) {
        if (!doc || doc.erro) continue;
        const origem = `${TIPO_DOC_LABEL[doc.tipo_documento] || doc.tipo_documento}${doc.lado && doc.lado !== 'nao_identificado' ? ` (${doc.lado})` : ''}`;
        const campos = doc.campos || {};
        for (const { extractKey, field, label } of MAPA_CAMPOS_DOC) {
          const v = campos[extractKey];
          if (v === null || v === undefined || v === '') continue;
          const valAtual = clienteExistente[field];
          const estaVazio = valAtual === null || valAtual === undefined || String(valAtual).trim() === '';
          if (estaVazio) {
            preview.push({
              campo: field, label,
              valorNovo: String(v),
              confianca: confiancaParaCampo(doc, extractKey),
              origem
            });
          }
        }
      }
      // Dedupe preview por campo
      const seen = new Set();
      const previewDedup = preview.filter(p => {
        if (seen.has(p.campo)) return false; seen.add(p.campo); return true;
      });
      setModalAtualizacao({ clienteExistente, camposPreencher: previewDedup });
      setPreencherPendente(documentosExtraidos);
      return;
    }

    // Fluxo normal (novo cliente sem CPF conflitante, ou editando cliente existente)
    aplicarPreenchimentoEmVazios(documentosExtraidos);
  };

  // Modal: confirmar atualização -> carrega cliente existente no form (vira update)
  const confirmarAtualizacaoClienteExistente = () => {
    const ce = modalAtualizacao?.clienteExistente;
    setModalAtualizacao(null);
    if (ce && onClienteExistenteCarregado) onClienteExistenteCarregado(ce);
    // preencherPendente continua setado -> aplicado no useEffect quando `cliente` mudar
  };

  const revisarDadosClienteExistente = () => {
    // Mesma ação: carrega o cliente; o usuário poderá revisar antes de salvar
    confirmarAtualizacaoClienteExistente();
  };

  const cancelarAtualizacaoClienteExistente = () => {
    setModalAtualizacao(null);
    setPreencherPendente(null);
    setDocumentosPendentes([]);
    setCamposAuto({});
    setDivergencias({});
  };

  // classe Tailwind para destacar campo preenchido com baixa confiança
  const clsConfianca = (field) =>
    camposAuto[field]?.confianca === 'baixa' ? 'bg-amber-50 border-amber-400 focus-visible:ring-amber-400' : '';

  // Persistir documentos vinculados ao cliente (após salvar)
  const persistirDocumentosCliente = async (clienteSalvo) => {
    if (!clienteSalvo?.id) return;
    if (documentosPendentes.length === 0) return;
    const empresaId = clienteSalvo.empresa_id || currentUser?.empresa_id || null;
    const usuarioId = currentUser?.id || currentUser?.auth_id || null;
    const usuarioNome = currentUser?.nome_perfil || currentUser?.full_name || '';

    // Evita duplicar arquivos já vinculados
    let existentes = [];
    try {
      existentes = await base44.entities.ClienteDocumento.filter({ cliente_id: clienteSalvo.id }, null, 300);
    } catch {}
    const urlsExistentes = new Set(existentes.map(e => e.arquivo_url));

    const novos = [];
    for (const d of documentosPendentes) {
      if (urlsExistentes.has(d.arquivo_url)) continue;
      const camposPreenchidos = Object.entries(camposAuto)
        .filter(([, v]) => v?.origem && documentosPendentes.find(dd => dd.arquivo_url === d.arquivo_url))
        .map(([f, v]) => ({ campo_crm: f, valor: v.valor, confianca: v.confianca }))
        .slice(0, 50);
      novos.push({
        empresa_id: empresaId,
        cliente_id: clienteSalvo.id,
        arquivo_url: d.arquivo_url,
        arquivo_nome: d.arquivo_nome,
        arquivo_tamanho: d.arquivo_tamanho || null,
        arquivo_mime: d.arquivo_mime || null,
        tipo_documento: d.tipo_documento || 'outro',
        lado: d.lado || 'nao_identificado',
        campos_extraidos_json: d.campos_extraidos_json || null,
        campos_preenchidos_json: Object.keys(camposAuto).length > 0 ? JSON.stringify(camposPreenchidos) : null,
        nivel_confianca: d.nivel_confianca || 'nao_identificado',
        enviado_por_id: usuarioId,
        enviado_por_nome: usuarioNome,
        data_envio: new Date().toISOString()
      });
    }
    if (novos.length === 0) return;

    try {
      await base44.entities.ClienteDocumento.bulkCreate(novos);
      // Auditoria: campos preenchidos automaticamente
      if (Object.keys(camposAuto).length > 0) {
        const resumo = Object.entries(camposAuto).map(([f, v]) => `${v.label || f}=${v.valor} (${v.confianca}, fonte: ${v.origem})`).join('; ');
        try {
          await base44.entities.LogAuditoria.create({
            usuario_id: usuarioId,
            usuario_nome: usuarioNome,
            acao: `Cadastro preenchido automaticamente via OCR. Documentos: ${novos.map(n => n.arquivo_nome).join(', ')}. Campos: ${resumo}.`,
            entidade: 'Cliente',
            entidade_id: clienteSalvo.id,
            dados_novos: JSON.stringify({ documentos: novos.map(n => n.arquivo_nome), campos: camposAuto }),
            tipo: cliente ? 'edicao' : 'criacao'
          });
        } catch {}
      }
    } catch (e) {
      console.error('Erro ao persistir documentos do cliente:', e);
      toast.error('Cliente salvo, mas houve erro ao vincular documentos.');
    }
  };

  // Converter valores de moeda para número
  const parseCurrencyToNumber = (value) => {
    if (!value || value === '') return null;
    if (typeof value === 'number') return value;
    // Remove tudo exceto dígitos e vírgula, depois substitui vírgula por ponto
    const numericString = String(value)
      .replace(/[^\d,]/g, '')  // Remove tudo exceto números e vírgula
      .replace(/\./g, '')       // Remove pontos de milhar
      .replace(',', '.');       // Substitui vírgula decimal por ponto
    const number = parseFloat(numericString);
    return isNaN(number) ? null : number;
  };

  // Gerar código do cliente ao submeter
  const handleFormSubmit = async (data) => {
    console.log('🟢 Processando submit do formulário...', data);
    
    if (!data.cliente_code) {
      try {
        const clientes = await base44.entities.Cliente.list();
        const ultimoCodigo = clientes
          .map(c => c.cliente_code)
          .filter(code => code && code.startsWith('CLI'))
          .map(code => parseInt(code.replace('CLI', '')))
          .filter(num => !isNaN(num))
          .sort((a, b) => b - a)[0] || 0;
        
        data.cliente_code = `CLI${String(ultimoCodigo + 1).padStart(3, '0')}`;
        console.log('🟢 Código gerado:', data.cliente_code);
      } catch (error) {
        console.warn('⚠️ Erro ao gerar código, usando CLI001');
        data.cliente_code = `CLI001`;
      }
    }

    // Converter campos de moeda para número (remover se vazio ou nulo)
    data.valor_patrimonial = data.valor_patrimonial ? parseCurrencyToNumber(data.valor_patrimonial) : null;
    data.renda = data.renda ? parseCurrencyToNumber(data.renda) : null;
    data.pj_valor_patrimonial = data.pj_valor_patrimonial ? parseCurrencyToNumber(data.pj_valor_patrimonial) : null;
    data.pj_capital_social = data.pj_capital_social ? parseCurrencyToNumber(data.pj_capital_social) : null;
    data.pj_faturamento_medio = data.pj_faturamento_medio ? parseCurrencyToNumber(data.pj_faturamento_medio) : null;
    
    console.log('🟢 Dados processados, chamando onSubmit...');
    const clienteSalvo = await onSubmit(data);
    console.log('✅ onSubmit concluído');
    // Persiste documentos vinculados + auditoria (apenas se houver pendentes)
    if (clienteSalvo) {
      await persistirDocumentosCliente(clienteSalvo);
      // Limpa pendentes após persistir
      setDocumentosPendentes([]);
    }
    return clienteSalvo;
  };

  const formatCPF = (value) => {
    return value
      .replace(/\D/g, '')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d{1,2})/, '$1-$2')
      .replace(/(-\d{2})\d+?$/, '$1');
  };

  const formatCNPJ = (value) => {
    return value
      .replace(/\D/g, '')
      .replace(/(\d{2})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1/$2')
      .replace(/(\d{4})(\d)/, '$1-$2')
      .replace(/(-\d{2})\d+?$/, '$1');
  };

  const formatPhone = (value, countryCode = '+55') => {
    const numbers = value.replace(/\D/g, '');
    
    if (countryCode === '+55') {
      // Brasil: (XX) XXXXX-XXXX
      return numbers
        .replace(/(\d{2})(\d)/, '($1) $2')
        .replace(/(\d{5})(\d)/, '$1-$2')
        .replace(/(-\d{4})\d+?$/, '$1');
    } else {
      // Outros países: XXX XXX XXX (ou menos dígitos)
      return numbers
        .replace(/(\d{3})(\d)/, '$1 $2')
        .replace(/(\d{3}\s\d{3})(\d)/, '$1 $2')
        .replace(/(\d{3}\s\d{3}\s\d{3})\d+?$/, '$1');
    }
  };

  const countryCodeOptions = [
    { code: '+55', label: '+55 Brasil' },
    { code: '+1', label: '+1 EUA/Canadá' },
    { code: '+34', label: '+34 Espanha' },
    { code: '+33', label: '+33 França' },
    { code: '+44', label: '+44 Reino Unido' },
    { code: '+39', label: '+39 Itália' },
    { code: '+49', label: '+49 Alemanha' },
    { code: '+351', label: '+351 Portugal' },
  ];

  const formatCEP = (value) => {
    return value
      .replace(/\D/g, '')
      .replace(/(\d{5})(\d)/, '$1-$2')
      .replace(/(-\d{3})\d+?$/, '$1');
  };

  const buscarCep = async (cep, prefix) => {
    const cepLimpo = cep.replace(/\D/g, '');
    if (cepLimpo.length !== 8) return;
    try {
      const res = await fetch(`https://viacep.com.br/ws/${cepLimpo}/json/`);
      const data = await res.json();
      if (data.erro) return;
      if (prefix === 'res') {
        if (data.logradouro) setValue('res_endereco', data.logradouro);
        if (data.bairro) setValue('res_bairro', data.bairro);
        setValue('res_cidade', data.localidade);
        setValue('res_uf', data.uf);
      } else if (prefix === 'com') {
        if (data.logradouro) setValue('com_endereco', data.logradouro);
        if (data.bairro) setValue('com_bairro', data.bairro);
        setValue('com_cidade', data.localidade);
        setValue('com_uf', data.uf);
      } else if (prefix === 'pj') {
        if (data.logradouro) setValue('pj_endereco', data.logradouro);
        if (data.bairro) setValue('pj_bairro', data.bairro);
        setValue('pj_cidade', data.localidade);
        setValue('pj_uf', data.uf);
      }
    } catch {}
  };

  const formatCurrency = (value) => {
    if (!value) return '';
    const numericValue = value.replace(/\D/g, '');
    const number = parseFloat(numericValue) / 100;
    return number.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };

  const ufs = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'];

  const handleFileUpload = async (files, fieldName) => {
    if (!files || files.length === 0) return;
    
    setUploadingDoc(fieldName);
    
    try {
      const uploadedUrls = [];
      for (const file of files) {
        const { file_url } = await base44.integrations.Core.UploadFile({ file });
        uploadedUrls.push(file_url);
      }
      
      const currentUrls = watch(fieldName) || [];
      setValue(fieldName, [...currentUrls, ...uploadedUrls]);
      toast.success(`${files.length} arquivo(s) anexado(s)`);
    } catch (error) {
      toast.error('Erro ao fazer upload');
      console.error(error);
    } finally {
      setUploadingDoc(null);
    }
  };

  const removeFile = (fieldName, urlToRemove) => {
    const currentUrls = watch(fieldName) || [];
    setValue(fieldName, currentUrls.filter(url => url !== urlToRemove));
  };

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{cliente ? 'Editar Cliente' : 'Novo Cliente'}</DialogTitle>
          <DialogDescription>
            Complete o cadastro do cliente com todos os dados necessários
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            e.stopPropagation();
            handleSubmit(handleFormSubmit)(e);
          }}
          className="space-y-6"
        >
          {/* Tipo de Pessoa */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Tipo de Pessoa</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-4">
                <div>
                  <Label>Tipo de Pessoa *</Label>
                  <Select
                    value={watch('tipo_pessoa') || 'Física'}
                    onValueChange={(value) => setValue('tipo_pessoa', value)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Física">
                        <div className="flex items-center gap-2">
                          <User className="w-4 h-4" />
                          Pessoa Física
                        </div>
                      </SelectItem>
                      <SelectItem value="Jurídica">
                        <div className="flex items-center gap-2">
                          <Building2 className="w-4 h-4" />
                          Pessoa Jurídica
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Seção de importação por documentos (somente Pessoa Física) */}
          {tipoPessoa === 'Física' && (
            <>
              <ImportarDocumentosSecao
                onPreencher={handlePreencher}
                onDocumentosAdicionados={(lista) => setDocumentosPendentes(prev => {
                  const map = new Map(prev.map(p => [p.arquivo_url, p]));
                  for (const p of lista) map.set(p.arquivo_url, { ...map.get(p.arquivo_url), ...p });
                  return Array.from(map.values());
                })}
              />

              {/* Resumo: campos preenchidos automaticamente */}
              {Object.keys(camposAuto).length > 0 && (
                <Card className="border-slate-300">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Info className="w-4 h-4 text-slate-600" />
                      Campos preenchidos automaticamente
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-1.5">
                    <p className="text-xs text-slate-500">
                      Os dados abaixo foram extraídos dos documentos. Confira antes de salvar. Campos em <span className="bg-amber-100 px-1 rounded">amarelo</span> exigem conferência manual.
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {Object.entries(camposAuto).map(([f, v]) => (
                        <span key={f} className={`text-xs px-2 py-1 rounded-md border ${v.confianca === 'baixa' ? 'bg-amber-100 border-amber-400 text-amber-900' : v.confianca === 'media' ? 'bg-yellow-50 border-yellow-300 text-yellow-800' : 'bg-emerald-50 border-emerald-300 text-emerald-800'}`} title={`Origem: ${v.origem}`}>
                          {v.label}: {v.valor} · {v.confianca} · {v.origem}
                        </span>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Consolidado de divergências */}
              {Object.keys(divergencias).length > 0 && (
                <Card className="border-amber-300">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2 text-amber-900">
                      <AlertTriangle className="w-4 h-4 text-amber-500" />
                      Divergências encontradas para conferência
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-xs text-amber-800 mb-2">
                      A informação encontrada no documento é diferente da informação cadastrada. Nenhuma alteração foi realizada.
                    </p>
                    <div className="space-y-1.5">
                      {Object.entries(divergencias).map(([f, d]) => (
                        <div key={f} className="border-l-2 border-amber-400 pl-2 py-1 text-xs">
                          <p className="font-medium text-amber-900">{d.label}</p>
                          <p>Atual: <span className="font-mono">{d.valorAtual || '—'}</span></p>
                          <p>Documento: <span className="font-mono">{d.valorNovo || '—'}</span></p>
                          <p className="text-amber-700">Origem: {d.origem}</p>
                        </div>
                      ))}
                    </div>
                    <p className="mt-2 text-[11px] text-amber-700">Caso seja necessário alterar, faça manualmente.</p>
                  </CardContent>
                </Card>
              )}
            </>
          )}

          {/* PESSOA FÍSICA */}
          {tipoPessoa === 'Física' && (
            <>
              {/* Dados Pessoais */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg flex items-center justify-between">
                      <span>Dados Pessoais</span>
                      <div className="bg-amber-50 border-2 border-amber-400 rounded-lg px-4 py-2 shadow-md">
                        <Label className="text-xs font-medium text-amber-900 mb-1 block">🔐 Senha GOV</Label>
                        <Input
                          {...register('senha_gov')}
                          type="text"
                          placeholder="Digite a senha GOV"
                          className="h-9 w-48 bg-white border-amber-300 focus:border-amber-500"
                        />
                      </div>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-3">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="col-span-2">
                        <Label htmlFor="nome_completo">Nome Completo *</Label>
                        <Input
                          id="nome_completo"
                          {...register('nome_completo', { required: tipoPessoa === 'Física' && 'Nome é obrigatório' })}
                          placeholder="Nome completo do cliente"
                          className={clsConfianca('nome_completo')}
                        />
                        {errors.nome_completo && <p className="text-sm text-red-500 mt-1">{errors.nome_completo.message}</p>}
                      </div>
                      
                      <div>
                        <Label htmlFor="cpf">CPF *</Label>
                        <Input
                          id="cpf"
                          {...register('cpf', { required: tipoPessoa === 'Física' && 'CPF é obrigatório' })}
                          placeholder="000.000.000-00"
                          onChange={(e) => setValue('cpf', formatCPF(e.target.value))}
                          className={clsConfianca('cpf')}
                        />
                        {errors.cpf && <p className="text-sm text-red-500 mt-1">{errors.cpf.message}</p>}
                      </div>

                      <div>
                        <Label htmlFor="data_nascimento">Data de Nascimento</Label>
                        <Input
                          id="data_nascimento"
                          type="date"
                          {...register('data_nascimento')}
                          className={clsConfianca('data_nascimento')}
                        />
                      </div>

                      <div>
                        <Label htmlFor="rg">RG</Label>
                        <Input id="rg" {...register('rg')} className={clsConfianca('rg')} />
                      </div>

                      <div>
                        <Label htmlFor="rg_data_emissao">Data Emissão RG</Label>
                        <Input type="date" id="rg_data_emissao" {...register('rg_data_emissao')} className={clsConfianca('rg_data_emissao')} />
                      </div>

                      <div>
                        <Label htmlFor="rg_orgao_emissor">Órgão Emissor</Label>
                        <Input id="rg_orgao_emissor" {...register('rg_orgao_emissor')} placeholder="Ex: SSP" className={clsConfianca('rg_orgao_emissor')} />
                      </div>

                      <div>
                        <Label htmlFor="estado_civil">Estado Civil</Label>
                        <Input id="estado_civil" {...register('estado_civil')} />
                      </div>

                      <div>
                        <Label htmlFor="profissao">Profissão</Label>
                        <Input id="profissao" {...register('profissao')} />
                      </div>

                      <div>
                        <Label>Sexo *</Label>
                        <RadioGroup
                          value={watch('sexo')}
                          onValueChange={(value) => setValue('sexo', value)}
                          className="flex gap-4 mt-2"
                        >
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem value="Masculino" id="sexo-masculino" />
                            <Label htmlFor="sexo-masculino" className="cursor-pointer font-normal">Masculino</Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem value="Feminino" id="sexo-feminino" />
                            <Label htmlFor="sexo-feminino" className="cursor-pointer font-normal">Feminino</Label>
                          </div>
                        </RadioGroup>
                      </div>

                      <div>
                        <Label>Politicamente exposto *</Label>
                        <RadioGroup
                          value={watch('politicamente_exposto')}
                          onValueChange={(value) => setValue('politicamente_exposto', value)}
                          className="flex gap-4 mt-2"
                        >
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem value="Sim" id="pe-sim" />
                            <Label htmlFor="pe-sim" className="cursor-pointer font-normal">Sim</Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem value="Não" id="pe-nao" />
                            <Label htmlFor="pe-nao" className="cursor-pointer font-normal">Não</Label>
                          </div>
                        </RadioGroup>
                      </div>

                      <div>
                        <Label htmlFor="valor_patrimonial">Valor Patrimonial</Label>
                        <Input
                          id="valor_patrimonial"
                          {...register('valor_patrimonial')}
                          placeholder="R$ 0,00"
                          onChange={(e) => setValue('valor_patrimonial', formatCurrency(e.target.value))}
                        />
                      </div>

                      <div>
                        <Label htmlFor="celular">Celular</Label>
                        <div className="flex gap-2">
                          <Select
                            value={watch('celular_pais') || '+55'}
                            onValueChange={(value) => setValue('celular_pais', value)}
                          >
                            <SelectTrigger className="w-32">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {countryCodeOptions.map(opt => (
                                <SelectItem key={opt.code} value={opt.code}>{opt.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Input
                            id="celular"
                            {...register('celular')}
                            placeholder={watch('celular_pais') === '+55' ? "(00) 00000-0000" : "XXX XXX XXX"}
                            onChange={(e) => setValue('celular', formatPhone(e.target.value, watch('celular_pais') || '+55'))}
                            className="flex-1"
                          />
                        </div>
                      </div>

                      <div>
                        <Label htmlFor="telefone_fixo">Telefone Fixo</Label>
                        <div className="flex gap-2">
                          <Select
                            value={watch('telefone_fixo_pais') || '+55'}
                            onValueChange={(value) => setValue('telefone_fixo_pais', value)}
                          >
                            <SelectTrigger className="w-32">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {countryCodeOptions.map(opt => (
                                <SelectItem key={opt.code} value={opt.code}>{opt.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Input
                            id="telefone_fixo"
                            {...register('telefone_fixo')}
                            placeholder={watch('telefone_fixo_pais') === '+55' ? "(00) 0000-0000" : "XXX XXX XXX"}
                            onChange={(e) => setValue('telefone_fixo', formatPhone(e.target.value, watch('telefone_fixo_pais') || '+55'))}
                            className="flex-1"
                          />
                        </div>
                      </div>
                      
                      <div className="col-span-2">
                        <Label htmlFor="email">Email</Label>
                        <Input
                          id="email"
                          type="email"
                          {...register('email')}
                          placeholder="email@exemplo.com"
                        />
                      </div>

                      <div>
                        <Label>Ocupou cargo público nos últimos anos? *</Label>
                        <RadioGroup
                          value={watch('ocupou_cargo_publico_ultimos_anos')}
                          onValueChange={(value) => setValue('ocupou_cargo_publico_ultimos_anos', value)}
                          className="flex gap-4 mt-2"
                        >
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem value="Sim" id="cargo-sim" />
                            <Label htmlFor="cargo-sim" className="cursor-pointer font-normal">Sim</Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem value="Não" id="cargo-nao" />
                            <Label htmlFor="cargo-nao" className="cursor-pointer font-normal">Não</Label>
                          </div>
                        </RadioGroup>
                      </div>

                      <div>
                        <Label>Parente ocupou cargo público (últimos 5 anos)? *</Label>
                        <RadioGroup
                          value={watch('parente_cargo_publico_ultimos_5_anos')}
                          onValueChange={(value) => setValue('parente_cargo_publico_ultimos_5_anos', value)}
                          className="flex gap-4 mt-2"
                        >
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem value="Sim" id="parente-sim" />
                            <Label htmlFor="parente-sim" className="cursor-pointer font-normal">Sim</Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem value="Não" id="parente-nao" />
                            <Label htmlFor="parente-nao" className="cursor-pointer font-normal">Não</Label>
                          </div>
                        </RadioGroup>
                      </div>

                      <div>
                        <Label>Status</Label>
                        <Select
                          value={watch('status')}
                          onValueChange={(value) => setValue('status', value)}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="ativo">Ativo</SelectItem>
                            <SelectItem value="inativo">Inativo</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </CardContent>
                </Card>

              {/* Endereço Residencial */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Endereço Residencial</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                       <Label>CEP</Label>
                       <Input
                         {...register('res_cep')}
                         placeholder="00000-000"
                         onChange={(e) => {
                           const v = formatCEP(e.target.value);
                           setValue('res_cep', v);
                           buscarCep(v, 'res');
                         }}
                         className={clsConfianca('res_cep')}
                       />
                      </div>

                      <div>
                        <Label>Tipo de Logradouro</Label>
                        <Select
                          value={watch('res_tipo_logradouro') || ''}
                          onValueChange={(value) => setValue('res_tipo_logradouro', value)}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione" />
                          </SelectTrigger>
                          <SelectContent position="popper" align="start" sideOffset={4}>
                            <SelectItem value="RUA">Rua</SelectItem>
                            <SelectItem value="AVENIDA">Avenida</SelectItem>
                            <SelectItem value="ALAMEDA">Alameda</SelectItem>
                            <SelectItem value="TRAVESSA">Travessa</SelectItem>
                            <SelectItem value="PRAÇA">Praça</SelectItem>
                            <SelectItem value="RODOVIA">Rodovia</SelectItem>
                            <SelectItem value="ESTRADA">Estrada</SelectItem>
                            <SelectItem value="VIA">Via</SelectItem>
                            <SelectItem value="BLOCO">Bloco</SelectItem>
                            <SelectItem value="CONJUNTO">Conjunto</SelectItem>
                            <SelectItem value="QUADRA">Quadra</SelectItem>
                            <SelectItem value="SITIO">Sítio</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="col-span-2">
                         <Label>Endereço</Label>
                         <Input {...register('res_endereco')} placeholder="Nome da rua/avenida" className={clsConfianca('res_endereco')} />
                       </div>

                       <div>
                         <Label>Número</Label>
                         <Input {...register('res_numero')} className={clsConfianca('res_numero')} />
                       </div>

                       <div>
                         <Label>Complemento</Label>
                         <Input {...register('res_complemento')} className={clsConfianca('res_complemento')} />
                       </div>

                       <div>
                         <Label>Bairro</Label>
                         <Input {...register('res_bairro')} className={clsConfianca('res_bairro')} />
                       </div>

                       <div>
                         <Label>Cidade</Label>
                         <Input {...register('res_cidade')} className={clsConfianca('res_cidade')} />
                       </div>

                      <div>
                        <Label>UF</Label>
                        <Select
                          value={watch('res_uf')}
                          onValueChange={(value) => setValue('res_uf', value)}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione" />
                          </SelectTrigger>
                          <SelectContent>
                            {ufs.map(uf => (
                              <SelectItem key={uf} value={uf}>{uf}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </CardContent>
                </Card>

              {/* Endereço Comercial */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Endereço Comercial</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                       <Label>CEP</Label>
                       <Input
                         {...register('com_cep')}
                         placeholder="00000-000"
                         onChange={(e) => {
                           const v = formatCEP(e.target.value);
                           setValue('com_cep', v);
                           buscarCep(v, 'com');
                         }}
                       />
                      </div>

                      <div>
                        <Label>Tipo de Logradouro</Label>
                        <Select
                          value={watch('com_tipo_logradouro') || ''}
                          onValueChange={(value) => setValue('com_tipo_logradouro', value)}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione" />
                          </SelectTrigger>
                          <SelectContent position="popper" align="start" sideOffset={4}>
                            <SelectItem value="RUA">Rua</SelectItem>
                            <SelectItem value="AVENIDA">Avenida</SelectItem>
                            <SelectItem value="ALAMEDA">Alameda</SelectItem>
                            <SelectItem value="TRAVESSA">Travessa</SelectItem>
                            <SelectItem value="PRAÇA">Praça</SelectItem>
                            <SelectItem value="RODOVIA">Rodovia</SelectItem>
                            <SelectItem value="ESTRADA">Estrada</SelectItem>
                            <SelectItem value="VIA">Via</SelectItem>
                            <SelectItem value="BLOCO">Bloco</SelectItem>
                            <SelectItem value="CONJUNTO">Conjunto</SelectItem>
                            <SelectItem value="QUADRA">Quadra</SelectItem>
                            <SelectItem value="SITIO">Sítio</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="col-span-2">
                        <Label>Endereço</Label>
                        <Input {...register('com_endereco')} placeholder="Nome da rua/avenida" />
                      </div>

                      <div>
                        <Label>Número</Label>
                        <Input {...register('com_numero')} />
                      </div>

                      <div>
                        <Label>Complemento</Label>
                        <Input {...register('com_complemento')} />
                      </div>

                      <div>
                        <Label>Bairro</Label>
                        <Input {...register('com_bairro')} />
                      </div>

                      <div>
                        <Label>Cidade</Label>
                        <Input {...register('com_cidade')} />
                      </div>

                      <div>
                        <Label>UF</Label>
                        <Select
                          value={watch('com_uf')}
                          onValueChange={(value) => setValue('com_uf', value)}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione" />
                          </SelectTrigger>
                          <SelectContent>
                            {ufs.map(uf => (
                              <SelectItem key={uf} value={uf}>{uf}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </CardContent>
                </Card>

              {/* Dados Complementares */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Dados Complementares</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>Nome do Pai</Label>
                        <Input {...register('nome_pai')} className={clsConfianca('nome_pai')} />
                      </div>

                      <div>
                        <Label>Nome da Mãe</Label>
                        <Input {...register('nome_mae')} className={clsConfianca('nome_mae')} />
                      </div>

                      <div>
                        <Label>Nacionalidade</Label>
                        <Input {...register('nacionalidade')} className={clsConfianca('nacionalidade')} />
                      </div>

                      <div>
                        <Label>UF de Nascimento</Label>
                        <Select
                          value={watch('uf_nascimento')}
                          onValueChange={(value) => setValue('uf_nascimento', value)}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione" />
                          </SelectTrigger>
                          <SelectContent>
                            {ufs.map(uf => (
                              <SelectItem key={uf} value={uf}>{uf}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="col-span-2">
                        <Label>Local de Nascimento</Label>
                        <Input {...register('local_nascimento')} placeholder="Cidade de nascimento" className={clsConfianca('local_nascimento')} />
                      </div>

                      <div>
                        <Label>Renda</Label>
                        <Input
                          {...register('renda')}
                          placeholder="R$ 0,00"
                          onChange={(e) => setValue('renda', formatCurrency(e.target.value))}
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>

              {/* Checklist de Documentos */}
              <Card>
                <CardHeader><CardTitle className="text-lg">Checklist de Documentos</CardTitle></CardHeader>
                <CardContent>
                  <div className="space-y-6">
                    {[
                      { id: 'doc_documento_testemunhas_urls', label: 'Documento de Testemunhas', check: 'doc_documento_testemunhas' },
                      { id: 'doc_identidade_urls', label: 'Identidade (RG)', check: 'doc_identidade' },
                      { id: 'doc_comprovante_endereco_urls', label: 'Comprovante de Endereço', check: 'doc_comprovante_endereco' },
                      { id: 'doc_comprovante_renda_urls', label: 'Comprovante de Renda', check: 'doc_comprovante_renda' },
                      { id: 'doc_proposta_assinada_urls', label: 'Proposta Assinada', check: 'doc_proposta_assinada' },
                    ].map(({ id, label, check }) => (
                      <DocUploadItem key={id} id={check} label={label}
                        checked={watch(check)} onCheck={(v) => setValue(check, v)}
                        urls={watch(id) || []}
                        onUpload={(files) => handleFileUpload(files, id)}
                        onRemove={(url) => removeFile(id, url)}
                        uploading={uploadingDoc === id}
                      />
                    ))}
                    <div className="pt-4">
                      <Label>Observações</Label>
                      <Textarea {...register('doc_observacoes')} placeholder="Observações sobre os documentos..." rows={4} />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Dados Bancários */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Dados Bancários</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="space-y-4">
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="banco_nao_deseja_informar"
                          checked={watch('banco_nao_deseja_informar') || false}
                          onCheckedChange={(checked) => setValue('banco_nao_deseja_informar', checked)}
                        />
                        <Label htmlFor="banco_nao_deseja_informar" className="cursor-pointer">
                          Não deseja informar dados bancários
                        </Label>
                      </div>

                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="banco_nao_possui_conta"
                          checked={watch('banco_nao_possui_conta') || false}
                          onCheckedChange={(checked) => setValue('banco_nao_possui_conta', checked)}
                        />
                        <Label htmlFor="banco_nao_possui_conta" className="cursor-pointer">
                          Não possui conta bancária
                        </Label>
                      </div>

                      {!bancoNaoDeseja && !bancoNaoPossui && (
                        <div className="grid grid-cols-2 gap-4 pt-4">
                          <div>
                            <Label>Banco</Label>
                            <Input {...register('banco_nome')} placeholder="Nome do banco" />
                          </div>

                          <div>
                            <Label>Código do Banco</Label>
                            <Input {...register('banco_codigo')} placeholder="Ex: 001" />
                          </div>

                          <div>
                            <Label>Agência</Label>
                            <Input {...register('agencia')} />
                          </div>

                          <div>
                            <Label>Conta</Label>
                            <Input {...register('conta')} />
                          </div>

                          <div>
                            <Label>Tipo de Conta</Label>
                            <Select
                              value={watch('tipo_conta')}
                              onValueChange={(value) => setValue('tipo_conta', value)}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Selecione" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="Corrente">Corrente</SelectItem>
                                <SelectItem value="Poupança">Poupança</SelectItem>
                                <SelectItem value="Salário">Salário</SelectItem>
                                <SelectItem value="Pix">Pix</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>

                          <div>
                            <Label>Chave PIX</Label>
                            <Input {...register('pix_chave')} placeholder="CPF, email, telefone ou chave aleatória" />
                          </div>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
            </>
          )}

          {/* PESSOA JURÍDICA */}
          {tipoPessoa === 'Jurídica' && (
            <>
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Dados da Empresa</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="col-span-2">
                        <Label>Razão Social *</Label>
                        <Input
                          {...register('pj_razao_social', { required: tipoPessoa === 'Jurídica' && 'Razão social é obrigatória' })}
                          placeholder="Razão social da empresa"
                        />
                        {errors.pj_razao_social && <p className="text-sm text-red-500 mt-1">{errors.pj_razao_social.message}</p>}
                      </div>

                      <div className="col-span-2">
                        <Label>Nome Fantasia</Label>
                        <Input {...register('pj_nome_fantasia')} placeholder="Nome fantasia" />
                      </div>

                      <div>
                        <Label>CNPJ *</Label>
                        <Input
                          {...register('pj_cnpj', { required: tipoPessoa === 'Jurídica' && 'CNPJ é obrigatório' })}
                          placeholder="00.000.000/0000-00"
                          onChange={(e) => setValue('pj_cnpj', formatCNPJ(e.target.value))}
                        />
                        {errors.pj_cnpj && <p className="text-sm text-red-500 mt-1">{errors.pj_cnpj.message}</p>}
                      </div>

                      <div>
                        <Label>Inscrição Estadual</Label>
                        <Input {...register('pj_inscricao_estadual')} />
                      </div>

                      <div>
                        <Label>Valor Patrimonial</Label>
                        <Input
                          {...register('pj_valor_patrimonial')}
                          placeholder="R$ 0,00"
                          onChange={(e) => setValue('pj_valor_patrimonial', formatCurrency(e.target.value))}
                        />
                      </div>

                      <div>
                        <Label>Capital Social</Label>
                        <Input
                          {...register('pj_capital_social')}
                          placeholder="R$ 0,00"
                          onChange={(e) => setValue('pj_capital_social', formatCurrency(e.target.value))}
                        />
                      </div>

                      <div>
                        <Label>Faturamento Médio</Label>
                        <Input
                          {...register('pj_faturamento_medio')}
                          placeholder="R$ 0,00"
                          onChange={(e) => setValue('pj_faturamento_medio', formatCurrency(e.target.value))}
                        />
                      </div>

                      <div>
                        <Label>Data de Fundação</Label>
                        <Input type="date" {...register('pj_data_fundacao')} />
                      </div>

                      <div className="col-span-2">
                        <Label>Ramo de Atividade</Label>
                        <Input {...register('pj_ramo_atividade')} />
                      </div>

                      <div>
                        <Label>Telefone Fixo</Label>
                        <div className="flex gap-2">
                          <Select
                            value={watch('pj_telefone_fixo_pais') || '+55'}
                            onValueChange={(value) => setValue('pj_telefone_fixo_pais', value)}
                          >
                            <SelectTrigger className="w-32">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {countryCodeOptions.map(opt => (
                                <SelectItem key={opt.code} value={opt.code}>{opt.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Input
                            {...register('pj_telefone_fixo')}
                            placeholder={watch('pj_telefone_fixo_pais') === '+55' ? "(00) 0000-0000" : "XXX XXX XXX"}
                            onChange={(e) => setValue('pj_telefone_fixo', formatPhone(e.target.value, watch('pj_telefone_fixo_pais') || '+55'))}
                            className="flex-1"
                          />
                        </div>
                      </div>

                      <div>
                        <Label>Celular</Label>
                        <div className="flex gap-2">
                          <Select
                            value={watch('pj_celular_pais') || '+55'}
                            onValueChange={(value) => setValue('pj_celular_pais', value)}
                          >
                            <SelectTrigger className="w-32">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {countryCodeOptions.map(opt => (
                                <SelectItem key={opt.code} value={opt.code}>{opt.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Input
                            {...register('pj_celular')}
                            placeholder={watch('pj_celular_pais') === '+55' ? "(00) 00000-0000" : "XXX XXX XXX"}
                            onChange={(e) => setValue('pj_celular', formatPhone(e.target.value, watch('pj_celular_pais') || '+55'))}
                            className="flex-1"
                          />
                        </div>
                      </div>

                      <div className="col-span-2">
                        <Label>Email</Label>
                        <Input type="email" {...register('pj_email')} />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Sócio Majoritário</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="col-span-2">
                        <Label>Nome do Sócio *</Label>
                        <Input
                          {...register('pj_socio_majoritario_nome', { required: tipoPessoa === 'Jurídica' && 'Nome do sócio é obrigatório' })}
                          placeholder="Nome completo"
                        />
                        {errors.pj_socio_majoritario_nome && <p className="text-sm text-red-500 mt-1">{errors.pj_socio_majoritario_nome.message}</p>}
                      </div>

                      <div>
                        <Label>CPF do Sócio *</Label>
                        <Input
                          {...register('pj_socio_majoritario_cpf', { required: tipoPessoa === 'Jurídica' && 'CPF do sócio é obrigatório' })}
                          placeholder="000.000.000-00"
                          onChange={(e) => setValue('pj_socio_majoritario_cpf', formatCPF(e.target.value))}
                        />
                        {errors.pj_socio_majoritario_cpf && <p className="text-sm text-red-500 mt-1">{errors.pj_socio_majoritario_cpf.message}</p>}
                      </div>

                      <div>
                        <Label>RG</Label>
                        <Input {...register('pj_socio_majoritario_rg')} />
                      </div>

                      <div>
                        <Label>Data de Nascimento</Label>
                        <Input type="date" {...register('pj_socio_majoritario_data_nascimento')} />
                      </div>

                      <div>
                        <Label>Órgão Emissor</Label>
                        <Input {...register('pj_socio_majoritario_orgao_emissor')} placeholder="Ex: SSP" />
                      </div>

                      <div>
                        <Label>Estado Civil</Label>
                        <Input {...register('pj_socio_majoritario_estado_civil')} />
                      </div>

                      <div>
                        <Label>Sexo</Label>
                        <Select
                          value={watch('pj_socio_majoritario_sexo')}
                          onValueChange={(value) => setValue('pj_socio_majoritario_sexo', value)}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Masculino">Masculino</SelectItem>
                            <SelectItem value="Feminino">Feminino</SelectItem>
                            <SelectItem value="Outro">Outro</SelectItem>
                            <SelectItem value="Prefiro não informar">Prefiro não informar</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div>
                        <Label>Politicamente Exposto? *</Label>
                        <Select
                          value={watch('pj_socio_majoritario_politicamente_exposto')}
                          onValueChange={(value) => setValue('pj_socio_majoritario_politicamente_exposto', value)}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Sim">Sim</SelectItem>
                            <SelectItem value="Não">Não</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div>
                        <Label>% Participação</Label>
                        <Input type="number" step="0.01" {...register('pj_percent_participacao_socio')} placeholder="Ex: 50" />
                      </div>
                    </div>
                  </CardContent>
                </Card>

              {/* Endereço da Empresa */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Endereço da Empresa</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                       <Label>CEP</Label>
                       <Input
                         {...register('pj_cep')}
                         placeholder="00000-000"
                         onChange={(e) => {
                           const v = formatCEP(e.target.value);
                           setValue('pj_cep', v);
                           buscarCep(v, 'pj');
                         }}
                       />
                      </div>

                      <div>
                        <Label>Tipo de Logradouro</Label>
                        <Select
                          value={watch('pj_tipo_logradouro') || ''}
                          onValueChange={(value) => setValue('pj_tipo_logradouro', value)}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione" />
                          </SelectTrigger>
                          <SelectContent position="popper" align="start" sideOffset={4}>
                            <SelectItem value="RUA">Rua</SelectItem>
                            <SelectItem value="AVENIDA">Avenida</SelectItem>
                            <SelectItem value="ALAMEDA">Alameda</SelectItem>
                            <SelectItem value="TRAVESSA">Travessa</SelectItem>
                            <SelectItem value="PRAÇA">Praça</SelectItem>
                            <SelectItem value="RODOVIA">Rodovia</SelectItem>
                            <SelectItem value="ESTRADA">Estrada</SelectItem>
                            <SelectItem value="VIA">Via</SelectItem>
                            <SelectItem value="BLOCO">Bloco</SelectItem>
                            <SelectItem value="CONJUNTO">Conjunto</SelectItem>
                            <SelectItem value="QUADRA">Quadra</SelectItem>
                            <SelectItem value="SITIO">Sítio</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="col-span-2">
                        <Label>Endereço</Label>
                        <Input {...register('pj_endereco')} placeholder="Nome da rua/avenida" />
                      </div>

                      <div>
                        <Label>Número</Label>
                        <Input {...register('pj_numero')} />
                      </div>

                      <div>
                        <Label>Complemento</Label>
                        <Input {...register('pj_complemento')} />
                      </div>

                      <div>
                        <Label>Bairro</Label>
                        <Input {...register('pj_bairro')} />
                      </div>

                      <div>
                        <Label>Cidade</Label>
                        <Input {...register('pj_cidade')} />
                      </div>

                      <div>
                        <Label>UF</Label>
                        <Select
                          value={watch('pj_uf')}
                          onValueChange={(value) => setValue('pj_uf', value)}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione" />
                          </SelectTrigger>
                          <SelectContent>
                            {ufs.map(uf => (
                              <SelectItem key={uf} value={uf}>{uf}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </CardContent>
                </Card>

              {/* Dados Complementares PJ */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Dados Complementares</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="col-span-2">
                        <Label>Atividade Principal</Label>
                        <Input {...register('pj_atividade_principal')} />
                      </div>

                      <div>
                        <Label>Forma de Constituição</Label>
                        <Input {...register('pj_forma_constituicao')} />
                      </div>

                      <div>
                        <Label>Data de Constituição</Label>
                        <Input type="date" {...register('pj_data_constituicao')} />
                      </div>

                      <div>
                        <Label>Nacionalidade do Sócio</Label>
                        <Input {...register('pj_nacionalidade')} />
                      </div>

                      <div>
                        <Label>UF de Nascimento</Label>
                        <Select
                          value={watch('pj_uf_nascimento')}
                          onValueChange={(value) => setValue('pj_uf_nascimento', value)}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione" />
                          </SelectTrigger>
                          <SelectContent>
                            {ufs.map(uf => (
                              <SelectItem key={uf} value={uf}>{uf}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="col-span-2">
                        <Label>Local de Nascimento</Label>
                        <Input {...register('pj_local_nascimento')} />
                      </div>

                      <div>
                        <Label>Nome do Pai</Label>
                        <Input {...register('pj_nome_pai')} />
                      </div>

                      <div>
                        <Label>Nome da Mãe</Label>
                        <Input {...register('pj_nome_mae')} />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Documento Adicional</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>CPF do Documento</Label>
                        <Input
                          {...register('pj_doc_cpf')}
                          placeholder="000.000.000-00"
                          onChange={(e) => setValue('pj_doc_cpf', formatCPF(e.target.value))}
                        />
                      </div>

                      <div>
                        <Label>Tipo de Documento</Label>
                        <Input {...register('pj_doc_tipo')} />
                      </div>

                      <div>
                        <Label>Número do Documento</Label>
                        <Input {...register('pj_doc_numero')} />
                      </div>

                      <div>
                        <Label>Data de Emissão</Label>
                        <Input type="date" {...register('pj_doc_data_emissao')} />
                      </div>

                      <div className="col-span-2">
                        <Label>Órgão Expedidor</Label>
                        <Input {...register('pj_doc_orgao_expedidor')} />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Compliance - COAF/PEP</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 gap-4">
                      <div>
                        <Label>Sócios exerceram cargo público nos últimos 5 anos? *</Label>
                        <Select
                          value={watch('pj_socios_cargo_publico_ultimos_5_anos')}
                          onValueChange={(value) => setValue('pj_socios_cargo_publico_ultimos_5_anos', value)}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Sim">Sim</SelectItem>
                            <SelectItem value="Não">Não</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div>
                        <Label>Parentes de sócios exerceram cargo público nos últimos 5 anos? *</Label>
                        <Select
                          value={watch('pj_socios_parentes_cargo_publico_ultimos_5_anos')}
                          onValueChange={(value) => setValue('pj_socios_parentes_cargo_publico_ultimos_5_anos', value)}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Sim">Sim</SelectItem>
                            <SelectItem value="Não">Não</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </CardContent>
                </Card>

              {/* Checklist de Documentos PJ */}
              <Card>
                <CardHeader><CardTitle className="text-lg">Checklist de Documentos</CardTitle></CardHeader>
                <CardContent>
                  <div className="space-y-6">
                    {[
                      { id: 'pj_doc_contrato_ou_estatuto_social_urls', label: 'Contrato ou Estatuto Social', check: 'pj_doc_contrato_ou_estatuto_social' },
                      { id: 'pj_doc_cartao_cnpj_urls', label: 'Cartão CNPJ', check: 'pj_doc_cartao_cnpj' },
                      { id: 'pj_doc_documento_socios_ou_representante_urls', label: 'Documentos dos Sócios/Representante', check: 'pj_doc_documento_socios_ou_representante' },
                      { id: 'pj_doc_relacao_faturamento_urls', label: 'Relação de Faturamento', check: 'pj_doc_relacao_faturamento' },
                      { id: 'pj_doc_proposta_assinada_urls', label: 'Proposta Assinada', check: 'pj_doc_proposta_assinada' },
                    ].map(({ id, label, check }) => (
                      <DocUploadItem key={id} id={check} label={label}
                        checked={watch(check)} onCheck={(v) => setValue(check, v)}
                        urls={watch(id) || []}
                        onUpload={(files) => handleFileUpload(files, id)}
                        onRemove={(url) => removeFile(id, url)}
                        uploading={uploadingDoc === id}
                      />
                    ))}
                    <div className="pt-4">
                      <Label>Observações</Label>
                      <Textarea {...register('pj_doc_observacoes')} placeholder="Observações sobre os documentos..." rows={4} />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Dados Bancários PJ */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Dados Bancários</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="space-y-4">
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="pj_banco_nao_deseja_informar"
                          checked={watch('pj_banco_nao_deseja_informar') || false}
                          onCheckedChange={(checked) => setValue('pj_banco_nao_deseja_informar', checked)}
                        />
                        <Label htmlFor="pj_banco_nao_deseja_informar" className="cursor-pointer">
                          Não deseja informar dados bancários
                        </Label>
                      </div>

                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="pj_banco_nao_possui_conta"
                          checked={watch('pj_banco_nao_possui_conta') || false}
                          onCheckedChange={(checked) => setValue('pj_banco_nao_possui_conta', checked)}
                        />
                        <Label htmlFor="pj_banco_nao_possui_conta" className="cursor-pointer">
                          Não possui conta bancária
                        </Label>
                      </div>

                      {!pjBancoNaoDeseja && !pjBancoNaoPossui && (
                        <div className="grid grid-cols-2 gap-4 pt-4">
                          <div>
                            <Label>Banco</Label>
                            <Input {...register('pj_banco')} placeholder="Nome do banco" />
                          </div>

                          <div>
                            <Label>Tipo de Conta</Label>
                            <Select
                              value={watch('pj_tipo_conta')}
                              onValueChange={(value) => setValue('pj_tipo_conta', value)}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Selecione" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="Corrente">Corrente</SelectItem>
                                <SelectItem value="Poupança">Poupança</SelectItem>
                                <SelectItem value="Salário">Salário</SelectItem>
                                <SelectItem value="Pix">Pix</SelectItem>
                                <SelectItem value="Outros">Outros</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>

                          <div>
                            <Label>Agência</Label>
                            <Input {...register('pj_agencia')} />
                          </div>

                          <div>
                            <Label>Dígito da Agência</Label>
                            <Input {...register('pj_agencia_digito')} maxLength={1} />
                          </div>

                          <div>
                            <Label>Conta</Label>
                            <Input {...register('pj_conta')} />
                          </div>

                          <div>
                            <Label>Dígito da Conta</Label>
                            <Input {...register('pj_conta_digito')} maxLength={2} />
                          </div>

                          <div className="col-span-2">
                            <Label>Variação</Label>
                            <Input {...register('pj_variacao')} />
                          </div>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
            </>
          )}
          
          {/* Seção Documentos do cliente (rodapé) */}
          {currentUser && (
            <DocumentosClienteSecao
              clienteId={cliente?.id || null}
              empresaId={cliente?.empresa_id || currentUser?.empresa_id || null}
              user={currentUser}
              documentosPendentes={documentosPendentes}
              onDocumentosChange={setDocumentosPendentes}
            />
          )}

          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button 
              type="button" 
              variant="outline" 
              onClick={(e) => {
                e.preventDefault();
                onOpenChange(false);
              }}
              disabled={isLoading}
            >
              Cancelar
            </Button>
            <Button 
              type="submit" 
              disabled={isLoading} 
              className="bg-[#23BE84] hover:bg-[#1da570]"
            >
              {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {cliente ? 'Salvar' : 'Cadastrar'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
    {modalAtualizacao && (
      <ConfirmarAtualizacaoModal
        open={!!modalAtualizacao}
        onOpenChange={(v) => { if (!v) setModalAtualizacao(null); }}
        clienteExistente={modalAtualizacao.clienteExistente}
        camposPreencher={modalAtualizacao.camposPreencher}
        onConfirmar={confirmarAtualizacaoClienteExistente}
        onRevisar={revisarDadosClienteExistente}
        onCancelar={cancelarAtualizacaoClienteExistente}
      />
    )}
    </>
  );
}