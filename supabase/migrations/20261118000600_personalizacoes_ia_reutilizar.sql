begin;

-- A identidade é a combinação inteira: personalização + opções, sem nomes ou preços mutáveis.
create or replace function public.personalizacao_ia_chave(p_dados jsonb)
returns text language sql immutable set search_path=public as $$
  select case
    when nullif(p_dados#>>'{escolha,persId}','') is not null
      and jsonb_typeof(p_dados#>'{escolha,escolhas}')='object'
      and p_dados#>'{escolha,escolhas}'<>'{}'::jsonb
      and not exists(select 1 from jsonb_each(case when jsonb_typeof(p_dados#>'{escolha,escolhas}')='object' then p_dados#>'{escolha,escolhas}' else '{}' end) e where nullif(e.value->>'opcao_id','') is null)
    then 'opcoes:'||md5(jsonb_build_object('personalizacao',p_dados#>>'{escolha,persId}',
      'opcoes',(select jsonb_object_agg(e.key,e.value->>'opcao_id') from jsonb_each(p_dados#>'{escolha,escolhas}') e))::text)
    when nullif(p_dados->>'amostra_hash','') is not null then 'amostra:'||md5(coalesce(p_dados->>'tipo','tecido')||':'||(p_dados->>'amostra_hash'))
    else null end;
$$;
revoke all on function public.personalizacao_ia_chave(jsonb) from public,anon,authenticated;

alter table public.comercial_personalizacoes_ia add column combinacao_chave text;
-- Preserva todas as fotos antigas e elege uma imagem para reutilizar de cada combinação.
with fotos as (
  select id,personalizacao_ia_chave(personalizacao) chave,
    row_number() over(partition by empresa_id,item_id,personalizacao_ia_chave(personalizacao) order by criado_em,id) pos
  from comercial_personalizacoes_ia
)
update comercial_personalizacoes_ia f set combinacao_chave=x.chave from fotos x where x.id=f.id and x.pos=1;
create unique index comercial_personalizacoes_ia_combinacao_uidx
  on public.comercial_personalizacoes_ia(empresa_id,item_id,combinacao_chave) where combinacao_chave is not null;

create table public.comercial_personalizacoes_ia_geracoes (
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  item_id uuid not null, chave text not null, job uuid not null,
  expira_em timestamptz not null,
  primary key(empresa_id,item_id,chave)
);
alter table public.comercial_personalizacoes_ia_geracoes enable row level security;

create or replace function public.personalizacao_ia_preparar(p_empresa uuid,p_item uuid,p_dados jsonb,p_job uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_chave text := personalizacao_ia_chave(p_dados); foto comercial_personalizacoes_ia; adquirido uuid;
begin
  if not exists(select 1 from itens where id=p_item and empresa_id=p_empresa) then raise exception 'Item não pertence à empresa'; end if;
  if v_chave is null then return jsonb_build_object('nova',true); end if;
  select * into foto from comercial_personalizacoes_ia where empresa_id=p_empresa and item_id=p_item and combinacao_chave=v_chave;
  if found then return jsonb_build_object('foto',to_jsonb(foto)); end if;
  insert into comercial_personalizacoes_ia_geracoes as g(empresa_id,item_id,chave,job,expira_em)
  values(p_empresa,p_item,v_chave,p_job,now()+interval '15 minutes')
  on conflict(empresa_id,item_id,chave) do update set job=excluded.job,expira_em=excluded.expira_em
    where g.expira_em<now() returning job into adquirido;
  -- Uma foto pode ter sido concluída enquanto outra requisição adquiria a trava.
  select * into foto from comercial_personalizacoes_ia where empresa_id=p_empresa and item_id=p_item and combinacao_chave=v_chave;
  if found then
    delete from comercial_personalizacoes_ia_geracoes where empresa_id=p_empresa and item_id=p_item and chave=v_chave and job=p_job;
    return jsonb_build_object('foto',to_jsonb(foto));
  end if;
  return jsonb_build_object('nova',adquirido is not null,'ocupada',adquirido is null,'chave',v_chave);
end $$;
revoke all on function public.personalizacao_ia_preparar(uuid,uuid,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.personalizacao_ia_preparar(uuid,uuid,jsonb,uuid) to service_role;

create or replace function public.personalizacao_ia_liberar(p_empresa uuid,p_item uuid,p_chave text,p_job uuid)
returns void language sql security definer set search_path=public as $$
  delete from comercial_personalizacoes_ia_geracoes where empresa_id=p_empresa and item_id=p_item and chave=p_chave and job=p_job;
$$;
revoke all on function public.personalizacao_ia_liberar(uuid,uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.personalizacao_ia_liberar(uuid,uuid,text,uuid) to service_role;

create or replace function public.personalizacao_ia_do_item(p_token text default null,p_empresa_id uuid default null,p_item uuid default null)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare ctx jsonb := public.projeto_ctx(p_token,p_empresa_id); empresa uuid := (ctx->>'empresa_id')::uuid;
begin
  if not exists(select 1 from itens where id=p_item and empresa_id=empresa) then raise exception 'Item indisponível'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id',f.id,'url',f.url,'titulo',f.titulo,'tipo',f.tipo,
    'personalizacao',jsonb_build_object('item_id',f.item_id,'tipo',f.tipo,'descricao',f.titulo,
      'escolha',(f.personalizacao->'escolha')-'valor'), 'criado_em',f.criado_em) order by f.criado_em desc,f.id)
    from comercial_personalizacoes_ia f where f.empresa_id=empresa and f.item_id=p_item
      and f.combinacao_chave is not null and f.personalizacao#>>'{escolha,persId}' is not null),'[]'::jsonb);
end $$;
revoke all on function public.personalizacao_ia_do_item(text,uuid,uuid) from public;
grant execute on function public.personalizacao_ia_do_item(text,uuid,uuid) to anon,authenticated;

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
  if p_dados is null or jsonb_typeof(p_dados)<>'object' or octet_length(p_dados::text)>30000 then raise exception 'Personalização inválida'; end if;
  insert into comercial_personalizacoes_ia as f(empresa_id,cliente_id,item_id,item_nome,item_codigo,categoria,titulo,tipo,
    path,url,mime_type,tamanho_bytes,criado_por,personalizacao,storage_bucket,combinacao_chave)
  values(p_empresa,p_cliente,p_item,coalesce(v_item.produto,'Item'),v_item.codigo,
    coalesce(nullif(btrim(v_item.categoria),''),'Sem categoria'),
    coalesce(nullif(p_dados->>'descricao',''),case when p_dados->>'tipo'='tinta' then 'Tinta personalizada' else 'Tecido personalizado' end),
    case when p_dados->>'tipo'='tinta' then 'tinta' else 'tecido' end,
    p_path,p_url,p_mime,p_tamanho,p_usuario,p_dados||jsonb_build_object('item_id',p_item),
    case when p_url like '%/object/public/biblioteca/%' then 'biblioteca' else 'personalizacoes-ia' end,personalizacao_ia_chave(p_dados))
  on conflict(empresa_id,item_id,combinacao_chave) where combinacao_chave is not null do update set id=f.id
  returning * into v_foto;
  return to_jsonb(v_foto);
end $$;

notify pgrst,'reload schema';
commit;
