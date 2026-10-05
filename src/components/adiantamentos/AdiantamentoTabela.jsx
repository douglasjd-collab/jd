import React from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Paperclip, Pencil, XCircle, Upload } from 'lucide-react';
import {
  fmt, fmtData, STATUS_BADGE, STATUS_LABEL, tipoBadgeClass, nomeRecebedor,
  labelTipoRecebedor, inicialRecebedor, parseComprovantes, valoresAdiantamento,
} from './adiantamentoHelpers';

export default function AdiantamentoTabela({ adiantamentos = [], podeGerenciar = false, onAbrir, onEditar, onAnexar, onCancelar }) {
  return (
    <Card className="hidden lg:block overflow-hidden">
      <Table className="text-sm">
        <TableHeader>
          <TableRow className="bg-slate-50">
            <TableHead className="w-24">Data</TableHead>
            <TableHead>Recebedor</TableHead>
            <TableHead className="w-32">Tipo</TableHead>
            <TableHead>Motivo</TableHead>
            <TableHead className="text-right w-28">Adiantado</TableHead>
            <TableHead className="text-right w-32">Descontado</TableHead>
            <TableHead className="text-right w-32">Saldo pendente</TableHead>
            <TableHead className="w-28">Status</TableHead>
            <TableHead className="w-28">Comprovantes</TableHead>
            <TableHead className="w-28 text-right">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {adiantamentos.map(a => {
            const nome = nomeRecebedor(a);
            const valores = valoresAdiantamento(a);
            const anexos = parseComprovantes(a);
            return (
              <TableRow key={a.id} className="cursor-pointer hover:bg-slate-50" onClick={() => onAbrir(a)}>
                <TableCell className="py-2 text-xs text-slate-600 whitespace-nowrap">{fmtData(a.data)}</TableCell>
                <TableCell className="py-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-7 h-7 rounded-full bg-slate-100 text-slate-700 text-xs font-bold flex items-center justify-center flex-shrink-0">
                      {inicialRecebedor(nome)}
                    </span>
                    <span className="font-medium text-slate-800 truncate max-w-[180px]" title={nome}>{nome}</span>
                  </div>
                </TableCell>
                <TableCell className="py-2">
                  <Badge className={`text-[11px] font-medium border-0 ${tipoBadgeClass(a.pessoa_tipo)}`}>
                    {labelTipoRecebedor(a)}
                  </Badge>
                </TableCell>
                <TableCell className="py-2 text-xs text-slate-600 max-w-[220px]">
                  <span className="truncate block" title={a.motivo || ''}>{a.motivo || '—'}</span>
                </TableCell>
                <TableCell className="py-2 text-right text-xs font-semibold text-slate-800 whitespace-nowrap">{fmt(valores.valorOriginal)}</TableCell>
                <TableCell className="py-2 text-right text-xs whitespace-nowrap">
                  <span className={valores.valorDescontado > 0 ? 'text-green-700 font-semibold' : 'text-slate-400'}>
                    {fmt(valores.valorDescontado)}
                  </span>
                  {valores.descontoParcial && (
                    <Badge className="ml-1.5 text-[10px] font-medium border-0 bg-orange-100 text-orange-700 align-middle">parcial</Badge>
                  )}
                  {!valores.descontoParcial && valores.valorDescontado > 0 && a.data_desconto && (
                    <p className="text-[10px] text-slate-400">{fmtData(a.data_desconto)}</p>
                  )}
                </TableCell>
                <TableCell className="py-2 text-right text-xs whitespace-nowrap">
                  {a.status === 'cancelado' ? (
                    <span className="text-slate-400">—</span>
                  ) : (
                    <span className={valores.saldoPendente > 0 ? 'text-orange-700 font-bold' : 'text-slate-400'}>{fmt(valores.saldoPendente)}</span>
                  )}
                </TableCell>
                <TableCell className="py-2">
                  <Badge className={`text-[11px] font-medium border ${STATUS_BADGE[a.status] || ''}`}>
                    {STATUS_LABEL[a.status] || a.status}
                  </Badge>
                </TableCell>
                <TableCell className="py-2">
                  {anexos.length > 0 ? (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-600">
                      <Paperclip className="w-3.5 h-3.5" /> {anexos.length}
                    </span>
                  ) : (
                    <span className="text-[11px] text-slate-400">Sem comprovante</span>
                  )}
                </TableCell>
                <TableCell className="py-2 text-right whitespace-nowrap" onClick={e => e.stopPropagation()}>
                  <div className="flex items-center justify-end gap-0.5">
                    {podeGerenciar && (
                      <>
                        <Button variant="ghost" size="icon" className="h-7 w-7" title="Editar" onClick={() => onEditar(a)}>
                          <Pencil className="w-3.5 h-3.5 text-slate-600" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" title="Anexar comprovante" onClick={() => onAnexar(a)}>
                          <Upload className="w-3.5 h-3.5 text-slate-600" />
                        </Button>
                        {a.status === 'pendente' && (
                          <Button variant="ghost" size="icon" className="h-7 w-7" title="Cancelar" onClick={() => onCancelar(a)}>
                            <XCircle className="w-3.5 h-3.5 text-red-500" />
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </Card>
  );
}