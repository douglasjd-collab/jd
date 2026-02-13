import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  console.log('='.repeat(100));
  console.log('🧪 TESTE DE RECEBIMENTO DE MENSAGEM');
  console.log('='.repeat(100));

  try {
    // 1. Buscar empresa TESTE
    console.log('\n1️⃣ Buscando empresa TESTE...');
    const empresas = await base44.asServiceRole.entities.Empresa.filter({
      evolution_instance_name: 'TESTE'
    });
    
    let empresaId = null;
    if (empresas.length > 0) {
      empresaId = null; // Super admin
      console.log('✅ Empresa TESTE encontrada (super admin)');
    } else {
      console.log('⚠️ Nenhuma empresa com instance TESTE');
    }

    // 2. Criar conversa de teste
    console.log('\n2️⃣ Criando conversa de teste...');
    const telefoneTeste = '5521987654321';
    
    let conversa = await base44.asServiceRole.entities.ConversaWhatsapp.create({
      empresa_id: empresaId,
      cliente_telefone: telefoneTeste,
      cliente_nome: 'Teste Robot',
      status: 'ativa'
    });
    console.log('✅ Conversa criada:', conversa.id);

    // 3. Criar mensagem de teste
    console.log('\n3️⃣ Criando mensagem de teste...');
    const mensagem = await base44.asServiceRole.entities.MensagemWhatsapp.create({
      conversa_id: conversa.id,
      empresa_id: empresaId,
      remetente: 'cliente',
      tipo_conteudo: 'texto',
      texto: '🧪 Mensagem de teste - Se você vê isso no CRM, webhook está funcionando!',
      whatsapp_message_id: `TEST-${Date.now()}`,
      data_envio: new Date().toISOString(),
      status: 'entregue'
    });
    console.log('✅ Mensagem criada:', mensagem.id);

    // 4. Verificar se foi salva
    console.log('\n4️⃣ Verificando se mensagem foi salva no banco...');
    const verificacao = await base44.asServiceRole.entities.MensagemWhatsapp.filter({
      id: mensagem.id
    });
    
    if (verificacao.length > 0) {
      console.log('✅ MENSAGEM ENCONTRADA NO BANCO!');
      console.log('   Empresa ID:', verificacao[0].empresa_id);
      console.log('   Conversa ID:', verificacao[0].conversa_id);
      console.log('   Telefone:', telefoneTeste);
    } else {
      console.log('❌ MENSAGEM NÃO ENCONTRADA NO BANCO!');
    }

    // 5. Listar últimas mensagens
    console.log('\n5️⃣ Listando últimas 3 mensagens...');
    const ultimas = await base44.asServiceRole.entities.MensagemWhatsapp.list('-created_date', 3);
    console.log('Total mensagens:', ultimas.length);
    ultimas.forEach((msg, i) => {
      console.log(`  [${i+1}] ${msg.id.substring(0, 8)}... - ${msg.texto?.substring(0, 50)} (${msg.remetente})`);
    });

    console.log('\n' + '='.repeat(100));
    console.log('✅ TESTE CONCLUÍDO - Se a mensagem apareceu acima, o CRM está recebendo corretamente');
    console.log('❌ Se NÃO apareceu, há um problema na salva no banco de dados');
    console.log('='.repeat(100));

    return Response.json({
      success: true,
      mensagem_criada: {
        id: mensagem.id,
        conversa_id: conversa.id,
        texto: mensagem.texto
      },
      mensagem_verificada: verificacao.length > 0,
      total_mensagens: ultimas.length
    });

  } catch (error) {
    console.error('❌ ERRO NO TESTE:', error.message);
    return Response.json({
      success: false,
      error: error.message,
      stack: error.stack
    }, { status: 500 });
  }
});