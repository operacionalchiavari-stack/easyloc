-- Comentários por conta (modelo Tecnoweld) e consulta de Compras limitada à origem.
alter table public.fin_receber
  add column if not exists comentario text,
  add column if not exists comentario_por uuid,
  add column if not exists comentario_nome text,
  add column if not exists comentario_em timestamptz;
alter table public.fin_pagar
  add column if not exists comentario text,
  add column if not exists comentario_por uuid,
  add column if not exists comentario_nome text,
  add column if not exists comentario_em timestamptz;

-- Não amplia a leitura das tabelas financeiras. Compras recebe só as suas contas via RPC.
create or replace function public.fin_conta_de_compra(p_empresa uuid, p_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from fin_pagar t join compras_registros r
    on r.id = t.origem_id and r.empresa_id = t.empresa_id and r.tipo = 'pedido'
    where t.empresa_id = p_empresa and t.id = p_id and t.origem = 'compra');
$$;
revoke all on function public.fin_conta_de_compra(uuid, uuid) from public, anon, authenticated;

create or replace function public.fin_titulo_comentar(p_empresa uuid, p_tipo text, p_id uuid, p_texto text, p_versao timestamptz)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_txt text := nullif(btrim(coalesce(p_texto, '')), '');
  v_antes jsonb; v_depois jsonb; v_tabela text;
  v_fin boolean; v_extra boolean;
begin
  if auth.uid() is null or not eh_membro_empresa(p_empresa) or not seguranca_2fa_ok() then
    raise exception 'Sem acesso aos comentários.' using errcode = '42501';
  end if;
  if p_tipo is null or p_tipo not in ('receber', 'pagar') then raise exception 'Tipo inválido.'; end if;
  if length(coalesce(v_txt, '')) > 1000 then raise exception 'Comentário muito longo (até 1000 caracteres).'; end if;
  v_fin := fin_pode(p_empresa, 'financeiro.fluxo.visualizar');
  v_extra := case when p_tipo = 'receber' then operacao_pode(p_empresa, 'comercial.pedidos.visualizar')
                 else operacao_pode(p_empresa, 'estoque.compras.visualizar') and fin_conta_de_compra(p_empresa, p_id) end;
  if not coalesce(v_fin or v_extra, false) then
    raise exception 'Sem permissão para comentar esta conta.' using errcode = '42501';
  end if;
  v_tabela := case when p_tipo = 'receber' then 'fin_receber' else 'fin_pagar' end;
  execute format('select jsonb_build_object(''comentario'', comentario, ''comentario_por'', comentario_por, ''comentario_nome'', comentario_nome, ''comentario_em'', comentario_em) from public.%I where empresa_id = $1 and id = $2 for update', v_tabela)
    into v_antes using p_empresa, p_id;
  if v_antes is null then raise exception 'Conta não encontrada.'; end if;
  if (v_antes->>'comentario_em')::timestamptz is distinct from p_versao then
    raise exception 'Este comentário foi alterado por outra pessoa. Atualize a página antes de editar.' using errcode = '40001';
  end if;
  v_depois := jsonb_build_object('comentario', v_txt, 'comentario_por', case when v_txt is not null then auth.uid() end,
    'comentario_nome', case when v_txt is not null then coalesce(almox_nome_func(auth.uid()), 'Equipe') end,
    'comentario_em', case when v_txt is not null then clock_timestamp() end);
  execute format('update public.%I set comentario = $3->>''comentario'', comentario_por = ($3->>''comentario_por'')::uuid, comentario_nome = $3->>''comentario_nome'', comentario_em = ($3->>''comentario_em'')::timestamptz where empresa_id = $1 and id = $2', v_tabela)
    using p_empresa, p_id, v_depois;
  perform fin_auditar(p_empresa, v_tabela, p_id, 'comentario', v_antes, v_depois, null);
  return v_depois;
end $$;
revoke all on function public.fin_titulo_comentar(uuid, text, uuid, text, timestamptz) from public, anon;
grant execute on function public.fin_titulo_comentar(uuid, text, uuid, text, timestamptz) to authenticated;

create or replace function public.compras_contas_pagar(p_empresa uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_lista jsonb;
begin
  if auth.uid() is null or not eh_membro_empresa(p_empresa) or not seguranca_2fa_ok()
     or not operacao_pode(p_empresa, 'estoque.compras.visualizar') then
    raise exception 'Sem acesso às contas de Compras.' using errcode = '42501';
  end if;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.vencimento, x.id), '[]'::jsonb) into v_lista from (
    select t.*, r.numero compra_numero, cat.nome categoria_nome, cat.ativo categoria_ativa,
      c.nome conta_nome,
      case when c.titular_documento like 'cofre:%' then c.cofre_mascaras->>'titular_documento' else c.titular_documento end conta_doc,
      case when c.pix_chave like 'cofre:%' then c.cofre_mascaras->>'pix_chave' else c.pix_chave end conta_pix,
      f.foto_url fornecedor_foto, ct.nome cartao_nome, ct.final cartao_final,
      fa.virada fatura_virada, fa.conferida_em fatura_conferida_em,
      fp.numero fechamento_numero, fe.referencia fechamento_referencia, fe.nf_numero fechamento_nf_numero
    from fin_pagar t
    join compras_registros r on r.id = t.origem_id and r.empresa_id = t.empresa_id and r.tipo = 'pedido'
    left join fin_categorias cat on cat.id = t.categoria_id and cat.empresa_id = t.empresa_id
    left join fin_contas c on c.id = t.conta_id and c.empresa_id = t.empresa_id
    left join fornecedores f on f.id = t.fornecedor_id and f.empresa_id = t.empresa_id
    left join fin_cartoes ct on ct.id = t.cartao_id and ct.empresa_id = t.empresa_id
    left join fin_cartao_faturas fa on fa.id = t.fatura_id and fa.empresa_id = t.empresa_id
    left join fin_fechamento_parcelas fp on fp.id = t.fechamento_parcela_id and fp.empresa_id = t.empresa_id
    left join fin_fechamentos fe on fe.id = fp.fechamento_id and fe.empresa_id = t.empresa_id
    where t.empresa_id = p_empresa and t.origem = 'compra'
  ) x;
  return v_lista;
end $$;
revoke all on function public.compras_contas_pagar(uuid) from public, anon;
grant execute on function public.compras_contas_pagar(uuid) to authenticated;

-- Mesmos comentarios no Comercial, mantendo sua consulta e formato atuais.
create or replace function public.comercial_contas_receber(p_empresa uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare r jsonb;
begin
  if auth.uid() is null or not public.seguranca_2fa_ok() or not public.eh_membro_empresa(p_empresa) or not (public.operacao_pode(p_empresa, 'comercial.pedidos.visualizar') or public.operacao_pode(p_empresa, 'financeiro.fluxo.visualizar')) then
    raise exception 'Sem permissão';
  end if;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.vencimento, x.numero_pedido), '[]') into r from (
    select t.id, t.pedido_id, coalesce(p.numero_pedido, t.pedido_numero) numero_pedido, coalesce(p.cliente_id, t.cliente_id) cliente_id,
           coalesce(nullif(p.cliente_nome, ''), t.cliente_nome) cliente_nome, p.tipo_evento, p.data_evento, p.data_evento_fim, p.local_nome,
           p.data_entrega, p.data_coleta, p.valor_total valor_pedido,
           p.status_comercial, t.descricao, t.documento, t.componente, t.parcela, t.parcelas, t.vencimento, t.valor, t.recebido, t.aberto, t.status, t.comentario, t.comentario_por, t.comentario_nome, t.comentario_em,
           (select max(b.data) from fin_baixas b where b.receber_id = t.id and b.estornado_em is null) recebido_em,
           nullif(p.observacoes->>'equipe_id', '') equipe_id,
           coalesce(eq.nome, nullif(p.observacoes->>'equipe_nome', '')) equipe_nome,
           t.conta_id, c.nome conta_nome,
           case when c.titular_documento like 'cofre:%' then coalesce(c.cofre_mascaras->>'titular_documento', '••••') else c.titular_documento end conta_doc,
           case when c.pix_chave like 'cofre:%' then coalesce(c.cofre_mascaras->>'pix_chave', '••••') else c.pix_chave end conta_pix,
           ce.catalogo_logo_url cliente_foto
      from fin_receber t
      left join separacoes_pedidos p on p.id = t.pedido_id
      left join clientes_equipes eq on eq.id::text = p.observacoes->>'equipe_id' and eq.empresa_id = p_empresa
      left join fin_contas c on c.id = t.conta_id
      left join lateral (select x.catalogo_logo_url from clientes_empresas x
                          where x.empresa_id = p_empresa and (x.id = coalesce(p.cliente_id, t.cliente_id)
                             or lower(trim(x.nome_razao)) = lower(trim(coalesce(nullif(p.cliente_nome, ''), t.cliente_nome))))
                          order by (x.id = coalesce(p.cliente_id, t.cliente_id)) desc nulls last limit 1) ce on true
     where t.empresa_id = p_empresa and t.status <> 'cancelado') x;
  return r;
end $$;
