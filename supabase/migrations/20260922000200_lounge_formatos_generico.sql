-- Pedido explícito do usuário, vendo o editor de formatos: "pensa que esse modal não é apenas pra criar
-- lounges, é pra criar qualquer composição, pode ser lounge, pode ser mesa destaque, pode ser qualquer coisa".
-- O papel "sofá" deixou de ser uma âncora obrigatória/especial no frontend (catalogo-lounge.mjs) — cada
-- categoria do catálogo agora é só mais um tipo de peça, adicionável quantas vezes a pessoa quiser (sem mais
-- "sofá"/"poltrona" fixos nem "2 poltronas de cada lado"). A checagem "todo formato precisa de um sofá" não
-- faz mais sentido nesse modelo; a única exigência que sobra é "pelo menos 1 peça posicionada" (já coberta
-- pela checagem de jsonb_array_length logo acima, inalterada).
begin;

create or replace function public.lounge_formato_salvar(
  p_token text default null, p_empresa_id uuid default null, p_id uuid default null,
  p_nome text default null, p_papeis jsonb default null)
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

  if p_id is null then
    select count(*) into n from public.lounge_formatos
      where empresa_id = emp and cliente_id is not distinct from (case when eh_equipe then null else dono end);
    if n >= 30 then raise exception 'Limite de 30 formatos atingido — exclua algum antes de criar outro'; end if;
    insert into public.lounge_formatos(empresa_id, cliente_id, criado_por, nome, papeis)
    values (emp, case when eh_equipe then null else dono end, nullif(c->>'uid', '')::uuid, btrim(p_nome), p_papeis)
    returning * into lf;
  else
    select * into lf from public.lounge_formatos where id = p_id and empresa_id = emp;
    if not found then raise exception 'Formato não encontrado'; end if;
    if not (eh_equipe or lf.cliente_id = dono) then raise exception 'Sem permissão para editar este formato'; end if;
    update public.lounge_formatos set nome = btrim(p_nome), papeis = p_papeis, updated_at = now() where id = lf.id returning * into lf;
  end if;
  return public.lounge_formato_json(lf);
end; $$;

commit;
