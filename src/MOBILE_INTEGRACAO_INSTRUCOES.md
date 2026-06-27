# Integração Mobile WhatsApp-like - BatePapo

## O que já está pronto:
- ✅ `components/chat/MobileBottomNav.jsx` - Bottom navigation bar
- ✅ `components/chat/MobileConversationActions.jsx` - Bottom sheet de ações
- ✅ Imports já adicionados no BatePapo.jsx (linhas 73-74)

## O que falta adicionar no BatePapo.jsx:

### 1. Adicionar estado do mobile action sheet (já está na linha 303):
```jsx
const [mobileActionSheet, setMobileActionSheet] = useState({ open: false, conversa: null });
```

### 2. Adicionar botão de 3 pontos nos cards MOBILE (dentro do map de conversasFiltradas):

Na div com className `jd-chat-card`, após o dropdown menu existente (linha ~1773), adicione um botão mobile visível apenas em telas pequenas:

```jsx
{/* Botão menu mobile - visível apenas em mobile */}
<button
  className="mobile-action-btn lg:hidden p-1.5 hover:bg-black/5 rounded ml-auto"
  onClick={(e) => {
    e.stopPropagation();
    setMobileActionSheet({ open: true, conversa: c });
  }}
>
  <MoreVertical className="h-4 w-4" />
</button>
```

### 3. Renderizar o MobileConversationActions no final (antes do fechamento do TooltipProvider):

```jsx
{/* Mobile Conversation Actions Sheet */}
<MobileConversationActions
  open={mobileActionSheet.open}
  onOpenChange={(open) => setMobileActionSheet({ open, conversa: open ? mobileActionSheet.conversa : null })}
  conversa={mobileActionSheet.conversa}
  contatosWhatsapp={contatosWhatsapp}
  actions={[
    { id: 'salvar_crm', label: 'Salvar CRM', icon: User, color: 'blue', action: (c) => abrirSalvarCrm(c) },
    { id: 'tags', label: 'Tags', icon: Tag, color: 'purple', action: (c) => { setContatoParaTags(contatosWhatsapp[c.id] || c); setTagsModalOpen(true); } },
    { id: 'tarefa', label: 'Tarefa', icon: ClipboardList, color: 'emerald', action: (c) => { setConversaTarefa(c); setCriarTarefaOpen(true); } },
    { id: 'funil', label: 'Funil', icon: TrendingUp, color: 'emerald', action: () => setFunilModalOpen(true) },
    { id: 'ligar', label: 'Ligar', icon: Phone, color: 'emerald', action: (c) => ligarParaContato(c.cliente_telefone) },
    { id: 'transferir', label: 'Transferir', icon: Users, color: 'slate', action: (c) => setTransferirModal(c) },
    { id: 'bloquear', label: c.bloqueado ? 'Desbloquear' : 'Bloquear', icon: c.bloqueado ? Unlock : Lock, color: 'slate', action: async (c) => { await base44.entities.ConversaWhatsapp.update(c.id, { bloqueado: !c.bloqueado }); toast.success(c.bloqueado ? 'Grupo desbloqueado' : 'Grupo bloqueado'); refetchConversas(); } },
    { id: 'excluir', label: 'Excluir', icon: Trash2, color: 'red', danger: true, action: async (c) => { if (confirm('Excluir conversa?')) { const msgs = await base44.entities.MensagemWhatsapp.filter({ conversa_id: c.id }); for (const m of msgs) await base44.entities.MensagemWhatsapp.delete(m.id); await base44.entities.ConversaWhatsapp.delete(c.id); queryClient.invalidateQueries({ queryKey: ['conversas-whatsapp', empresaId] }); if (conversaSelecionada?.id === c.id) setConversaSelecionada(null); toast.success('Conversa excluída'); } } },
  ]}
/>
```

## Resultado final:
- **Mobile**: Bottom navigation fixa com filtros + Bottom sheet para ações
- **Desktop**: Sidebar e menus dropdown existentes (sem mudanças)
- Interface estilo WhatsApp com navegação intuitiva no mobile