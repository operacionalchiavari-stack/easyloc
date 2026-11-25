-- Equipes fixas por responsável: preferência da escala automática, com fallback para pessoas disponíveis.
create table if not exists public.escala_equipes_fixas (
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  responsavel_id uuid not null references public.funcionarios_acesso(id) on delete cascade,
  pessoa_tipo text not null check (pessoa_tipo in ('func','free')),
  pessoa_id uuid not null,
  ordem integer not null default 0 check (ordem >= 0),
  criado_em timestamptz not null default now(),
  primary key (empresa_id,responsavel_id,pessoa_tipo,pessoa_id)
);
create index if not exists escala_equipes_fixas_responsavel_idx on public.escala_equipes_fixas(empresa_id,responsavel_id,ordem);
alter table public.escala_equipes_fixas enable row level security;

drop policy if exists escala_equipes_fixas_ler on public.escala_equipes_fixas;
create policy escala_equipes_fixas_ler on public.escala_equipes_fixas for select to authenticated
 using (seguranca_2fa_ok() and eh_membro_empresa(empresa_id));

create or replace function public.escala_equipes_fixas_listar(p_empresa uuid) returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
 select case when eh_membro_empresa(p_empresa) then coalesce(jsonb_agg(jsonb_build_object(
   'responsavel_id',x.responsavel_id,'pessoa_tipo',x.pessoa_tipo,'pessoa_id',x.pessoa_id,'ordem',x.ordem
 ) order by x.responsavel_id,x.ordem),'[]'::jsonb) else '[]'::jsonb end
 from escala_equipes_fixas x where x.empresa_id=p_empresa
$$;

create or replace function public.escala_equipes_fixas_salvar(p_empresa uuid,p_responsavel uuid,p_pessoas jsonb) returns integer
language plpgsql security definer set search_path=public,pg_temp as $$
declare item jsonb; tipo text; pid uuid; n int:=0;
begin
 if not escala_controle_pode(p_empresa) then raise exception 'Sem permissão para alterar os parâmetros da escala.'; end if;
 if not exists(select 1 from funcionarios_acesso where id=p_responsavel and empresa_id=p_empresa and ativo and lider_operacao) then
  raise exception 'Selecione um responsável ativo.';
 end if;
 if jsonb_typeof(coalesce(p_pessoas,'[]'))<>'array' then raise exception 'Equipe inválida.'; end if;
 delete from escala_equipes_fixas where empresa_id=p_empresa and responsavel_id=p_responsavel;
 for item in select value from jsonb_array_elements(coalesce(p_pessoas,'[]')) loop
  tipo:=item->>'tipo'; pid:=nullif(item->>'id','')::uuid;
  if tipo='func' then
   if pid=p_responsavel then raise exception 'O responsável já faz parte da escala como líder.'; end if;
   if not exists(select 1 from funcionarios_acesso where id=pid and empresa_id=p_empresa and ativo and equipe_operacional is not null) then raise exception 'Funcionário inválido.'; end if;
  elsif tipo='free' then
   if not exists(select 1 from free_cadastros where id=pid and empresa_id=p_empresa and status='aprovado') then raise exception 'Free inválido.'; end if;
  else raise exception 'Pessoa inválida.';
  end if;
  insert into escala_equipes_fixas(empresa_id,responsavel_id,pessoa_tipo,pessoa_id,ordem)
  values(p_empresa,p_responsavel,tipo,pid,n) on conflict do nothing;
  n:=n+1;
 end loop;
 return n;
end $$;

create or replace function public.escala_equipes_fixas_excluir(p_empresa uuid,p_responsavel uuid) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if not escala_controle_pode(p_empresa) then raise exception 'Sem permissão para alterar os parâmetros da escala.'; end if;
 delete from escala_equipes_fixas where empresa_id=p_empresa and responsavel_id=p_responsavel;
end $$;

revoke all on function public.escala_equipes_fixas_listar(uuid) from public,anon;
revoke all on function public.escala_equipes_fixas_salvar(uuid,uuid,jsonb) from public,anon;
revoke all on function public.escala_equipes_fixas_excluir(uuid,uuid) from public,anon;
grant execute on function public.escala_equipes_fixas_listar(uuid) to authenticated;
grant execute on function public.escala_equipes_fixas_salvar(uuid,uuid,jsonb) to authenticated;
grant execute on function public.escala_equipes_fixas_excluir(uuid,uuid) to authenticated;

-- Acrescenta a preferência sem retirar os filtros atuais de conflito, restrição e disponibilidade.
do $$
declare src text;
begin
 src:=pg_get_functiondef('public.operacao_escala_preencher_sem_fluxo(uuid,uuid[])'::regprocedure);
 if position('equipe_fixa_prioridade' in src)>0 then return; end if;
 src:=replace(src,
   'pessoa record; cam record; par uuid;',
   'pessoa record; cam record; par uuid; v_responsavel uuid; -- equipe_fixa_prioridade');
 src:=replace(src,
   'n_eq := (select count(*) from operacao_etapa_pessoas where etapa_id = et.id and papel = ''equipe'');',
   'select funcionario_id into v_responsavel from operacao_etapa_pessoas where etapa_id=et.id and papel=''responsavel'' limit 1;'||chr(10)||'    n_eq := (select count(*) from operacao_etapa_pessoas where etapa_id = et.id and papel = ''equipe'');');
 src:=replace(src,
   'select f.id, null::uuid free_id, f.nome, 1 grupo, f.lider_operacao ordem2,',
   'select f.id, null::uuid free_id, f.nome, case when ef.pessoa_id is not null then 0 else 1 end grupo, f.lider_operacao ordem2,');
 src:=replace(src,
   'from funcionarios_acesso f'||chr(10)||'         where f.empresa_id = p_empresa and f.ativo and f.equipe_operacional = conf->>''equipe''',
   'from funcionarios_acesso f left join escala_equipes_fixas ef on ef.empresa_id=p_empresa and ef.responsavel_id=v_responsavel and ef.pessoa_tipo=''func'' and ef.pessoa_id=f.id'||chr(10)||'         where f.empresa_id = p_empresa and f.ativo and (f.equipe_operacional = conf->>''equipe'' or ef.pessoa_id is not null)');
 src:=replace(src,
   'select null, c.id, c.nome, 3, false,',
   'select null, c.id, c.nome, case when ef.pessoa_id is not null then 0 else 3 end, false,');
 src:=replace(src,
   'from free_cadastros c'||chr(10)||'         where c.empresa_id = p_empresa and c.status = ''aprovado''',
   'from free_cadastros c left join escala_equipes_fixas ef on ef.empresa_id=p_empresa and ef.responsavel_id=v_responsavel and ef.pessoa_tipo=''free'' and ef.pessoa_id=c.id'||chr(10)||'         where c.empresa_id = p_empresa and c.status = ''aprovado''');
 if position('select funcionario_id into v_responsavel' in src)=0
    or position('ef.pessoa_tipo=''func''' in src)=0
    or position('ef.pessoa_tipo=''free''' in src)=0 then
  raise exception 'Não foi possível integrar as equipes fixas ao gerador automático.';
 end if;
 execute src;
end $$;

notify pgrst,'reload schema';
