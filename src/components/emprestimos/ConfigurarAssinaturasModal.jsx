import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { AlertTriangle, Copy, MessageCircle, Loader2, CheckCircle2, Fingerprint, Printer } from 'lucide-react';
import { toast } from 'sonner';
import { getTipoOperacaoLabel, gerarTermoAutorizacaoPDF } from './gerarTermoAutorizacao';

const genToken = () => {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(36)).join('').slice(0, 20).toUpperCase();
};

const PARENTESCOS_1_GRAU = ['Pai', 'Mãe', 'Filho(a)', 'Irmão(ã)'];

export default function ConfigurarAssinaturasModal({ open, onOpenChange, proposta, cliente, empresa, termoAtual, currentUser, onCreated }) {
  const [testemunha1, setTestemunha1] = useState({ nome: '', cpf: '', telefone: '', email: '', relacao: '' });
  const [testemunha2, setTestemunha2] = useState({ nome: '', cpf: '', telefone: '', email: '', relacao: '' });
  const [representante, setRepresentante] = useState({ cargo: '', telefone: '', email: '' });
  const [analfabeto, setAnalfabeto] = useState(false);
  const [rogo, setRogo] = useState({ nome: '', cpf: '', parentesco: '' });
  const [saving, setSaving] = useState(false);
  const [solicitacaoCriada, setSolicitacaoCriada] = useState(null);

  useEffect(() => {
    if (open && proposta) {
      setAnalfabeto(proposta.cliente_analfabeto === true);
      setRogo({
        nome: proposta.rogo_nome || '',
        cpf: proposta.rogo_cpf || '',
        parentesco: proposta.rogo_parentesco || '',
      });
      setTestemunha1({
        nome: proposta.testemunha1_nome || '', cpf: proposta.testemunha1_cpf || '',
        telefone: proposta.testemunha1_telefone || '', email: '', relacao: '',
      });
      setTestemunha2({
        nome: proposta.testemunha2_nome || '', cpf: proposta.testemunha2_cpf || '',
        telefone: proposta.testemunha2_telefone || '', email: '', relacao: '',
      });
      setRepresentante({ cargo: '', telefone: empresa?.telefone || '', email: empresa?.email || '' });
      setSolicitacaoCriada(null);
    }
  }, [open, proposta, empresa]);

  const representanteAusente = !empresa?.socio_nome || !empresa?.socio_cpf;

  // Validação: se analfabeto, testemunhas e rogo são obrigatórios
  const analfabetoValido = analfabeto
    ? testemunha1.nome && testemunha1.cpf && testemunha2.nome && testemunha2.cpf && rogo.nome && rogo.cpf && rogo.parentesco
    : true;

  const handleSalvarAnalfabeto = async () => {
    try {
      await base44.entities.Proposta.update(proposta.id, {
        cliente_analfabeto: analfabeto,
        rogo_nome: analfabeto ? rogo.nome : '',
        rogo_cpf: analfabeto ? rogo.cpf : '',
        rogo_parentesco: analfabeto ? rogo.parentesco : '',
        testemunha1_nome: testemunha1.nome,
        testemunha1_cpf: testemunha1.cpf,
        testemunha1_telefone: testemunha1.telefone,
        testemunha2_nome: testemunha2.nome,
        testemunha2_cpf: testemunha2.cpf,
        testemunha2_telefone: testemunha2.telefone,
      });
    } catch (e) {
      toast.error('Erro ao salvar dados do analfabeto: ' + e.message);
    }
  };

  const handleImprimirTermoAnalfabeto = async () => {
    if (!analfabetoValido) {
      toast.error('Preencha os dados do rogo e das duas testemunhas obrigatórias.');
      return;
    }
    setSaving(true);
    try {
      await handleSalvarAnalfabeto();
      const propostaAtualizada = {
        ...proposta,
        cliente_analfabeto: true,
        rogo_nome: rogo.nome,
        rogo_cpf: rogo.cpf,
        rogo_parentesco: rogo.parentesco,
        testemunha1_nome: testemunha1.nome,
        testemunha1_cpf: testemunha1.cpf,
        testemunha1_telefone: testemunha1.telefone,
        testemunha2_nome: testemunha2.nome,
        testemunha2_cpf: testemunha2.cpf,
        testemunha2_telefone: testemunha2.telefone,
      };
      const docPdf = gerarTermoAutorizacaoPDF(propostaAtualizada, cliente, empresa);
      docPdf.autoPrint();
      window.open(docPdf.output('bloburl'), '_blank');
      toast.success('Termo gerado para impressão. Imprima, colha a impressão digital e a assinatura a rogo, depois escaneie e anexe à proposta.');
      onCreated?.();
      onOpenChange(false);
    } catch (e) {
      toast.error('Erro ao gerar termo: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleCriar = async () => {
    if (analfabeto && !analfabetoValido) {
      toast.error('Preencha os dados do rogo e das duas testemunhas obrigatórias.');
      return;
    }
    setSaving(true);
    try {
      if (analfabeto) {
        await handleSalvarAnalfabeto();
      }

      const ordem = ['cliente'];
      if (analfabeto && rogo.nome) ordem.push('rogo');
      if (testemunha1.nome) ordem.push('testemunha1');
      if (testemunha2.nome) ordem.push('testemunha2');
      ordem.push('representante');

      const record = {
        proposta_id: proposta.id,
        empresa_id: proposta.empresa_id || currentUser?.empresa_id,
        termo_autorizacao_id: termoAtual?.id || '',
        termo_pdf_url: termoAtual?.pdf_url || '',
        cliente_nome_snapshot: proposta.cliente_nome,
        banco_snapshot: proposta.administradora_nome,
        tipo_operacao_snapshot: getTipoOperacaoLabel(proposta),
        contrato_snapshot: proposta.contrato,
        valor_bruto_snapshot: proposta.valor_credito || 0,
        valor_liquido_snapshot: proposta.valor_liquido || 0,
        valor_parcela_snapshot: proposta.emprestimo_valor_parcela || 0,
        prazo_snapshot: proposta.emprestimo_prazo || 0,
        status: 'em_assinatura',
        sequencial: false,
        ordem_json: JSON.stringify(ordem),

        cliente_nome: proposta.cliente_nome,
        cliente_cpf: proposta.cliente_cpf || cliente?.cpf,
        cliente_telefone: cliente?.celular || cliente?.telefone_fixo || '',
        cliente_email: cliente?.email || '',
        cliente_token: genToken(),
        cliente_status: analfabeto ? 'nao_aplicavel' : 'pendente',
        cliente_analfabeto: analfabeto,

        rogo_nome: analfabeto ? rogo.nome : '',
        rogo_cpf: analfabeto ? rogo.cpf : '',
        rogo_parentesco: analfabeto ? rogo.parentesco : '',
        rogo_token: analfabeto && rogo.nome ? genToken() : '',
        rogo_status: analfabeto && rogo.nome ? 'pendente' : 'nao_aplicavel',

        testemunha1_nome: testemunha1.nome, testemunha1_cpf: testemunha1.cpf,
        testemunha1_telefone: testemunha1.telefone, testemunha1_email: testemunha1.email,
        testemunha1_relacao: testemunha1.relacao,
        testemunha1_token: testemunha1.nome ? genToken() : '',
        testemunha1_status: testemunha1.nome ? 'pendente' : 'nao_aplicavel',

        testemunha2_nome: testemunha2.nome, testemunha2_cpf: testemunha2.cpf,
        testemunha2_telefone: testemunha2.telefone, testemunha2_email: testemunha2.email,
        testemunha2_relacao: testemunha2.relacao,
        testemunha2_token: testemunha2.nome ? genToken() : '',
        testemunha2_status: testemunha2.nome ? 'pendente' : 'nao_aplicavel',

        representante_nome: empresa?.socio_nome, representante_cpf: empresa?.socio_cpf,
        representante_cargo: representante.cargo, representante_telefone: representante.telefone,
        representante_email: representante.email,
        representante_token: genToken(),
        representante_status: 'pendente',

        criado_por_id: currentUser?.auth_id || currentUser?.id,
        criado_por_nome: currentUser?.nome_perfil || currentUser?.full_name,
        data_criacao: new Date().toISOString(),
      };

      const criada = await base44.entities.SolicitacaoAssinatura.create(record);
      setSolicitacaoCriada(criada);
      toast.success('Solicitação de assinatura criada!');
      onCreated?.();
    } catch (e) {
      toast.error('Erro ao criar solicitação: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  const linkFor = (token) => `${window.location.origin}/assinar/${token}`;

  const copiar = (texto) => {
    navigator.clipboard.writeText(texto);
    toast.success('Copiado!');
  };

  const mensagemWhatsapp = solicitacaoCriada
    ? `Olá, ${(proposta.cliente_nome || '').split(' ')[0]}.\n\nSeu Termo de Autorização referente à operação junto ao banco ${proposta.administradora_nome} está disponível para leitura e assinatura.\n\nContrato/proposta: ${proposta.contrato}\nTipo de operação: ${getTipoOperacaoLabel(proposta)}\n\nPara visualizar e assinar, acesse o link:\n${linkFor(solicitacaoCriada.cliente_token)}\n\nPor segurança, este link é pessoal e não deve ser encaminhado para terceiros.`
    : '';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        {representanteAusente ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-red-600">
                <AlertTriangle className="w-5 h-5" /> Não foi possível iniciar a assinatura
              </DialogTitle>
            </DialogHeader>
            <p className="text-sm text-slate-600">
              O representante legal da empresa ainda não foi cadastrado.
            </p>
            <p className="text-sm text-slate-600">
              Acesse Avatar → Dados da Empresa e complete: Nome do representante legal e CPF.
            </p>
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
            </DialogFooter>
          </>
        ) : solicitacaoCriada ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-green-700">
                <CheckCircle2 className="w-5 h-5" /> Solicitação criada
              </DialogTitle>
            </DialogHeader>
            <div className="bg-slate-50 rounded-lg p-4 space-y-1 text-sm">
              <p><span className="font-semibold text-slate-500">Cliente:</span> {proposta.cliente_nome}</p>
              <p><span className="font-semibold text-slate-500">Documento:</span> Termo de Autorização</p>
              <p><span className="font-semibold text-slate-500">Contrato:</span> {proposta.contrato}</p>
              <p><span className="font-semibold text-slate-500">Status:</span> Aguardando assinaturas — sem ordem obrigatória</p>
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Link do cliente</Label>
              <div className="flex gap-2">
                <Input readOnly value={linkFor(solicitacaoCriada.cliente_token)} className="text-xs" />
                <Button type="button" variant="outline" size="icon" onClick={() => copiar(linkFor(solicitacaoCriada.cliente_token))}>
                  <Copy className="w-4 h-4" />
                </Button>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" className="gap-1.5" onClick={() => copiar(mensagemWhatsapp)}>
                <Copy className="w-4 h-4" /> Copiar mensagem
              </Button>
              <a
                href={`https://wa.me/?text=${encodeURIComponent(mensagemWhatsapp)}`}
                target="_blank" rel="noopener noreferrer"
              >
                <Button type="button" className="gap-1.5 bg-green-600 hover:bg-green-700">
                  <MessageCircle className="w-4 h-4" /> Abrir no WhatsApp
                </Button>
              </a>
            </div>
            <p className="text-xs text-slate-400">Todos os links ficam liberados imediatamente. Cliente, testemunhas e representante podem assinar em qualquer ordem.</p>
            <DialogFooter>
              <Button onClick={() => onOpenChange(false)}>Concluir</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Configurar assinaturas</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="bg-slate-50 rounded-lg p-3 text-sm">
                <p className="font-semibold text-slate-700">Cliente (obrigatório)</p>
                <p className="text-slate-500">{proposta.cliente_nome} — {proposta.cliente_cpf || cliente?.cpf}</p>
              </div>

              {/* Checkbox Cliente Analfabeto */}
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-2">
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <Checkbox
                    checked={analfabeto}
                    onCheckedChange={(v) => setAnalfabeto(v === true)}
                    className="mt-0.5"
                  />
                  <div className="flex-1">
                    <span className="flex items-center gap-1.5 text-sm font-semibold text-slate-800">
                      <Fingerprint className="w-4 h-4 text-amber-600" /> Cliente analfabeto
                    </span>
                    <p className="text-xs text-slate-600 mt-0.5">
                      Marque se o cliente é analfabeto. O termo será impresso para colher a impressão digital,
                      com assinatura a rogo por parente de 1º grau e 2 testemunhas obrigatórias.
                    </p>
                  </div>
                </label>
              </div>

              {/* Campos do Rogo (parente de 1º grau) — só aparece se analfabeto */}
              {analfabeto && (
                <div className="space-y-2 rounded-lg border border-amber-300 bg-amber-50/50 p-3">
                  <p className="font-semibold text-sm text-slate-800 flex items-center gap-1.5">
                    <Fingerprint className="w-4 h-4 text-amber-600" /> Assinatura a Rogo — Parente de 1º grau (obrigatório)
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <Input placeholder="Nome completo do parente" value={rogo.nome} onChange={(e) => setRogo((p) => ({ ...p, nome: e.target.value }))} />
                    <Input placeholder="CPF do parente" value={rogo.cpf} onChange={(e) => setRogo((p) => ({ ...p, cpf: e.target.value }))} />
                    <select
                      className="col-span-2 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      value={rogo.parentesco}
                      onChange={(e) => setRogo((p) => ({ ...p, parentesco: e.target.value }))}
                    >
                      <option value="">Selecione o grau de parentesco...</option>
                      {PARENTESCOS_1_GRAU.map((p) => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <p className="font-semibold text-sm text-slate-700">
                  Testemunha 1 {analfabeto && <span className="text-red-500 font-bold">(obrigatória)</span>}
                  {!analfabeto && <span className="text-slate-400 font-normal">(opcional)</span>}
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <Input placeholder="Nome completo" value={testemunha1.nome} onChange={(e) => setTestemunha1((p) => ({ ...p, nome: e.target.value }))} />
                  <Input placeholder="CPF" value={testemunha1.cpf} onChange={(e) => setTestemunha1((p) => ({ ...p, cpf: e.target.value }))} />
                  <Input placeholder="Telefone" value={testemunha1.telefone} onChange={(e) => setTestemunha1((p) => ({ ...p, telefone: e.target.value }))} />
                  <Input placeholder="E-mail" value={testemunha1.email} onChange={(e) => setTestemunha1((p) => ({ ...p, email: e.target.value }))} />
                  <Input placeholder="Relação com a contratação" className="col-span-2" value={testemunha1.relacao} onChange={(e) => setTestemunha1((p) => ({ ...p, relacao: e.target.value }))} />
                </div>
              </div>

              <div className="space-y-2">
                <p className="font-semibold text-sm text-slate-700">
                  Testemunha 2 {analfabeto && <span className="text-red-500 font-bold">(obrigatória)</span>}
                  {!analfabeto && <span className="text-slate-400 font-normal">(opcional)</span>}
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <Input placeholder="Nome completo" value={testemunha2.nome} onChange={(e) => setTestemunha2((p) => ({ ...p, nome: e.target.value }))} />
                  <Input placeholder="CPF" value={testemunha2.cpf} onChange={(e) => setTestemunha2((p) => ({ ...p, cpf: e.target.value }))} />
                  <Input placeholder="Telefone" value={testemunha2.telefone} onChange={(e) => setTestemunha2((p) => ({ ...p, telefone: e.target.value }))} />
                  <Input placeholder="E-mail" value={testemunha2.email} onChange={(e) => setTestemunha2((p) => ({ ...p, email: e.target.value }))} />
                  <Input placeholder="Relação com a contratação" className="col-span-2" value={testemunha2.relacao} onChange={(e) => setTestemunha2((p) => ({ ...p, relacao: e.target.value }))} />
                </div>
              </div>

              <div className="space-y-2">
                <p className="font-semibold text-sm text-slate-700">Representante da empresa</p>
                <p className="text-xs text-slate-500">{empresa?.socio_nome} — {empresa?.socio_cpf}</p>
                <div className="grid grid-cols-2 gap-2">
                  <Input placeholder="Cargo" value={representante.cargo} onChange={(e) => setRepresentante((p) => ({ ...p, cargo: e.target.value }))} />
                  <Input placeholder="Telefone" value={representante.telefone} onChange={(e) => setRepresentante((p) => ({ ...p, telefone: e.target.value }))} />
                  <Input placeholder="E-mail" className="col-span-2" value={representante.email} onChange={(e) => setRepresentante((p) => ({ ...p, email: e.target.value }))} />
                </div>
              </div>

              {analfabeto ? (
                <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 space-y-1">
                  <p className="font-semibold">Fluxo para cliente analfabeto:</p>
                  <p>1. Imprima o termo (botão abaixo).</p>
                  <p>2. Colha a impressão digital do cliente no campo indicado.</p>
                  <p>3. Colha a assinatura a rogo do parente de 1º grau.</p>
                  <p>4. Colha as assinaturas das 2 testemunhas.</p>
                  <p>5. Escaneie o documento assinado e anexe à proposta.</p>
                </div>
              ) : (
                <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
                  Assinaturas sem ordem obrigatória: todos os participantes podem assinar assim que receberem seus links.
                </div>
              )}
            </div>
            <DialogFooter className="flex-wrap gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
              {analfabeto ? (
                <Button onClick={handleImprimirTermoAnalfabeto} disabled={saving || !analfabetoValido} className="bg-amber-600 hover:bg-amber-700 gap-1.5">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
                  Imprimir termo (impressão digital + a rogo)
                </Button>
              ) : (
                <Button onClick={handleCriar} disabled={saving} className="bg-[#23BE84] hover:bg-[#1da570] gap-1.5">
                  {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                  Gerar links de assinatura
                </Button>
              )}
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}