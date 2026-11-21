-- 15/11/2026: tipos de personalização cadastrados em Parâmetros (Produção > Personalizações), junto com custo por hora,
-- margem e acréscimos de complexidade. Tudo fica em almoxarifado_configuracoes chave 'cadastros_operacao'.
-- O salvar passa a JUNTAR o que veio com o que já existe (cada card manda só a sua parte).

create or replace function public.operacao_cadastros_config(p_empresa uuid) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare c jsonb;
begin
 if not eh_membro_empresa(p_empresa) then raise exception 'Sem acesso' using errcode='42501';end if;
 select valor into c from almoxarifado_configuracoes where empresa_id=p_empresa and chave='cadastros_operacao';
 return jsonb_build_object(
  'categorias',coalesce(c->'categorias','["Limpeza","Escritório","Manutenção","Marcenaria","Elétrica","Pintura","Costura","Forração","Ferramentas","Embalagem","Diversos"]'::jsonb),
  'tipos_personalizacao',coalesce(c->'tipos_personalizacao','["Pintura","Forração","Adesivação","Outro"]'::jsonb),
  'custos',jsonb_build_object('custo_hora',coalesce((select custo_hora from personalizacoes where empresa_id=p_empresa and custo_hora is not null group by custo_hora order by count(*) desc,custo_hora desc limit 1),0),'margem',coalesce((select margem from personalizacoes where empresa_id=p_empresa and margem is not null group by margem order by count(*) desc,margem desc limit 1),0),'complexidades',jsonb_build_object('simples',0,'media',15,'alta',30))||coalesce(c->'custos','{}'::jsonb),
  'setores',coalesce((select jsonb_agg(nome order by nome) from rh_cadastro_opcoes where empresa_id=p_empresa and tipo='setor' and ativo),'[]'::jsonb));
end $$;

create or replace function public.operacao_cadastros_salvar(p_empresa uuid,p_config jsonb) returns void
language plpgsql security definer set search_path=public as $$
declare v text;n numeric;atual jsonb;novo jsonb;
begin
 if not eh_membro_empresa(p_empresa) or not operacao_pode(p_empresa,'configuracoes.empresa.editar') then raise exception 'Sem permissão para alterar parâmetros' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('cadastros_operacao:'||p_empresa,0));
 atual:=operacao_cadastros_config(p_empresa)-'setores';
 novo:=atual||(coalesce(p_config,'{}'::jsonb)-'setores');
 if p_config ? 'custos' then novo:=jsonb_set(novo,'{custos}',(atual->'custos')||(p_config->'custos')); end if;
 if jsonb_typeof(novo->'categorias') is distinct from 'array' or jsonb_array_length(novo->'categorias')=0 then raise exception 'Cadastre pelo menos uma categoria';end if;
 if exists(select 1 from jsonb_array_elements_text(novo->'categorias') x where length(trim(x)) not between 1 and 80) then raise exception 'Categoria inválida';end if;
 if jsonb_typeof(novo->'tipos_personalizacao') is distinct from 'array' or jsonb_array_length(novo->'tipos_personalizacao')=0 then raise exception 'Cadastre pelo menos um tipo de personalização';end if;
 if exists(select 1 from jsonb_array_elements_text(novo->'tipos_personalizacao') x where length(trim(x)) not between 1 and 60) then raise exception 'Tipo de personalização inválido';end if;
 foreach v in array array['custo_hora','margem'] loop
  n:=(novo->'custos'->>v)::numeric;if n is null or n<0 or n>1000000 then raise exception 'Custo ou margem inválido';end if;
 end loop;
 foreach v in array array['simples','media','alta'] loop
  n:=(novo->'custos'->'complexidades'->>v)::numeric;if n is null or n<0 or n>1000 then raise exception 'Acréscimo de complexidade inválido';end if;
 end loop;
 delete from almoxarifado_configuracoes where empresa_id=p_empresa and chave='cadastros_operacao';
 insert into almoxarifado_configuracoes(empresa_id,chave,valor) values(p_empresa,'cadastros_operacao',novo);
end $$;
revoke all on function public.operacao_cadastros_config(uuid),public.operacao_cadastros_salvar(uuid,jsonb) from public,anon;
grant execute on function public.operacao_cadastros_config(uuid),public.operacao_cadastros_salvar(uuid,jsonb) to authenticated;
notify pgrst,'reload schema';
