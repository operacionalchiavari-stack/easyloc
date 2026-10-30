-- =====================================================================================
-- Clara, a assistente financeira da Conciliação (out/2026).
-- Você envia o extrato (Excel, CSV, OFX ou PDF); a Edge Function financeiro-assistente lê o arquivo,
-- aprende o formato de cada banco (fin_extrato_modelos), importa as linhas (fin_importar_extrato_lote)
-- e grava em cada linha uma SUGESTÃO (fin_extrato.sugestao): dar baixa num título, transferência entre
-- contas, lançar (com categoria + centro de custo) ou ignorar. Nada é aplicado sem a pessoa confirmar:
-- a confirmação passa por fin_assist_aplicar, que confere a permissão e grava como sempre (fin_baixar_).
-- Cada correção vira uma regra (fin_assist_regras) que a assistente usa nas próximas importações.
-- =====================================================================================

alter table public.fin_extrato
  add column if not exists documento text,
  add column if not exists contraparte text,
  add column if not exists contraparte_doc text,
  add column if not exists saldo numeric(15,2),
  add column if not exists lote_id uuid,
  add column if not exists sugestao jsonb,
  add column if not exists sugestao_em timestamptz,
  add column if not exists transferencia_grupo uuid,
  add column if not exists conciliado_em timestamptz,
  add column if not exists conciliado_por uuid,
  add column if not exists conciliado_acao jsonb;
create index if not exists fin_extrato_conta_data on public.fin_extrato(conta_id, data);

create table if not exists public.fin_extrato_lotes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  conta_id uuid not null references public.fin_contas(id) on delete cascade,
  arquivo_nome text, formato text, banco_detectado text,
  periodo_ini date, periodo_fim date,
  linhas integer not null default 0, novas integer not null default 0,
  saldo_banco numeric(15,2), saldo_data date,
  criado_por uuid, created_at timestamptz not null default now()
);
create index if not exists fin_extrato_lotes_conta on public.fin_extrato_lotes(conta_id, created_at desc);

-- Formato aprendido de cada planilha de banco (assinatura = cabeçalho normalizado).
create table if not exists public.fin_extrato_modelos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  assinatura text not null,
  banco text,
  modelo jsonb not null,
  usos integer not null default 0,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (empresa_id, assinatura)
);

-- Regras aprendidas: "PIX MARIA SOUZA" (saída) -> lançar como Manutenção, centro Logística.
create table if not exists public.fin_assist_regras (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  chave text not null,
  direcao text not null check (direcao in ('entrada','saida')),
  acao text not null check (acao in ('lancar','transferencia','ignorar')),
  descricao text, nome text,
  categoria_id uuid references public.fin_categorias(id) on delete set null,
  centro_custo_id uuid references public.fin_centros_custo(id) on delete set null,
  conta_destino uuid references public.fin_contas(id) on delete set null,
  exemplo text,
  usos integer not null default 1,
  ultimo_uso timestamptz not null default now(),
  criado_por uuid, created_at timestamptz not null default now(),
  unique (empresa_id, chave, direcao)
);

do $$ declare t text; begin foreach t in array array['fin_extrato_lotes','fin_extrato_modelos','fin_assist_regras'] loop
  execute format('alter table public.%I enable row level security', t);
  execute format('drop policy if exists fin_ler on public.%I', t);
  execute format('create policy fin_ler on public.%I for select to authenticated using (public.eh_membro_empresa(empresa_id) and public.fin_pode(empresa_id, %L))', t, 'financeiro.fluxo.visualizar');
  execute format('drop policy if exists seguranca_2fa on public.%I', t);
  execute format('create policy seguranca_2fa on public.%I as restrictive for all to authenticated using ((select public.seguranca_2fa_ok())) with check ((select public.seguranca_2fa_ok()))', t);
end loop; end $$;
grant select on public.fin_extrato_lotes, public.fin_extrato_modelos, public.fin_assist_regras to authenticated;
-- Regras podem ser apagadas pela tela ("esquecer esta regra").
drop policy if exists fin_apagar on public.fin_assist_regras;
create policy fin_apagar on public.fin_assist_regras for delete to authenticated using (public.eh_membro_empresa(empresa_id) and public.fin_pode(empresa_id, 'financeiro.fluxo.editar'));
grant delete on public.fin_assist_regras to authenticated;

-- Chave de comparação de uma descrição de extrato: sem acento, sem números, sem pontuação.
create or replace function public.fin_assist_chave(p_texto text)
returns text language sql immutable as $$
  select left(trim(regexp_replace(regexp_replace(regexp_replace(
           translate(lower(coalesce(p_texto,'')), 'áàâãäéèêëíìîïóòôõöúùûüçñ', 'aaaaaeeeeiiiiooooouuuucn'),
           '[0-9]+', ' ', 'g'), '[^a-z ]+', ' ', 'g'), '\s+', ' ', 'g')), 60);
$$;

-- Importa as linhas de um extrato num lote. Linhas com o mesmo fitid na conta não entram de novo.
create or replace function public.fin_importar_extrato_lote(p_empresa uuid, p_conta uuid, p_linhas jsonb, p_lote jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_lote uuid; v_n int; v_total int;
begin
  if not fin_pode(p_empresa, 'financeiro.fluxo.editar') then raise exception 'Sem permissão' using errcode = '42501'; end if;
  if not exists (select 1 from fin_contas where id = p_conta and empresa_id = p_empresa) then raise exception 'Conta inválida'; end if;
  if jsonb_typeof(p_linhas) <> 'array' then raise exception 'Linhas inválidas'; end if;
  v_total := jsonb_array_length(p_linhas);
  insert into fin_extrato_lotes(empresa_id, conta_id, arquivo_nome, formato, banco_detectado, periodo_ini, periodo_fim, linhas, saldo_banco, saldo_data, criado_por)
  values (p_empresa, p_conta, left(p_lote->>'arquivo', 200), left(p_lote->>'formato', 20), left(p_lote->>'banco', 120),
          nullif(p_lote->>'periodo_ini','')::date, nullif(p_lote->>'periodo_fim','')::date, v_total,
          nullif(p_lote->>'saldo_banco','')::numeric, nullif(p_lote->>'saldo_data','')::date, auth.uid())
  returning id into v_lote;
  with ins as (
    insert into fin_extrato(empresa_id, conta_id, fitid, data, valor, descricao, documento, contraparte, contraparte_doc, saldo, lote_id)
    select p_empresa, p_conta, left(x->>'fitid', 200), (x->>'data')::date, round((x->>'valor')::numeric, 2), left(x->>'descricao', 300),
           left(nullif(x->>'documento',''), 80), left(nullif(x->>'contraparte',''), 160), left(regexp_replace(coalesce(x->>'contraparte_doc',''), '\D', '', 'g'), 20),
           nullif(x->>'saldo','')::numeric, v_lote
      from jsonb_array_elements(p_linhas) x
     where coalesce(x->>'fitid','') <> '' and coalesce(x->>'data','') <> '' and coalesce((x->>'valor')::numeric, 0) <> 0
    on conflict (conta_id, fitid) do nothing returning 1)
  select count(*) into v_n from ins;
  update fin_extrato_lotes set novas = v_n where id = v_lote;
  update fin_extrato set contraparte_doc = null where lote_id = v_lote and contraparte_doc = '';
  perform fin_auditar(p_empresa, 'fin_extrato_lotes', v_lote, 'importacao', null, jsonb_build_object('linhas', v_total, 'novas', v_n), p_lote->>'arquivo');
  return jsonb_build_object('lote_id', v_lote, 'novas', v_n, 'total', v_total);
end $$;

-- Saldo do sistema numa conta ao fim de um dia (para comparar com o saldo do banco).
create or replace function public.fin_saldo_em(p_empresa uuid, p_conta uuid, p_data date)
returns numeric language sql stable security definer set search_path = public as $$
  select c.saldo_inicial + coalesce((select sum(case when m.direcao = 'entrada' then m.valor else -m.valor end) from fin_movimentos m
          where m.conta_id = c.id and m.cancelado_em is null and m.data >= c.saldo_inicial_data and m.data <= p_data), 0)
    from fin_contas c where c.id = p_conta and c.empresa_id = p_empresa and public.fin_pode(p_empresa, 'financeiro.fluxo.visualizar');
$$;

-- Aprende uma regra a partir de uma linha confirmada.
create or replace function public.fin_assist_aprender_(p_empresa uuid, e fin_extrato, p_acao text, p_dados jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare v_chave text := fin_assist_chave(coalesce(nullif(e.contraparte,''), e.descricao)); v_dir text := case when e.valor > 0 then 'entrada' else 'saida' end;
begin
  if length(v_chave) < 3 then return; end if;
  insert into fin_assist_regras(empresa_id, chave, direcao, acao, descricao, nome, categoria_id, centro_custo_id, conta_destino, exemplo, criado_por)
  values (p_empresa, v_chave, v_dir, p_acao, nullif(p_dados->>'descricao',''), nullif(p_dados->>'nome',''),
          nullif(p_dados->>'categoria_id','')::uuid, nullif(p_dados->>'centro_custo_id','')::uuid, nullif(p_dados->>'conta_id','')::uuid,
          left(coalesce(e.descricao,'') || coalesce(' · ' || e.contraparte, ''), 200), auth.uid())
  on conflict (empresa_id, chave, direcao) do update set
    acao = excluded.acao, descricao = excluded.descricao, nome = excluded.nome, categoria_id = excluded.categoria_id,
    centro_custo_id = excluded.centro_custo_id, conta_destino = excluded.conta_destino, exemplo = excluded.exemplo,
    usos = fin_assist_regras.usos + 1, ultimo_uso = now();
end $$;

-- Aplica a ação confirmada numa linha do extrato.
--  baixar:        {"tipo":"baixar","titulos":[{"tipo":"receber","id":"…","valor":100}], "categoria_id", "centro_custo_id"}
--  transferencia: {"tipo":"transferencia","conta_id":"<outra conta>","grupo":"<transferência já registrada>"?, "par_extrato":"<linha da outra conta>"?}
--  lancar:        {"tipo":"lancar","descricao","nome","categoria_id","centro_custo_id"}
--  ignorar:       {"tipo":"ignorar"}
create or replace function public.fin_assist_aplicar(p_empresa uuid, p_extrato uuid, p_acao jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare e fin_extrato%rowtype; v_tipo text := p_acao->>'tipo'; t jsonb; v_soma numeric := 0; v_n int := 0; v_baixa uuid;
        v_tt text; v_id uuid; v_aberto numeric; v_valor numeric; v_cat uuid; v_cc uuid; v_g uuid; v_outra uuid; v_par fin_extrato%rowtype;
        v_desc text; v_tipo_cat text;
begin
  if not fin_pode(p_empresa, 'financeiro.fluxo.editar') then raise exception 'Sem permissão' using errcode = '42501'; end if;
  select * into e from fin_extrato where id = p_extrato and empresa_id = p_empresa for update;
  if not found then raise exception 'Linha do extrato não encontrada'; end if;
  if e.baixa_id is not null or e.transferencia_grupo is not null or e.conciliado_em is not null then raise exception 'Esta linha já foi conciliada'; end if;
  v_cat := nullif(p_acao->>'categoria_id','')::uuid; v_cc := nullif(p_acao->>'centro_custo_id','')::uuid;
  if v_cat is not null and not exists (select 1 from fin_categorias where id = v_cat and empresa_id = p_empresa) then raise exception 'Categoria inválida'; end if;
  if v_cc is not null and not exists (select 1 from fin_centros_custo where id = v_cc and empresa_id = p_empresa) then raise exception 'Centro de custo inválido'; end if;

  if v_tipo = 'baixar' then
    if jsonb_typeof(p_acao->'titulos') <> 'array' or jsonb_array_length(p_acao->'titulos') = 0 then raise exception 'Escolha o título'; end if;
    for t in select * from jsonb_array_elements(p_acao->'titulos') loop
      v_tt := t->>'tipo'; v_id := (t->>'id')::uuid; v_valor := round(coalesce((t->>'valor')::numeric, 0), 2);
      if v_tt not in ('receber','pagar') then raise exception 'Tipo de título inválido'; end if;
      if (v_tt = 'receber') <> (e.valor > 0) then raise exception 'Entrada no extrato só baixa conta a receber, e saída só conta a pagar'; end if;
      if v_tt = 'receber' then select aberto into v_aberto from fin_receber where id = v_id and empresa_id = p_empresa;
      else select aberto into v_aberto from fin_pagar where id = v_id and empresa_id = p_empresa; end if;
      if v_aberto is null then raise exception 'Título não encontrado'; end if;
      if v_valor <= 0 then v_valor := least(abs(e.valor) - v_soma, v_aberto); end if;
      v_soma := v_soma + v_valor; v_n := v_n + 1;
    end loop;
    if v_soma > abs(e.valor) + 0.01 then raise exception 'A soma dos títulos (%) passa do valor do extrato (%)', v_soma, abs(e.valor); end if;
    if v_n > 1 and abs(v_soma - abs(e.valor)) > 0.01 then raise exception 'A soma dos títulos (%) precisa ser igual ao valor do extrato (%)', v_soma, abs(e.valor); end if;
    v_soma := 0;
    for t in select * from jsonb_array_elements(p_acao->'titulos') loop
      v_tt := t->>'tipo'; v_id := (t->>'id')::uuid; v_valor := round(coalesce((t->>'valor')::numeric, 0), 2);
      if v_tt = 'receber' then select aberto into v_aberto from fin_receber where id = v_id; else select aberto into v_aberto from fin_pagar where id = v_id; end if;
      if v_valor <= 0 then v_valor := least(abs(e.valor) - v_soma, v_aberto); end if;
      v_soma := v_soma + v_valor;
      v_baixa := fin_baixar_(p_empresa, v_tt, v_id, e.data, v_valor, 0, 0, 0, 0, e.conta_id, 'Extrato', coalesce(e.descricao, 'Conciliação'), 'conciliacao', e.id);
      -- classificação para a DRE: completa o que o título não tinha
      if v_tt = 'receber' then
        update fin_receber set centro_custo_id = coalesce(centro_custo_id, v_cc),
               categoria_id = case when v_cat is not null and (categoria_id is null or categoria_id = fin_categoria(p_empresa,'outras_receitas')) and (select tipo from fin_categorias where id = v_cat) = 'entrada' then v_cat else categoria_id end
         where id = v_id;
      else
        update fin_pagar set centro_custo_id = coalesce(centro_custo_id, v_cc),
               categoria_id = case when v_cat is not null and (categoria_id is null or categoria_id = fin_categoria(p_empresa,'outras_despesas')) and (select tipo from fin_categorias where id = v_cat) = 'saida' then v_cat else categoria_id end
         where id = v_id;
      end if;
    end loop;

  elsif v_tipo = 'transferencia' then
    v_outra := nullif(p_acao->>'conta_id','')::uuid;
    v_g := nullif(p_acao->>'grupo','')::uuid;
    if v_g is not null then
      -- transferência já registrada no sistema (ex.: lançada ao conciliar a outra conta): só vincula
      if not exists (select 1 from fin_movimentos where transferencia_grupo = v_g and empresa_id = p_empresa and conta_id = e.conta_id and cancelado_em is null
                       and direcao = case when e.valor > 0 then 'entrada' else 'saida' end and abs(valor - abs(e.valor)) <= 0.01) then
        raise exception 'Transferência não encontrada nesta conta';
      end if;
      if exists (select 1 from fin_extrato where transferencia_grupo = v_g and conta_id = e.conta_id and id <> e.id) then raise exception 'Essa transferência já está ligada a outra linha'; end if;
    else
      if v_outra is null or v_outra = e.conta_id or not exists (select 1 from fin_contas where id = v_outra and empresa_id = p_empresa) then raise exception 'Escolha a outra conta da transferência'; end if;
      v_g := gen_random_uuid();
      v_desc := coalesce(nullif(p_acao->>'descricao',''), 'Transferência entre contas');
      insert into fin_movimentos(empresa_id, tipo, direcao, data, descricao, valor, conta_id, transferencia_grupo, criado_por) values
        (p_empresa, 'transferencia', case when e.valor > 0 then 'entrada' else 'saida' end, e.data, v_desc, abs(e.valor), e.conta_id, v_g, auth.uid()),
        (p_empresa, 'transferencia', case when e.valor > 0 then 'saida' else 'entrada' end, e.data, v_desc, abs(e.valor), v_outra, v_g, auth.uid());
      if nullif(p_acao->>'par_extrato','') is not null then
        select * into v_par from fin_extrato where id = (p_acao->>'par_extrato')::uuid and empresa_id = p_empresa and conta_id = v_outra for update;
        if found and v_par.baixa_id is null and v_par.transferencia_grupo is null and v_par.conciliado_em is null and abs(v_par.valor + e.valor) <= 0.01 then
          update fin_extrato set transferencia_grupo = v_g, conciliado_em = now(), conciliado_por = auth.uid(),
                 conciliado_acao = jsonb_build_object('tipo','transferencia','conta_id', e.conta_id, 'grupo', v_g) where id = v_par.id;
        end if;
      end if;
    end if;
    update fin_extrato set transferencia_grupo = v_g where id = e.id;
    perform fin_auditar(p_empresa, 'transferencia', v_g, 'conciliacao', null, jsonb_build_object('extrato', e.id, 'valor', e.valor), e.descricao);
    perform fin_assist_aprender_(p_empresa, e, 'transferencia', jsonb_build_object('conta_id', v_outra));

  elsif v_tipo = 'lancar' then
    v_tipo_cat := case when e.valor > 0 then 'entrada' else 'saida' end;
    if v_cat is not null and (select tipo from fin_categorias where id = v_cat) <> v_tipo_cat then raise exception 'A categoria não combina com % no extrato', case when e.valor > 0 then 'entrada' else 'saída' end; end if;
    v_desc := coalesce(nullif(trim(p_acao->>'descricao'),''), e.descricao, 'Lançamento do extrato');
    if e.valor > 0 then
      insert into fin_receber(empresa_id, origem, cliente_nome, descricao, emissao, competencia, vencimento, valor, conta_id, conta_manual, categoria_id, centro_custo_id, observacoes, criado_por)
      values (p_empresa, 'conciliacao', nullif(trim(p_acao->>'nome'),''), v_desc, e.data, e.data, e.data, abs(e.valor), e.conta_id, true,
              coalesce(v_cat, fin_categoria(p_empresa,'outras_receitas')), v_cc, 'Lançado pela conciliação (assistente)', auth.uid()) returning id into v_id;
      v_tt := 'receber';
    else
      insert into fin_pagar(empresa_id, origem, fornecedor_nome, descricao, emissao, competencia, vencimento, valor, conta_id, categoria_id, centro_custo_id, observacoes, criado_por)
      values (p_empresa, 'conciliacao', nullif(trim(p_acao->>'nome'),''), v_desc, e.data, e.data, e.data, abs(e.valor), e.conta_id,
              coalesce(v_cat, fin_categoria(p_empresa,'outras_despesas')), v_cc, 'Lançado pela conciliação (assistente)', auth.uid()) returning id into v_id;
      v_tt := 'pagar';
    end if;
    v_baixa := fin_baixar_(p_empresa, v_tt, v_id, e.data, abs(e.valor), 0, 0, 0, 0, e.conta_id, 'Extrato', v_desc, 'conciliacao', e.id);
    perform fin_assist_aprender_(p_empresa, e, 'lancar', p_acao);

  elsif v_tipo = 'ignorar' then
    update fin_extrato set ignorado = true where id = e.id;
    perform fin_assist_aprender_(p_empresa, e, 'ignorar', p_acao);
  else
    raise exception 'Ação inválida';
  end if;

  update fin_extrato set conciliado_em = now(), conciliado_por = auth.uid(), conciliado_acao = p_acao where id = e.id;
  return jsonb_build_object('ok', true, 'tipo', v_tipo);
end $$;

-- Desfaz a conciliação de uma linha: estorna as baixas dela (e cancela o título que ela mesma lançou),
-- cancela a transferência que ela criou, ou volta a linha ignorada.
create or replace function public.fin_assist_desfazer(p_empresa uuid, p_extrato uuid)
returns void language plpgsql security definer set search_path = public as $$
declare e fin_extrato%rowtype; b record;
begin
  if not fin_pode(p_empresa, 'financeiro.fluxo.editar') then raise exception 'Sem permissão' using errcode = '42501'; end if;
  select * into e from fin_extrato where id = p_extrato and empresa_id = p_empresa for update;
  if not found then raise exception 'Linha não encontrada'; end if;
  for b in select * from fin_baixas where extrato_id = e.id and estornado_em is null loop
    update fin_baixas set estornado_em = now(), estornado_por = auth.uid(), estorno_motivo = 'Conciliação desfeita' where id = b.id;
    update fin_movimentos set cancelado_em = now() where baixa_id = b.id;
    if b.tipo = 'receber' then
      update fin_receber set recebido = greatest(recebido - b.valor, 0), status = case when recebido - b.valor <= 0.005 then 'aberto' else 'parcial' end where id = b.receber_id and status <> 'cancelado';
      update fin_receber set status = 'cancelado', cancelado_em = now(), cancelado_por = auth.uid(), cancelamento_motivo = 'Conciliação desfeita'
       where id = b.receber_id and origem = 'conciliacao' and recebido = 0;
    else
      update fin_pagar set pago = greatest(pago - b.valor, 0), status = case when pago - b.valor > 0.005 then 'parcial' when programado_para is not null then 'programado' when aprovacao = 'aprovada' then 'aprovado' else 'pendente' end where id = b.pagar_id and status <> 'cancelado';
      update fin_pagar set status = 'cancelado', cancelado_em = now(), cancelado_por = auth.uid(), cancelamento_motivo = 'Conciliação desfeita'
       where id = b.pagar_id and origem = 'conciliacao' and pago = 0;
    end if;
  end loop;
  if e.transferencia_grupo is not null then
    -- só cancela os movimentos se foi ESTA linha que criou a transferência (sem 'grupo' na ação)
    if coalesce(e.conciliado_acao->>'grupo','') = '' then
      update fin_movimentos set cancelado_em = now() where transferencia_grupo = e.transferencia_grupo;
      update fin_extrato set transferencia_grupo = null, conciliado_em = null, conciliado_por = null, conciliado_acao = null
       where transferencia_grupo = e.transferencia_grupo and id <> e.id;
    end if;
  end if;
  update fin_extrato set baixa_id = null, ignorado = false, transferencia_grupo = null, conciliado_em = null, conciliado_por = null, conciliado_acao = null where id = e.id;
  perform fin_auditar(p_empresa, 'fin_extrato', e.id, 'conciliacao_desfeita', to_jsonb(e), null, e.descricao);
end $$;

-- Classificação em lote para a DRE (sugerida pela assistente, confirmada pela pessoa).
create or replace function public.fin_assist_classificar(p_empresa uuid, p_itens jsonb)
returns integer language plpgsql security definer set search_path = public as $$
declare x jsonb; v_n int := 0; v_cat uuid; v_cc uuid; v_id uuid;
begin
  if jsonb_typeof(p_itens) <> 'array' then raise exception 'Itens inválidos'; end if;
  for x in select * from jsonb_array_elements(p_itens) loop
    v_id := (x->>'id')::uuid; v_cat := nullif(x->>'categoria_id','')::uuid; v_cc := nullif(x->>'centro_custo_id','')::uuid;
    if v_cc is not null and not exists (select 1 from fin_centros_custo where id = v_cc and empresa_id = p_empresa) then continue; end if;
    if x->>'tipo' = 'receber' then
      if not fin_pode(p_empresa, 'financeiro.contas_receber.editar') then raise exception 'Sem permissão' using errcode = '42501'; end if;
      if v_cat is not null and not exists (select 1 from fin_categorias where id = v_cat and empresa_id = p_empresa and tipo = 'entrada') then v_cat := null; end if;
      update fin_receber set categoria_id = coalesce(v_cat, categoria_id), centro_custo_id = coalesce(v_cc, centro_custo_id) where id = v_id and empresa_id = p_empresa and status <> 'cancelado';
    elsif x->>'tipo' = 'pagar' then
      if not fin_pode(p_empresa, 'financeiro.contas_pagar.editar') then raise exception 'Sem permissão' using errcode = '42501'; end if;
      if v_cat is not null and not exists (select 1 from fin_categorias where id = v_cat and empresa_id = p_empresa and tipo = 'saida') then v_cat := null; end if;
      update fin_pagar set categoria_id = coalesce(v_cat, categoria_id), centro_custo_id = coalesce(v_cc, centro_custo_id) where id = v_id and empresa_id = p_empresa and status <> 'cancelado';
    else continue; end if;
    if found then v_n := v_n + 1; end if;
  end loop;
  perform fin_auditar(p_empresa, 'dre', null, 'classificacao', null, jsonb_build_object('itens', v_n), 'Classificação pela assistente');
  return v_n;
end $$;

-- DRE por centro de custo.
create or replace function public.fin_dre_centros(p_empresa uuid, p_ini date, p_fim date)
returns table(centro_id uuid, centro text, tipo text, categoria_id uuid, codigo text, categoria text, previsto numeric, realizado numeric)
language plpgsql stable security definer set search_path = public as $$
begin
  if not fin_pode(p_empresa, 'financeiro.fluxo.visualizar') then raise exception 'Sem permissão' using errcode = '42501'; end if;
  return query
  with t as (
    select r.centro_custo_id cc, r.categoria_id cat, 'entrada'::text tp, r.valor prev, r.recebido real from fin_receber r where r.empresa_id = p_empresa and r.status <> 'cancelado' and coalesce(r.competencia, r.vencimento) between p_ini and p_fim
    union all
    select g.centro_custo_id, g.categoria_id, 'saida', g.valor, g.pago from fin_pagar g where g.empresa_id = p_empresa and g.status <> 'cancelado' and coalesce(g.competencia, g.vencimento) between p_ini and p_fim)
  select t.cc, coalesce(cc.nome, 'Sem centro de custo'), t.tp, t.cat, c.codigo, coalesce(c.nome, 'Sem categoria'), sum(t.prev)::numeric, sum(t.real)::numeric
    from t left join fin_centros_custo cc on cc.id = t.cc left join fin_categorias c on c.id = t.cat
   group by t.cc, cc.nome, t.tp, t.cat, c.codigo, c.nome
   order by cc.nome nulls last, t.tp, c.codigo nulls last;
end $$;

revoke all on function public.fin_assist_aprender_(uuid, fin_extrato, text, jsonb) from public, anon, authenticated;
revoke all on function public.fin_importar_extrato_lote(uuid, uuid, jsonb, jsonb), public.fin_assist_aplicar(uuid, uuid, jsonb),
  public.fin_assist_desfazer(uuid, uuid), public.fin_assist_classificar(uuid, jsonb), public.fin_dre_centros(uuid, date, date),
  public.fin_saldo_em(uuid, uuid, date) from public, anon;
grant execute on function public.fin_importar_extrato_lote(uuid, uuid, jsonb, jsonb), public.fin_assist_aplicar(uuid, uuid, jsonb),
  public.fin_assist_desfazer(uuid, uuid), public.fin_assist_classificar(uuid, jsonb), public.fin_dre_centros(uuid, date, date),
  public.fin_saldo_em(uuid, uuid, date), public.fin_assist_chave(text) to authenticated;
