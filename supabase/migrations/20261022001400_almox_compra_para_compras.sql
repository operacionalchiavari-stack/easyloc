-- Solicitação de compra automática do Almoxarifado também entra no módulo Compras (Estoque > Compras) (out/2026).
-- Cada solicitação aberta vira uma necessidade (compras_registros tipo 'necessidade', origem 'estoque_minimo',
-- já vinculada ao material do Almoxarifado: material_id = ID do produto na planilha) e as duas andam juntas:
--  * a solicitação muda de quantidade -> a necessidade acompanha, enquanto ainda não foi cotada;
--  * a solicitação fecha (estoque reposto, "Comprada" ou "Cancelar") -> a necessidade sai da fila se ainda não foi cotada;
--  * Compras gera o pedido de compra da necessidade -> a solicitação do Almoxarifado vira "Comprada (Compras)".

alter table public.almox_solicitacoes_compra add column if not exists compras_necessidade_id uuid references public.compras_registros(id) on delete set null;

create or replace function public.almox_sync_compras() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare nid uuid; prox bigint; n compras_registros;
begin
  if pg_trigger_depth() > 2 then return new; end if;
  if tg_op = 'INSERT' and new.status = 'aberta' then
    perform pg_advisory_xact_lock(hashtextextended('compras:' || new.empresa_id::text, 0));
    select coalesce(max(numero), 0) + 1 into prox from compras_registros where empresa_id = new.empresa_id and tipo = 'necessidade';
    insert into compras_registros (empresa_id, tipo, numero, status, dados, criado_por)
    values (new.empresa_id, 'necessidade', prox, 'pendente', jsonb_build_object(
      'origem', 'estoque_minimo', 'pcp_status', 'published', 'solicitante_nome', 'Automático',
      'material_id', new.produto_id, 'material_codigo', new.codigo, 'material_nome', new.produto,
      'descricao_item', new.produto, 'unidade', coalesce(nullif(new.unidade, ''), 'un'),
      'quantidade', new.quantidade, 'quantidade_faltante', new.quantidade, 'quantidade_comprada', 0,
      'estoque_atual', new.estoque_no_pedido, 'estoque_minimo', new.estoque_minimo, 'estoque_ideal', new.estoque_ideal,
      'almox_solicitacao_id', new.id, 'almox_solicitacao_numero', new.numero), null)
    returning id into nid;
    update almox_solicitacoes_compra set compras_necessidade_id = nid where id = new.id;
    return new;
  end if;
  if tg_op = 'UPDATE' and new.compras_necessidade_id is not null then
    select * into n from compras_registros where id = new.compras_necessidade_id for update;
    if not found or n.status <> 'pendente' or coalesce((n.dados->>'quantidade_comprada')::numeric, 0) > 0 then return new; end if;
    if new.status = 'aberta' then
      update compras_registros set dados = dados || jsonb_build_object('quantidade', new.quantidade, 'quantidade_faltante', new.quantidade,
             'estoque_atual', new.estoque_no_pedido, 'estoque_minimo', new.estoque_minimo, 'estoque_ideal', new.estoque_ideal),
             updated_at = now() where id = n.id;
    elsif old.status = 'aberta' then
      update compras_registros set status = case when new.status = 'cancelada' then 'cancelada' else 'atendida' end,
             dados = dados || jsonb_build_object('encerrada_pelo_almoxarifado', coalesce(new.concluida_por_nome, 'Almoxarifado')),
             updated_at = now() where id = n.id;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists almox_sync_compras on public.almox_solicitacoes_compra;
create trigger almox_sync_compras after insert or update on public.almox_solicitacoes_compra
for each row execute function public.almox_sync_compras();

-- Compras gerou o pedido de compra da necessidade -> fecha a solicitação no Almoxarifado.
create or replace function public.compras_sync_almox() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if pg_trigger_depth() > 2 then return new; end if;
  if new.tipo = 'necessidade' and new.dados ? 'almox_solicitacao_id'
     and new.status = 'comprada' and old.status is distinct from 'comprada' then
    update almox_solicitacoes_compra set status = 'comprada', concluida_em = now(),
           concluida_por_nome = 'Compras (pedido de compra emitido)', liberada = false, atualizado_em = now()
     where id = (new.dados->>'almox_solicitacao_id')::uuid and status = 'aberta';
  end if;
  return new;
end $$;

drop trigger if exists compras_sync_almox on public.compras_registros;
create trigger compras_sync_almox after update of status on public.compras_registros
for each row execute function public.compras_sync_almox();

revoke all on function public.almox_sync_compras() from public, anon, authenticated;
revoke all on function public.compras_sync_almox() from public, anon, authenticated;

-- Solicitações já abertas antes desta migration também entram em Compras.
insert into compras_registros (empresa_id, tipo, numero, status, dados)
select s.empresa_id, 'necessidade',
       coalesce((select max(numero) from compras_registros c where c.empresa_id = s.empresa_id and c.tipo = 'necessidade'), 0)
         + row_number() over (partition by s.empresa_id order by s.criado_em),
       'pendente', jsonb_build_object('origem', 'estoque_minimo', 'pcp_status', 'published', 'solicitante_nome', 'Automático',
       'material_id', s.produto_id, 'material_codigo', s.codigo, 'material_nome', s.produto, 'descricao_item', s.produto,
       'unidade', coalesce(nullif(s.unidade, ''), 'un'), 'quantidade', s.quantidade, 'quantidade_faltante', s.quantidade,
       'quantidade_comprada', 0, 'estoque_atual', s.estoque_no_pedido, 'estoque_minimo', s.estoque_minimo,
       'estoque_ideal', s.estoque_ideal, 'almox_solicitacao_id', s.id, 'almox_solicitacao_numero', s.numero)
  from almox_solicitacoes_compra s where s.status = 'aberta' and s.compras_necessidade_id is null;
update almox_solicitacoes_compra s set compras_necessidade_id = c.id
  from compras_registros c where c.tipo = 'necessidade' and (c.dados->>'almox_solicitacao_id')::uuid = s.id and s.compras_necessidade_id is null;
