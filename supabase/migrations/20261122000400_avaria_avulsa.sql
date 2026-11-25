-- Enviar para a manutenção uma peça danificada encontrada no depósito, fora de qualquer pedido (22/11/2026).
-- A equipe do galpão escolhe o item, a quantidade, descreve o dano (fotos opcionais) e o setor: a peça sai
-- do disponível na hora e a O.S nasce no setor. Depois segue o caminho de sempre (setor conclui -> Triagem aprova).

alter table public.acervo_retornos drop constraint if exists acervo_retornos_origem_check;
alter table public.acervo_retornos add constraint acervo_retornos_origem_check
  check (origem = any (array['coleta','inventario','triagem_retorno','separacao','avulsa']));
alter table public.acervo_retornos drop constraint if exists acervo_origem_valida;
alter table public.acervo_retornos add constraint acervo_origem_valida check (
 (origem in ('coleta','triagem_retorno') and pedido_id is not null and inventario_id is null)
 or (origem = 'inventario' and pedido_id is null and inventario_id is not null)
 or (origem in ('separacao','avulsa') and pedido_id is null and inventario_id is null));

create or replace function public.acervo_avaria_avulsa(p_empresa uuid, p_item uuid, p_quantidade integer, p_descricao text,
  p_setor text, p_fotos jsonb default '[]'::jsonb, p_local text default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare i itens; fora numeric; r acervo_retornos; os uuid; n bigint; ev jsonb; quem text;
begin
 if not acervo_triagem_pode(p_empresa) then raise exception 'Sem permissão para enviar peças para a manutenção'; end if;
 if coalesce(p_quantidade,0) <= 0 then raise exception 'Informe quantas peças estão danificadas'; end if;
 if length(btrim(coalesce(p_descricao,''))) < 5 then raise exception 'Descreva o dano (pelo menos 5 letras)'; end if;
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
