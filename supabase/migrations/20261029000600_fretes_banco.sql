-- Fretes no banco (out/2026): sai da planilha antiga (motor da Vercel).
-- 1) A transportadora é um Fornecedor com login e senha (portal); cada caminhão aponta para o fornecedor dono.
-- 2) "O que o sistema registrou" = cada caminhão escalado no Painel Logístico, separado em ENTREGA (carregamento /
--    montagem) e COLETA (desmontagem / descarregamento). Valor = valor/km da categoria do caminhão × km do pedido ÷ 2
--    (o pedido cobra uma vez por caminhão: metade na ida, metade na volta). Sem o desconto (absorção) dado ao cliente.
-- 3) A transportadora entra no Cadastro de Fretes, vê as viagens dela (sem o valor do sistema) e informa o valor de cada
--    uma; pode lançar uma viagem extra que não esteja na lista.
-- 4) Na Conciliação a logística compara os dois, define o valor final e fecha várias viagens da mesma transportadora:
--    vira UMA conta a pagar (Financeiro) e um custo por pedido em Resultados (fin_custos_evento, categoria frete).
--    Cancelar a conta a pagar (sem pagamento) reabre as viagens.

-- ---------------------------------------------------------------- fornecedor: login do portal
alter table public.fornecedores
  add column if not exists portal_login text,
  add column if not exists portal_ativo boolean not null default false,
  add column if not exists portal_tentativas int not null default 0,
  add column if not exists portal_bloqueado_ate timestamptz,
  add column if not exists portal_ultimo_acesso timestamptz;
alter table public.fornecedores drop column if exists portal_senha_hash;
-- a senha fica numa tabela à parte, sem nenhuma leitura pelo navegador (o cadastro lê fornecedores com select *)
create table if not exists public.fornecedores_portal_senha (fornecedor_id uuid primary key references public.fornecedores(id) on delete cascade, senha_hash text not null);
alter table public.fornecedores_portal_senha enable row level security;
create unique index if not exists fornecedores_portal_login_uk on public.fornecedores (lower(portal_login)) where portal_login is not null;

alter table public.caminhoes add column if not exists fornecedor_id uuid references public.fornecedores(id) on delete set null;

-- sessões dos apps: transportadora e motorista (o motorista vem na migration do Uber)
alter table public.app_sessoes add column if not exists fornecedor_id uuid references public.fornecedores(id) on delete cascade;
alter table public.app_sessoes drop constraint if exists app_sessoes_tipo_check;
alter table public.app_sessoes add constraint app_sessoes_tipo_check check (tipo in ('montador', 'free', 'transportadora', 'motorista'));

-- ---------------------------------------------------------------- viagens
create table if not exists public.frete_viagens (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  pedido_id uuid references public.separacoes_pedidos(id) on delete set null,
  pedido_numero text,
  cliente_nome text,
  caminhao_id uuid references public.caminhoes(id) on delete set null,
  caminhao_codigo text,
  caminhao_categoria text,
  fornecedor_id uuid references public.fornecedores(id) on delete set null,
  fornecedor_nome text,
  direcao text not null check (direcao in ('entrega', 'coleta')),
  data date,
  origem text,
  destino text,
  km numeric not null default 0,
  valor_sistema numeric not null default 0,
  extra boolean not null default false,          -- lançada pela transportadora, sem estar escalada
  fora_escala boolean not null default false,    -- o caminhão saiu da escala depois de a transportadora informar o valor
  valor_transportadora numeric,
  transp_obs text,
  transp_enviado_em timestamptz,
  valor_final numeric,
  obs text,
  status text not null default 'aberto' check (status in ('aberto', 'fechado')),
  fechamento_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists frete_viagens_escala_uk on public.frete_viagens (pedido_id, caminhao_id, direcao) where not extra;
create index if not exists frete_viagens_emp_idx on public.frete_viagens (empresa_id, status, data);
create index if not exists frete_viagens_forn_idx on public.frete_viagens (fornecedor_id, status);

-- Fechamentos da logística (frete e uber): cada um vira uma conta a pagar.
create table if not exists public.logistica_fechamentos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  tipo text not null check (tipo in ('frete', 'uber')),
  numero int not null,
  fornecedor_id uuid references public.fornecedores(id) on delete set null,
  motorista_id uuid,
  beneficiario text not null,
  total numeric not null check (total > 0),
  vencimento date not null,
  pagar_id uuid references public.fin_pagar(id) on delete set null,
  obs text,
  status text not null default 'ativo' check (status in ('ativo', 'cancelado')),
  criado_por uuid default auth.uid(),
  criado_por_nome text,
  criado_em timestamptz not null default now(),
  unique (empresa_id, tipo, numero)
);
alter table public.frete_viagens drop constraint if exists frete_viagens_fechamento_fk;
alter table public.frete_viagens add constraint frete_viagens_fechamento_fk foreign key (fechamento_id) references public.logistica_fechamentos(id) on delete set null;

-- Um custo de Resultados por pedido apontando para a MESMA conta a pagar do fechamento.
alter table public.fin_custos_evento drop constraint if exists fin_custos_evento_pagar_id_key;
alter table public.fin_custos_evento add column if not exists fechamento_id uuid references public.logistica_fechamentos(id) on delete set null;
create unique index if not exists fin_custos_evento_pagar_manual_uk on public.fin_custos_evento (pagar_id) where pagar_id is not null and fechamento_id is null;
alter table public.fin_custos_evento drop constraint if exists fin_custos_evento_categoria_check;
alter table public.fin_custos_evento add constraint fin_custos_evento_categoria_check
  check (categoria in ('equipe', 'frete', 'uber', 'terceiros', 'personalizacao', 'reparo', 'impostos', 'outros'));

-- RLS: leitura pela equipe com permissão; escrita só pelas funções.
alter table public.frete_viagens enable row level security;
alter table public.logistica_fechamentos enable row level security;
drop policy if exists frete_viagens_ler on public.frete_viagens;
create policy frete_viagens_ler on public.frete_viagens for select to authenticated using (public.operacao_pode(empresa_id, 'logistica.planejamento.visualizar'));
drop policy if exists logistica_fechamentos_ler on public.logistica_fechamentos;
create policy logistica_fechamentos_ler on public.logistica_fechamentos for select to authenticated
  using (public.operacao_pode(empresa_id, 'logistica.planejamento.visualizar') or public.fin_pode(empresa_id, 'financeiro.fluxo.visualizar'));
do $$ declare t text; begin
  foreach t in array array['frete_viagens', 'logistica_fechamentos'] loop
    execute format('drop policy if exists seguranca_2fa on public.%I', t);
    execute format('create policy seguranca_2fa on public.%I as restrictive for all to authenticated using ((select public.seguranca_2fa_ok())) with check ((select public.seguranca_2fa_ok()))', t);
  end loop;
end $$;

-- ---------------------------------------------------------------- utilitários
create or replace function public.logistica_nome_usuario(p_empresa uuid) returns text language sql stable security definer set search_path = public as $$
  select coalesce((select nome from funcionarios_acesso where empresa_id = p_empresa and id = auth.uid() limit 1),
                  (select nome from usuarios where id = auth.uid()), (select email from auth.users where id = auth.uid()), 'Equipe')
$$;
revoke all on function public.logistica_nome_usuario(uuid) from public, anon;
grant execute on function public.logistica_nome_usuario(uuid) to authenticated;

-- direção da viagem pela etapa
create or replace function public.frete_direcao(p_tipo text) returns text language sql immutable as $$
  select case when p_tipo in ('carregamento', 'montagem') then 'entrega' when p_tipo in ('desmontagem', 'descarregamento') then 'coleta' end
$$;

-- Gera/atualiza as viagens a partir da escala (caminhões das etapas). Só viagens abertas mudam.
create or replace function public.frete_sincronizar(p_empresa uuid) returns void language plpgsql security definer set search_path = public as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('frete_sync:' || p_empresa::text, 0));
  create temp table if not exists _frete_escala (pedido_id uuid, caminhao_id uuid, direcao text, data date, km numeric, valor numeric,
    origem text, destino text, pedido_numero text, cliente_nome text, codigo text, categoria text, fornecedor_id uuid, fornecedor_nome text) on commit drop;
  truncate _frete_escala;
  insert into _frete_escala
  select x.pedido_id, x.caminhao_id, x.direcao, x.data, x.km,
         round(coalesce(cc.valor_km, 0) * x.km / 2, 2),
         case x.direcao when 'entrega' then 'Galpão' else coalesce(p.local_nome, 'Local do evento') end,
         case x.direcao when 'entrega' then coalesce(p.local_nome, 'Local do evento') else 'Galpão' end,
         p.numero_pedido, p.cliente_nome, c.codigo, cc.nome, c.fornecedor_id,
         coalesce(f.nome_fantasia, f.nome_razao_social)
    from (select e.pedido_id, ec.caminhao_id, frete_direcao(e.tipo) direcao, min(e.data) data,
                 max(coalesce(nullif(p0.observacoes->'logistica_snapshot'->>'km', '')::numeric, 0)) km
            from operacao_etapas e
            join operacao_etapa_caminhoes ec on ec.etapa_id = e.id
            join separacoes_pedidos p0 on p0.id = e.pedido_id
           where e.empresa_id = p_empresa and frete_direcao(e.tipo) is not null
             and coalesce(p0.status_comercial, '') <> 'cancelado'
           group by 1, 2, 3) x
    join separacoes_pedidos p on p.id = x.pedido_id
    join caminhoes c on c.id = x.caminhao_id
    left join fornecedores f on f.id = c.fornecedor_id
    -- categoria de frete do caminhão: pela capacidade (mesma régua de volume do pedido); sem capacidade, pelo nome
    left join lateral (select k.nome, k.valor_km from categorias_caminhao k where k.empresa_id = p_empresa and coalesce(k.ativo, true)
                        and ((coalesce(c.capacidade_m3, 0) > 0 and c.capacidade_m3 > coalesce(k.volume_minimo, 0) and c.capacidade_m3 <= coalesce(k.volume_maximo, 0))
                          or (coalesce(c.capacidade_m3, 0) = 0 and upper(btrim(k.nome)) in (upper(btrim(coalesce(c.categoria, ''))), upper(btrim(coalesce(c.codigo, ''))))))
                      order by k.ordem nulls last, k.volume_maximo limit 1) cc on true
   where c.fornecedor_id is not null;

  -- novas
  insert into frete_viagens (empresa_id, pedido_id, pedido_numero, cliente_nome, caminhao_id, caminhao_codigo, caminhao_categoria,
                             fornecedor_id, fornecedor_nome, direcao, data, origem, destino, km, valor_sistema)
  select p_empresa, s.pedido_id, s.pedido_numero, s.cliente_nome, s.caminhao_id, s.codigo, s.categoria, s.fornecedor_id, s.fornecedor_nome,
         s.direcao, s.data, s.origem, s.destino, s.km, s.valor
    from _frete_escala s
   where not exists (select 1 from frete_viagens v where v.pedido_id = s.pedido_id and v.caminhao_id = s.caminhao_id and v.direcao = s.direcao and not v.extra);

  -- abertas: atualizam com a escala
  update frete_viagens v set pedido_numero = s.pedido_numero, cliente_nome = s.cliente_nome, caminhao_codigo = s.codigo,
         caminhao_categoria = s.categoria, fornecedor_id = s.fornecedor_id, fornecedor_nome = s.fornecedor_nome, data = s.data,
         origem = s.origem, destino = s.destino, km = s.km, valor_sistema = s.valor, fora_escala = false, updated_at = now()
    from _frete_escala s
   where v.status = 'aberto' and not v.extra and v.pedido_id = s.pedido_id and v.caminhao_id = s.caminhao_id and v.direcao = s.direcao
     and (v.pedido_numero, v.cliente_nome, v.caminhao_codigo, v.caminhao_categoria, v.fornecedor_id, v.fornecedor_nome, v.data, v.origem, v.destino, v.km, v.valor_sistema, v.fora_escala)
         is distinct from (s.pedido_numero, s.cliente_nome, s.codigo, s.categoria, s.fornecedor_id, s.fornecedor_nome, s.data, s.origem, s.destino, s.km, s.valor, false);

  -- saíram da escala: some se a transportadora ainda não informou; senão fica marcada
  delete from frete_viagens v where v.empresa_id = p_empresa and v.status = 'aberto' and not v.extra and v.valor_transportadora is null
     and not exists (select 1 from _frete_escala s where s.pedido_id = v.pedido_id and s.caminhao_id = v.caminhao_id and s.direcao = v.direcao);
  update frete_viagens v set fora_escala = true, valor_sistema = 0, updated_at = now()
   where v.empresa_id = p_empresa and v.status = 'aberto' and not v.extra and not v.fora_escala
     and not exists (select 1 from _frete_escala s where s.pedido_id = v.pedido_id and s.caminhao_id = v.caminhao_id and s.direcao = v.direcao);
end $$;
revoke all on function public.frete_sincronizar(uuid) from public, anon, authenticated;

create or replace function public.frete_viagem_json(v frete_viagens, p_sistema boolean) returns jsonb language sql stable set search_path = public as $$
  select jsonb_build_object('id', v.id, 'pedido_id', v.pedido_id, 'pedido', v.pedido_numero, 'cliente', v.cliente_nome,
    'caminhao', v.caminhao_codigo, 'categoria', v.caminhao_categoria, 'fornecedor_id', v.fornecedor_id, 'fornecedor', v.fornecedor_nome,
    'direcao', v.direcao, 'data', v.data, 'origem', v.origem, 'destino', v.destino, 'km', v.km, 'extra', v.extra, 'fora_escala', v.fora_escala,
    'valor_transportadora', v.valor_transportadora, 'transp_obs', v.transp_obs, 'transp_enviado_em', v.transp_enviado_em,
    'status', v.status, 'fechamento_id', v.fechamento_id)
  || case when p_sistema then jsonb_build_object('valor_sistema', v.valor_sistema, 'valor_final', v.valor_final, 'obs', v.obs) else '{}'::jsonb end
$$;
revoke all on function public.frete_viagem_json(frete_viagens, boolean) from public, anon, authenticated;

-- ---------------------------------------------------------------- equipe: conciliação
create or replace function public.frete_conciliacao(p_empresa uuid, p_de date default null, p_ate date default null) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not operacao_pode(p_empresa, 'logistica.planejamento.visualizar') then raise exception 'Sem permissão para ver os fretes.'; end if;
  perform frete_sincronizar(p_empresa);
  return jsonb_build_object(
    'viagens', coalesce((select jsonb_agg(frete_viagem_json(v, true) order by v.data, v.pedido_numero, v.direcao, v.caminhao_codigo)
                  from frete_viagens v where v.empresa_id = p_empresa
                   and (v.status = 'aberto' or ((p_de is null or v.data >= p_de) and (p_ate is null or v.data <= p_ate)))), '[]'),
    'fechamentos', coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'numero', f.numero, 'beneficiario', f.beneficiario, 'total', f.total,
                     'vencimento', f.vencimento, 'status', f.status, 'criado_em', f.criado_em, 'criado_por', f.criado_por_nome,
                     'pagar_status', fp.status, 'pago', fp.pago) order by f.criado_em desc)
                  from logistica_fechamentos f left join fin_pagar fp on fp.id = f.pagar_id
                 where f.empresa_id = p_empresa and f.tipo = 'frete' and f.criado_em > now() - interval '180 days'), '[]'),
    'sem_fornecedor', (select count(distinct ec.caminhao_id) from operacao_etapa_caminhoes ec join operacao_etapas e on e.id = ec.etapa_id
                        join caminhoes c on c.id = ec.caminhao_id
                       where e.empresa_id = p_empresa and frete_direcao(e.tipo) is not null and c.fornecedor_id is null and e.data >= current_date - 60));
end $$;
grant execute on function public.frete_conciliacao(uuid, date, date) to authenticated;

create or replace function public.frete_definir_final(p_empresa uuid, p_viagem uuid, p_valor numeric, p_obs text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v frete_viagens;
begin
  if not operacao_pode(p_empresa, 'logistica.planejamento.editar') then raise exception 'Sem permissão para conciliar fretes.'; end if;
  select * into v from frete_viagens where id = p_viagem and empresa_id = p_empresa for update;
  if v.id is null then raise exception 'Viagem não encontrada.'; end if;
  if v.status <> 'aberto' then raise exception 'Esta viagem já foi fechada.'; end if;
  if p_valor is not null and (p_valor < 0 or p_valor::text in ('NaN', 'Infinity')) then raise exception 'Valor inválido.'; end if;
  update frete_viagens set valor_final = round(p_valor, 2), obs = nullif(btrim(coalesce(p_obs, '')), ''), updated_at = now() where id = v.id returning * into v;
  return frete_viagem_json(v, true);
end $$;
grant execute on function public.frete_definir_final(uuid, uuid, numeric, text) to authenticated;

-- fecha: várias viagens abertas da mesma transportadora → uma conta a pagar + um custo por pedido
create or replace function public.frete_fechar(p_empresa uuid, p_viagens uuid[], p_vencimento date, p_obs text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare n int; nforn int; forn uuid; fnome text; total numeric; fech logistica_fechamentos; pg uuid; num int; r record; doc text;
begin
  if not operacao_pode(p_empresa, 'logistica.planejamento.editar') then raise exception 'Sem permissão para fechar fretes.'; end if;
  if p_vencimento is null then raise exception 'Informe o vencimento do pagamento.'; end if;
  if coalesce(array_length(p_viagens, 1), 0) = 0 then raise exception 'Selecione as viagens para fechar.'; end if;
  perform 1 from frete_viagens where id = any(p_viagens) and empresa_id = p_empresa for update;
  select count(*), count(distinct fornecedor_id), min(fornecedor_id::text)::uuid, coalesce(sum(valor_final), 0)
    into n, nforn, forn, total from frete_viagens where id = any(p_viagens) and empresa_id = p_empresa;
  if n <> array_length(p_viagens, 1) then raise exception 'Alguma viagem não foi encontrada.'; end if;
  if exists (select 1 from frete_viagens where id = any(p_viagens) and status <> 'aberto') then raise exception 'Alguma viagem já foi fechada. Atualize a tela.'; end if;
  if nforn <> 1 or forn is null then raise exception 'Feche uma transportadora por vez.'; end if;
  if exists (select 1 from frete_viagens where id = any(p_viagens) and valor_final is null) then raise exception 'Defina o valor final de todas as viagens selecionadas.'; end if;
  if total <= 0 then raise exception 'O total do fechamento precisa ser maior que zero.'; end if;
  select coalesce(nome_fantasia, nome_razao_social) into fnome from fornecedores where id = forn;
  perform pg_advisory_xact_lock(hashtextextended('logistica_fech:' || p_empresa::text, 0));
  select coalesce(max(numero), 0) + 1 into num from logistica_fechamentos where empresa_id = p_empresa and tipo = 'frete';
  doc := 'FR-' || lpad(num::text, 4, '0');
  insert into logistica_fechamentos (empresa_id, tipo, numero, fornecedor_id, beneficiario, total, vencimento, obs, criado_por_nome)
  values (p_empresa, 'frete', num, forn, coalesce(fnome, 'Transportadora'), round(total, 2), p_vencimento, nullif(btrim(coalesce(p_obs, '')), ''), logistica_nome_usuario(p_empresa))
  returning * into fech;
  perform fin_semear(p_empresa);
  insert into fin_pagar (empresa_id, origem, origem_id, fornecedor_id, fornecedor_nome, documento, descricao, emissao, competencia, vencimento,
                         valor, parcela, parcelas, categoria_id, observacoes, criado_por)
  values (p_empresa, 'frete', fech.id, forn, fnome, doc, 'Fretes ' || doc || ' · ' || coalesce(fnome, 'Transportadora') || ' · ' || n || ' viagem(ns)',
          current_date, current_date, p_vencimento, round(total, 2), 1, 1, fin_categoria(p_empresa, 'fretes'),
          concat_ws(E'\n', 'Fechamento da Conciliação de Fretes (' || doc || ').', nullif(btrim(coalesce(p_obs, '')), '')), auth.uid())
  returning id into pg;
  update logistica_fechamentos set pagar_id = pg where id = fech.id;
  for r in select pedido_id, max(pedido_numero) numero, sum(valor_final) valor,
                  string_agg(distinct direcao || ' ' || coalesce(caminhao_codigo, ''), ', ') detalhe
             from frete_viagens where id = any(p_viagens) and pedido_id is not null group by pedido_id loop
    if r.valor > 0 then
      insert into fin_custos_evento (empresa_id, pedido_id, categoria, descricao, valor, pagar_id, fechamento_id, criado_por)
      values (p_empresa, r.pedido_id, 'frete', 'Frete ' || doc || ' · ' || coalesce(fnome, 'Transportadora') || ' · ' || r.detalhe, round(r.valor, 2), pg, fech.id, auth.uid());
      delete from fin_resultados_revisados where pedido_id = r.pedido_id;
    end if;
  end loop;
  update frete_viagens set status = 'fechado', fechamento_id = fech.id, updated_at = now() where id = any(p_viagens);
  return jsonb_build_object('ok', true, 'id', fech.id, 'documento', doc, 'total', round(total, 2), 'pagar_id', pg);
end $$;
grant execute on function public.frete_fechar(uuid, uuid[], date, text) to authenticated;

-- desfaz o fechamento (só sem pagamento): cancela a conta a pagar; o gatilho abaixo reabre as viagens
create or replace function public.logistica_fechamento_desfazer(p_empresa uuid, p_fechamento uuid) returns void
language plpgsql security definer set search_path = public as $$
declare f logistica_fechamentos; p fin_pagar;
begin
  if not operacao_pode(p_empresa, 'logistica.planejamento.editar') then raise exception 'Sem permissão.'; end if;
  select * into f from logistica_fechamentos where id = p_fechamento and empresa_id = p_empresa for update;
  if f.id is null or f.status <> 'ativo' then raise exception 'Fechamento não encontrado.'; end if;
  select * into p from fin_pagar where id = f.pagar_id;
  if coalesce(p.pago, 0) > 0 then raise exception 'Este fechamento já tem pagamento no Financeiro. Estorne por lá primeiro.'; end if;
  if p.id is not null and p.status <> 'cancelado' then
    update fin_pagar set status = 'cancelado', cancelado_em = now(), cancelado_por = auth.uid(), cancelamento_motivo = 'Fechamento desfeito pela logística' where id = p.id;
  else
    perform logistica_fechamento_reabrir(f.id);
  end if;
end $$;
grant execute on function public.logistica_fechamento_desfazer(uuid, uuid) to authenticated;

create or replace function public.logistica_fechamento_reabrir(p_fechamento uuid) returns void language plpgsql security definer set search_path = public as $$
begin
  update logistica_fechamentos set status = 'cancelado' where id = p_fechamento;
  update fin_custos_evento set cancelado_em = now(), cancelamento_motivo = 'Fechamento da logística cancelado' where fechamento_id = p_fechamento and cancelado_em is null;
  update frete_viagens set status = 'aberto', fechamento_id = null, updated_at = now() where fechamento_id = p_fechamento;
  if to_regclass('public.uber_corridas') is not null then
    execute 'update uber_corridas set fechamento_id = null where fechamento_id = $1' using p_fechamento;
  end if;
end $$;
revoke all on function public.logistica_fechamento_reabrir(uuid) from public, anon, authenticated;

create or replace function public.logistica_fechamento_pagar_cancelado() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'cancelado' and old.status <> 'cancelado' and new.origem in ('frete', 'uber') and new.origem_id is not null then
    perform logistica_fechamento_reabrir(new.origem_id);
  end if;
  return new;
end $$;
drop trigger if exists logistica_fechamento_pagar_cancelado on public.fin_pagar;
create trigger logistica_fechamento_pagar_cancelado after update of status on public.fin_pagar for each row execute function public.logistica_fechamento_pagar_cancelado();

-- ---------------------------------------------------------------- equipe: login da transportadora
create or replace function public.fornecedor_portal_salvar(p_empresa uuid, p_fornecedor uuid, p_login text, p_senha text, p_ativo boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare f fornecedores; l text := lower(btrim(coalesce(p_login, '')));
begin
  if not operacao_pode(p_empresa, 'estoque.fornecedores.editar') then raise exception 'Sem permissão para editar fornecedores.'; end if;
  select * into f from fornecedores where id = p_fornecedor and empresa_id = p_empresa for update;
  if f.id is null then raise exception 'Fornecedor não encontrado.'; end if;
  if l = '' then
    update fornecedores set portal_login = null, portal_ativo = false where id = f.id;
    delete from fornecedores_portal_senha where fornecedor_id = f.id;
    delete from app_sessoes where fornecedor_id = f.id;
    return jsonb_build_object('login', null, 'ativo', false);
  end if;
  if l !~ '^[a-z0-9._@-]{3,60}$' then raise exception 'Login: 3 a 60 letras, números, ponto, hífen ou @, sem espaço.'; end if;
  if exists (select 1 from fornecedores where lower(portal_login) = l and id <> f.id) then raise exception 'Este login já está em uso.'; end if;
  if not exists (select 1 from fornecedores_portal_senha where fornecedor_id = f.id) and coalesce(p_senha, '') = '' then raise exception 'Defina uma senha.'; end if;
  if coalesce(p_senha, '') <> '' and length(p_senha) < 6 then raise exception 'A senha precisa ter pelo menos 6 caracteres.'; end if;
  if coalesce(p_senha, '') <> '' then
    insert into fornecedores_portal_senha (fornecedor_id, senha_hash) values (f.id, extensions.crypt(p_senha, extensions.gen_salt('bf')))
    on conflict (fornecedor_id) do update set senha_hash = excluded.senha_hash;
  end if;
  update fornecedores set portal_login = l,
         portal_ativo = coalesce(p_ativo, true), portal_tentativas = 0, portal_bloqueado_ate = null
   where id = f.id;
  if coalesce(p_senha, '') <> '' or not coalesce(p_ativo, true) then delete from app_sessoes where fornecedor_id = f.id; end if;
  return jsonb_build_object('login', l, 'ativo', coalesce(p_ativo, true));
end $$;
grant execute on function public.fornecedor_portal_salvar(uuid, uuid, text, text, boolean) to authenticated;

-- ---------------------------------------------------------------- portal da transportadora (sem login do Acervo)
create or replace function public.transp_login(p_login text, p_senha text) returns jsonb language plpgsql security definer set search_path = public as $$
declare f fornecedores; t text; h text;
begin
  select * into f from fornecedores where lower(portal_login) = lower(btrim(coalesce(p_login, ''))) for update;
  if f.id is null then perform pg_sleep(0.4); raise exception 'Login ou senha incorretos.'; end if;
  select senha_hash into h from fornecedores_portal_senha where fornecedor_id = f.id;
  if f.portal_bloqueado_ate > now() then raise exception 'Muitas tentativas. Tente de novo em alguns minutos.'; end if;
  if not f.portal_ativo or h is null or h <> extensions.crypt(coalesce(p_senha, ''), h) then
    update fornecedores set portal_tentativas = case when portal_tentativas + 1 >= 5 then 0 else portal_tentativas + 1 end,
           portal_bloqueado_ate = case when portal_tentativas + 1 >= 5 then now() + interval '15 minutes' else portal_bloqueado_ate end
     where id = f.id;
    return jsonb_build_object('erro', 'Login ou senha incorretos.'); -- sem exceção: a contagem de tentativas precisa ficar gravada
  end if;
  t := app_novo_token();
  insert into app_sessoes (token_hash, tipo, empresa_id, fornecedor_id, nome, perfil, expira_em)
  values (app_hash(t), 'transportadora', f.empresa_id, f.id, coalesce(f.nome_fantasia, f.nome_razao_social), 'TRANSPORTADORA', now() + interval '30 days');
  update fornecedores set portal_tentativas = 0, portal_bloqueado_ate = null, portal_ultimo_acesso = now() where id = f.id;
  return jsonb_build_object('token', t, 'nome', coalesce(f.nome_fantasia, f.nome_razao_social));
end $$;
grant execute on function public.transp_login(text, text) to anon, authenticated;

create or replace function public.transp_sair(p_token text) returns void language sql security definer set search_path = public as $$
  delete from app_sessoes where token_hash = app_hash(p_token) and tipo = 'transportadora'
$$;
grant execute on function public.transp_sair(text) to anon, authenticated;

create or replace function public.transp_viagens(p_token text) returns jsonb language plpgsql security definer set search_path = public as $$
declare s app_sessoes := app_sessao(p_token, 'transportadora');
begin
  if not exists (select 1 from fornecedores where id = s.fornecedor_id and portal_ativo) then raise exception 'SESSAO_EXPIRADA: Acesso desativado.'; end if;
  perform frete_sincronizar(s.empresa_id);
  return jsonb_build_object('nome', s.nome,
    'viagens', coalesce((select jsonb_agg(frete_viagem_json(v, false) order by v.data desc, v.pedido_numero, v.direcao)
                from frete_viagens v where v.fornecedor_id = s.fornecedor_id and v.empresa_id = s.empresa_id
                 and (v.status = 'aberto' or v.data >= current_date - 120)), '[]'),
    'caminhoes', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'codigo', c.codigo, 'placa', c.placa) order by c.codigo)
                from caminhoes c where c.fornecedor_id = s.fornecedor_id), '[]'));
end $$;
grant execute on function public.transp_viagens(text) to anon, authenticated;

create or replace function public.transp_informar(p_token text, p_viagem uuid, p_valor numeric, p_obs text) returns jsonb language plpgsql security definer set search_path = public as $$
declare s app_sessoes := app_sessao(p_token, 'transportadora'); v frete_viagens;
begin
  select * into v from frete_viagens where id = p_viagem and fornecedor_id = s.fornecedor_id for update;
  if v.id is null then raise exception 'Viagem não encontrada.'; end if;
  if v.status <> 'aberto' then raise exception 'Esta viagem já foi fechada pela logística.'; end if;
  if p_valor is null or p_valor < 0 or p_valor > 1000000 then raise exception 'Informe um valor válido.'; end if;
  update frete_viagens set valor_transportadora = round(p_valor, 2), transp_obs = nullif(btrim(coalesce(p_obs, '')), ''),
         transp_enviado_em = now(), updated_at = now() where id = v.id returning * into v;
  return frete_viagem_json(v, false);
end $$;
grant execute on function public.transp_informar(text, uuid, numeric, text) to anon, authenticated;

-- viagem que não está na lista (a transportadora lança)
create or replace function public.transp_extra(p_token text, p_dados jsonb) returns jsonb language plpgsql security definer set search_path = public as $$
declare s app_sessoes := app_sessao(p_token, 'transportadora'); p separacoes_pedidos; c caminhoes; v frete_viagens; dir text := p_dados->>'direcao';
  val numeric := nullif(p_dados->>'valor', '')::numeric; dt date := nullif(p_dados->>'data', '')::date;
begin
  if dir not in ('entrega', 'coleta') then raise exception 'Escolha entrega ou coleta.'; end if;
  if dt is null then raise exception 'Informe a data.'; end if;
  if val is null or val <= 0 or val > 1000000 then raise exception 'Informe o valor.'; end if;
  if nullif(btrim(coalesce(p_dados->>'pedido', '')), '') is not null then
    select * into p from separacoes_pedidos where empresa_id = s.empresa_id and btrim(numero_pedido) = btrim(p_dados->>'pedido') limit 1;
    if p.id is null then raise exception 'Pedido % não encontrado.', p_dados->>'pedido'; end if;
  end if;
  if nullif(p_dados->>'caminhao_id', '') is not null then
    select * into c from caminhoes where id = (p_dados->>'caminhao_id')::uuid and fornecedor_id = s.fornecedor_id;
  end if;
  insert into frete_viagens (empresa_id, pedido_id, pedido_numero, cliente_nome, caminhao_id, caminhao_codigo, caminhao_categoria, fornecedor_id, fornecedor_nome,
                             direcao, data, origem, destino, km, extra, valor_transportadora, transp_obs, transp_enviado_em)
  values (s.empresa_id, p.id, coalesce(p.numero_pedido, nullif(btrim(p_dados->>'pedido'), '')), p.cliente_nome, c.id,
          coalesce(c.codigo, nullif(btrim(p_dados->>'caminhao'), '')), c.categoria, s.fornecedor_id, s.nome,
          dir, dt, nullif(btrim(coalesce(p_dados->>'origem', '')), ''), nullif(btrim(coalesce(p_dados->>'destino', '')), ''),
          greatest(coalesce(nullif(p_dados->>'km', '')::numeric, 0), 0), true, round(val, 2), nullif(btrim(coalesce(p_dados->>'obs', '')), ''), now())
  returning * into v;
  return frete_viagem_json(v, false);
end $$;
grant execute on function public.transp_extra(text, jsonb) to anon, authenticated;

create or replace function public.transp_extra_excluir(p_token text, p_viagem uuid) returns void language plpgsql security definer set search_path = public as $$
declare s app_sessoes := app_sessao(p_token, 'transportadora');
begin
  delete from frete_viagens where id = p_viagem and fornecedor_id = s.fornecedor_id and extra and status = 'aberto';
  if not found then raise exception 'Só dá para apagar viagem extra ainda não fechada.'; end if;
end $$;
grant execute on function public.transp_extra_excluir(text, uuid) to anon, authenticated;
