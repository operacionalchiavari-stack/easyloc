begin;

-- Personalizações comerciais têm acervo e arquivos próprios.
insert into storage.buckets(id,name,public) values('personalizacoes-ia','personalizacoes-ia',true)
on conflict(id) do nothing;

create table public.comercial_personalizacoes_ia (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  cliente_id uuid,
  item_id uuid,
  item_nome text not null,
  item_codigo text,
  categoria text not null,
  titulo text not null,
  tipo text not null check(tipo in ('tecido','tinta')),
  url text not null,
  path text not null,
  storage_bucket text not null default 'personalizacoes-ia',
  mime_type text,
  tamanho_bytes bigint,
  personalizacao jsonb not null,
  criado_por uuid,
  criado_em timestamptz not null default now()
);
create index comercial_personalizacoes_ia_empresa_idx on public.comercial_personalizacoes_ia(empresa_id,categoria,item_id,criado_em desc);
alter table public.comercial_personalizacoes_ia enable row level security;
grant select on public.comercial_personalizacoes_ia to authenticated;
grant all on public.comercial_personalizacoes_ia to service_role;
create policy comercial_personalizacoes_ia_leitura on public.comercial_personalizacoes_ia for select to authenticated
  using(public.seguranca_2fa_ok() and public.funcionario_pode(empresa_id,auth.uid(),'comercial.pedidos.visualizar'));

-- Conserva os IDs e URLs existentes: projetos já salvos continuam exibindo suas fotos.
insert into public.comercial_personalizacoes_ia(id,empresa_id,cliente_id,item_id,item_nome,item_codigo,categoria,titulo,tipo,
  url,path,storage_bucket,mime_type,tamanho_bytes,personalizacao,criado_por,criado_em)
select f.id,f.empresa_id,f.cliente_id,i.id,coalesce(i.produto,'Item personalizado'),i.codigo,
  coalesce(nullif(btrim(i.categoria),''),'Sem categoria'),coalesce(f.titulo,'Personalização'),
  case when f.personalizacao->>'tipo'='tinta' then 'tinta' else 'tecido' end,
  f.url,f.path,'biblioteca',f.mime_type,f.tamanho_bytes,f.personalizacao,f.criado_por,f.criado_em
from public.biblioteca_fotos f left join public.itens i on i.id::text=f.personalizacao->>'item_id' and i.empresa_id=f.empresa_id
where f.personalizacao is not null;
delete from public.biblioteca_fotos where personalizacao is not null;

-- Remove apenas as pastas automáticas vazias criadas pela implementação anterior.
do $$ declare n integer; begin
  loop
    delete from public.biblioteca_pastas p where p.automatica
      and not exists(select 1 from public.biblioteca_fotos f where f.pasta_id=p.id)
      and not exists(select 1 from public.biblioteca_pastas filha where filha.pai_id=p.id);
    get diagnostics n = row_count; exit when n=0;
  end loop;
end $$;
update public.biblioteca_pastas set automatica=false where automatica;
drop trigger if exists biblioteca_iniciar_empresa on public.empresas;
drop function if exists public.biblioteca_iniciar_empresa();

create or replace function public.comercial_personalizacao_ia_salvar(
  p_empresa uuid,p_cliente uuid,p_usuario uuid,p_item uuid,p_dados jsonb,
  p_path text,p_url text,p_mime text,p_tamanho bigint)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_item itens; v_foto comercial_personalizacoes_ia;
begin
  select * into v_item from itens where id=p_item and empresa_id=p_empresa;
  if not found then raise exception 'Item não pertence à empresa'; end if;
  if p_cliente is not null and not exists(select 1 from clientes_empresas where id=p_cliente and empresa_id=p_empresa)
    then raise exception 'Cliente não pertence à empresa'; end if;
  if p_path is null or p_path not like p_empresa::text||'/%' or p_url is null then raise exception 'Arquivo inválido'; end if;
  if p_dados is null or jsonb_typeof(p_dados)<>'object' or octet_length(p_dados::text)>30000
    then raise exception 'Personalização inválida'; end if;
  insert into comercial_personalizacoes_ia(empresa_id,cliente_id,item_id,item_nome,item_codigo,categoria,titulo,tipo,
    path,url,mime_type,tamanho_bytes,criado_por,personalizacao,storage_bucket)
  values(p_empresa,p_cliente,p_item,coalesce(v_item.produto,'Item'),v_item.codigo,
    coalesce(nullif(btrim(v_item.categoria),''),'Sem categoria'),
    coalesce(nullif(p_dados->>'descricao',''),case when p_dados->>'tipo'='tinta' then 'Tinta personalizada' else 'Tecido personalizado' end),
    case when p_dados->>'tipo'='tinta' then 'tinta' else 'tecido' end,
    p_path,p_url,p_mime,p_tamanho,p_usuario,p_dados||jsonb_build_object('item_id',p_item),
    case when p_url like '%/object/public/biblioteca/%' then 'biblioteca' else 'personalizacoes-ia' end)
  returning * into v_foto;
  return to_jsonb(v_foto);
end $$;
revoke all on function public.comercial_personalizacao_ia_salvar(uuid,uuid,uuid,uuid,jsonb,text,text,text,bigint) from public,anon,authenticated;
grant execute on function public.comercial_personalizacao_ia_salvar(uuid,uuid,uuid,uuid,jsonb,text,text,text,bigint) to service_role;

-- Compatibilidade com uma geração que tenha começado antes da atualização do serviço.
create or replace function public.biblioteca_personalizacao_salvar(
  p_empresa uuid,p_cliente uuid,p_usuario uuid,p_item uuid,p_dados jsonb,
  p_path text,p_url text,p_mime text,p_tamanho bigint)
returns jsonb language sql security definer set search_path=public as $$
  select comercial_personalizacao_ia_salvar(p_empresa,p_cliente,p_usuario,p_item,p_dados,p_path,p_url,p_mime,p_tamanho);
$$;

create or replace function public.comercial_personalizacoes_ia_carregar(p_empresa_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is null or not public.seguranca_2fa_ok()
    or not public.funcionario_pode(p_empresa_id,auth.uid(),'comercial.pedidos.visualizar') then
    raise exception 'Sem permissão para acessar Personalizações IA' using errcode='42501';
  end if;
  return jsonb_build_object('fotos',(select coalesce(jsonb_agg(to_jsonb(f)||jsonb_build_object('cliente_nome',c.nome_razao)
    order by f.criado_em desc,f.id),'[]'::jsonb) from comercial_personalizacoes_ia f
    left join clientes_empresas c on c.id=f.cliente_id and c.empresa_id=f.empresa_id where f.empresa_id=p_empresa_id));
end $$;
revoke all on function public.comercial_personalizacoes_ia_carregar(uuid) from public,anon;
grant execute on function public.comercial_personalizacoes_ia_carregar(uuid) to authenticated;

-- A Biblioteca do catálogo volta a trabalhar somente com suas próprias pastas e fotos.
create or replace function public.biblioteca_pastas_acervo(p_empresa_id uuid)
returns jsonb language sql stable security definer set search_path=public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'nome',nome,'pai_id',pai_id,'ordem',ordem)
    order by ordem nulls last,lower(nome),id),'[]'::jsonb) from biblioteca_pastas where empresa_id=p_empresa_id;
$$;
create or replace function public.biblioteca_fotos_acervo(p_empresa_id uuid)
returns jsonb language sql stable security definer set search_path=public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'categoria',categoria,'pasta_id',pasta_id,'titulo',titulo,'url',url,
    'path',path,'ordem',ordem,'cliente_id',cliente_id) order by pasta_id,ordem nulls last,criado_em),'[]'::jsonb)
  from biblioteca_fotos where empresa_id=p_empresa_id;
$$;
create or replace function public.biblioteca_carregar(p_token text)
returns jsonb language plpgsql security definer set search_path=public,extensions as $$
declare s jsonb; fotos jsonb;
begin
  s := public.catalogo_validar_sessao(p_token);
  if coalesce((s->>'valido')::boolean,false) is not true then raise exception 'Sessão do catálogo expirada'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',f.id,'categoria',f.categoria,'pasta_id',f.pasta_id,'titulo',f.titulo,'url',f.url,
    'ordem',coalesce(p.ordem,f.ordem),'cliente_id',f.cliente_id)
    order by f.pasta_id,coalesce(p.ordem,f.ordem) nulls last,f.criado_em,f.id),'[]'::jsonb) into fotos
  from biblioteca_fotos f left join biblioteca_preferencias p on p.foto_id=f.id and p.cliente_id=(s->>'cliente_id')::uuid
  where f.empresa_id=(s->>'empresa_id')::uuid and (f.cliente_id is null or f.cliente_id=(s->>'cliente_id')::uuid) and not coalesce(p.removida,false);
  return jsonb_build_object('fotos',fotos,'pastas',public.biblioteca_pastas_acervo((s->>'empresa_id')::uuid));
end $$;

notify pgrst,'reload schema';
commit;
