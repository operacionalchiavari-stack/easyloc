-- Gestão do acervo: as fotos do retorno juntam as anexadas na coleta (logistica_evidencias) com as do App e da
-- Triagem da volta (coluna acervo_retornos.evidencias, nov/2026). Antes os dois tinham o mesmo nome no resultado.
CREATE OR REPLACE FUNCTION public.acervo_painel_antes_visual(p_empresa uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare retornos jsonb;inventarios jsonb;begin
 if not eh_membro_empresa(p_empresa) or not funcionario_tabela_permitida(p_empresa,'itens','select') then raise exception 'Sem permissão para consultar o acervo';end if;
 select coalesce(jsonb_agg((to_jsonb(x)-'evid_coleta')||jsonb_build_object('evidencias',coalesce(x.evidencias,'[]'::jsonb)||x.evid_coleta) order by x.atualizado_em desc),'[]') into retornos from(
 select a.*,i.produto nome,i.foto_url,p.numero_pedido,p.cliente_nome,
 (select coalesce(jsonb_agg(to_jsonb(h) order by h.criado_em),'[]') from acervo_historico h where h.retorno_id=a.id) historico,
 (select coalesce(jsonb_agg(to_jsonb(e) order by e.criado_em),'[]') from logistica_evidencias e where e.pedido_id=a.pedido_id and e.chave=a.chave) evid_coleta
 from acervo_retornos a join itens i on i.id=a.item_id left join separacoes_pedidos p on p.id=a.pedido_id where a.empresa_id=p_empresa)x;
 select coalesce(jsonb_agg(to_jsonb(x) order by x.criado_em desc),'[]') into inventarios from(
 select a.*,(select coalesce(jsonb_agg(to_jsonb(c)||jsonb_build_object('nome',i.produto) order by i.produto),'[]') from acervo_inventario_itens c join itens i on i.id=c.item_id where c.inventario_id=a.id) itens
 from acervo_inventarios a where a.empresa_id=p_empresa)x;
 return jsonb_build_object('retornos',retornos,'inventarios',inventarios);
end $function$
;
