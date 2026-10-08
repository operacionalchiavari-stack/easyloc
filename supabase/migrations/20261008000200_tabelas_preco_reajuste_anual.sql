-- =====================================================================
-- Reajuste anual automático das tabelas de preço
--
-- Pedido: "programar criação de tabela automática todo ano com a % que a
-- pessoa escolher". Uma linha por empresa em tabelas_preco_agendamento
-- (percentual, dia/mês, se a tabela nova já deve ser ativada). Uma rotina
-- diária (pg_cron, 09:00 UTC = 06:00 em Brasília) cria, no dia marcado,
-- a "TABELA <ano>" copiando os preços da tabela base com o reajuste.
--
-- Também: o catálogo deixa de procurar a "TABELA 2026" pelo nome e passa
-- a mostrar o preço da tabela ATIVA (a de ano mais recente), pra acompanhar
-- a tabela do ano novo sozinho.
-- =====================================================================

create extension if not exists pg_cron;

create table if not exists public.tabelas_preco_agendamento (
  empresa_id uuid primary key references public.empresas(id) on delete cascade,
  ativo boolean not null default true,
  percentual numeric(6,2) not null,
  dia smallint not null default 1,
  mes smallint not null default 1,
  ano_seguinte boolean not null default false,
  ativar_automaticamente boolean not null default false,
  ultima_execucao_ano integer,
  ultima_execucao_em timestamptz,
  ultimo_resultado text,
  ultima_tabela_id uuid references public.tabelas_preco(id) on delete set null,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid,
  constraint tp_agend_percentual check (percentual between -90 and 500),
  constraint tp_agend_dia check (dia between 1 and 31),
  constraint tp_agend_mes check (mes between 1 and 12)
);

comment on table public.tabelas_preco_agendamento is
  'Reajuste anual automático: no dia/mês marcado cria a TABELA <ano> copiando a tabela base com o percentual. Uma linha por empresa.';
comment on column public.tabelas_preco_agendamento.ano_seguinte is
  'true = a tabela criada é do ano seguinte ao da data (ex.: criar em dezembro a tabela do próximo ano).';

alter table public.tabelas_preco_agendamento enable row level security;

drop policy if exists tp_agend_membro on public.tabelas_preco_agendamento;
create policy tp_agend_membro on public.tabelas_preco_agendamento
  for all to authenticated
  using (public.eh_membro_empresa(empresa_id))
  with check (public.eh_membro_empresa(empresa_id));

-- O resultado da execução só é escrito pela rotina (security definer);
-- quem edita pela tela não deve forjar "já rodou este ano".
create or replace function public.tp_agend_protege_execucao()
returns trigger language plpgsql as $$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      new.ultima_execucao_ano := null; new.ultima_execucao_em := null;
      new.ultimo_resultado := null; new.ultima_tabela_id := null;
    else
      new.ultima_execucao_ano := old.ultima_execucao_ano; new.ultima_execucao_em := old.ultima_execucao_em;
      new.ultimo_resultado := old.ultimo_resultado; new.ultima_tabela_id := old.ultima_tabela_id;
    end if;
    new.atualizado_por := auth.uid();
  end if;
  new.atualizado_em := now();
  return new;
end $$;

drop trigger if exists tp_agend_protege_execucao on public.tabelas_preco_agendamento;
create trigger tp_agend_protege_execucao
  before insert or update on public.tabelas_preco_agendamento
  for each row execute function public.tp_agend_protege_execucao();

-- ---------------------------------------------------------------------
-- Rotina: roda todo dia; só age no dia marcado (ou depois, se o servidor
-- ficou parado), uma vez por ano por empresa.
-- p_hoje existe só pra teste; o pg_cron chama sem argumento.
-- ---------------------------------------------------------------------
create or replace function public.tabelas_preco_rodar_agendamentos(p_hoje date default null)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_hoje date := coalesce(p_hoje, (now() at time zone 'America/Sao_Paulo')::date);
  v_ano_hoje integer := extract(year from v_hoje)::int;
  a record;
  v_data date;
  v_ano_tabela integer;
  v_nome text;
  v_base record;
  v_nova uuid;
  v_qtd integer;
  v_feitas integer := 0;
begin
  for a in select * from public.tabelas_preco_agendamento where ativo for update skip locked loop
    -- dia 31 em mês curto (ou 29/02) cai no último dia do mês
    v_data := make_date(v_ano_hoje, a.mes, 1)
              + (least(a.dia, extract(day from (make_date(v_ano_hoje, a.mes, 1) + interval '1 month - 1 day'))::int) - 1);
    if v_hoje < v_data or coalesce(a.ultima_execucao_ano, 0) >= v_ano_hoje then
      continue;
    end if;

    v_ano_tabela := v_ano_hoje + case when a.ano_seguinte then 1 else 0 end;
    v_nome := 'TABELA ' || v_ano_tabela;

    -- base: a tabela ativa mais recente; sem nenhuma ativa, a de ano mais recente
    select tp.id, tp.nome, tp.ano_referencia into v_base
      from public.tabelas_preco tp
     where tp.empresa_id = a.empresa_id and not (tp.nome = v_nome and tp.ano_referencia = v_ano_tabela)
     order by tp.ativa desc, tp.ano_referencia desc, tp.updated_at desc
     limit 1;

    if exists (select 1 from public.tabelas_preco where empresa_id = a.empresa_id and nome = v_nome and ano_referencia = v_ano_tabela) then
      update public.tabelas_preco_agendamento
         set ultima_execucao_ano = v_ano_hoje, ultima_execucao_em = now(),
             ultimo_resultado = 'A ' || v_nome || ' já existia — nada foi criado.'
       where empresa_id = a.empresa_id;
      continue;
    end if;

    if v_base.id is null then
      update public.tabelas_preco_agendamento
         set ultima_execucao_ano = v_ano_hoje, ultima_execucao_em = now(),
             ultimo_resultado = 'Nenhuma tabela base encontrada — nada foi criado.'
       where empresa_id = a.empresa_id;
      continue;
    end if;

    insert into public.tabelas_preco (empresa_id, nome, ano_referencia, ativa, observacoes)
    values (a.empresa_id, v_nome, v_ano_tabela, false,
            'Criada automaticamente em ' || to_char(v_hoje, 'DD/MM/YYYY') || ' com reajuste de '
            || replace(to_char(a.percentual, 'FM990.00'), '.', ',') || '% sobre a ' || v_base.nome || '.')
    returning id into v_nova;

    insert into public.itens_precos (empresa_id, tabela_preco_id, item_id, valor_locacao)
    select a.empresa_id, v_nova, ip.item_id, round(ip.valor_locacao * (1 + a.percentual / 100.0), 2)
      from public.itens_precos ip
     where ip.empresa_id = a.empresa_id and ip.tabela_preco_id = v_base.id;
    get diagnostics v_qtd = row_count;

    if a.ativar_automaticamente then
      update public.tabelas_preco set ativa = false
       where empresa_id = a.empresa_id and ativa and id <> v_nova;
      update public.tabelas_preco set ativa = true where id = v_nova;   -- o gatilho copia os preços pros itens
    end if;

    update public.tabelas_preco_agendamento
       set ultima_execucao_ano = v_ano_hoje, ultima_execucao_em = now(), ultima_tabela_id = v_nova,
           ultimo_resultado = v_nome || ' criada com ' || v_qtd || ' preços ('
             || replace(to_char(a.percentual, 'FM990.00'), '.', ',') || '% sobre a ' || v_base.nome || ')'
             || case when a.ativar_automaticamente then ' e ativada.' else ', inativa.' end
     where empresa_id = a.empresa_id;
    v_feitas := v_feitas + 1;
  end loop;
  return v_feitas;
end $$;

revoke execute on function public.tabelas_preco_rodar_agendamentos(date) from public, anon, authenticated;

select cron.unschedule(jobid) from cron.job where jobname = 'tabelas-preco-reajuste-anual';
select cron.schedule('tabelas-preco-reajuste-anual', '0 9 * * *', 'select public.tabelas_preco_rodar_agendamentos()');

-- ---------------------------------------------------------------------
-- Catálogo: preço da tabela ATIVA (a de ano mais recente), não mais a
-- "TABELA 2026" fixa pelo nome. Hoje só a TABELA 2026 está ativa, então
-- o resultado é o mesmo; muda sozinho quando a tabela do ano novo for ativada.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.catalogo_acervo(p_empresa_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
 select coalesce(jsonb_agg(jsonb_build_object(
  'id',i.id,'tipo',i.tipo,'produto',i.produto,'produto_base',i.produto_base,
  'material',i.material,'cor',i.cor,'categoria',i.categoria,'familia',i.familia,
  'subcategoria',i.subcategoria,
  'valor_locacao',preco.valor_locacao,'valor_reposicao',i.valor_reposicao,
  'estilo',i.estilo,'referencia',i.referencia,'marca_modelo',i.marca_modelo,
  'descricao_total',i.descricao_total,'descricao_complementar',i.descricao_complementar,
  'largura',i.largura,'altura',i.altura,'profundidade',i.profundidade,
  'foto_url',i.foto_url,'destaque_site',i.destaque_site,'capa_categoria',i.capa_categoria,
  'capa_modulo3d_estudio',i.capa_modulo3d_estudio,
  'capa_modulo3d_lounge',i.capa_modulo3d_lounge,
  'capa_modulo3d_ar',i.capa_modulo3d_ar,
  'ordem_exposicao_site',i.ordem_exposicao_site,
  'categoria_ordem',co.ordem,
  'personalizable',exists(select 1 from public.personalizacoes p
    where p.empresa_id=p_empresa_id and p.vinculo_id::text=i.id::text and p.alvo='ITEM' and p.status='ATIVO'),
  'itens_modelos_3d',coalesce((select jsonb_agg(jsonb_build_object('url',m.url,'status',m.status) order by m.id)
    from public.itens_modelos_3d m where m.item_id=i.id and m.empresa_id=p_empresa_id and m.status is distinct from 'removido'),'[]'::jsonb),
  'itens_fotos',coalesce((select jsonb_agg(jsonb_build_object('slot',f.slot,'tipo',f.tipo,'titulo',f.titulo,'url',f.url,'path',f.path,'ordem',f.ordem,'cliente_id',f.cliente_id) order by f.ordem,f.id)
    from public.itens_fotos f where f.item_id=i.id and f.empresa_id=p_empresa_id and f.cliente_id is null),'[]'::jsonb)
 ) order by co.ordem nulls last,i.categoria,i.ordem_exposicao_site nulls last,i.produto,i.id),'[]'::jsonb)
 from public.itens i
 left join lateral (
   select ip.valor_locacao
   from public.itens_precos ip
   join public.tabelas_preco tp on tp.id=ip.tabela_preco_id
   where ip.item_id=i.id and tp.empresa_id=i.empresa_id
     and tp.ativa=true and ip.empresa_id=i.empresa_id
   order by tp.ano_referencia desc, tp.updated_at desc, tp.id
   limit 1
 ) preco on true
 left join public.catalogo_categorias_ordem co on co.empresa_id=i.empresa_id and co.categoria=i.categoria
 where i.empresa_id=p_empresa_id and i.ativo=true and i.exibir_no_site=true and i.tipo in ('Item','Kit');
$function$;
