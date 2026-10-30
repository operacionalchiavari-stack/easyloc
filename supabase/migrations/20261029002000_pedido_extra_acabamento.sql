-- Pedido extra, acabamento (out/2026):
-- (1) da coleta em diante a equipe e o caminhão do principal são calculados com o volume do principal + extras;
-- (2) o principal não pode ser cancelado com extras ativos (cancele os extras antes);
-- (3) excluir um principal com extras dá uma mensagem clara (antes era o erro da chave estrangeira).
drop function if exists public.operacao_volume_pedido(uuid);
create or replace function public.operacao_volume_pedido(p_pedido uuid, p_grupo boolean default false)
 RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  select jsonb_build_object('m3', round(coalesce(sum(si.quantidade_solicitada * coalesce(i.volume_cubico, 0)), 0)::numeric, 2),
                            'pecas', coalesce(sum(si.quantidade_solicitada), 0))
    from separacoes_itens si left join itens i on i.id = si.item_id
   where si.separacao_pedido_id = any(case when p_grupo then public.pedido_grupo(p_pedido) else array[p_pedido] end)
     and (auth.uid() is null or exists (select 1 from separacoes_pedidos sp where sp.id = p_pedido and public.eh_membro_empresa(sp.empresa_id)))
$$;
revoke all on function public.operacao_volume_pedido(uuid, boolean) from public, anon;
grant execute on function public.operacao_volume_pedido(uuid, boolean) to authenticated;

CREATE OR REPLACE FUNCTION public.operacao_escala_preencher_sem_fluxo(p_empresa uuid, p_etapas uuid[])
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  reg jsonb := operacao_regras_escala(p_empresa);
  et record; conf jsonb; jan tsrange; m3 numeric; precisa int; tem_resp boolean; n_eq int; mudou boolean; total int := 0;
  pessoa record; cam record; par uuid;
begin
  if reg = '{}'::jsonb then return 0; end if;
  if not coalesce((select automatica from public.empresa_escala_controle where empresa_id=p_empresa),true) then return 0;end if;
  for et in
    select e.*, operacao_janela(e.data, e.hora, e.tipo, reg) j
      from operacao_etapas e
     where e.empresa_id = p_empresa and e.id = any(p_etapas) and (e.pedido_id is null or e.origem='pendencia' or exists(select 1 from public.separacoes_pedidos p where p.id=e.pedido_id and public.pedido_fluxo_etapa(p) in ('triagem','expedicao'))) and e.data >= current_date and e.tipo <> 'outra'
     order by e.data, e.hora nulls first
  loop
    conf := reg->'etapas'->operacao_tipo_regra(et.tipo);
    if conf is null then continue; end if;
    jan := et.j; mudou := false;
    m3 := case when et.volume_m3 is not null then greatest(et.volume_m3, 0.01) end;
    m3 := coalesce(m3, nullif((operacao_volume_pedido(et.pedido_id, et.tipo in ('desmontagem','descarregamento','triagem_volta'))->>'m3')::numeric, 0), (reg->>'volume_padrao_m3')::numeric, 10);
    precisa := operacao_sugerido(et.tipo, m3, reg);

    -- quem está ocupado nessa janela (em outra etapa)
    create temp table if not exists _ocupados(funcionario_id uuid, free_id uuid) on commit drop;
    truncate _ocupados;
    insert into _ocupados
      select p.funcionario_id, p.free_id from operacao_etapa_pessoas p join operacao_etapas o on o.id = p.etapa_id
       where o.empresa_id = p_empresa and o.id <> et.id and operacao_janela(o.data, o.hora, o.tipo, reg) && jan;

    tem_resp := exists (select 1 from operacao_etapa_pessoas where etapa_id = et.id and papel = 'responsavel');
    if not tem_resp then
      select f.id, f.nome into pessoa from funcionarios_acesso f
       where f.empresa_id = p_empresa and f.ativo and f.lider_operacao and f.equipe_operacional = conf->>'equipe'
         and public.escala_pessoa_compativel(p_empresa,et.id,f.id,null)
         and not exists (select 1 from _ocupados o where o.funcionario_id = f.id)
         and not exists (select 1 from operacao_etapa_pessoas x where x.etapa_id = et.id and x.funcionario_id = f.id)
       order by (select count(*) from operacao_etapa_pessoas x join operacao_etapas o on o.id = x.etapa_id
                  where x.funcionario_id = f.id and o.data between et.data - 7 and et.data + 7), f.nome
       limit 1;
      if found then
        insert into operacao_etapa_pessoas (empresa_id, etapa_id, funcionario_id, nome, papel) values (p_empresa, et.id, pessoa.id, pessoa.nome, 'responsavel');
        tem_resp := true; mudou := true;
      end if;
    end if;

    n_eq := (select count(*) from operacao_etapa_pessoas where etapa_id = et.id and papel = 'equipe');
    if n_eq = 0 then
      -- fixos da equipe (não-líderes primeiro), depois free com vaga confirmada, depois free aprovados
      for pessoa in
        select f.id, null::uuid free_id, f.nome, 1 grupo, f.lider_operacao ordem2,
               (select count(*) from operacao_etapa_pessoas x join operacao_etapas o on o.id = x.etapa_id
                 where x.funcionario_id = f.id and o.data between et.data - 7 and et.data + 7) carga
          from funcionarios_acesso f
         where f.empresa_id = p_empresa and f.ativo and f.equipe_operacional = conf->>'equipe'
           and not exists (select 1 from _ocupados o where o.funcionario_id = f.id)
           and not exists (select 1 from operacao_etapa_pessoas x where x.etapa_id = et.id and x.funcionario_id = f.id)
        union all
        select null, c.id, c.nome, 3, false,
               (select count(*) from operacao_etapa_pessoas x join operacao_etapas o on o.id = x.etapa_id
                 where x.free_id = c.id and o.data between et.data - 7 and et.data + 7)
          from free_cadastros c
         where c.empresa_id = p_empresa and c.status = 'aprovado' and coalesce((reg->>'usar_free')::boolean, true)
           and not exists (select 1 from _ocupados o where o.free_id = c.id)
           and not exists (select 1 from operacao_etapa_pessoas x where x.etapa_id = et.id and x.free_id = c.id)
         order by 4, 5, 6, 3
      loop
        exit when n_eq >= precisa - (case when tem_resp then 1 else 0 end);
        continue when not public.escala_pessoa_compativel(p_empresa,et.id,pessoa.id,pessoa.free_id);
        insert into operacao_etapa_pessoas (empresa_id, etapa_id, funcionario_id, free_id, nome, papel, ordem)
        values (p_empresa, et.id, pessoa.id, pessoa.free_id, pessoa.nome, 'equipe', n_eq);
        n_eq := n_eq + 1; mudou := true;
      end loop;
    end if;

    if coalesce((conf->>'caminhao')::boolean, false) and et.servico_ref is null and not exists (select 1 from operacao_etapa_caminhoes where etapa_id = et.id) then
      par := null;
      if et.tipo in ('montagem','descarregamento') then
        select c.caminhao_id into par from operacao_etapas o join operacao_etapa_caminhoes c on c.etapa_id = o.id
         where o.pedido_id = et.pedido_id and o.tipo = case et.tipo when 'montagem' then 'carregamento' else 'desmontagem' end limit 1;
      end if;
      if par is not null then
        insert into operacao_etapa_caminhoes (etapa_id, caminhao_id, empresa_id)
          select et.id, c.caminhao_id, p_empresa from operacao_etapas o join operacao_etapa_caminhoes c on c.etapa_id = o.id
           where o.pedido_id = et.pedido_id and o.tipo = case et.tipo when 'montagem' then 'carregamento' else 'desmontagem' end
          on conflict do nothing;
        mudou := true;
      else
        select k.id into cam from caminhoes k
         where k.empresa_id = p_empresa and k.status = 'ativo' and coalesce(k.codigo, '') <> ''
           and not exists (select 1 from operacao_etapa_caminhoes c join operacao_etapas o on o.id = c.etapa_id
                            where c.caminhao_id = k.id and o.id <> et.id and o.pedido_id is distinct from et.pedido_id
                              and operacao_janela(o.data, o.hora, o.tipo, reg) && jan)
         order by (k.capacidade_m3 >= m3) desc, case when k.capacidade_m3 >= m3 then k.capacidade_m3 else -k.capacidade_m3 end
         limit 1;
        if found then
          insert into operacao_etapa_caminhoes (etapa_id, caminhao_id, empresa_id) values (et.id, cam.id, p_empresa);
          mudou := true;
        end if;
      end if;
    end if;
    if mudou then total := total + 1; end if;
  end loop;
  return total;
end $function$;

create or replace function public.pedido_extra_proteger_principal() returns trigger
language plpgsql security definer set search_path = public as $$
declare lista text;
begin
  if tg_op = 'DELETE' then
    select string_agg(numero_pedido, ', ' order by criado_em) into lista from separacoes_pedidos where pedido_origem_id = old.id;
    if lista is not null then raise exception 'O pedido % tem pedidos extras (%). Exclua os extras antes.', old.numero_pedido, lista; end if;
    return old;
  end if;
  if new.pedido_origem_id is null and (new.status = 'cancelado' or new.status_comercial = 'cancelado')
     and not (old.status = 'cancelado' or old.status_comercial = 'cancelado') then
    select string_agg(numero_pedido, ', ' order by criado_em) into lista from separacoes_pedidos
     where pedido_origem_id = new.id and coalesce(status, '') <> 'cancelado' and coalesce(status_comercial, '') <> 'cancelado';
    if lista is not null then raise exception 'O pedido % tem pedidos extras ativos (%). Cancele os extras antes de cancelar o pedido principal.', new.numero_pedido, lista; end if;
  end if;
  return new;
end $$;
drop trigger if exists pedido_extra_proteger on public.separacoes_pedidos;
create trigger pedido_extra_proteger before update of status, status_comercial or delete on public.separacoes_pedidos
  for each row execute function public.pedido_extra_proteger_principal();
