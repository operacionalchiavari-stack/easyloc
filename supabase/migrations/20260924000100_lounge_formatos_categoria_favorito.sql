-- Pedido explícito do usuário, com print da aba "Formatos" (barra lateral estreita, difícil de navegar com
-- muitos formatos): "quando eu clicar em formatos... eu quero que abra um modal maior com todos os formatos
-- criados, e quero que eles sejam separados por categoria... a partir de agora no momento da criação de algum
-- formato, nós devemos obrigatoriamente colocar qual formato que é, se é lounge, se é mesas de convidado,
-- mesas de bolo e doces... na barra lateral que já existe hoje onde ficam os formatos, ali eu quero que fique
-- somente os formatos favoritos... dentro desse modal nós poderemos selecionar quais são nossos formatos
-- favoritos".
begin;

alter table public.lounge_formatos
  add column if not exists categoria text,
  add column if not exists favorito boolean not null default false;

-- "Lounge compacto" (embutido no código, sem linha no banco — ver BUILTIN_FORMATS em catalogo-formatos.mjs)
-- recebe a categoria "Lounge" direto no próprio código, não precisa de nada aqui.

create or replace function public.lounge_formato_json(lf public.lounge_formatos)
returns jsonb language sql stable security definer set search_path=public as $$
  select jsonb_build_object(
    'id', lf.id, 'nome', lf.nome, 'papeis', lf.papeis,
    'cliente_id', lf.cliente_id, 'equipe', lf.cliente_id is null,
    'capa_url', lf.capa_url, 'categoria', lf.categoria, 'favorito', lf.favorito,
    'atualizado_em', lf.updated_at
  );
$$;

-- Ganhou p_categoria (obrigatória num formato NOVO — "a partir de agora... obrigatoriamente" foi lido como
-- valendo pra criação daqui pra frente, não retroativo: formato salvo ANTES desta migration fica com
-- categoria nula, cai no grupo "Outros" no modal — ver catalogo-studio3d.mjs). p_capa_url/p_capa_path
-- continuam como estavam (a 2ª chamada, que só anexa a foto, agora também precisa repassar p_categoria — o
-- cliente sempre manda a MESMA categoria escolhida na 1ª chamada, pra não cair no "vazio" da validação).
create or replace function public.lounge_formato_salvar(
  p_token text default null, p_empresa_id uuid default null, p_id uuid default null,
  p_nome text default null, p_papeis jsonb default null,
  p_capa_url text default null, p_capa_path text default null, p_categoria text default null)
returns jsonb language plpgsql security definer set search_path=public,extensions as $$
declare c jsonb; emp uuid; dono uuid; eh_equipe boolean; lf public.lounge_formatos; n int;
begin
  c := public.projeto_ctx(p_token, p_empresa_id);
  emp := (c->>'empresa_id')::uuid;
  dono := nullif(c->>'cliente_id', '')::uuid;
  eh_equipe := (c->>'equipe')::boolean is true;

  if p_nome is null or length(btrim(p_nome)) = 0 then raise exception 'Dê um nome ao formato'; end if;
  if length(btrim(p_nome)) > 60 then raise exception 'O nome do formato pode ter até 60 caracteres'; end if;
  if p_papeis is null or jsonb_typeof(p_papeis) <> 'array' or jsonb_array_length(p_papeis) = 0 then
    raise exception 'Posicione ao menos uma peça antes de salvar';
  end if;
  if length(p_papeis::text) >= 20000 then raise exception 'Formato grande demais'; end if;
  if p_id is null and (p_categoria is null or length(btrim(p_categoria)) = 0) then
    raise exception 'Escolha uma categoria pro formato';
  end if;
  if p_categoria is not null and length(btrim(p_categoria)) > 40 then raise exception 'Categoria muito longa'; end if;

  if p_id is null then
    select count(*) into n from public.lounge_formatos
      where empresa_id = emp and cliente_id is not distinct from (case when eh_equipe then null else dono end);
    if n >= 30 then raise exception 'Limite de 30 formatos atingido — exclua algum antes de criar outro'; end if;
    insert into public.lounge_formatos(empresa_id, cliente_id, criado_por, nome, papeis, capa_url, capa_path, categoria)
    values (emp, case when eh_equipe then null else dono end, nullif(c->>'uid', '')::uuid, btrim(p_nome), p_papeis, p_capa_url, p_capa_path, nullif(btrim(coalesce(p_categoria,'')),''))
    returning * into lf;
  else
    select * into lf from public.lounge_formatos where id = p_id and empresa_id = emp;
    if not found then raise exception 'Formato não encontrado'; end if;
    if not (eh_equipe or lf.cliente_id = dono) then raise exception 'Sem permissão para editar este formato'; end if;
    update public.lounge_formatos set nome = btrim(p_nome), papeis = p_papeis,
      capa_url = coalesce(p_capa_url, lf.capa_url), capa_path = coalesce(p_capa_path, lf.capa_path),
      categoria = coalesce(nullif(btrim(coalesce(p_categoria,'')),''), lf.categoria),
      updated_at = now() where id = lf.id returning * into lf;
  end if;
  return public.lounge_formato_json(lf);
end; $$;

revoke all on function public.lounge_formato_salvar(text, uuid, uuid, text, jsonb, text, text, text) from public;
grant execute on function public.lounge_formato_salvar(text, uuid, uuid, text, jsonb, text, text, text) to anon, authenticated, service_role;
drop function if exists public.lounge_formato_salvar(text, uuid, uuid, text, jsonb, text, text);

-- Marcar/desmarcar favorito — endpoint próprio (não sobrecarrega lounge_formato_salvar, que exigiria reenviar
-- nome/papeis só pra girar um boolean). "favorito" é uma flag COMPARTILHADA na própria linha do formato (não
-- por pessoa) — pedido do usuário fala em "nossos formatos favoritos", e o formato já é compartilhado por
-- natureza (equipe vê tudo, decorador vê os seus + os da equipe); qualquer um que consiga VER o formato
-- também pode favoritá-lo pra si (mesma regra de visibilidade de lounge_formatos_listar) — não fica restrito
-- a "dono ou equipe" como editar/excluir, senão um decorador nunca poderia favoritar um formato da equipe.
create or replace function public.lounge_formato_favoritar(p_token text default null, p_empresa_id uuid default null, p_id uuid default null, p_favorito boolean default true)
returns jsonb language plpgsql security definer set search_path=public,extensions as $$
declare c jsonb; emp uuid; dono uuid; eh_equipe boolean; lf public.lounge_formatos;
begin
  c := public.projeto_ctx(p_token, p_empresa_id);
  emp := (c->>'empresa_id')::uuid;
  dono := nullif(c->>'cliente_id', '')::uuid;
  eh_equipe := (c->>'equipe')::boolean is true;
  select * into lf from public.lounge_formatos where id = p_id and empresa_id = emp
    and (eh_equipe or cliente_id is null or cliente_id = dono);
  if not found then raise exception 'Formato não encontrado'; end if;
  update public.lounge_formatos set favorito = coalesce(p_favorito, true) where id = lf.id returning * into lf;
  return public.lounge_formato_json(lf);
end; $$;
revoke all on function public.lounge_formato_favoritar(text, uuid, uuid, boolean) from public;
grant execute on function public.lounge_formato_favoritar(text, uuid, uuid, boolean) to anon, authenticated, service_role;

commit;
