begin;
create table public.fin_posicao_motivos (
 id uuid primary key default gen_random_uuid(),empresa_id uuid not null references public.empresas(id),
 nome text not null check(length(btrim(nome)) between 3 and 120),ordem integer not null default 1,ativo boolean not null default true
);
create unique index fin_posicao_motivos_nome on public.fin_posicao_motivos(empresa_id,lower(btrim(nome)));
alter table public.fin_posicao_motivos enable row level security;
create policy fin_posicao_motivos_ler on public.fin_posicao_motivos for select to authenticated using(public.eh_membro_empresa(empresa_id));
create policy fin_posicao_motivos_criar on public.fin_posicao_motivos for insert to authenticated with check(public.eh_membro_empresa(empresa_id) and public.funcionario_pode(empresa_id,auth.uid(),'configuracoes.empresa.editar'));
create policy fin_posicao_motivos_editar on public.fin_posicao_motivos for update to authenticated using(public.eh_membro_empresa(empresa_id) and public.funcionario_pode(empresa_id,auth.uid(),'configuracoes.empresa.editar')) with check(public.eh_membro_empresa(empresa_id) and public.funcionario_pode(empresa_id,auth.uid(),'configuracoes.empresa.editar'));
revoke all on public.fin_posicao_motivos from anon,authenticated;
grant select,insert,update on public.fin_posicao_motivos to authenticated;
do $migration$
declare fn regprocedure;def text;antigo text;
begin
 fn:=coalesce(to_regprocedure('public.fin_posicao_final_salvar_antes_fluxo(uuid,uuid,text,integer,jsonb,boolean)'),to_regprocedure('public.fin_posicao_final_salvar(uuid,uuid,text,integer,jsonb,boolean)'));
 select pg_get_functiondef(fn) into def;
 antigo:='motivo_desconto text;';
 if position(antigo in def)=0 then raise exception 'Declaracao financeira diferente da esperada';end if;
 def:=replace(def,antigo,antigo||' motivo_id uuid; motivo_salvo jsonb;');
 antigo:='  motivo:=btrim(coalesce(d->>''justificativa'',''''));';
 if position(antigo in def)=0 then raise exception 'Motivo financeiro diferente do esperado';end if;
 def:=replace(def,antigo,$patch$  motivo:=btrim(coalesce(d->>'justificativa',''));motivo_id:=null;
  if decisao='dispensar' then
   select v into motivo_salvo from jsonb_array_elements(coalesce(f.itens,'[]')) v where v->>'chave'=x->>'chave' and v->>'decisao'='dispensar';
   if motivo_salvo is not null and motivo_salvo->>'justificativa'=motivo and coalesce(motivo_salvo->>'justificativa_id','')=coalesce(d->>'justificativa_id','') then
    motivo_id:=nullif(motivo_salvo->>'justificativa_id','')::uuid;
   else
    select id,nome into motivo_id,motivo from fin_posicao_motivos where empresa_id=p_empresa and id::text=d->>'justificativa_id' and ativo;
    if motivo_id is null then raise exception 'Selecione um motivo cadastrado em Parametros > Financeiro para nao cobrar';end if;
   end if;
  else motivo:='';end if;
$patch$);
 antigo:='''justificativa'',motivo,''desconto''';
 if position(antigo in def)=0 then raise exception 'Registro financeiro diferente do esperado';end if;
 def:=replace(def,antigo,'''justificativa'',motivo,''justificativa_id'',motivo_id,''desconto''');
 execute def;
end $migration$;
notify pgrst,'reload schema';
commit;
