import React from 'react';
import { Mic, Volume2 } from 'lucide-react';
const style='w-full rounded-lg border border-slate-200 bg-white p-2.5 text-sm text-slate-900 dark:bg-slate-900 dark:text-slate-100 dark:border-slate-700';
export default function VozAgentesConfig({ dados, onChange }) {
 return <fieldset className="space-y-4 rounded-xl border border-emerald-200 p-4">
  <legend className="px-2 font-semibold flex items-center gap-2"><Mic className="h-4 w-4" />Voz e áudio • todos os agentes</legend>
  <p className="text-sm text-slate-600">Preferências compartilhadas entre Qualificador, Vendedor e Follow-up. A execução depende da integração de áudio e da ponte de chamadas.</p>
  <label className="block space-y-1 text-sm font-medium">Voz desejada<select className={style} value={dados.voz_tipo || 'personalizada'} onChange={e=>onChange('voz_tipo',e.target.value)}><option value="personalizada">Minha voz — aguardando habilitação e gravação</option><option value="padrao">Voz pronta do provedor — selecionar durante teste</option></select></label>
  <label className="block space-y-1 text-sm font-medium">Nome da voz<input className={style} maxLength={120} placeholder="Ex.: Voz Douglas — JD Promotora" value={dados.voz_nome || ''} onChange={e=>onChange('voz_nome',e.target.value)} /></label>
  <label className="block space-y-1 text-sm font-medium">Orientações de fala<textarea className={style} rows={3} maxLength={2000} value={dados.voz_estilo || 'Português brasileiro, tom acolhedor e profissional, ritmo natural, frases curtas e pausas de conversa. Identificar-se como assistente virtual da JD.'} onChange={e=>onChange('voz_estilo',e.target.value)} /></label>
  <div className="space-y-2 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900"><p className="flex items-center gap-2"><Volume2 className="h-4 w-4" />Regra solicitada: responder por áudio a mensagens de áudio.</p><p>Todos poderão enviar áudio e atender chamadas após a implementação das integrações. O follow-up também poderá iniciar ligações dentro das regras de acompanhamento.</p></div>
  <p className="text-sm text-amber-800">Gravação da sua voz ainda não habilitada. A criação pela OpenAI exige elegibilidade da conta, gravação de consentimento e amostra de voz. Salvar estas preferências não cria uma voz nem ativa chamadas.</p>
 </fieldset>;
}
