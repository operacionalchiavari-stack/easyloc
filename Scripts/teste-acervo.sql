-- Dados de teste da Gestão do acervo (16/11/2026, pedido do usuário: "coloque dados dentro de gestão de acervo em
-- todas as abas pra eu ver o funcionamento"). Painel do acervo, Próximas saídas e Divergências já tinham dados
-- (lote DEMO-SISTEMA-20261114 e testes anteriores); este script completa as que estavam vazias:
--  * Separação: 5 problemas em aberto (3 esperando o Acervo, 1 com o Comercial, 1 com a solução na Triagem),
--    nos pedidos de demonstração 3021, 3022, 3024, 3025 e 3027.
--  * Inventário e qualidade: 1ª contagem cega de parte do inventário geral em andamento (Bancos, Objetos,
--    Decoração, Mobiliário e metade das Cadeiras), com faltas, sobras, revisão e capa.
-- Tudo fica anotado em sistema_demo_lotes ('TESTE-ACERVO-20261116'). Apagar: Scripts/remover-teste-acervo.sql
do $$
declare
  e uuid := 'bb1260f0-99cd-4d17-ab9b-23c299b4c50b';
  marca text := 'TESTE-ACERVO-20261116';
  eu uuid := '02dd55da-3e30-4a96-8743-04f33b21a954';
  inv uuid;
  ocs uuid[] := '{}';
  itens_inv uuid[] := '{}';
  r record; l record; c record;
  n int := 0;
  novo uuid;
  qtd numeric;
  hist jsonb;
begin
  if exists (select 1 from sistema_demo_lotes where id = marca) then
    raise notice 'Já existe: rode o script de remoção antes.'; return; end if;

  -- ===== Separação: problemas reportados na triagem =====
  for r in
    select * from (values
      ('3021', 'Mesa de jantar',     'Item danificado', 1, 'acervo',
       'Problema: tampo da mesa com risco profundo e lascado na borda.' || chr(10) ||
       'Identificado: na hora da separação.' || chr(10) ||
       'Verificações realizadas: conferimos as outras 3 mesas, estão boas.' || chr(10) ||
       'Solução sugerida pela equipe: trocar por outra mesa igual ou mandar para o reparo.', interval '3 hours', ''),
      ('3022', 'Cadeira de madeira', 'Item não encontrado', 1, 'acervo',
       'Problema: só encontramos 2 das 3 cadeiras no setor.' || chr(10) ||
       'Verificações realizadas: procuramos no corredor B e na área de retorno.' || chr(10) ||
       'Solução sugerida pela equipe: conferir se ficou no último evento.', interval '1 hour', ''),
      ('3024', 'Banco estofado',     'Componente faltando', 1, 'acervo',
       'Problema: falta a almofada do assento de um dos bancos.' || chr(10) ||
       'Verificações realizadas: procuramos nas caixas de capas e de almofadas.' || chr(10) ||
       'Solução sugerida pela equipe: costurar uma almofada nova ou trocar o banco.', interval '30 minutes', ''),
      ('3025', 'Mesa de jantar',     'Quantidade insuficiente', 1, 'comercial',
       'Problema: o pedido tem 3 mesas e só temos 2 livres em bom estado (a outra está no reparo).' || chr(10) ||
       'Solução sugerida pela equipe: falar com a cliente para trocar por outro modelo.', interval '1 day',
       'Não temos outra mesa igual livre nessa data. Comercial, por favor, ofereça a mesa Carvalho no lugar.'),
      ('3027', 'Banco estofado',     'Item danificado', 1, 'triagem',
       'Problema: tecido do assento manchado.' || chr(10) ||
       'Solução sugerida pela equipe: limpeza do estofado antes de sair.', interval '2 days',
       'Limpeza feita na sexta. O banco já está no setor de estofados, pode separar.')
    ) as v(num, prod, motivo_nome, qtd, estado, obs, ha, resposta)
  loop
    select s.id linha, s.item_id, p.id pedido into l
      from separacoes_pedidos p join separacoes_itens s on s.separacao_pedido_id = p.id join itens i on i.id = s.item_id
     where p.empresa_id = e and p.numero_pedido = r.num and i.produto = r.prod limit 1;
    if l.linha is null then raise exception 'Linha não encontrada: % %', r.num, r.prod; end if;
    hist := jsonb_build_array(jsonb_build_object('acao', 'reportar', 'em', now() - r.ha, 'por', eu, 'texto', r.obs));
    if r.estado <> 'acervo' then
      hist := hist || jsonb_build_array(jsonb_build_object('acao', r.estado, 'anterior', 'acervo',
        'em', now() - r.ha + interval '20 minutes', 'por', eu, 'texto', r.resposta));
    end if;
    insert into separacao_ocorrencias(empresa_id, pedido_id, linha_id, item_id, motivo_id, motivo_nome, quantidade,
        observacao, estado, criado_por, criado_em, atualizado_em, historico, fotos_paths)
    values (e, l.pedido, l.linha, l.item_id,
        (select id from logistica_motivos where empresa_id = e and etapa = 'separacao' and nome = r.motivo_nome),
        r.motivo_nome, r.qtd, r.obs, r.estado, eu, now() - r.ha, now() - r.ha + interval '20 minutes', hist, '[]')
    returning id into novo;
    ocs := ocs || novo;
  end loop;

  -- ===== Inventário e qualidade: parte da 1ª contagem cega =====
  select id into inv from acervo_inventarios where empresa_id = e and status = 'contagem' order by criado_em desc limit 1;
  if inv is not null then
    for c in
      select i.item_id, i.saldo_base, it.categoria,
             row_number() over (partition by it.categoria order by it.produto) rn
        from acervo_inventario_itens i join itens it on it.id = i.item_id
       where i.inventario_id = inv and i.primeira_contagens = '{}'::jsonb
         and it.categoria in ('Bancos', 'Objetos', 'Decoração', 'Mobiliário', 'Cadeiras')
    loop
      if c.categoria = 'Cadeiras' and c.rn % 2 = 0 then continue; end if;
      n := n + 1;
      qtd := case
        when n % 7 = 3 then greatest(c.saldo_base - 1, 0)   -- falta 1
        when n % 11 = 5 then c.saldo_base + 1               -- sobra 1
        else c.saldo_base end;
      update acervo_inventario_itens set
        primeira_contagens = jsonb_build_object(
          'qtd', qtd,
          'revisao', case when n % 5 = 2 and qtd > 0 then 1 else 0 end,
          'capa', case when n % 3 = 0 then qtd else greatest(qtd - 1, 0) end,
          'fazer_capa', case when n % 4 = 1 and qtd > 0 then 1 else 0 end),
        primeira_contado_por = eu,
        primeira_contado_em = now() - (n || ' minutes')::interval,
        versao = coalesce(versao, 1) + 1
      where inventario_id = inv and item_id = c.item_id;
      itens_inv := itens_inv || c.item_id;
    end loop;
  end if;

  insert into sistema_demo_lotes(id, empresa_id, manifesto)
  values (marca, e, jsonb_build_object('separacao_ocorrencias', to_jsonb(ocs), 'inventario', inv,
                                       'inventario_itens', to_jsonb(itens_inv)));
  raise notice 'Criado: % ocorrências, % itens contados', array_length(ocs, 1), coalesce(array_length(itens_inv, 1), 0);
end $$;
