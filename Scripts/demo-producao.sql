-- Demonstração solicitada pelo usuário. Pedidos e reservas de teste reais, sem execução/baixa.
-- Personalizações ficam inativas para não aparecerem como opções no catálogo dos clientes.
begin;
do $$
declare empresa constant uuid:='bb1260f0-99cd-4d17-ab9b-23c299b4c50b';
 hoje date:=(now() at time zone 'America/Sao_Paulo')::date;n int;peca record;pers uuid;pedido uuid;etapas jsonb;
 titulo text;cliente text;situacao text;entrega date;origem jsonb;observacoes jsonb;tempo numeric;
begin
 if exists(select 1 from separacoes_pedidos where empresa_id=empresa and numero_pedido like 'TESTE-PROD-%') then
  raise notice 'Demonstração já cadastrada; nenhuma duplicação realizada';return;
 end if;
 for n in 1..3 loop
  select * into strict peca from itens where empresa_id=empresa and id=case n
   when 1 then '2b7747eb-bdd5-4794-94ac-303dd2758437'::uuid
   when 2 then '777497f7-8582-4ff5-a285-ecc5d23b6b90'::uuid
   else '07e4e3a8-76e9-4c3a-8ab6-90affd9c8d16'::uuid end;
  if n=1 then
   titulo:='TESTE · Pintura caqui fosca';cliente:='TESTE · Evento Jardim';situacao:='pre_reserva';entrega:=hoje+10;
   etapas:='[{"nome":"Preparar superfície","setor":"pintura","horas":0.25,"grupo":1},{"nome":"Pintar em caqui fosco","setor":"pintura","horas":0.75,"grupo":2},{"nome":"Conferir acabamento","setor":"pintura","horas":0.25,"grupo":3}]';
  elsif n=2 then
   titulo:='TESTE · Forração bege';cliente:='TESTE · Evento Salão';situacao:='aprovado';entrega:=hoje+8;
   etapas:='[{"nome":"Medir e cortar tecido","setor":"forracao","horas":0.5,"grupo":1},{"nome":"Aplicar forração bege","setor":"forracao","horas":1,"grupo":2},{"nome":"Revisar costuras e fixações","setor":"forracao","horas":0.25,"grupo":3}]';
  else
   titulo:='TESTE · Acabamento completo';cliente:='TESTE · Evento Terraço';situacao:='aprovado';entrega:=hoje+5;
   etapas:='[{"nome":"Preparar e pintar estrutura","setor":"pintura","horas":0.5,"grupo":1},{"nome":"Aplicar tecido escolhido","setor":"forracao","horas":1,"grupo":2},{"nome":"Finalizar detalhes do pedido","setor":"personalizacao","horas":0.25,"grupo":3}]';
  end if;
  select sum((e->>'horas')::numeric) into tempo from jsonb_array_elements(etapas) e;
  insert into personalizacoes(empresa_id,tipo,alvo,vinculo_id,vinculo_nome,observacoes,tempo,custo_hora,status,producao_etapas,preco_sugerido)
   values(empresa,titulo,'ITEM',peca.id,coalesce(peca.descricao_total,peca.produto),
    'DEMONSTRAÇÃO: não executar nem retirar materiais. Usar para conhecer a tela de produção.',tempo,0,'INATIVO',etapas,0) returning id into pers;
  if n in(1,3) then
   insert into personalizacoes_insumos(empresa_id,personalizacao_id,almox_produto_id,material_nome,unidade,quantidade)
   values(empresa,pers,'PROD_1776858505021','TINTA LACA CAQUI 3,6L','LT',0.15),
    (empresa,pers,'PROD_1776890072199','Disco de Lixa #80','UN',1);
  end if;
  if n in(2,3) then
   insert into personalizacoes_insumos(empresa_id,personalizacao_id,cartela_tipo,material_nome,unidade,quantidade)
   values(empresa,pers,'Tecido','Tecido bege · EXEMPLO, vinculação pendente','m',2.5);
  end if;
  perform operacao_validar_reserva(empresa,null,jsonb_build_array(jsonb_build_object('item_id',peca.id,'quantidade_solicitada',1)),entrega,entrega+2);
  origem:=jsonb_build_object('item_id',peca.id,'quantidade',1,'nome',peca.produto,'personalizacao_id',pers,
   'personalizacao_nome',titulo,'personalizacao_valor',0,
   'observacao',case n when 1 then 'EXEMPLO: manter ferragens protegidas e acabamento uniforme, sem brilho.'
    when 2 then 'EXEMPLO: tecido bege, sem emendas aparentes na frente. Aguardando definição do material.'
    else 'EXEMPLO URGENTE: seguir a sequência pintura → forração → acabamento. Não executar: demonstração.' end,
   'personalizacao_escolhas',jsonb_build_object('Referência',jsonb_build_object('nome','Foto original do item · demonstração','codigo',peca.codigo,'foto_url',peca.foto_url,'cartela','Referência de TESTE')));
  observacoes:=jsonb_build_object('demo_producao','20261022','horario_entrega','09:00','horario_coleta','16:00',
   'observacoes_separacao','DEMONSTRAÇÃO: não separar peças nem entregar.',
   'projeto_comercial',jsonb_build_object('id',gen_random_uuid(),'noivos',cliente,'data_evento',entrega+1,
    'dados',jsonb_build_object('ambientes',jsonb_build_array(jsonb_build_object('id','demo-amb-'||n,'nome',case n when 1 then 'Recepção' when 2 then 'Salão principal' else 'Lounge do terraço' end,'itens',jsonb_build_array(origem))))));
  insert into separacoes_pedidos(empresa_id,numero_pedido,cliente_nome,local_nome,tipo_evento,data_evento,data_entrega,data_coleta,status_comercial,pre_reserva_ate,valor_total,observacoes)
   values(empresa,'TESTE-PROD-'||n,cliente,'DEMONSTRAÇÃO · não executar entrega','Teste de produção',entrega+1,entrega,entrega+2,situacao,
    case when situacao='pre_reserva' then hoje+2 end,0,observacoes) returning id into pedido;
  insert into separacoes_itens(empresa_id,separacao_pedido_id,item_id,quantidade_solicitada)
   values(empresa,pedido,peca.id,1);
  if n=3 then update producao_itens set urgente=true,urgencia_motivo='EXEMPLO: prioridade solicitada para demonstração da fila' where pedido_id=pedido;end if;
 end loop;
end $$;
commit;
select p.numero_pedido,p.cliente_nome,p.status_comercial,p.data_entrega,
 (select count(*) from producao_etapas e where e.producao_item_id=t.id) etapas,
 (select count(*) from producao_materiais m join producao_etapas e on e.id=m.etapa_id where e.producao_item_id=t.id) materiais
from producao_itens t join separacoes_pedidos p on p.id=t.pedido_id
where p.empresa_id='bb1260f0-99cd-4d17-ab9b-23c299b4c50b' and p.observacoes->>'demo_producao'='20261022'
order by p.numero_pedido;
