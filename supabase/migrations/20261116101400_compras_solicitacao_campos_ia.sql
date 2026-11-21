-- Solicitação de compra feita pela Carla (16/11/2026): cada resposta da assistente fica num campo próprio da necessidade
-- (motivo, justificativa, alternativas, pedido_destino, observacao_extra), para Compras mostrar em colunas.
-- A observação em texto continua igual (compatibilidade). Única mudança em compras_galpao.
CREATE OR REPLACE FUNCTION public.compras_galpao(p_empresa uuid, p_acao text, p_dados jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
   'prioridade','media','motivo',nullif(trim(p_dados->>'motivo'),''),'justificativa',nullif(trim(p_dados->>'justificativa'),''),'alternativas',nullif(trim(p_dados->>'alternativas'),''),'pedido_destino',nullif(trim(p_dados->>'pedido'),''),'observacao_extra',nullif(trim(p_dados->>'observacao_extra'),''),'solicitante_nome',almox_nome_usuario(p_empresa),'pcp_status','published'),auth.uid()) returning * into r;
 insert into compras_auditoria(empresa_id,acao,registro_id) values(p_empresa,'solicitacao_galpao',r.id);
 return compras_json(r);
end $function$;
