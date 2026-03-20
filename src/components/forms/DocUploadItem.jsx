import React from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { FileText, Upload, X, Loader2 } from 'lucide-react';

export default function DocUploadItem({ id, label, checked, onCheck, urls = [], onUpload, onRemove, uploading }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Checkbox id={id} checked={checked || false} onCheckedChange={onCheck} />
          <Label htmlFor={id} className="cursor-pointer">{label}</Label>
        </div>
        <div>
          <input type="file" id={`upload-${id}`} multiple accept="image/*,.pdf"
            onChange={(e) => onUpload(Array.from(e.target.files))} className="hidden" />
          <Button type="button" variant="outline" size="sm" disabled={uploading}
            onClick={() => document.getElementById(`upload-${id}`).click()}>
            {uploading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Enviando...</> : <><Upload className="w-4 h-4 mr-2" /> Anexar</>}
          </Button>
        </div>
      </div>
      {urls.length > 0 && (
        <div className="ml-6 space-y-1">
          {urls.map((url, idx) => (
            <div key={idx} className="flex items-center gap-2 text-xs bg-slate-50 p-2 rounded">
              <FileText className="w-3 h-3 text-slate-400" />
              <a href={url} target="_blank" rel="noopener noreferrer" className="flex-1 truncate text-blue-600 hover:underline">Arquivo {idx + 1}</a>
              <button type="button" onClick={() => onRemove(url)} className="text-red-500 hover:text-red-700"><X className="w-3 h-3" /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}