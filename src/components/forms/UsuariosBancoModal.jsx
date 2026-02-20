import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { base44 } from '@/api/base44Client';
import { Plus, Trash2, Building2, User, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export default function UsuariosBancoModal({ open, onOpenChange, colaborador, onSuccess }) {
  const [lista, setLista] = useState(colaborador?.usuarios_banco || []);
  const [banco, setBanco] = useState('');
  const [usuario, setUsuario] = useState('');
  const [saving, setSaving] = useState(false);

  // Sincroniza lista quando colaborador muda
  React.useEffect(() => {
    setLista(colaborador?.usuarios_banco || []);
  }, [colaborador]);

  const handleAdd = () => {
    const b = banco.trim();
    const u = usuario.trim();
    if (!b || !u) {
      toast.error('Informe o banco e o usuário');
      return;
    }
    // Evitar duplicata exata
    const existe = lista.some(
      (item) => item.banco.toLowerCase() === b.toLowerCase() && item.usuario.toLowerCase() === u.toLowerCase()
    );
    if (existe) {
      toast.error('Este usuário já está cadastrado para este banco');
      return;
    }
    setLista((prev) => [...prev, { banco: b, usuario: u }]);
    setBanco('');
    setUsuario('');
  };

  const handleRemove = (idx) => {
    setLista((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSave = async () => {
    if (!colaborador?.id) return;
    setSaving(true);
    try {
      await base44.entities.Colaborador.update(colaborador.id, { usuarios_banco: lista });
      toast.success('Usuários banco salvos com sucesso!');
      onSuccess?.();
      onOpenChange(false);
    } catch (e) {
      toast.error('Erro ao salvar: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Usuários Banco — {colaborador?.nome}</DialogTitle>
          <p className="text-sm text-slate-500 mt-1">
            Vincule os logins deste colaborador em cada banco/administradora para que propostas importadas sejam associadas automaticamente.
          </p>
        </DialogHeader>

        {/* Formulário de adição */}
        <div className="bg-slate-50 rounded-lg p-4 space-y-3 border">
          <p className="text-sm font-medium text-slate-700">Adicionar novo vínculo</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Banco / Administradora</Label>
              <Input
                placeholder="Ex: BMG, PAN, Porto..."
                value={banco}
                onChange={(e) => setBanco(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
              />
            </div>
            <div>
              <Label className="text-xs">Usuário / Login</Label>
              <Input
                placeholder="Ex: JOSE.ROCHA12"
                value={usuario}
                onChange={(e) => setUsuario(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
              />
            </div>
          </div>
          <Button
            type="button"
            onClick={handleAdd}
            size="sm"
            className="bg-[#23BE84] hover:bg-[#1da570] gap-2"
          >
            <Plus className="w-4 h-4" />
            Adicionar
          </Button>
        </div>

        {/* Lista */}
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {lista.length === 0 ? (
            <div className="text-center py-6 text-slate-400 text-sm">
              Nenhum usuário banco cadastrado
            </div>
          ) : (
            lista.map((item, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between p-3 bg-white border rounded-lg"
              >
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5">
                    <Building2 className="w-4 h-4 text-slate-400" />
                    <Badge variant="secondary" className="font-semibold">{item.banco}</Badge>
                  </div>
                  <span className="text-slate-400">→</span>
                  <div className="flex items-center gap-1.5">
                    <User className="w-4 h-4 text-slate-400" />
                    <span className="font-mono text-sm text-slate-700">{item.usuario}</span>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleRemove(idx)}
                  className="text-red-500 hover:text-red-700 hover:bg-red-50 h-8 w-8"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            ))
          )}
        </div>

        <div className="flex justify-end gap-3 pt-2 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving} className="bg-[#1e3a5f] hover:bg-[#2a4a73]">
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Salvar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}