-- Pós-venda (15/11/2026): a tela da ligação mostra os últimos elogios e os últimos feedbacks negativos do cliente
-- ('historico': as 6 últimas ligações concluídas com respostas, observação e o resultado das conversas do WhatsApp).

create or replace function public.posvenda_contato_json(c posvenda_contatos)
 returns jsonb language sql stable security definer set search_path to 'public' as $function$
  select to_jsonb(c) - 'cliente_chave' || jsonb_build_object(
    'foto', (select e.catalogo_logo_url from clientes_empresas e where e.id = c.cliente_id),
    'pedidos', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'numero', p.numero_pedido, 'data_evento', p.data_evento, 'tipo', p.tipo_evento,
                  'local', p.local_nome, 'valor', p.valor_total,
                  'vendedor', case when p.criado_por is not null then jsonb_build_object('usuario_id', p.criado_por,
                      'nome', coalesce((select fa.nome from funcionarios_acesso fa where fa.id = p.criado_por and fa.empresa_id = p.empresa_id limit 1),
                                       (select u.nome from usuarios u where u.id = p.criado_por limit 1))) 
                       else (select jsonb_build_object('usuario_id', h.autor_id, 'nome', h.autor) from comercial_historico h
                              where h.pedido_id = p.id and h.autor_id is not null order by h.criado_em limit 1) end,
                  'montador', (select jsonb_build_object('nome', pe.nome, 'funcionario_id', pe.funcionario_id, 'free_foto', fc.foto_url)
                                 from operacao_etapas e join operacao_etapa_pessoas pe on pe.etapa_id = e.id and pe.papel = 'responsavel'
                                 left join free_cadastros fc on fc.id = pe.free_id
                                where e.pedido_id = p.id and e.tipo = 'montagem' order by e.data, pe.ordem limit 1),
                  'posicao_final', exists (select 1 from fin_posicoes_finais f where f.pedido_id = p.id and f.status = 'confirmado'),
                  'ocorrencias', (select count(*) from fin_posicoes_finais f cross join lateral jsonb_array_elements(case when jsonb_typeof(f.itens) = 'array' then f.itens else '[]'::jsonb end) i
                                   where f.pedido_id = p.id and i->>'tipo' in ('avaria', 'desaparecido')),
                  'problemas', coalesce((select jsonb_agg(jsonb_build_object('tipo', g.tipo, 'qtd', g.qtd, 'itens', g.itens) order by g.qtd desc)
                                 from (select ca.dados->>'tipo' tipo, count(*) qtd, jsonb_agg(distinct ca.dados->>'item') filter (where ca.dados->>'item' is not null and ca.dados->>'objeto' = 'item') itens
                                         from operacao_casos_automaticos ca
                                        where ca.empresa_id = p.empresa_id and ca.dados->>'pedido_id' = p.id::text
                                          and coalesce(ca.dados->>'status', '') not in ('cancelada')
                                          -- só o que o cliente pode ter sentido no evento (o resto é controle interno do galpão)
                                          and ca.dados->>'tipo' in ('atraso_inicio', 'confirmacao_entrega_atrasada', 'confirmacao_coleta_atrasada', 'carregamento_incompleto',
                                                'entrega_incompleta', 'coleta_incompleta', 'divergencia_entrega', 'avaria_entrega', 'posicionamento_incorreto',
                                                'uniforme_reprovado', 'troca_solicitada', 'alerta_motorista')
                                          and not (coalesce(ca.dados->>'tipo', '') = any(coalesce((select r.tipos_desligados from operacao_ocorrencias_regras r where r.empresa_id = p.empresa_id), '{}')))
                                        group by 1) g), '[]'),
                  'separacao_problemas', (select count(*) from separacao_ocorrencias so where so.pedido_id = p.id)
                ) order by p.data_evento) from posvenda_contato_pedidos cp join separacoes_pedidos p on p.id = cp.pedido_id
                where cp.contato_id = c.id), '[]'),
    'ultimo_contato', (select max(x.concluido_em) from posvenda_contatos x where x.empresa_id = c.empresa_id and x.cliente_chave = c.cliente_chave and x.status = 'concluido' and x.id <> c.id),
    'ultima_ligacao', (select jsonb_build_object('em', x.concluido_em, 'por', x.feito_por_nome, 'atencao', x.atencao, 'observacao', x.observacao,
                         'ruins', coalesce((select jsonb_agg(r->>'pergunta') from jsonb_array_elements(case when jsonb_typeof(x.respostas) = 'array' then x.respostas else '[]'::jsonb end) r
                                             where (r->>'ruim')::boolean is true), '[]'))
                         from posvenda_contatos x where x.empresa_id = c.empresa_id and x.cliente_chave = c.cliente_chave and x.status = 'concluido' and x.id <> c.id
                         order by x.concluido_em desc limit 1),
    -- últimas 6 ligações concluídas do cliente (respostas + observação) e o resultado das conversas do WhatsApp delas,
    -- para a tela da ligação mostrar os últimos elogios e os últimos feedbacks negativos.
    'historico', coalesce((select jsonb_agg(h order by h->>'em' desc) from (
                   select jsonb_build_object('em', x.concluido_em, 'por', x.feito_por_nome, 'atencao', x.atencao, 'observacao', x.observacao,
                          'respostas', case when jsonb_typeof(x.respostas) = 'array' then x.respostas else '[]'::jsonb end,
                          'elogios', coalesce((select jsonb_agg(e) from posvenda_conversas v cross join lateral jsonb_array_elements_text(case when jsonb_typeof(v.resultado->'elogios') = 'array' then v.resultado->'elogios' else '[]'::jsonb end) e where v.contato_id = x.id), '[]'),
                          'criticas', coalesce((select jsonb_agg(e) from posvenda_conversas v cross join lateral jsonb_array_elements_text(case when jsonb_typeof(v.resultado->'criticas') = 'array' then v.resultado->'criticas' else '[]'::jsonb end) e where v.contato_id = x.id), '[]')) h
                     from posvenda_contatos x where x.empresa_id = c.empresa_id and x.cliente_chave = c.cliente_chave and x.status = 'concluido' and x.id <> c.id
                    order by x.concluido_em desc limit 6) t), '[]'))
$function$;
notify pgrst, 'reload schema';
