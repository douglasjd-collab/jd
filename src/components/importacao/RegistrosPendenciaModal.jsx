import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';

const fmtMoeda = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
const fmtData = (v) => (v ? format(new Date(`${v}T00:00:00`), 'dd/MM/yyyy') : '-');

export default function RegistrosPendenciaModal({ open, onClose, pendencia }) {
  if (!pendencia) return null;

  let registros = [];
  try { registros = JSON.parse(pendencia.registros_json || '[]'); } catch { registros = []; }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Registros afetados</DialogTitle>
          <DialogDescription>
            Descrição recebida: <span className="font-medium text-slate-700">{pendencia.descricao_original}</span>
            {pendencia.origem ? <> • Origem: <span className="font-medium text-slate-700">{pendencia.origem}</span></> : null}
            {' '}• {registros.length} registro(s)
          </DialogDescription>
        </DialogHeader>

        {registros.length === 0 ? (
          <p className="text-sm text-slate-500 py-6 text-center">Nenhum registro vinculado a esta pendência.</p>
        ) : (
          <div className="border rounded-xl overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Contrato</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Recebimento</TableHead>
                  <TableHead className="text-right">Valor recebido</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {registros.map((r, i) => (
                  <TableRow key={r.recebimento_id || i}>
                    <TableCell className="font-mono text-xs">{r.contrato || '-'}</TableCell>
                    <TableCell className="max-w-[200px] truncate">{r.cliente_nome || '-'}</TableCell>
                    <TableCell>{fmtData(r.data_recebimento)}</TableCell>
                    <TableCell className="text-right">{fmtMoeda(r.valor_recebido)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        <div className="flex items-center gap-2 text-xs text-slate-500">
          <Badge variant="outline" className="text-[10px]">Nenhum valor financeiro é alterado</Badge>
          <span>A vinculação atualiza apenas o tipo do empréstimo das propostas.</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}