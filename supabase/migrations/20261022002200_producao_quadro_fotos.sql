-- Out/2026 — Ordem de produção mais visual: cada item traz as fotos que a oficina precisa ver em tamanho grande.
--   item_nome  : nome completo do item no cadastro
--   fotos      : fotos do cadastro (principal, detalhes e ambientadas do catálogo padrão)
--   renders    : imagens 3D do ambiente do pedido onde o item vai (projeto do pedido comercial)
-- Mesma regra de acesso de antes; só acrescenta campos.
create or replace function producao_quadro(p_empresa uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare r jsonb;
begin
 if not eh_membro_empresa(p_empresa) or not (operacao_pode(p_empresa,'producao.ordens.visualizar') or operacao_pode(p_empresa,'estoque.almoxarifado.visualizar') or operacao_pode(p_empresa,'configuracoes.empresa.editar')) then raise exception 'Sem permissão para consultar produção' using errcode='42501';end if;
 select coalesce(jsonb_agg(to_jsonb(t)||jsonb_build_object('pedido',jsonb_build_object('numero',p.numero_pedido,'cliente',p.cliente_nome,'evento',p.data_evento,'entrega',p.data_entrega,'local',p.local_nome,'status',p.status_comercial),
  'foto',i.foto_url,
  'item_nome',coalesce(i.descricao_total,i.produto),
  'fotos',(select coalesce(jsonb_agg(jsonb_build_object('url',f.url,'tipo',f.tipo,'slot',f.slot,'titulo',f.titulo) order by f.slot,f.ordem),'[]')
            from itens_fotos f where f.item_id=i.id and f.empresa_id=p_empresa and f.cliente_id is null and coalesce(f.url,'')<>''),
  'renders',(select coalesce(jsonb_agg(jsonb_build_object('url',rd->>'url','origem',rd->>'origem')),'[]')
            from jsonb_array_elements(coalesce(p.observacoes->'projeto_comercial'->'dados'->'ambientes','[]')) a,
                 jsonb_array_elements(case when jsonb_typeof(a->'renders')='array' then a->'renders' else '[]'::jsonb end) rd
            where coalesce(a->>'id',a->>'nome')=coalesce(t.origem->>'ambiente_id',t.origem->>'ambiente') and coalesce(rd->>'url','')<>''),
  'etapas',(select coalesce(jsonb_agg(to_jsonb(e)||jsonb_build_object('materiais',(select coalesce(jsonb_agg(to_jsonb(m) order by m.nome),'[]') from producao_materiais m where m.etapa_id=e.id),
    'pacotes',(select coalesce(jsonb_agg(to_jsonb(pa) order by pa.created_at desc),'[]') from producao_pacotes pa where pa.etapa_id=e.id)) order by e.grupo,e.ordem),'[]') from producao_etapas e where e.producao_item_id=t.id and e.estado<>'cancelada'))
  order by t.urgente desc,t.inicio_previsto,t.id),'[]') into r
 from producao_itens t join separacoes_pedidos p on p.id=t.pedido_id
 left join itens i on i.id::text=t.origem->>'item_id' and i.empresa_id=p_empresa where t.empresa_id=p_empresa;
 return jsonb_build_object('itens',r,'config',producao_config(p_empresa),'executar',producao_permite(p_empresa,'executar'),
 'almox',operacao_pode(p_empresa,'estoque.almoxarifado.movimentar'),
 'responsavel',jsonb_build_object('pintura',producao_permite(p_empresa,'autorizar','pintura'),'forracao',producao_permite(p_empresa,'autorizar','forracao'),'personalizacao',producao_permite(p_empresa,'autorizar','personalizacao')));
end $$;
