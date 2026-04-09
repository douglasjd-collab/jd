import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useState } from "react";

export default function AvatarContato({ contato, className = "h-10 w-10" }) {
  const [imgError, setImgError] = useState(false);

  const initials = (contato?.nome || contato?.telefone || "?")
    .split(" ")
    .filter(Boolean)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const fotoUrl = contato?.foto_url;
  const hasPhoto = !imgError && fotoUrl && fotoUrl.trim().length > 0 && fotoUrl !== 'undefined' && fotoUrl !== 'null';

  return (
    <Avatar className={className}>
      {hasPhoto && (
        <AvatarImage
          src={fotoUrl}
          alt={contato?.nome || contato?.telefone || ''}
          onError={() => setImgError(true)}
        />
      )}
      <AvatarFallback className="bg-gradient-to-br from-blue-500 to-purple-600 text-white text-xs font-semibold">
        {initials}
      </AvatarFallback>
    </Avatar>
  );
}