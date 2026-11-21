-- Histórico do projeto/pedido: guarda QUEM fez (id) para mostrar a foto (nov/2026).
-- equipe -> autor_usuario (auth.uid(), foto = avatar da conta em avatares/<empresa>/<usuário>.jpg)
-- decorador -> autor_cliente (cliente do projeto, foto = clientes_empresas.catalogo_logo_url)
alter table public.projetos_historico add column if not exists autor_usuario uuid;
alter table public.projetos_historico add column if not exists autor_cliente uuid;

create or replace function public.projeto_hist_gravar(p_proj projetos, p_autor text, p_autor_tipo text, p_tipo text, p_chave text, p_descricao text, p_detalhe jsonb default '{}'::jsonb)
 returns void language plpgsql security definer set search_path to 'public' as $function$
declare ult public.projetos_historico; det jsonb;
begin
  if p_chave is not null then
    select * into ult from public.projetos_historico
     where projeto_id = p_proj.id and chave = p_chave and coalesce(autor,'') = coalesce(p_autor,'')
       and atualizado_em > now() - interval '10 minutes'
     order by atualizado_em desc limit 1;
    if found then
      det := ult.detalhe || p_detalhe;
      if ult.detalhe ? 'de' then det := jsonb_set(det, '{de}', ult.detalhe->'de'); end if;
      if det ? 'de' and det ? 'para' and det->'de' = det->'para' then
        delete from public.projetos_historico where id = ult.id;
        return;
      end if;
      update public.projetos_historico set atualizado_em = now(), detalhe = det,
        descricao = public.projeto_hist_texto(p_tipo, det, p_descricao)
       where id = ult.id;
      return;
    end if;
  end if;
  insert into public.projetos_historico(projeto_id, empresa_id, autor, autor_tipo, tipo, chave, descricao, detalhe, autor_usuario, autor_cliente)
  values (p_proj.id, p_proj.empresa_id, p_autor, p_autor_tipo, p_tipo, p_chave,
          public.projeto_hist_texto(p_tipo, p_detalhe, p_descricao), p_detalhe,
          case when p_autor_tipo = 'equipe' then auth.uid() end,
          case when p_autor_tipo = 'decorador' then p_proj.cliente_id end);
end $function$;

-- O que já existe: decorador = cliente do projeto; equipe = pelo nome (cadastro de funcionário ou usuário da empresa).
update public.projetos_historico h set autor_cliente = p.cliente_id
  from public.projetos p where p.id = h.projeto_id and h.autor_tipo = 'decorador' and h.autor_cliente is null;
update public.projetos_historico h set autor_usuario = f.id
  from public.funcionarios_acesso f
 where h.autor_tipo = 'equipe' and h.autor_usuario is null and f.empresa_id = h.empresa_id and lower(trim(f.nome)) = lower(trim(h.autor));
update public.projetos_historico h set autor_usuario = u.id
  from public.usuarios u join public.usuarios_empresas ue on ue.user_id = u.id
 where h.autor_tipo = 'equipe' and h.autor_usuario is null and ue.empresa_id = h.empresa_id and lower(trim(u.nome)) = lower(trim(h.autor));

create or replace function public.projeto_historico(p_token text default null, p_empresa_id uuid default null, p_id uuid default null)
 returns jsonb language plpgsql security definer set search_path to 'public', 'extensions' as $function$
declare c jsonb; r public.projetos;
begin
  c := public.projeto_ctx(p_token, p_empresa_id);
  r := public.projeto_do_chamador(c, p_id);
  return coalesce((select jsonb_agg(jsonb_build_object('id', h.id, 'quando', h.atualizado_em, 'inicio', h.criado_em,
      'autor', h.autor, 'autor_tipo', h.autor_tipo, 'tipo', h.tipo, 'descricao', h.descricao,
      'autor_usuario', h.autor_usuario,
      'foto', case when h.autor_tipo = 'decorador' then (select ce.catalogo_logo_url from public.clientes_empresas ce where ce.id = h.autor_cliente) end)
      order by h.atualizado_em desc)
    from (select * from public.projetos_historico where projeto_id = r.id order by atualizado_em desc limit 2000) h), '[]'::jsonb);
end $function$;
