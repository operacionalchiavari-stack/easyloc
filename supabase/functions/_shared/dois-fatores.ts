// Verificação em duas etapas (out/2026): Edge Functions que aceitam o login da equipe e depois usam a chave de
// serviço precisam conferir aqui, senão uma sessão que só passou pela senha faria pelo servidor o que o banco barra.
// Pergunta ao banco COMO o usuário (o próprio token): seguranca_2fa_status() devolve {obrigatorio, verificado}.
// Se o banco não responder, bloqueia (falha fechada).
export const MENSAGEM_2FA = "Confirme o código do WhatsApp para continuar (entre de novo no sistema).";

export async function segundaEtapaPendente(authorization: string | null): Promise<boolean> {
  if (!authorization?.startsWith("Bearer ")) return true;
  const url = Deno.env.get("SUPABASE_URL") || "";
  const anon = Deno.env.get("SUPABASE_ANON_KEY") || "";
  try {
    const r = await fetch(`${url}/rest/v1/rpc/seguranca_2fa_status`, {
      method: "POST",
      headers: { apikey: anon, Authorization: authorization, "Content-Type": "application/json" },
      body: "{}",
    });
    if (!r.ok) return true;
    const s = await r.json();
    return Boolean(s?.obrigatorio && !s?.verificado);
  } catch {
    return true;
  }
}
