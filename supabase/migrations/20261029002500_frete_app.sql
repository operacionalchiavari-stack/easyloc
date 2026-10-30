-- App do Freteiro (out/2026): o frete com o mesmo mecanismo do Uber.
-- Pedido do usuário: "quero que o frete tenha o mesmo mecanismo do uber... app, mapa, ponto de encontro, cadastro,
-- quando tiver frete anunciam ali, a pessoa marca que pode fazer e ela pega o frete".
-- Decisões dele: freteiros autônomos se cadastram no app e só veem os fretes depois de a logística aprovar;
-- o valor é o calculado pelo sistema (valor/km da categoria de caminhão × km do pedido, o mesmo da viagem de frete);
-- o anúncio é automático: entrega (carregamento + montagem) ou coleta (desmontagem + descarregamento) sem caminhão
-- próprio livre na escala vira frete no app, e quem aceita vira o caminhão programado das etapas.
-- Aprovar o freteiro cria um fornecedor (serviços) e o caminhão dele (tipo terceirizado, freteiro_id): assim a viagem
-- aparece sozinha na Conciliação de Fretes (frete_sincronizar) e o fechamento vai para o Contas a Pagar como hoje.

-- ---------------------------------------------------------------- tabelas
create table if not exists public.frete_freteiros (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  nome text not null,
  telefone text not null,
  senha_hash text not null,
  chave_pix text,
  veiculo_modelo text,
  veiculo_placa text,
  veiculo_tipo text,
  capacidade_m3 numeric not null default 0 check (capacidade_m3 >= 0),
  status text not null default 'pendente' check (status in ('pendente', 'aprovado', 'recusado', 'bloqueado')),
  motivo text,
  avaliado_em timestamptz,
  avaliado_por text,
  fornecedor_id uuid references public.fornecedores(id) on delete set null,
  caminhao_id uuid references public.caminhoes(id) on delete set null,
  tentativas int not null default 0,
  bloqueado_ate timestamptz,
  ultimo_acesso timestamptz,
  created_at timestamptz not null default now(),
  unique (empresa_id, telefone)
);
alter table public.frete_freteiros enable row level security;   -- só pelas funções (a senha está na linha)

alter table public.caminhoes add column if not exists freteiro_id uuid references public.frete_freteiros(id) on delete set null;

alter table public.app_sessoes add column if not exists freteiro_id uuid references public.frete_freteiros(id) on delete cascade;
alter table public.app_sessoes drop constraint if exists app_sessoes_tipo_check;
alter table public.app_sessoes add constraint app_sessoes_tipo_check check (tipo in ('montador', 'free', 'transportadora', 'motorista', 'freteiro'));

create table if not exists public.frete_anuncios (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  pedido_id uuid not null references public.separacoes_pedidos(id) on delete cascade,
  direcao text not null check (direcao in ('entrega', 'coleta')),
  etapas uuid[] not null default '{}',
  data date not null,
  hora time,
  ponto_encontro text not null,
  destino text not null,
  destino_lat numeric,
  destino_lng numeric,
  km numeric not null default 0,           -- distância do galpão ao evento (um trecho); o frete é ida e volta
  m3 numeric not null default 0,
  valor numeric not null default 0,        -- total do frete (o que o freteiro recebe)
  status text not null default 'aberto' check (status in ('aberto', 'aceito', 'cancelado')),
  freteiro_id uuid references public.frete_freteiros(id) on delete set null,
  aceito_em timestamptz,
  checkin_em timestamptz,
  checkin_lat numeric,
  checkin_lng numeric,
  checkout_em timestamptz,
  checkout_lat numeric,
  checkout_lng numeric,
  cancelado_em timestamptz,
  segredo_qr text not null default encode(extensions.gen_random_bytes(16), 'hex'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists frete_anuncios_ativo_uk on public.frete_anuncios (pedido_id, direcao) where status <> 'cancelado';
create index if not exists frete_anuncios_emp_idx on public.frete_anuncios (empresa_id, status, data);
alter table public.frete_anuncios enable row level security;
drop policy if exists frete_anuncios_ler on public.frete_anuncios;
create policy frete_anuncios_ler on public.frete_anuncios for select to authenticated using (operacao_pode(empresa_id, 'logistica.planejamento.visualizar'));

-- ---------------------------------------------------------------- escala: caminhão de freteiro não entra sozinho
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
           and k.freteiro_id is null   -- caminhão de freteiro autônomo só entra quando ele aceita o frete no app
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

-- ---------------------------------------------------------------- auxiliares
create or replace function public.frete_galpao(p_empresa uuid) returns text language sql stable security definer set search_path = public as $$
  select coalesce(nullif(btrim((select endereco_google from empresas where id = p_empresa)), ''),
                  'Chiavari Eventos, Estrada Uniao e Industria, Itaipava, Petropolis - RJ, Brasil')
$$;
revoke all on function public.frete_galpao(uuid) from public, anon, authenticated;

create or replace function public.frete_codigo_qr(p_anuncio uuid, p_janela bigint) returns text language sql stable security definer set search_path = public as $$
  select lpad((((get_byte(h, 0)::bigint << 24) + (get_byte(h, 1) << 16) + (get_byte(h, 2) << 8) + get_byte(h, 3)) % 1000000)::text, 6, '0')
    from (select extensions.hmac(p_anuncio::text || ':frete:' || p_janela, segredo_qr, 'sha256') h from frete_anuncios where id = p_anuncio) x
$$;
revoke all on function public.frete_codigo_qr(uuid, bigint) from public, anon, authenticated;

-- Valor do frete anunciado: mesma conta da viagem de frete (valor/km da categoria × km ÷ 2), com a categoria
-- escolhida pelo volume do pedido (menor categoria que comporta; senão a maior).
create or replace function public.frete_anuncio_calculo(p_empresa uuid, p_pedido uuid, p_direcao text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare vm3 numeric; vkm numeric; vk numeric;
begin
  vm3 := coalesce(nullif((operacao_volume_pedido(p_pedido, p_direcao = 'coleta')->>'m3')::numeric, 0), 0);
  select coalesce(nullif(observacoes->'logistica_snapshot'->>'km', '')::numeric, 0) into vkm from separacoes_pedidos where id = p_pedido;
  select k.valor_km into vk from categorias_caminhao k
   where k.empresa_id = p_empresa and coalesce(k.ativo, true) and coalesce(k.valor_km, 0) > 0
   order by (vm3 <= coalesce(k.volume_maximo, 0)) desc,
            case when vm3 <= coalesce(k.volume_maximo, 0) then k.volume_maximo else -k.volume_maximo end
   limit 1;
  return jsonb_build_object('m3', round(vm3, 2), 'km', round(coalesce(vkm, 0), 1), 'valor', round(coalesce(vk, 0) * coalesce(vkm, 0) / 2, 2));
end $$;
revoke all on function public.frete_anuncio_calculo(uuid, uuid, text) from public, anon, authenticated;

-- ---------------------------------------------------------------- anúncio automático
create or replace function public.frete_anuncios_sincronizar(p_empresa uuid) returns int
language plpgsql security definer set search_path = public as $$
declare g record; a frete_anuncios; calc jsonb; hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  auto boolean := coalesce((select automatica from empresa_escala_controle where empresa_id = p_empresa), true);
  cam uuid; n int := 0; vdest text; vend text; vlat numeric; vlng numeric;
begin
  perform pg_advisory_xact_lock(hashtextextended('frete_anuncios:' || p_empresa::text, 0));
  for g in
    select e.pedido_id, frete_direcao(e.tipo) dir,
           array_agg(e.id order by e.data, e.hora nulls first) etapas,
           (array_agg(e.data order by e.data, e.hora nulls first))[1] data,
           (array_agg(e.hora order by e.data, e.hora nulls first))[1] hora
      from operacao_etapas e join separacoes_pedidos p on p.id = e.pedido_id
     where e.empresa_id = p_empresa and e.servico_ref is null and frete_direcao(e.tipo) is not null and e.data >= hoje
       and p.status_comercial in ('aprovado', 'enviado', 'finalizado')
       and coalesce(p.status, '') <> 'cancelado' and p.encerrado_operacional_em is null
     group by 1, 2
  loop
    select * into a from frete_anuncios where pedido_id = g.pedido_id and direcao = g.dir and status <> 'cancelado' for update;
    select p.local_nome, l.endereco, l.latitude, l.longitude into vdest, vend, vlat, vlng
      from separacoes_pedidos p left join locais_empresas l on l.id = p.local_id where p.id = g.pedido_id;
    vdest := concat_ws(' · ', nullif(btrim(coalesce(vdest, '')), ''), nullif(btrim(coalesce(vend, '')), ''));
    if coalesce(vdest, '') = '' then vdest := 'Local do evento'; end if;

    -- caminhão próprio (ou de transportadora) já escalado: não precisa de freteiro
    if exists (select 1 from operacao_etapa_caminhoes ec join caminhoes k on k.id = ec.caminhao_id
                where ec.etapa_id = any(g.etapas) and k.freteiro_id is null) then
      if a.id is not null and a.status = 'aberto' then
        update frete_anuncios set status = 'cancelado', cancelado_em = now(), updated_at = now() where id = a.id;
      end if;
      continue;
    end if;

    if a.id is null then
      if not auto then continue; end if;
      perform operacao_escala_preencher_sem_fluxo(p_empresa, g.etapas);   -- tenta um caminhão próprio antes de anunciar
      if exists (select 1 from operacao_etapa_caminhoes ec join caminhoes k on k.id = ec.caminhao_id
                  where ec.etapa_id = any(g.etapas) and k.freteiro_id is null) then continue; end if;
      calc := frete_anuncio_calculo(p_empresa, g.pedido_id, g.dir);
      if (calc->>'valor')::numeric <= 0 then continue; end if;          -- sem km ou sem categoria de frete: não anuncia
      insert into frete_anuncios (empresa_id, pedido_id, direcao, etapas, data, hora, ponto_encontro, destino, destino_lat, destino_lng, km, m3, valor)
      values (p_empresa, g.pedido_id, g.dir, g.etapas, g.data, g.hora, frete_galpao(p_empresa), vdest, vlat, vlng,
              (calc->>'km')::numeric, (calc->>'m3')::numeric, (calc->>'valor')::numeric);
      n := n + 1;
    elsif a.status = 'aberto' then
      calc := frete_anuncio_calculo(p_empresa, g.pedido_id, g.dir);
      update frete_anuncios set etapas = g.etapas, data = g.data, hora = g.hora, destino = vdest, destino_lat = vlat, destino_lng = vlng,
             ponto_encontro = frete_galpao(p_empresa), km = (calc->>'km')::numeric, m3 = (calc->>'m3')::numeric,
             valor = case when (calc->>'valor')::numeric > 0 then (calc->>'valor')::numeric else valor end, updated_at = now()
       where id = a.id
         and (etapas, data, hora, destino, km, m3) is distinct from (g.etapas, g.data, g.hora, vdest, (calc->>'km')::numeric, (calc->>'m3')::numeric);
    else
      -- aceito: o caminhão do freteiro tem que estar em todas as etapas; se a logística tirou, o frete volta para o app
      select caminhao_id into cam from frete_freteiros where id = a.freteiro_id;
      if a.checkin_em is null and (cam is null or not exists (select 1 from operacao_etapa_caminhoes where caminhao_id = cam and etapa_id = any(a.etapas))) then
        update frete_anuncios set status = 'aberto', freteiro_id = null, aceito_em = null, etapas = g.etapas, data = g.data, hora = g.hora, updated_at = now() where id = a.id;
      else
        if cam is not null then
          insert into operacao_etapa_caminhoes (etapa_id, caminhao_id, empresa_id)
            select x, cam, p_empresa from unnest(g.etapas) x on conflict do nothing;
        end if;
        update frete_anuncios set etapas = g.etapas, data = g.data, hora = g.hora, destino = vdest, destino_lat = vlat, destino_lng = vlng, updated_at = now()
         where id = a.id and (etapas, data, hora, destino) is distinct from (g.etapas, g.data, g.hora, vdest);
      end if;
    end if;
  end loop;

  -- pedido cancelado/encerrado ou etapas que sumiram: o anúncio aberto sai do app
  update frete_anuncios fa set status = 'cancelado', cancelado_em = now(), updated_at = now()
   where fa.empresa_id = p_empresa and fa.status = 'aberto'
     and not exists (select 1 from operacao_etapas e join separacoes_pedidos p on p.id = e.pedido_id
                      where e.pedido_id = fa.pedido_id and frete_direcao(e.tipo) = fa.direcao and e.servico_ref is null
                        and p.status_comercial in ('aprovado', 'enviado', 'finalizado') and coalesce(p.status, '') <> 'cancelado');
  update frete_anuncios fa set status = 'cancelado', cancelado_em = now(), updated_at = now()
   where fa.empresa_id = p_empresa and fa.status = 'aceito' and fa.checkin_em is null
     and exists (select 1 from separacoes_pedidos p where p.id = fa.pedido_id and (p.status_comercial = 'cancelado' or p.status = 'cancelado'));
  return n;
end $$;
revoke all on function public.frete_anuncios_sincronizar(uuid) from public, anon, authenticated;

-- a cada 10 minutos, para o frete aparecer no app mesmo sem ninguém abrir as telas
do $$ begin
  perform cron.unschedule('frete-anuncios') where exists (select 1 from cron.job where jobname = 'frete-anuncios');
  perform cron.schedule('frete-anuncios', '*/10 * * * *',
    $c$select public.frete_anuncios_sincronizar(id) from public.empresas where id in (select distinct empresa_id from public.operacao_etapas)$c$);
end $$;

-- ---------------------------------------------------------------- JSON (mesmo formato do Uber, para o app)
create or replace function public.frete_anuncio_json(a frete_anuncios, p_equipe boolean) returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', a.id, 'pedido_id', a.pedido_id, 'direcao', a.direcao, 'quantidade', 1, 'ida_volta', true,
    'ponto_encontro', a.ponto_encontro, 'destino', a.destino, 'destino_lat', a.destino_lat, 'destino_lng', a.destino_lng,
    'km', a.km, 'm3', a.m3, 'valor', a.valor, 'data', a.data, 'hora', to_char(a.hora, 'HH24:MI'), 'status', case when a.status = 'cancelado' then 'cancelada' else 'aberta' end,
    'obs', case a.direcao when 'entrega' then 'Entrega: carregar no galpão e levar ao evento' else 'Coleta: buscar no evento e trazer ao galpão' end
            || ' · ' || trim(to_char(a.m3, 'FM999990.0')) || ' m³')
  || case when p_equipe then jsonb_build_object('status_anuncio', a.status,
       'pedido', (select numero_pedido from separacoes_pedidos where id = a.pedido_id),
       'cliente', (select cliente_nome from separacoes_pedidos where id = a.pedido_id),
       'freteiro', (select jsonb_build_object('id', f.id, 'nome', f.nome, 'telefone', f.telefone,
                     'veiculo', concat_ws(' · ', f.veiculo_modelo, f.veiculo_tipo, f.veiculo_placa), 'capacidade_m3', f.capacidade_m3)
                     from frete_freteiros f where f.id = a.freteiro_id),
       'aceito_em', a.aceito_em, 'checkin_em', a.checkin_em, 'checkout_em', a.checkout_em)
     else '{}'::jsonb end
$$;
revoke all on function public.frete_anuncio_json(frete_anuncios, boolean) from public, anon, authenticated;

create or replace function public.frete_corrida_json(a frete_anuncios) returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', a.id, 'vaga_id', a.id,
    'status', case when a.status = 'cancelado' then 'cancelada' when a.checkout_em is not null then 'concluida' when a.checkin_em is not null then 'em_andamento' else 'confirmada' end,
    'valor', a.valor, 'confirmado_em', a.aceito_em, 'checkin_em', a.checkin_em, 'checkout_em', a.checkout_em, 'cancelado_em', a.cancelado_em,
    'pago', exists (select 1 from frete_viagens v join frete_freteiros f on f.caminhao_id = v.caminhao_id
                     join logistica_fechamentos fe on fe.id = v.fechamento_id join fin_pagar fp on fp.id = fe.pagar_id
                    where f.id = a.freteiro_id and v.pedido_id = a.pedido_id and v.direcao = a.direcao and fp.status = 'pago'),
    'vaga', frete_anuncio_json(a, false))
$$;
revoke all on function public.frete_corrida_json(frete_anuncios) from public, anon, authenticated;

-- ---------------------------------------------------------------- App do Freteiro: sessão e cadastro
create or replace function public.frete_nova_sessao(f frete_freteiros) returns jsonb language plpgsql security definer set search_path = public as $$
declare t text := app_novo_token();
begin
  insert into app_sessoes (token_hash, tipo, empresa_id, freteiro_id, nome, perfil, expira_em)
  values (app_hash(t), 'freteiro', f.empresa_id, f.id, f.nome, 'FRETEIRO', now() + interval '90 days');
  update frete_freteiros set ultimo_acesso = now() where id = f.id;
  return jsonb_build_object('token', t, 'nome', f.nome);
end $$;
revoke all on function public.frete_nova_sessao(frete_freteiros) from public, anon, authenticated;

create or replace function public.frete_validar_veiculo(p_dados jsonb) returns void language plpgsql immutable as $$
begin
  if length(btrim(coalesce(p_dados->>'pix', ''))) < 3 then raise exception 'Informe a chave PIX para receber.'; end if;
  if length(btrim(coalesce(p_dados->>'carro_modelo', ''))) < 2 or length(regexp_replace(coalesce(p_dados->>'carro_placa', ''), '[^A-Za-z0-9]', '', 'g')) <> 7 then
    raise exception 'Informe o modelo e a placa do veículo.';
  end if;
  if coalesce(nullif(replace(p_dados->>'capacidade_m3', ',', '.'), '')::numeric, 0) <= 0 then raise exception 'Informe quantos m³ cabem no baú do veículo.'; end if;
end $$;

create or replace function public.frete_cadastrar(p_dados jsonb) returns jsonb language plpgsql security definer set search_path = public as $$
declare f frete_freteiros; fone text := regexp_replace(coalesce(p_dados->>'telefone', ''), '\D', '', 'g'); emp uuid := gs_empresa_dona();
begin
  if length(btrim(coalesce(p_dados->>'nome', ''))) < 5 or position(' ' in btrim(p_dados->>'nome')) = 0 then raise exception 'Informe o nome completo.'; end if;
  if length(fone) not between 10 and 11 then raise exception 'Informe o celular com DDD.'; end if;
  if length(coalesce(p_dados->>'senha', '')) < 6 then raise exception 'A senha precisa ter pelo menos 6 caracteres.'; end if;
  perform frete_validar_veiculo(p_dados);
  if exists (select 1 from frete_freteiros where empresa_id = emp and telefone = fone) then raise exception 'Este celular já tem cadastro. Entre com a sua senha.'; end if;
  insert into frete_freteiros (empresa_id, nome, telefone, senha_hash, chave_pix, veiculo_modelo, veiculo_placa, veiculo_tipo, capacidade_m3)
  values (emp, initcap(lower(btrim(p_dados->>'nome'))), fone, extensions.crypt(p_dados->>'senha', extensions.gen_salt('bf')), btrim(p_dados->>'pix'),
          btrim(p_dados->>'carro_modelo'), upper(regexp_replace(p_dados->>'carro_placa', '[^A-Za-z0-9]', '', 'g')), nullif(btrim(coalesce(p_dados->>'carro_cor', '')), ''),
          round(replace(p_dados->>'capacidade_m3', ',', '.')::numeric, 1))
  returning * into f;
  return frete_nova_sessao(f);
end $$;
grant execute on function public.frete_cadastrar(jsonb) to anon, authenticated;

create or replace function public.frete_login(p_telefone text, p_senha text) returns jsonb language plpgsql security definer set search_path = public as $$
declare f frete_freteiros; fone text := regexp_replace(coalesce(p_telefone, ''), '\D', '', 'g');
begin
  select * into f from frete_freteiros where empresa_id = gs_empresa_dona() and telefone = fone for update;
  if f.id is null then perform pg_sleep(0.4); return jsonb_build_object('erro', 'Celular ou senha incorretos.'); end if;
  if f.bloqueado_ate > now() then return jsonb_build_object('erro', 'Muitas tentativas. Tente de novo em alguns minutos.'); end if;
  if f.senha_hash <> extensions.crypt(coalesce(p_senha, ''), f.senha_hash) then
    update frete_freteiros set tentativas = case when tentativas + 1 >= 5 then 0 else tentativas + 1 end,
           bloqueado_ate = case when tentativas + 1 >= 5 then now() + interval '15 minutes' else bloqueado_ate end where id = f.id;
    return jsonb_build_object('erro', 'Celular ou senha incorretos.');
  end if;
  if f.status = 'bloqueado' then return jsonb_build_object('erro', 'Seu cadastro está bloqueado. Fale com a empresa.'); end if;
  update frete_freteiros set tentativas = 0, bloqueado_ate = null where id = f.id;
  return frete_nova_sessao(f);
end $$;
grant execute on function public.frete_login(text, text) to anon, authenticated;

create or replace function public.frete_sair(p_token text) returns void language sql security definer set search_path = public as $$
  delete from app_sessoes where token_hash = app_hash(p_token) and tipo = 'freteiro'
$$;
grant execute on function public.frete_sair(text) to anon, authenticated;

create or replace function public.frete_freteiro(s app_sessoes) returns frete_freteiros language plpgsql stable security definer set search_path = public as $$
declare f frete_freteiros;
begin
  select * into f from frete_freteiros where id = s.freteiro_id;
  if f.id is null or f.status = 'bloqueado' then raise exception 'SESSAO_EXPIRADA: Cadastro bloqueado. Fale com a empresa.'; end if;
  return f;
end $$;
revoke all on function public.frete_freteiro(app_sessoes) from public, anon, authenticated;

create or replace function public.frete_app(p_token text) returns jsonb language plpgsql security definer set search_path = public as $$
declare s app_sessoes := app_sessao(p_token, 'freteiro'); f frete_freteiros := frete_freteiro(s);
begin
  if f.status = 'aprovado' then perform frete_anuncios_sincronizar(f.empresa_id); end if;
  return jsonb_build_object(
    'perfil', jsonb_build_object('nome', f.nome, 'telefone', f.telefone, 'pix', f.chave_pix, 'carro_modelo', f.veiculo_modelo, 'carro_placa', f.veiculo_placa,
                                 'carro_cor', f.veiculo_tipo, 'capacidade_m3', f.capacidade_m3, 'status', f.status, 'motivo', f.motivo),
    'disponiveis', case when f.status <> 'aprovado' then '[]'::jsonb else coalesce((select jsonb_agg(frete_anuncio_json(a, false) order by a.data, a.hora) from frete_anuncios a
        where a.empresa_id = f.empresa_id and a.status = 'aberto' and a.data >= (now() at time zone 'America/Sao_Paulo')::date and a.m3 <= f.capacidade_m3), '[]') end,
    'minhas', coalesce((select jsonb_agg(frete_corrida_json(a) order by a.data desc, a.hora desc) from frete_anuncios a
        where a.freteiro_id = f.id and (a.status = 'aceito' or a.updated_at > now() - interval '90 days')), '[]'));
end $$;
grant execute on function public.frete_app(text) to anon, authenticated;

create or replace function public.frete_perfil_salvar(p_token text, p_dados jsonb) returns jsonb language plpgsql security definer set search_path = public as $$
declare s app_sessoes := app_sessao(p_token, 'freteiro'); f frete_freteiros := frete_freteiro(s);
begin
  perform frete_validar_veiculo(p_dados);
  update frete_freteiros set chave_pix = btrim(p_dados->>'pix'), veiculo_modelo = btrim(p_dados->>'carro_modelo'),
         veiculo_placa = upper(regexp_replace(p_dados->>'carro_placa', '[^A-Za-z0-9]', '', 'g')), veiculo_tipo = nullif(btrim(coalesce(p_dados->>'carro_cor', '')), ''),
         capacidade_m3 = round(replace(p_dados->>'capacidade_m3', ',', '.')::numeric, 1)
   where id = f.id returning * into f;
  if f.caminhao_id is not null then
    update caminhoes set modelo = f.veiculo_modelo, placa = f.veiculo_placa, categoria = f.veiculo_tipo, capacidade_m3 = f.capacidade_m3 where id = f.caminhao_id;
  end if;
  if coalesce(p_dados->>'senha', '') <> '' then
    if length(p_dados->>'senha') < 6 then raise exception 'A senha precisa ter pelo menos 6 caracteres.'; end if;
    update frete_freteiros set senha_hash = extensions.crypt(p_dados->>'senha', extensions.gen_salt('bf')) where id = f.id;
  end if;
  return frete_app(p_token);
end $$;
grant execute on function public.frete_perfil_salvar(text, jsonb) to anon, authenticated;

-- ---------------------------------------------------------------- aceitar / desistir / check-in e check-out
create or replace function public.frete_aceitar(p_token text, p_vaga uuid) returns jsonb language plpgsql security definer set search_path = public as $$
declare s app_sessoes := app_sessao(p_token, 'freteiro'); f frete_freteiros := frete_freteiro(s); a frete_anuncios; reg jsonb;
begin
  if f.status <> 'aprovado' or f.caminhao_id is null then raise exception 'Seu cadastro ainda não foi aprovado.'; end if;
  perform frete_anuncios_sincronizar(f.empresa_id);
  select * into a from frete_anuncios where id = p_vaga and empresa_id = f.empresa_id for update;
  if a.id is null or a.status <> 'aberto' then raise exception 'Outro freteiro aceitou antes. Este frete não está mais disponível.'; end if;
  if a.data < (now() at time zone 'America/Sao_Paulo')::date then raise exception 'Este frete já passou.'; end if;
  if a.m3 > f.capacidade_m3 then raise exception 'Seu veículo comporta % m³ e este frete precisa de % m³.', f.capacidade_m3, a.m3; end if;
  reg := operacao_regras_escala(f.empresa_id);
  if exists (select 1 from operacao_etapa_caminhoes c join operacao_etapas o on o.id = c.etapa_id
               join operacao_etapas g on g.id = any(a.etapas)
              where c.caminhao_id = f.caminhao_id and o.pedido_id is distinct from a.pedido_id
                and operacao_janela(o.data, o.hora, o.tipo, reg) && operacao_janela(g.data, g.hora, g.tipo, reg)) then
    raise exception 'Você já tem outro frete nesse horário.';
  end if;
  insert into operacao_etapa_caminhoes (etapa_id, caminhao_id, empresa_id)
    select x, f.caminhao_id, f.empresa_id from unnest(a.etapas) x on conflict do nothing;
  update frete_anuncios set status = 'aceito', freteiro_id = f.id, aceito_em = now(), updated_at = now() where id = a.id;
  -- a viagem entra na Conciliação já com o valor combinado (o anunciado)
  perform frete_sincronizar(f.empresa_id);
  update frete_viagens set valor_transportadora = a.valor, transp_obs = 'Aceito no App do Freteiro', transp_enviado_em = now(), updated_at = now()
   where pedido_id = a.pedido_id and caminhao_id = f.caminhao_id and direcao = a.direcao and not extra and status = 'aberto';
  return frete_app(p_token);
end $$;
grant execute on function public.frete_aceitar(text, uuid) to anon, authenticated;

create or replace function public.frete_desistir(p_token text, p_corrida uuid) returns jsonb language plpgsql security definer set search_path = public as $$
declare s app_sessoes := app_sessao(p_token, 'freteiro'); f frete_freteiros := frete_freteiro(s); a frete_anuncios;
begin
  select * into a from frete_anuncios where id = p_corrida and freteiro_id = f.id and status = 'aceito' and checkin_em is null for update;
  if a.id is null then raise exception 'Só dá para desistir antes do check-in.'; end if;
  delete from operacao_etapa_caminhoes where caminhao_id = f.caminhao_id and etapa_id = any(a.etapas);
  update frete_anuncios set status = 'aberto', freteiro_id = null, aceito_em = null, updated_at = now() where id = a.id;
  perform frete_sincronizar(f.empresa_id);
  return frete_app(p_token);
end $$;
grant execute on function public.frete_desistir(text, uuid) to anon, authenticated;

create or replace function public.frete_presenca(p_token text, p_corrida uuid, p_codigo text, p_gps jsonb) returns jsonb language plpgsql security definer set search_path = public as $$
declare s app_sessoes := app_sessao(p_token, 'freteiro'); a frete_anuncios; cod text := regexp_replace(coalesce(p_codigo, ''), '\D', '', 'g');
  j bigint := floor(extract(epoch from now()) / 60)::bigint; ok boolean := false; k bigint; inicio timestamptz;
  lat numeric := nullif(p_gps->>'lat', '')::numeric; lng numeric := nullif(p_gps->>'lng', '')::numeric; r text;
begin
  select * into a from frete_anuncios where id = p_corrida and freteiro_id = s.freteiro_id for update;
  if a.id is null then raise exception 'Frete não encontrado.'; end if;
  if a.status <> 'aceito' then raise exception 'Este frete foi cancelado.'; end if;
  if a.checkout_em is not null then raise exception 'Este frete já foi concluído.'; end if;
  if length(cod) = 6 then
    for k in reverse (j + 1)..(j - 3) loop
      if frete_codigo_qr(a.id, k) = cod then ok := true; exit; end if;
    end loop;
  end if;
  if not ok then raise exception 'Código inválido ou vencido. Leia o QR code do responsável de novo.'; end if;
  inicio := ((a.data + coalesce(a.hora, time '06:00')) at time zone 'America/Sao_Paulo');
  if a.checkin_em is null then
    if now() < inicio - interval '3 hours' then raise exception 'O check-in libera 3h antes do horário (%).', to_char(a.hora, 'HH24:MI'); end if;
    update frete_anuncios set checkin_em = now(), checkin_lat = lat, checkin_lng = lng, updated_at = now() where id = a.id;
    r := 'checkin';
  else
    if now() - a.checkin_em < interval '10 minutes' then raise exception 'O check-out libera 10 minutos depois do check-in.'; end if;
    update frete_anuncios set checkout_em = now(), checkout_lat = lat, checkout_lng = lng, updated_at = now() where id = a.id;
    r := 'checkout';
  end if;
  return frete_app(p_token) || jsonb_build_object('registro', r);
end $$;
grant execute on function public.frete_presenca(text, uuid, text, jsonb) to anon, authenticated;

-- QR do responsável da etapa (App do Montador): os fretes aceitos daquela etapa
create or replace function public.mont_frete_qr(p_token text, p_etapa uuid) returns jsonb language plpgsql security definer set search_path = public as $$
declare s app_sessoes := app_sessao(p_token, 'montador'); j bigint := floor(extract(epoch from now()) / 60)::bigint;
begin
  if not mont_pode_ver(s, p_etapa) then raise exception 'Você não tem acesso a esta etapa.'; end if;
  return jsonb_build_object('trocaEm', ((j + 1) * 60000 - floor(extract(epoch from now()) * 1000))::bigint,
    'fretes', coalesce((select jsonb_agg(frete_anuncio_json(a, true) || jsonb_build_object('codigo', frete_codigo_qr(a.id, j)) order by a.hora)
                from frete_anuncios a where p_etapa = any(a.etapas) and a.status = 'aceito'), '[]'));
end $$;
grant execute on function public.mont_frete_qr(text, uuid) to anon, authenticated;

-- ---------------------------------------------------------------- logística: freteiros e fretes anunciados
create or replace function public.frete_adm_lista(p_empresa uuid) returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not operacao_pode(p_empresa, 'logistica.planejamento.visualizar') then raise exception 'Sem permissão.'; end if;
  perform frete_anuncios_sincronizar(p_empresa);
  return jsonb_build_object(
    'freteiros', coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'nome', f.nome, 'telefone', f.telefone, 'pix', f.chave_pix,
        'veiculo_modelo', f.veiculo_modelo, 'veiculo_placa', f.veiculo_placa, 'veiculo_tipo', f.veiculo_tipo, 'capacidade_m3', f.capacidade_m3,
        'status', f.status, 'motivo', f.motivo, 'avaliado_em', f.avaliado_em, 'avaliado_por', f.avaliado_por, 'created_at', f.created_at,
        'codigo', (select codigo from caminhoes where id = f.caminhao_id),
        'fretes', (select count(*) from frete_anuncios a where a.freteiro_id = f.id and a.status = 'aceito'))
        order by case f.status when 'pendente' then 0 when 'aprovado' then 1 else 2 end, f.created_at desc)
        from frete_freteiros f where f.empresa_id = p_empresa), '[]'),
    'anuncios', coalesce((select jsonb_agg(frete_anuncio_json(a, true) order by a.data, a.hora) from frete_anuncios a
        where a.empresa_id = p_empresa and a.status <> 'cancelado' and a.data >= (now() at time zone 'America/Sao_Paulo')::date - 7), '[]'));
end $$;
grant execute on function public.frete_adm_lista(uuid) to authenticated;

create or replace function public.frete_freteiro_status(p_empresa uuid, p_freteiro uuid, p_status text, p_motivo text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare f frete_freteiros; forn uuid; cam uuid; cod text;
begin
  if not operacao_pode(p_empresa, 'logistica.planejamento.editar') then raise exception 'Sem permissão.'; end if;
  if p_status not in ('aprovado', 'recusado', 'bloqueado') then raise exception 'Situação inválida.'; end if;
  if p_status in ('recusado', 'bloqueado') and length(btrim(coalesce(p_motivo, ''))) < 3 then raise exception 'Informe o motivo.'; end if;
  select * into f from frete_freteiros where id = p_freteiro and empresa_id = p_empresa for update;
  if f.id is null then raise exception 'Freteiro não encontrado.'; end if;
  if p_status = 'aprovado' then
    forn := f.fornecedor_id;
    if forn is null or not exists (select 1 from fornecedores where id = forn) then
      insert into fornecedores (empresa_id, nome_razao_social, nome_fantasia, documento, tipo, categoria, status, telefone, observacoes)
      values (p_empresa, f.nome, f.nome, '', 'servicos', 'Freteiro autônomo', 'ativo', f.telefone, 'Cadastrado pelo App do Freteiro. Pix: ' || coalesce(f.chave_pix, ''))
      returning id into forn;
    else
      update fornecedores set status = 'ativo' where id = forn;
    end if;
    cam := f.caminhao_id;
    if cam is null or not exists (select 1 from caminhoes where id = cam) then
      select 'FR' || lpad((coalesce(max(nullif(regexp_replace(codigo, '\D', '', 'g'), '')::int), 0) + 1)::text, 2, '0') into cod
        from caminhoes where empresa_id = p_empresa and codigo ~ '^FR[0-9]+$';
      insert into caminhoes (empresa_id, modelo, placa, tipo, largura_bau, altura_bau, comprimento_bau, capacidade_m3, status, empresa_nome, telefone,
                             categoria, codigo, fornecedor_id, freteiro_id)
      values (p_empresa, coalesce(f.veiculo_modelo, 'Veículo'), coalesce(f.veiculo_placa, 'SEM PLACA'), 'terceirizado', 0, 0, 0, f.capacidade_m3, 'ativo', f.nome, f.telefone,
              f.veiculo_tipo, cod, forn, f.id)
      returning id into cam;
    else
      update caminhoes set status = 'ativo', fornecedor_id = forn, freteiro_id = f.id where id = cam;
    end if;
    update frete_freteiros set status = 'aprovado', motivo = null, fornecedor_id = forn, caminhao_id = cam,
           avaliado_em = now(), avaliado_por = logistica_nome_usuario(p_empresa) where id = f.id;
  else
    update frete_freteiros set status = p_status, motivo = btrim(p_motivo), avaliado_em = now(), avaliado_por = logistica_nome_usuario(p_empresa) where id = f.id;
    if f.caminhao_id is not null then update caminhoes set status = 'inativo' where id = f.caminhao_id; end if;
    if p_status = 'bloqueado' then delete from app_sessoes where freteiro_id = f.id; end if;
  end if;
  return frete_adm_lista(p_empresa);
end $$;
grant execute on function public.frete_freteiro_status(uuid, uuid, text, text) to authenticated;

-- logística tira o freteiro de um frete (antes do check-in): o frete volta para o app
create or replace function public.frete_anuncio_liberar(p_empresa uuid, p_anuncio uuid) returns jsonb language plpgsql security definer set search_path = public as $$
declare a frete_anuncios; cam uuid;
begin
  if not operacao_pode(p_empresa, 'logistica.planejamento.editar') then raise exception 'Sem permissão.'; end if;
  select * into a from frete_anuncios where id = p_anuncio and empresa_id = p_empresa and status = 'aceito' and checkin_em is null for update;
  if a.id is null then raise exception 'Só dá para tirar o freteiro antes do check-in.'; end if;
  select caminhao_id into cam from frete_freteiros where id = a.freteiro_id;
  delete from operacao_etapa_caminhoes where caminhao_id = cam and etapa_id = any(a.etapas);
  update frete_anuncios set status = 'aberto', freteiro_id = null, aceito_em = null, updated_at = now() where id = a.id;
  perform frete_sincronizar(p_empresa);
  return frete_adm_lista(p_empresa);
end $$;
grant execute on function public.frete_anuncio_liberar(uuid, uuid) to authenticated;
