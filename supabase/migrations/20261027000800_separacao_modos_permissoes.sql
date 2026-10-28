create table public.empresa_separacao_modos (
 empresa_id uuid not null references public.empresas(id) on delete cascade,
 modo text not null check(modo in ('manual','qr','um-clique')),
 ativo boolean not null default true,
 todos boolean not null default true,
 funcionarios uuid[] not null default '{}',
 primary key(empresa_id,modo)
);
alter table public.empresa_separacao_modos enable row level security;
grant select,insert,update on public.empresa_separacao_modos to authenticated;
create policy separacao_modos_ler on public.empresa_separacao_modos for select to authenticated using(public.eh_membro_empresa(empresa_id));
create policy separacao_modos_criar on public.empresa_separacao_modos for insert to authenticated with check(public.eh_membro_empresa(empresa_id) and public.operacao_pode(empresa_id,'configuracoes.empresa.editar'));
create policy separacao_modos_editar on public.empresa_separacao_modos for update to authenticated using(public.eh_membro_empresa(empresa_id) and public.operacao_pode(empresa_id,'configuracoes.empresa.editar')) with check(public.eh_membro_empresa(empresa_id) and public.operacao_pode(empresa_id,'configuracoes.empresa.editar'));
create function public.separacao_modos_disponiveis(p_empresa uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
begin
 if auth.uid() is null or not public.eh_membro_empresa(p_empresa) then raise exception 'Sem acesso a empresa';end if;
 return (select jsonb_object_agg(m.modo,coalesce(c.ativo,true) and (coalesce(c.todos,true) or auth.uid()=any(c.funcionarios)))
 from (values('manual'),('qr'),('um-clique')) m(modo)
 left join public.empresa_separacao_modos c on c.empresa_id=p_empresa and c.modo=m.modo);
end $$;
revoke all on function public.separacao_modos_disponiveis(uuid) from public,anon;
grant execute on function public.separacao_modos_disponiveis(uuid) to authenticated;
-- Confere o modo na propria funcao atomica, preservando suas validacoes e bloqueios.
do $patch$
declare fonte text;trecho text;
begin
 fonte:=pg_get_functiondef('public.operacao_atualizar_separacao(uuid,jsonb,numeric,jsonb,uuid)'::regprocedure);
 trecho:='  select * into strict p from public.separacoes_pedidos where id=i.separacao_pedido_id for update;';
 if position(trecho in fonte)=0 then raise exception 'Funcao de separacao diferente da esperada';end if;
 fonte:=replace(fonte,trecho,trecho||$guard$
  if not coalesce((public.separacao_modos_disponiveis(p.empresa_id)->>coalesce(p_dados->>'modo_separacao','manual'))::boolean,false) then
   raise exception 'Este modo de separacao nao esta liberado para voce. Confira os Parametros.';
  end if;
$guard$);
 execute fonte;
end $patch$;
create function public.separacao_modos_funcionarios(p_empresa uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
begin
 if auth.uid() is null or not public.eh_membro_empresa(p_empresa) or not public.operacao_pode(p_empresa,'configuracoes.empresa.editar') then raise exception 'Sem permissao para configurar a separacao';end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',id,'nome',nome) order by nome) from public.funcionarios_acesso where empresa_id=p_empresa and ativo and acesso_sistema),'[]');
end $$;
revoke all on function public.separacao_modos_funcionarios(uuid) from public,anon;
grant execute on function public.separacao_modos_funcionarios(uuid) to authenticated;
