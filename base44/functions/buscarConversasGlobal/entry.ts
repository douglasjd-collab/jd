import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

const digitos = (v = '') => String(v).replace(/\D/g, '');
const normalizar = (v = '') => String(v).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const regexNome = (termo) => {
  const letras = {a:'[aáàâãä]',e:'[eéèêë]',i:'[iíìîï]',o:'[oóòôõö]',u:'[uúùûü]',c:'[cç]'};
  return [...normalizar(termo)].map(c => letras[c] || c.replace(/[.*+?^$\{\}()|[\]\\]/g, '\\$&')).join('');
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({error:'Unauthorized'}, {status:401});
    const {empresa_id, q = '', limit = 100} = await req.json();
    const termo = String(q).trim().slice(0,100);
    if (!empresa_id || termo.length < 2) return Response.json({conversas:[]});
    const max = Math.min(Math.max(Number(limit) || 100,1),300);
    const numero = digitos(termo);
    const nome = {$regex: regexNome(termo), $options:'i'};
    const filtroConversas = {$or:[
      {cliente_nome:nome},
      ...(numero ? [{cliente_telefone:{$regex:numero}}, {whatsapp_id:{$regex:numero}}] : [])
    ], empresa_id};
    const filtroContatos = {$or:[
      {nome},
      ...(numero ? [{telefone:{$regex:numero}}] : [])
    ], empresa_id};
    // Contexto do usuário mantém as permissões de acesso das entidades.
    const entities = base44.entities;
    const [diretas, contatos] = await Promise.all([
      entities.ConversaWhatsapp.filter(filtroConversas,'-data_ultima_mensagem',max),
      entities.ContatoWhatsapp.filter(filtroContatos,'-updated_date',max)
    ]);
    const telefones = [...new Set(contatos.map(c=>digitos(c.telefone)).filter(Boolean))];
    const porContatos = telefones.length ? await entities.ConversaWhatsapp.filter(
      {empresa_id,cliente_telefone:{$in:telefones}},'-data_ultima_mensagem',max
    ) : [];
    const unicas = [...new Map([...diretas,...porContatos].map(c=>[c.id,c])).values()]
      .sort((a,b)=>(b.data_ultima_mensagem || '').localeCompare(a.data_ultima_mensagem || '')).slice(0,max);
    const telefonesResultado = [...new Set(unicas.map(c=>digitos(c.cliente_telefone)).filter(Boolean))];
    const detalhes = telefonesResultado.length ? await entities.ContatoWhatsapp.filter(
      {empresa_id,telefone:{$in:telefonesResultado}},'-updated_date',max
    ) : [];
    const porTelefone = new Map();
    for(const c of [...detalhes,...contatos]) {
      const tel=digitos(c.telefone);
      if(!porTelefone.has(tel)) porTelefone.set(tel,c);
    }
    return Response.json({conversas:unicas.map(c=>{
      const contato=porTelefone.get(digitos(c.cliente_telefone));
      return {...c,contato:contato?{id:contato.id,nome:contato.nome,telefone:contato.telefone,foto_url:contato.foto_url,tags_ids:contato.tags_ids||[]}:null};
    })});
  } catch(error) {
    return Response.json({error:error.message},{status:500});
  }
});
