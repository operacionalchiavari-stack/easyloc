import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: Record<string, unknown>, status = 200){
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json"
    }
  });
}

serve(async (req: Request) => {
  const debugBase = {
    arquivo: "supabase/functions/calcular-distancia/index.ts",
    funcao: "calcular-distancia",
    metodo: req.method
  };

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => null);
    const origemRaw = body?.origem ?? body?.origin;
    const destinoRaw = body?.destino ?? body?.destination;
    const origem = typeof origemRaw === "string" ? origemRaw.trim() : "";
    const destino = typeof destinoRaw === "string" ? destinoRaw.trim() : "";

    console.log("[EasyLoc Debug]", {
      ...debugBase,
      parametrosRecebidos: body,
      latitudeOrigem: body?.latitudeOrigem ?? null,
      longitudeOrigem: body?.longitudeOrigem ?? null,
      latitudeDestino: body?.latitudeDestino ?? null,
      longitudeDestino: body?.longitudeDestino ?? null,
      origem,
      destino,
      origemVazia: !origem,
      destinoVazio: !destino,
      origemNaN: Number.isNaN(Number(origem)),
      destinoNaN: Number.isNaN(Number(destino))
    });

    if (!origem || !destino) {
      const campoCausador = !origem ? "origem" : "destino";

      console.warn("[EasyLoc Debug]", {
        ...debugBase,
        status: 400,
        erro: "Origem ou destino nao enviados.",
        campoCausador,
        bodyRecebido: body
      });

      return jsonResponse({
        error: "Origem ou destino nao enviados.",
        campoCausador,
        bodyRecebido: body
      }, 400);
    }

    const GOOGLE_KEY = Deno.env.get("GOOGLE_MAPS_KEY");

    if (!GOOGLE_KEY) {
      console.error("[EasyLoc Debug]", {
        ...debugBase,
        status: 500,
        erro: "GOOGLE_MAPS_KEY nao configurada."
      });

      return jsonResponse({ error: "GOOGLE_MAPS_KEY nao configurada." }, 500);
    }

    const url =
      `https://maps.googleapis.com/maps/api/distancematrix/json?` +
      `origins=${encodeURIComponent(origem)}` +
      `&destinations=${encodeURIComponent(destino)}` +
      `&key=${GOOGLE_KEY}`;

    console.log("[EasyLoc Debug]", {
      ...debugBase,
      requisicaoEnviada: {
        api: "Google Distance Matrix",
        origem,
        destino,
        urlSemChave: url.replace(GOOGLE_KEY, "[GOOGLE_MAPS_KEY]")
      }
    });

    const response = await fetch(url);
    const data = await response.json();

    console.log("[EasyLoc Debug]", {
      ...debugBase,
      respostaRecebida: {
        statusHttp: response.status,
        statusGoogle: data?.status,
        destinoStatus: data?.rows?.[0]?.elements?.[0]?.status,
        details: data
      }
    });

    const element = data?.rows?.[0]?.elements?.[0];
    if (!element || element.status !== "OK") {
      const diagnostico = {
        ok: false,
        error: "Erro ao calcular distancia.",
        origem,
        destino,
        statusGoogle: data?.status || null,
        errorMessageGoogle: data?.error_message || null,
        destinoStatus: element?.status || null,
        details: data
      };

      console.error("[EasyLoc Debug]", {
        ...debugBase,
        status: 502,
        diagnostico
      });

      return jsonResponse(diagnostico);
    }

    const metros = element.distance.value;
    const km = metros / 1000;

    return jsonResponse({ km });

  } catch (err) {
    console.error("[EasyLoc Debug]", {
      ...debugBase,
      status: 500,
      erro: "Erro interno",
      detalhes: String(err)
    });

    return jsonResponse({ error: "Erro interno", details: String(err) }, 500);
  }
});
