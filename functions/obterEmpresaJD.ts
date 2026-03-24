import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    // Buscar JD Promotora especificamente
    const jd = await base44.asServiceRole.entities.Empresa.filter(
      { nome: { $regex: 'JD.*Promotora' } },
      '-created_date',
      1
    );
    
    if (!jd || jd.length === 0) {
      // Tentar busca alternativa
      const todas = await base44.asServiceRole.entities.Empresa.filter({}, '-created_date', 100);
      const encontrada = todas.find(e => 
        e.nome.includes('JD') && 
        e.email_admin === 'douglas.jdpromotora@gmail.com'
      );
      
      if (encontrada) {
        return Response.json({
          success: true,
          empresa_id: encontrada.id,
          nome: encontrada.nome,
          email_admin: encontrada.email_admin,
          instance: encontrada.evolution_instance_name
        });
      }
    }
    
    return Response.json({
      success: true,
      empresa_id: jd?.[0]?.id,
      nome: jd?.[0]?.nome,
      email_admin: jd?.[0]?.email_admin,
      instance: jd?.[0]?.evolution_instance_name
    });
    
  } catch (error) {
    console.error('Erro:', error.message);
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
});