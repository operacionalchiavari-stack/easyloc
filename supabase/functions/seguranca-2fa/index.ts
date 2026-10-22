// seguranca-2fa — verificação em duas etapas por WhatsApp (out/2026).
// Depois da senha, a tela chama aqui: "enviar" manda um código de 6 números pelo Z-API da empresa para o WhatsApp
// do Cadastro de Funcionários (a pessoa nunca escolhe o número nesta tela, senão quem roubou a senha cadastraria o
// próprio celular); "verificar" confere e marca a SESSÃO atual (session_id do token) como verificada em
// seguranca_2fa_sessoes — é isso que o banco confere em seguranca_2fa_ok(). "recuperar" aceita um código de
// recuperação (8 códigos de uso único, entregues uma vez só depois do primeiro acerto) para quem perdeu o celular.
// Códigos guardados só como hash (SHA-256 com segredo do servidor). Limites: 1 envio por minuto, 5 por hora,
// 5 tentativas por código, código vale 5 minutos.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { abrirCredenciaisZapi } from "../_shared/cofre.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("APP_ORIGIN") ?? "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const CODIGO_MINUTOS = 5, MAX_TENTATIVAS = 5, ENVIOS_HORA = 5, SESSAO_DIAS = 30, QTD_RECUPERACAO = 8;

function env(nome: string) {
  const v = Deno.env.get(nome);
  if (!v) throw new Error(`Variável ausente: ${nome}`);
  return v;
}
async function sha256(texto: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function iguais(a: string, b: string) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
function aleatorio(n: number, alfabeto: string) {
  const out: string[] = [];
  const max = 256 - (256 % alfabeto.length);
  while (out.length < n) {
    const b = crypto.getRandomValues(new Uint8Array(n * 2));
    for (const x of b) if (x < max && out.length < n) out.push(alfabeto[x % alfabeto.length]);
  }
  return out.join("");
}
function claims(jwt: string) {
  try {
    const p = jwt.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(p + "=".repeat((4 - (p.length % 4)) % 4)));
  } catch { return {}; }
}
const soDigitos = (v: unknown) => String(v ?? "").replace(/\D/g, "");
function telefoneBr(v: unknown) {
  const d = soDigitos(v);
  if (d.length < 10) return "";
  return d.startsWith("55") && d.length >= 12 ? d : `55${d}`;
}
const mascarar = (d: string) => (d ? `(**) *****-${d.slice(-4)}` : "");

async function enviarWhatsapp(db: any, empresaId: string, telefone: string, mensagem: string) {
  const { data: bruto } = await db.from("zapi_credenciais").select("empresa_id,instance_id,instance_token,client_token").eq("empresa_id", empresaId).maybeSingle();
  const c = await abrirCredenciaisZapi(bruto);
  if (!c?.instance_id || !c?.instance_token) throw new Error("O WhatsApp da empresa não está configurado (Integrações > WhatsApp).");
  const base = (Deno.env.get("ZAPI_BASE_URL") || "https://api.z-api.io").replace(/\/$/, "");
  const url = `${base}/instances/${c.instance_id}/token/${c.instance_token}/send-text`;
  const tentar = async (comToken: boolean) => {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (comToken && c.client_token) headers["Client-Token"] = c.client_token;
    const r = await fetch(url, { method: "POST", headers, body: JSON.stringify({ phone: telefone, message: mensagem }) });
    const corpo = await r.json().catch(() => ({}));
    return { ok: r.ok && !corpo?.error, corpo };
  };
  let r = await tentar(true);
  if (!r.ok && /client-token/i.test(JSON.stringify(r.corpo)) && c.client_token) r = await tentar(false);
  if (!r.ok) {
    const motivo = String(r.corpo?.error || r.corpo?.message || "falha no envio");
    throw new Error(/client-token/i.test(motivo)
      ? "O WhatsApp da empresa está sem o token de segurança da Z-API (Integrações > WhatsApp)."
      : `Não foi possível enviar pelo WhatsApp: ${motivo}`);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization") || "";
    if (!auth.startsWith("Bearer ")) return json({ error: "Entre com sua senha primeiro." }, 401);
    const jwt = auth.slice(7);
    const url = env("SUPABASE_URL");
    const authClient = createClient(url, env("SUPABASE_ANON_KEY"), { global: { headers: { Authorization: auth } } });
    const { data: { user }, error: userErr } = await authClient.auth.getUser(jwt);
    if (userErr || !user) return json({ error: "Sessão inválida. Entre de novo." }, 401);
    const sessionId = String(claims(jwt).session_id || "");
    if (!/^[0-9a-f-]{36}$/i.test(sessionId)) return json({ error: "Sessão inválida. Entre de novo." }, 401);

    const db = createClient(url, env("SUPABASE_SERVICE_ROLE_KEY"));
    const pepper = env("SEGURANCA_2FA_PEPPER");
    const body = await req.json().catch(() => ({}));
    const acao = String(body?.action || "status");
    const ua = (req.headers.get("user-agent") || "").slice(0, 300);

    const { data: vinc } = await db.from("usuarios_empresas").select("empresa_id").eq("user_id", user.id);
    const empresas = (vinc || []).map((v: any) => v.empresa_id);
    if (!empresas.length) return json({ error: "Usuário sem empresa." }, 403);
    const empresaId = empresas[0];
    const { data: func } = await db.from("funcionarios_acesso").select("telefone,nome,ativo").eq("id", user.id).maybeSingle();
    if (func && func.ativo === false) return json({ error: "Acesso inativo." }, 403);
    const { data: usu } = await db.from("usuarios").select("telefone,nome").eq("id", user.id).maybeSingle();
    const telefone = telefoneBr(func?.telefone || usu?.telefone);

    const evento = (tipo: string, detalhes: Record<string, unknown> = {}) =>
      db.from("seguranca_eventos").insert({ empresa_id: empresaId, user_id: user.id, tipo, detalhes: { ...detalhes, ua } });
    const { data: cfg } = await db.from("seguranca_2fa_config").select("obrigatorio").in("empresa_id", empresas).eq("obrigatorio", true);
    const obrigatorio = Boolean(cfg?.length);
    const sessaoVerificada = async () => {
      const { data } = await db.from("seguranca_2fa_sessoes").select("session_id").eq("session_id", sessionId).eq("user_id", user.id).gt("expira_em", new Date().toISOString()).maybeSingle();
      return Boolean(data);
    };
    const marcarSessao = (metodo: string) => db.from("seguranca_2fa_sessoes").upsert({
      session_id: sessionId, user_id: user.id, metodo, verificado_em: new Date().toISOString(),
      expira_em: new Date(Date.now() + SESSAO_DIAS * 864e5).toISOString(), user_agent: ua,
    });
    const restantes = async () => {
      const { count } = await db.from("seguranca_2fa_recuperacao").select("id", { count: "exact", head: true }).eq("user_id", user.id).is("usado_em", null);
      return count || 0;
    };
    const novosCodigosRecuperacao = async () => {
      await db.from("seguranca_2fa_recuperacao").update({ usado_em: new Date().toISOString() }).eq("user_id", user.id).is("usado_em", null);
      const codigos = Array.from({ length: QTD_RECUPERACAO }, () => {
        const c = aleatorio(8, "ABCDEFGHJKLMNPQRSTUVWXYZ23456789");
        return `${c.slice(0, 4)}-${c.slice(4)}`;
      });
      const linhas = await Promise.all(codigos.map(async (c) => ({ user_id: user.id, codigo_hash: await sha256(`${pepper}|rec|${user.id}|${c.replace("-", "")}`) })));
      await db.from("seguranca_2fa_recuperacao").insert(linhas);
      await evento("recuperacao_gerada");
      return codigos;
    };

    if (acao === "status") {
      return json({ obrigatorio, verificado: await sessaoVerificada(), tem_whatsapp: Boolean(telefone), whatsapp: mascarar(telefone), recuperacao_restantes: await restantes() });
    }

    if (acao === "enviar") {
      if (!telefone) return json({ error: "Seu WhatsApp não está cadastrado. Peça ao RH ou ao administrador para cadastrar no Cadastro de Funcionários." }, 400);
      const umaHora = new Date(Date.now() - 3600e3).toISOString();
      const { data: recentes } = await db.from("seguranca_2fa_codigos").select("criado_em").eq("user_id", user.id).gt("criado_em", umaHora).order("criado_em", { ascending: false });
      if ((recentes || []).length >= ENVIOS_HORA) { await evento("envio_bloqueado"); return json({ error: "Muitos códigos pedidos. Espere alguns minutos e tente de novo." }, 429); }
      const ultimo = recentes?.[0]?.criado_em ? Date.parse(recentes[0].criado_em) : 0;
      if (Date.now() - ultimo < 60e3) return json({ error: "Aguarde 1 minuto para pedir outro código.", espera: Math.ceil((60e3 - (Date.now() - ultimo)) / 1000) }, 429);
      const codigo = aleatorio(6, "0123456789");
      await db.from("seguranca_2fa_codigos").update({ usado_em: new Date().toISOString() }).eq("user_id", user.id).is("usado_em", null);
      const { error: insErr } = await db.from("seguranca_2fa_codigos").insert({
        user_id: user.id, session_id: sessionId, codigo_hash: await sha256(`${pepper}|${sessionId}|${codigo}`),
        enviado_para: mascarar(telefone), expira_em: new Date(Date.now() + CODIGO_MINUTOS * 60e3).toISOString(),
      });
      if (insErr) throw insErr;
      try {
        await enviarWhatsapp(db, empresaId, telefone,
          `*${codigo}* é o seu código de acesso ao sistema Acervo.\n\nEle vale por ${CODIGO_MINUTOS} minutos. Não compartilhe este código com ninguém — nossa equipe nunca pede este código.`);
      } catch (e) {
        await evento("envio_falhou", { motivo: String((e as Error).message).slice(0, 200) });
        return json({ error: (e as Error).message }, 502);
      }
      await evento("codigo_enviado", { para: mascarar(telefone) });
      return json({ ok: true, whatsapp: mascarar(telefone), validade_min: CODIGO_MINUTOS });
    }

    if (acao === "verificar") {
      const informado = soDigitos(body?.codigo).slice(0, 6);
      const { data: cod } = await db.from("seguranca_2fa_codigos").select("*").eq("user_id", user.id).eq("session_id", sessionId).is("usado_em", null)
        .order("criado_em", { ascending: false }).limit(1).maybeSingle();
      if (!cod || Date.parse(cod.expira_em) < Date.now()) return json({ error: "Código expirado. Peça um novo." }, 400);
      if (cod.tentativas >= MAX_TENTATIVAS) return json({ error: "Muitas tentativas erradas. Peça um novo código." }, 429);
      const ok = informado.length === 6 && iguais(await sha256(`${pepper}|${sessionId}|${informado}`), cod.codigo_hash);
      if (!ok) {
        await db.from("seguranca_2fa_codigos").update({ tentativas: cod.tentativas + 1, ...(cod.tentativas + 1 >= MAX_TENTATIVAS ? { usado_em: new Date().toISOString() } : {}) }).eq("id", cod.id);
        await evento("codigo_errado", { tentativa: cod.tentativas + 1 });
        const faltam = MAX_TENTATIVAS - cod.tentativas - 1;
        return json({ error: faltam > 0 ? `Código incorreto. Restam ${faltam} tentativa(s).` : "Muitas tentativas erradas. Peça um novo código." }, 400);
      }
      await db.from("seguranca_2fa_codigos").update({ usado_em: new Date().toISOString() }).eq("id", cod.id);
      await marcarSessao("whatsapp");
      await evento("verificado", { metodo: "whatsapp" });
      const recuperacao = (await restantes()) === 0 ? await novosCodigosRecuperacao() : null;
      return json({ ok: true, recuperacao });
    }

    if (acao === "recuperar") {
      const quinze = new Date(Date.now() - 15 * 60e3).toISOString();
      const { count: falhas } = await db.from("seguranca_eventos").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("tipo", "recuperacao_errada").gt("criado_em", quinze);
      if ((falhas || 0) >= 5) return json({ error: "Muitas tentativas. Espere 15 minutos." }, 429);
      const informado = String(body?.codigo || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
      const hash = await sha256(`${pepper}|rec|${user.id}|${informado}`);
      const { data: rec } = await db.from("seguranca_2fa_recuperacao").select("id").eq("user_id", user.id).eq("codigo_hash", hash).is("usado_em", null).maybeSingle();
      if (!rec) { await evento("recuperacao_errada"); return json({ error: "Código de recuperação inválido ou já usado." }, 400); }
      await db.from("seguranca_2fa_recuperacao").update({ usado_em: new Date().toISOString() }).eq("id", rec.id);
      await marcarSessao("recuperacao");
      await evento("verificado", { metodo: "recuperacao" });
      return json({ ok: true, recuperacao_restantes: await restantes() });
    }

    if (acao === "novos_codigos") {
      if (!(await sessaoVerificada())) return json({ error: "Confirme o código do WhatsApp antes." }, 403);
      return json({ ok: true, recuperacao: await novosCodigosRecuperacao() });
    }

    return json({ error: "Ação inválida." }, 400);
  } catch (e) {
    console.error("[seguranca-2fa]", e);
    return json({ error: "Não foi possível concluir. Tente de novo." }, 500);
  }
});
