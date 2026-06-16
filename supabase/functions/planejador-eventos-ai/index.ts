import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function corsHeaders(req: Request) {
  const origin = req.headers.get("Origin") ?? "";
  const configured = (Deno.env.get("APP_ORIGIN") ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const allowed = new Set([
    ...configured,
    "http://127.0.0.1:5500",
    "http://localhost:5500",
    "http://127.0.0.1:3000",
    "http://localhost:3000",
  ]);
  const allowOrigin = !origin || allowed.has(origin) ? (origin || "*") : (configured[0] || "*");
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

type PlannerInput = {
  empresa_id: string;
  local?: Record<string, unknown>;
  modo?: string;
  estilo?: string;
  preferencias?: string[];
  briefing?: Record<string, unknown>;
  prioridades?: string[];
  areaUtilInferida?: Record<string, unknown>;
  canvas?: { width: number; height: number };
  areas?: Array<Record<string, unknown>>;
  obstacles?: Array<Record<string, unknown>>;
  itens?: Array<Record<string, unknown>>;
};

function json(req: Request, body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json" },
  });
}

async function validarAcesso(req: Request, empresaId: string) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return { error: "Usuario nao autenticado", status: 401 };
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const authClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: { user }, error: userError } = await authClient.auth.getUser();
  if (userError || !user) {
    return { error: "Sessao invalida", status: 401 };
  }

  const serviceClient = createClient(supabaseUrl, serviceKey);
  const { data: vinculo, error: vinculoError } = await serviceClient
    .from("usuarios_empresas")
    .select("empresa_id")
    .eq("user_id", user.id)
    .eq("empresa_id", empresaId)
    .maybeSingle();

  if (vinculoError || !vinculo) {
    return { error: "Usuario sem acesso a esta empresa", status: 403 };
  }

  return { user };
}

function clampNumber(value: unknown, min: number, max: number) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.min(Math.max(number, min), max);
}

function sanitizeLayout(payload: unknown, input: PlannerInput) {
  const rawObjects = Array.isArray((payload as Record<string, unknown>)?.objects)
    ? (payload as Record<string, unknown>).objects as Array<Record<string, unknown>>
    : [];
  const itemIds = new Set((input.itens || []).map((item) => String(item.id)));
  const width = Number(input.canvas?.width || 1700);
  const height = Number(input.canvas?.height || 1200);

  const objects = rawObjects
    .filter((object) => itemIds.has(String(object.item_id || object.itemId)))
    .slice(0, 80)
    .map((object) => ({
      item_id: String(object.item_id || object.itemId),
      label: String(object.label || object.nome || "Item"),
      area: String(object.area || ""),
      x: Math.round(clampNumber(object.x, 0, width - 80)),
      y: Math.round(clampNumber(object.y, 0, height - 80)),
      rotation: Math.round(clampNumber(object.rotation, -180, 180)),
      rationale: String(object.rationale || "Posicionado pela IA do Planejador."),
    }));

  return {
    objects,
    resumo: String((payload as Record<string, unknown>)?.resumo || "Layout gerado pela IA."),
  };
}

function systemPrompt() {
  return [
    "Voce e uma decoradora profissional e diretora de fluxo de eventos do EasyLoc, especializada em casamentos, eventos corporativos, festas sociais e eventos de alto padrao.",
    "Gere somente JSON valido.",
    "Use apenas item_id existentes na lista de itens enviada.",
    "Antes de posicionar qualquer movel, analise formato do espaco, entradas e saidas, vista principal, pista, palco, buffet, bar, convidados, lounges, mesas e referencias visuais fornecidas.",
    "Nunca trate a folha inteira da planta como area utilizavel. Respeite paredes, contornos, limites fisicos e areaUtilInferida quando enviada.",
    "Se areaUtilInferida for circular, todos os moveis devem ficar dentro do circulo. Nao posicione itens em areas externas ao salao.",
    "A prioridade nao e ocupar espaco. A prioridade e fluxo de circulacao, conforto, estetica e funcionalidade operacional.",
    "Peso das decisoes: 1 referencias historicas do local, 2 fluxo de circulacao, 3 estetica, 4 capacidade de convidados, 5 ocupacao do espaco.",
    "Nunca preencha um espaco apenas porque ele esta vazio. Espaco vazio pode ser uma decisao correta de projeto.",
    "Quando houver plantas de referencia do mesmo local, identifique padroes recorrentes: posicao habitual da pista, bar, mesa de bolo, lounges e mesas. Use esses padroes como base.",
    "Somente altere padroes historicos se houver conflito de espaco ou solicitacao explicita do usuario.",
    "Respeite areas demarcadas pelo usuario. Itens dentro de uma area devem ficar dentro do retangulo da area e acompanhar a rotacao da area quando fizer sentido.",
    "Cada area pode ter areaType, rules, restrictions, composition, places e rotation. Trate estes campos como obrigatorios para decidir o layout.",
    "Considere a rotacao da area como eixo visual de distribuicao dos itens.",
    "Pista de danca: nunca posicionar moveis dentro, nunca invadir, deixar area livre ao redor e acesso por todos os lados.",
    "Palco: nunca posicionar moveis dentro e manter area livre frontal para visualizacao.",
    "Mesa de bolo: sem cadeiras, sem lounges colados, com area livre para fotografias e local de destaque visual.",
    "Mesa da familia deve receber cadeiras e deve ficar proxima da mesa de bolo e da pista quando essas areas existirem.",
    "Buffet: nunca bloquear acesso; criar espaco para fila e circulacao nos dois sentidos.",
    "Bar: deve ter area de permanencia proxima e pode receber bistros, sem bloquear circulacao principal.",
    "Lounge nao e agrupamento aleatorio. Deve formar conversa: moveis voltados entre si, nunca poltronas olhando para fora do conjunto.",
    "Todo lounge deve ter composicao completa: 1 sofa, 2 ou 4 poltronas, 1 mesa de centro e 2 mesas laterais quando disponiveis. Represente como composicao unica quando o frontend usar simbolo de lounge.",
    "Mesas de convidados: distribuir de forma uniforme, garantir corredores, evitar bloquear buffet, bar, banheiros e pista.",
    "Preserve corredores invisiveis: entrada, buffet, pista, banheiros e operacional da equipe.",
    "Areas nobres com boa vista, palco, pista ou paisagem devem receber melhores lounges.",
    "Nunca posicione moveis sobre obstaculos, paredes, colunas, areas proibidas, areas livres, pista ou palco.",
    "A planta final e um desenho tecnico: os itens cadastrados serao representados por simbolos no frontend, nao por fotos.",
    "Distribua apenas o necessario para um projeto elegante, confortavel e funcional.",
    "Retorne objetos com item_id, label, area, x, y, rotation e rationale."
  ].join(" ");
}

function userPrompt(input: PlannerInput) {
  return JSON.stringify({
    tarefa: "Gerar layout operacional de planta de evento usando itens reais do estoque.",
    local: input.local,
    modo: input.modo,
    estilo: input.estilo,
    preferencias: input.preferencias,
    briefing: input.briefing,
    prioridades: input.prioridades,
    areaUtilInferida: input.areaUtilInferida,
    canvas: input.canvas || { width: 1700, height: 1200 },
    areas: input.areas || [],
    obstacles: input.obstacles || [],
    itens: (input.itens || []).slice(0, 80),
    formato_resposta: {
      objects: [
        {
          item_id: "uuid do item cadastrado",
          label: "nome do item",
          area: "nome da area usada",
          x: 100,
          y: 100,
          rotation: 0,
          rationale: "motivo curto"
        }
      ],
      resumo: "comentario curto"
    }
  });
}

async function gerarComOpenAI(input: PlannerInput) {
  const openaiKey = Deno.env.get("OPENAI_API_KEY");
  if (!openaiKey) {
    return { providerStatus: "not_configured", layout: null };
  }

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openaiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: Deno.env.get("PLANNER_OPENAI_MODEL") || "gpt-4.1-mini",
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt() },
        { role: "user", content: userPrompt(input) },
      ],
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    return { providerStatus: "error", error: data, layout: null };
  }

  const content = data?.choices?.[0]?.message?.content || "{}";
  const parsed = JSON.parse(content);
  return {
    providerStatus: "ok",
    modelo: data?.model || Deno.env.get("PLANNER_OPENAI_MODEL") || "gpt-4.1-mini",
    layout: sanitizeLayout(parsed, input),
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(req) });
  }

  try {
    if (req.method !== "POST") return json(req, { erro: "Metodo nao permitido" }, 405);
    const body = await req.json().catch(() => null) as PlannerInput | null;
    if (!body?.empresa_id) return json(req, { erro: "empresa_id ausente" }, 400);
    if (!Array.isArray(body.itens) || !body.itens.length) return json(req, { erro: "itens ausentes" }, 400);

    const acesso = await validarAcesso(req, body.empresa_id);
    if ("error" in acesso) return json(req, { erro: acesso.error }, acesso.status);

    const result = await gerarComOpenAI(body);
    return json(req, {
      ok: result.providerStatus === "ok",
      providerStatus: result.providerStatus,
      modelo: "modelo" in result ? result.modelo : undefined,
      layout: result.layout,
      error: "error" in result ? result.error : undefined,
    });
  } catch (err) {
    console.error("planejador-eventos-ai erro", err);
    return json(req, {
      erro: "Erro ao gerar layout do Planejador",
      details: err instanceof Error ? err.message : String(err),
    }, 500);
  }
});
