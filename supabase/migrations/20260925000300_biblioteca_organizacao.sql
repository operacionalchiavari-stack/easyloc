begin;
create table public.biblioteca_preferencias (
 cliente_id uuid not null references public.clientes_empresas(id) on delete cascade,
 foto_id uuid not null references public.biblioteca_fotos(id) on delete cascade,
 removida boolean not null default false,
 ordem integer,
 primary key(cliente_id,foto_id)
);
alter table public.biblioteca_preferencias enable row level security;
revoke all on public.biblioteca_preferencias from anon,authenticated;

create or replace function public.biblioteca_carregar(p_token text)
returns jsonb language plpgsql security definer set search_path=public,extensions as $$
declare s jsonb; fotos jsonb;
begin
 s := public.catalogo_validar_sessao(p_token);
 if coalesce((s->>'valido')::boolean,false) is not true then raise exception 'Sessão do catálogo expirada'; end if;
 select coalesce(jsonb_agg(jsonb_build_object(
 'id',f.id,'categoria',f.categoria,'titulo',f.titulo,'url',f.url,
 'ordem',coalesce(p.ordem,f.ordem),'cliente_id',f.cliente_id
 ) order by f.categoria,coalesce(p.ordem,f.ordem) nulls last,f.criado_em,f.id),'[]'::jsonb) into fotos
 from public.biblioteca_fotos f left join public.biblioteca_preferencias p
 on p.foto_id=f.id and p.cliente_id=(s->>'cliente_id')::uuid
 where f.empresa_id=(s->>'empresa_id')::uuid
 and (f.cliente_id is null or f.cliente_id=(s->>'cliente_id')::uuid)
 and not coalesce(p.removida,false);
 return jsonb_build_object('fotos',fotos);
end $$;

create function public.biblioteca_remover(p_token text,p_foto_id uuid)
returns void language plpgsql security definer set search_path=public,extensions as $$
declare s jsonb;
begin
 s := public.catalogo_validar_sessao(p_token);
 if coalesce((s->>'valido')::boolean,false) is not true then raise exception 'Sessão do catálogo expirada'; end if;
 if not exists(select 1 from public.biblioteca_fotos f where f.id=p_foto_id
 and f.empresa_id=(s->>'empresa_id')::uuid and (f.cliente_id is null or f.cliente_id=(s->>'cliente_id')::uuid)) then
 raise exception 'Foto indisponível'; end if;
 insert into public.biblioteca_preferencias(cliente_id,foto_id,removida)
 values((s->>'cliente_id')::uuid,p_foto_id,true)
 on conflict(cliente_id,foto_id) do update set removida=true;
end $$;

create function public.biblioteca_reordenar(p_token text,p_empresa_id uuid,p_fotos uuid[])
returns void language plpgsql security definer set search_path=public,extensions as $$
declare s jsonb; e uuid; c uuid;
begin
 if p_token is not null then
 s := public.catalogo_validar_sessao(p_token);
 if coalesce((s->>'valido')::boolean,false) is not true then raise exception 'Sessão do catálogo expirada'; end if;
 e := (s->>'empresa_id')::uuid; c := (s->>'cliente_id')::uuid;
 else
 e := p_empresa_id;
 if auth.uid() is null or not exists(select 1 from public.usuarios_empresas where empresa_id=e and user_id=auth.uid()) then
 raise exception 'Sem permissão'; end if;
 end if;
 if coalesce(cardinality(p_fotos),0)=0 or cardinality(p_fotos)>10000 or
 (select count(distinct id) from unnest(p_fotos) id) <> cardinality(p_fotos) then raise exception 'Lista inválida'; end if;
 if (select count(*) from public.biblioteca_fotos f where f.id=any(p_fotos) and f.empresa_id=e
 and (p_token is null or ((f.cliente_id is null or f.cliente_id=c) and not exists(
 select 1 from public.biblioteca_preferencias p where p.cliente_id=c and p.foto_id=f.id and p.removida)))) <> cardinality(p_fotos)
 then raise exception 'Foto indisponível'; end if;
 if (select count(distinct categoria) from public.biblioteca_fotos where id=any(p_fotos)) <> 1 then raise exception 'Selecione uma única pasta'; end if;
 if p_token is null then
 update public.biblioteca_fotos f set ordem=x.pos::integer from unnest(p_fotos) with ordinality x(id,pos) where f.id=x.id;
 else
 insert into public.biblioteca_preferencias(cliente_id,foto_id,ordem)
 select c,x.id,x.pos::integer from unnest(p_fotos) with ordinality x(id,pos)
 on conflict(cliente_id,foto_id) do update set ordem=excluded.ordem;
 end if;
end $$;
revoke all on function public.biblioteca_remover(text,uuid) from public;
revoke all on function public.biblioteca_reordenar(text,uuid,uuid[]) from public;
grant execute on function public.biblioteca_remover(text,uuid) to anon,authenticated;
grant execute on function public.biblioteca_reordenar(text,uuid,uuid[]) to anon,authenticated;
commit;
