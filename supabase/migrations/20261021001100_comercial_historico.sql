-- Out/2026: Comercial > Histórico. Pedido do usuário: "todas as movimentações que tiverem em pedido precisam ficar
-- registradas, segregadas por pedido, por tipo, por quem... um módulo bem completo, seguro".
-- Como o histórico dos projetos: o BANCO registra, por gatilho, cada mudança nas tabelas do pedido — não depende de
-- tela nenhuma lembrar de anotar. Quem: login da equipe (nome do Cadastro de Funcionários) ou "Sistema" (gateway de
-- pagamento, rotinas). O histórico NÃO tem chave estrangeira para o pedido: excluir um pedido não apaga o histórico dele.
-- Mudanças seguidas do mesmo item/campo pela mesma pessoa em até 10 minutos viram uma linha só (como nos projetos).
-- Os projetos do catálogo continuam em projetos_historico; a tela lê os dois juntos (comercial_historico()).

create table if not exists public.comercial_historico (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null,
  pedido_id uuid,
  pedido_numero text,
  cliente_nome text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  autor text,
  autor_id uuid,
  autor_tipo text not null default 'sistema' check (autor_tipo in ('equipe','decorador','sistema')),
  tipo text not null,          -- pedido | status | itens | evento | valores | financeiro | operacao | contrato
  chave text,
  descricao text not null,
  detalhe jsonb not null default '{}'::jsonb
);
create index if not exists comercial_historico_empresa_idx on public.comercial_historico(empresa_id, atualizado_em desc);
create index if not exists comercial_historico_pedido_idx on public.comercial_historico(pedido_id, atualizado_em desc);
alter table public.comercial_historico enable row level security;
revoke all on public.comercial_historico from anon, authenticated;

-- Quem está fazendo a mudança.
create or replace function public.comercial_hist_autor(p_empresa uuid, out autor text, out autor_id uuid, out autor_tipo text)
language plpgsql stable security definer set search_path=public as $$
begin
  autor_id := auth.uid();
  if autor_id is not null then
    autor_tipo := 'equipe';
    select f.nome into autor from public.funcionarios_acesso f where f.id = autor_id and f.empresa_id = p_empresa;
    autor := coalesce(autor, auth.jwt()->>'email', 'Equipe');
  else
    autor_tipo := 'sistema'; autor := 'Sistema';
  end if;
end $$;

create or replace function public.comercial_hist_texto(p_tipo text, d jsonb, p_padrao text)
returns text language plpgsql immutable as $$
declare de numeric; para numeric;
begin
  if p_tipo = 'itens' and d ? 'item' then
    de := coalesce((d->>'de')::numeric, 0); para := coalesce((d->>'para')::numeric, 0);
    if de = 0 then return 'Adicionou ' || para || '× ' || (d->>'item'); end if;
    if para = 0 then return 'Tirou ' || (d->>'item') || ' (eram ' || de || ')'; end if;
    return 'Mudou a quantidade de ' || (d->>'item') || ': ' || de || ' → ' || para;
  end if;
  if d ? 'campo' then
    return 'Alterou ' || (d->>'campo') || ': ' || coalesce(nullif(d->>'de',''), '(vazio)') || ' → ' || coalesce(nullif(d->>'para',''), '(vazio)');
  end if;
  return p_padrao;
end $$;

-- Grava uma linha (ou junta com a última igual, mesma pessoa, até 10 min; se volta ao valor inicial, a linha some).
create or replace function public.comercial_hist_gravar(p_empresa uuid, p_pedido uuid, p_tipo text, p_chave text,
  p_descricao text, p_detalhe jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path=public as $$
declare a record; ult public.comercial_historico; det jsonb; num text; cli text;
begin
  select * into a from public.comercial_hist_autor(p_empresa);
  if p_chave is not null then
    select * into ult from public.comercial_historico
     where empresa_id = p_empresa and pedido_id is not distinct from p_pedido and chave = p_chave
       and coalesce(autor,'') = coalesce(a.autor,'') and atualizado_em > now() - interval '10 minutes'
     order by atualizado_em desc limit 1;
    if found then
      det := ult.detalhe || p_detalhe;
      if ult.detalhe ? 'de' then det := jsonb_set(det, '{de}', ult.detalhe->'de'); end if;
      if det ? 'de' and det ? 'para' and det->'de' = det->'para' then delete from public.comercial_historico where id = ult.id; return; end if;
      update public.comercial_historico set atualizado_em = now(), detalhe = det, descricao = public.comercial_hist_texto(p_tipo, det, p_descricao) where id = ult.id;
      return;
    end if;
  end if;
  select numero_pedido, cliente_nome into num, cli from public.separacoes_pedidos where id = p_pedido;
  insert into public.comercial_historico(empresa_id, pedido_id, pedido_numero, cliente_nome, autor, autor_id, autor_tipo, tipo, chave, descricao, detalhe)
  values (p_empresa, p_pedido, coalesce(num, p_detalhe->>'pedido_numero'), coalesce(cli, p_detalhe->>'cliente_nome'), a.autor, a.autor_id, a.autor_tipo,
          p_tipo, p_chave, public.comercial_hist_texto(p_tipo, p_detalhe, p_descricao), p_detalhe);
end $$;

create or replace function public.comercial_hist_status(s text) returns text language sql immutable as $$
  select coalesce(jsonb_build_object('orcamento','Orçamento','pre_reserva','Pré-reserva','aprovado','Reservado','enviado','Enviado',
    'finalizado','Finalizado','cancelado','Cancelado','pendente','Pendente','em_separacao','Em separação','separado','Separado',
    'carregado','Carregado','descarregado','Descarregado','retornado','Conferido na volta')->>s, s, '—')
$$;

create or replace function public.comercial_hist_data(d date) returns text language sql immutable as $$ select to_char(d, 'DD/MM/YYYY') $$;
create or replace function public.comercial_hist_moeda(v numeric) returns text language sql immutable as $$
  select case when v is null then null else 'R$ ' || replace(replace(replace(to_char(round(v, 2), 'FM999G999G990D00'), ',', '#'), '.', ','), '#', '.') end
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- Pedido (separacoes_pedidos)
create or replace function public.comercial_hist_pedido()
returns trigger language plpgsql security definer set search_path=public as $$
declare
  e uuid; k text; rot text; v_de text; v_para text;
  campos jsonb := '{"horario_entrega":"o horário de entrega","horario_coleta":"o horário de coleta","observacoes_entrega":"a observação de entrega","observacoes_coleta":"a observação de coleta","observacoes_separacao":"a observação de separação","descricao":"a descrição do pedido"}';
  etapa text; reg jsonb;
begin
  if tg_op = 'DELETE' then
    perform public.comercial_hist_gravar(old.empresa_id, old.id, 'pedido', null, 'Excluiu o pedido ' || coalesce(old.numero_pedido, '') || coalesce(' de ' || old.cliente_nome, ''),
      jsonb_build_object('pedido_numero', old.numero_pedido, 'cliente_nome', old.cliente_nome));
    return old;
  end if;
  e := new.empresa_id;
  if tg_op = 'INSERT' then
    perform public.comercial_hist_gravar(e, new.id, 'pedido', null, 'Criou o pedido (' || public.comercial_hist_status(new.status_comercial) || ')' ||
      case when new.observacoes ? 'projeto_catalogo_id' then ' a partir de um projeto do catálogo' else '' end, '{}');
    return new;
  end if;
  -- Situação
  if new.status_comercial is distinct from old.status_comercial then
    perform public.comercial_hist_gravar(e, new.id, 'status', null, 'Mudou a situação: ' || public.comercial_hist_status(old.status_comercial) || ' → ' || public.comercial_hist_status(new.status_comercial), '{}'); end if;
  if new.pre_reserva_ate is distinct from old.pre_reserva_ate then
    perform public.comercial_hist_gravar(e, new.id, 'status', 'campo:pre_reserva_ate', null, jsonb_build_object('campo','a validade da pré-reserva','de',public.comercial_hist_data(old.pre_reserva_ate),'para',public.comercial_hist_data(new.pre_reserva_ate))); end if;
  -- Cliente, evento, datas e local
  if new.numero_pedido is distinct from old.numero_pedido then
    perform public.comercial_hist_gravar(e, new.id, 'evento', 'campo:numero', null, jsonb_build_object('campo','o número do pedido','de',old.numero_pedido,'para',new.numero_pedido)); end if;
  if new.cliente_nome is distinct from old.cliente_nome then
    perform public.comercial_hist_gravar(e, new.id, 'evento', 'campo:cliente', null, jsonb_build_object('campo','o cliente','de',old.cliente_nome,'para',new.cliente_nome)); end if;
  if new.contato_cliente is distinct from old.contato_cliente then
    perform public.comercial_hist_gravar(e, new.id, 'evento', 'campo:contato', null, jsonb_build_object('campo','o contato do cliente','de',old.contato_cliente,'para',new.contato_cliente)); end if;
  if new.tipo_evento is distinct from old.tipo_evento then
    perform public.comercial_hist_gravar(e, new.id, 'evento', 'campo:tipo', null, jsonb_build_object('campo','o tipo de evento','de',old.tipo_evento,'para',new.tipo_evento)); end if;
  if new.local_nome is distinct from old.local_nome then
    perform public.comercial_hist_gravar(e, new.id, 'evento', 'campo:local', null, jsonb_build_object('campo','o local','de',old.local_nome,'para',new.local_nome)); end if;
  if new.data_evento is distinct from old.data_evento then
    perform public.comercial_hist_gravar(e, new.id, 'evento', 'campo:data_evento', null, jsonb_build_object('campo','a data do evento','de',public.comercial_hist_data(old.data_evento),'para',public.comercial_hist_data(new.data_evento))); end if;
  if new.data_evento_fim is distinct from old.data_evento_fim then
    perform public.comercial_hist_gravar(e, new.id, 'evento', 'campo:data_evento_fim', null, jsonb_build_object('campo','o último dia do evento','de',public.comercial_hist_data(old.data_evento_fim),'para',public.comercial_hist_data(new.data_evento_fim))); end if;
  if new.data_entrega is distinct from old.data_entrega then
    perform public.comercial_hist_gravar(e, new.id, 'evento', 'campo:data_entrega', null, jsonb_build_object('campo','a data de entrega','de',public.comercial_hist_data(old.data_entrega),'para',public.comercial_hist_data(new.data_entrega))); end if;
  if new.data_coleta is distinct from old.data_coleta then
    perform public.comercial_hist_gravar(e, new.id, 'evento', 'campo:data_coleta', null, jsonb_build_object('campo','a data de coleta','de',public.comercial_hist_data(old.data_coleta),'para',public.comercial_hist_data(new.data_coleta))); end if;
  for k in select jsonb_object_keys(campos) loop
    v_de := old.observacoes->>k; v_para := new.observacoes->>k;
    if v_de is distinct from v_para then
      perform public.comercial_hist_gravar(e, new.id, 'evento', 'campo:obs.' || k, null, jsonb_build_object('campo', campos->>k, 'de', left(v_de, 160), 'para', left(v_para, 160)));
    end if;
  end loop;
  -- Valores e pagamento
  if new.valor_total is distinct from old.valor_total then
    perform public.comercial_hist_gravar(e, new.id, 'valores', 'campo:valor_total', null, jsonb_build_object('campo','o valor total','de',public.comercial_hist_moeda(old.valor_total),'para',public.comercial_hist_moeda(new.valor_total))); end if;
  for k, rot in select * from (values ('locacao','o valor da locação'),('frete','o frete'),('montagem','a montagem')) v(k, rot) loop
    if (old.observacoes->'valores'->>k) is distinct from (new.observacoes->'valores'->>k) and old.observacoes ? 'valores' then
      perform public.comercial_hist_gravar(e, new.id, 'valores', 'campo:valores.' || k, null, jsonb_build_object('campo', rot,
        'de', public.comercial_hist_moeda((old.observacoes->'valores'->>k)::numeric), 'para', public.comercial_hist_moeda((new.observacoes->'valores'->>k)::numeric)));
    end if;
  end loop;
  if (old.observacoes->'parcelas_financeiras') is distinct from (new.observacoes->'parcelas_financeiras') then
    perform public.comercial_hist_gravar(e, new.id, 'valores', 'parcelas', 'Alterou as condições de pagamento: ' ||
      jsonb_array_length(coalesce(new.observacoes->'parcelas_financeiras','[]')) || ' parcela(s), ' ||
      coalesce(public.comercial_hist_moeda((select sum((p->>'valor')::numeric) from jsonb_array_elements(coalesce(new.observacoes->'parcelas_financeiras','[]')) p)), 'R$ 0,00'), '{}');
  end if;
  if (old.observacoes->'cancelamento') is distinct from (new.observacoes->'cancelamento') and new.observacoes ? 'cancelamento' then
    perform public.comercial_hist_gravar(e, new.id, 'status', null, 'Registrou o cancelamento' || coalesce(': ' || nullif(new.observacoes->'cancelamento'->>'motivo', ''), ''), '{}'); end if;
  -- Operação
  if new.status is distinct from old.status then
    perform public.comercial_hist_gravar(e, new.id, 'operacao', null, 'Separação: ' || public.comercial_hist_status(old.status) || ' → ' || public.comercial_hist_status(new.status), '{}'); end if;
  if new.status_operacional is distinct from old.status_operacional and new.status_operacional is not null then
    perform public.comercial_hist_gravar(e, new.id, 'operacao', null, 'Operação: ' || public.comercial_hist_status(new.status_operacional), '{}'); end if;
  foreach etapa in array array['carregamento','descarregamento','retorno'] loop
    reg := new.operacao->etapa;
    if (reg->>'concluido_em') is distinct from (old.operacao->etapa->>'concluido_em') and reg->>'concluido_em' is not null then
      perform public.comercial_hist_gravar(e, new.id, 'operacao', null,
        'Concluiu a conferência ' || case etapa when 'carregamento' then 'do carregamento' when 'descarregamento' then 'do descarregamento' else 'da volta' end ||
        ' (' || coalesce(reg->>'lidas','0') || ' de ' || coalesce(reg->>'total','0') ||
        case when coalesce(reg->>'sem_etiquetas','false')::boolean then ' peças, por quantidade' else ' volumes' end || ')' ||
        case when jsonb_array_length(coalesce(reg->'faltando','[]')) > 0 then ' — ' || jsonb_array_length(reg->'faltando') || ' pendência(s)' else '' end, '{}');
    end if;
  end loop;
  if new.encerrado_operacional_em is distinct from old.encerrado_operacional_em and new.encerrado_operacional_em is not null then
    perform public.comercial_hist_gravar(e, new.id, 'operacao', null, 'Encerrou o pedido na operação', '{}'); end if;
  if new.reducao_liberada_em is distinct from old.reducao_liberada_em then
    perform public.comercial_hist_gravar(e, new.id, 'operacao', null, case when new.reducao_liberada_em is null then 'Retirou a liberação para reduzir itens' else 'Liberou a redução de itens de um pedido já separado' end, '{}'); end if;
  return new;
exception when others then
  raise warning 'comercial_hist_pedido: %', sqlerrm;
  return coalesce(new, old);
end $$;
drop trigger if exists comercial_historico_pedido on public.separacoes_pedidos;
create trigger comercial_historico_pedido after insert or update or delete on public.separacoes_pedidos
for each row execute function public.comercial_hist_pedido();

-- Itens do pedido (separacoes_itens): quantidade pedida por item (a mesma peça em duas linhas soma).
create or replace function public.comercial_hist_itens()
returns trigger language plpgsql security definer set search_path=public as $$
declare r record; delta numeric; total numeric; nome text;
begin
  r := coalesce(new, old);
  if not exists (select 1 from public.separacoes_pedidos where id = r.separacao_pedido_id) then return null; end if; -- pedido sendo excluído
  delta := coalesce(case when tg_op <> 'DELETE' then new.quantidade_solicitada end, 0) - coalesce(case when tg_op <> 'INSERT' then old.quantidade_solicitada end, 0);
  if delta = 0 then return null; end if;
  select coalesce(sum(quantidade_solicitada), 0) into total from public.separacoes_itens where separacao_pedido_id = r.separacao_pedido_id and item_id = r.item_id;
  nome := coalesce(nullif(btrim(regexp_replace(r.item_nome, '\s*\(L\).*$', '')), ''), public.projeto_hist_item_nome(r.item_id), 'Item');
  perform public.comercial_hist_gravar(r.empresa_id, r.separacao_pedido_id, 'itens', 'item:' || r.item_id, null,
    jsonb_build_object('item', nome, 'item_id', r.item_id, 'de', total - delta, 'para', total));
  return null;
exception when others then
  raise warning 'comercial_hist_itens: %', sqlerrm;
  return null;
end $$;
drop trigger if exists comercial_historico_itens on public.separacoes_itens;
create trigger comercial_historico_itens after insert or delete or update of quantidade_solicitada on public.separacoes_itens
for each row execute function public.comercial_hist_itens();

-- Recebimentos e estornos (fin_baixas de contas a receber ligadas a pedido)
create or replace function public.comercial_hist_baixas()
returns trigger language plpgsql security definer set search_path=public as $$
declare rc public.fin_receber; parte text;
begin
  if new.receber_id is null then return null; end if;
  select * into rc from public.fin_receber where id = new.receber_id;
  if rc.pedido_id is null then return null; end if;
  parte := coalesce(initcap(rc.componente), 'Parcela') || coalesce(' · parcela ' || rc.parcela || coalesce('/' || rc.parcelas, ''), '');
  if tg_op = 'INSERT' then
    perform public.comercial_hist_gravar(rc.empresa_id, rc.pedido_id, 'financeiro', null,
      'Recebeu ' || public.comercial_hist_moeda(new.valor) || ' — ' || parte || coalesce(' (' || nullif(new.forma, '') || ')', '') ||
      case when new.origem ilike '%gateway%' or new.origem ilike '%pix%' then ' · baixa automática do PIX' else '' end, '{}');
  elsif new.estornado_em is not null and old.estornado_em is null then
    perform public.comercial_hist_gravar(rc.empresa_id, rc.pedido_id, 'financeiro', null,
      'Estornou o recebimento de ' || public.comercial_hist_moeda(new.valor) || ' — ' || parte || coalesce(': ' || nullif(new.estorno_motivo, ''), ''), '{}');
  end if;
  return null;
exception when others then
  raise warning 'comercial_hist_baixas: %', sqlerrm;
  return null;
end $$;
drop trigger if exists comercial_historico_baixas on public.fin_baixas;
create trigger comercial_historico_baixas after insert or update of estornado_em on public.fin_baixas
for each row execute function public.comercial_hist_baixas();

-- Contrato
create or replace function public.comercial_hist_contrato()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.pedido_id is null then return null; end if;
  if tg_op = 'INSERT' then
    perform public.comercial_hist_gravar(new.empresa_id, new.pedido_id, 'contrato', null, 'Gerou o contrato', '{}');
  elsif new.conteudo_final is distinct from old.conteudo_final then
    perform public.comercial_hist_gravar(new.empresa_id, new.pedido_id, 'contrato', 'contrato', 'Editou o contrato', '{}');
  end if;
  return null;
exception when others then
  raise warning 'comercial_hist_contrato: %', sqlerrm;
  return null;
end $$;
drop trigger if exists comercial_historico_contrato on public.contratos_pedidos;
create trigger comercial_historico_contrato after insert or update of conteudo_final on public.contratos_pedidos
for each row execute function public.comercial_hist_contrato();

-- Etiquetas de envio geradas (uma linha por pedido, com quantas)
create or replace function public.comercial_hist_etiquetas()
returns trigger language plpgsql security definer set search_path=public as $$
declare r record;
begin
  for r in select empresa_id, separacao_pedido_id, count(*) n from novas group by 1, 2 loop
    perform public.comercial_hist_gravar(r.empresa_id, r.separacao_pedido_id, 'operacao', 'etiquetas', 'Gerou ' || r.n || ' etiqueta(s) de envio', '{}');
  end loop;
  return null;
exception when others then
  raise warning 'comercial_hist_etiquetas: %', sqlerrm;
  return null;
end $$;
drop trigger if exists comercial_historico_etiquetas on public.separacoes_etiquetas;
create trigger comercial_historico_etiquetas after insert on public.separacoes_etiquetas
referencing new table as novas for each statement execute function public.comercial_hist_etiquetas();

-- Ocorrências da operação (falta, avaria, limpeza, manutenção)
create or replace function public.comercial_hist_ocorrencias()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if tg_op = 'INSERT' then
    perform public.comercial_hist_gravar(new.empresa_id, new.pedido_id, 'operacao', null,
      'Registrou ocorrência de ' || new.tipo || ': ' || new.descricao || case when new.quantidade > 1 then ' (' || new.quantidade || ')' else '' end, '{}');
  elsif new.resolvida_em is not null and old.resolvida_em is null then
    perform public.comercial_hist_gravar(new.empresa_id, new.pedido_id, 'operacao', null,
      'Resolveu a ocorrência de ' || new.tipo || ': ' || new.descricao || coalesce(' — ' || nullif(new.resolucao, ''), ''), '{}');
  end if;
  return null;
exception when others then
  raise warning 'comercial_hist_ocorrencias: %', sqlerrm;
  return null;
end $$;
drop trigger if exists comercial_historico_ocorrencias on public.operacao_ocorrencias;
create trigger comercial_historico_ocorrencias after insert or update of resolvida_em on public.operacao_ocorrencias
for each row execute function public.comercial_hist_ocorrencias();

-- ---------------------------------------------------------------------------------------------------------------
-- Leitura (tela Comercial > Histórico): pedidos + projetos do catálogo, com filtros. Equipe com permissão de pedidos.
create or replace function public.comercial_historico(p_empresa_id uuid, p_pedido uuid default null, p_projeto uuid default null,
  p_tipo text default null, p_autor text default null, p_de date default null, p_ate date default null, p_busca text default null,
  p_limite int default 500)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare busca text := nullif(lower(btrim(coalesce(p_busca, ''))), '');
begin
  if auth.uid() is null or not public.eh_membro_empresa(p_empresa_id) or not public.funcionario_pode(p_empresa_id, auth.uid(), 'comercial.pedidos.visualizar') then
    raise exception 'Sem permissão para ver o histórico do comercial';
  end if;
  return coalesce((select jsonb_agg(to_jsonb(x) order by x.quando desc) from (
    select * from (
      select h.id, 'pedido' origem, h.pedido_id, null::uuid projeto_id, h.pedido_numero, h.cliente_nome, null::text projeto_nome,
             h.atualizado_em quando, h.criado_em inicio, h.autor, h.autor_tipo, h.tipo, h.descricao
        from public.comercial_historico h where h.empresa_id = p_empresa_id
      union all
      select h.id, 'catalogo', (select sp.id from public.separacoes_pedidos sp where sp.empresa_id = p.empresa_id and sp.observacoes->>'projeto_catalogo_id' = p.id::text limit 1),
             p.id, null, coalesce(c.nome_razao, 'Equipe'), p.noivos, h.atualizado_em, h.criado_em, h.autor, h.autor_tipo, 'catalogo', h.descricao
        from public.projetos_historico h join public.projetos p on p.id = h.projeto_id left join public.clientes_empresas c on c.id = p.cliente_id
       where h.empresa_id = p_empresa_id
    ) t
    where (p_pedido is null or t.pedido_id = p_pedido)
      and (p_projeto is null or t.projeto_id = p_projeto)
      and (p_tipo is null or t.tipo = p_tipo)
      and (p_autor is null or t.autor = p_autor)
      and (p_de is null or t.quando >= p_de::timestamp at time zone 'America/Sao_Paulo')
      and (p_ate is null or t.quando < (p_ate + 1)::timestamp at time zone 'America/Sao_Paulo')
      and (busca is null or lower(concat_ws(' ', t.pedido_numero, t.cliente_nome, t.projeto_nome, t.descricao, t.autor)) like '%' || busca || '%')
    order by t.quando desc
    limit greatest(1, least(coalesce(p_limite, 500), 5000))
  ) x), '[]'::jsonb);
end $$;

revoke all on function public.comercial_hist_autor(uuid), public.comercial_hist_texto(text,jsonb,text),
  public.comercial_hist_gravar(uuid,uuid,text,text,text,jsonb), public.comercial_hist_pedido(), public.comercial_hist_itens(),
  public.comercial_hist_baixas(), public.comercial_hist_contrato(), public.comercial_hist_etiquetas(), public.comercial_hist_ocorrencias()
  from public, anon, authenticated;
revoke all on function public.comercial_historico(uuid,uuid,uuid,text,text,date,date,text,int) from public, anon;
grant execute on function public.comercial_historico(uuid,uuid,uuid,text,text,date,date,text,int) to authenticated;
