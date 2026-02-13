import React from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

export default function DataTable({ 
  columns, 
  data, 
  isLoading, 
  emptyMessage = 'Nenhum registro encontrado',
  onRowClick,
  onRowDoubleClick,
  className 
}) {
  if (isLoading) {
    return (
      <Card className={cn("border-0 shadow-sm overflow-hidden", className)}>
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50">
              {columns.map((col, i) => (
                <TableHead key={i} className="font-semibold text-slate-700">
                  {col.header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {[...Array(5)].map((_, i) => (
              <TableRow key={i}>
                {columns.map((_, j) => (
                  <TableCell key={j}>
                    <Skeleton className="h-4 w-full" />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    );
  }

  if (!data || data.length === 0) {
    return (
      <Card className={cn("border-0 shadow-sm p-12 text-center", className)}>
        <p className="text-slate-500">{emptyMessage}</p>
      </Card>
    );
  }

  return (
    <Card className={cn("border-0 shadow-sm overflow-hidden", className)}>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50 hover:bg-slate-50">
              {columns.map((col, i) => (
                <TableHead 
                  key={i} 
                  className={cn("font-semibold text-slate-700", col.className)}
                >
                  {col.header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((row, i) => (
              <TableRow 
                key={row.id || i}
                onClick={() => onRowClick?.(row)}
                onDoubleClick={() => onRowDoubleClick?.(row)}
                className={cn(
                  "transition-colors",
                  (onRowClick || onRowDoubleClick) && "cursor-pointer hover:bg-slate-50"
                )}
              >
                {columns.map((col, j) => (
                  <TableCell key={`${row.id || i}-col-${j}`} className={col.cellClassName}>
                    {col.cell ? col.cell(row) : row[col.accessor]}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}