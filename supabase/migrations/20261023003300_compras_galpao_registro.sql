begin;
insert into permissoes_catalogo(chave,modulo,submodulo,acao,descricao,ordem) values
 ('geral.solicitacoes.visualizar','Geral','Solicitação de compra','visualizar','Consultar solicitações do galpão',15),
 ('geral.solicitacoes.criar','Geral','Solicitação de compra','criar','Enviar solicitações do galpão para Compras',16)
on conflict(chave) do nothing;

create or replace function public.compras_galpao(p_empresa uuid,p_acao text,p_dados jsonb default '{}') returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare r compras_registros; prox bigint; qtd numeric; descricao text; link text; pode_compras boolean;
begin
 if auth.uid() is null or not eh_membro_empresa(p_empresa) then raise exception 'Sem acesso à empresa' using errcode='42501';end if;
 pode_compras:=funcionario_tabela_permitida(p_empresa,'almoxarifado_compras','select');
 if p_acao='listar' then
  if not pode_compras and not funcionario_pode(p_empresa,auth.uid(),'geral.solicitacoes.visualizar')
   and not funcionario_pode(p_empresa,auth.uid(),'geral.solicitacoes.criar') then raise exception 'Sem permissão para consultar solicitações' using errcode='42501';end if;
  return coalesce((select jsonb_agg(compras_json(c) order by created_at desc) from compras_registros c
   where c.empresa_id=p_empresa and c.tipo='necessidade' and c.dados->>'local_origem'='galpao'
    and (pode_compras or c.criado_por=auth.uid())),'[]');
 elsif p_acao<>'criar' then raise exception 'Operação inválida';end if;
 if not funcionario_pode(p_empresa,auth.uid(),'geral.solicitacoes.criar') and not funcionario_tabela_permitida(p_empresa,'almoxarifado_compras','insert') then
  raise exception 'Sem permissão para enviar solicitações' using errcode='42501';end if;
 qtd:=(p_dados->>'quantidade')::numeric;descricao:=trim(p_dados->>'descricao_item');link:=nullif(trim(p_dados->>'produto_url'),'');
 if qtd is null or qtd::text in ('NaN','Infinity','-Infinity') or qtd<=0 or qtd>100000000 or coalesce(descricao,'')='' then raise exception 'Informe o material e uma quantidade positiva';end if;
 if link is not null and link!~* '^https?://' then raise exception 'Informe um link válido';end if;
 perform pg_advisory_xact_lock(hashtextextended('compras:'||p_empresa::text,0));
 select coalesce(max(numero),0)+1 into prox from compras_registros where empresa_id=p_empresa and tipo='necessidade';
 insert into compras_registros(empresa_id,tipo,numero,status,dados,criado_por) values(p_empresa,'necessidade',prox,'aguardando_vinculo',
  jsonb_build_object('origem','solicitacao','local_origem','galpao','order_number','','descricao_item',descricao,'material_nome',descricao,
   'quantidade',qtd,'quantidade_faltante',qtd,'quantidade_comprada',0,'unidade',coalesce(nullif(trim(p_dados->>'unidade'),''),'un'),
   'data_necessidade',nullif(p_dados->>'data_necessidade','')::date,'observacao',nullif(trim(p_dados->>'observacao'),''),'produto_url',link,
   'prioridade','media','solicitante_nome',almox_nome_usuario(p_empresa),'pcp_status','published'),auth.uid()) returning * into r;
 insert into compras_auditoria(empresa_id,acao,registro_id) values(p_empresa,'solicitacao_galpao',r.id);
 return compras_json(r);
end $$;

create or replace function public.compras_catalogo_entrada(p_empresa uuid,p_destino text) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
 if auth.uid() is null or not eh_membro_empresa(p_empresa) or not funcionario_tabela_permitida(p_empresa,'almoxarifado_compras','insert') then
  raise exception 'Sem permissão para registrar compras' using errcode='42501';end if;
 if p_destino='almoxarifado' then
  return coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'nome',a.produto,'codigo',a.codigo,'unidade',a.unidade) order by a.produto) from almox_produtos(p_empresa) a),'[]');
 elsif p_destino='locacao' then
  return coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'nome',coalesce(i.descricao_total,i.produto),'codigo',i.codigo,'unidade','un') order by i.produto)
   from itens i where i.empresa_id=p_empresa and lower(coalesce(i.tipo,''))<>'kit'),'[]');
 end if;
 raise exception 'Destino inválido';
end $$;

create or replace function public.compras_registrar_entrada(p_empresa uuid,p_dados jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare r compras_registros; fornecedor jsonb; produto jsonb; destino text:=p_dados->>'destino';qtd numeric;unitario numeric;
 numero_nota text;dt date;prox bigint;token uuid;linha jsonb;anterior numeric;item_id uuid;
begin
 if auth.uid() is null or not eh_membro_empresa(p_empresa) or not funcionario_tabela_permitida(p_empresa,'almoxarifado_compras','insert') then
  raise exception 'Sem permissão para registrar compras' using errcode='42501';end if;
 token:=(p_dados->>'token')::uuid;if token is null then raise exception 'Identificação do registro ausente';end if;
 perform pg_advisory_xact_lock(hashtextextended('compras:'||p_empresa::text,0));
 select * into r from compras_registros where empresa_id=p_empresa and tipo='pedido' and dados->>'registro_token'=token::text;
 if found then return compras_json(r);end if;
 qtd:=(p_dados->>'quantidade')::numeric;unitario:=(p_dados->>'valor_unitario')::numeric;dt:=(p_dados->>'data_compra')::date;
 if qtd is null or qtd::text in ('NaN','Infinity','-Infinity') or qtd<=0 or qtd>100000000 or unitario is null or unitario::text in ('NaN','Infinity','-Infinity') or unitario<=0 or unitario>100000000 or dt is null then
  raise exception 'Informe data, quantidade e valor unitário positivos';end if;
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
  'quantidade',qtd,'quantidade_recebida',qtd,'valor_unitario',unitario,'valor_total',round(qtd*unitario,2),
  'requer_lote',false,'requer_certificado',false,'lotes','[]'::jsonb,'allocations','[]'::jsonb,'need_allocations','[]'::jsonb);
 insert into compras_registros(empresa_id,tipo,numero,status,dados) values(p_empresa,'pedido',prox,'recebido',jsonb_build_object(
  'registro_token',token,'registro_direto',true,'destino',destino,'fornecedor_id',fornecedor->>'id','fornecedor',fornecedor,'fornecedor_nome',fornecedor->>'nome',
  'data_compra',dt,'numero_nf',numero_nota,'observacao',nullif(trim(p_dados->>'observacao'),''),'items',jsonb_build_array(linha),
  'valor_total',round(qtd*unitario,2),'frete',0,'desconto',0,'itens_count',1,'percentual_recebido',100,'xml_percent',0,'nfe_receipts','[]'::jsonb,
  'comprador_nome',almox_nome_usuario(p_empresa))) returning * into r;
 if destino='almoxarifado' then
  perform almox_estoque_mover(p_empresa,produto->>'id',qtd,'entrada',unitario,'COMPRA',almox_nome_usuario(p_empresa),fornecedor->>'nome',numero_nota,'Compra PC-'||r.numero||' · '||coalesce(p_dados->>'observacao',''));
 else
  select coalesce(estoque_total,0) into anterior from itens where id=item_id and empresa_id=p_empresa;
  update itens set estoque_total=coalesce(estoque_total,0)+qtd where id=item_id and empresa_id=p_empresa;
  update compras_registros set dados=dados||jsonb_build_object('estoque_anterior',anterior,'estoque_atual',anterior+qtd) where id=r.id returning * into r;
 end if;
 insert into compras_auditoria(empresa_id,acao,registro_id) values(p_empresa,'registrar_compra_'||destino,r.id);
 return compras_json(r);
end $$;
revoke all on function public.compras_galpao(uuid,text,jsonb),public.compras_catalogo_entrada(uuid,text),public.compras_registrar_entrada(uuid,jsonb) from public,anon;
grant execute on function public.compras_galpao(uuid,text,jsonb),public.compras_catalogo_entrada(uuid,text),public.compras_registrar_entrada(uuid,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
