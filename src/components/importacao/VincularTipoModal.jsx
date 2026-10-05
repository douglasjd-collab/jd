import React, { useEffect, useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Search, Plus, Loader2, CheckCircle2, Tag } from 'lucide-react';
import { toast } from 'sonner';
import { normalizarDescricaoTipo } from './tiposEmprestimoMatch';

const gerarSlug = (nome) => String(nome || '')
  .toUpperCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/\s+/g, '_')
  .replace(/[^A-Z0-9_]/g, '');

export default function VincularTipoModal({ open, onClose, pendencia, empresaId, tipos = [], onConcluido }) {
  const [busca, setBusca] = useState('');
  const [tipoSelecionado, setTipoSelecionado] = useState(null);
  const [criandoNovo, setCriandoNovo] = useState(false);
  const [novoNome, setNovoNome] = useState('');
  const [salvando, setSalvando] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!open) return;
    setBusca('');
    setTipoSelecionado(null);
    setCriandoNovo(false);
    setNovoNome(pendencia?.sem_descricao ? '' : (pendencia?.descricao_original || ''));
  }, [open, pendencia?.id]);

  const filtrados = useMemo(() => {
    const termo = normalizarDescricaoTipo(busca);
    if (!termo) return tipos;
    return tipos.filter(t => normalizarDescricaoTipo(`${t.nome} ${t.slug}`).includes(termo));
  }, [tipos, busca]);

  const criarNovoTipo = async () => {
    const nome = novoNome.trim();
    if (!nome) { toast.error('Informe o nome do novo tipo'); return; }
    const slug = gerarSlug(nome);
    if (!slug) { toast.error('Nome inválido'); return; }
    setSalvando(true);
    try {
      const criado = await base44.entities.TipoEmprestimo.create({
        empresa_id: empresaId,
        nome,
        slug,
        aliases_importacao: [],
        ativo: true,
      });
      queryClient.invalidateQueries({ queryKey: ['tipos-emprestimo', empresaId] });
      setTipoSelecionado(criado);
      setCriandoNovo(false);
      toast.success(`Tipo "${nome}" criado. Confirme a vinculação abaixo.`);
    } catch (e) {
      toast.error('Erro ao criar tipo: ' + (e?.message || 'tente novamente'));
    } finally {
      setSalvando(false);
    }
  };

  const confirmar = async () => {
    if (!tipoSelecionado) { toast.error('Selecione um tipo de empréstimo'); return; }
    setSalvando(true);
    try {
      const resposta = await base44.functions.invoke('vincularTipoPendencia', {
        pendencia_id: pendencia.id,
        tipo_id: tipoSelecionado.id,
      });
      const dados = resposta?.data || {};
      if (!dados.success) {
        toast.error(dados.error || 'Não foi possível concluir a vinculação');
        return;
      }
      if (dados.pendencia_resolvida) {
        toast.success(`${dados.atualizados} registro(s) atualizado(s) para "${dados.tipo_nome}".`);
      } else {
        toast.warning(`${dados.atualizados} registro(s) atualizado(s). ${dados.falhas} continuam pendentes.`);
      }
      onConcluido?.();
      onClose();
    } catch (e) {
      toast.error('Erro ao vincular: ' + (e?.message || 'tente novamente'));
    } finally {
      setSalvando(false);
    }
  };

  if (!pendencia) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Vincular a um tipo de empréstimo</DialogTitle>
          <DialogDescription>
            Descrição recebida: <span className="font-medium text-slate-700">{pendencia.descricao_original}</span>
            {pendencia.origem ? <> • Origem: <span className="font-medium text-slate-700">{pendencia.origem}</span></> : null}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label className="text-xs font-semibold text-slate-500">Buscar tipo já cadastrado</Label>
            <div className="relative mt-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <Input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Nome ou código do tipo..."
                className="pl-9"
              />
            </div>
          </div>

          <div className="border rounded-xl divide-y max-h-56 overflow-y-auto">
            {filtrados.length === 0 ? (
              <p className="p-4 text-sm text-slate-500 text-center">Nenhum tipo encontrado.</p>
            ) : filtrados.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTipoSelecionado(t)}
                className={`w-full flex items-center justify-between gap-3 p-3 text-left transition-colors ${
                  tipoSelecionado?.id === t.id ? 'bg-blue-50' : 'hover:bg-slate-50'
                }`}
              >
                <span className="min-w-0">
                  <span className="block font-medium text-slate-800 truncate">{t.nome}</span>
                  <span className="block text-xs font-mono text-slate-500">{t.slug}</span>
                </span>
                {tipoSelecionado?.id === t.id && <CheckCircle2 className="w-5 h-5 text-blue-600 flex-shrink-0" />}
              </button>
            ))}
          </div>

          {!criandoNovo ? (
            <Button variant="outline" size="sm" onClick={() => setCriandoNovo(true)} className="text-blue-700 border-blue-200 hover:bg-blue-50">
              <Plus className="w-4 h-4 mr-1.5" /> Cadastrar novo tipo
            </Button>
          ) : (
            <div className="border border-blue-200 bg-blue-50 rounded-xl p-3 space-y-3">
              <div className="flex items-center gap-2">
                <Tag className="w-4 h-4 text-blue-700" />
                <p className="text-sm font-semibold text-blue-800">Novo tipo de empréstimo</p>
              </div>
              <div>
                <Label className="text-xs text-blue-700">Nome *</Label>
                <Input value={novoNome} onChange={(e) => setNovoNome(e.target.value)} className="h-9 mt-1 bg-white" placeholder="Ex: Novo, Portabilidade Pura" />
                {novoNome.trim() && (
                  <p className="text-xs text-blue-700 mt-1">Código: <span className="font-mono">{gerarSlug(novoNome)}</span></p>
                )}
              </div>
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="outline" onClick={() => setCriandoNovo(false)} className="bg-white">Cancelar</Button>
                <Button size="sm" onClick={criarNovoTipo} disabled={salvando} className="bg-blue-600 hover:bg-blue-700">
                  {salvando && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />} Criar tipo
                </Button>
              </div>
            </div>
          )}

          {tipoSelecionado && (
            <div className="border rounded-xl p-4 bg-slate-50 space-y-1.5">
              <p className="text-sm text-slate-700">
                Tipo escolhido: <span className="font-semibold">{tipoSelecionado.nome}</span>
                <Badge variant="outline" className="ml-2 font-mono text-[10px]">{tipoSelecionado.slug}</Badge>
              </p>
              <p className="text-sm text-slate-700">
                <span className="font-semibold">{pendencia.quantidade || 0}</span> registro(s) serão atualizados.
              </p>
              <p className="text-xs text-slate-500">
                {pendencia.sem_descricao
                  ? 'Arquivos sem tipo informado passarão a usar este tipo. Nenhum alias vazio será criado.'
                  : pendencia.origem
                    ? `O vínculo "${pendencia.descricao_original}" será salvo apenas para a origem ${pendencia.origem} — o mesmo nome pode significar tipos diferentes em outros bancos.`
                    : `A origem não foi informada, então o vínculo "${pendencia.descricao_original}" valerá para qualquer banco.`}
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={salvando}>Cancelar</Button>
          <Button onClick={confirmar} disabled={salvando || !tipoSelecionado} className="bg-blue-600 hover:bg-blue-700">
            {salvando ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Vinculando...</> : 'Confirmar vinculação'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}