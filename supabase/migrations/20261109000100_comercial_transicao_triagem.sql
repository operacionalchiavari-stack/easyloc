begin;
-- A liberação fica visível na Triagem até o Comercial assumir a edição.
do $$ declare fonte text; trecho text; begin
 select pg_get_functiondef('public.pedido_fluxo_etapa(public.separacoes_pedidos)'::regprocedure) into fonte;
 trecho:='if p.reducao_liberada_em is not null then return ''comercial''; end if;';
 if position(trecho in fonte)=0 then raise exception 'Fluxo de liberação incompatível'; end if;
 fonte:=replace(fonte,trecho,$sql$if p.reducao_liberada_em is not null then
  if p.operacao->'revisao_comercial'->'liberacao'=to_jsonb(p.reducao_liberada_em) then return 'comercial'; end if;
  return 'triagem';
 end if;$sql$);
 execute fonte;
 -- Após a edição ser assumida, a Triagem não pode cancelar por uma tela desatualizada.
 select pg_get_functiondef('public.operacao_transferir_pedido(uuid,text,text)'::regprocedure) into fonte;
 trecho:='op:=coalesce(p.operacao,''{}'');';
 if position(trecho in fonte)=0 then raise exception 'Transferência incompatível'; end if;
 fonte:=replace(fonte,trecho,$sql$if p_acao='retomar_triagem' and p.reducao_liberada_em is not null
   and p.operacao->'revisao_comercial'->'liberacao'=to_jsonb(p.reducao_liberada_em) then
   raise exception 'O Comercial já abriu o pedido para edição';
 end if;
 op:=coalesce(p.operacao,'{}');$sql$);
 execute fonte;
end $$;

create or replace function public.pedido_assumir_revisao(p_pedido uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare p separacoes_pedidos;
begin
 select * into strict p from separacoes_pedidos where id=p_pedido for update;
 if auth.uid() is null or not eh_membro_empresa(p.empresa_id) or not seguranca_2fa_ok()
  or not operacao_pode(p.empresa_id,'comercial.pedidos.editar') then raise exception 'Sem permissão para editar o pedido' using errcode='42501'; end if;
 if p.reducao_liberada_em is null then return to_jsonb(p); end if;
 if p.operacao->'revisao_comercial'->'liberacao'=to_jsonb(p.reducao_liberada_em) then return to_jsonb(p); end if;
 perform set_config('app.fluxo_transferencia','sim',true);
 update separacoes_pedidos set operacao=jsonb_set(coalesce(operacao,'{}'),'{revisao_comercial}',
   jsonb_build_object('liberacao',p.reducao_liberada_em,'iniciada_em',now(),'usuario_id',auth.uid())),
   revisao=revisao+1,atualizado_em=now() where id=p.id returning * into p;
 perform set_config('app.fluxo_transferencia','nao',true);
 return to_jsonb(p);
end $$;
revoke all on function public.pedido_assumir_revisao(uuid) from public,anon;
grant execute on function public.pedido_assumir_revisao(uuid) to authenticated;
notify pgrst,'reload schema';
commit;
