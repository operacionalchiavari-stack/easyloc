-- Out/2026: Parâmetros > Catálogo. A empresa escolhe se o catálogo mostra o PREÇO, o ESTOQUE (quantidade que a
-- empresa tem) e o DISPONÍVEL (livre na data do evento), e PARA QUEM: equipe interna, decoradores (todos, nenhum ou
-- só os escolhidos) e visitantes (catálogo sem login). A regra vale no servidor: o preço nem sai do banco para
-- quem não pode ver, e o estoque/disponível sai pela função catalogo_estoque, que também respeita a regra.
-- Sem configuração salva vale o comportamento de antes: equipe e decoradores veem tudo, visitante não vê nada.

create table if not exists public.catalogo_parametros (
  empresa_id uuid primary key references public.empresas(id) on delete cascade,
  config jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid
);
alter table public.catalogo_parametros enable row level security;
drop policy if exists catalogo_parametros_ler on public.catalogo_parametros;
create policy catalogo_parametros_ler on public.catalogo_parametros for select to authenticated
  using (public.eh_membro_empresa(empresa_id));
drop policy if exists catalogo_parametros_gravar on public.catalogo_parametros;
create policy catalogo_parametros_gravar on public.catalogo_parametros for all to authenticated
  using (public.eh_membro_empresa(empresa_id) and public.operacao_pode(empresa_id, 'configuracoes.empresa.editar'))
  with check (public.eh_membro_empresa(empresa_id) and public.operacao_pode(empresa_id, 'configuracoes.empresa.editar'));
grant select, insert, update on public.catalogo_parametros to authenticated;

-- p_recurso: preco | estoque | disponivel. p_publico: equipe | decorador | visitante.
create or replace function public.catalogo_parametro_permite(p_empresa uuid, p_recurso text, p_publico text, p_cliente uuid default null)
returns boolean language sql stable security definer set search_path=public as $$
  with r as (
    select coalesce((select config->p_recurso from public.catalogo_parametros where empresa_id=p_empresa), '{}'::jsonb) c
  )
  select case p_publico
    when 'equipe' then coalesce((c->>'equipe')::boolean, true)
    when 'visitante' then coalesce((c->>'visitantes')::boolean, false)
    when 'decorador' then case coalesce(c->>'decoradores', 'todos')
      when 'todos' then true
      when 'escolhidos' then p_cliente is not null and coalesce(c->'decoradores_ids', '[]'::jsonb) ? p_cliente::text
      else false end
    else false end
  from r
$$;

create or replace function public.catalogo_exibir(p_empresa uuid, p_publico text, p_cliente uuid default null)
returns jsonb language sql stable security definer set search_path=public as $$
  select jsonb_build_object(
    'preco', public.catalogo_parametro_permite(p_empresa, 'preco', p_publico, p_cliente),
    'estoque', public.catalogo_parametro_permite(p_empresa, 'estoque', p_publico, p_cliente),
    'disponivel', public.catalogo_parametro_permite(p_empresa, 'disponivel', p_publico, p_cliente))
$$;

-- Tira o preço dos itens quando o público não pode ver.
create or replace function public.catalogo_aplicar_regras(p_itens jsonb, p_empresa uuid, p_publico text, p_cliente uuid default null)
returns jsonb language sql stable security definer set search_path=public as $$
  select case when public.catalogo_parametro_permite(p_empresa, 'preco', p_publico, p_cliente) then p_itens
    else (select coalesce(jsonb_agg(item - 'valor_locacao' - 'valor_reposicao'), '[]'::jsonb) from jsonb_array_elements(p_itens) item) end
$$;

-- Decorador (token do catálogo)
create or replace function public.catalogo_carregar(p_token text)
returns jsonb language plpgsql security definer set search_path to 'public', 'extensions' as $function$
declare v_cliente uuid; v_empresa uuid;
begin
 select a.cliente_id,a.empresa_id into v_cliente,v_empresa
 from public.catalogo_sessoes s join public.catalogo_acessos a on a.id=s.acesso_id
 join public.clientes_empresas c on c.id=a.cliente_id and c.empresa_id=a.empresa_id
 where s.token_hash=encode(digest(p_token,'sha256'),'hex') and s.expires_at>now() and a.ativo;
 if v_cliente is null then raise exception 'Sessão do catálogo expirada'; end if;
 return jsonb_build_object(
  'empresa',(select jsonb_build_object('nome',e.nome,'logo_url',e.logo_url) from public.empresas e where e.id=v_empresa),
  'decorador',(select jsonb_build_object('id',c.id,'nome',c.nome_razao,'logo_url',c.catalogo_logo_url,'cor_primaria',c.catalogo_cor_primaria,'cor_secundaria',c.catalogo_cor_secundaria) from public.clientes_empresas c where c.id=v_cliente),
  'exibir',public.catalogo_exibir(v_empresa,'decorador',v_cliente),
  'itens',public.catalogo_aplicar_regras(public.catalogo_fotos_decorador(public.catalogo_acervo(v_empresa),v_empresa,v_cliente),v_empresa,'decorador',v_cliente));
end; $function$;

-- Equipe interna
create or replace function public.catalogo_carregar_interno(p_empresa_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
begin
 if auth.uid() is null or not public.funcionario_pode(p_empresa_id,auth.uid(),'comercial.catalogo.visualizar') then
  raise exception 'Sem permissão para acessar o catálogo';
 end if;
 return jsonb_build_object(
  'empresa',(select jsonb_build_object('nome',e.nome,'logo_url',e.logo_url) from public.empresas e where e.id=p_empresa_id),
  'decorador',null,
  'exibir',public.catalogo_exibir(p_empresa_id,'equipe'),
  'itens',public.catalogo_aplicar_regras(public.catalogo_acervo(p_empresa_id),p_empresa_id,'equipe'));
end; $function$;

-- Visitante (sem login)
create or replace function public.catalogo_publico_carregar(p_empresa_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $function$
declare v_empresa uuid := public.catalogo_empresa_publica(p_empresa_id);
begin
  if v_empresa is null then raise exception 'Catálogo indisponível'; end if;
  return jsonb_build_object(
    'empresa', (select jsonb_build_object('nome', e.nome, 'logo_url', e.logo_url) from public.empresas e where e.id = v_empresa),
    'empresa_id', v_empresa,
    'decorador', null,
    'exibir', public.catalogo_exibir(v_empresa,'visitante'),
    'itens', public.catalogo_aplicar_regras(public.catalogo_acervo(v_empresa), v_empresa, 'visitante'));
end;
$function$;

CREATE OR REPLACE FUNCTION public.operacao_disponibilidade_calc(p_empresa uuid, p_data date)
 RETURNS TABLE(item_id uuid, total numeric, livre numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  return query
  with reservas as (
    select s.item_id, s.quantidade_solicitada qtd
      from public.separacoes_itens s join public.separacoes_pedidos p on p.id = s.separacao_pedido_id
     where p.empresa_id = p_empresa and p.status_comercial in ('pre_reserva','aprovado','enviado','finalizado')
       and coalesce(p.status, '') <> 'cancelado' and p.encerrado_operacional_em is null
       and p_data between coalesce(p.data_entrega, p.data_evento) and coalesce(p.data_coleta, p.data_evento_fim, p.data_evento)
  ), pecas_reservadas as (
    select r.item_id, r.qtd from reservas r join public.itens i on i.id = r.item_id where coalesce(lower(i.tipo), '') <> 'kit'
    union all
    select k.item_id, r.qtd * k.quantidade from reservas r join public.itens i on i.id = r.item_id and lower(i.tipo) = 'kit'
      join public.kit_itens k on k.kit_id = i.id
    union all -- kit sem componentes cadastrados reserva o próprio kit
    select r.item_id, r.qtd from reservas r join public.itens i on i.id = r.item_id and lower(i.tipo) = 'kit'
     where not exists (select 1 from public.kit_itens k where k.kit_id = i.id)
  ), reservado as (
    select pr.item_id, sum(pr.qtd) qtd from pecas_reservadas pr group by pr.item_id
  ), bloqueado as (
    select b.item_id, sum(b.qtd) qtd from (
      select e.item_id, 1::numeric qtd from public.separacoes_etiquetas e join public.separacoes_pedidos p on p.id = e.separacao_pedido_id
       where p.empresa_id = p_empresa and e.lida_carregamento_em is not null and e.lida_retorno_em is null
         and coalesce(p.data_coleta, p.data_evento) < p_data
         and not exists (select 1 from public.operacao_ocorrencias o where o.pedido_id = p.id and o.codigo = e.codigo and o.tipo = 'falta' and o.resolucao like 'Perda confirmada:%')
      union all
      select o.item_id, o.quantidade from public.operacao_ocorrencias o
       where o.empresa_id = p_empresa and o.resolvida_em is null and o.tipo in ('avaria','limpeza','manutencao') and o.item_id is not null
    ) b group by b.item_id
  ), pecas as (
    select i.id, coalesce(i.estoque_total, 0)::numeric tot,
           greatest(0, coalesce(i.estoque_total, 0) - coalesce(i.estoque_manutencao, 0) - coalesce(r.qtd, 0) - coalesce(b.qtd, 0))::numeric liv
      from public.itens i left join reservado r on r.item_id = i.id left join bloqueado b on b.item_id = i.id
     where i.empresa_id = p_empresa
  ), kits as (
    select k.kit_id id, min(floor(pc.tot / nullif(k.quantidade, 0)))::numeric tot, min(floor(pc.liv / nullif(k.quantidade, 0)))::numeric liv
      from public.kit_itens k join pecas pc on pc.id = k.item_id
     where k.empresa_id = p_empresa
     group by k.kit_id
  )
  select pc.id, coalesce(kt.tot, pc.tot), coalesce(kt.liv, pc.liv)
    from pecas pc left join kits kt on kt.id = pc.id;
end $function$;

-- A conta da disponibilidade mora em operacao_disponibilidade_calc (sem checagem de acesso, ninguém de fora executa);
-- operacao_disponibilidade continua igual para quem já usa (confere o vínculo e chama a conta).
create or replace function public.operacao_disponibilidade(p_empresa uuid, p_data date)
returns table(item_id uuid, total numeric, livre numeric) language plpgsql stable security definer set search_path to 'public' as $f$
begin
  if coalesce(auth.role(), '') <> 'service_role' and not public.eh_membro_empresa(p_empresa) then
    raise exception 'Sem acesso a esta empresa';
  end if;
  return query select * from public.operacao_disponibilidade_calc(p_empresa, p_data);
end $f$;
revoke all on function public.operacao_disponibilidade_calc(uuid,date) from public, anon, authenticated;

-- Estoque e disponível do acervo numa data, para os selos do catálogo: { "<item>": [estoque|null, livre|null] }.
-- Quem chama: token do catálogo (decorador), login da equipe ou ninguém (visitante, catálogo público da empresa).
create or replace function public.catalogo_estoque(p_data date, p_token text default null, p_empresa_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $function$
declare v_empresa uuid; v_cliente uuid; v_publico text; v_sessao jsonb; v_est boolean; v_disp boolean;
begin
  if p_token is not null and p_token <> '' then
    v_sessao := public.catalogo_validar_sessao(p_token);
    if not coalesce((v_sessao->>'valido')::boolean, false) then raise exception 'Sessão do catálogo expirada'; end if;
    v_empresa := (v_sessao->>'empresa_id')::uuid; v_cliente := (v_sessao->>'cliente_id')::uuid; v_publico := 'decorador';
  elsif auth.uid() is not null and p_empresa_id is not null and public.funcionario_pode(p_empresa_id, auth.uid(), 'comercial.catalogo.visualizar') then
    v_empresa := p_empresa_id; v_publico := 'equipe';
  else
    v_empresa := public.catalogo_empresa_publica(p_empresa_id); v_publico := 'visitante';
    if v_empresa is null then return '{}'::jsonb; end if;
  end if;
  v_est := public.catalogo_parametro_permite(v_empresa, 'estoque', v_publico, v_cliente);
  v_disp := public.catalogo_parametro_permite(v_empresa, 'disponivel', v_publico, v_cliente);
  if not v_est and not v_disp then return '{}'::jsonb; end if;
  return coalesce((select jsonb_object_agg(d.item_id::text, jsonb_build_array(case when v_est then d.total end, case when v_disp then d.livre end))
    from public.operacao_disponibilidade_calc(v_empresa, p_data) d where d.total > 0), '{}'::jsonb);
end;
$function$;

revoke all on function public.catalogo_parametro_permite(uuid,text,text,uuid), public.catalogo_exibir(uuid,text,uuid),
  public.catalogo_aplicar_regras(jsonb,uuid,text,uuid) from public, anon, authenticated;
grant execute on function public.catalogo_parametro_permite(uuid,text,text,uuid) to service_role;
revoke all on function public.catalogo_estoque(date,text,uuid) from public;
grant execute on function public.catalogo_estoque(date,text,uuid) to anon, authenticated;

grant execute on function public.catalogo_exibir(uuid,text,uuid) to service_role;
