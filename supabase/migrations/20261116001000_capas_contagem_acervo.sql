-- 16/11/2026: contagem do material de proteção pela Gestão do acervo (Inventário e qualidade).
-- A pessoa conta às cegas quantas capas/caixas BOAS há no galpão. O sistema compara com o disponível esperado:
--   faltou  → perda no galpão, atribuída a TODA a equipe de Triagem (Cadastro de Funcionários, equipe operacional
--             "triagem", ativos no momento da contagem; nome guardado na linha);
--   sobrou  → sobra na contagem (volta para o disponível).
-- A primeira contagem de um material é a contagem inicial: só fixa o estoque, sem perda nem sobra.
-- O disponível esperado já desconta o que se perdeu entre o descarregamento e a triagem da volta, então a contagem
-- só pega o que ainda não estava explicado (não conta a mesma capa duas vezes).

alter table public.capas_movimentos add column if not exists equipe jsonb;
alter table public.capas_movimentos add column if not exists esperado integer;
alter table public.capas_movimentos drop constraint if exists capas_movimentos_tipo_check;
alter table public.capas_movimentos add constraint capas_movimentos_tipo_check
  check (tipo = any (array['fabricacao','inventario','manutencao','reparo','perda','perda_manutencao','perda_pedido',
                           'contagem_inicial','perda_galpao','sobra_contagem','contagem_ok']));

-- lista para a tela de contagem (sem o esperado: contagem às cegas)
create or replace function public.capas_contagem_lista(p_empresa uuid)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public'
as $function$
begin
  if not public.capas_pode(p_empresa) then raise exception 'Sem acesso ao material de proteção.' using errcode = '42501'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object(
      'modelo_id', m.id, 'nome', m.nome, 'tipo', coalesce(m.tipo_material, 'capa'),
      'item', coalesce(i.descricao_total, i.produto),
      'foto_url', coalesce(nullif(i.foto_url, ''), (select nullif(f.url, '') from itens_fotos f where f.item_id = i.id and f.cliente_id is null and nullif(f.url, '') is not null order by f.ordem nulls last, f.slot limit 1)),
      'ultima_contagem', m.estoque_conferido_em) order by coalesce(i.descricao_total, i.produto)), '[]')
    from capas_modelos m join itens i on i.id = m.item_id
   where m.empresa_id = p_empresa and m.usa_capa);
end $function$;
revoke all on function public.capas_contagem_lista(uuid) from public, anon;
grant execute on function public.capas_contagem_lista(uuid) to authenticated;

-- grava a contagem: p_contagens = [{modelo_id, contado, observacao?}]
create or replace function public.capas_contagem_galpao(p_empresa uuid, p_contagens jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  x jsonb; m capas_modelos; esperado integer; contado integer; dif integer; equipe jsonb; tipo text; obs text;
  hoje date := (now() at time zone 'America/Sao_Paulo')::date; res jsonb := '[]';
begin
  if not public.capas_pode(p_empresa, true) then raise exception 'Sem permissão para contar o material de proteção.' using errcode = '42501'; end if;
  if jsonb_typeof(p_contagens) <> 'array' or jsonb_array_length(p_contagens) = 0 then raise exception 'Informe pelo menos uma contagem.'; end if;
  -- equipe de Triagem inteira (ativos agora); guardada na linha para o relatório não mudar se a equipe mudar depois
  select coalesce(jsonb_agg(jsonb_build_object('funcionario_id', f.id, 'nome', f.nome) order by f.nome), '[]') into equipe
    from funcionarios_acesso f
   where f.empresa_id = p_empresa and coalesce(f.ativo, true) and lower(coalesce(f.equipe_operacional, '')) = 'triagem';

  for x in select value from jsonb_array_elements(p_contagens) loop
    if coalesce(x->>'contado', '') = '' then continue; end if;
    begin contado := (x->>'contado')::integer; exception when others then raise exception 'Quantidade inválida.'; end;
    if contado < 0 or contado > 1000000 then raise exception 'Quantidade inválida.'; end if;
    select * into m from capas_modelos where id = (x->>'modelo_id')::uuid and empresa_id = p_empresa for update;
    if not found then raise exception 'Material não encontrado.'; end if;
    esperado := greatest(0, (public.capas_saldo(m.id)->>'disponivel')::integer);
    obs := nullif(trim(coalesce(x->>'observacao', '')), '');
    if m.estoque_conferido_em is null then
      tipo := 'contagem_inicial'; dif := contado - esperado;
    else
      dif := contado - esperado;
      tipo := case when dif < 0 then 'perda_galpao' when dif > 0 then 'sobra_contagem' else 'contagem_ok' end;
    end if;
    insert into capas_movimentos(empresa_id, modelo_id, tipo, quantidade, delta_disponivel, delta_manutencao, data, observacao,
                                 usuario_id, chave, equipe, esperado)
    values (p_empresa, m.id, tipo, case when tipo in ('perda_galpao', 'sobra_contagem') then abs(dif) else contado end,
            dif, 0, hoje,
            left(coalesce(obs, case tipo when 'contagem_inicial' then 'Contagem inicial na Gestão do acervo.'
                                         when 'perda_galpao' then 'Contagem na Gestão do acervo: faltaram ' || abs(dif) || ' (contadas ' || contado || ' de ' || esperado || ').'
                                         when 'sobra_contagem' then 'Contagem na Gestão do acervo: sobraram ' || dif || ' (contadas ' || contado || ' de ' || esperado || ').'
                                         else 'Contagem na Gestão do acervo: bateu (' || contado || ').' end), 500),
            auth.uid(), gen_random_uuid(), case when tipo = 'perda_galpao' then equipe end, esperado);
    update capas_modelos set estoque_conferido_em = now(), atualizado_em = now() where id = m.id;
    res := res || jsonb_build_object('modelo_id', m.id, 'nome', m.nome, 'tipo', tipo, 'esperado', esperado, 'contado', contado, 'diferenca', dif);
  end loop;
  return res;
end $function$;
revoke all on function public.capas_contagem_galpao(uuid, jsonb) from public, anon;
grant execute on function public.capas_contagem_galpao(uuid, jsonb) to authenticated;

-- Perdas da equipe passa a incluir as perdas no galpão encontradas na contagem (equipe de Triagem).
-- Mantém tudo que já existia (perdas no evento e entre descarregamento e triagem da volta) e acrescenta linhas
-- com 'origem':'contagem'.
create or replace function public.capas_perdas_contagem(p_empresa uuid, p_de date, p_ate date)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public'
as $function$
begin
  if not public.capas_pode(p_empresa) then raise exception 'Sem acesso ao material de proteção.' using errcode = '42501'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object(
      'origem', 'contagem', 'data', mv.data, 'modelo', m.nome, 'item', coalesce(i.descricao_total, i.produto),
      'tipo', coalesce(m.tipo_material, 'capa'), 'custo', m.custo, 'no_galpao', mv.quantidade, 'no_evento', 0,
      'valor_galpao', mv.quantidade * m.custo, 'valor_evento', 0, 'esperado', mv.esperado,
      'contado', mv.esperado - mv.quantidade, 'observacao', mv.observacao,
      'equipe', coalesce((select jsonb_agg(e || jsonb_build_object('papel', 'triagem')) from jsonb_array_elements(mv.equipe) e), '[]'))
      order by mv.data desc, mv.criado_em desc), '[]')
    from capas_movimentos mv join capas_modelos m on m.id = mv.modelo_id join itens i on i.id = m.item_id
   where mv.empresa_id = p_empresa and mv.tipo = 'perda_galpao' and mv.data between p_de and p_ate);
end $function$;
revoke all on function public.capas_perdas_contagem(uuid, date, date) from public, anon;
grant execute on function public.capas_perdas_contagem(uuid, date, date) to authenticated;
