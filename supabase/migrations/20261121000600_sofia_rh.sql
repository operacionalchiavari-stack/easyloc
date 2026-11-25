-- A Sofia mantém a chave ideia para preservar conversas, permissões e configurações existentes.
update public.ia_agentes set nome='Sofia · Ideia Premiada',
 descricao='Consulta os módulos de RH e ajuda a equipe a registrar ideias de melhoria.'
where chave='ideia';
insert into public.ia_agentes(chave,nome,descricao,comportamento,coletar,indispensavel,limites)
values('rh','Sofia · Recursos humanos','Assistente dos módulos de recursos humanos.',
 'Responda com clareza, consultando os registros atuais autorizados para a pessoa.',
 'Funcionários, cargos, férias, benefícios, exames, treinamentos, movimentações, ocorrências, freelancers e ideias.',
 'Distinguir dados cadastrados de informações ausentes e citar o módulo consultado.',
 'Somente consulta e orientação. Respeitar permissões, dados protegidos e revisão humana das ideias.')
on conflict(chave) do nothing;

create or replace function public.rh_assistente_contexto(p_empresa uuid)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare
 gestor boolean; cadastro boolean; pessoa uuid:=auth.uid(); r record; linhas jsonb; total bigint;
 dados jsonb:='{}'; acesso boolean; escopo text;
begin
 if pessoa is null or not seguranca_2fa_ok() or not eh_membro_empresa(p_empresa)
 or exists(select 1 from funcionarios_acesso where id=pessoa and empresa_id=p_empresa and not ativo)
 then raise exception 'Sem acesso ao RH desta empresa' using errcode='42501'; end if;
 gestor:=coalesce(rh_pode(p_empresa,'rh.colaboradores.visualizar'),false);
 cadastro:=gestor or coalesce(rh_pode(p_empresa,'rh.funcionarios.visualizar'),false);
 -- Somente tabelas e campos definidos aqui. Nunca leva cofre, CPF, salário, senha, PIX ou arquivos ao modelo.
 for r in select * from (values
  ('funcionarios','funcionarios_acesso',array['id','nome','setor','cargo','data_admissao','ativo','equipe_operacional'],'id','cadastro'),
  ('fichas','rh_fichas',array['funcionario_id','tipo_contrato','jornada','experiencia_fim','status','afastamento_inicio','afastamento_fim','desligamento_data'],'funcionario_id','rh'),
  ('ferias','rh_ferias',array['id','funcionario_id','periodo_inicio','inicio','fim','dias','abono_dias','status','coletiva_nome'],'funcionario_id','rh'),
  ('documentos','rh_documentos',array['id','funcionario_id','nome','categoria','emissao','validade','treinamento_id','turma_id'],'funcionario_id','rh'),
  ('exames','rh_exames',array['id','funcionario_id','nome','tipo','data_realizacao','validade'],'funcionario_id','rh'),
  ('adesoes_beneficios','rh_beneficio_adesoes',array['id','funcionario_id','beneficio_id','desde','dependentes'],'funcionario_id','rh'),
  ('admissao_desligamento','rh_checklists',array['id','funcionario_id','tipo','itens','concluido_em'],'funcionario_id','rh'),
  ('ocorrencias','controle_rh_ocorrencias',array['id','funcionario_id','data_ocorrencia','hora_ocorrencia','tipo','setor'],'funcionario_id','rh'),
  ('ideias','ideias_premiadas',array['id','autor_id','autor_nome','titulo','area','status','retorno','premio','created_at'],'autor_id','ideias'),
  ('cargos_setores_parametros','rh_cadastro_opcoes',array['id','tipo','nome','ativo','ordem'],null,'comum'),
  ('beneficios','rh_beneficios',array['id','nome','descricao','meses_carencia','tipos_contrato','adesao','cobranca','ativo'],null,'comum'),
  ('treinamentos','rh_treinamentos',array['id','nome','categoria','carga_horaria','validade_meses','setores_obrigatorios','descricao','ativo'],null,'comum'),
  ('tipos_exames','rh_exames_cadastro',array['id','nome','tipo','validade_meses','setores_obrigatorios','ativo'],null,'comum'),
  ('turmas','rh_turmas',array['id','treinamento_id','data','instrutor','local','carga_horaria'],null,'gestor'),
  ('freelancers','free_cadastros',array['id','nome','status','nota'],null,'free'),
  ('freelancers_inscricoes','free_inscricoes',array['id','vaga_id','free_id','nome','status','checkin_em','checkout_em'],null,'free'),
  ('freelancers_pagamentos','free_rh_pagamentos',array['inscricao_id','ciclo','nao_pagar','valor_pago','pago_em'],null,'free')
 ) as t(chave,tabela,campos,coluna_pessoa,permissao) loop
  acesso:=case r.permissao
   when 'cadastro' then cadastro when 'rh' then gestor
   when 'comum' then true when 'gestor' then gestor
   when 'ideias' then coalesce(funcionario_pode(p_empresa,pessoa,'rh.ideias.visualizar'),false)
   when 'free' then (coalesce(rh_pode(p_empresa,'rh.colaboradores.editar'),false)
     or coalesce(funcionario_pode(p_empresa,pessoa,'logistica.cronograma.montagem'),false))
     and coalesce(funcionario_tabela_permitida(p_empresa,r.tabela,'visualizar'),false)
   else false end;
  escopo:=case when acesso then 'empresa' when r.coluna_pessoa is not null then 'proprio' else 'sem_permissao' end;
  if escopo='sem_permissao' then
   dados:=dados||jsonb_build_object(r.chave,jsonb_build_object('acesso',escopo));continue;
  end if;
  if to_regclass('public.'||r.tabela) is null then
   dados:=dados||jsonb_build_object(r.chave,jsonb_build_object('acesso','indisponivel'));continue;
  end if;
  -- Ordem estável e total explícito: contexto limitado jamais se apresenta como uma lista completa.
  execute format('select count(*) from public.%I t where empresa_id=$1 %s',r.tabela,
   case when escopo='proprio' then format('and %I=$2',r.coluna_pessoa) else '' end)
   into total using p_empresa,pessoa;
  execute format('select coalesce(jsonb_agg(item),''[]''::jsonb) from (
   select (select jsonb_object_agg(c,to_jsonb(t)->c) from unnest($3::text[]) c) item
   from public.%I t where empresa_id=$1 %s order by to_jsonb(t)->>coalesce($3[1],''id'') limit 200) q',r.tabela,
   case when escopo='proprio' then format('and %I=$2',r.coluna_pessoa) else '' end)
   into linhas using p_empresa,pessoa,r.campos;
  dados:=dados||jsonb_build_object(r.chave,jsonb_build_object('acesso',escopo,'total',total,'parcial',total>200,'registros',linhas));
 end loop;
 return jsonb_build_object('empresa_id',p_empresa,'usuario_id',pessoa,'gestor_rh',gestor,
  'consultado_em',now(),'hoje',(now() at time zone 'America/Sao_Paulo')::date,'modulos',dados);
end $$;
revoke all on function public.rh_assistente_contexto(uuid) from public,anon;
grant execute on function public.rh_assistente_contexto(uuid) to authenticated;
notify pgrst,'reload schema';
