import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Download, Printer, FileCheck2, Send, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { validarDadosTermo } from './validarDadosTermo';
import { gerarTermoAutorizacaoPDF, getTipoOperacaoLabel } from './gerarTermoAutorizacao';

const buildSnapshot = (proposta, cliente, empresa) => JSON.stringify({
  cliente_nome: cliente?.nome_completo || proposta.cliente_nome,
  cliente_cpf: cliente?.cpf || proposta.cliente_cpf,
  cliente_rg: cliente?.rg,
  cliente_endereco: cliente?.res_endereco,
  cliente_numero: cliente?.res_numero,
  cliente_bairro: cliente?.res_bairro,
  cliente_cidade: cliente?.res_cidade,
  cliente_uf: cliente?.res_uf,
  cliente_cep: cliente?.res_cep,
  banco: proposta.administradora_nome,
  tipo_operacao: proposta.emprestimo_tipo,
  contrato: proposta.contrato,
  valor_credito: proposta.valor_credito,
  valor_liquido: proposta.valor_liquido,
  valor_parcela: proposta.emprestimo_valor_parcela,
  prazo: proposta.emprestimo_prazo,
  empresa_nome: empresa?.nome,
  empresa_cnpj: empresa?.cpf_cnpj,
  empresa_endereco: empresa?.endereco_rua,
  empresa_socio: empresa?.socio_nome,
});

async function sha256(blob) {
  const buf = await blob.arrayBuffer();
  const hashBuf = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hashBuf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export default function TermoAutorizacaoModal({
  open, onOpenChange, proposta, cliente, empresa, currentUser,
  onEditCliente, onEditProposta, onEditEmpresa, onGerado,
}) {
  const [validacao, setValidacao] = useState(null);
  const [ultimoTermo, setUltimoTermo] = useState(null);
  const [dadosAlterados, setDadosAlterados] = useState(false);
  const [loadingAcao, setLoadingAcao] = useState(null);

  useEffect(() => {
    if (!open || !proposta) return;
    setValidacao(validarDadosTermo({ cliente, proposta, empresa }));
    carregarUltimoTermo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, proposta?.id, cliente, empresa]);

  const carregarUltimoTermo = async () => {
    try {
      const termos = await base44.entities.TermoAutorizacao.filter({ proposta_id: proposta.id }, '-versao', 1);
      const ultimo = termos?.[0] || null;
      setUltimoTermo(ultimo);
      if (ultimo) {
        setDadosAlterados(ultimo.dados_snapshot_json !== buildSnapshot(proposta, cliente, empresa));
      } else {
        setDadosAlterados(false);
      }
    } catch {
      setUltimoTermo(null);
    }
  };

  const handleBaixar = () => {
    const docPdf = gerarTermoAutorizacaoPDF(proposta, cliente, empresa);
    docPdf.save(`Termo_Autorizacao_${(proposta.cliente_nome || 'cliente').replace(/\s+/g, '_')}_${(proposta.contrato || '').replace(/\s+/g, '_')}.pdf`);
  };

  const handleImprimir = () => {
    const docPdf = gerarTermoAutorizacaoPDF(proposta, cliente, empresa);
    docPdf.autoPrint();
    window.open(docPdf.output('bloburl'), '_blank');
  };

  const salvarTermo = async (statusFinal) => {
    const docPdf = gerarTermoAutorizacaoPDF(proposta, cliente, empresa);
    const blob = docPdf.output('blob');
    const nomeArquivo = `Termo_Autorizacao_${(proposta.cliente_nome || 'cliente').replace(/\s+/g, '_')}_${(proposta.contrato || '').replace(/\s+/g, '_')}.pdf`;
    const file = new File([blob], nomeArquivo, { type: 'application/pdf' });

    const hash = await sha256(blob);
    const { file_url } = await base44.integrations.Core.UploadFile({ file });

    const novaVersao = (ultimoTermo?.versao || 0) + 1;
    const snapshot = buildSnapshot(proposta, cliente, empresa);

    if (ultimoTermo && !['substituido', 'cancelado'].includes(ultimoTermo.status)) {
      await base44.entities.TermoAutorizacao.update(ultimoTermo.id, {
        status: 'substituido',
        motivo_substituicao: 'Dados da proposta, cliente ou empresa foram alterados após a geração.',
      });
    }

    await base44.entities.TermoAutorizacao.create({
      proposta_id: proposta.id,
      empresa_id: proposta.empresa_id || currentUser?.empresa_id,
      versao: novaVersao,
      status: statusFinal,
      pdf_url: file_url,
      hash_arquivo: hash,
      gerado_por_id: currentUser?.auth_id || currentUser?.id,
      gerado_por_nome: currentUser?.nome_perfil || currentUser?.full_name,
      data_geracao: new Date().toISOString(),
      ...(statusFinal === 'aguardando_assinatura' ? { data_envio: new Date().toISOString() } : {}),
      cliente_nome: proposta.cliente_nome,
      cliente_cpf: proposta.cliente_cpf || cliente?.cpf,
      contrato: proposta.contrato,
      banco: proposta.administradora_nome,
      tipo_operacao: getTipoOperacaoLabel(proposta),
      dados_snapshot_json: snapshot,
    });

    let anexos = [];
    try { anexos = proposta.anexos_json ? JSON.parse(proposta.anexos_json) : []; } catch { anexos = []; }
    anexos.push({
      nome: `Termo de Autorização v${novaVersao}.pdf`,
      url: file_url,
      tipo: 'termo_autorizacao',
      data_upload: new Date().toISOString(),
    });
    await base44.entities.Proposta.update(proposta.id, { anexos_json: JSON.stringify(anexos) });

    return { file_url };
  };

  const handleGerarEAnexar = async () => {
    setLoadingAcao('anexar');
    try {
      const { file_url } = await salvarTermo('gerado');
      toast.success('Termo de Autorização gerado e anexado à proposta!');
      window.open(file_url, '_blank');
      onGerado?.();
      onOpenChange(false);
    } catch (e) {
      toast.error('Erro ao gerar termo: ' + e.message);
    } finally {
      setLoadingAcao(null);
    }
  };

  const handleEnviarAssinatura = async () => {
    setLoadingAcao('assinatura');
    try {
      await salvarTermo('aguardando_assinatura');
      toast.success('Termo gerado e marcado como Aguardando Assinatura!');
      onGerado?.();
      onOpenChange(false);
    } catch (e) {
      toast.error('Erro ao enviar para assinatura: ' + e.message);
    } finally {
      setLoadingAcao(null);
    }
  };

  if (!proposta) return null;

  const faltantes = validacao?.faltantes || [];
  const invalido = validacao && !validacao.valido;

  const handleAtualizarInformacoes = () => {
    const categoria = faltantes[0]?.categoria;
    onOpenChange(false);
    if (categoria === 'cliente') onEditCliente?.(proposta.cliente_id);
    else if (categoria === 'empresa') onEditEmpresa?.();
    else onEditProposta?.(proposta);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        {invalido ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-red-600">
                <AlertTriangle className="w-5 h-5" /> Não foi possível gerar o Termo de Autorização
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <p className="text-sm text-slate-600">Existem informações obrigatórias que ainda não foram preenchidas:</p>
              <ul className="text-sm text-slate-700 space-y-1 bg-red-50 border border-red-100 rounded-lg p-3">
                {faltantes.map((f, i) => <li key={i}>• {f.label}</li>)}
              </ul>
              <p className="text-sm text-slate-600">Atualize os dados indicados e tente novamente.</p>
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
              <Button onClick={handleAtualizarInformacoes} className="bg-[#23BE84] hover:bg-[#1da570]">Atualizar informações</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Termo de Autorização</DialogTitle>
            </DialogHeader>
            {dadosAlterados && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>Os dados desta proposta foram alterados depois da geração do Termo de Autorização. Uma nova versão será gerada.</span>
              </div>
            )}
            <div className="bg-slate-50 rounded-lg p-4 space-y-1.5 text-sm">
              <p><span className="font-semibold text-slate-500">Cliente:</span> {proposta.cliente_nome}</p>
              <p><span className="font-semibold text-slate-500">CPF:</span> {proposta.cliente_cpf || cliente?.cpf || '-'}</p>
              <p><span className="font-semibold text-slate-500">Banco:</span> {proposta.administradora_nome}</p>
              <p><span className="font-semibold text-slate-500">Operação:</span> {getTipoOperacaoLabel(proposta)}</p>
              <p><span className="font-semibold text-slate-500">Contrato:</span> {proposta.contrato}</p>
            </div>
            <p className="text-xs text-slate-400">O termo é gerado exatamente com os dados cadastrados. Para corrigir alguma informação, atualize o cadastro de origem e gere novamente.</p>
            <DialogFooter className="flex-wrap gap-2 sm:justify-between">
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" className="gap-1.5" onClick={handleBaixar}>
                  <Download className="w-4 h-4" /> Baixar PDF
                </Button>
                <Button variant="outline" className="gap-1.5" onClick={handleImprimir}>
                  <Printer className="w-4 h-4" /> Imprimir
                </Button>
                <Button variant="outline" className="gap-1.5" onClick={handleEnviarAssinatura} disabled={!!loadingAcao}>
                  {loadingAcao === 'assinatura' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  Enviar para Assinatura
                </Button>
                <Button className="gap-1.5 bg-[#23BE84] hover:bg-[#1da570]" onClick={handleGerarEAnexar} disabled={!!loadingAcao}>
                  {loadingAcao === 'anexar' ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileCheck2 className="w-4 h-4" />}
                  Gerar e Anexar
                </Button>
              </div>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}