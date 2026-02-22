import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export default function AvatarContato({ contato, className = "h-10 w-10" }) {
  const initials = (contato?.nome || contato?.telefone || "?")
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <Avatar className={className}>
      {contato?.foto_url && (
        <AvatarImage src={contato.foto_url} alt={contato.nome} />
      )}
      <AvatarFallback className="bg-gradient-to-br from-blue-500 to-purple-600 text-white text-xs font-semibold">
        {initials}
      </AvatarFallback>
    </Avatar>
  );
}