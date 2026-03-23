import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || (user.role !== 'super_admin' && user.perfil !== 'super_admin' && user.perfil !== 'admin')) {
      return Response.json({ error: 'Acesso negado' }, { status: 403 });
    }

    // Obter empresa_id do usuário
    let empresaId = null;
    if (user.role === 'super_admin') {
      const empresas = await base44.asServiceRole.entities.Empresa.filter({ status: 'ativa' });
      if (empresas.length > 0) empresaId = empresas[0].id;
    } else {
      const colabs = await base44.entities.Colaborador.filter({ user_id: user.id, status: 'ativo' });
      if (colabs.length > 0) empresaId = colabs[0].empresa_id;
    }

    if (!empresaId) {
      return Response.json({ error: 'Empresa não encontrada' }, { status: 400 });
    }

    // Verificar se status já existe
    const statusExistentes = await base44.entities.StatusProposta.filter({ 
      empresa_id: empresaId,
      ativo: true 
    });

    const novosStatus = [];
    
    // Verificar e criar status "aguardando_aprovacao"
    if (!statusExistentes.find(s => s.codigo === 'aguardando_aprovacao')) {
      novosStatus.push({
        empresa_id: empresaId,
        codigo: 'aguardando_aprovacao',
        nome: 'Aguardando Aprovação',
        cor: 'blue',
        ordem: statusExistentes.length + 1,
        ativo: true
      });
    }

    // Verificar e criar status "docs_pendentes"
    if (!statusExistentes.find(s => s.codigo === 'docs_pendentes')) {
      novosStatus.push({
        empresa_id: empresaId,
        codigo: 'docs_pendentes',
        nome: 'Doc. Pendentes',
        cor: 'yellow',
        ordem: statusExistentes.length + 2,
        ativo: true
      });
    }

    if (novosStatus.length === 0) {
      return Response.json({ message: 'Status já existem' }, { status: 200 });
    }

    // Criar novos status
    for (const status of novosStatus) {
      await base44.entities.StatusProposta.create(status);
    }

    return Response.json({ 
      success: true, 
      message: `${novosStatus.length} status criados com sucesso`,
      statusCriados: novosStatus
    });
  } catch (error) {
    console.error('Erro:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});