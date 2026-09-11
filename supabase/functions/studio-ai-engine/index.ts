import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("APP_ORIGIN") ?? "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type StudioProvider = "openai" | "imagen" | "flux" | "stable-diffusion";

type GenerateSceneInput = {
  empresa_id: string;
  action?: "generate_scene" | "analyze_floor_plan" | "plan_layout";
  catalog_token?: string;
  plan_image?: string;
  projeto_id?: string;
  prompt: string;
  scene: Record<string, unknown>;
  provider?: StudioProvider;
  versions?: number;
};

async function validarAcessoEmpresa(req: Request, empresaId: string, catalogToken?: string) {
  const authHeader = req.headers.get("Authorization");
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const serviceClient = createClient(supabaseUrl, serviceKey);

  if (catalogToken) {
    const { data, error } = await serviceClient.rpc("catalogo_validar_sessao", { p_token: catalogToken });
    if (error || !data?.valido || String(data.empresa_id) !== String(empresaId)) {
      return { error: "Sessao do catalogo invalida", status: 401 };
    }
    return { catalogSession: data, serviceClient };
  }

  if (!authHeader?.startsWith("Bearer ")) {
    return { error: "Usuario nao autenticado", status: 401 };
  }

  const authClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: { user }, error: userError } = await authClient.auth.getUser();

  if (userError || !user) {
    return { error: "Sessao invalida", status: 401 };
  }

  const { data: vinculo, error: vinculoError } = await serviceClient
    .from("usuarios_empresas")
    .select("empresa_id")
    .eq("user_id", user.id)
    .eq("empresa_id", empresaId)
    .maybeSingle();

  if (vinculoError || !vinculo) {
    return { error: "Usuario sem acesso a esta empresa", status: 403 };
  }

  return { user, serviceClient };
}

async function analyzeFloorPlan(input: GenerateSceneInput) {
  const openaiKey = Deno.env.get("OPENAI_API_KEY");
  if (!openaiKey) throw new Error("OPENAI_API_KEY nao configurada");
  if (!input.plan_image?.startsWith("data:image/")) throw new Error("Imagem da planta ausente ou invalida");
  const model = Deno.env.get("STUDIO_OPENAI_VISION_MODEL") || "gpt-4.1-mini";
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${openaiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      temperature: 0,
      messages: [{ role: "user", content: [
        { type: "text", text: "Analise esta planta arquitetonica sem descartar nenhuma parte do projeto. Leia as cotas impressas e escolha uma referencia horizontal e outra vertical confiaveis para calcular a escala em metros. width_m e depth_m devem ser as medidas reais dessas duas referencias. Em bounds, informe exatamente as extremidades normalizadas correspondentes a essas cotas, nao um recorte visual e nao apenas o comodo principal. A aplicacao preservara a imagem inteira e extrapolara a escala para toda a folha. Nao estime se nao houver cota legivel; nesse caso use null." },
        { type: "image_url", image_url: { url: input.plan_image, detail: "high" } },
      ] }],
      response_format: { type: "json_schema", json_schema: { name: "floor_plan_measurement", strict: true, schema: {
        type: "object", additionalProperties: false,
        properties: {
          width_m: { type: ["number", "null"] }, depth_m: { type: ["number", "null"] },
          bounds: { type: "object", additionalProperties: false, properties: {
            left: { type: "number" }, top: { type: "number" }, right: { type: "number" }, bottom: { type: "number" },
          }, required: ["left", "top", "right", "bottom"] },
          confidence: { type: "number" }, evidence: { type: "array", items: { type: "string" } },
        }, required: ["width_m", "depth_m", "bounds", "confidence", "evidence"]
      } } }
    }),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload?.error?.message || "Falha ao analisar planta");
  const content = payload?.choices?.[0]?.message?.content;
  const analysis = JSON.parse(content || "{}");
  return { ...analysis, modelo: model };
}

async function planLayout(input: GenerateSceneInput) {
  const key = Deno.env.get("OPENAI_API_KEY");
  if (!key) throw new Error("OPENAI_API_KEY nao configurada");
  const items = input.scene?.items;
  if (!Array.isArray(items) || !items.length || items.length > 100 || input.prompt.length > 4000) throw new Error("Parametros de planejamento invalidos");
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST", signal: AbortSignal.timeout(45000),
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: Deno.env.get("STUDIO_OPENAI_VISION_MODEL") || "gpt-4.1-mini",
      messages: [
        { role: "system", content: "Voce e uma decoradora de eventos. Interprete o briefing e escolha uma zona preferencial para cada modelo fornecido: front (entrada/frente), back (fundo), left, right ou any. Use somente IDs fornecidos. Considere funcao dos moveis, circulacao e regras em metros. O motor geometrico posicionara os modelos e verificara as distancias; nao afirme que o briefing completo foi executado. Retorne todos os modelos uma vez." },
        { role: "user", content: JSON.stringify({ briefing: input.prompt, ...input.scene }) },
      ],
      response_format: { type: "json_schema", json_schema: { name: "decoration_plan", strict: true, schema: {
        type: "object", additionalProperties: false, properties: { items: { type: "array", items: {
          type: "object", additionalProperties: false, properties: { itemId: { type: "string" }, zone: { type: "string", enum: ["front", "back", "left", "right", "any"] } }, required: ["itemId", "zone"],
        } } }, required: ["items"],
      } } },
    }),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result?.error?.message || "Planejamento indisponivel");
  return JSON.parse(result?.choices?.[0]?.message?.content || "null");
}

function respostaJson(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function validarPayload(body: Partial<GenerateSceneInput>) {
  if (!body.empresa_id || typeof body.empresa_id !== "string") {
    return "empresa_id ausente ou invalida";
  }

  if (!body.prompt || typeof body.prompt !== "string") {
    return "prompt ausente ou invalido";
  }

  return null;
}

function normalizarPrompt(input: GenerateSceneInput) {
  const versions = Math.min(Math.max(Number(input.versions || 1), 1), 1);
  if (input.scene?.referencePolicy === "fabric_customization") {
    return { prompt: input.prompt.trim(), versions };
  }
  const sceneObjects = Array.isArray(input.scene?.objects)
    ? input.scene.objects as Array<Record<string, unknown>>
    : [];
  const furnitureCounts = sceneObjects.reduce((counts, object) => {
    const name = String(object.itemName || "movel").trim() || "movel";
    counts.set(name, (counts.get(name) || 0) + 1);
    return counts;
  }, new Map<string, number>());
  const furnitureInventory = [...furnitureCounts.entries()]
    .map(([name, count]) => `${count}x ${name}`)
    .join(", ");

  return {
    prompt: [
      input.prompt.trim(),
      "MODO OBRIGATORIO: fotografia arquitetonica ultrarrealista com mobiliario rigidamente protegido e arquitetura adaptativa.",
      furnitureInventory ? `INVENTARIO DE MOVEIS QUE DEVE PERMANECER IDENTICO: ${furnitureInventory}.` : "Preserve rigidamente todos os moveis visiveis.",
      "REGRA RIGIDA PARA OS MOVEIS: mantenha quantidade, identidade, desenho, materiais, cores, proporcoes, escala aparente, silhueta, orientacao e posicao de cada item exatamente como na captura 3D.",
      "Mantenha exatamente as distancias entre os moveis, os pontos de contato, as oclusoes e a ordem de profundidade do mobiliario.",
      "Nao mover, girar, espelhar, redimensionar, deformar, substituir, remover, duplicar nem acrescentar moveis ou objetos decorativos.",
      "Bloqueie a camera: nao alterar enquadramento, recorte, zoom, distancia focal, campo de visao, horizonte, perspectiva ou pontos de fuga.",
      "REGRA FLEXIVEL PARA A ARQUITETURA: paredes, piso, teto e as fotografias aplicadas nas paredes sao referencias de localizacao, material, estilo e ambiente; nao sao recortes que precisem ser copiados literalmente.",
      "Reconstrua a envolvente arquitetonica como um unico ambiente coerente. Una paredes nas quinas, conecte-as naturalmente ao piso e ao teto, alinhe perspectiva, escala de textura, luz e cor entre superficies adjacentes.",
      "Elimine emendas duras, paineis flutuantes, retangulos recortados, duplicacoes, quebras abruptas de textura e terminacoes sem sentido criadas pelo gabarito 3D.",
      "Pode estender, completar, recortar e reinterpretar somente as imagens e superficies arquitetonicas para produzir continuidade visual, inclusive inferir o teto e completar trechos ausentes quando necessario.",
      "Respeite a localizacao aproximada e a direcao das paredes indicadas, bem como portas, janelas ou aberturas claramente visiveis, mas privilegie encontros construtivos plausiveis e sem cortes artificiais.",
      "Integre os moveis ao ambiente apenas por iluminacao, reflexos e sombras de contato fisicamente plausiveis, sem alterar sua geometria percebida.",
      ["poucos", "moderado"].includes(String((input.scene?.options as Record<string, unknown> | undefined)?.convidados))
        ? "Pessoas autorizadas somente na quantidade solicitada, em areas livres, sem encobrir o mobiliario principal. Nunca mover moveis ou alterar a camera para acomodar convidados. Se faltar espaco, reduzir pessoas."
        : "Nao adicionar pessoas.",
      "Nao adicionar textos, logotipos, marcas d'agua ou novos objetos.",
      "O resultado deve parecer uma unica fotografia real do mesmo arranjo de moveis dentro de uma arquitetura continua, e nao uma colagem de fotografias sobre planos."
    ].join(" "),
    versions,
  };
}

function resolverTamanhoImagem(input: GenerateSceneInput) {
  const tamanhoConfigurado = Deno.env.get("STUDIO_IMAGE_SIZE");
  if (tamanhoConfigurado) return tamanhoConfigurado;

  const scene = input.scene || {};
  const options = typeof scene.options === "object" && scene.options
    ? scene.options as Record<string, unknown>
    : {};
  const formato = typeof options.formato === "object" && options.formato
    ? options.formato as Record<string, unknown>
    : {};
  const largura = Number(formato.largura || 1024);
  const altura = Number(formato.altura || 1024);

  if (Math.abs(largura - altura) < 80) return "1024x1024";
  return largura > altura ? "1536x1024" : "1024x1536";
}

function coletarReferencias(input: GenerateSceneInput) {
  const scene = input.scene || {};
  const preview = typeof scene.preview === "string" ? scene.preview : "";
  if (preview.startsWith("data:image/") || preview.startsWith("http")) {
    if (scene.referencePolicy === "fabric_customization") {
      const fabric = scene.fabricReference;
      if (typeof fabric !== "string" || !fabric.startsWith("data:image/")) throw new Error("Amostra de tecido ausente");
      return [preview, fabric];
    }
    return [preview];
  }
  return [];
}

function blobFromDataUrl(dataUrl: string) {
  const match = dataUrl.match(/^data:(image\/(?:png|jpeg|jpg|webp));base64,(.+)$/);
  if (!match) return null;

  const mime = match[1] === "image/jpg" ? "image/jpeg" : match[1];
  const bytes = Uint8Array.from(atob(match[2]), (char) => char.charCodeAt(0));
  const ext = mime.includes("png") ? "png" : mime.includes("webp") ? "webp" : "jpg";
  return {
    blob: new Blob([bytes], { type: mime }),
    filename: `main-canvas-composition-reference.${ext}`,
  };
}

async function blobFromReference(ref: string, index: number) {
  if (ref.startsWith("data:image/")) {
    return blobFromDataUrl(ref);
  }

  const response = await fetch(ref);
  if (!response.ok) return null;

  const blob = await response.blob();
  const contentType = blob.type || response.headers.get("content-type") || "image/png";
  if (!contentType.startsWith("image/")) return null;

  const ext = contentType.includes("jpeg") || contentType.includes("jpg")
    ? "jpg"
    : contentType.includes("webp")
      ? "webp"
      : "png";

  return {
    blob: new Blob([await blob.arrayBuffer()], { type: contentType }),
    filename: `furniture-shape-reference-${index + 1}.${ext}`,
  };
}

async function generateWithOpenAI(input: GenerateSceneInput) {
  const openaiKey = Deno.env.get("OPENAI_API_KEY");
  const imageModel = Deno.env.get("STUDIO_OPENAI_IMAGE_MODEL") || "gpt-image-2";
  if (!openaiKey) {
    return {
      providerStatus: "not_configured",
      images: [],
      modelo: `openai:${imageModel}`,
    };
  }

  const { prompt, versions } = normalizarPrompt(input);
  const referencias = coletarReferencias(input);
  const imageSize = resolverTamanhoImagem(input);
  if (referencias.length !== (input.scene?.referencePolicy === "fabric_customization" ? 2 : 1)) {
    return {
      providerStatus: "error",
      error: { message: "A captura principal do 3D e obrigatoria para a renderizacao fiel." },
      images: [],
      modelo: `openai:${imageModel}`,
    };
  }

  const reference = await blobFromReference(referencias[0], 0);
  if (!reference) {
    return {
      providerStatus: "error",
      error: { message: "A captura principal do 3D nao pode ser lida." },
      images: [],
      modelo: `openai:${imageModel}`,
    };
  }

  const form = new FormData();
  form.append("model", imageModel);
  form.append("prompt", prompt);
  form.append("image", reference.blob, reference.filename);
  if (referencias.length === 2) {
    const fabric = await blobFromReference(referencias[1], 1);
    if (!fabric) throw new Error("A amostra de tecido nao pode ser lida");
    form.delete("image");
    form.append("image[]", reference.blob, reference.filename);
    form.append("image[]", fabric.blob, fabric.filename);
  }
  form.append("n", String(versions));
  form.append("size", imageSize);
  form.append("quality", Deno.env.get("STUDIO_IMAGE_QUALITY") || "high");
  form.append("background", "opaque");
  form.append("output_format", Deno.env.get("STUDIO_IMAGE_FORMAT") || "png");

  const response = await fetch("https://api.openai.com/v1/images/edits", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openaiKey}`,
    },
    body: form,
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    return {
      providerStatus: "error",
      error: payload?.error || payload,
      images: [],
      modelo: `openai:${imageModel}`,
    };
  }

  const images = Array.isArray(payload.data)
    ? payload.data.map((item: Record<string, string>) => ({
        url: item.url || null,
        base64: item.b64_json || null,
      }))
    : [];

  return {
    providerStatus: "ok",
    images,
    modelo: imageModel,
  };
}

async function generateScene(input: GenerateSceneInput) {
  const provider = input.provider || "openai";

  if (provider === "openai") {
    return await generateWithOpenAI(input);
  }

  return {
    providerStatus: "not_implemented",
    images: [],
    modelo: provider,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return respostaJson({ erro: "Metodo nao permitido" }, 405);
    }

    const body = await req.json().catch(() => null) as Partial<GenerateSceneInput> | null;
    if (!body) {
      return respostaJson({ erro: "JSON invalido" }, 400);
    }

    const action = body.action || "generate_scene";
    const erroPayload = action === "plan_layout"
      ? (!body.empresa_id || typeof body.prompt !== "string" || !body.scene ? "Parametros ausentes" : null)
      : action === "analyze_floor_plan"
      ? (!body.empresa_id || !body.plan_image ? "empresa_id ou plan_image ausente" : null)
      : validarPayload(body);
    if (erroPayload) {
      return respostaJson({ erro: erroPayload }, 400);
    }

    const acesso = await validarAcessoEmpresa(req, body.empresa_id!, body.catalog_token);
    if ("error" in acesso) {
      return respostaJson({ erro: acesso.error }, acesso.status);
    }

    const input = body as GenerateSceneInput;
    if (action === "plan_layout") return respostaJson({ ok: true, plan: await planLayout(input) });
    if (action === "analyze_floor_plan") {
      const analysis = await analyzeFloorPlan(input);
      return respostaJson({ ok: true, analysis });
    }
    const result = await generateScene(input);

    return respostaJson({
      ok: result.providerStatus === "ok",
      providerStatus: result.providerStatus,
      images: result.images,
      prompt: input.prompt,
      modelo: result.modelo,
      error: "error" in result ? result.error : undefined,
    });
  } catch (err) {
    console.error("studio-ai-engine erro", err);
    return respostaJson({
      erro: "Erro ao gerar imagem no Studio AI Engine",
      details: err instanceof Error ? err.message : String(err),
    }, 500);
  }
});
