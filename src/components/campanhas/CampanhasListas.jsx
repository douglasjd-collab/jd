import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Megaphone, Upload, Loader2, Users, Trash2, ChevronDown, ChevronRight, FileSpreadsheet, Inbox } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import ImportarListaModal from './ImportarListaModal';

const parseContatos = (json) => {
  if (!json) return [];
  try {
    const arr = JSON.parse(json);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
};

export default function CampanhasListas({ empresaId, user }) {
  const [open, setOpen] = useState(false);
  const [aberta, setAberta] = useState(null); // id da lista expandida
  const [deletandoId, setDeletandoId] = useState(null);
  const [expandidos, setExpandidos] = useState({}); // chave `listaId:clienteId` -> boolean
  const queryClient = useQueryClient();

  const toggleContato = (listaId, chave) => {
    const k = `${listaId}:${chave}`;
    setExpandidos((prev) => ({ ...prev, [k]: !prev[k] }));
  };

  const { data: listas = [], isLoading } = useQuery({
    queryKey: ['listas-contatos-importada', empresaId],
    enabled: !!empresaId,
    queryFn: async () => {
      const r = await base44.entities.ListaContatosImportada.filter(
        { empresa_id: empresaId, status: 'ativa' },
        '-data_importacao',
        100
      );
      return r || [];
    },
  });

  const podeGerenciar =
    user?.perfil === 'master' ||
    user?.perfil === 'super_admin' ||
    user?.perfil === 'admin' ||
    user?.perfil === 'gerente';

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ['listas-contatos-importada', empresaId] });

  const handleDelete = async (lista) => {
    if (!confirm(`Excluir a lista "${lista.nome}"? Os contatos cadastrados no CRM não serão removidos.`)) return;
    setDeletandoId(lista.id);
    try {
      await base44.entities.ListaContatosImportada.update(lista.id, { status: 'arquivada' });
      toast.success('Lista excluída.');
      refresh();
    } catch (e) {
      toast.error('Erro ao excluir: ' + (e.message || ''));
    } finally {
      setDeletandoId(null);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-slate-800 flex items-center gap-2">
            <Users className="w-5 h-5 text-emerald-600" /> Listas de Contatos
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Importe planilhas Excel (.xlsx) com nome, CPF, telefone e, se houver, email.
            Os contatos são salvos no CRM e ficam disponíveis no Público das campanhas.
          </p>
        </div>
        {podeGerenciar && (
          <Button onClick={() => setOpen(true)} className="bg-emerald-600 hover:bg-emerald-700">
            <Upload className="w-4 h-4 mr-1.5" /> Importar nova lista
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-slate-400">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      ) : listas.length === 0 ? (
        <div className="border border-dashed border-slate-300 bg-slate-50 rounded-2xl py-14 px-6 text-center">
          <Inbox className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <h3 className="text-base font-semibold text-slate-700">Nenhuma lista importada</h3>
          <p className="text-sm text-slate-500 mt-1 max-w-md mx-auto">
            Clique em <span className="font-medium text-emerald-700">Importar nova lista</span> para enviar uma planilha
            Excel (.xlsx) com as colunas Nome, CPF e Telefone (Email opcional).
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {listas.map((l) => {
            const contatos = parseContatos(l.contatos_json);
            const isOpen = aberta === l.id;
            const totalReais = l.total_contatos ?? contatos.length;
            return (
              <div key={l.id} className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                <div className="flex items-center gap-3 px-4 py-3">
                  <div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center flex-shrink-0">
                    <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
                  </div>
                  <button
                    type="button"
                    onClick={() => setAberta(isOpen ? null : l.id)}
                    className="flex-1 min-w-0 text-left flex items-center gap-2"
                  >
                    {isOpen ? (
                      <ChevronDown className="w-4 h-4 text-slate-400 flex-shrink-0" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-slate-400 flex-shrink-0" />
                    )}
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-800 truncate">{l.nome}</p>
                      <p className="text-xs text-slate-500 truncate">
                        {totalReais} contato{totalReais !== 1 ? 's' : ''}
                        {l.total_telefones ? ` • ${l.total_telefones} telefone${l.total_telefones !== 1 ? 's' : ''}` : ''}
                        {l.arquivo_nome ? ` • ${l.arquivo_nome}` : ''}
                        {l.criado_por_nome ? ` • por ${l.criado_por_nome}` : ''}
                        {l.data_importacao
                          ? ` • ${format(new Date(l.data_importacao), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}`
                          : ''}
                      </p>
                    </div>
                  </button>
                  {podeGerenciar && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(l)}
                      disabled={deletandoId === l.id}
                      className="text-red-600 hover:text-red-700 hover:bg-red-50"
                      title="Excluir lista"
                    >
                      {deletandoId === l.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Trash2 className="w-4 h-4" />
                      )}
                    </Button>
                  )}
                </div>

                {isOpen && (
                  <div className="border-t border-slate-100 bg-slate-50/50">
                    {contatos.length === 0 ? (
                      <p className="text-sm text-slate-500 px-4 py-4">
                        Snapshot de contatos indisponível para esta lista.
                      </p>
                    ) : (
                      <div className="max-h-96 overflow-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-slate-100 text-slate-600 sticky top-0">
                            <tr>
                              <th className="text-left font-medium px-4 py-2">Nome</th>
                              <th className="text-left font-medium px-4 py-2">CPF</th>
                              <th className="text-left font-medium px-4 py-2">Telefones</th>
                              <th className="text-left font-medium px-4 py-2">Email</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {contatos.map((c, i) => {
                              const tels = Array.isArray(c.telefones) && c.telefones.length > 0
                                ? c.telefones
                                : (c.telefone ? [{ numero: c.telefone, is_principal: true }] : []);
                              const expandido = expandidos[`${l.id}:${c.cliente_id || i}`];
                              return (
                                <React.Fragment key={c.cliente_id || i}>
                                  <tr
                                    className={`hover:bg-white cursor-pointer ${tels.length > 1 ? '' : 'cursor-default'}`}
                                    onClick={() => tels.length > 1 && toggleContato(l.id, c.cliente_id || i)}
                                  >
                                    <td className="px-4 py-2 text-slate-800">
                                      <div className="flex items-center gap-1.5">
                                        {tels.length > 1 && (
                                          expandido ? <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                                                     : <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                                        )}
                                        {c.nome || '-'}
                                      </div>
                                    </td>
                                    <td className="px-4 py-2 text-slate-600">{c.cpf || '-'}</td>
                                    <td className="px-4 py-2 text-slate-600">
                                      <span className="inline-flex items-center gap-1.5">
                                        <span className="font-medium text-slate-700">{tels.length}</span>
                                        <span className="text-xs text-slate-400">telefone{tels.length !== 1 ? 's' : ''}</span>
                                      </span>
                                    </td>
                                    <td className="px-4 py-2 text-slate-600">{c.email || '-'}</td>
                                  </tr>
                                  {expandido && tels.length > 1 && (
                                    <tr className="bg-slate-50/70">
                                      <td colSpan={4} className="px-8 py-2">
                                        <div className="flex flex-col gap-1.5 text-xs">
                                          <p className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold">Telefones</p>
                                          {tels.map((t, ti) => (
                                            <div key={ti} className="flex items-center gap-2">
                                              <span className="font-mono text-slate-700">{t.numero}</span>
                                              {t.tipo && <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-200 text-slate-600">{t.tipo}</span>}
                                              {t.is_principal && <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 font-semibold">principal</span>}
                                            </div>
                                          ))}
                                        </div>
                                      </td>
                                    </tr>
                                  )}
                                </React.Fragment>
                              );
                            })}
                          </tbody>
                        </table>
                        {totalReais > contatos.length && (
                          <p className="text-xs text-slate-400 px-4 py-2 bg-white border-t border-slate-100">
                            Exibindo {contatos.length} de {totalReais} contatos (snapshot limitado à importação).
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <ImportarListaModal
        open={open}
        onOpenChange={setOpen}
        empresaId={empresaId}
        user={user}
        onImported={() => refresh()}
      />
    </div>
  );
}