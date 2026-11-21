-- Compras com fotos (16/11/2026): o registro devolve também quem o criou, para a tela mostrar a foto do solicitante.
CREATE OR REPLACE FUNCTION public.compras_json(r compras_registros)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
 select r.dados || jsonb_build_object('id',r.id,'numero',r.numero,'status',r.status,'created_at',r.created_at,'updated_at',r.updated_at,'criado_por',r.criado_por)
$function$;
