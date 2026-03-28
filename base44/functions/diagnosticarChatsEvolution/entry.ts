import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const evUrl = Deno.env.get('EVOLUTION_API_URL');
    const evKey = Deno.env.get('EVOLUTION_API_KEY');
    const instancia = Deno.env.get('EVOLUTION_INSTANCE_NAME') || 'JDPROMOTORA';

    console.log(`\n🔍 DIAGNÓSTICO DA EVOLUTION API`);
    console.log(`URL: ${evUrl}`);
    console.log(`Instância: ${instancia}`);
    console.log(`Key configurada: ${evKey ? 'SIM' : 'NÃO'}`);
    console.log(`${'='.repeat(80)}\n`);

    // Test 1: Buscar chats com findAll
    console.log('[TESTE 1] GET /chats/findAll/{instancia}');
    try {
      const urlFindAll = `${evUrl}/chats/findAll/${instancia}`;
      console.log(`URL: ${urlFindAll}`);
      const respFindAll = await fetch(urlFindAll, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${evKey}`,
          'Content-Type': 'application/json',
        },
      });
      const dataFindAll = await respFindAll.text();
      console.log(`Status: ${respFindAll.status}`);
      console.log(`Response: ${dataFindAll.slice(0, 500)}`);
      console.log('');
    } catch (err) {
      console.log(`Erro: ${err.message}\n`);
    }

    // Test 2: Buscar conversas com list
    console.log('[TESTE 2] GET /chats/list/{instancia}');
    try {
      const urlList = `${evUrl}/chats/list/${instancia}`;
      console.log(`URL: ${urlList}`);
      const respList = await fetch(urlList, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${evKey}`,
          'Content-Type': 'application/json',
        },
      });
      const dataList = await respList.text();
      console.log(`Status: ${respList.status}`);
      console.log(`Response: ${dataList.slice(0, 500)}`);
      console.log('');
    } catch (err) {
      console.log(`Erro: ${err.message}\n`);
    }

    // Test 3: Buscar contatos
    console.log('[TESTE 3] GET /contacts/all/{instancia}');
    try {
      const urlContacts = `${evUrl}/contacts/all/${instancia}`;
      console.log(`URL: ${urlContacts}`);
      const respContacts = await fetch(urlContacts, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${evKey}`,
          'Content-Type': 'application/json',
        },
      });
      const dataContacts = await respContacts.text();
      console.log(`Status: ${respContacts.status}`);
      console.log(`Response: ${dataContacts.slice(0, 500)}`);
      console.log('');
    } catch (err) {
      console.log(`Erro: ${err.message}\n`);
    }

    // Test 4: Status da instância
    console.log('[TESTE 4] GET /instance/fetchInstances');
    try {
      const urlInstances = `${evUrl}/instance/fetchInstances`;
      console.log(`URL: ${urlInstances}`);
      const respInstances = await fetch(urlInstances, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${evKey}`,
          'Content-Type': 'application/json',
        },
      });
      const dataInstances = await respInstances.text();
      console.log(`Status: ${respInstances.status}`);
      console.log(`Response: ${dataInstances.slice(0, 500)}`);
      console.log('');
    } catch (err) {
      console.log(`Erro: ${err.message}\n`);
    }

    console.log(`${'='.repeat(80)}\n`);

    return Response.json({
      success: true,
      message: 'Diagnóstico concluído - verifique os logs',
    });

  } catch (error) {
    console.error('Erro:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});