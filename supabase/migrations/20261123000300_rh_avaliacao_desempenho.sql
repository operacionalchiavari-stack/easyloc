-- Avaliação do RH: ocorrências com pesos versionados e atribuição por funcionário.
create table public.rh_desempenho_config (
 empresa_id uuid primary key references empresas(id) on delete cascade,
 periodo text not null default 'acumulado' check(periodo='acumulado'),
 teto numeric(8,2) not null default 10 check(teto=10),
 versao integer not null default 1, atualizado_em timestamptz not null default now()
);
create table public.rh_desempenho_regras (
 id uuid primary key default gen_random_uuid(), empresa_id uuid not null references empresas(id) on delete cascade,
 origem text not null check(origem in ('automatica','rh')), chave text not null, nome text not null,
 pontos numeric(5,2) not null default 0 check(pontos between -10 and 10), ativa boolean not null default true,
 versao integer not null default 1, atualizado_em timestamptz not null default now(), unique(empresa_id,origem,chave)
);
create table public.rh_desempenho_eventos (
 id uuid primary key default gen_random_uuid(), empresa_id uuid not null references empresas(id) on delete cascade,
 funcionario_id uuid references funcionarios_acesso(id) on delete set null,
 origem text not null check(origem in ('automatica','rh')), origem_id uuid not null,
 regra_id uuid not null references rh_desempenho_regras(id), regra_versao integer not null,
 chave text not null, nome text not null, pontos numeric(5,2) not null,
 data_ocorrencia date not null, observacao text, estado_origem text not null,
 elegivel boolean not null, vinculo_manual boolean not null default false,
 vinculado_por uuid, vinculado_em timestamptz, criado_em timestamptz not null default now(),
 unique(empresa_id,origem,origem_id)
);
create index rh_desempenho_eventos_pessoa on rh_desempenho_eventos(empresa_id,funcionario_id,data_ocorrencia);
create index rh_desempenho_eventos_origem on rh_desempenho_eventos(origem,origem_id);
alter table rh_desempenho_config enable row level security;
alter table rh_desempenho_regras enable row level security;
alter table rh_desempenho_eventos enable row level security;
revoke all on rh_desempenho_config,rh_desempenho_regras,rh_desempenho_eventos from public,anon,authenticated;

create function public.rh_desempenho_chave(p_texto text) returns text language sql immutable set search_path=public,pg_temp as $$
 select trim(both '_' from regexp_replace(lower(translate(btrim(coalesce(p_texto,'')),
 'ÁÀÂÃÉÊÍÓÔÕÚÇáàâãéêíóôõúç','AAAAEEIOOOUCaaaaeeiooouc')),'[^a-z0-9]+','_','g'))
$$;
create function public.rh_desempenho_preparar(p_empresa uuid) returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
 insert into rh_desempenho_config(empresa_id) values(p_empresa) on conflict do nothing;
 insert into rh_desempenho_regras(empresa_id,origem,chave,nome) values
 (p_empresa,'automatica','equipe_sem_escala','Equipe sem escala registrada'),
 (p_empresa,'automatica','caminhao_sem_escala','Caminhão sem programação'),
 (p_empresa,'automatica','equipe_incompleta','Vagas com confirmações insuficientes'),
 (p_empresa,'automatica','atraso_inicio','Atraso de início'),
 (p_empresa,'automatica','checkin_ausente','Check-in não registrado'),
 (p_empresa,'automatica','checkin_atrasado','Check-in fora do horário'),
 (p_empresa,'automatica','checkout_ausente','Check-out não registrado'),
 (p_empresa,'automatica','chegada_fora_area','Chegada registrada fora da área'),
 (p_empresa,'automatica','confirmacao_entrega_atrasada','Confirmação de entrega fora do horário'),
 (p_empresa,'automatica','confirmacao_coleta_atrasada','Confirmação de coleta fora do horário'),
 (p_empresa,'automatica','carregamento_incompleto','Carregamento incompleto'),
 (p_empresa,'automatica','entrega_incompleta','Entrega incompleta'),
 (p_empresa,'automatica','coleta_incompleta','Coleta incompleta'),
 (p_empresa,'automatica','divergencia_entrega','Diferença entre conferências de entrega'),
 (p_empresa,'automatica','divergencia_desmontagem_retorno','Diferença entre desmontagem e retorno'),
 (p_empresa,'automatica','divergencia_contagens','Divergência entre contagens'),
 (p_empresa,'automatica','divergencia_contagem_geral','Divergência na contagem geral'),
 (p_empresa,'automatica','divergencia_inventario','Divergência de inventário'),
 (p_empresa,'automatica','retorno_pendente','Triagem de volta pendente'),
 (p_empresa,'automatica','checklist_incompleto','Checklist incompleto'),
 (p_empresa,'automatica','evidencia_ausente','Evidência obrigatória ausente'),
 (p_empresa,'automatica','posicionamento_incorreto','Posicionamento incorreto'),
 (p_empresa,'automatica','uniforme_reprovado','Uniformização reprovada'),
 (p_empresa,'automatica','reprovacao','Inspeção reprovada'),
 (p_empresa,'automatica','envio_reprovado','Item enviado após reprovação'),
 (p_empresa,'automatica','revisao_sem_registro','Envio sem revisão registrada'),
 (p_empresa,'automatica','falta','Falta'),
 (p_empresa,'automatica','avaria','Avaria'),
 (p_empresa,'automatica','avaria_entrega','Avaria identificada na entrega'),
 (p_empresa,'automatica','perda','Perda confirmada'),
 (p_empresa,'automatica','sem_protecao','Proteção não aplicada'),
 (p_empresa,'automatica','protecao_insuficiente','Proteção insuficiente'),
 (p_empresa,'automatica','saida_sem_registro','Saída sem registro'),
 (p_empresa,'automatica','estoque_material_negativo','Estoque de proteção negativo'),
 (p_empresa,'automatica','estoque_material_sem_contagem','Estoque de proteção não conferido'),
 (p_empresa,'automatica','troca_solicitada','Troca de material solicitada'),
 (p_empresa,'automatica','feedback_operacional_negativo','Relato operacional negativo do cliente'),
 (p_empresa,'automatica','alerta_motorista','Alerta do motorista'),
 (p_empresa,'automatica','sobra','Sobra de materiais'),
 (p_empresa,'rh','atraso','Atraso'),
 (p_empresa,'rh','sem_uniforme','Sem uniforme'),
 (p_empresa,'rh','sem_epi','Sem EPI'),
 (p_empresa,'rh','uso_de_celular','Uso de celular'),
 (p_empresa,'rh','falta','Falta do funcionário'),
 (p_empresa,'rh','ausencia_de_jornada','Ausência de jornada'),
 (p_empresa,'rh','advertencia','Advertência'),
 (p_empresa,'rh','reconhecimento','Reconhecimento')
 on conflict(empresa_id,origem,chave) do nothing;
end $$;

create function public.rh_desempenho_capturar(p_empresa uuid,p_origem text,p_id uuid,p_funcionario uuid,p_chave text,p_nome text,p_data date,p_observacao text,p_estado text,p_elegivel boolean)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare r rh_desempenho_regras;
begin
 if not exists(select 1 from rh_desempenho_config where empresa_id=p_empresa) then perform rh_desempenho_preparar(p_empresa);end if;
 if p_funcionario is not null and not exists(select 1 from funcionarios_acesso where id=p_funcionario and empresa_id=p_empresa) then p_funcionario:=null;end if;
 insert into rh_desempenho_regras(empresa_id,origem,chave,nome) values(p_empresa,p_origem,p_chave,p_nome) on conflict do nothing;
 select * into strict r from rh_desempenho_regras where empresa_id=p_empresa and origem=p_origem and chave=p_chave;
 insert into rh_desempenho_eventos(empresa_id,funcionario_id,origem,origem_id,regra_id,regra_versao,chave,nome,pontos,data_ocorrencia,observacao,estado_origem,elegivel)
 values(p_empresa,p_funcionario,p_origem,p_id,r.id,r.versao,p_chave,r.nome,case when r.ativa then r.pontos else 0 end,coalesce(p_data,(now() at time zone 'America/Sao_Paulo')::date),p_observacao,p_estado,coalesce(p_elegivel,false))
 on conflict(empresa_id,origem,origem_id) do update set
 funcionario_id=case when rh_desempenho_eventos.vinculo_manual then rh_desempenho_eventos.funcionario_id else excluded.funcionario_id end,
 data_ocorrencia=excluded.data_ocorrencia,observacao=excluded.observacao,estado_origem=excluded.estado_origem,
 elegivel=case when excluded.estado_origem='resolvida' then rh_desempenho_eventos.elegivel else excluded.elegivel end,
 regra_id=excluded.regra_id,
 regra_versao=case when rh_desempenho_eventos.chave=excluded.chave then rh_desempenho_eventos.regra_versao else excluded.regra_versao end,
 pontos=case when rh_desempenho_eventos.chave=excluded.chave then rh_desempenho_eventos.pontos else excluded.pontos end,
 nome=case when rh_desempenho_eventos.chave=excluded.chave then rh_desempenho_eventos.nome else excluded.nome end,chave=excluded.chave;
end $$;

create function public.rh_desempenho_fonte() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare f uuid;d date;estado text;chave text;
begin
 if tg_op='DELETE' then
  update rh_desempenho_eventos set estado_origem='cancelada',elegivel=false where empresa_id=old.empresa_id and origem_id=old.id and origem=case when tg_table_name='controle_rh_ocorrencias' then 'rh' else 'automatica' end;
  return old;
 end if;
 if tg_table_name='controle_rh_ocorrencias' then
  perform rh_desempenho_capturar(new.empresa_id,'rh',new.id,new.funcionario_id,rh_desempenho_chave(new.tipo),new.tipo,new.data_ocorrencia,new.observacao,'registrada',true);
 else
  begin f:=(new.dados->>'funcionario_id')::uuid;exception when invalid_text_representation then f:=null;end;
  begin d:=((new.dados->>'data')::timestamptz at time zone 'America/Sao_Paulo')::date;exception when others then d:=null;end;
  chave:=coalesce(nullif(new.dados->>'tipo',''),'ocorrencia');estado:=coalesce(new.dados->>'status','aberta');
  perform rh_desempenho_capturar(new.empresa_id,'automatica',new.id,f,chave,initcap(replace(chave,'_',' ')),coalesce(d,(new.primeira_deteccao at time zone 'America/Sao_Paulo')::date),new.dados->>'descricao',estado,estado in ('registrada','confirmada','perda_confirmada'));
 end if;
 return new;
end $$;
create trigger rh_desempenho_rh after insert or update or delete on controle_rh_ocorrencias for each row execute function rh_desempenho_fonte();
create trigger rh_desempenho_operacao after insert or update of dados or delete on operacao_casos_automaticos for each row execute function rh_desempenho_fonte();

create function public.rh_desempenho_parametros(p_empresa uuid) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if not seguranca_2fa_ok() or not (rh_pode(p_empresa,'rh.colaboradores.visualizar') or rh_pode(p_empresa,'configuracoes.empresa.editar')) then raise exception 'Sem permissão para consultar os parâmetros de desempenho.';end if;
 perform rh_desempenho_preparar(p_empresa);
 return jsonb_build_object('config',(select to_jsonb(c)-'empresa_id' from rh_desempenho_config c where empresa_id=p_empresa),'regras',(select jsonb_agg(to_jsonb(r)-'empresa_id' order by origem,nome) from rh_desempenho_regras r where empresa_id=p_empresa));
end $$;
create function public.rh_desempenho_parametros_salvar(p_empresa uuid,p_config jsonb,p_regras jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare x jsonb;r rh_desempenho_regras;n numeric;
begin
 if not seguranca_2fa_ok() or not rh_pode(p_empresa,'configuracoes.empresa.editar') then raise exception 'Sem permissão para editar parâmetros.';end if;
 if jsonb_typeof(p_regras) is distinct from 'array' or jsonb_array_length(p_regras)>500 then raise exception 'Parâmetros inválidos.';end if;
 perform rh_desempenho_preparar(p_empresa);
 update rh_desempenho_config set periodo=p_config->>'periodo',teto=nullif(p_config->>'teto','')::numeric,versao=versao+1,atualizado_em=now() where empresa_id=p_empresa and versao=(p_config->>'versao')::integer;
 if not found then raise exception 'A configuração mudou. Atualize a página antes de salvar.';end if;
 for x in select * from jsonb_array_elements(p_regras) loop
  n:=(x->>'pontos')::numeric;
  if n is null or n::text in ('NaN','Infinity','-Infinity') or n not between -10 and 10 or n<>round(n,2) then raise exception 'Use pontos entre -10 e 10, com até duas casas decimais.';end if;
  select * into r from rh_desempenho_regras where id=(x->>'id')::uuid and empresa_id=p_empresa for update;
  if not found or r.versao is distinct from (x->>'versao')::integer then raise exception 'Uma regra mudou. Atualize a página antes de salvar.';end if;
  if r.pontos<>n or r.ativa is distinct from (x->>'ativa')::boolean then
   update rh_desempenho_regras set pontos=n,ativa=(x->>'ativa')::boolean,versao=versao+1,atualizado_em=now() where id=r.id;
  end if;
 end loop;
 return rh_desempenho_parametros(p_empresa);
end $$;

create function public.rh_desempenho_nota(p_delta numeric,p_teto numeric) returns numeric language sql immutable set search_path=public,pg_temp as $$
 select greatest(0,case when p_teto is null then 10+coalesce(p_delta,0) else least(p_teto,10+coalesce(p_delta,0)) end)
$$;
-- Limita cada lançamento: pontos positivos acima de 10 não viram crédito futuro.
create function public.rh_desempenho_saldo(p_empresa uuid,p_funcionario uuid,p_inicio date,p_fim date) returns numeric language plpgsql stable set search_path=public,pg_temp as $$
declare nota numeric:=10;e record;
begin
 for e in select pontos from rh_desempenho_eventos where empresa_id=p_empresa and funcionario_id=p_funcionario
  and elegivel and estado_origem not in ('cancelada','em_revisao') and (p_inicio is null or data_ocorrencia>=p_inicio) and data_ocorrencia<=p_fim
  order by data_ocorrencia,criado_em,id loop
  nota:=greatest(0,least(10,nota+e.pontos));
 end loop;
 return nota;
end $$;
create function public.rh_desempenho_contexto(p_empresa uuid,p_inicio date default null,p_fim date default null,p_todos boolean default false) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare cfg rh_desempenho_config;ini date;fim date;hoje date:=(now() at time zone 'America/Sao_Paulo')::date;ps jsonb;sem_pessoa jsonb;
begin
 if not seguranca_2fa_ok() or not rh_pode(p_empresa,'rh.colaboradores.visualizar') then raise exception 'Sem permissão para consultar avaliações.';end if;
 perform rh_desempenho_preparar(p_empresa);
 perform ocorrencias_sincronizar(p_empresa);
 select * into cfg from rh_desempenho_config where empresa_id=p_empresa;
 ini:=case when p_todos then null else p_inicio end;fim:=coalesce(p_fim,hoje);
 if ini>fim then raise exception 'A data inicial deve ser anterior à final.';end if;
 with eventos as (
  select e.*,case when elegivel and estado_origem not in ('cancelada','em_revisao') then pontos else 0 end impacto
  from rh_desempenho_eventos e where empresa_id=p_empresa and data_ocorrencia<=fim
 ), totais as (
  select funcionario_id,sum(impacto) delta,coalesce(sum(impacto) filter(where impacto>0),0) ganhos,coalesce(-sum(impacto) filter(where impacto<0),0) descontos,count(*) quantidade,count(*) filter(where not elegivel and estado_origem not in ('cancelada','em_revisao')) pendentes
  from eventos where funcionario_id is not null group by funcionario_id
 )
 select coalesce(jsonb_agg(jsonb_build_object('id',f.id,'nome',f.nome,'setor',f.setor,'cargo',f.cargo,'ativo',f.ativo,'nota',rh_desempenho_saldo(p_empresa,f.id,null,fim),'ganhos',coalesce(t.ganhos,0),'descontos',coalesce(t.descontos,0),'quantidade',coalesce(t.quantidade,0),'pendentes',coalesce(t.pendentes,0),
 'evolucao',(select coalesce(jsonb_agg(jsonb_build_object('mes',m::date,'nota',rh_desempenho_saldo(p_empresa,f.id,null,least(fim,(m+interval '1 month')::date-1))) order by m),'[]') from generate_series(greatest(date_trunc('month',fim)-interval '5 months',date_trunc('month',coalesce(ini,fim-interval '5 months'))),date_trunc('month',fim),interval '1 month') m)) order by f.nome),'[]') into ps
 from funcionarios_acesso f left join totais t on t.funcionario_id=f.id where f.empresa_id=p_empresa;
 select coalesce(jsonb_agg(to_jsonb(e) order by e.data_ocorrencia desc),'[]') into sem_pessoa from (
  select id,nome,origem,origem_id,data_ocorrencia,pontos,observacao,elegivel from rh_desempenho_eventos where empresa_id=p_empresa and funcionario_id is null and estado_origem not in ('cancelada','em_revisao') and (ini is null or data_ocorrencia>=ini) and data_ocorrencia<=fim order by data_ocorrencia desc,id limit 100
 ) e;
 return jsonb_build_object('inicio',ini,'fim',fim,'config',to_jsonb(cfg)-'empresa_id','pessoas',ps,'sem_funcionario',sem_pessoa,'sem_funcionario_total',(select count(*) from rh_desempenho_eventos where empresa_id=p_empresa and funcionario_id is null and estado_origem not in ('cancelada','em_revisao') and (ini is null or data_ocorrencia>=ini) and data_ocorrencia<=fim),'regras_com_pontos',(select count(*) from rh_desempenho_regras where empresa_id=p_empresa and ativa and pontos<>0));
end $$;

create function public.rh_desempenho_detalhe(p_empresa uuid,p_funcionario uuid,p_inicio date default null,p_fim date default null,p_pagina integer default 0) returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare lista jsonb;total integer;
begin
 if not seguranca_2fa_ok() or not rh_pode(p_empresa,'rh.colaboradores.visualizar') then raise exception 'Sem permissão para consultar avaliações.';end if;
 if not exists(select 1 from funcionarios_acesso where id=p_funcionario and empresa_id=p_empresa) then raise exception 'Funcionário inválido.';end if;
 if p_pagina is null or p_pagina<0 or p_pagina>100000 then raise exception 'Página inválida.';end if;
 select count(*) into total from rh_desempenho_eventos where empresa_id=p_empresa and funcionario_id=p_funcionario and (p_inicio is null or data_ocorrencia>=p_inicio) and (p_fim is null or data_ocorrencia<=p_fim);
 select coalesce(jsonb_agg(to_jsonb(e) order by e.data_ocorrencia desc,e.id),'[]') into lista from (
  select id,nome,origem,origem_id,data_ocorrencia,observacao,pontos,regra_versao,
   case when estado_origem in ('cancelada','em_revisao') then 'desconsiderada' when not elegivel then 'em_apuracao' when pontos=0 then 'neutra' else 'aplicada' end estado,
   case when elegivel and estado_origem not in ('cancelada','em_revisao') then pontos else 0 end impacto
  from rh_desempenho_eventos where empresa_id=p_empresa and funcionario_id=p_funcionario and (p_inicio is null or data_ocorrencia>=p_inicio) and (p_fim is null or data_ocorrencia<=p_fim) order by data_ocorrencia desc,id limit 50 offset p_pagina*50
 ) e;
 return jsonb_build_object('itens',lista,'total',total,'pagina',p_pagina);
end $$;
create function public.rh_desempenho_vincular(p_empresa uuid,p_evento uuid,p_funcionario uuid) returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if not seguranca_2fa_ok() or not rh_pode(p_empresa,'rh.colaboradores.editar') then raise exception 'Sem permissão para vincular ocorrências.';end if;
 if not exists(select 1 from funcionarios_acesso where id=p_funcionario and empresa_id=p_empresa) then raise exception 'Funcionário inválido.';end if;
 update rh_desempenho_eventos set funcionario_id=p_funcionario,vinculo_manual=true,vinculado_por=auth.uid(),vinculado_em=now() where id=p_evento and empresa_id=p_empresa and funcionario_id is null;
 if not found then raise exception 'Ocorrência já vinculada ou não encontrada. Atualize a avaliação.';end if;
end $$;

-- Registros anteriores entram sem desconto: os pesos iniciais são neutros.
do $$declare e record;f uuid;d date;begin
 for e in select distinct empresa_id from funcionarios_acesso loop perform rh_desempenho_preparar(e.empresa_id);end loop;
 for e in select * from controle_rh_ocorrencias loop
  perform rh_desempenho_capturar(e.empresa_id,'rh',e.id,e.funcionario_id,rh_desempenho_chave(e.tipo),e.tipo,e.data_ocorrencia,e.observacao,'registrada',true);
 end loop;
 -- A projeção operacional é capturada sem alterar suas fontes.
 for e in select * from operacao_casos_automaticos loop
  begin f:=(e.dados->>'funcionario_id')::uuid;exception when invalid_text_representation then f:=null;end;
  begin d:=((e.dados->>'data')::timestamptz at time zone 'America/Sao_Paulo')::date;exception when others then d:=null;end;
  perform rh_desempenho_capturar(e.empresa_id,'automatica',e.id,f,coalesce(nullif(e.dados->>'tipo',''),'ocorrencia'),initcap(replace(coalesce(e.dados->>'tipo','Ocorrência'),'_',' ')),coalesce(d,(e.primeira_deteccao at time zone 'America/Sao_Paulo')::date),e.dados->>'descricao',coalesce(e.dados->>'status','aberta'),e.dados->>'status' in ('registrada','confirmada','perda_confirmada'));
 end loop;
end $$;

revoke all on function rh_desempenho_chave(text),rh_desempenho_preparar(uuid),rh_desempenho_capturar(uuid,text,uuid,uuid,text,text,date,text,text,boolean),rh_desempenho_fonte(),rh_desempenho_nota(numeric,numeric),rh_desempenho_saldo(uuid,uuid,date,date) from public,anon,authenticated;
revoke all on function rh_desempenho_parametros(uuid),rh_desempenho_parametros_salvar(uuid,jsonb,jsonb),rh_desempenho_contexto(uuid,date,date,boolean),rh_desempenho_detalhe(uuid,uuid,date,date,integer),rh_desempenho_vincular(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function rh_desempenho_parametros(uuid),rh_desempenho_parametros_salvar(uuid,jsonb,jsonb),rh_desempenho_contexto(uuid,date,date,boolean),rh_desempenho_detalhe(uuid,uuid,date,date,integer),rh_desempenho_vincular(uuid,uuid,uuid) to authenticated;
notify pgrst,'reload schema';
