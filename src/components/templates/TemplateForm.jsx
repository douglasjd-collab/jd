import React, { useState } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Type, Image as ImageIcon, Video, Plus, X, Trash2, RefreshCw } from 'lucide-react';
import {
  normalizeTemplateName,
  CATEGORIAS,
  IDIOMAS,
  TIPOS,
  VARIAVEIS_CRM,
  EXAMPLE_DEFAULTS,
  extractVariablePositions,
} from './templateHelpers';
import TemplateMediaUploader from './TemplateMediaUploader';

const TIPO_ICONS = { Type, Image: ImageIcon, Video };

export default function TemplateForm({ value, onChange, connections, loadingConnections, onOpenConnect, onSync, syncing, empresaId }) {
  const [varShow, setVarShow] = useState(false);

  const update = (patch) => onChange({ ...value, ...patch });

  const handleNameChange = (v) => {
    update({ display_name: v, name: normalizeTemplateName(v) });
  };

  const addVariable = (field) => {
    const positions = extractVariablePositions(value.body_text);
    const next = positions.length === 0 ? 1 : Math.max(...positions) + 1;
    const newBody = (value.body_text || '') + (value.body_text ? ' ' : '') + `{{${next}}}`;
    const newVar = {
      position: next,
      crm_field: field.field,
      description: field.label,
      example_value: EXAMPLE_DEFAULTS[field.field] || '',
      component: 'BODY',
    };
    const vars = [...(value.variables || []), newVar];
    update({ body_text: newBody, variables: vars });
    setVarShow(false);
  };

  const syncVariables = (newBody) => {
    const positions = extractVariablePositions(newBody);
    const existingVars = value.variables || [];
    const newVars = positions.map((pos) => {
      const existing = existingVars.find((v) => v.position === pos);
      if (existing) return existing;
      return { position: pos, crm_field: '', description: `Variável ${pos}`, example_value: '', component: 'BODY' };
    });
    update({ body_text: newBody, variables: newVars });
  };

  const updateVariable = (position, patch) => {
    const vars = (value.variables || []).map((v) => (v.position === position ? { ...v, ...patch } : v));
    update({ variables: vars });
  };

  const addButton = (type) => {
    const newBtn = { type, text: '' };
    if (type === 'URL') newBtn.url = '';
    if (type === 'PHONE_NUMBER') newBtn.phone_number = '';
    update({ buttons: [...(value.buttons || []), newBtn] });
  };

  const updateButton = (idx, patch) => {
    const btns = (value.buttons || []).map((b, i) => (i === idx ? { ...b, ...patch } : b));
    update({ buttons: btns });
  };

  const removeButton = (idx) => update({ buttons: (value.buttons || []).filter((_, i) => i !== idx) });

  const bodyCount = (value.body_text || '').length;
  const footerCount = (value.footer_text || '').length;
  const positions = extractVariablePositions(value.body_text);

  return (
    <div className="space-y-4">
      {/* Conexão */}
      <div>
        <div className="flex items-center justify-between">
          <Label className="text-xs font-semibold text-slate-700">Conexão da API Oficial *</Label>
          {onSync && (
            <button
              type="button"
              onClick={onSync}
              disabled={syncing || loadingConnections}
              className="inline-flex items-center gap-1 text-[11px] font-medium text-[#10353C] hover:text-[#1a5060] disabled:opacity-50"
              title="Buscar sessões Cloud API na D-API"
            >
              <RefreshCw className={`w-3 h-3 ${syncing ? 'animate-spin' : ''}`} />
              Atualizar conexões
            </button>
          )}
        </div>
        {loadingConnections ? (
          <div className="text-xs text-slate-500 mt-1">Carregando conexões...</div>
        ) : connections.length === 0 ? (
          <div className="mt-1 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 space-y-1">
            <div>Nenhuma conexão da API Oficial foi encontrada.</div>
            <div>Clique em <strong>Atualizar conexões</strong> para sincronizar as sessões Cloud API da D-API. Se a empresa ainda não tem nenhuma, conecte uma via Meta Embedded Signup.</div>
            {onOpenConnect && (
              <button
                type="button"
                onClick={onOpenConnect}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-md bg-[#10353C] text-white hover:bg-[#1a5060]"
              >
                <Plus className="w-3.5 h-3.5" /> Conectar agora
              </button>
            )}
          </div>
        ) : (
          <Select value={value.connection_id || ''} onValueChange={(v) => update({ connection_id: v })}>
            <SelectTrigger className="mt-1 text-sm">
              <SelectValue placeholder="Selecione a conexão Cloud API" />
            </SelectTrigger>
            <SelectContent>
              {connections.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  <div className="flex flex-col">
                    <span className="font-medium">{c.nome || c.session_id}</span>
                    <span className="text-[10px] text-slate-500">
                      {c.phone_number ? `${c.phone_number} · ` : ''}API Oficial · Conectada
                    </span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {value.connection_id && (() => {
          const c = connections.find((cc) => cc.id === value.connection_id);
          if (!c) return null;
          return (
            <div className="mt-1.5 text-[10px] text-slate-500 font-mono space-y-0.5">
              {c.waba_id && <div>WABA: {c.waba_id}</div>}
              {c.phone_number_id && <div>Phone Number ID: {c.phone_number_id}</div>}
              {c.session_id && <div>Session: {c.session_id}</div>}
            </div>
          );
        })()}
      </div>

      {/* Nome */}
      <div>
        <Label className="text-xs font-semibold text-slate-700">Nome do template *</Label>
        <Input
          value={value.display_name || ''}
          onChange={(e) => handleNameChange(e.target.value)}
          placeholder='Ex: "Lembrete de Vencimento"'
          className="mt-1 text-sm"
        />
        {value.name && (
          <div className="text-[10px] text-slate-500 mt-1 font-mono">nome final: {value.name}</div>
        )}
      </div>

      {/* Categoria */}
      <div>
        <Label className="text-xs font-semibold text-slate-700">Categoria *</Label>
        <div className="grid grid-cols-3 gap-2 mt-1">
          {CATEGORIAS.map((c) => (
            <button
              key={c.value}
              type="button"
              onClick={() => c.value !== 'AUTHENTICATION' && update({ category: c.value })}
              disabled={c.value === 'AUTHENTICATION'}
              className={`flex flex-col items-start text-left p-2 rounded border text-xs transition-colors ${
                value.category === c.value
                  ? 'bg-[#10353C] text-white border-[#10353C]'
                  : 'bg-white border-slate-200 hover:border-slate-300'
              } ${c.value === 'AUTHENTICATION' ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <span className="font-semibold">{c.label}</span>
              <span className={`text-[10px] mt-1 line-clamp-3 ${value.category === c.value ? 'text-white/80' : 'text-slate-500'}`}>
                {c.desc}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Idioma */}
      <div>
        <Label className="text-xs font-semibold text-slate-700">Idioma *</Label>
        <Select value={value.language || 'pt_BR'} onValueChange={(v) => update({ language: v })}>
          <SelectTrigger className="mt-1 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            {IDIOMAS.map((i) => (<SelectItem key={i.value} value={i.value}>{i.label}</SelectItem>))}
          </SelectContent>
        </Select>
      </div>

      {/* Tipo */}
      <div>
        <Label className="text-xs font-semibold text-slate-700">Tipo de template *</Label>
        <div className="grid grid-cols-3 gap-2 mt-1">
          {TIPOS.map((t) => {
            const Icon = TIPO_ICONS[t.icon] || Type;
            const isSel = value.type === t.value;
            const isDisabled = !t.enabled;
            return (
              <button
                key={t.value}
                type="button"
                disabled={isDisabled}
                onClick={() => !isDisabled && update({ type: t.value })}
                className={`flex flex-col items-start text-left p-2.5 rounded border text-xs transition-colors ${
                  isSel ? 'bg-[#10353C] text-white border-[#10353C]'
                    : 'bg-white border-slate-200 hover:border-slate-300'
                } ${isDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <Icon className="w-4 h-4 mb-1" />
                <span className="font-semibold">{t.label}</span>
                <span className={`text-[10px] mt-1 ${isSel ? 'text-white/80' : 'text-slate-500'}`}>
                  {isDisabled ? 'Em breve' : t.desc}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Cabeçalho */}
      {value.type === 'TEXT' && (
        <div>
          <Label className="text-xs font-semibold text-slate-700">Título do cabeçalho (opcional)</Label>
          <Input
            value={value.header_text || ''}
            onChange={(e) => update({ header_text: e.target.value })}
            placeholder="Ex: Lembrete de pagamento"
            maxLength={60}
            className="mt-1 text-sm"
          />
          <div className="text-[10px] text-slate-500 mt-0.5">Máx. 60 caracteres. Sem variáveis.</div>
        </div>
      )}
      {(value.type === 'IMAGE' || value.type === 'VIDEO') && (
        <div>
          <Label className="text-xs font-semibold text-slate-700">
            {value.type === 'IMAGE' ? 'Imagem do cabeçalho *' : 'Vídeo do cabeçalho *'}
          </Label>
          <TemplateMediaUploader
            type={value.type}
            empresaId={empresaId}
            value={value}
            onChange={update}
          />
          <div className="text-[10px] text-slate-500 mt-0.5">
            {value.type === 'IMAGE'
              ? 'Mínimo 50×50px. A imagem é enviada para a biblioteca de mídia da Meta antes de submeter o template.'
              : 'Vídeo H.264/MP4. O vídeo é enviado para a biblioteca de mídia da Meta antes de submeter o template.'}
          </div>
        </div>
      )}

      {/* Corpo + Variáveis */}
      <div>
        <div className="flex items-center justify-between">
          <Label className="text-xs font-semibold text-slate-700">Mensagem do template *</Label>
          <span className="text-[10px] text-slate-500">{bodyCount} caracteres</span>
        </div>
        <Textarea
          value={value.body_text || ''}
          onChange={(e) => syncVariables(e.target.value)}
          placeholder={'Olá, {{1}}! Sua parcela vence em {{2}} no valor de {{3}}...'}
          rows={5}
          className="mt-1 text-sm"
        />

        <div className="relative mt-1">
          <button
            type="button"
            onClick={() => setVarShow(!varShow)}
            className="text-xs flex items-center gap-1 text-[#10353C] hover:underline"
          >
            <Plus className="w-3 h-3" /> Adicionar variável
          </button>
          {varShow && (
            <div className="absolute z-50 mt-1 bg-white border border-slate-200 rounded-md shadow-lg p-2 max-w-[300px] w-full">
              <div className="text-[10px] text-slate-500 mb-1 flex justify-between">
                <span>Variáveis do CRM</span>
                <button onClick={() => setVarShow(false)}><X className="w-3 h-3" /></button>
              </div>
              <div className="max-h-[200px] overflow-y-auto space-y-2">
                {VARIAVEIS_CRM.map((g) => (
                  <div key={g.group}>
                    <div className="text-[10px] font-bold uppercase text-slate-400 px-1 mt-1">{g.group}</div>
                    {g.items.map((it) => (
                      <button
                        key={it.field}
                        type="button"
                        onClick={() => addVariable(it)}
                        className="w-full text-left text-xs px-2 py-1 hover:bg-slate-50 rounded"
                      >
                        {it.label} <span className="text-[10px] text-slate-400 font-mono">{it.field}</span>
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Lista de variáveis com exemplos */}
      {positions.length > 0 && (
        <div className="bg-slate-50 border border-slate-200 rounded-md p-3 space-y-2">
          <div className="text-xs font-semibold text-slate-700">
            Exemplos das variáveis <span className="text-slate-500 font-normal">(não use dados reais sensíveis)</span>
          </div>
          {positions.map((pos) => {
            const v = (value.variables || []).find((x) => x.position === pos) || {};
            return (
              <div key={pos} className="grid grid-cols-12 gap-2 items-center">
                <div className="col-span-2 text-[10px] text-slate-600 font-mono font-bold">{`{{${pos}}}`}</div>
                <Input
                  value={v.description || ''}
                  placeholder="Descrição"
                  onChange={(e) => updateVariable(pos, { description: e.target.value })}
                  className="col-span-4 text-xs"
                />
                <Input
                  value={v.example_value || ''}
                  placeholder="Valor de exemplo"
                  onChange={(e) => updateVariable(pos, { example_value: e.target.value })}
                  className="col-span-6 text-xs"
                />
              </div>
            );
          })}
        </div>
      )}

      {/* Rodapé */}
      <div>
        <div className="flex items-center justify-between">
          <Label className="text-xs font-semibold text-slate-700">Rodapé (opcional)</Label>
          <span className="text-[10px] text-slate-500">{footerCount}/60</span>
        </div>
        <Input
          value={value.footer_text || ''}
          onChange={(e) => update({ footer_text: e.target.value })}
          placeholder="Ex: JD Promotora"
          maxLength={60}
          className="mt-1 text-sm"
        />
        <div className="text-[10px] text-slate-500 mt-0.5">Sem variáveis permitidas.</div>
      </div>

      {/* Botões */}
      <div>
        <Label className="text-xs font-semibold text-slate-700">Botões (opcional)</Label>
        <div className="space-y-2 mt-1">
          {(value.buttons || []).map((b, idx) => (
            <div key={idx} className="border border-slate-200 rounded-md p-2 space-y-1.5 bg-white">
              <div className="flex items-center justify-between gap-2">
                <Select value={b.type} onValueChange={(v) => updateButton(idx, { type: v })}>
                  <SelectTrigger className="h-7 text-xs w-40"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="QUICK_REPLY">Resposta rápida</SelectItem>
                    <SelectItem value="URL">Abrir site</SelectItem>
                    <SelectItem value="PHONE_NUMBER">Ligar</SelectItem>
                  </SelectContent>
                </Select>
                <button onClick={() => removeButton(idx)} className="text-red-500 p-1 hover:bg-red-50 rounded">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
              <Input
                value={b.text || ''}
                placeholder="Texto do botão"
                onChange={(e) => updateButton(idx, { text: e.target.value })}
                maxLength={25}
                className="text-xs"
              />
              {b.type === 'URL' && (
                <Input
                  value={b.url || ''}
                  placeholder="https://..."
                  onChange={(e) => updateButton(idx, { url: e.target.value })}
                  className="text-xs"
                />
              )}
              {b.type === 'PHONE_NUMBER' && (
                <Input
                  value={b.phone_number || ''}
                  placeholder="+5587999999999"
                  onChange={(e) => updateButton(idx, { phone_number: e.target.value })}
                  className="text-xs"
                />
              )}
            </div>
          ))}
        </div>
        {(value.buttons || []).length < 10 && (
          <div className="flex gap-1 mt-2 flex-wrap">
            <Button type="button" variant="outline" size="sm" onClick={() => addButton('QUICK_REPLY')}>
              <Plus className="w-3 h-3" /> Resposta rápida
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => addButton('URL')}>
              <Plus className="w-3 h-3" /> Abrir site
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => addButton('PHONE_NUMBER')}>
              <Plus className="w-3 h-3" /> Ligar
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}