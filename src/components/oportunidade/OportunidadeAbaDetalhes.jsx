import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { format } from 'date-fns';
import { User, DollarSign, Phone, MapPin, Calendar, Building2, Tag, ChevronDown, Check, CheckCircle2, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { useQueryClient, useMutation } from '@tanstack/react-query';

const formatCurrency = (v) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

function InfoItem({ label, value, icon: IconComp }) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-2">
      {IconComp && <IconComp className="w-4 h-4 text-slate-400 mt-0.5 flex-shrink-0" />}
      <div className="min-w-0">
        <p className="text-xs text-slate-400">{label}</p>
        <p className="text-sm font-medium text-slate-800 break-words">{value}</p>
      </div>
    </div>
  );
}

function CardSection({ title, icon: SectionIcon, children, color = 'blue' }) {
  const colors = {
    blue: 'bg-blue-50 text-blue-700 border-blue-200',
    green: 'bg-green-50 text-green-700 border-green-200',
    purple: 'bg-purple-50 text-purple-700 border-purple-200',
    orange: 'bg-orange-50 text-orange-700 border-orange-200',
  };
  return (
    <Card className="overflow-hidden border shadow-sm">
      <div className={`px-4 py-3 border-b ${colors[color]} flex items-center gap-2`}>
        {SectionIcon && <SectionIcon className="w-4 h-4" />}
        <span className="font-semibold text-sm">{title}</span>
      </div>
      <div className="p-4 space-y-3">{children}</div>
    </Card>
  );
}



export default function OportunidadeAbaDetalhes({ oportunidade, colaboradores, etapas, currentUser, onUpdate }) {
  const queryClient = useQueryClient();
  const [novaEtapaId, setNovaEtapaId] = useState('');
  const [editandoObservacao, setEditandoObservacao] = useState(false);
  const [observacao, setObservacao] = useState(oportunidade?.observacoes || '');

  const responsavel = colaboradores.find(c => c.id === oportunidade?.vendedor_id);
  const etapaAtual = etapas.find(e => e.id === oportunidade?.etapa_id);
  const etapasDoProduto = oportunidade?.produto
    ? etapas.filter(e => e.produto === oportunidade.produto)
    : etapas;

  const moverEtapa = useMutation({
    mutationFn: async (etapaId) => {
      const etapa = etapas.find(e => e.id === etapaId);
      await base44.entities.Oportunidade.update(oportunidade.id, {
        etapa_id: etapaId,
        etapa_nome: etapa?.nome || '',
        data_ultima_movimentacao: new Date().toISOString(),
        status: etapa?.tipo === 'ganho' ? 'ganha' : etapa?.tipo === 'perdida' ? 'perdida' : 'aberta',
      });
      await base44.entities.MovimentacaoFunil.create({
        oportunidade_id: oportunidade.id,
        etapa_origem_id: oportunidade.etapa_id,
        etapa_origem_nome: oportunidade.etapa_nome || '',
        etapa_destino_id: etapaId,
        etapa_destino_nome: etapa?.nome || '',
        usuario_id: currentUser?.id,
        usuario_nome: currentUser?.nome_perfil || currentUser?.full_name,
      });
    },
    onSuccess: () => {
      toast.success('Etapa atualizada!');
      queryClient.invalidateQueries({ queryKey: ['oportunidade', oportunidade.id] });
      queryClient.invalidateQueries({ queryKey: ['movimentacoes-oportunidade', oportunidade.id] });
      setNovaEtapaId('');
    },
    onError: (e) => toast.error(e.message),
  });

  const salvarObservacao = async () => {
    await onUpdate(oportunidade.id, { observacoes: observacao });
    setEditandoObservacao(false);
    toast.success('Observação salva!');
  };

  return (
    <div className="p-6 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
      {/* Card Dados do Cliente */}
      <CardSection title="Dados do Cliente" icon={User} color="blue">
        <InfoItem label="Nome" value={oportunidade.cliente_nome} icon={User} />
        <InfoItem label="Telefone" value={oportunidade.cliente_telefone || oportunidade.telefone_lead} icon={Phone} />
        <InfoItem label="Origem" value={oportunidade.origem} icon={Tag} />
        <InfoItem label="Cadastro Lead" value={oportunidade.data_cadastro_lead ? format(new Date(oportunidade.data_cadastro_lead), 'dd/MM/yyyy') : null} icon={Calendar} />
        <InfoItem label="Previsão Fechamento" value={oportunidade.data_fechamento_prevista ? format(new Date(oportunidade.data_fechamento_prevista), 'dd/MM/yyyy') : null} icon={Calendar} />
        <InfoItem label="Pré-Fechamento" value={oportunidade.data_pre_fechamento ? format(new Date(oportunidade.data_pre_fechamento), 'dd/MM/yyyy') : null} icon={Calendar} />
      </CardSection>

      {/* Card Comercial */}
      <CardSection title="Dados Comerciais" icon={DollarSign} color="green">
        <InfoItem label="Produto" value={oportunidade.produto ? oportunidade.produto.charAt(0).toUpperCase() + oportunidade.produto.slice(1) : null} icon={Tag} />
        <InfoItem label="Valor Estimado" value={oportunidade.valor_estimado ? formatCurrency(oportunidade.valor_estimado) : null} icon={DollarSign} />
        <InfoItem label="Etapa Atual" value={etapaAtual?.nome} icon={Tag} />
        <InfoItem label="Status" value={oportunidade.status} />
        <InfoItem label="Última Movimentação" value={oportunidade.data_ultima_movimentacao ? format(new Date(oportunidade.data_ultima_movimentacao), 'dd/MM/yyyy HH:mm') : null} icon={Calendar} />

        {/* Mover etapa */}
        <div className="pt-2 border-t">
          <p className="text-xs text-slate-500 mb-1.5 font-medium">Mover para etapa</p>
          <div className="flex gap-2">
            <Select value={novaEtapaId} onValueChange={setNovaEtapaId}>
              <SelectTrigger className="h-8 text-xs flex-1">
                <SelectValue placeholder="Selecionar..." />
              </SelectTrigger>
              <SelectContent>
                {etapasDoProduto.filter(e => e.id !== oportunidade.etapa_id).map(e => (
                  <SelectItem key={e.id} value={e.id} className="text-xs">{e.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {novaEtapaId && (
              <Button size="sm" className="h-8 text-xs bg-[#1e3a5f] px-3" onClick={() => moverEtapa.mutate(novaEtapaId)} disabled={moverEtapa.isPending}>
                <Check className="w-3 h-3" />
              </Button>
            )}
          </div>
          <div className="flex gap-2 mt-2">
            <Button size="sm" className="flex-1 h-7 text-xs bg-green-600 hover:bg-green-700 gap-1"
              onClick={() => { const e = etapas.find(x => x.tipo === 'ganho'); if (e) moverEtapa.mutate(e.id); }}>
              <CheckCircle2 className="w-3 h-3" /> Ganho
            </Button>
            <Button size="sm" className="flex-1 h-7 text-xs bg-red-600 hover:bg-red-700 gap-1"
              onClick={() => { const e = etapas.find(x => x.tipo === 'perdida'); if (e) moverEtapa.mutate(e.id); }}>
              <XCircle className="w-3 h-3" /> Perdido
            </Button>
          </div>
        </div>
      </CardSection>

      {/* Card Responsável */}
      <CardSection title="Responsável" icon={User} color="purple">
        {responsavel ? (
          <div className="flex items-center gap-3">
            {responsavel.foto_perfil ? (
              <img src={responsavel.foto_perfil} alt="" className="w-14 h-14 rounded-full object-cover flex-shrink-0" />
            ) : (
              <div className="w-14 h-14 rounded-full bg-[#1e3a5f] flex items-center justify-center text-white font-bold text-lg flex-shrink-0">
                {(responsavel.nome || '?').charAt(0).toUpperCase()}
              </div>
            )}
            <div>
              <p className="font-semibold text-slate-800">{responsavel.nome}</p>
              <p className="text-xs text-slate-400 capitalize">{responsavel.perfil}</p>
              {responsavel.telefone && (
                <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1">
                  <Phone className="w-3 h-3" /> {responsavel.telefone}
                </p>
              )}
              {responsavel.email && (
                <p className="text-xs text-slate-500">{responsavel.email}</p>
              )}
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-slate-200 flex items-center justify-center text-slate-400 text-lg font-bold">
              {(oportunidade.vendedor_nome || '?').charAt(0).toUpperCase()}
            </div>
            <div>
              <p className="font-semibold text-slate-800">{oportunidade.vendedor_nome || '-'}</p>
            </div>
          </div>
        )}
      </CardSection>

      {/* Observações - full width */}
      <div className="md:col-span-2 xl:col-span-3">
        <Card className="overflow-hidden border shadow-sm">
          <div className="px-4 py-3 border-b bg-orange-50 text-orange-700 border-orange-200 flex items-center justify-between">
            <span className="font-semibold text-sm flex items-center gap-2">
              <Tag className="w-4 h-4" /> Observações
            </span>
            {!editandoObservacao && (
              <button onClick={() => setEditandoObservacao(true)} className="text-xs text-orange-600 hover:text-orange-800 underline">
                Editar
              </button>
            )}
          </div>
          <div className="p-4">
            {editandoObservacao ? (
              <div className="space-y-2">
                <textarea
                  className="w-full border rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-300 min-h-[80px] resize-none"
                  value={observacao}
                  onChange={e => setObservacao(e.target.value)}
                  autoFocus
                />
                <div className="flex gap-2">
                  <Button size="sm" className="h-8 bg-[#1e3a5f]" onClick={salvarObservacao}>Salvar</Button>
                  <Button size="sm" variant="outline" className="h-8" onClick={() => setEditandoObservacao(false)}>Cancelar</Button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
                {oportunidade.observacoes || <span className="text-slate-400 italic">Nenhuma observação registrada</span>}
              </p>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}