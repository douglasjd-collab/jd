import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { Loader2, Search, FileText, Image as ImageIcon, Video, CheckCircle2 } from 'lucide-react';

// Extrai variáveis {{n}} (e {{1}}, {{2}}...) presentes em uma string
function extrairVariaveis(texto = '') {
  const matches = [...(texto || '').matchAll(/\{\{(\d+)\}\}/g)];
  const unicas = [...new Set(matches.map((m) => m[1]))];
  return unicas.sort((a, b) => Number(a) - Number(b)).map((n) => `{{${n}}}`);
}

// Substitui {{n}} por valores preenchidos
function preencherVariaveis(texto = '', valores = {}) {
  return (texto || '').replace(/\{\{(\d+)\}\}/g, (m, n) => valores[n] ?? m);
}

export default function SelecionarTemplateMetaModal({
  open,
  onOpenChange,
  conversa,
  cliente,
  onSelect,
}) {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busca, setBusca] = useState('');
  const [selecionado, setSelecionado] = useState(null); // template objeto
  const [valoresVars, setValoresVars] = useState({}); // { '1': 'João', '2': '...' }
  const [enviando, setEnviando] = useState(false);

  // Carrega templates aprovados da empresa
  useEffect(() => {
    if (!open) return;
    carregarTemplates();
    setSelecionado(null);
    setValoresVars({});
    setBusca('');
  }, [open]);

  const carregarTemplates = async () => {
    setLoading(true);
    try {
      const lista = await base44.entities.WhatsappTemplate.filter(
        { status: 'aprovado' },
        '-created_date',
        200
      );
      // Filtra pela empresa atual do usuário
      let filtrados = lista;
      const empresaId = cliente?.empresa_id || conversa?.empresa_id;
      if (empresaId) filtrados = lista.filter((t) => t.empresa_id === empresaId);
      setTemplates(filtrados);
    } catch (e) {
      console.error('Erro ao carregar templates:', e);
      toast.error('Erro ao carregar templates aprovados');
    } finally {
      setLoading(false);
    }
  };

  const handleSelecionar = (t) => {
    setSelecionado(t);
    // Pré-preencher variáveis (default: primeiro nome do cliente para {{1}}, exemplo_value se houver)
    const vars = extrairVariaveis(t.body_text);
    const preenchido = {};
    vars.forEach((v, idx) => {
      const pos = v.match(/\d+/)[0];
      // Tenta usar example_value se houver
      if (idx === 0 && cliente?.primeiro_nome) preenchido[pos] = cliente.primeiro_nome;
      else if (idx === 0 && cliente?.nome_completo) preenchido[pos] = cliente.nome_completo.split(' ')[0];
    });
    setValoresVars(preenchido);
  };

  const handleConfirmar = () => {
    if (!selecionado) return;

    // Validar que todas as variáveis foram preenchidas
    const vars = extrairVariaveis(selecionado.body_text);
    const faltando = vars.some((v) => {
      const pos = v.match(/\d+/)[0];
      return !valoresVars[pos] || !valoresVars[pos].trim();
    });
    if (faltando) {
      toast.error('Preencha todas as variáveis do template antes de confirmar.');
      return;
    }

    setEnviando(true);

    const bodyFinal = preencherVariaveis(selecionado.body_text, valoresVars);
    const valoresArr = extrairVariaveis(selecionado.body_text).map((v) => ({
      position: Number(v.match(/\d+/)[0]),
      value: valoresVars[v.match(/\d+/)[0]],
    }));

    // Construir components para a Graph API
    const components = [];

    // Header texto (se houver com variáveis, aplicar)
    if (selecionado.header_type === 'TEXT' && selecionado.header_text) {
      const headerVars = extrairVariaveis(selecionado.header_text);
      if (headerVars.length > 0) {
        const params = headerVars.map((v) => ({
          type: 'text',
          text: preencherVariaveis(v, valoresVars),
        }));
        components.push({ type: 'header', parameters: params });
      }
    }

    // Body com parâmetros
    const bodyVars = extrairVariaveis(selecionado.body_text);
    if (bodyVars.length > 0) {
      components.push({
        type: 'body',
        parameters: bodyVars.map((v) => ({
          type: 'text',
          text: valoresVars[v.match(/\d+/)[0]],
        })),
      });
    }

    // Botões (preservar os originais do template se houver)
    let buttonsJson = [];
    try {
      if (selecionado.buttons_json) buttonsJson = JSON.parse(selecionado.buttons_json);
    } catch (_) {}

    onSelect({
      template: selecionado,
      valoresArr,
      bodyFinal,
      componentsJson: JSON.stringify(components),
    });

    setEnviando(false);
    onOpenChange(false);
  };

  const filtrados = templates.filter((t) => {
    const termo = busca.toLowerCase().trim();
    if (!termo) return true;
    return (
      (t.display_name || t.name || '').toLowerCase().includes(termo) ||
      (t.body_text || '').toLowerCase().includes(termo)
    );
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-blue-600" />
            Selecionar Template da Meta (Aprovado)
          </DialogTitle>
        </DialogHeader>

        {!selecionado ? (
          <div className="space-y-3">
            {/* Busca */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                placeholder="Buscar por nome ou conteúdo..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                className="pl-9"
              />
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
              </div>
            ) : filtrados.length === 0 ? (
              <div className="text-center py-10 text-slate-500">
                <FileText className="w-10 h-10 mx-auto mb-2 text-slate-300" />
                <p className="font-medium">Nenhum template aprovado encontrado.</p>
                <p className="text-xs mt-1">
                  Crie e envie templates para análise da Meta na tela de Campanhas → Gerenciar Templates.
                </p>
              </div>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {filtrados.map((t) => {
                  const Icone = t.type === 'IMAGE' ? ImageIcon : t.type === 'VIDEO' ? Video : FileText;
                  const vars = extrairVariaveis(t.body_text);
                  return (
                    <button
                      key={t.id}
                      onClick={() => handleSelecionar(t)}
                      className="w-full text-left border border-slate-200 rounded-lg p-3 hover:border-blue-400 hover:bg-blue-50/40 transition-colors"
                    >
                      <div className="flex items-start gap-2">
                        <Icone className="w-4 h-4 text-slate-500 mt-0.5 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-slate-800">
                              {t.display_name || t.name}
                            </span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-medium">
                              Aprovado
                            </span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600">
                              {t.category}
                            </span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600">
                              {t.language}
                            </span>
                          </div>
                          <p className="text-xs text-slate-600 mt-1 line-clamp-2">
                            {t.body_text?.slice(0, 200)}
                          </p>
                          {vars.length > 0 && (
                            <div className="flex gap-1 mt-1 flex-wrap">
                              {vars.map((v) => (
                                <span key={v} className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-mono">
                                  {v}
                                </span>
                              ))}
                            </div>
                          )}
                          {t.footer_text && (
                            <p className="text-[10px] text-slate-400 mt-1">📎 {t.footer_text}</p>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          // Confirmar template + preencher variáveis
          <div className="space-y-4">
            <div className="border border-slate-200 rounded-lg p-3 bg-slate-50">
              <div className="flex items-start gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <span className="font-medium text-slate-800 block">
                    {selecionado.display_name || selecionado.name}
                  </span>
                  <span className="text-[10px] text-slate-500 font-mono">{selecionado.name} · {selecionado.language}</span>
                  {selecionado.header_text && (
                    <p className="text-xs font-medium text-slate-700 mt-2">
                      📌 {selecionado.header_text}
                    </p>
                  )}
                  <p className="text-sm text-slate-700 mt-1 whitespace-pre-wrap">
                    {preencherVariaveis(selecionado.body_text, valoresVars)}
                  </p>
                  {selecionado.footer_text && (
                    <p className="text-[10px] text-slate-400 mt-2">📎 {selecionado.footer_text}</p>
                  )}
                </div>
              </div>
            </div>

            {/* Variáveis */}
            {extrairVariaveis(selecionado.body_text).length > 0 && (
              <div className="space-y-2">
                <Label className="text-slate-700">Preencha as variáveis do template</Label>
                {extrairVariaveis(selecionado.body_text).map((v) => {
                  const pos = v.match(/\d+/)[0];
                  return (
                    <div key={v} className="flex items-center gap-2">
                      <span className="text-xs font-mono text-amber-700 bg-amber-100 px-2 py-1 rounded">
                        {v}
                      </span>
                      <Input
                        placeholder={`Valor para ${v}`}
                        value={valoresVars[pos] || ''}
                        onChange={(e) =>
                          setValoresVars({ ...valoresVars, [pos]: e.target.value })
                        }
                        className="flex-1"
                      />
                    </div>
                  );
                })}
                <p className="text-xs text-slate-500">
                  💡 Dica: a primeira variável costuma ser o nome do cliente.
                </p>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => { setSelecionado(null); setValoresVars({}); }}>
                Voltar
              </Button>
              <Button onClick={handleConfirmar} className="bg-blue-600 hover:bg-blue-700 gap-2">
                <CheckCircle2 className="w-4 h-4" />
                Usar este template
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}