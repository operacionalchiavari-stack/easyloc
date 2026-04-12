import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req: Request) => {

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {

    const body = await req.json();

    if (!body?.origem || !body?.destino) {
      return new Response(
        JSON.stringify({ error: "Origem ou destino não enviados." }),
        { status: 400, headers: corsHeaders }
      );
    }

    const GOOGLE_KEY = Deno.env.get("GOOGLE_MAPS_KEY");

    if (!GOOGLE_KEY) {
      return new Response(
        JSON.stringify({ error: "GOOGLE_MAPS_KEY não configurada." }),
        { status: 500, headers: corsHeaders }
      );
    }

    const url =
      `https://maps.googleapis.com/maps/api/distancematrix/json?` +
      `origins=${encodeURIComponent(body.origem)}` +
      `&destinations=${encodeURIComponent(body.destino)}` +
      `&key=${GOOGLE_KEY}`;

    const response = await fetch(url);
    const data = await response.json();
    console.log("Resposta Google:", data);

    if (
      !data.rows ||
      !data.rows[0] ||
      !data.rows[0].elements ||
      !data.rows[0].elements[0] ||
      data.rows[0].elements[0].status !== "OK"
    ) {
      return new Response(
        JSON.stringify({ error: "Erro ao calcular distância.", details: data }),
        { status: 500, headers: corsHeaders }
      );
    }

    const metros = data.rows[0].elements[0].distance.value;
    const km = metros / 1000;

    return new Response(
      JSON.stringify({ km }),
      { headers: corsHeaders }
    );

  } catch (err) {

    return new Response(
      JSON.stringify({ error: "Erro interno", details: String(err) }),
      { status: 500, headers: corsHeaders }
    );
  }
});