begin;

alter table public.biblioteca_pastas add column if not exists automatica boolean not null default false;
alter table public.biblioteca_fotos add column if not exists personalizacao jsonb;

create or replace function public.biblioteca_pasta_automatica(p_empresa uuid, p_nome text, p_pai uuid default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_empresa::text, 18112026));
  select id into v_id from biblioteca_pastas where empresa_id=p_empresa
    and pai_id is not distinct from p_pai and lower(btrim(nome))=lower(btrim(p_nome));
  if v_id is null then
    insert into biblioteca_pastas(empresa_id,nome,pai_id,automatica) values(p_empresa,p_nome,p_pai,true) returning id into v_id;
  else
    update biblioteca_pastas set automatica=true where id=v_id;
  end if;
  return v_id;
end $$;
revoke all on function public.biblioteca_pasta_automatica(uuid,text,uuid) from public,anon,authenticated;

do $$ declare e record; begin
  for e in select id from public.empresas loop
    perform public.biblioteca_pasta_automatica(e.id,'Itens personalizáveis');
  end loop;
end $$;

create or replace function public.biblioteca_iniciar_empresa()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  perform biblioteca_pasta_automatica(new.id,'Itens personalizáveis'); return new;
end $$;
create trigger biblioteca_iniciar_empresa after insert on public.empresas
  for each row execute function public.biblioteca_iniciar_empresa();

-- Somente o serviço da IA grava resultados; empresa e categoria vêm do cadastro do item.
create or replace function public.biblioteca_personalizacao_salvar(
  p_empresa uuid,p_cliente uuid,p_usuario uuid,p_item uuid,p_dados jsonb,
  p_path text,p_url text,p_mime text,p_tamanho bigint)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_item record; v_raiz uuid; v_categoria uuid; v_pasta uuid; v_foto biblioteca_fotos; v_dados jsonb;
begin
  select produto,categoria,codigo into v_item from itens where id=p_item and empresa_id=p_empresa;
  if not found then raise exception 'Item não pertence à empresa'; end if;
  if p_cliente is not null and not exists(select 1 from clientes_empresas where id=p_cliente and empresa_id=p_empresa)
    then raise exception 'Cliente não pertence à empresa'; end if;
  if p_path not like p_empresa::text||'/_personalizacoes/%' or p_url is null
    then raise exception 'Arquivo inválido'; end if;
  if p_dados is null or jsonb_typeof(p_dados)<>'object' or octet_length(p_dados::text)>30000
    then raise exception 'Personalização inválida'; end if;
  v_raiz := biblioteca_pasta_automatica(p_empresa,'Itens personalizáveis');
  v_categoria := biblioteca_pasta_automatica(p_empresa,left(coalesce(nullif(btrim(v_item.categoria),''),'Sem categoria'),80),v_raiz);
  -- O código evita juntar itens diferentes com o mesmo nome.
  v_pasta := biblioteca_pasta_automatica(p_empresa,left(coalesce(nullif(btrim(v_item.produto),''),'Item'),40)||' · '||left(coalesce(nullif(btrim(v_item.codigo),''),p_item::text),36),v_categoria);
  v_dados := p_dados || jsonb_build_object('item_id',p_item);
  insert into biblioteca_fotos(empresa_id,cliente_id,categoria,pasta_id,titulo,path,url,mime_type,tamanho_bytes,criado_por,personalizacao)
  values(p_empresa,p_cliente,coalesce(nullif(btrim(v_item.categoria),''),'Sem categoria'),v_pasta,
    coalesce(nullif(p_dados->>'descricao',''),case when p_dados->>'tipo'='tinta' then 'Tinta personalizada' else 'Tecido personalizado' end),
    p_path,p_url,p_mime,p_tamanho,p_usuario,v_dados) returning * into v_foto;
  return to_jsonb(v_foto);
end $$;
revoke all on function public.biblioteca_personalizacao_salvar(uuid,uuid,uuid,uuid,jsonb,text,text,text,bigint) from public,anon,authenticated;
grant execute on function public.biblioteca_personalizacao_salvar(uuid,uuid,uuid,uuid,jsonb,text,text,text,bigint) to service_role;

create or replace function public.biblioteca_pastas_acervo(p_empresa_id uuid)
returns jsonb language sql stable security definer set search_path=public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'nome',nome,'pai_id',pai_id,'ordem',ordem,'automatica',automatica)
    order by automatica desc,ordem nulls last,lower(nome),id),'[]'::jsonb)
  from biblioteca_pastas where empresa_id=p_empresa_id;
$$;

create or replace function public.biblioteca_fotos_acervo(p_empresa_id uuid)
returns jsonb language sql stable security definer set search_path=public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'categoria',categoria,'pasta_id',pasta_id,'titulo',titulo,'url',url,
    'path',path,'ordem',ordem,'cliente_id',cliente_id,'personalizacao',personalizacao) order by pasta_id,ordem nulls last,criado_em),'[]'::jsonb)
  from biblioteca_fotos where empresa_id=p_empresa_id;
$$;

create or replace function public.biblioteca_carregar(p_token text)
returns jsonb language plpgsql security definer set search_path=public,extensions as $$
declare s jsonb; fotos jsonb;
begin
  s := public.catalogo_validar_sessao(p_token);
  if coalesce((s->>'valido')::boolean,false) is not true then raise exception 'Sessão do catálogo expirada'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',f.id,'categoria',f.categoria,'pasta_id',f.pasta_id,'titulo',f.titulo,'url',f.url,
    'ordem',coalesce(p.ordem,f.ordem),'cliente_id',f.cliente_id,'personalizacao',f.personalizacao)
    order by f.pasta_id,coalesce(p.ordem,f.ordem) nulls last,f.criado_em,f.id),'[]'::jsonb) into fotos
  from biblioteca_fotos f left join biblioteca_preferencias p on p.foto_id=f.id and p.cliente_id=(s->>'cliente_id')::uuid
  where f.empresa_id=(s->>'empresa_id')::uuid and (f.cliente_id is null or f.cliente_id=(s->>'cliente_id')::uuid) and not coalesce(p.removida,false);
  return jsonb_build_object('fotos',fotos,'pastas',public.biblioteca_pastas_acervo((s->>'empresa_id')::uuid));
end $$;

commit;
