// Notificações do app da equipe (nov/2026, Web Push com chaves VAPID nos segredos).
// Ações:
//  - teste {empresa_id}: logado (vínculo + 2FA) → manda para os próprios celulares um exemplo de "Você foi escalado".
//  - processar: chamada pelo banco (pg_net, cabeçalho x-app-push-segredo) → envia a fila app_push_fila.
// Assinatura que o serviço de push diz que não existe mais (404/410) é apagada.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";
import { segundaEtapaPendente, MENSAGEM_2FA } from "../_shared/dois-fatores.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("APP_ORIGIN") ?? "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const service = () => createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

webpush.setVapidDetails(Deno.env.get("VAPID_SUBJECT") || "https://operacionalchiavari-stack.github.io/easyloc/",
  Deno.env.get("VAPID_PUBLIC_KEY")!, Deno.env.get("VAPID_PRIVATE_KEY")!);

async function enviarPara(sb: any, userId: string, aviso: { titulo: string; corpo: string; url?: string | null; tag?: string }) {
  const { data: subs } = await sb.from("app_push_assinaturas").select("id,endpoint,p256dh,auth").eq("user_id", userId);
  let ok = 0; const erros: string[] = [];
  for (const s of subs || []) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify({ titulo: aviso.titulo, corpo: aviso.corpo, url: aviso.url || "app.html", tag: aviso.tag || undefined }),
        { TTL: 60 * 60 * 24, urgency: "high" });
      ok++;
      await sb.from("app_push_assinaturas").update({ ultimo_envio_em: new Date().toISOString() }).eq("id", s.id);
    } catch (e: any) {
      const st = e?.statusCode;
      if (st === 404 || st === 410) await sb.from("app_push_assinaturas").delete().eq("id", s.id);
      erros.push(`${st || ""} ${e?.body || e?.message || e}`.trim().slice(0, 300));
    }
  }
  return { ok, total: (subs || []).length, erros };
}

async function processar() {
  const sb = service();
  const { data: fila } = await sb.from("app_push_fila").select("*").is("enviado_em", null).lt("tentativas", 5).order("criado_em").limit(50);
  let enviados = 0;
  for (const a of fila || []) {
    const r = await enviarPara(sb, a.user_id, { titulo: a.titulo, corpo: a.corpo, url: a.url, tag: a.chave || a.id });
    if (r.ok > 0 || r.total === 0) {
      await sb.from("app_push_fila").update({ enviado_em: new Date().toISOString(), erro: r.total === 0 ? "sem celular com avisos ligados" : null }).eq("id", a.id);
      enviados += r.ok > 0 ? 1 : 0;
    } else {
      await sb.from("app_push_fila").update({ tentativas: a.tentativas + 1, erro: r.erros.join(" | ").slice(0, 500) }).eq("id", a.id);
    }
  }
  return json({ ok: true, processados: (fila || []).length, enviados });
}

async function teste(req: Request, body: any) {
  const auth = req.headers.get("Authorization") || "";
  if (!auth.startsWith("Bearer ")) return json({ erro: "Entre no sistema." }, 401);
  const usuario = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
  const { data: { user } } = await usuario.auth.getUser();
  if (!user) return json({ erro: "Sessão inválida." }, 401);
  if (await segundaEtapaPendente(auth)) return json({ erro: MENSAGEM_2FA }, 403);
  const sb = service();
  const { data: v } = await sb.from("usuarios_empresas").select("empresa_id").eq("user_id", user.id).eq("empresa_id", String(body?.empresa_id || "")).maybeSingle();
  if (!v) return json({ erro: "Sem acesso a esta empresa." }, 403);
  const amanha = new Date(Date.now() + 864e5);
  const r = await enviarPara(sb, user.id, {
    titulo: "Você foi escalado",
    corpo: "Montagem · Pedido 12 · amanhã às 07:00\nAna Decorações – Villa Bisutti\n(Esta é uma notificação de teste.)",
    url: "Modulos/Chiavari/Cronograma/montador.html?app=1",
    tag: "teste-" + amanha.getTime(),
  });
  if (!r.total) return json({ erro: "Este usuário ainda não tem nenhum celular com os avisos ligados." }, 400);
  if (!r.ok) return json({ erro: "Não foi possível enviar: " + r.erros.join(" | ") }, 502);
  return json({ ok: true, enviados: r.ok, aparelhos: r.total });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ erro: "Método não permitido" }, 405);
  let body: any = {};
  try { body = await req.json(); } catch { body = {}; }
  try {
    if (body?.acao === "processar") {
      const seg = Deno.env.get("APP_PUSH_SEGREDO") || "";
      if (!seg || req.headers.get("x-app-push-segredo") !== seg) return json({ erro: "Não autorizado" }, 401);
      return await processar();
    }
    if (body?.acao === "teste") return await teste(req, body);
    return json({ erro: "Ação desconhecida" }, 400);
  } catch (e) {
    console.error(e);
    return json({ erro: "Algo deu errado ao enviar a notificação." }, 500);
  }
});
