alter table public.catalogo_acessos
  add column if not exists senha_definida boolean not null default true;

-- A primeira versão criava senha aleatória para acessos que nunca foram ativados.
update public.catalogo_acessos set senha_definida=false where ativo=false;

create or replace function public.configurar_acesso_catalogo(
  p_cliente_id uuid,p_email text,p_senha text default null,p_ativo boolean default true
) returns void language plpgsql security definer set search_path=public,extensions as $$
declare v_empresa_id uuid;v_existente public.catalogo_acessos;v_tem_nova_senha boolean;
begin
  select empresa_id into v_empresa_id from public.clientes_empresas where id=p_cliente_id;
  if v_empresa_id is null or not exists(select 1 from public.usuarios_empresas where user_id=auth.uid() and empresa_id=v_empresa_id) then
    raise exception 'Acesso não autorizado';
  end if;
  if nullif(trim(p_email),'') is null then raise exception 'Informe o e-mail do catálogo'; end if;
  select * into v_existente from public.catalogo_acessos where cliente_id=p_cliente_id;
  v_tem_nova_senha:=p_senha is not null and p_senha<>'';
  if v_tem_nova_senha and length(p_senha)<8 then raise exception 'A senha deve ter pelo menos 8 caracteres'; end if;
  if p_ativo and (v_existente.id is null or not coalesce(v_existente.senha_definida,false)) and not v_tem_nova_senha then
    raise exception 'Defina uma senha com pelo menos 8 caracteres';
  end if;
  insert into public.catalogo_acessos(empresa_id,cliente_id,email,senha_hash,senha_definida,ativo)
  values(v_empresa_id,p_cliente_id,lower(trim(p_email)),crypt(coalesce(nullif(p_senha,''),gen_random_uuid()::text),gen_salt('bf')),v_tem_nova_senha,p_ativo)
  on conflict(cliente_id) do update set
    email=excluded.email,ativo=excluded.ativo,
    senha_hash=case when v_tem_nova_senha then crypt(p_senha,gen_salt('bf')) else public.catalogo_acessos.senha_hash end,
    senha_definida=case when v_tem_nova_senha then true else public.catalogo_acessos.senha_definida end,
    updated_at=now();
  if v_tem_nova_senha or not p_ativo then
    delete from public.catalogo_sessoes where acesso_id=(select id from public.catalogo_acessos where cliente_id=p_cliente_id);
  end if;
end;
$$;

create or replace function public.obter_acesso_catalogo(p_cliente_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_result jsonb;
begin
  select jsonb_build_object('email',a.email,'ativo',a.ativo,'senha_configurada',a.senha_definida,'senha_atualizada_em',a.updated_at) into v_result
  from public.catalogo_acessos a join public.usuarios_empresas ue on ue.empresa_id=a.empresa_id
  where a.cliente_id=p_cliente_id and ue.user_id=auth.uid();
  return coalesce(v_result,'{}'::jsonb);
end;
$$;

create or replace function public.catalogo_login(p_email text,p_senha text)
returns jsonb language plpgsql security definer set search_path=public,extensions as $$
declare v_acesso public.catalogo_acessos;v_token text;
begin
  select * into v_acesso from public.catalogo_acessos
  where email=lower(trim(p_email)) and ativo and senha_definida and senha_hash=crypt(p_senha,senha_hash)
  order by updated_at desc limit 1;
  if v_acesso.id is null then return null; end if;
  v_token:=gen_random_uuid()::text||gen_random_uuid()::text;
  delete from public.catalogo_sessoes where expires_at<now();
  insert into public.catalogo_sessoes(acesso_id,token_hash,expires_at)
  values(v_acesso.id,encode(digest(v_token,'sha256'),'hex'),now()+interval '12 hours');
  return jsonb_build_object('token',v_token,'cliente_id',v_acesso.cliente_id,'empresa_id',v_acesso.empresa_id);
end;
$$;

revoke all on function public.configurar_acesso_catalogo(uuid,text,text,boolean) from public;
revoke all on function public.obter_acesso_catalogo(uuid) from public;
grant execute on function public.configurar_acesso_catalogo(uuid,text,text,boolean) to authenticated;
grant execute on function public.obter_acesso_catalogo(uuid) to authenticated;
grant execute on function public.catalogo_login(text,text) to anon,authenticated;
