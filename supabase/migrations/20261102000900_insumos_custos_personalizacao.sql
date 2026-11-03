-- Categorias e regras financeiras compartilhadas pelos cadastros.
create or replace function public.operacao_cadastros_config(p_empresa uuid) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare c jsonb;
begin
 if not eh_membro_empresa(p_empresa) then raise exception 'Sem acesso' using errcode='42501';end if;
 select valor into c from almoxarifado_configuracoes where empresa_id=p_empresa and chave='cadastros_operacao';
 return jsonb_build_object(
  'categorias',coalesce(c->'categorias','["Limpeza","Escritório","Manutenção","Marcenaria","Elétrica","Pintura","Costura","Forração","Ferramentas","Embalagem","Diversos"]'::jsonb),
  'custos',jsonb_build_object('custo_hora',coalesce((select custo_hora from personalizacoes where empresa_id=p_empresa and custo_hora is not null group by custo_hora order by count(*) desc,custo_hora desc limit 1),0),'margem',coalesce((select margem from personalizacoes where empresa_id=p_empresa and margem is not null group by margem order by count(*) desc,margem desc limit 1),0),'complexidades',jsonb_build_object('simples',0,'media',15,'alta',30))||coalesce(c->'custos','{}'::jsonb),
  'setores',coalesce((select jsonb_agg(nome order by nome) from rh_cadastro_opcoes where empresa_id=p_empresa and tipo='setor' and ativo),'[]'::jsonb));
end $$;
create or replace function public.operacao_cadastros_salvar(p_empresa uuid,p_config jsonb) returns void
language plpgsql security definer set search_path=public as $$
declare v text;n numeric;
begin
 if not eh_membro_empresa(p_empresa) or not operacao_pode(p_empresa,'configuracoes.empresa.editar') then raise exception 'Sem permissão para alterar parâmetros' using errcode='42501';end if;
 if jsonb_typeof(p_config->'categorias') is distinct from 'array' or jsonb_array_length(p_config->'categorias')=0 then raise exception 'Cadastre pelo menos uma categoria';end if;
 if exists(select 1 from jsonb_array_elements_text(p_config->'categorias') x where length(trim(x)) not between 1 and 80) then raise exception 'Categoria inválida';end if;
 foreach v in array array['custo_hora','margem'] loop
  n:=(p_config->'custos'->>v)::numeric;if n is null or n<0 or n>1000000 then raise exception 'Custo ou margem inválido';end if;
 end loop;
 foreach v in array array['simples','media','alta'] loop
  n:=(p_config->'custos'->'complexidades'->>v)::numeric;if n is null or n<0 or n>1000 then raise exception 'Acréscimo de complexidade inválido';end if;
 end loop;
 perform pg_advisory_xact_lock(hashtextextended('cadastros_operacao:'||p_empresa,0));
 delete from almoxarifado_configuracoes where empresa_id=p_empresa and chave='cadastros_operacao';
 insert into almoxarifado_configuracoes(empresa_id,chave,valor) values(p_empresa,'cadastros_operacao',p_config-'setores');
end $$;
revoke all on function public.operacao_cadastros_config(uuid),public.operacao_cadastros_salvar(uuid,jsonb) from public,anon;
grant execute on function public.operacao_cadastros_config(uuid),public.operacao_cadastros_salvar(uuid,jsonb) to authenticated;
-- O contexto conserva a classificação da peça e as regras vigentes no fechamento.
do $patch$
declare s text;
begin
 select pg_get_functiondef('public.complexidade_contexto(uuid,uuid)'::regprocedure) into s;
 if position('personalizacao_complexidade' in s)=0 then
  s:=replace(s,'''tipo'',pers.tipo,','''tipo'',pers.tipo,''personalizacao_complexidade'',pers.complexidade,');
  s:=replace(s,'''servicos'',coalesce(','''custos_personalizacao'',(select valor->''custos'' from almoxarifado_configuracoes where empresa_id=p_empresa and chave=''cadastros_operacao''),''servicos'',coalesce(');
  execute s;
 end if;
end $patch$;
-- O catálogo usa as mesmas regras do cadastro, inclusive no preço das opções de cartela.
create or replace function public.personalizacao_fator(p public.personalizacoes)
returns numeric language sql stable security definer set search_path=public as $$
 select case when c.valor is null then (1+coalesce(p.margem,0)/100.0)*coalesce(nullif(p.complexidade,0),1)
 else (1+coalesce((c.valor->'custos'->>'margem')::numeric,0)/100.0)*
 (1+coalesce((c.valor->'custos'->'complexidades'->>(case when p.complexidade>=1.3 then 'alta' when p.complexidade>=1.15 then 'media' else 'simples' end))::numeric,0)/100.0) end
 from (select (select valor from almoxarifado_configuracoes where empresa_id=p.empresa_id and chave='cadastros_operacao' limit 1) valor) c
$$;
create or replace function public.personalizacao_preco_base(p public.personalizacoes)
returns numeric language sql stable security definer set search_path=public as $$
 select round(case when p.preco_manual_ativo and p.preco_manual is not null then p.preco_manual
 when c.valor is null then coalesce(p.preco_sugerido,0)
 else greatest(0,coalesce(p.custo_total,0)-coalesce(p.tempo,0)*coalesce(p.custo_hora,0)+coalesce(p.tempo,0)*coalesce((c.valor->'custos'->>'custo_hora')::numeric,0))*public.personalizacao_fator(p) end,2)
 from (select (select valor from almoxarifado_configuracoes where empresa_id=p.empresa_id and chave='cadastros_operacao' limit 1) valor) c
$$;
revoke all on function public.personalizacao_fator(public.personalizacoes),public.personalizacao_preco_base(public.personalizacoes) from public,anon,authenticated;
