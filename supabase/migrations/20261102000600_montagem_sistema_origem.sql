begin;
alter table public.app_sessoes add column if not exists origem text not null default 'mobile' check(origem in ('mobile','sistema'));
alter table public.operacao_registros add column if not exists origem text not null default 'mobile' check(origem in ('mobile','sistema'));
create or replace function public.mont_login_sistema() returns jsonb
language plpgsql security definer set search_path=public as $$
declare r jsonb;
begin
 -- Reuses the existing Supervisor permission; no impersonation of the assembler.
 r:=mont_login_supervisor();
 update app_sessoes set origem='sistema',expira_em=now()+interval '8 hours' where token_hash=app_hash(r->>'token');
 return r;
end $$;
revoke all on function public.mont_login_sistema() from public,anon;
grant execute on function public.mont_login_sistema() to authenticated;
do $$ declare d text;
begin
 select pg_get_functiondef('public.app_sessao(text,text)'::regprocedure) into d;
 if position('acervo.registro_origem' in d)=0 then
  d:=replace(d,'return s;', 'perform set_config(''acervo.registro_origem'',s.origem,true); return s;');
  d:=replace(d,' STABLE',' VOLATILE');
  execute d;
 end if;
end $$;
create or replace function public.operacao_registro_origem() returns trigger
language plpgsql set search_path=public as $$
begin
 new.origem:=case when current_setting('acervo.registro_origem',true)='sistema' then 'sistema' else 'mobile' end;
 return new;
end $$;
revoke all on function public.operacao_registro_origem() from public,anon,authenticated;
drop trigger if exists operacao_registro_origem on public.operacao_registros;
create trigger operacao_registro_origem before insert or update of dados on public.operacao_registros
 for each row execute function public.operacao_registro_origem();
create or replace function public.logistica_montagem_registros(p_pedido uuid) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare p separacoes_pedidos; r jsonb;
begin
 select * into strict p from separacoes_pedidos where id=p_pedido;
 if auth.uid() is null or not eh_membro_empresa(p.empresa_id) or not funcionario_tabela_permitida(p.empresa_id,'separacoes_pedidos','select') then raise exception 'Sem acesso'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'nome',e.nome,'tipo',e.tipo,'data',e.data,
  'registros',(select coalesce(jsonb_agg(to_jsonb(x) order by x.criado_em),'[]') from operacao_registros x where x.etapa_id=e.id and x.empresa_id=p.empresa_id)) order by e.data,e.hora),'[]') into r
 from operacao_etapas e join separacoes_pedidos sp on sp.id=e.pedido_id
 where e.empresa_id=p.empresa_id and sp.empresa_id=p.empresa_id and (sp.id=p.id or sp.pedido_origem_id=p.id) and e.tipo in ('montagem','desmontagem');
 return r;
end $$;
revoke all on function public.logistica_montagem_registros(uuid) from public,anon;
grant execute on function public.logistica_montagem_registros(uuid) to authenticated;
notify pgrst,'reload schema';
commit;
