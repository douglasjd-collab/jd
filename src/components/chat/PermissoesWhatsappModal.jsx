import React, { useCallback, useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Star, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';

// Acesso ao WhatsApp por colaborador e por conexão. Somente administradores
// enxergam esta tela; a gravação é validada no backend (modo 'salvar').
const NIVEIS = [
  { valor: 'sem_acesso', rotulo: 'Sem acesso' },
  { valor: 'atribuidas', rotulo: 'Somente atribuídas' },
  { valor: 'todas', rotulo: 'Todas da conexão' },
];

const chave = (colaboradorId, connectionId) => `${colaboradorId}|${connectionId}`;

export default function PermissoesWhatsappModal({ open, onOpenChange, empresaId }) {
  const [carregando, setCarregando] = useState(false);
  const [salvando, setSalvando] = useState('');
  const [colaboradores, setColaboradores] = useState([]);
  const [conexoes, setConexoes] = useState([]);
  const [permissoes, setPermissoes] = useState({});

  const carregar = useCallback(async () => {
    if (!empresaId) return;
    setCarregando(true);
    try {
      const resp = await base44.functions.invoke('permissoesWhatsapp', { modo: 'matriz', empresa_id: empresaId });
      const dados = resp?.data || {};
      setColaboradores(dados.colaboradores || []);
      setConexoes(dados.conexoes || []);
      const mapa = {};
      (dados.permissoes || []).forEach(p => {
        mapa[chave(p.colaborador_id, p.connection_id)] = p;
      });
      setPermissoes(mapa);
    } catch (e) {
      toast.error('Erro ao carregar permissões: ' + (e?.response?.data?.error || e.message || ''));
    } finally {
      setCarregando(false);
    }
  }, [empresaId]);

  useEffect(() => {
    if (open) void carregar();
  }, [open, carregar]);

  const salvar = async (colaborador, conexao, nivel, responsavelPadrao) => {
    const id = chave(colaborador.id, conexao.id);
    setSalvando(id);
    try {
      await base44.functions.invoke('permissoesWhatsapp', {
        modo: 'salvar',
        empresa_id: empresaId,
        colaborador_id: colaborador.id,
        connection_id: conexao.id,
        nivel_acesso: nivel,
        responsavel_padrao: responsavelPadrao,
      });
      setPermissoes(prev => ({
        ...prev,
        [id]: {
          colaborador_id: colaborador.id,
          connection_id: conexao.id,
          nivel_acesso: nivel,
          responsavel_padrao: responsavelPadrao,
        },
      }));
      if (responsavelPadrao) {
        setPermissoes(prev => {
          const proximo = { ...prev };
          Object.keys(proximo).forEach(k => {
            const p = proximo[k];
            if (p.connection_id === conexao.id && p.colaborador_id !== colaborador.id) {
              proximo[k] = { ...p, responsavel_padrao: false };
            }
          });
          return proximo;
        });
      }
      toast.success(`${colaborador.nome} · ${conexao.nome || conexao.session_id}: permissão atualizada`);
    } catch (e) {
      toast.error('Erro ao salvar: ' + (e?.response?.data?.error || e.message || ''));
    } finally {
      setSalvando('');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl w-[calc(100vw-24px)] max-h-[calc(100dvh-40px)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-emerald-600" />
            Permissões do WhatsApp
          </DialogTitle>
          <DialogDescription>
            Defina, por colaborador e por conexão, quem vê somente as conversas atribuídas, quem vê todas e quem não
            tem acesso. A estrela marca quem recebe as novas conversas daquela conexão.
          </DialogDescription>
        </DialogHeader>

        {carregando ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando permissões...
          </div>
        ) : conexoes.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-500">Nenhuma conexão de WhatsApp cadastrada.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="sticky left-0 z-10 bg-slate-50 px-3 py-2 text-left text-xs font-semibold text-slate-600">
                    Colaborador
                  </th>
                  {conexoes.map(conexao => (
                    <th key={conexao.id} className="px-3 py-2 text-left text-xs font-semibold text-slate-600">
                      <span className="block">{conexao.nome || conexao.session_id}</span>
                      <span className="block text-[11px] font-normal text-slate-400">
                        {conexao.phone_number || conexao.session_id || conexao.provider_type || ''}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {colaboradores.map(colaborador => (
                  <tr key={colaborador.id} className="border-t">
                    <td className="sticky left-0 z-10 bg-white px-3 py-2">
                      <span className="block font-medium text-slate-800">{colaborador.nome}</span>
                      <span className="block text-[11px] text-slate-400">{colaborador.email}</span>
                    </td>
                    {conexoes.map(conexao => {
                      const id = chave(colaborador.id, conexao.id);
                      const atual = permissoes[id] || { nivel_acesso: 'sem_acesso', responsavel_padrao: false };
                      return (
                        <td key={conexao.id} className="px-3 py-2">
                          <div className="flex items-center gap-1.5">
                            <Select
                              value={atual.nivel_acesso}
                              onValueChange={valor => salvar(colaborador, conexao, valor, atual.responsavel_padrao === true)}
                              disabled={salvando === id}
                            >
                              <SelectTrigger className="h-8 w-[170px] text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {NIVEIS.map(nivel => (
                                  <SelectItem key={nivel.valor} value={nivel.valor}>
                                    {nivel.rotulo}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <button
                              type="button"
                              title={atual.responsavel_padrao ? 'Responsável padrão das novas conversas' : 'Definir como responsável padrão'}
                              disabled={salvando === id || atual.nivel_acesso === 'sem_acesso'}
                              onClick={() => salvar(colaborador, conexao, atual.nivel_acesso, atual.responsavel_padrao !== true)}
                              className={`rounded p-1 disabled:opacity-30 ${atual.responsavel_padrao ? 'text-amber-500' : 'text-slate-300 hover:text-amber-500'}`}
                            >
                              <Star className={`h-4 w-4 ${atual.responsavel_padrao ? 'fill-amber-500' : ''}`} />
                            </button>
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="text-xs text-slate-500">
          Conversas não aparecem em outra conexão: quem atende o número A não vê o histórico do número B. Transferir o
          atendimento pelo Bate-papo mantém a conexão e o histórico e concede acesso apenas àquela conversa.
        </p>
      </DialogContent>
    </Dialog>
  );
}