-- Acrescenta cinco personalizações somente ao pedido TESTE-PROD-3.
-- Reexecutável. Sem execução, retirada de materiais ou lançamentos financeiros.
begin;
do $$
declare
 empresa constant uuid:='bb1260f0-99cd-4d17-ab9b-23c299b4c50b';
 p separacoes_pedidos; peca record; pers uuid; contador int:=0; etapas jsonb;
 titulos text[]:=array['TESTE · Pintura fosca','TESTE · Forração em tecido','TESTE · Acabamento decorativo','TESTE · Pintura e proteção','TESTE · Forração e acabamento'];
 roteiros jsonb[]:=array[
 '[{"nome":"Lixar e preparar superfície","setor":"pintura","horas":0.25,"grupo":1},{"nome":"Aplicar pintura fosca","setor":"pintura","horas":0.5,"grupo":2}]'::jsonb,
 '[{"nome":"Cortar tecido de referência","setor":"forracao","horas":0.25,"grupo":1},{"nome":"Forrar e conferir fixações","setor":"forracao","horas":0.75,"grupo":2}]'::jsonb,
 '[{"nome":"Preparar detalhe decorativo","setor":"personalizacao","horas":0.25,"grupo":1},{"nome":"Aplicar acabamento escolhido","setor":"personalizacao","horas":0.5,"grupo":2}]'::jsonb,
 '[{"nome":"Preparar e pintar peça","setor":"pintura","horas":0.5,"grupo":1},{"nome":"Aplicar proteção final","setor":"personalizacao","horas":0.25,"grupo":2}]'::jsonb,
 '[{"nome":"Medir e aplicar tecido","setor":"forracao","horas":0.5,"grupo":1},{"nome":"Finalizar arremates","setor":"personalizacao","horas":0.25,"grupo":2}]'::jsonb];
 novos jsonb:='[]'; origem jsonb; obs jsonb; reserva jsonb;
begin
 select * into strict p from separacoes_pedidos where empresa_id=empresa and numero_pedido='TESTE-PROD-3'
  and observacoes->>'demo_producao'='20261022' for update;
 if p.observacoes->>'demo_cinco_personalizacoes'='20261022' then
  raise notice 'Cinco personalizações já adicionadas';return;
 end if;
 if p.status_comercial<>'aprovado' then raise exception 'Pedido de teste não está aprovado';end if;
 for peca in select i.* from itens i where i.empresa_id=empresa and nullif(i.foto_url,'') is not null
  and not exists(select 1 from separacoes_itens si where si.separacao_pedido_id=p.id and si.item_id=i.id)
  order by i.codigo,i.id loop
  select coalesce(jsonb_agg(jsonb_build_object('item_id',si.item_id,'quantidade_solicitada',si.quantidade_solicitada)),'[]')
   into reserva from separacoes_itens si where si.separacao_pedido_id=p.id;
  begin
   perform operacao_validar_reserva(empresa,p.id,reserva||jsonb_build_array(jsonb_build_object('item_id',peca.id,'quantidade_solicitada',1)),p.data_entrega,p.data_coleta);
  exception when raise_exception then continue;
  end;
  contador:=contador+1;etapas:=roteiros[contador];
  insert into personalizacoes(empresa_id,tipo,alvo,vinculo_id,vinculo_nome,observacoes,tempo,custo_hora,status,producao_etapas,preco_sugerido)
   values(empresa,titulos[contador],'ITEM',peca.id,coalesce(peca.descricao_total,peca.produto),
    'DEMONSTRAÇÃO: seguir a referência, proteger ferragens e conferir acabamento. Não executar nem retirar materiais.',
    (select sum((e->>'horas')::numeric) from jsonb_array_elements(etapas) e),0,'INATIVO',etapas,0) returning id into pers;
  origem:=jsonb_build_object('id','demo-extra-'||contador,'item_id',peca.id,'quantidade',1,'nome',peca.produto,
   'personalizacao_id',pers,'personalizacao_nome',titulos[contador],'personalizacao_valor',0,
   'observacao','EXEMPLO '||contador||': conferir medidas e acabamento com a referência. Item de demonstração, não executar.',
   'personalizacao_escolhas',jsonb_build_object('Referência',jsonb_build_object('nome','Referência de demonstração','codigo',peca.codigo,'foto_url',peca.foto_url)));
  novos:=novos||jsonb_build_array(origem);
  insert into separacoes_itens(empresa_id,separacao_pedido_id,item_id,quantidade_solicitada) values(empresa,p.id,peca.id,1);
  exit when contador=5;
 end loop;
 if contador<>5 then raise exception 'Não foi possível selecionar cinco peças disponíveis; nenhuma alteração aplicada';end if;
 obs:=jsonb_set(p.observacoes,'{projeto_comercial,dados,ambientes,0,itens}',
  (p.observacoes#>'{projeto_comercial,dados,ambientes,0,itens}')||novos);
 update separacoes_pedidos set observacoes=obs||jsonb_build_object('demo_cinco_personalizacoes','20261022') where id=p.id;
 perform producao_sincronizar(p.id);
end $$;
commit;
select p.numero_pedido,count(*) personalizacoes from producao_itens t join separacoes_pedidos p on p.id=t.pedido_id
 where p.empresa_id='bb1260f0-99cd-4d17-ab9b-23c299b4c50b' and p.numero_pedido='TESTE-PROD-3' and not t.cancelado group by p.numero_pedido;
