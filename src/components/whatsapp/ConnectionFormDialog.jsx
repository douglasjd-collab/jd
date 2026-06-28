import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Eye, EyeOff } from 'lucide-react';

export default function ConnectionFormDialog({ 
  open, 
  onOpenChange, 
  connection, 
  onSave, 
  onCancel,
  isLoading 
}) {
  const [formData, setFormData] = useState({
    nome: connection?.nome || '',
    provider_type: connection?.provider_type || 'dapi',
    base_url: connection?.base_url || 'https://api.d-api.cloud',
    api_key: connection?.api_key_encrypted ? '***hidden***' : '',
    session_id: connection?.session_id || 'CRM JD',
    is_active: connection?.is_active ?? true,
    is_default: connection?.is_default ?? false
  });
  
  const [showApiKey, setShowApiKey] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    
    // Se API Key está oculta, não enviar
    const submitData = { ...formData };
    if (submitData.api_key === '***hidden***') {
      delete submitData.api_key;
    }
    
    onSave(submitData);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b">
          <h2 className="text-xl font-semibold">
            {connection ? 'Editar Conexão WhatsApp' : 'Nova Conexão WhatsApp'}
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Configure os dados de conexão com o provedor WhatsApp
          </p>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Nome da Conexão *</Label>
              <Input
                value={formData.nome}
                onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                placeholder="Ex: CRM JD - Matriz"
                required
              />
            </div>

            <div>
              <Label>Tipo do Provedor *</Label>
              <Select
                value={formData.provider_type}
                onValueChange={(value) => setFormData({ ...formData, provider_type: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="dapi">D-API</SelectItem>
                  <SelectItem value="evolution">Evolution API</SelectItem>
                  <SelectItem value="meta_oficial">Meta Oficial (WhatsApp Cloud)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label>Base URL *</Label>
            <Input
              value={formData.base_url}
              onChange={(e) => setFormData({ ...formData, base_url: e.target.value })}
              placeholder="https://api.d-api.cloud"
              required
            />
          </div>

          <div>
            <Label>API Key *</Label>
            <div className="flex gap-2">
              <Input
                type={showApiKey ? 'text' : 'password'}
                value={formData.api_key}
                onChange={(e) => setFormData({ ...formData, api_key: e.target.value })}
                placeholder="Digite a API Key"
                required={!connection}
                className="flex-1"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => setShowApiKey(!showApiKey)}
              >
                {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </Button>
            </div>
            {connection && (
              <p className="text-xs text-slate-500 mt-1">
                Deixe em branco para manter a API Key atual
              </p>
            )}
          </div>

          <div>
            <Label>Session ID</Label>
            <Input
              value={formData.session_id}
              onChange={(e) => setFormData({ ...formData, session_id: e.target.value })}
              placeholder="CRM JD"
            />
          </div>

          <div className="flex gap-6 pt-4 border-t">
            <div className="flex items-center gap-2">
              <Switch
                checked={formData.is_active}
                onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
              />
              <Label>Conexão Ativa</Label>
            </div>

            <div className="flex items-center gap-2">
              <Switch
                checked={formData.is_default}
                onCheckedChange={(checked) => setFormData({ ...formData, is_default: checked })}
              />
              <Label>Tornar Padrão</Label>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? 'Salvando...' : 'Salvar'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}