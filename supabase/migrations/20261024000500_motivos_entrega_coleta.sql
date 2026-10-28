begin;
create table public.logistica_motivos (
 id uuid primary key default gen_random_uuid(),
 empresa_id uuid not null references public.empresas(id),
 etapa text not null check(etapa in ('entrega','coleta')),
 nome text not null check(length(trim(nome)) between 3 and 120),
 ativo boolean not null default true
);
create unique index logistica_motivos_nome on public.logistica_motivos(empresa_id,etapa,lower(trim(nome)));
alter table public.logistica_motivos enable row level security;
create policy motivos_ler on public.logistica_motivos for select to authenticated using(public.eh_membro_empresa(empresa_id));
create policy motivos_criar on public.logistica_motivos for insert to authenticated with check(public.eh_membro_empresa(empresa_id) and public.funcionario_pode(empresa_id,auth.uid(),'configuracoes.empresa.editar'));
create policy motivos_editar on public.logistica_motivos for update to authenticated using(public.eh_membro_empresa(empresa_id) and public.funcionario_pode(empresa_id,auth.uid(),'configuracoes.empresa.editar')) with check(public.eh_membro_empresa(empresa_id) and public.funcionario_pode(empresa_id,auth.uid(),'configuracoes.empresa.editar'));
grant select,insert,update on public.logistica_motivos to authenticated;
revoke delete on public.logistica_motivos from anon,authenticated;
insert into public.logistica_motivos(empresa_id,etapa,nome)
 select e.id,v.etapa,v.nome from empresas e cross join(values
 ('entrega','Item não entregue'),('entrega','Devolução antecipada'),('entrega','Cliente dispensou o item'),
 ('coleta','Avaria identificada no local'),('coleta','Item não encontrado no local')
 ) v(etapa,nome);

-- O texto do motivo é resolvido no servidor e preservado em cada versão da confirmação.
do $migration$
declare fonte text; trecho text;
begin
 select pg_get_functiondef('public.logistica_confirmacao_salvar(uuid,text,text,jsonb,text,text)'::regprocedure) into fonte;
 trecho:='q:=(x->>''previsto'')::numeric;obs:=trim(coalesce(v->>''observacao'',''''));';
 if position(trecho in fonte)=0 then raise exception 'Validação de motivo não encontrada';end if;
 fonte:=replace(fonte,trecho,$replacement$
  q:=(x->>'previsto')::numeric;obs:='';
  if nullif(v->>'motivo_id','') is not null then
   select nome into obs from logistica_motivos where id=(v->>'motivo_id')::uuid and empresa_id=p.empresa_id and etapa=p_etapa and ativo;
   if not found then raise exception 'Motivo inválido ou inativo. Revise os motivos em Parâmetros';end if;
  elsif length(trim(coalesce(v->>'observacao','')))>0 then
   raise exception 'Selecione um motivo cadastrado em Parâmetros';
  end if;
 $replacement$);
 fonte:=replace(fonte,'''observacao'',obs)','''observacao'',obs,''motivo_id'',v->>''motivo_id'')');
 execute fonte;
end $migration$;
notify pgrst,'reload schema';
commit;
