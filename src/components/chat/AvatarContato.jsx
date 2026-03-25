import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export default function AvatarContato({ contato, className = "h-10 w-10" }) {
  const initials = (contato?.nome || contato?.telefone || "?")
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const hasPhoto = contato?.foto_url && contato.foto_url.trim().length > 0 && contato.foto_url !== 'undefined';

  return (
    <Avatar className={className}>
      {hasPhoto && (
        <AvatarImage 
          src={contato.foto_url} 
          alt={contato.nome || contato.telefone}
          onError={(e) => {
            console.warn('❌ Erro ao carregar imagem:', contato.foto_url);
            e.target.style.display = 'none';
          }}
        />
      )}
      <AvatarFallback className="bg-gradient-to-br from-blue-500 to-purple-600 text-white text-xs font-semibold">
        {initials}
      </AvatarFallback>
    </Avatar>
  );
}