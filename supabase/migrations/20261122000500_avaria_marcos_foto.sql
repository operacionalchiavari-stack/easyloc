-- Peça achada no depósito com o Marcos (22/11/2026): foto obrigatória e a foto do dano aparece na O.S.
-- acervo_ordens devolve foto_dano/fotos_dano (fotos com link público das evidências) e 'onde' para depósito/separação.
create or replace function public.acervo_avaria_avulsa(p_empresa uuid, p_item uuid, p_quantidade integer, p_descricao text,
  p_setor text, p_fotos jsonb default '[]'::jsonb, p_local text default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare i itens; fora numeric; r acervo_retornos; os uuid; n bigint; ev jsonb; quem text;
begin
 if not acervo_triagem_pode(p_empresa) then raise exception 'Sem permissão para enviar peças para a manutenção'; end if;
 if coalesce(p_quantidade,0) <= 0 then raise exception 'Informe quantas peças estão danificadas'; end if;
 if length(btrim(coalesce(p_descricao,''))) < 5 then raise exception 'Descreva o dano (pelo menos 5 letras)'; end if;
 if jsonb_typeof(p_fotos) is distinct from 'array' or not exists(select 1 from jsonb_array_elements_text(p_fotos) u where u ~ '^https://') then raise exception 'Mande pelo menos uma foto da peça danificada'; end if;
 if p_setor is null or p_setor not in ('Marcenaria','Solda','Acabamento e Pintura','Costura','Forração','Limpeza de Estofados') then
   raise exception 'Escolha o setor da manutenção'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_empresa::text,0));
 select * into i from itens where id = p_item and empresa_id = p_empresa;
 if i.id is null then raise exception 'Item não encontrado'; end if;
 if i.tipo = 'Kit' then raise exception 'Kit não vai para a manutenção: escolha a peça (componente) que está danificada'; end if;
 select coalesce(sum(quantidade),0) into fora from acervo_retornos
  where empresa_id = p_empresa and item_id = p_item and pedido_id is null and estado not in ('liberado','baixado');
 if p_quantidade > greatest(coalesce(i.estoque_total,0) - fora, 0) then
   raise exception 'Só há % peça(s) deste item no estoque fora da manutenção', greatest(coalesce(i.estoque_total,0) - fora, 0)::integer; end if;
 select coalesce(jsonb_agg(jsonb_build_object('url', u, 'origem', 'avulsa')), '[]'::jsonb) into ev
  from (select jsonb_array_elements_text(case when jsonb_typeof(p_fotos) = 'array' then p_fotos else '[]'::jsonb end) u) x
  where u ~ '^https://' limit 12;
 insert into acervo_retornos(empresa_id,pedido_id,chave,item_id,tipo,quantidade,estado,motivo,atualizado_por,origem,evidencias)
 values(p_empresa,null,'avulsa:'||gen_random_uuid(),p_item,'avaria',p_quantidade,'triagem',
  left(btrim(p_descricao)||coalesce(' · '||nullif(btrim(p_local),''),'')||' · encontrado no depósito',500),
  auth.uid(),'avulsa',ev) returning * into r;
 insert into acervo_historico(empresa_id,retorno_id,estado,motivo,usuario_id)
 values(p_empresa,r.id,'triagem','Danificado encontrado no depósito',auth.uid());
 os := acervo_os_abrir_(p_empresa, r.id, p_setor, btrim(p_descricao));
 select numero into n from acervo_os where id = os;
 return jsonb_build_object('retorno_id', r.id, 'os_id', os, 'os_numero', n, 'setor', p_setor);
end $$;
revoke all on function public.acervo_avaria_avulsa(uuid,uuid,integer,text,text,jsonb,text) from public, anon;
grant execute on function public.acervo_avaria_avulsa(uuid,uuid,integer,text,text,jsonb,text) to authenticated;

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
 'solicitante',coalesce(nullif(btrim(solicitante_pessoa.nome),''),case when position('@' in o.solicitante_nome)=0 then nullif(btrim(o.solicitante_nome),'') end,'Colaborador não identificado'),'solicitante_foto',coalesce(solicitante_pessoa.foto_url,''),'solicitante_id',solicitante_pessoa.id,'responsavel',o.responsavel,'versao',o.versao,'retorno_id',r.id,'fonte','sistema','historico',o.historico) order by o.criado_em desc),'[]') into n
 from acervo_os o left join lateral (
   select f.id,f.nome,f.foto_url from funcionarios_acesso f
   where f.empresa_id=o.empresa_id and (
    f.id::text=o.criado_por::text or to_jsonb(f)->>'usuario_id'=o.criado_por::text or to_jsonb(f)->>'user_id'=o.criado_por::text
    or lower(btrim(f.email))=lower(btrim(o.solicitante_nome)) or lower(btrim(f.nome))=lower(btrim(o.solicitante_nome)))
   order by case when f.id::text=o.criado_por::text or to_jsonb(f)->>'usuario_id'=o.criado_por::text or to_jsonb(f)->>'user_id'=o.criado_por::text then 0 when lower(btrim(f.email))=lower(btrim(o.solicitante_nome)) then 1 else 2 end,f.id
   limit 1
  ) solicitante_pessoa on true join itens i on i.id=o.item_id and i.empresa_id=p_empresa join acervo_retornos r on r.id=o.retorno_id and r.empresa_id=p_empresa left join separacoes_pedidos p on p.id=r.pedido_id and p.empresa_id=p_empresa where o.empresa_id=p_empresa;
 select coalesce(jsonb_agg(x||jsonb_build_object('fonte','legado')),'[]') into l from jsonb_array_elements(acervo_ordens_legado(p_empresa)) x;
 return n||l;
end $function$
;
