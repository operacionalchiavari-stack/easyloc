create function public.acervo_painel(p_empresa uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare retornos jsonb;inventarios jsonb;begin
 if not eh_membro_empresa(p_empresa) or not funcionario_tabela_permitida(p_empresa,'itens','select') then raise exception 'Sem permissão para consultar o acervo';end if;
 select coalesce(jsonb_agg(to_jsonb(x) order by x.atualizado_em desc),'[]') into retornos from(
 select a.*,i.produto nome,i.foto_url,p.numero_pedido,p.cliente_nome,
 (select coalesce(jsonb_agg(to_jsonb(h) order by h.criado_em),'[]') from acervo_historico h where h.retorno_id=a.id) historico,
 (select coalesce(jsonb_agg(to_jsonb(e) order by e.criado_em),'[]') from logistica_evidencias e where e.pedido_id=a.pedido_id and e.chave=a.chave) evidencias
 from acervo_retornos a join itens i on i.id=a.item_id join separacoes_pedidos p on p.id=a.pedido_id where a.empresa_id=p_empresa)x;
 select coalesce(jsonb_agg(to_jsonb(x) order by x.criado_em desc),'[]') into inventarios from(
 select a.*,(select coalesce(jsonb_agg(to_jsonb(c)||jsonb_build_object('nome',i.produto) order by i.produto),'[]') from acervo_inventario_itens c join itens i on i.id=c.item_id where c.inventario_id=a.id) itens
 from acervo_inventarios a where a.empresa_id=p_empresa)x;
 return jsonb_build_object('retornos',retornos,'inventarios',inventarios);
end $$;
create function public.acervo_inventario_cancelar(p_empresa uuid,p_id uuid) returns void language plpgsql security definer set search_path=public as $$
begin
 if not eh_membro_empresa(p_empresa) or not funcionario_tabela_permitida(p_empresa,'itens','editar') then raise exception 'Sem permissão para cancelar o inventário';end if;
 update acervo_inventarios set status='cancelado',aprovado_por=auth.uid(),aprovado_em=now() where id=p_id and empresa_id=p_empresa and status='contagem';
 if not found then raise exception 'Inventário não está aberto';end if;
end $$;
revoke all on function public.acervo_painel(uuid),public.acervo_inventario_cancelar(uuid,uuid) from public,anon;
grant execute on function public.acervo_painel(uuid),public.acervo_inventario_cancelar(uuid,uuid) to authenticated;
