begin;

create or replace function public.rastreamento_listar(p_empresa uuid)
returns table(usuario_id uuid,nome text,latitude double precision,longitude double precision,
 precisao double precision,atualizado_em timestamptz,foto_url text,foto_bucket text,foto_path text)
language plpgsql stable security definer set search_path=public as $$
begin
 if not public.rastreamento_pode_visualizar(p_empresa) then raise exception 'Sem acesso ao rastreamento.'; end if;
 return query
 select r.usuario_id,coalesce(nullif(f.nome,''),nullif(u.nome,''),r.nome),
 r.latitude,r.longitude,r.precisao,r.atualizado_em,
 coalesce(case when u.avatar_url ~* '^https?://' then u.avatar_url end,
          case when f.foto_url ~* '^https?://' then f.foto_url end),
 case when a.name is not null then 'avatares'
      when nullif(f.foto_url,'') is not null and f.foto_url !~* '^https?://' then 'funcionarios-fotos' end,
 coalesce(a.name,case when f.foto_url !~* '^https?://' then nullif(f.foto_url,'') end)
 from public.rastreamento_posicoes r
 left join public.funcionarios_acesso f on f.id=r.usuario_id and f.empresa_id=r.empresa_id
 left join public.usuarios u on u.id=r.usuario_id
 left join storage.objects a on a.bucket_id='avatares' and a.name=r.empresa_id::text||'/'||r.usuario_id::text||'.jpg'
 where r.empresa_id=p_empresa
 order by 2;
end;
$$;
revoke all on function public.rastreamento_listar(uuid) from public,anon;
grant execute on function public.rastreamento_listar(uuid) to authenticated;

create or replace function public.rastreamento_foto_acesso(p_nome text)
returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from public.funcionarios_acesso f
 join public.rastreamento_posicoes r on r.usuario_id=f.id and r.empresa_id=f.empresa_id
 where f.foto_url=p_nome and public.rastreamento_pode_visualizar(r.empresa_id));
$$;
revoke all on function public.rastreamento_foto_acesso(text) from public,anon;
grant execute on function public.rastreamento_foto_acesso(text) to authenticated;
create policy rastreamento_fotos_leitura on storage.objects for select to authenticated
 using(bucket_id='funcionarios-fotos' and public.rastreamento_foto_acesso(name));

notify pgrst, 'reload schema';
commit;
