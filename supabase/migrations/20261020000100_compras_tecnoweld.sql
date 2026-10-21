begin;
create table if not exists public.compras_registros(
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id),
  tipo text not null check(tipo in ('necessidade','cotacao','pedido','rnc')),
  numero bigint not null,
  status text not null,
  dados jsonb not null default '{}',
  criado_por uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(empresa_id,tipo,numero)
);
create index if not exists compras_registros_fila on public.compras_registros(empresa_id,tipo,status);
alter table public.compras_registros enable row level security;
create policy compras_registros_leitura on public.compras_registros for select to authenticated
using(public.eh_membro_empresa(empresa_id) and public.funcionario_tabela_permitida(empresa_id,'almoxarifado_compras','select'));
grant select on public.compras_registros to authenticated;
create table if not exists public.compras_auditoria(
  id bigint generated always as identity primary key,
  empresa_id uuid not null references public.empresas(id),usuario_id uuid default auth.uid(),
  acao text not null,registro_id uuid,created_at timestamptz not null default now()
);
alter table public.compras_auditoria enable row level security;
create policy compras_auditoria_leitura on public.compras_auditoria for select to authenticated
using(public.eh_membro_empresa(empresa_id) and public.funcionario_tabela_permitida(empresa_id,'almoxarifado_compras','select'));
grant select on public.compras_auditoria to authenticated;
alter table public.almoxarifado_compras add column if not exists compras_pedido_id uuid references public.compras_registros(id);

create or replace function public.compras_json(r public.compras_registros) returns jsonb
language sql stable set search_path=public as $$
 select r.dados || jsonb_build_object('id',r.id,'numero',r.numero,'status',r.status,'created_at',r.created_at,'updated_at',r.updated_at)
$$;

create or replace function public.compras_operar(p_empresa uuid,p_acao text,p_dados jsonb default '{}') returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare
 r compras_registros; n compras_registros; q compras_registros; ord compras_registros;
 doc jsonb; item jsonb; a jsonb; response jsonb; supplier jsonb; header jsonb; selection jsonb;
 items jsonb; suppliers jsonb; results jsonb:='[]'; changed jsonb; needs jsonb;
 rid uuid; sid uuid; nid uuid; nextnum bigint; qty numeric; total numeric; amount numeric;
 allowed text; name text; remaining numeric;
begin
 if auth.uid() is null or not public.eh_membro_empresa(p_empresa) then raise exception 'Acesso negado à empresa.' using errcode='42501'; end if;
 allowed:=case when p_acao in ('listar','consultar') then 'select' when p_acao in ('criar_necessidade','criar_cotacao','gerar_pedidos') then 'insert' else 'update' end;
 if not public.funcionario_tabela_permitida(p_empresa,'almoxarifado_compras',allowed) then raise exception 'Sem permissão para esta operação de Compras.' using errcode='42501'; end if;
 if p_acao='listar' then
   return coalesce((select jsonb_agg(compras_json(c) order by numero desc) from compras_registros c where empresa_id=p_empresa and tipo=p_dados->>'tipo'),'[]');
 end if;
 if p_acao='consultar' then
   select * into r from compras_registros where id=(p_dados->>'id')::uuid and empresa_id=p_empresa;
   if not found then raise exception 'Registro de Compras não encontrado.';end if;
   return compras_json(r);
 end if;
 perform pg_advisory_xact_lock(hashtextextended('compras:'||p_empresa::text,0));
 if p_dados ? 'id' then
   select * into r from compras_registros where id=(p_dados->>'id')::uuid and empresa_id=p_empresa for update;
   if not found then raise exception 'Registro de Compras não encontrado.';end if;
 end if;

 if p_acao='criar_necessidade' then
   qty:=(p_dados->>'quantidade')::numeric;
   if qty is null or qty<=0 or qty>100000000 or length(trim(coalesce(p_dados->>'descricao_item','')))=0 then raise exception 'Descrição e quantidade positiva são obrigatórias.';end if;
   select coalesce(max(numero),0)+1 into nextnum from compras_registros where empresa_id=p_empresa and tipo='necessidade';
   doc:=p_dados||jsonb_build_object('origem',case when p_dados->>'origem' in ('operacional','manutencao') then p_dados->>'origem' else 'solicitacao' end,'material_nome',p_dados->>'descricao_item','quantidade_faltante',qty,'quantidade_comprada',0,'solicitante_nome',coalesce(auth.jwt()->'user_metadata'->>'nome','Equipe'),'pcp_status','published');
   insert into compras_registros(empresa_id,tipo,numero,status,dados) values(p_empresa,'necessidade',nextnum,'aguardando_vinculo',doc) returning * into r;

 elsif p_acao='vincular_material' then
   if r.tipo<>'necessidade' or r.status not in ('aguardando_vinculo','pendente','aguardando_aprovacao') then raise exception 'Esta necessidade não pode ser vinculada agora.';end if;
   select to_jsonb(i) into item from insumos i where i.id=(p_dados->>'material_id')::uuid and i.empresa_id=p_empresa;
   if item is null then raise exception 'Insumo não encontrado nesta empresa.';end if;
   update compras_registros set status='pendente',dados=dados||jsonb_build_object('material_id',item->>'id','material_nome',item->>'nome','material_codigo',item->>'codigo','unidade',item->>'unidade'),updated_at=now() where id=r.id returning * into r;

 elsif p_acao='criar_cotacao' then
   if jsonb_array_length(coalesce(p_dados->'items','[]'))=0 or jsonb_array_length(coalesce(p_dados->'supplier_ids','[]'))=0 then raise exception 'Selecione itens e fornecedores.';end if;
   items:='[]';suppliers:='[]';
   for item in select value from jsonb_array_elements(p_dados->'items') loop
     qty:=coalesce((item->>'quantidade_cotada')::numeric,0);
     if qty<=0 or jsonb_array_length(coalesce(item->'need_allocations','[]'))=0 then raise exception 'Quantidade cotada e necessidades são obrigatórias.';end if;
     amount:=0;
     for a in select value from jsonb_array_elements(item->'need_allocations') loop
       nid:=(a->>'purchase_request_id')::uuid;
       select * into n from compras_registros where id=nid and empresa_id=p_empresa and tipo='necessidade' for update;
       if not found or n.status<>'pendente' or not (n.dados ? 'material_id') then raise exception 'Uma necessidade não está disponível para cotação.';end if;
       remaining:=(n.dados->>'quantidade_faltante')::numeric;
       if (a->>'quantidade_alocada')::numeric<=0 or (a->>'quantidade_alocada')::numeric>remaining then raise exception 'Alocação superior à necessidade.';end if;
       if item->>'material_id' is distinct from n.dados->>'material_id' then raise exception 'Material da necessidade divergente.';end if;
       amount:=amount+(a->>'quantidade_alocada')::numeric;
       update compras_registros set status='em_cotacao',updated_at=now() where id=n.id;
     end loop;
     if amount<>qty then raise exception 'A quantidade cotada deve corresponder à alocação.';end if;
     items:=items||jsonb_build_array(item||jsonb_build_object('id',gen_random_uuid(),'respostas','[]'::jsonb));
   end loop;
   for a in select value from jsonb_array_elements(p_dados->'supplier_ids') loop
     sid:=trim(both '"' from a::text)::uuid;
     select to_jsonb(f) into supplier from fornecedores f where f.id=sid and f.empresa_id=p_empresa;
     if supplier is null then raise exception 'Fornecedor não encontrado nesta empresa.';end if;
     if exists(select 1 from jsonb_array_elements(suppliers) v where v->>'supplier_id'=sid::text) then raise exception 'Fornecedor duplicado.';end if;
     suppliers:=suppliers||jsonb_build_array(jsonb_build_object('supplier_id',sid,'nome',coalesce(supplier->>'nome_fantasia',supplier->>'nome_razao_social',supplier->>'nome'),'status','aguardando','header','{}'::jsonb));
   end loop;
   select coalesce(max(numero),0)+1 into nextnum from compras_registros where empresa_id=p_empresa and tipo='cotacao';
   insert into compras_registros(empresa_id,tipo,numero,status,dados) values(p_empresa,'cotacao',nextnum,'aberta',p_dados||jsonb_build_object('items',items,'suppliers',suppliers,'itens_count',jsonb_array_length(items),'fornecedores_count',jsonb_array_length(suppliers),'respostas_count',0)) returning * into r;

 elsif p_acao='salvar_proposta' then
   if r.tipo<>'cotacao' or r.status in ('encerrada','cancelada') then raise exception 'Cotação encerrada.';end if;
   sid:=(p_dados->>'supplier_id')::uuid;header:=coalesce(p_dados->'header','{}');
   if nullif(header->>'documento_original_path','') is not null and not starts_with(header->>'documento_original_path',p_empresa::text||'/') then raise exception 'Documento fora desta empresa.';end if;
   if not exists(select 1 from jsonb_array_elements(r.dados->'suppliers') x where x->>'supplier_id'=sid::text) then raise exception 'Fornecedor fora da cotação.';end if;
   if coalesce((header->>'frete')::numeric,0)<0 or coalesce((header->>'desconto')::numeric,0)<0 then raise exception 'Frete e desconto devem ser positivos.';end if;
   items:='[]';
   for item in select value from jsonb_array_elements(r.dados->'items') loop
     if coalesce((item->>'comprado')::boolean,false) then items:=items||jsonb_build_array(item);continue;end if;
     select value into response from jsonb_array_elements(p_dados->'items') x where x->>'quotation_item_id'=item->>'id';
     if response is null or (not coalesce((response->>'nao_cotado')::boolean,false) and coalesce((response->>'valor_unitario')::numeric,0)<=0) then raise exception 'Informe preço positivo ou marque o item como não cotado.';end if;
     response:=response||jsonb_build_object('supplier_id',sid,'supplier_nome',(select x->>'nome' from jsonb_array_elements(r.dados->'suppliers') x where x->>'supplier_id'=sid::text),'valor_total',coalesce((response->>'valor_unitario')::numeric,0)*(item->>'quantidade_cotada')::numeric,'data_prevista_entrega',coalesce(nullif(response->>'data_prevista_entrega',''),header->>'data_prevista_entrega'),'header',header);
     response:=response||jsonb_build_object('atende_pcp',true);
     select coalesce(jsonb_agg(x),'[]') into changed from jsonb_array_elements(item->'respostas') x where x->>'supplier_id'<>sid::text;
     items:=items||jsonb_build_array(item||jsonb_build_object('respostas',changed||jsonb_build_array(response)));
   end loop;
   select jsonb_agg(case when x->>'supplier_id'=sid::text then x||jsonb_build_object('status','respondido','header',header) else x end) into suppliers from jsonb_array_elements(r.dados->'suppliers') x;
   update compras_registros set dados=dados||jsonb_build_object('items',items,'suppliers',suppliers,'respostas_count',(select count(*) from jsonb_array_elements(suppliers) x where x->>'status'='respondido')),updated_at=now() where id=r.id returning * into r;

 elsif p_acao='gerar_pedidos' then
   q:=r;
   if q.tipo<>'cotacao' or q.status in ('encerrada','cancelada') then raise exception 'Cotação já convertida ou encerrada.';end if;
   if jsonb_array_length(coalesce(p_dados->'selections','[]'))=0 then raise exception 'Escolha os fornecedores vencedores.';end if;
   if (select count(*)<>count(distinct x->>'quotation_item_id') from jsonb_array_elements(p_dados->'selections') x) then raise exception 'Item selecionado mais de uma vez.';end if;
   for a in select distinct jsonb_build_object('supplier_id',x->>'supplier_id') from jsonb_array_elements(p_dados->'selections') x loop
     sid:=(a->>'supplier_id')::uuid;items:='[]';total:=0;
     select x into supplier from jsonb_array_elements(q.dados->'suppliers') x where x->>'supplier_id'=sid::text;
     if supplier is null or supplier->>'status'<>'respondido' then raise exception 'Fornecedor sem proposta válida.';end if;
     header:=supplier->'header';
     for selection in select value from jsonb_array_elements(p_dados->'selections') x where x->>'supplier_id'=sid::text loop
       select x into item from jsonb_array_elements(q.dados->'items') x where x->>'id'=selection->>'quotation_item_id';
       if item is null or coalesce((item->>'comprado')::boolean,false) then raise exception 'Item não encontrado ou já comprado.';end if;
       qty:=(selection->>'quantidade')::numeric;
       if qty is null or qty<>(item->>'quantidade_cotada')::numeric then raise exception 'Quantidade divergente da cotação.';end if;
       select x into response from jsonb_array_elements(item->'respostas') x where x->>'supplier_id'=sid::text and not coalesce((x->>'nao_cotado')::boolean,false);
       if response is null or coalesce((response->>'valor_unitario')::numeric,0)<=0 then raise exception 'Preço inválido.';end if;
       item:=item||jsonb_build_object('id',gen_random_uuid(),'quotation_item_id',item->>'id','quantidade',qty,'quantidade_recebida',0,'valor_unitario',(response->>'valor_unitario')::numeric,'valor_total',qty*(response->>'valor_unitario')::numeric,'requer_lote',false,'requer_certificado',false,'lotes','[]'::jsonb,'allocations',item->'need_allocations');
       total:=total+(item->>'valor_total')::numeric;items:=items||jsonb_build_array(item);
       for a in select value from jsonb_array_elements(item->'need_allocations') loop
         select * into n from compras_registros where id=(a->>'purchase_request_id')::uuid and empresa_id=p_empresa and tipo='necessidade' for update;
         amount:=coalesce((n.dados->>'quantidade_comprada')::numeric,0)+(a->>'quantidade_alocada')::numeric;
         remaining:=greatest(0,(n.dados->>'quantidade')::numeric-amount);
         update compras_registros set status=case when remaining=0 then 'comprada' else 'pendente' end,dados=dados||jsonb_build_object('quantidade_comprada',amount,'quantidade_faltante',remaining),updated_at=now() where id=n.id;
       end loop;
     end loop;
     total:=total+coalesce((header->>'frete')::numeric,0)-coalesce((header->>'desconto')::numeric,0);
     if total<0 then raise exception 'Desconto superior ao total.';end if;
     select to_jsonb(f)||jsonb_build_object('nome',coalesce(f.nome_fantasia,f.nome_razao_social),'documento',f.documento) into supplier from fornecedores f where id=sid and empresa_id=p_empresa;
     select coalesce(max(numero),0)+1 into nextnum from compras_registros where empresa_id=p_empresa and tipo='pedido';
     insert into compras_registros(empresa_id,tipo,numero,status,dados) values(p_empresa,'pedido',nextnum,'aguardando_recebimento',jsonb_build_object('quotation_id',q.id,'fornecedor_id',sid,'fornecedor',supplier,'fornecedor_nome',supplier->>'nome','items',items,'valor_total',total,'frete',header->'frete','desconto',header->'desconto','condicao_pagamento',header->>'condicao_pagamento','prazo_acordado',header->>'data_prevista_entrega','nfe_receipts','[]'::jsonb,'comprador_nome',coalesce(auth.jwt()->'user_metadata'->>'nome','Equipe'),'itens_count',jsonb_array_length(items),'percentual_recebido',0,'xml_percent',0,'certificados_percent',null)) returning * into ord;
     results:=results||jsonb_build_array(compras_json(ord));
   end loop;
   select jsonb_agg(case when exists(select 1 from jsonb_array_elements(p_dados->'selections') s where s->>'quotation_item_id'=x->>'id') then x||'{"comprado":true}' else x end) into items from jsonb_array_elements(q.dados->'items') x;
   update compras_registros set dados=dados||jsonb_build_object('items',items),status=case when not exists(select 1 from jsonb_array_elements(items) x where not coalesce((x->>'comprado')::boolean,false)) then 'encerrada' else 'parcial' end,updated_at=now() where id=q.id returning * into r;
   insert into compras_auditoria(empresa_id,acao,registro_id) values(p_empresa,p_acao,r.id);
   return jsonb_build_object('orders',results);

 elsif p_acao in ('cancelar_cotacao','cancelar_pedido') then
   if length(trim(coalesce(p_dados->>'motivo','')))=0 then raise exception 'Informe o motivo.';end if;
   if r.status in ('cancelado','cancelada') then return compras_json(r);end if;
   if p_acao='cancelar_cotacao' and (r.tipo<>'cotacao' or r.status in ('encerrada','parcial')) then raise exception 'Esta cotação já gerou pedidos.';end if;
   if p_acao='cancelar_pedido' and (r.tipo<>'pedido' or exists(select 1 from jsonb_array_elements(r.dados->'items') x where coalesce((x->>'quantidade_recebida')::numeric,0)>0) or exists(select 1 from almoxarifado_compras where compras_pedido_id=r.id and empresa_id=p_empresa and status='recebido')) then raise exception 'Pedido com recebimento não pode ser cancelado.';end if;
   for item in select value from jsonb_array_elements(r.dados->'items') loop
     for a in select value from jsonb_array_elements(coalesce(item->'need_allocations',item->'allocations','[]')) loop
       select * into n from compras_registros where id=(a->>'purchase_request_id')::uuid and empresa_id=p_empresa;
       if p_acao='cancelar_pedido' then
         amount:=greatest(0,coalesce((n.dados->>'quantidade_comprada')::numeric,0)-(a->>'quantidade_alocada')::numeric);
         update compras_registros set status='pendente',dados=dados||jsonb_build_object('quantidade_comprada',amount,'quantidade_faltante',(n.dados->>'quantidade')::numeric-amount),updated_at=now() where id=n.id;
       else update compras_registros set status='pendente',updated_at=now() where id=n.id and status='em_cotacao';end if;
     end loop;
   end loop;
   if r.tipo='pedido' then update almoxarifado_compras set status='cancelado' where empresa_id=p_empresa and compras_pedido_id=r.id;end if;
   update compras_registros set status=case when tipo='cotacao' then 'cancelada' else 'cancelado' end,dados=dados||jsonb_build_object('motivo_cancelamento',p_dados->>'motivo'),updated_at=now() where id=r.id returning * into r;

 elsif p_acao='faturamento' then
   if (p_dados->>'billing_company_id')::uuid<>p_empresa then raise exception 'Empresa de faturamento fora do acesso atual.';end if;
   update compras_registros set dados=dados||jsonb_build_object('billing_company_id',p_empresa),updated_at=now() where id=r.id returning * into r;

 elsif p_acao='nota_fiscal' then
   if r.tipo<>'pedido' or r.status in ('cancelado','recebido') then raise exception 'Pedido não está aberto para recebimento.';end if;
   doc:=p_dados->'nota';
   if nullif(doc->>'chave_nfe','') is null and nullif(doc->>'chave','') is null then raise exception 'Chave de NF-e obrigatória.';end if;
   if exists(select 1 from almoxarifado_compras c where empresa_id=p_empresa and chave_nfe=coalesce(doc->>'chave_nfe',doc->>'chave')) then raise exception 'NF-e já importada.';end if;
   if regexp_replace(coalesce(doc->>'cnpj_fornecedor',''),'\D','','g')<>regexp_replace(coalesce(r.dados->'fornecedor'->>'documento',''),'\D','','g') then raise exception 'Emitente da NF-e diferente do fornecedor do pedido.';end if;
   if jsonb_array_length(coalesce(p_dados->'items','[]'))=0 then raise exception 'NF-e sem itens.';end if;
   for item in select value from jsonb_array_elements(p_dados->'items') loop
     select x into a from jsonb_array_elements(r.dados->'items') x where x->>'id'=item->>'compras_item_id' and x->>'material_id'=item->>'material_id';
     if a is null or coalesce((item->>'quantidade')::numeric,0)<=0 then raise exception 'Item da NF-e fora do pedido ou quantidade inválida.';end if;
     select coalesce(sum((x->>'quantidade')::numeric),0) into amount from almoxarifado_compras c cross join lateral jsonb_array_elements(c.itens) x where c.empresa_id=p_empresa and c.compras_pedido_id=r.id and c.status<>'cancelado' and x->>'compras_item_id'=item->>'compras_item_id';
     if amount+(select sum((x->>'quantidade')::numeric) from jsonb_array_elements(p_dados->'items') x where x->>'compras_item_id'=item->>'compras_item_id')>(a->>'quantidade')::numeric then raise exception 'Quantidade da NF-e supera o saldo do pedido.';end if;
   end loop;
   insert into almoxarifado_compras(empresa_id,compras_pedido_id,fornecedor,numero_nf,chave_nfe,status,itens,valor_total,origem_importacao,data_compra)
   values(p_empresa,r.id,r.dados->'fornecedor'->>'nome',coalesce(doc->>'numero_nfe',doc->>'numero'),coalesce(doc->>'chave_nfe',doc->>'chave'),'aguardando_recebimento',p_dados->'items',coalesce((doc->>'valor_total')::numeric,(r.dados->>'valor_total')::numeric),'compras_tecnoweld',current_date) returning id into rid;
   update compras_registros set dados=dados||jsonb_build_object('nfe_receipts',coalesce(dados->'nfe_receipts','[]')||jsonb_build_array(jsonb_build_object('id',rid,'numero_nfe',coalesce(doc->>'numero_nfe',doc->>'numero'),'documento_path',doc->>'documento_path')),'xml_percent',100),updated_at=now() where id=r.id returning * into r;

 elsif p_acao='lote' then
   if r.tipo<>'pedido' or r.status='cancelado' then raise exception 'Pedido inválido.';end if;
   if length(trim(coalesce(p_dados->>'lote','')))=0 then raise exception 'Informe o lote.';end if;
   rid:=gen_random_uuid();
   if not exists(select 1 from jsonb_array_elements(r.dados->'items') x where x->>'id'=p_dados->>'order_item_id') then raise exception 'Item não encontrado.';end if;
   select jsonb_agg(case when x->>'id'=p_dados->>'order_item_id' then x||jsonb_build_object('lotes',coalesce(x->'lotes','[]')||jsonb_build_array(jsonb_build_object('id',rid,'lote',p_dados->>'lote','quantidade',p_dados->'quantidade'))) else x end) into items from jsonb_array_elements(r.dados->'items') x;
   update compras_registros set dados=dados||jsonb_build_object('items',items),updated_at=now() where id=r.id returning * into r;
   return jsonb_build_object('id',rid);

 elsif p_acao='certificado' then
   if r.tipo<>'pedido' then raise exception 'Pedido inválido.';end if;
   items:='[]';
   for item in select value from jsonb_array_elements(r.dados->'items') loop
     select coalesce(jsonb_agg(case when x->>'id'=p_dados->>'batch_id' then x||jsonb_build_object('certificado_path',p_dados->>'path','certificado_nome',p_dados->>'nome') else x end),'[]') into changed from jsonb_array_elements(coalesce(item->'lotes','[]')) x;
     items:=items||jsonb_build_array(item||jsonb_build_object('lotes',changed));
   end loop;
   update compras_registros set dados=dados||jsonb_build_object('items',items),updated_at=now() where id=r.id returning * into r;

 elsif p_acao='criar_rnc' then
   if r.tipo<>'pedido' or r.status not in ('recebido','parcialmente_recebido') then raise exception 'A RNC exige material já recebido.';end if;
   select x into item from jsonb_array_elements(r.dados->'items') x where x->>'id'=p_dados->>'item_id';
   qty:=coalesce((p_dados->>'quantidade')::numeric,0);
   if item is null or qty<=0 or qty>coalesce((item->>'quantidade_recebida')::numeric,0) or length(trim(coalesce(p_dados->>'descricao','')))=0 then raise exception 'Item, quantidade e descrição da RNC são obrigatórios.';end if;
   if exists(select 1 from compras_registros c where c.empresa_id=p_empresa and c.tipo='rnc' and c.status='aberta' and c.dados->>'order_item_id'=item->>'id') then raise exception 'Este item já possui uma RNC aberta.';end if;
   update insumos set estoque_atual=estoque_atual-qty where id=(item->>'material_id')::uuid and empresa_id=p_empresa and estoque_atual>=qty;
   if not found then raise exception 'Saldo insuficiente para bloquear esta quantidade.';end if;
   select coalesce(max(numero),0)+1 into nextnum from compras_registros where empresa_id=p_empresa and tipo='rnc';
   insert into compras_registros(empresa_id,tipo,numero,status,dados) values(p_empresa,'rnc',nextnum,'aberta',jsonb_build_object('order_id',r.id,'order_item_id',item->>'id','material_id',item->>'material_id','fornecedor_id',r.dados->>'fornecedor_id','fornecedor',r.dados->'fornecedor'->>'nome','pedido_numero',r.numero,'material_nome',item->>'nome','material_unidade',item->>'unidade','quantidade',qty,'quantidade_bloqueada',qty,'descricao',p_dados->>'descricao','recebimento_concluido',true,'criado_em',now(),'numero_nfe',p_dados->>'numero_nfe','anexos',coalesce(p_dados->'anexos','[]'))) returning * into r;

 elsif p_acao='decidir_rnc' then
   if r.tipo<>'rnc' or r.status<>'aberta' then raise exception 'RNC não está aberta.';end if;
   if p_dados->>'decisao' not in ('aceitar','abater','devolver_repor','devolver_cancelar') or length(trim(coalesce(p_dados->>'observacao','')))=0 then raise exception 'Decisão e observação são obrigatórias.';end if;
   if not coalesce((r.dados->>'recebimento_concluido')::boolean,false) then raise exception 'Conclua o recebimento antes de decidir a RNC.';end if;
   select * into ord from compras_registros where id=(r.dados->>'order_id')::uuid and empresa_id=p_empresa for update;
   select x into item from jsonb_array_elements(ord.dados->'items') x where x->>'id'=r.dados->>'order_item_id';
   if item is null then raise exception 'Item de origem da RNC não encontrado.';end if;
   qty:=(r.dados->>'quantidade_bloqueada')::numeric;
   amount:=coalesce((p_dados->>'valor')::numeric,0);
   if p_dados->>'decisao'='abater' and (amount<=0 or amount>qty*(item->>'valor_unitario')::numeric) then raise exception 'Informe abatimento válido para as peças bloqueadas.';end if;
   if p_dados->>'decisao' in ('aceitar','abater') then
     update insumos set estoque_atual=estoque_atual+qty where id=(r.dados->>'material_id')::uuid and empresa_id=p_empresa;
     if p_dados->>'decisao'='abater' then update compras_registros set dados=dados||jsonb_build_object('valor_total',greatest(0,(dados->>'valor_total')::numeric-amount),'abatimento_rnc',coalesce((dados->>'abatimento_rnc')::numeric,0)+amount),updated_at=now() where id=ord.id;end if;
   else
     item:=item||jsonb_build_object('quantidade_recebida',greatest(0,(item->>'quantidade_recebida')::numeric-qty));
     if p_dados->>'decisao'='devolver_cancelar' then
       remaining:=qty;
       for a in select value from jsonb_array_elements(coalesce(item->'need_allocations','[]')) loop
         exit when remaining<=0;total:=least(remaining,(a->>'quantidade_alocada')::numeric);remaining:=remaining-total;
         update compras_registros set status='pendente',dados=dados||jsonb_build_object('quantidade_comprada',greatest(0,(dados->>'quantidade_comprada')::numeric-total),'quantidade_faltante',(dados->>'quantidade_faltante')::numeric+total),updated_at=now() where id=(a->>'purchase_request_id')::uuid and empresa_id=p_empresa;
       end loop;
       item:=item||jsonb_build_object('quantidade',(item->>'quantidade')::numeric-qty,'valor_total',greatest(0,(item->>'valor_total')::numeric-qty*(item->>'valor_unitario')::numeric));
     end if;
     select jsonb_agg(case when x->>'id'=item->>'id' then item else x end) into items from jsonb_array_elements(ord.dados->'items') x;
     update compras_registros set dados=dados||jsonb_build_object('items',items,'valor_total',greatest(0,(dados->>'valor_total')::numeric-case when p_dados->>'decisao'='devolver_cancelar' then qty*(item->>'valor_unitario')::numeric else 0 end)),status=case when exists(select 1 from jsonb_array_elements(items) x where (x->>'quantidade_recebida')::numeric<(x->>'quantidade')::numeric) then 'parcialmente_recebido' else 'recebido' end,updated_at=now() where id=ord.id;
   end if;
   update compras_registros set status='resolvida',dados=dados||jsonb_build_object('decisao',p_dados->>'decisao','decisao_tipo',p_dados->>'decisao','observacao_decisao',p_dados->>'observacao','valor_abatimento',p_dados->'valor','resolvido_em',now(),'decidido_por',auth.uid()),updated_at=now() where id=r.id returning * into r;

 else raise exception 'Operação de Compras não reconhecida: %',p_acao;
 end if;
 insert into compras_auditoria(empresa_id,acao,registro_id) values(p_empresa,p_acao,r.id);
 return compras_json(r);
end $$;
revoke all on function public.compras_operar(uuid,text,jsonb) from public,anon;
grant execute on function public.compras_operar(uuid,text,jsonb) to authenticated;

-- O recebimento físico continua no Almoxarifado. Apenas sincroniza o progresso, sem duplicar estoque.
create or replace function public.compras_sincronizar_recebimento() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare pedido compras_registros;it jsonb;its jsonb:='[]';qty numeric;total numeric:=0;recebido numeric:=0;
begin
 if new.compras_pedido_id is null or new.status is not distinct from old.status then return new;end if;
 select * into pedido from compras_registros where id=new.compras_pedido_id and empresa_id=new.empresa_id for update;
 if not found then raise exception 'Pedido de compra não encontrado nesta empresa.';end if;
 if new.status='recebido' and pedido.status='cancelado' then raise exception 'Pedido cancelado não pode ser recebido.';end if;
 for it in select value from jsonb_array_elements(pedido.dados->'items') loop
   select coalesce(sum((x->>'quantidade')::numeric),0) into qty from almoxarifado_compras c cross join lateral jsonb_array_elements(c.itens) x where c.empresa_id=new.empresa_id and c.compras_pedido_id=pedido.id and c.status='recebido' and x->>'compras_item_id'=it->>'id';
   if qty>(it->>'quantidade')::numeric then raise exception 'Recebimento superior ao pedido.';end if;
   total:=total+(it->>'quantidade')::numeric;recebido:=recebido+qty;
   its:=its||jsonb_build_array(it||jsonb_build_object('quantidade_recebida',qty));
 end loop;
 update compras_registros set dados=dados||jsonb_build_object('items',its,'percentual_recebido',case when total>0 then round(100*recebido/total) else 0 end),status=case when recebido>=total and total>0 then 'recebido' when recebido>0 then 'parcialmente_recebido' else status end,updated_at=now() where id=pedido.id;
 insert into compras_auditoria(empresa_id,acao,registro_id) values(new.empresa_id,'recebimento_almoxarifado',pedido.id);
 return new;
end $$;
create trigger compras_recebimento_sincronizar after update of status on public.almoxarifado_compras for each row execute function public.compras_sincronizar_recebimento();

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('compras-documentos','compras-documentos',false,12582912,array['application/pdf','application/xml','text/xml','image/jpeg','image/png','image/webp']) on conflict(id) do nothing;
create policy compras_documentos_ler on storage.objects for select to authenticated using(bucket_id='compras-documentos' and public.eh_membro_empresa((storage.foldername(name))[1]::uuid) and public.funcionario_tabela_permitida((storage.foldername(name))[1]::uuid,'almoxarifado_compras','select'));
create policy compras_documentos_inserir on storage.objects for insert to authenticated with check(bucket_id='compras-documentos' and public.eh_membro_empresa((storage.foldername(name))[1]::uuid) and public.funcionario_tabela_permitida((storage.foldername(name))[1]::uuid,'almoxarifado_compras','insert'));
notify pgrst,'reload schema';
commit;
