import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user || !['master', 'super_admin'].includes(user.perfil)) {
            return Response.json({ error: 'Apenas Master/Super Admin podem criar empresas' }, { status: 403 });
        }

        const { empresaData } = await req.json();

        // Gerar código automático EMP001, EMP002...
        const empresas = await base44.asServiceRole.entities.Empresa.list('-created_date', 1);
        let proximoNumero = 1;
        
        if (empresas.length > 0 && empresas[0].codigo) {
            const ultimoCodigo = empresas[0].codigo;
            const numeroAtual = parseInt(ultimoCodigo.replace('EMP', '')) || 0;
            proximoNumero = numeroAtual + 1;
        }

        const novoCodigo = `EMP${String(proximoNumero).padStart(3, '0')}`;

        // Criar empresa com código gerado
        const novaEmpresa = await base44.asServiceRole.entities.Empresa.create({
            ...empresaData,
            codigo: novoCodigo,
            status: empresaData.status || 'ativa'
        });

        // Log de auditoria
        await base44.asServiceRole.entities.LogAuditoria.create({
            usuario_id: user.id,
            usuario_nome: user.full_name,
            acao: `Criou empresa ${novaEmpresa.nome} (${novoCodigo})`,
            entidade: 'Empresa',
            entidade_id: novaEmpresa.id,
            tipo: 'criacao',
            dados_novos: JSON.stringify(novaEmpresa)
        });

        return Response.json({ success: true, empresa: novaEmpresa });
    } catch (error) {
        console.error('Erro ao criar empresa:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});