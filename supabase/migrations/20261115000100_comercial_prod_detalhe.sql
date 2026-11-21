-- Produtividade comercial (nov/2026): os dados por trás de cada número (indicador × pessoa), para a gaveta lateral.
-- Mesmas regras de comercial_prod_indicadores (mesmos CTEs) e o mesmo controle de acesso.
create or replace function public.comercial_prod_detalhe(p_empresa uuid, p_de date, p_ate date, p_pessoa uuid, p_indicador text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare cfg jsonb; hoje date := (now() at time zone 'America/Sao_Paulo')::date; dias_contato int; res jsonb; f_id uuid := p_pessoa;
begin
  perform comercial_prod_exigir(p_empresa);
  if p_de is null or p_ate is null or p_ate < p_de or p_ate - p_de > 366 then raise exception 'Selecione um período de até 366 dias'; end if;
  select config into cfg from comercial_prod_config where empresa_id = p_empresa;
  if not exists (select 1 from funcionarios_acesso f where f.empresa_id = p_empresa and f.id = p_pessoa and coalesce(cfg->'participantes', '[]'::jsonb) ? f.id::text
     and (f.id = auth.uid() or exists (select 1 from jsonb_array_elements(coalesce(cfg->'acessos', '[]'::jsonb)) a where a->>'observador' = auth.uid()::text and a->>'alvo' = f.id::text))) then
    raise exception 'Sem acesso a esta pessoa' using errcode = '42501';
  end if;
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
  -- imagens do Módulo 3D salvas nos pedidos (observacoes.projeto_comercial.dados.ambientes[].renders[])
  rend as (
    select p.id pedido_id, nullif(r->>'criado_por', '')::uuid criado_por, nullif(r->>'ia_por', '')::uuid ia_por,
           (nullif(r->>'criado_em', '')::timestamptz at time zone 'America/Sao_Paulo')::date criado_dia,
           (nullif(coalesce(r->>'ia_em', r->>'atualizado_em'), '')::timestamptz at time zone 'America/Sao_Paulo')::date ia_dia
      from ped p
      cross join lateral jsonb_array_elements(case when jsonb_typeof(p.observacoes->'projeto_comercial'->'dados'->'ambientes') = 'array' then p.observacoes->'projeto_comercial'->'dados'->'ambientes' else '[]'::jsonb end) a
      cross join lateral jsonb_array_elements(case when jsonb_typeof(a->'renders') = 'array' then a->'renders' else '[]'::jsonb end) r
     where r ? 'criado_por' or r ? 'ia_por'
  ),
  ultimo_contato as (
    select distinct on (f.alvo_id) f.alvo_id, f.proximo from comercial_followups f
     where f.empresa_id = p_empresa and f.alvo_tipo = 'pedido' order by f.alvo_id, f.criado_em desc
  ),
  linhas as (
    -- pedidos criados (e as contas que derivam deles)
    select p.criado_dia dia, p.id pedido_id, p.numero_pedido::text pedido, p.cliente_nome::text cliente,
           case p.status_comercial when 'orcamento' then 'Orçamento' when 'pre_reserva' then 'Pré-reserva' when 'cancelado' then 'Cancelado' else 'Reservado' end detalhe, p.valor_total valor
      from ped p where p_indicador in ('pedidos_criados', 'valor_orcado', 'taxa_conversao') and p.dono = f_id and p.pedido_origem_id is null and p.criado_dia between p_de and p_ate
    union all
    select x.dia, p.id, p.numero_pedido, p.cliente_nome, 'Fechado (virou Reservado)', x.valor_total
      from fech x join ped p on p.id = x.id where p_indicador in ('pedidos_fechados', 'valor_fechado', 'ticket_medio') and x.quem = f_id and x.dia between p_de and p_ate
    union all
    select b.data, p.id, p.numero_pedido, p.cliente_nome, coalesce(r.descricao, 'Recebimento') || ' · parcela ' || r.parcela || '/' || r.parcelas, b.valor
      from fin_baixas b join fin_receber r on r.id = b.receber_id join ped p on p.id = r.pedido_id
     where p_indicador = 'recebido' and b.empresa_id = p_empresa and b.estornado_em is null and p.dono = f_id and b.data between p_de and p_ate
    union all
    select p.criado_dia, p.id, p.numero_pedido, p.cliente_nome, 'Extra do pedido ' || coalesce((select o.numero_pedido from separacoes_pedidos o where o.id = p.pedido_origem_id), ''), p.valor_total
      from ped p where p_indicador in ('pedidos_extras', 'valor_extras') and p.dono = f_id and p.pedido_origem_id is not null and p.criado_dia between p_de and p_ate
    union all
    select c.dia, p.id, p.numero_pedido, p.cliente_nome, 'Cancelado' || coalesce(': ' || nullif(p.observacoes->'cancelamento'->>'motivo', ''), ''), c.valor_total
      from canc c join ped p on p.id = c.id where p_indicador in ('cancelados', 'valor_cancelado') and c.dono = f_id and c.dia between p_de and p_ate
    union all
    select (e.em at time zone 'America/Sao_Paulo')::date, p.id, p.numero_pedido, p.cliente_nome, 'Não vai fechar: ' || e.motivo || coalesce(' — ' || nullif(e.observacao, ''), ''), p.valor_total
      from comercial_followup_encerrados e left join ped p on p.id = e.alvo_id
     where p_indicador = 'nao_vai_fechar' and e.empresa_id = p_empresa and e.por = f_id and (e.em at time zone 'America/Sao_Paulo')::date between p_de and p_ate
    union all
    select (x.criado_em at time zone 'America/Sao_Paulo')::date, p.id, p.numero_pedido, p.cliente_nome, x.motivo || coalesce(' — ' || nullif(x.observacao, ''), '') || coalesce(' · próximo contato ' || to_char(x.proximo, 'DD/MM/YYYY'), ''), p.valor_total
      from comercial_followups x left join ped p on p.id = x.alvo_id
     where p_indicador = 'acompanhamentos' and x.empresa_id = p_empresa and x.criado_por = f_id and (x.criado_em at time zone 'America/Sao_Paulo')::date between p_de and p_ate
    union all
    select coalesce(u.proximo, (coalesce(p.data_hora, p.criado_em) at time zone 'America/Sao_Paulo')::date + dias_contato), p.id, p.numero_pedido, p.cliente_nome,
           'Próximo contato era ' || to_char(coalesce(u.proximo, (coalesce(p.data_hora, p.criado_em) at time zone 'America/Sao_Paulo')::date + dias_contato), 'DD/MM/YYYY'), p.valor_total
      from ped p left join ultimo_contato u on u.alvo_id = p.id
     where p_indicador = 'contatos_atrasados' and p.dono = f_id and p.status_comercial in ('orcamento', 'pre_reserva')
       and not exists (select 1 from comercial_followup_encerrados e where e.empresa_id = p_empresa and e.alvo_id = p.id)
       and coalesce(u.proximo, (coalesce(p.data_hora, p.criado_em) at time zone 'America/Sao_Paulo')::date + dias_contato) < hoje
    union all
    select p.pre_reserva_ate, p.id, p.numero_pedido, p.cliente_nome, 'Pré-reserva vencida em ' || to_char(p.pre_reserva_ate, 'DD/MM/YYYY'), p.valor_total
      from ped p where p_indicador = 'pre_reservas_vencidas' and p.dono = f_id and p.status_comercial = 'pre_reserva' and p.pre_reserva_ate < hoje
    union all
    select (e.criado_em at time zone 'America/Sao_Paulo')::date, p.id, p.numero_pedido, p.cliente_nome,
           case when e.tipo = 'criacao' then 'Criou o pedido' else jsonb_array_length(e.detalhes) || ' campo(s) alterado(s)' end, p.valor_total
      from comercial_prod_eventos e left join ped p on p.id = e.pedido_id
     where p_indicador in ('pedidos_alterados', 'alteracoes') and e.empresa_id = p_empresa and e.autor_id = f_id and e.tipo = 'alteracao' and (e.criado_em at time zone 'America/Sao_Paulo')::date between p_de and p_ate
    union all
    select (v.concluido_em at time zone 'America/Sao_Paulo')::date, null, null, v.cliente_nome, 'Ligação de pós-venda' || case when v.atencao then ' · precisa de atenção' else '' end, null
      from posvenda_contatos v where p_indicador = 'posvenda_ligacoes' and v.empresa_id = p_empresa and v.feito_por = f_id and v.status = 'concluido' and (v.concluido_em at time zone 'America/Sao_Paulo')::date between p_de and p_ate
    union all
    select r.criado_dia, p.id, p.numero_pedido, p.cliente_nome, 'Imagem do 3D salva no pedido', null
      from rend r join ped p on p.id = r.pedido_id where p_indicador in ('imagens_3d', 'pedidos_com_3d') and r.criado_por = f_id and r.criado_dia between p_de and p_ate
    union all
    select r.ia_dia, p.id, p.numero_pedido, p.cliente_nome, 'Renderização com IA', null
      from rend r join ped p on p.id = r.pedido_id where p_indicador in ('renders_ia', 'pedidos_com_3d') and r.ia_por = f_id and r.ia_dia between p_de and p_ate
    union all
    select dd.d, null, null, null, count(*) || ' ação(ões) no Comercial', null
      from (select (e.criado_em at time zone 'America/Sao_Paulo')::date d from comercial_prod_eventos e where e.empresa_id = p_empresa and e.autor_id = f_id
            union all select (h.criado_em at time zone 'America/Sao_Paulo')::date from comercial_historico h where h.empresa_id = p_empresa and h.autor_id = f_id
            union all select (x.criado_em at time zone 'America/Sao_Paulo')::date from comercial_followups x where x.empresa_id = p_empresa and x.criado_por = f_id
            union all select (e.em at time zone 'America/Sao_Paulo')::date from comercial_followup_encerrados e where e.empresa_id = p_empresa and e.por = f_id
            union all select (v.concluido_em at time zone 'America/Sao_Paulo')::date from posvenda_contatos v where v.empresa_id = p_empresa and v.feito_por = f_id and v.concluido_em is not null) dd
     where p_indicador = 'dias_ativos' and dd.d between p_de and p_ate group by dd.d
  )
  select coalesce(jsonb_agg(to_jsonb(l) order by l.dia desc nulls last, l.pedido), '[]') into res from linhas l;
  return res;
end $$;
revoke all on function public.comercial_prod_detalhe(uuid, date, date, uuid, text) from public, anon;
grant execute on function public.comercial_prod_detalhe(uuid, date, date, uuid, text) to authenticated;
notify pgrst, 'reload schema';
