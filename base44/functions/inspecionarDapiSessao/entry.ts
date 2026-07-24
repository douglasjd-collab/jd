// Função de diagnóstico removida — mantida apenas como stub para não quebrar
// o registro da function no painel Base44. Use o insights via action
// `diagnostico_template` da função `gerenciarTemplateMetaOficial`.
Deno.serve(async () => Response.json({ ok: true, deprecated: true }));