import React from 'react';
import PageHeader from '@/components/ui/PageHeader';
import ImportarPlanosCanopusPDF from '@/components/planos/ImportarPlanosCanopusPDF';

export default function ImportacaoPlanos() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Importação de Planos"
        subtitle="Importe planos de consórcio via PDF com extração automática"
        backTo="Importacao"
      />

      <ImportarPlanosCanopusPDF 
        open={true} 
        onOpenChange={() => {}}
        standalone={true}
      />
    </div>
  );
}