import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export default function AvatarContato({ contato, className = "h-10 w-10" }) {
  const initials = (contato?.nome || contato?.telefone || "?")
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const hasPhoto = contato?.foto_url && contato.foto_url.trim().length > 0;

  if (hasPhoto) {
    console.log('✅ Avatar com foto:', { nome: contato.nome, foto_url: contato.foto_url });
  } else {
    console.log('⚠️ Avatar sem foto:', { nome: contato.nome, telefone: contato?.telefone });
  }

  return (
    <Avatar className={className}>
      {hasPhoto && (
        <AvatarImage 
          src={contato.foto_url} 
          alt={contato.nome}
          onError={() => console.warn('❌ Erro ao carregar imagem:', contato.foto_url)}
        />
      )}
      <AvatarFallback className="bg-gradient-to-br from-blue-500 to-purple-600 text-white text-xs font-semibold">
        {initials}
      </AvatarFallback>
    </Avatar>
  );
}