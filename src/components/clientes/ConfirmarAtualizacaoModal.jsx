import React from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertTriangle, CheckCircle2, Edit3 } from 'lucide-react';

/**
 * Exibido quando o CPF lido nos documentos já existe no CRM.
 * Mostra prévia dos campos VAZIOS que serão preenchidos e pede confirmação.
 * Nenhum campo já preenchido será substituído.
 *
 * Props:
 *  - open, onOpenChange
 *  - clienteExistente (objeto)
 *  - camposPreencher (array [{campo, label, valorNovo, confianca, origem}])  // apenas vazios
 *  - onConfirmar, onRevisar, onCancelar
 */
export default function ConfirmarAtualizacaoModal({
  open, onOpenChange, clienteExistente, camposPreencher, onConfirmar, onRevisar, onCancelar
}) {
  if (!clienteExistente) return null;
  const nome = clienteExistente.nome_completo || clienteExistente.pj_razao_social || 'Cliente';
  const cpf = clienteExistente.cpf || clienteExistente.pj_cnpj || '';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-500" />
            Cliente já cadastrado
          </DialogTitle>
          <DialogDescription>
            Foram encontradas novas informações nos documentos. O sistema preencherá somente os campos que ainda estão vazios.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-lg bg-slate-50 border p-3">
            <p className="text-sm font-medium text-slate-900">{nome}</p>
            <p className="text-xs text-slate-500">CPF: {cpf}</p>
            <p className="text-xs text-slate-500 mt-1">
              Não serão substituídos: telefone, e-mail, endereço já preenchidos, nem qualquer dado manual.
            </p>
          </div>

          <div>
            <p className="text-sm font-semibold text-slate-700 mb-2">
              {camposPreencher.length > 0
                ? 'Campos que serão preenchidos:'
                : 'Nenhum campo novo para preencher — todos já estão cadastrados.'}
            </p>
            {camposPreencher.length > 0 && (
              <div className="border rounded-lg overflow-hidden max-h-[40vh] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-100 sticky top-0">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium">Campo</th>
                      <th className="text-left px-3 py-2 font-medium">Valor do documento</th>
                      <th className="text-left px-3 py-2 font-medium">Confiança</th>
                      <th className="text-left px-3 py-2 font-medium">Origem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {camposPreencher.map((c, i) => (
                      <tr key={i} className="border-t">
                        <td className="px-3 py-2 text-slate-700">{c.label}</td>
                        <td className="px-3 py-2 font-mono text-xs text-slate-900">{c.valorNovo}</td>
                        <td className="px-3 py-2">
                          <span className={`text-xs px-1.5 py-0.5 rounded ${
                            c.confianca === 'alta' ? 'bg-emerald-100 text-emerald-700' :
                            c.confianca === 'media' ? 'bg-amber-100 text-amber-700' :
                            'bg-red-100 text-red-700'
                          }`}>{c.confianca}</span>
                        </td>
                        <td className="px-3 py-2 text-xs text-slate-500">{c.origem}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
            <p className="text-xs text-amber-900">
              Caso algum documento traga uma informação diferente de um campo já preenchido, ela será destacada para conferência manual — sem alteração automática.
            </p>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={onCancelar}>Cancelar</Button>
          <Button variant="secondary" onClick={onRevisar} className="gap-1">
            <Edit3 className="w-4 h-4" /> Revisar dados
          </Button>
          <Button onClick={onConfirmar} className="gap-1 bg-emerald-600 hover:bg-emerald-700">
            <CheckCircle2 className="w-4 h-4" /> Confirmar atualização
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}