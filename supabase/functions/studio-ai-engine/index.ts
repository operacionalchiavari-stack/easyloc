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
  projeto_id?: string;
  prompt: string;
  scene: Record<string, unknown>;
  provider?: StudioProvider;
  versions?: number;
};

async function validarAcessoEmpresa(req: Request, empresaId: string) {
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

  return { user, serviceClient };
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
  return {
    prompt: [
      input.prompt.trim(),
      "Render vertical/horizontal profissional para locacao de moveis de eventos.",
      "Preserve os itens do EasyLoc, proporcoes relativas, materiais, cores e posicoes definidas pelo canvas.",
      "Evite textos, marcas d'agua, logotipos inventados e deformacoes de moveis."
    ].join(" "),
    versions,
  };
}

function coletarReferencias(input: GenerateSceneInput) {
  const scene = input.scene || {};
  const refs: string[] = [];
  const preview = typeof scene.preview === "string" ? scene.preview : "";

  if (preview.startsWith("data:image/") || preview.startsWith("http")) {
    refs.push(preview);
  }

  const objects = Array.isArray(scene.objects) ? scene.objects : [];
  for (const obj of objects.slice(0, 12)) {
    if (!obj || typeof obj !== "object") continue;
    const image = (obj as Record<string, unknown>).itemImage;
    if (typeof image === "string" && image.startsWith("http")) {
      refs.push(image);
    }
  }

  return refs.slice(0, 16);
}

function blobFromDataUrl(dataUrl: string) {
  const match = dataUrl.match(/^data:(image\/(?:png|jpeg|jpg|webp));base64,(.+)$/);
  if (!match) return null;

  const mime = match[1] === "image/jpg" ? "image/jpeg" : match[1];
  const bytes = Uint8Array.from(atob(match[2]), (char) => char.charCodeAt(0));
  const ext = mime.includes("png") ? "png" : mime.includes("webp") ? "webp" : "jpg";
  return {
    blob: new Blob([bytes], { type: mime }),
    filename: `canvas-reference.${ext}`,
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
    filename: `item-reference-${index + 1}.${ext}`,
  };
}

async function generateWithOpenAI(input: GenerateSceneInput) {
  const openaiKey = Deno.env.get("OPENAI_API_KEY");
  if (!openaiKey) {
    return {
      providerStatus: "not_configured",
      images: [],
      modelo: "openai:gpt-image-1.5",
    };
  }

  const { prompt, versions } = normalizarPrompt(input);
  const referencias = coletarReferencias(input);
  let response: Response;

  if (referencias.length) {
    const form = new FormData();
    form.append("model", Deno.env.get("STUDIO_OPENAI_IMAGE_MODEL") || "gpt-image-1.5");
    form.append("prompt", prompt);
    form.append("n", String(versions));
    form.append("size", Deno.env.get("STUDIO_IMAGE_SIZE") || "1024x1024");
    form.append("quality", Deno.env.get("STUDIO_IMAGE_QUALITY") || "high");
    form.append("output_format", Deno.env.get("STUDIO_IMAGE_FORMAT") || "png");
    form.append("input_fidelity", "high");

    let count = 0;
    for (const ref of referencias) {
      const file = await blobFromReference(ref, count);
      if (!file) continue;
      form.append(referencias.length > 1 ? "image[]" : "image", file.blob, file.filename);
      count++;
    }

    if (count === 0) {
      return {
        providerStatus: "error",
        error: { message: "Nenhuma imagem de referencia valida foi enviada ao provedor." },
        images: [],
        modelo: "openai:gpt-image-1.5",
      };
    }

    response = await fetch("https://api.openai.com/v1/images/edits", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openaiKey}`,
      },
      body: form,
    });
  } else {
    response = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openaiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: Deno.env.get("STUDIO_OPENAI_IMAGE_MODEL") || "gpt-image-1.5",
        prompt,
        n: versions,
        size: Deno.env.get("STUDIO_IMAGE_SIZE") || "1024x1024",
        quality: Deno.env.get("STUDIO_IMAGE_QUALITY") || "high",
        output_format: Deno.env.get("STUDIO_IMAGE_FORMAT") || "png",
      }),
    });
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    return {
      providerStatus: "error",
      error: payload,
      images: [],
      modelo: "openai:gpt-image-1.5",
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
    modelo: Deno.env.get("STUDIO_OPENAI_IMAGE_MODEL") || "gpt-image-1.5",
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

    const erroPayload = validarPayload(body);
    if (erroPayload) {
      return respostaJson({ erro: erroPayload }, 400);
    }

    const acesso = await validarAcessoEmpresa(req, body.empresa_id!);
    if ("error" in acesso) {
      return respostaJson({ erro: acesso.error }, acesso.status);
    }

    const input = body as GenerateSceneInput;
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
