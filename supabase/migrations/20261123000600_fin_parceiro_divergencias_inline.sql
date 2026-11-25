-- Identidade do lancamento para resolver a divergencia na propria linha, sem casar por valor ou descricao.
create or replace function public.fin_parceiro_movimentos(p_empresa uuid,p_fornecedor uuid) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare hoje date:=(now() at time zone 'America/Sao_Paulo')::date; aguardando jsonb; pagos jsonb;
begin
  if auth.uid() is null or not coalesce(eh_membro_empresa(p_empresa),false) or not coalesce(seguranca_2fa_ok(),false)
     or not coalesce(operacao_pode(p_empresa,'financeiro.fluxo.visualizar'),false) then
    raise exception 'Sem permissão' using errcode='42501';
  end if;
  with fret as (select id from frete_freteiros where empresa_id=p_empresa and fornecedor_id=p_fornecedor),
  itens as (
    -- 1) fretes do sistema (anúncio aceito pelo freteiro deste fornecedor)
    select a.data,a.hora,jsonb_build_object('tipo','frete','frete_lancamento_id',l.id,'data',a.data,'hora',to_char(a.hora,'HH24:MI'),
      'pedido',p.numero_pedido,'cliente',p.cliente_nome,'cliente_foto',(select c.catalogo_logo_url from clientes_empresas c where c.id=p.cliente_id),
      'direcao',a.direcao,'caminhao',coalesce(nullif(l.caminhao,''),(select string_agg(trim(concat_ws(' · ',coalesce(nullif(k.modelo,''),k.codigo),nullif(k.placa,''))),', ') from caminhoes k where k.freteiro_id=a.freteiro_id)),'divergencia',case when l.situacao='divergente' then l.divergencia end,'local',coalesce(nullif(p.local_nome,''),a.destino),
      'descricao',case a.direcao when 'entrega' then 'Frete de entrega' when 'coleta' then 'Frete de coleta' else 'Frete' end,
      'valor_sistema',a.valor,'valor_cobrado',case when l.id is not null then frete_lanc_total(l) end,
      'situacao',case
        when l.id is null and a.data>hoje then 'agendado'
        when l.id is null then 'aguardando_envio'
        when l.relatorio_id is null then 'lancado_sem_envio'
        when l.situacao='divergente' then 'divergencia'
        else 'aguardando_fechamento' end) j
    from frete_anuncios a join fret on fret.id=a.freteiro_id
    left join separacoes_pedidos p on p.id=a.pedido_id
    left join lateral (select * from frete_lancamentos x where x.anuncio_id=a.id order by x.created_at desc limit 1) l on true
    where a.empresa_id=p_empresa and a.status='aceito' and (l.id is null or l.pagar_id is null)
    union all
    -- 2) fretes lançados pelo freteiro sem anúncio (avulso cadastrado pela Logística, ou que não existe no sistema)
    select l.data,null,jsonb_build_object('tipo','frete','frete_lancamento_id',l.id,'data',l.data,'pedido',(select p2.numero_pedido from separacoes_pedidos p2 where p2.id=l.pedido_id),
      'cliente',(select p2.cliente_nome from separacoes_pedidos p2 where p2.id=l.pedido_id),
      'cliente_foto',(select c.catalogo_logo_url from separacoes_pedidos p2 join clientes_empresas c on c.id=p2.cliente_id where p2.id=l.pedido_id),
      'direcao',l.direcao,'local',l.destino,
      'avulso',(select av.motivo from frete_avulsos av where av.id=l.avulso_id),
      'descricao','Frete lançado pelo freteiro (não está no sistema)','fora_sistema',l.avulso_id is null,'caminhao',nullif(l.caminhao,''),'divergencia',case when l.situacao='divergente' then coalesce(l.divergencia,'sem_frete') end,'valor_sistema',(select av.valor from frete_avulsos av where av.id=l.avulso_id),'valor_cobrado',frete_lanc_total(l),
      'situacao',case when l.relatorio_id is null then 'lancado_sem_envio' when l.situacao='divergente' then 'divergencia' else 'aguardando_fechamento' end)
    from frete_lancamentos l join fret on fret.id=l.freteiro_id
    where l.empresa_id=p_empresa and l.anuncio_id is null and l.pagar_id is null and coalesce(l.situacao,'')<>'recusado'
    union all
    -- 2b) frete avulso cadastrado pela Logística e ainda não lançado pelo freteiro
    select v.data,null,jsonb_build_object('tipo','frete','data',v.data,'pedido',null,'cliente',null,'local',v.destino,'origem',v.origem,
      'avulso',v.motivo,'valor_sistema',v.valor,'valor_cobrado',null,'caminhao',(select trim(concat_ws(' · ',coalesce(nullif(k.modelo,''),k.codigo),nullif(k.placa,''))) from caminhoes k where k.freteiro_id=v.freteiro_id limit 1),
      'situacao',case when v.data>hoje then 'agendado' else 'aguardando_envio' end)
    from frete_avulsos v join fret on fret.id=v.freteiro_id
    where v.empresa_id=p_empresa and v.cancelado_em is null and not exists (select 1 from frete_lancamentos q where q.avulso_id=v.id)
    union all
    -- 3) caminhão da transportadora escalado (ainda sem cobrança)
    select min(e.data),min(e.hora),jsonb_build_object('tipo','transportadora','data',min(e.data),'hora',to_char(min(e.hora),'HH24:MI'),
      'pedido',p.numero_pedido,'cliente',p.cliente_nome,'cliente_foto',(select c.catalogo_logo_url from clientes_empresas c where c.id=p.cliente_id),
      'direcao',frete_direcao(e.tipo),'caminhao',string_agg(distinct trim(concat_ws(' · ',k.codigo,nullif(k.placa,''))),', '),'local',p.local_nome,
      'descricao',case frete_direcao(e.tipo) when 'entrega' then 'Entrega' when 'coleta' then 'Coleta' else 'Frete' end||' · '||string_agg(distinct k.codigo,', '),
      'valor_sistema',null,'valor_cobrado',null,'situacao',case when min(e.data)>hoje then 'agendado' else 'aguardando_cobranca' end)
    from operacao_etapas e join operacao_etapa_caminhoes ec on ec.etapa_id=e.id
    join caminhoes k on k.id=ec.caminhao_id and k.fornecedor_id=p_fornecedor and k.freteiro_id is null
    join separacoes_pedidos p on p.id=e.pedido_id and coalesce(p.status_comercial,'')<>'cancelado'
    where e.empresa_id=p_empresa and e.data>=hoje-90 and frete_direcao(e.tipo) is not null
    group by e.pedido_id,frete_direcao(e.tipo),p.numero_pedido,p.cliente_nome,p.local_nome,p.cliente_id
    union all
    -- 4) contas a pagar ainda não pagas deste parceiro
    select fp.vencimento,null,jsonb_build_object('tipo','conta','tipo_servico',fp.origem,'titulo_id',fp.id,'frete_lancamento_id',l.id,
      'data',coalesce(l.data,fp.competencia,fp.emissao,fp.vencimento),'hora',to_char(a.hora,'HH24:MI'),'documento',fp.documento,
      'pedido_id',p.id,'pedido',p.numero_pedido,'cliente',p.cliente_nome,'cliente_foto',c.catalogo_logo_url,
      'direcao',coalesce(l.direcao,a.direcao),'origem',l.origem,'local',coalesce(l.destino,p.local_nome),
      'caminhao',nullif(l.caminhao,''),
      'descricao',coalesce(nullif(fp.descricao,''),fp.origem),'valor_sistema',null,'valor_cobrado',fp.valor,'vencimento',fp.vencimento,
      'aberto',coalesce(fp.aberto,fp.valor),'situacao',case when fp.aguardando_fechamento then 'conta_fechamento' else 'conta_aberta' end)
    from fin_pagar fp
    left join frete_lancamentos l on fp.origem='frete' and l.id=fp.origem_id and l.empresa_id=fp.empresa_id
    left join frete_anuncios a on a.id=l.anuncio_id and a.empresa_id=fp.empresa_id
    left join separacoes_pedidos p on p.id=case when fp.origem='sublocacao' then fp.origem_id else coalesce(a.pedido_id,l.pedido_id) end and p.empresa_id=fp.empresa_id
    left join clientes_empresas c on c.id=p.cliente_id and c.empresa_id=fp.empresa_id
    where fp.empresa_id=p_empresa and fp.fornecedor_id=p_fornecedor and fp.status<>'pago' and fp.cancelado_em is null
  )
  select coalesce(jsonb_agg(j order by data,hora nulls first),'[]'::jsonb) into aguardando from itens;

  select coalesce(jsonb_agg(jsonb_build_object('documento',fp.documento,'descricao',coalesce(nullif(fp.descricao,''),fp.origem),
      'origem',fp.origem,'vencimento',fp.vencimento,'valor',fp.valor,'pago',fp.pago,
      'pago_em',(select max(b.data) from fin_baixas b where b.pagar_id=fp.id and b.estornado_em is null),
      'forma',(select b.forma from fin_baixas b where b.pagar_id=fp.id and b.estornado_em is null order by b.data desc limit 1))
    order by (select max(b.data) from fin_baixas b where b.pagar_id=fp.id and b.estornado_em is null) desc nulls last),'[]'::jsonb)
    into pagos from fin_pagar fp where fp.empresa_id=p_empresa and fp.fornecedor_id=p_fornecedor and fp.status='pago' and fp.cancelado_em is null;
  return jsonb_build_object('aguardando',aguardando,'pagos',pagos);
end $$;
revoke all on function public.fin_parceiro_movimentos(uuid,uuid) from public,anon;
grant execute on function public.fin_parceiro_movimentos(uuid,uuid) to authenticated;
notify pgrst,'reload schema';
