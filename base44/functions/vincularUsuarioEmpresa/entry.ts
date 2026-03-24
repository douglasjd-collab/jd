import { createClientFromRequest } from "npm:@base44/sdk@0.8.6";

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    // Buscar empresa "JD promotora"
    const empresas = await base44.asServiceRole.entities.Empresa.filter({
      nome: { $regex: "JD|promotora", $options: "i" }
    });

    if (!empresas?.length) {
      return Response.json({
        error: "Empresa 'JD promotora' não encontrada",
        hint: "Verifique o nome da empresa em Empresas"
      }, { status: 400 });
    }

    const empresa = empresas[0];

    // Buscar Colaborador existente
    const colabs = await base44.asServiceRole.entities.Colaborador.filter({
      user_id: user.id,
      empresa_id: empresa.id
    });

    const dados = {
      user_id: user.id,
      nome: user.full_name,
      email: user.email,
      perfil: "admin",
      empresa_id: empresa.id,
      empresa_nome: empresa.nome,
      status: "ativo",
      codigo_vendedor: "0000022393"
    };

    let resultado;
    if (colabs?.length) {
      // Atualizar existente
      await base44.asServiceRole.entities.Colaborador.update(colabs[0].id, dados);
      resultado = "Colaborador atualizado";
    } else {
      // Criar novo
      await base44.asServiceRole.entities.Colaborador.create(dados);
      resultado = "Colaborador criado";
    }

    return Response.json({
      success: true,
      message: resultado,
      usuario: user.email,
      empresa: empresa.nome,
      empresa_id: empresa.id,
      perfil: "admin"
    });
  } catch (error) {
    return Response.json(
      { error: error?.message || String(error) },
      { status: 500 }
    );
  }
});