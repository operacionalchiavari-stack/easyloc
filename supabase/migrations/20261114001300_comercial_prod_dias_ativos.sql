-- Produtividade comercial (nov/2026): + dias com atividade (dias diferentes com alguma ação registrada da pessoa no Comercial).
-- Indicadores por pessoa, todos tirados de dados reais do sistema.
-- Quais aparecem no painel é escolhido em Parâmetros > Comercial (config.indicadores em comercial_prod_config).
-- "Dono" do pedido = quem criou (separacoes_pedidos.criado_por); pedido antigo sem criado_por usa quem registrou a criação
-- no histórico do comercial (comercial_prod_eventos tipo criacao, senão comercial_historico tipo pedido).
-- Mesmo controle de acesso do painel: participantes do comercial, a própria pessoa e quem tem acesso em "Quem pode ver de quem".

create or replace function public.comercial_prod_indicadores(p_empresa uuid, p_de date, p_ate date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare cfg jsonb; alvos uuid[]; hoje date := (now() at time zone 'America/Sao_Paulo')::date; dias_contato int; res jsonb;
begin
  perform comercial_prod_exigir(p_empresa);
  if p_de is null or p_ate is null or p_ate < p_de or p_ate - p_de > 366 then raise exception 'Selecione um período de até 366 dias'; end if;
  select config into cfg from comercial_prod_config where empresa_id = p_empresa;
  select coalesce(array_agg(f.id), '{}') into alvos from funcionarios_acesso f
   where f.empresa_id = p_empresa and coalesce(cfg->'participantes', '[]'::jsonb) ? f.id::text
     and (f.id = auth.uid() or exists (select 1 from jsonb_array_elements(coalesce(cfg->'acessos', '[]'::jsonb)) a where a->>'observador' = auth.uid()::text and a->>'alvo' = f.id::text));
  select coalesce(nullif(c.config->>'dias_proximo_contato', '')::int, 3) into dias_contato from (select 1) x left join comercial_prod_config c on c.empresa_id = p_empresa;

  with ped as (
    select p.*, coalesce(p.criado_por,
             (select e.autor_id from comercial_prod_eventos e where e.pedido_id = p.id and e.tipo = 'criacao' order by e.criado_em limit 1),
             (select h.autor_id from comercial_historico h where h.pedido_id = p.id and h.tipo = 'pedido' and h.autor_id is not null order by h.criado_em limit 1)) dono,
           (p.criado_em at time zone 'America/Sao_Paulo')::date criado_dia
      from separacoes_pedidos p
     where p.empresa_id = p_empresa
       and coalesce(p.observacoes->>'teste_cronograma', '') <> 'true' and coalesce(p.observacoes->>'teste_ia', '') <> 'true'
  ),
  -- fechamento = primeira vez que o pedido virou Reservado (histórico); criado já como Reservado conta na criação
  fech as (
    select p.id, p.valor_total, coalesce(h.autor_id, p.dono) quem, coalesce((h.criado_em at time zone 'America/Sao_Paulo')::date, p.criado_dia) dia
      from ped p
      left join lateral (select h.autor_id, h.criado_em from comercial_historico h
                          where h.pedido_id = p.id and h.tipo = 'status' and h.descricao like 'Mudou a situação:%→ Reservado' order by h.criado_em limit 1) h on true
     where h.criado_em is not null
        or (p.status_comercial in ('aprovado', 'finalizado', 'enviado')
            and not exists (select 1 from comercial_historico h2 where h2.pedido_id = p.id and h2.tipo = 'status' and h2.descricao like 'Mudou a situação:%'))
  ),
  canc as (
    select p.id, p.valor_total, p.dono,
           coalesce(nullif(left(coalesce(p.observacoes->'cancelamento'->>'data', p.observacoes->'cancelamento'->>'em'), 10), '')::date,
                    (p.atualizado_em at time zone 'America/Sao_Paulo')::date) dia
      from ped p where p.status_comercial = 'cancelado'
  ),
  ultimo_contato as (
    select distinct on (f.alvo_id) f.alvo_id, f.proximo from comercial_followups f
     where f.empresa_id = p_empresa and f.alvo_tipo = 'pedido' order by f.alvo_id, f.criado_em desc
  ),
  pessoas as (
    select f.id, f.nome,
      (select count(*) from ped p where p.dono = f.id and p.pedido_origem_id is null and p.criado_dia between p_de and p_ate) pedidos_criados,
      (select coalesce(sum(p.valor_total), 0) from ped p where p.dono = f.id and p.pedido_origem_id is null and p.criado_dia between p_de and p_ate) valor_orcado,
      (select count(*) from fech x where x.quem = f.id and x.dia between p_de and p_ate) pedidos_fechados,
      (select coalesce(sum(x.valor_total), 0) from fech x where x.quem = f.id and x.dia between p_de and p_ate) valor_fechado,
      (select count(*) from ped p where p.dono = f.id and p.pedido_origem_id is null and p.criado_dia between p_de and p_ate and p.status_comercial in ('aprovado', 'finalizado', 'enviado')) criados_convertidos,
      (select count(*) from canc c where c.dono = f.id and c.dia between p_de and p_ate) cancelados,
      (select coalesce(sum(c.valor_total), 0) from canc c where c.dono = f.id and c.dia between p_de and p_ate) valor_cancelado,
      (select count(*) from comercial_followup_encerrados e where e.empresa_id = p_empresa and e.por = f.id and (e.em at time zone 'America/Sao_Paulo')::date between p_de and p_ate) nao_vai_fechar,
      (select count(*) from comercial_followups x where x.empresa_id = p_empresa and x.criado_por = f.id and (x.criado_em at time zone 'America/Sao_Paulo')::date between p_de and p_ate) acompanhamentos,
      (select count(*) from ped p left join ultimo_contato u on u.alvo_id = p.id
        where p.dono = f.id and p.status_comercial in ('orcamento', 'pre_reserva')
          and not exists (select 1 from comercial_followup_encerrados e where e.empresa_id = p_empresa and e.alvo_id = p.id)
          and coalesce(u.proximo, (coalesce(p.data_hora, p.criado_em) at time zone 'America/Sao_Paulo')::date + dias_contato) < hoje) contatos_atrasados,
      (select count(*) from ped p where p.dono = f.id and p.status_comercial = 'pre_reserva' and p.pre_reserva_ate < hoje) pre_reservas_vencidas,
      (select count(distinct e.pedido_id) from comercial_prod_eventos e where e.empresa_id = p_empresa and e.autor_id = f.id and e.tipo = 'alteracao' and (e.criado_em at time zone 'America/Sao_Paulo')::date between p_de and p_ate) pedidos_alterados,
      (select count(*) from comercial_prod_eventos e where e.empresa_id = p_empresa and e.autor_id = f.id and e.tipo = 'alteracao' and (e.criado_em at time zone 'America/Sao_Paulo')::date between p_de and p_ate) alteracoes,
      (select coalesce(sum(b.valor), 0) from fin_baixas b join fin_receber r on r.id = b.receber_id join ped p on p.id = r.pedido_id
        where b.empresa_id = p_empresa and b.estornado_em is null and p.dono = f.id and b.data between p_de and p_ate) recebido,
      (select count(*) from posvenda_contatos v where v.empresa_id = p_empresa and v.feito_por = f.id and v.status = 'concluido' and (v.concluido_em at time zone 'America/Sao_Paulo')::date between p_de and p_ate) posvenda_ligacoes,
      (select count(distinct d) from (
         select (e.criado_em at time zone 'America/Sao_Paulo')::date d from comercial_prod_eventos e where e.empresa_id = p_empresa and e.autor_id = f.id
         union all select (h.criado_em at time zone 'America/Sao_Paulo')::date from comercial_historico h where h.empresa_id = p_empresa and h.autor_id = f.id
         union all select (x.criado_em at time zone 'America/Sao_Paulo')::date from comercial_followups x where x.empresa_id = p_empresa and x.criado_por = f.id
         union all select (e.em at time zone 'America/Sao_Paulo')::date from comercial_followup_encerrados e where e.empresa_id = p_empresa and e.por = f.id
         union all select (v.concluido_em at time zone 'America/Sao_Paulo')::date from posvenda_contatos v where v.empresa_id = p_empresa and v.feito_por = f.id and v.concluido_em is not null
       ) dd where d between p_de and p_ate) dias_ativos
    from funcionarios_acesso f where f.empresa_id = p_empresa and f.id = any(alvos)
  )
  select jsonb_build_object('pessoas', coalesce((select jsonb_agg(to_jsonb(x) order by x.nome) from pessoas x), '[]'),
                            'indicadores', cfg->'indicadores') into res;
  return res;
end $$;
revoke all on function public.comercial_prod_indicadores(uuid, date, date) from public, anon;
grant execute on function public.comercial_prod_indicadores(uuid, date, date) to authenticated;
notify pgrst, 'reload schema';
