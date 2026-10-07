import jsPDF from 'jspdf';
import { pago, saldo, descontosTotal, moeda } from './folhaCalculos';
const fmt = v => moeda(v).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const dataBR = s => s ? s.split('-').reverse().join('/') : '—';
export async function gerarContracheque(f,c,e) {
 const doc=new jsPDF(); const teal=[16,53,60]; const green=[27,139,105];
 let y=18;
 const texto=(s,x,yy,size=10,bold=false,color=[45,55,65],opts={})=>{doc.setFont('helvetica',bold?'bold':'normal');doc.setFontSize(size);doc.setTextColor(...color);doc.text(Array.isArray(s)?s:String(s||'—'),x,yy,opts);};
 const bloco=(s,x,yy,w,size=10)=>{doc.setFontSize(size);const linhas=doc.splitTextToSize(String(s||'—'),w);texto(linhas,x,yy,size);return linhas.length*size*0.4;};
 const pagina=altura=>{if(y+altura>265){doc.addPage();y=22;}};
 doc.setFillColor(...teal);doc.rect(0,0,210,48,'F');
 let logo=false;
 const logoUrl=e.logo_url || 'https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/6950a9860c8af0e2ff10fc9e/1b5f2d0a1_JDPromotoraICON3.png';
 if(logoUrl) {
  try {
   const img=await new Promise((resolve,reject)=>{const i=new Image();i.crossOrigin='anonymous';const t=setTimeout(()=>reject(new Error('Logo indisponível')),8000);i.onload=()=>{clearTimeout(t);resolve(i);};i.onerror=()=>{clearTimeout(t);reject(new Error('Logo indisponível'));};i.src=logoUrl;});
   const canvas=document.createElement('canvas');canvas.width=img.width;canvas.height=img.height;canvas.getContext('2d').drawImage(img,0,0);
   const h=Math.min(28,30*img.height/img.width),w=h*img.width/img.height;
   doc.setFillColor(255,255,255);doc.roundedRect(14,9,36,32,3,3,'F');doc.addImage(canvas.toDataURL('image/png'),'PNG',17+(30-w)/2,11+(28-h)/2,w,h);logo=true;
  } catch { /* Identidade textual permanece se a imagem estiver indisponível. */ }
 }
 texto(e.nome_fantasia||e.nome||'JD PROMOTORA',logo?58:16,20,16,true,[255,255,255]);
 texto('CONTRACHEQUE',logo?58:16,31,10,false,[210,235,225]);
 texto('Competência '+f.mes_referencia,194,41,10,true,[255,255,255],{align:'right'});
 y=58;
 y+=bloco(e.nome,16,y,178,10)+2;
 texto('CNPJ: '+(e.cpf_cnpj||'Não informado'),16,y,9);y+=7;
 const endereco=[e.endereco_rua,e.endereco_numero,e.endereco_complemento,[e.endereco_cidade,e.endereco_estado].filter(Boolean).join('/'),e.endereco_cep && 'CEP '+e.endereco_cep].filter(Boolean).join(', ');
 y+=bloco(endereco||'Endereço não informado',16,y,178,9)+7;
 doc.setFillColor(241,245,249);doc.setFontSize(12);const nomeAltura=doc.splitTextToSize(String(f.colaborador_nome || '—'),174).length*4.8;
 doc.roundedRect(14,y-3,182,31+Math.max(0,nomeAltura-4.8),2,2,'F');
 y+=bloco(f.colaborador_nome,18,y+4,174,12)+8;
 texto('CPF: '+(c.cpf||'—'),18,y,9);texto('Admissão: '+dataBR(c.data_admissao),120,y,9);y+=7;
 y+=bloco('Cargo: '+(c.cargo||'—')+'  ·  Dias: '+(f.dias_trabalhados ?? 30),18,y,172,9)+12;
 const cabecalho=()=>{doc.setFillColor(...teal);doc.rect(14,y-5,182,9,'F');texto('Descrição',18,y,9,true,[255,255,255]);texto('Vencimentos',145,y,9,true,[255,255,255],{align:'right'});texto('Descontos',192,y,9,true,[255,255,255],{align:'right'});y+=10;};
 cabecalho();
 const itens=[['Salário base',f.salario_base,0],['Comissões',f.valor_comissao,0],['Bonificações',f.bonificacoes,0],['Adiantamentos anteriores',0,f.adiantamentos],
 ...(Array.isArray(f.descontos_itens)?f.descontos_itens.map(i=>[i.descricao,0,i.valor]):[['Outros descontos',0,f.descontos]]),['INSS',0,f.inss_valor]];
 for(const [nome,v,d] of itens){
  doc.setFontSize(9);const linhas=doc.splitTextToSize(String(nome||'Desconto'),90);const altura=Math.max(7,linhas.length*4+2);
  if(y+altura>260){doc.addPage();y=22;cabecalho();}
  texto(linhas,18,y,9);texto(fmt(v),145,y,9,false,[45,55,65],{align:'right'});texto(fmt(d),192,y,9,false,[45,55,65],{align:'right'});
  y+=altura;doc.setDrawColor(225,230,235);doc.line(14,y-5,196,y-5);
 }
 pagina(55);
 texto('Totais',18,y,10,true);texto(fmt(moeda(f.salario_base)+moeda(f.valor_comissao)+moeda(f.bonificacoes)),145,y,10,true,teal,{align:'right'});texto(fmt(moeda(f.adiantamentos)+descontosTotal(f)+moeda(f.inss_valor)),192,y,10,true,teal,{align:'right'});y+=12;
 for(const [i,label,v] of [[0,'LÍQUIDO DO MÊS',f.valor_liquido],[1,'PAGO',pago(f)],[2,'SALDO A PAGAR',saldo(f)]]){const x=14+i*62;doc.setFillColor(...(i===0?green:[241,245,249]));doc.roundedRect(x,y,58,24,2,2,'F');texto(label,x+4,y+8,8,true,i===0?[255,255,255]:teal);texto(fmt(v),x+4,y+18,12,true,i===0?[255,255,255]:teal);}
 y+=31;
 if(f.pagamentos?.length){pagina(15);texto('Pagamentos registrados',16,y,11,true,teal);y+=8;for(const p of f.pagamentos){pagina(10);texto(dataBR(p.data)+' · '+p.tipo,16,y,9);texto(fmt(p.valor),194,y,9,true,teal,{align:'right'});y+=8;}}
 if(f.observacoes){pagina(20);texto('Observações',16,y,10,true);y+=6;for(const linha of doc.splitTextToSize(f.observacoes,178)){pagina(6);texto(linha,16,y,9);y+=5;}y+=5;}
 pagina(30);y+=4;
 texto(pago(f)>0?'Recebimento dos valores registrados acima:':'Demonstrativo de valores. Pagamento ainda não registrado.',16,y,9);y+=16;
 doc.setDrawColor(...teal);doc.line(35,y,175,y);texto('Assinatura do funcionário',105,y+6,9,false,[100,110,120],{align:'center'});
 for(let p=1;p<=doc.getNumberOfPages();p++){doc.setPage(p);texto('JD Promotora · Contracheque · '+f.mes_referencia,16,285,8,false,[100,110,120]);texto(p+' / '+doc.getNumberOfPages(),194,285,8,false,[100,110,120],{align:'right'});}
 doc.save('contracheque_'+String(f.colaborador_nome||'funcionario').replace(/[^\p{L}\p{N}]+/gu,'_')+'_'+f.mes_referencia.replace('/','-')+'.pdf');
 return {logoCarregado:logo};
}