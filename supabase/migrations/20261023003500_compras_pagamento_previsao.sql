begin;
create or replace function public.compras_registrar_entrada(p_empresa uuid,p_dados jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare r compras_registros; fornecedor jsonb; produto jsonb; destino text:=p_dados->>'destino';qtd numeric;unitario numeric;
 numero_nota text;dt date;prox bigint;token uuid;linha jsonb;anterior numeric;item_id uuid;recebida boolean;previsao date;
begin
 if auth.uid() is null or not eh_membro_empresa(p_empresa) or not funcionario_tabela_permitida(p_empresa,'almoxarifado_compras','insert') then
  raise exception 'Sem permissão para registrar compras' using errcode='42501';end if;
 token:=(p_dados->>'token')::uuid;if token is null then raise exception 'Identificação do registro ausente';end if;
 perform pg_advisory_xact_lock(hashtextextended('compras:'||p_empresa::text,0));
 select * into r from compras_registros where empresa_id=p_empresa and tipo='pedido' and dados->>'registro_token'=token::text;
 if found then return compras_json(r);end if;
 if coalesce(p_dados->>'situacao','aguardando') not in ('aguardando','recebido') then raise exception 'Situação inválida';end if;
 recebida:=coalesce(p_dados->>'situacao','aguardando')='recebido';previsao:=nullif(p_dados->>'previsao_entrega','')::date;
 if not recebida and previsao is null then raise exception 'Informe a data prevista de chegada';end if;
 if p_dados->>'forma_pagamento' is null or jsonb_typeof(p_dados->'parcelas') is distinct from 'array' then raise exception 'Informe a forma de pagamento e as parcelas';end if;
 qtd:=(p_dados->>'quantidade')::numeric;unitario:=(p_dados->>'valor_unitario')::numeric;dt:=(p_dados->>'data_compra')::date;
 if qtd is null or qtd::text in ('NaN','Infinity','-Infinity') or qtd<=0 or qtd>100000000 or unitario is null or unitario::text in ('NaN','Infinity','-Infinity') or unitario<=0 or unitario>100000000 or dt is null then
  raise exception 'Informe data, quantidade e valor unitário positivos';end if;
 if jsonb_array_length(p_dados->'parcelas') not between 1 and 48 or exists(select 1 from jsonb_array_elements(p_dados->'parcelas') x
  where coalesce(x->>'vencimento','')='' or x->>'valor' is null or x->>'valor' in ('NaN','Infinity','-Infinity') or (x->>'valor')::numeric<=0) then
  raise exception 'Informe parcelas com valor positivo e vencimento';end if;
 if abs((select sum(round((x->>'valor')::numeric,2)) from jsonb_array_elements(p_dados->'parcelas') x)-round(qtd*unitario,2))>0.009 then
  raise exception 'A soma das parcelas precisa ser igual ao total da compra';end if;
 select to_jsonb(f)||jsonb_build_object('nome',coalesce(f.nome_fantasia,f.nome_razao_social)) into fornecedor from fornecedores f
  where f.id=(p_dados->>'fornecedor_id')::uuid and f.empresa_id=p_empresa;
 if fornecedor is null then raise exception 'Selecione um fornecedor desta empresa';end if;
 if destino='almoxarifado' then
  select jsonb_build_object('id',a.id,'nome',a.produto,'codigo',a.codigo,'unidade',a.unidade) into produto from almox_produtos(p_empresa) a where a.id=p_dados->>'produto_id';
 elsif destino='locacao' then
  item_id:=(p_dados->>'produto_id')::uuid;
  select jsonb_build_object('id',i.id,'nome',coalesce(i.descricao_total,i.produto),'codigo',i.codigo,'unidade','un') into produto
   from itens i where i.id=item_id and i.empresa_id=p_empresa and lower(coalesce(i.tipo,''))<>'kit' for update;
  if qtd<>trunc(qtd) then raise exception 'Itens de locação exigem quantidade inteira';end if;
 else raise exception 'Destino inválido';end if;
 if produto is null then raise exception 'Material ou item não encontrado neste destino';end if;
 numero_nota:=nullif(trim(p_dados->>'numero_nf'),'');
 select coalesce(max(numero),0)+1 into prox from compras_registros where empresa_id=p_empresa and tipo='pedido';
 linha:=produto||jsonb_build_object('id',gen_random_uuid(),'material_id',produto->>'id','item_id',item_id,'destino',destino,
  'quantidade',qtd,'quantidade_recebida',case when recebida then qtd else 0 end,'valor_unitario',unitario,'valor_total',round(qtd*unitario,2),
  'requer_lote',false,'requer_certificado',false,'lotes','[]'::jsonb,'allocations','[]'::jsonb,'need_allocations','[]'::jsonb);
 insert into compras_registros(empresa_id,tipo,numero,status,dados) values(p_empresa,'pedido',prox,case when recebida then 'recebido' else 'aguardando_recebimento' end,jsonb_build_object(
  'registro_token',token,'registro_direto',true,'destino',destino,'fornecedor_id',fornecedor->>'id','fornecedor',fornecedor,'fornecedor_nome',fornecedor->>'nome',
  'data_compra',dt,'prazo_acordado',previsao,'numero_nf',numero_nota,'observacao',nullif(trim(p_dados->>'observacao'),''),'items',jsonb_build_array(linha),
  'valor_total',round(qtd*unitario,2),'frete',0,'desconto',0,'itens_count',1,'percentual_recebido',case when recebida then 100 else 0 end,'xml_percent',0,'nfe_receipts','[]'::jsonb,
  'comprador_nome',almox_nome_usuario(p_empresa))) returning * into r;
 if recebida and destino='almoxarifado' then
  perform almox_estoque_mover(p_empresa,produto->>'id',qtd,'entrada',unitario,'COMPRA',almox_nome_usuario(p_empresa),fornecedor->>'nome',numero_nota,'Compra PC-'||r.numero||' · '||coalesce(p_dados->>'observacao',''));
 elsif recebida then
  select coalesce(estoque_total,0) into anterior from itens where id=item_id and empresa_id=p_empresa;
  update itens set estoque_total=coalesce(estoque_total,0)+qtd where id=item_id and empresa_id=p_empresa;
  update compras_registros set dados=dados||jsonb_build_object('estoque_anterior',anterior,'estoque_atual',anterior+qtd) where id=r.id returning * into r;
 end if;
 insert into compras_auditoria(empresa_id,acao,registro_id) values(p_empresa,'registrar_compra_'||destino,r.id);
 perform compras_pagamento_aplicar(p_empresa,r.id,p_dados->>'forma_pagamento',p_dados->'parcelas',round(qtd*unitario,2),'Registro de compra');
 select * into r from compras_registros where id=r.id;
 return compras_json(r);
end $$;

-- Itens de locação chegam pelo galpão e alimentam o estoque de itens.
create or replace function public.compras_receber_locacao(p_empresa uuid,p_pedido uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare p compras_registros; it jsonb; item_id uuid; saldo numeric;
begin
 if auth.uid() is null or not eh_membro_empresa(p_empresa) or not operacao_pode(p_empresa,'estoque.almoxarifado.movimentar') then
  raise exception 'Sem permissão para conferir recebimentos' using errcode='42501';end if;
 select * into p from compras_registros where id=p_pedido and empresa_id=p_empresa and tipo='pedido' for update;
 if not found or p.dados->>'destino' is distinct from 'locacao' then raise exception 'Compra de locação não encontrada';end if;
 if p.status='recebido' then return compras_json(p);end if;
 if p.status<>'aguardando_recebimento' then raise exception 'Compra indisponível para recebimento';end if;
 for it in select x from jsonb_array_elements(p.dados->'items') x loop
  item_id:=(it->>'item_id')::uuid;saldo:=(it->>'quantidade')::numeric-coalesce((it->>'quantidade_recebida')::numeric,0);
  if saldo>0 then
   update itens set estoque_total=coalesce(estoque_total,0)+saldo where id=item_id and empresa_id=p_empresa;
   if not found then raise exception 'Item de locação não encontrado nesta empresa';end if;
  end if;
 end loop;
 update compras_registros set status='recebido',updated_at=now(),dados=dados||jsonb_build_object('percentual_recebido',100,
  'recebido_em',now(),'recebido_por',auth.uid(),'items',(select jsonb_agg(x||jsonb_build_object('quantidade_recebida',x->'quantidade')) from jsonb_array_elements(p.dados->'items') x))
  where id=p.id returning * into p;
 insert into compras_auditoria(empresa_id,acao,registro_id) values(p_empresa,'receber_itens_locacao',p.id);
 return compras_json(p);
end $$;
revoke all on function public.compras_receber_locacao(uuid,uuid) from public,anon;
grant execute on function public.compras_receber_locacao(uuid,uuid) to authenticated;
notify pgrst,'reload schema';

create or replace function public.compras_cancelar_titulos() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if new.tipo='pedido' and new.status='cancelado' and old.status<>'cancelado' and coalesce((new.dados->>'registro_direto')::boolean,false) then
  if exists(select 1 from fin_pagar where empresa_id=new.empresa_id and origem='compra' and origem_id=new.id and status<>'cancelado' and pago>0) then
   raise exception 'Esta compra tem pagamento registrado. Ajuste o pagamento no Financeiro antes de cancelar';end if;
  update fin_pagar set status='cancelado',cancelado_em=now(),cancelado_por=auth.uid(),cancelamento_motivo='Compra cancelada'
   where empresa_id=new.empresa_id and origem='compra' and origem_id=new.id and status<>'cancelado';
 end if;
 return new;
end $$;
revoke all on function public.compras_cancelar_titulos() from public,anon,authenticated;
drop trigger if exists compras_cancelar_titulos on public.compras_registros;
create trigger compras_cancelar_titulos before update of status on public.compras_registros for each row execute function public.compras_cancelar_titulos();

commit;
