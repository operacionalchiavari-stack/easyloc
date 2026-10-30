-- Separação por setor (out/2026): cada item tem um setor (itens.setor_estoque, no Cadastro de Itens). Com a regra ligada
-- em Parâmetros > Logística e operação, cada pessoa só vê e só separa na Triagem os itens dos setores liberados para ela.
-- Pessoa sem regra própria (ou regra desligada) vê todos os setores. Item sem setor conta como 'Sem setor'.
begin;
create table if not exists public.separacao_setores (
  empresa_id uuid primary key references public.empresas(id) on delete cascade,
  ativo boolean not null default false,
  usuarios jsonb not null default '{}'::jsonb,   -- { "<usuario_id>": ["Móveis","Louças"] } ; ausente = todos os setores
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid
);
alter table public.separacao_setores enable row level security;
drop policy if exists separacao_setores_ler on public.separacao_setores;
create policy separacao_setores_ler on public.separacao_setores for select to authenticated using (public.eh_membro_empresa(empresa_id));

-- Setor de um item do cadastro (vazio = 'Sem setor').
create or replace function public.separacao_setor_item(p_item uuid) returns text language sql stable security definer set search_path to 'public' as $fn$
  select coalesce(nullif(btrim((select setor_estoque from public.itens where id=p_item)),''),'Sem setor')
$fn$;
revoke all on function public.separacao_setor_item(uuid) from public, anon;

-- Setores que a pessoa logada separa: null = todos.
create or replace function public.separacao_meus_setores(p_empresa uuid) returns jsonb language plpgsql stable security definer set search_path to 'public' as $fn$
declare r public.separacao_setores;
begin
  if auth.uid() is null or not public.eh_membro_empresa(p_empresa) then return null; end if;
  select * into r from public.separacao_setores where empresa_id=p_empresa;
  if r.empresa_id is null or not r.ativo or not (r.usuarios ? auth.uid()::text) then return null; end if;
  return r.usuarios->auth.uid()::text;
end $fn$;
revoke all on function public.separacao_meus_setores(uuid) from public, anon;
grant execute on function public.separacao_meus_setores(uuid) to authenticated;

-- Setores existentes: os do Cadastro de Itens + qualquer outro já gravado nos itens + 'Sem setor'.
create or replace function public.separacao_setores_lista(p_empresa uuid) returns jsonb language sql stable security definer set search_path to 'public' as $fn$
  select jsonb_agg(s order by o, s) from (
    select s, min(o) o from (
      select unnest(array['Almoxarifado','Estoque Geral','Decoração','Louças','Iluminação','Móveis']) s, 1 o
      union all select distinct btrim(setor_estoque), 2 from public.itens where empresa_id=p_empresa and nullif(btrim(setor_estoque),'') is not null
      union all select 'Sem setor', 3
    ) x group by s
  ) y where public.eh_membro_empresa(p_empresa)
$fn$;
revoke all on function public.separacao_setores_lista(uuid) from public, anon;
grant execute on function public.separacao_setores_lista(uuid) to authenticated;

create or replace function public.separacao_setores_salvar(p_empresa uuid, p_ativo boolean, p_usuarios jsonb) returns void
language plpgsql security definer set search_path to 'public' as $fn$
declare k text; v jsonb;
begin
  if auth.uid() is null or not public.eh_membro_empresa(p_empresa) or not public.operacao_pode(p_empresa,'configuracoes.empresa.editar') then
    raise exception 'Sem permissão para configurar a separação';
  end if;
  if jsonb_typeof(coalesce(p_usuarios,'{}'))<>'object' then raise exception 'Configuração inválida'; end if;
  for k, v in select * from jsonb_each(coalesce(p_usuarios,'{}')) loop
    if jsonb_typeof(v)<>'array' then raise exception 'Configuração inválida'; end if;
    if jsonb_array_length(v)=0 then raise exception 'Cada pessoa precisa de pelo menos um setor (ou "Todos os setores").'; end if;
  end loop;
  insert into public.separacao_setores(empresa_id,ativo,usuarios,atualizado_em,atualizado_por)
  values(p_empresa,coalesce(p_ativo,false),coalesce(p_usuarios,'{}'),now(),auth.uid())
  on conflict(empresa_id) do update set ativo=excluded.ativo, usuarios=excluded.usuarios, atualizado_em=now(), atualizado_por=auth.uid();
end $fn$;
revoke all on function public.separacao_setores_salvar(uuid,boolean,jsonb) from public, anon;
grant execute on function public.separacao_setores_salvar(uuid,boolean,jsonb) to authenticated;

-- Trava no servidor: separar uma linha só se o setor dela (num Kit, de algum componente) for da pessoa.
create or replace function public.operacao_atualizar_separacao(p_item uuid, p_dados jsonb, p_quantidade_anterior numeric, p_componentes_anteriores jsonb DEFAULT '{}'::jsonb, p_etiqueta uuid DEFAULT NULL::uuid) returns void
language plpgsql security definer set search_path to 'public' as $fn$
declare ped uuid; emp uuid; item uuid; meus jsonb; setores text[];
begin
  select separacao_pedido_id, empresa_id, item_id into ped, emp, item from public.separacoes_itens where id=p_item;
  if ped is not null then perform public.pedido_pagamento_conferir(ped,'triagem'); end if;
  meus:=public.separacao_meus_setores(emp);
  if meus is not null and item is not null then
    -- Kit: vale o setor dos componentes (é o que se separa); item comum: o setor dele.
    select array_agg(distinct public.separacao_setor_item(k.item_id)) into setores from public.kit_itens k where k.kit_id=item;
    if setores is null then setores:=array[public.separacao_setor_item(item)]; end if;
    if not exists(select 1 from unnest(setores) s where meus ? s) then
      raise exception 'Este item é do setor %, que não está liberado para você separar.', array_to_string(setores,', ');
    end if;
  end if;
  perform public.operacao_atualizar_separacao_sem_pagamento(p_item,p_dados,p_quantidade_anterior,p_componentes_anteriores,p_etiqueta);
end $fn$;
notify pgrst,'reload schema';
commit;
