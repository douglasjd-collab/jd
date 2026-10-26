import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

export function permiteLigacaoWhatsapp(conexao) {
  return conexao?.provider_type === 'dapi' && conexao.is_active !== false &&
    conexao.status === 'conectado' && Boolean(conexao.session_id?.trim()) &&
    !/^cloud-/i.test(conexao.session_id.trim());
}

export default function EscolherConexaoLigacao({ conversa, empresaId, aoFechar, aoLigar }) {
  const [conexoes, setConexoes] = useState([]);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');
  const [tentativa, setTentativa] = useState(0);
  useEffect(() => {
    if (!conversa || !empresaId) return;
    let ativo = true;
    setCarregando(true); setErro(''); setConexoes([]);
    base44.entities.WhatsappConnection.filter({ empresa_id: empresaId, provider_type: 'dapi', is_active: true }, '-created_date', 100)
      .then(resultado => { if (ativo) setConexoes((Array.isArray(resultado) ? resultado : resultado?.items || []).filter(permiteLigacaoWhatsapp)); })
      .catch(() => { if (ativo) setErro('Não foi possível consultar as conexões.'); })
      .finally(() => { if (ativo) setCarregando(false); });
    return () => { ativo = false; };
  }, [conversa, empresaId, tentativa]);
  return <Dialog open={Boolean(conversa)} onOpenChange={aberto => { if (!aberto) aoFechar(); }}>
    <DialogContent>
      <DialogTitle>Ligar pelo WhatsApp</DialogTitle>
      <DialogDescription>Escolha o número de origem para ligar para {conversa?.cliente_nome || conversa?.cliente_telefone}. As mensagens continuam no canal atual.</DialogDescription>
      {carregando ? <p role="status">Consultando conexões...</p> : erro ? <><p role="alert">{erro}</p><Button onClick={() => setTentativa(v => v + 1)}>Tentar novamente</Button></> :
        conexoes.length ? conexoes.map(conexao => <Button key={conexao.id} variant="outline" className="h-auto justify-start whitespace-normal p-3 text-left" onClick={() => { aoFechar(); aoLigar(conexao.id, conversa); }}>
          <span><span className="block font-semibold">{conexao.nome || 'WhatsApp conectado'}</span><span className="block text-xs">{conexao.phone_number || conexao.session_id}</span></span>
        </Button>) : <p role="status">Nenhuma conexão WhatsApp por QR Code está conectada para fazer ligações. Conecte-a na área de conexões.</p>}
    </DialogContent>
  </Dialog>;
}