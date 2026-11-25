-- O.S: quem enviou sem cadastro de funcionário (ex.: administrador) aparece pelo nome da conta, e a tela usa a foto da conta (22/11/2026).
CREATE OR REPLACE FUNCTION public.acervo_ordens(p_empresa uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare n jsonb;l jsonb;begin
 if auth.uid() is null or not eh_membro_empresa(p_empresa) or not funcionario_tabela_permitida(p_empresa,'itens','select') then raise exception 'Sem permissão para consultar o acervo';end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',o.id::text,'numero',o.numero::text,'item_id',o.item_id,'codigo',to_jsonb(i)->>'codigo',
 'item',coalesce(nullif(to_jsonb(i)->>'descricao_total',''),i.produto),'descricao_complementar',to_jsonb(i)->>'descricao_complementar','foto_url',i.foto_url,
 'quantidade',o.quantidade,'setor',o.setor,'fluxo',o.fluxo,'concluida',o.status='concluida','prazo',o.prazo,'motivo',r.motivo,
 'onde',case r.origem when 'inventario' then 'Inventário' when 'avulsa' then 'Depósito' when 'separacao' then 'Separação' else 'Retorno do evento' end,'foto_dano',(select e->>'url' from jsonb_array_elements(case when jsonb_typeof(r.evidencias)='array' then r.evidencias else '[]'::jsonb end) e where e->>'url' ~ '^https://' limit 1),'fotos_dano',(select coalesce(jsonb_agg(e->>'url'),'[]'::jsonb) from jsonb_array_elements(case when jsonb_typeof(r.evidencias)='array' then r.evidencias else '[]'::jsonb end) e where e->>'url' ~ '^https://'),'pedido',p.numero_pedido,'data',o.criado_em,'data_conclusao',o.concluido_em,
 'solicitante',coalesce(nullif(btrim(solicitante_pessoa.nome),''),nullif(btrim(conta.nome),''),case when position('@' in o.solicitante_nome)=0 then nullif(btrim(o.solicitante_nome),'') end,'Colaborador não identificado'),'solicitante_foto',coalesce(solicitante_pessoa.foto_url,''),'solicitante_id',solicitante_pessoa.id,'solicitante_usuario',o.criado_por,'responsavel',o.responsavel,'versao',o.versao,'retorno_id',r.id,'fonte','sistema','historico',o.historico) order by o.criado_em desc),'[]') into n
 from acervo_os o left join lateral (
   select f.id,f.nome,f.foto_url from funcionarios_acesso f
   where f.empresa_id=o.empresa_id and (
    f.id::text=o.criado_por::text or to_jsonb(f)->>'usuario_id'=o.criado_por::text or to_jsonb(f)->>'user_id'=o.criado_por::text
    or lower(btrim(f.email))=lower(btrim(o.solicitante_nome)) or lower(btrim(f.nome))=lower(btrim(o.solicitante_nome)))
   order by case when f.id::text=o.criado_por::text or to_jsonb(f)->>'usuario_id'=o.criado_por::text or to_jsonb(f)->>'user_id'=o.criado_por::text then 0 when lower(btrim(f.email))=lower(btrim(o.solicitante_nome)) then 1 else 2 end,f.id
   limit 1
  ) solicitante_pessoa on true left join usuarios conta on conta.id=o.criado_por join itens i on i.id=o.item_id and i.empresa_id=p_empresa join acervo_retornos r on r.id=o.retorno_id and r.empresa_id=p_empresa left join separacoes_pedidos p on p.id=r.pedido_id and p.empresa_id=p_empresa where o.empresa_id=p_empresa;
 select coalesce(jsonb_agg(x||jsonb_build_object('fonte','legado')),'[]') into l from jsonb_array_elements(acervo_ordens_legado(p_empresa)) x;
 return n||l;
end $function$
;
