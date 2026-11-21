-- Triagem da volta (16/11/2026): cada item danificado já vai com o setor de manutenção escolhido (p_setores {chave: setor}).
-- Sem setor (chamadas antigas), a avaria fica registrada sem O.S e aparece em "Sem setor" no Controle de qualidade da Triagem.
drop function if exists public.operacao_concluir_retorno_avarias(uuid,text,boolean,jsonb,jsonb,jsonb,jsonb,jsonb);
CREATE OR REPLACE FUNCTION public.operacao_concluir_retorno_avarias(p_pedido uuid, p_etapa text, p_aceitar_faltas boolean DEFAULT false, p_quantidades jsonb DEFAULT NULL::jsonb, p_observacoes jsonb DEFAULT NULL::jsonb, p_primeira jsonb DEFAULT NULL::jsonb, p_danificados jsonb DEFAULT '{}'::jsonb, p_fotos jsonb DEFAULT '{}'::jsonb, p_setores jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare p separacoes_pedidos;r jsonb;c record;k text;q numeric;conhecida numeric;adicional numeric;atual numeric;f jsonb;
begin
 select * into strict p from separacoes_pedidos where id=p_pedido for update;
 if auth.uid() is null or not eh_membro_empresa(p.empresa_id) or not funcionario_tabela_permitida(p.empresa_id,'separacoes_pedidos','editar') then raise exception 'Sem permissao para confirmar';end if;
 if p_etapa<>'retorno' then raise exception 'Esta confirmacao e exclusiva da triagem de volta';end if;
 if p.operacao->'retorno'->>'concluido_em' is not null then raise exception 'Triagem ja confirmada. Atualize a tela.';end if;
 if jsonb_typeof(p_danificados) is distinct from 'object' then raise exception 'Quantidades de danos invalidas';end if;
 for k in select jsonb_object_keys(p_danificados) loop
  if not exists(select 1 from operacao_conferencia_pecas(p.id,true) pc where pc.chave=k) then raise exception 'Item danificado nao pertence ao pedido';end if;
  q:=(p_danificados->>k)::numeric;
  if q is null or q<0 or q<>trunc(q) or q>coalesce((p_quantidades->>k)::numeric,0) then raise exception 'Danificados devem fazer parte da quantidade que voltou';end if;
 end loop;
 r:=operacao_concluir_conferencia(p_pedido,p_etapa,p_aceitar_faltas,p_quantidades,p_observacoes,p_primeira);
 for c in select * from operacao_conferencia_pecas(p.id,true) loop
  if not(p_danificados ? c.chave) then continue;end if;
  q:=(p_danificados->>c.chave)::numeric;
  select coalesce(sum(quantidade),0) into conhecida from acervo_retornos where pedido_id=any(pedido_grupo(p.id)) and item_id=c.item_id and tipo='avaria' and chave<>'retorno:'||c.chave;
  adicional:=greatest(q-conhecida,0);
  select quantidade into atual from acervo_retornos where pedido_id=c.pedido_id and chave='retorno:'||c.chave and tipo='avaria';
  f:=coalesce(p_fotos->c.chave,'[]'::jsonb);
  if adicional<>coalesce(atual,0) or jsonb_array_length(f)>0 then
   if adicional>0 and nullif(coalesce(p_setores,'{}'::jsonb)->>c.chave,'') is not null then
    perform operacao_avaria_retorno(p.id,c.chave,adicional,coalesce(nullif(p_observacoes->>c.chave,''),'Danificado identificado na triagem da volta'),f,p_setores->>c.chave);
   else
    perform operacao_avaria_retorno_base(p.id,c.chave,adicional,coalesce(nullif(p_observacoes->>c.chave,''),'Danificado identificado na triagem da volta'),f);
   end if;
  end if;
 end loop;
 r:=r||jsonb_build_object('danificados',p_danificados);
 update separacoes_pedidos set operacao=jsonb_set(operacao,'{retorno}',r) where id=p.id;
 return r;
end $function$;

revoke all on function public.operacao_concluir_retorno_avarias(uuid,text,boolean,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb) from public, anon;
grant execute on function public.operacao_concluir_retorno_avarias(uuid,text,boolean,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb) to authenticated;
