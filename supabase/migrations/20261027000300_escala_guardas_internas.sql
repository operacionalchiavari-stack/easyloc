-- Protege tambem chamadas internas ja preparadas antes da troca dos wrappers.
begin;
do $m$
declare fonte text; trecho text;
begin
 fonte:=pg_get_functiondef('public.operacao_escala_preencher_sem_fluxo(uuid,uuid[])'::regprocedure);
 trecho:='where e.empresa_id = p_empresa and e.id = any(p_etapas)';
 if position(trecho in fonte)=0 then raise exception 'Corpo do preenchimento inesperado'; end if;
 fonte:=replace(fonte,trecho,trecho||$g$ and (e.pedido_id is null or exists(select 1 from public.separacoes_pedidos p where p.id=e.pedido_id and public.pedido_fluxo_etapa(p) in ('triagem','expedicao')))$g$);
 execute fonte;
 fonte:=pg_get_functiondef('public.operacao_escala_salvar_sem_fluxo(uuid,text,text[],text[],boolean)'::regprocedure);
 trecho:='select * into e from operacao_etapas where id = p_etapa;';
 if position(trecho in fonte)=0 then raise exception 'Corpo da escala inesperado'; end if;
 fonte:=replace(fonte,trecho,trecho||$g$
 if exists(select 1 from public.separacoes_pedidos p where p.id=e.pedido_id and public.pedido_fluxo_etapa(p) not in ('triagem','expedicao')) then
  raise exception 'Pre-reserva e somente consulta. Pedido fora do planejamento.';
 end if;
$g$);
 execute fonte;
end $m$;
commit;
