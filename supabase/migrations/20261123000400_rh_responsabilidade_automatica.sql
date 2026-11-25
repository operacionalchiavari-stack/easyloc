-- Todo lançamento tem responsável; o encaminhamento de uma pendência não presume autoria.
alter table rh_desempenho_config
 add column responsabilidade_ativa boolean not null default false,
 add column responsavel_geral uuid references funcionarios_acesso(id) on delete restrict,
 add column substituto_geral uuid references funcionarios_acesso(id) on delete restrict,
 add constraint rh_desempenho_geral_distinto check(responsavel_geral is distinct from substituto_geral or substituto_geral is null);
alter table rh_desempenho_regras
 add column responsabilidade_modo text not null default 'setor' check(responsabilidade_modo in ('origem','etapa','setor','fixo')),
 add column responsabilidade_setor text not null default 'Administrativo',
 add column responsabilidade_funcionario uuid references funcionarios_acesso(id) on delete restrict,
 add column responsabilidade_suplente uuid references funcionarios_acesso(id) on delete restrict,
 add column responsabilidade_pontua boolean not null default false;
create table rh_desempenho_setores(
 empresa_id uuid not null references empresas(id) on delete cascade,
 setor text not null, chave text not null,
 responsavel_id uuid references funcionarios_acesso(id) on delete restrict,
 substituto_id uuid references funcionarios_acesso(id) on delete restrict,
 versao integer not null default 1, atualizado_em timestamptz not null default now(),
 primary key(empresa_id,chave),check(responsavel_id is distinct from substituto_id or substituto_id is null)
);
alter table rh_desempenho_setores enable row level security;
revoke all on rh_desempenho_setores from public,anon,authenticated;
alter table rh_desempenho_eventos
 add column responsavel_id uuid references funcionarios_acesso(id) on delete restrict,
 add column responsabilidade jsonb,
 add column pontuavel boolean not null default true,
 add column responsabilidade_ativa boolean not null default false;
create index rh_desempenho_responsavel on rh_desempenho_eventos(empresa_id,responsavel_id);
create table rh_desempenho_responsabilidade_historico(
 id uuid primary key default gen_random_uuid(),empresa_id uuid not null references empresas(id),
 evento_id uuid not null references rh_desempenho_eventos(id),
 antes jsonb,depois jsonb not null,alterado_por uuid default auth.uid(),em timestamptz not null default now()
);
alter table rh_desempenho_responsabilidade_historico enable row level security;
revoke all on rh_desempenho_responsabilidade_historico from public,anon,authenticated;

create function rh_desempenho_id(p_texto text) returns uuid language plpgsql immutable set search_path=public,pg_temp as $$
begin return nullif(p_texto,'')::uuid;exception when invalid_text_representation then return null;end $$;
create function rh_desempenho_regra_padrao() returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
 if new.origem='rh' then new.responsabilidade_modo:='origem';new.responsabilidade_setor:='Administrativo';
 elsif new.chave in ('checkin_ausente','checkin_atrasado','checkout_ausente','confirmacao_entrega_atrasada','confirmacao_coleta_atrasada') then
  new.responsabilidade_modo:='origem';new.responsabilidade_setor:='Logística';
 elsif new.chave in ('atraso_inicio','checklist_incompleto','evidencia_ausente','posicionamento_incorreto','chegada_fora_area','carregamento_incompleto','protecao_insuficiente','sem_protecao','saida_sem_registro','retorno_pendente') then
  new.responsabilidade_modo:='etapa';new.responsabilidade_setor:=case when new.chave='retorno_pendente' then 'Triagem' when new.chave in ('atraso_inicio','checklist_incompleto','evidencia_ausente','posicionamento_incorreto','chegada_fora_area') then 'Montagem' else 'Logística' end;
  new.responsabilidade_pontua:=true;
 elsif new.chave in ('reprovacao','revisao_sem_registro','envio_reprovado') then new.responsabilidade_setor:='Triagem';
 elsif new.chave in ('falta','sobra','avaria','avaria_entrega','perda','divergencia_contagens','divergencia_contagem_geral','divergencia_inventario','estoque_material_negativo','estoque_material_sem_contagem') then new.responsabilidade_setor:='Estoque';
 elsif new.chave in ('uniforme_reprovado','troca_solicitada') then new.responsabilidade_modo:='etapa';new.responsabilidade_setor:='Montagem';
 else new.responsabilidade_setor:='Logística';end if;
 return new;
end $$;
create trigger rh_desempenho_regra_padrao before insert on rh_desempenho_regras for each row execute function rh_desempenho_regra_padrao();
-- Os padrões são aplicados também às regras já existentes, sem alterar seus pesos.
do $$declare r rh_desempenho_regras;begin
 for r in select * from rh_desempenho_regras loop
  if r.origem='rh' then update rh_desempenho_regras set responsabilidade_modo='origem',responsabilidade_setor='Administrativo' where id=r.id;
  elsif r.chave in ('checkin_ausente','checkin_atrasado','checkout_ausente','confirmacao_entrega_atrasada','confirmacao_coleta_atrasada') then update rh_desempenho_regras set responsabilidade_modo='origem',responsabilidade_setor='Logística' where id=r.id;
  elsif r.chave in ('atraso_inicio','checklist_incompleto','evidencia_ausente','posicionamento_incorreto','chegada_fora_area','carregamento_incompleto','protecao_insuficiente','sem_protecao','saida_sem_registro','retorno_pendente') then update rh_desempenho_regras set responsabilidade_modo='etapa',responsabilidade_setor=case when r.chave='retorno_pendente' then 'Triagem' when r.chave in ('atraso_inicio','checklist_incompleto','evidencia_ausente','posicionamento_incorreto','chegada_fora_area') then 'Montagem' else 'Logística' end,responsabilidade_pontua=true where id=r.id;
  elsif r.chave in ('reprovacao','revisao_sem_registro','envio_reprovado') then update rh_desempenho_regras set responsabilidade_setor='Triagem' where id=r.id;
  elsif r.chave in ('falta','sobra','avaria','avaria_entrega','perda','divergencia_contagens','divergencia_contagem_geral','divergencia_inventario','estoque_material_negativo','estoque_material_sem_contagem') then update rh_desempenho_regras set responsabilidade_setor='Estoque' where id=r.id;
  elsif r.chave in ('uniforme_reprovado','troca_solicitada') then update rh_desempenho_regras set responsabilidade_modo='etapa',responsabilidade_setor='Montagem' where id=r.id;
  else update rh_desempenho_regras set responsabilidade_setor='Logística' where id=r.id;end if;
 end loop;
end $$;

create function rh_desempenho_responsabilidade_preparar(p_empresa uuid) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare geral uuid;
begin
 perform rh_desempenho_preparar(p_empresa);
 select responsavel_geral into geral from rh_desempenho_config where empresa_id=p_empresa;
 insert into rh_desempenho_setores(empresa_id,setor,chave,responsavel_id)
 select p_empresa,min(f.setor),rh_desempenho_chave(f.setor),case when count(*) filter(where f.ativo and f.lider_operacao)=1 then (array_agg(f.id) filter(where f.ativo and f.lider_operacao))[1] end
 from funcionarios_acesso f where f.empresa_id=p_empresa and nullif(trim(f.setor),'') is not null group by rh_desempenho_chave(f.setor)
 on conflict do nothing;
end $$;
create function rh_desempenho_disponivel(p_empresa uuid,p_funcionario uuid,p_data date) returns boolean language sql stable set search_path=public,pg_temp as $$
 select exists(select 1 from funcionarios_acesso where id=p_funcionario and empresa_id=p_empresa and ativo) and rh_escala_dia(p_empresa,p_funcionario,p_data) is null
$$;

create function rh_desempenho_resolver(p_empresa uuid,p_origem text,p_id uuid,p_funcionario uuid,p_chave text,p_data date) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
#variable_conflict use_column
declare cfg rh_desempenho_config;r rh_desempenho_regras;s rh_desempenho_setores;d jsonb;origem_rh record;
 assunto uuid;dono uuid;etapa uuid;pedido uuid;ids uuid[];tipo_etapa text;prefixo text;id_fonte uuid;motivo text;substituido uuid;aplica boolean:=false;externo boolean:=false;
begin
 perform rh_desempenho_responsabilidade_preparar(p_empresa);
 select * into strict cfg from rh_desempenho_config where empresa_id=p_empresa;
 select * into strict r from rh_desempenho_regras where empresa_id=p_empresa and origem=p_origem and chave=p_chave;
 if p_funcionario is not null and exists(select 1 from funcionarios_acesso where id=p_funcionario and empresa_id=p_empresa) then assunto:=p_funcionario;end if;
 if p_origem='rh' then
  if assunto is null then
   select funcionario_nome,setor into origem_rh from controle_rh_ocorrencias where id=p_id and empresa_id=p_empresa;
   if found then
    select array_agg(id) into ids from funcionarios_acesso where empresa_id=p_empresa and rh_desempenho_chave(nome)=rh_desempenho_chave(origem_rh.funcionario_nome)
     and (nullif(origem_rh.setor,'') is null or rh_desempenho_chave(setor)=rh_desempenho_chave(origem_rh.setor));
    if cardinality(ids)=1 then assunto:=ids[1];end if;
   end if;
  end if;
 else
  select dados into d from operacao_casos_automaticos where id=p_id and empresa_id=p_empresa;
  d:=coalesce(d,'{}');pedido:=rh_desempenho_id(d->>'pedido_id');
  prefixo:=split_part(d->>'chave',':',1);id_fonte:=rh_desempenho_id(split_part(d->>'chave',':',2));
  etapa:=rh_desempenho_id(d->>'etapa_id');
  if etapa is null and prefixo in ('prazo','checklist','escala-equipe','escala-caminhao') then etapa:=id_fonte;end if;
  if etapa is null and prefixo in ('posicionamento','uniforme','chegada-local','evidencia-ausente') then select etapa_id into etapa from operacao_registros where id=id_fonte and empresa_id=p_empresa;end if;
  if prefixo in ('checkin','checkin-atrasado','checkout') then
   externo:=true;
   select v.etapa_id into etapa from free_inscricoes i join free_vagas v on v.id=i.vaga_id and v.empresa_id=i.empresa_id where i.id=id_fonte and i.empresa_id=p_empresa;
  end if;
  if etapa is null and prefixo='escala-incompleta' then select etapa_id into etapa from free_vagas where id=id_fonte and empresa_id=p_empresa;end if;
  if etapa is null and prefixo='troca' then select etapa_id into etapa from operacao_trocas where id=id_fonte and empresa_id=p_empresa;end if;
  if etapa is null and pedido is not null then
   tipo_etapa:=case d->>'etapa' when 'entrega' then 'montagem' when 'coleta' then 'desmontagem' when 'retorno' then 'triagem_volta' when 'triagem' then 'triagem_ida' else d->>'etapa' end;
   select array_agg(id) into ids from operacao_etapas where empresa_id=p_empresa and pedido_id=pedido and tipo=tipo_etapa;
   if cardinality(ids)=1 then etapa:=ids[1];end if;
  end if;
  if not exists(select 1 from operacao_etapas where id=etapa and empresa_id=p_empresa) then etapa:=null;end if;
  -- Atraso do registro tem um executor identificável; o autor de uma inspeção ou de uma avaria não é tratado como causador.
  if assunto is null and p_chave in ('confirmacao_entrega_atrasada','confirmacao_coleta_atrasada') then
   select criado_por into assunto from logistica_confirmacoes where empresa_id=p_empresa and pedido_id=pedido and etapa=d->>'etapa' order by versao desc,criado_em desc limit 1;
   if not exists(select 1 from funcionarios_acesso where id=assunto and empresa_id=p_empresa) then assunto:=null;end if;
  end if;
 end if;
 select * into s from rh_desempenho_setores where empresa_id=p_empresa and chave=rh_desempenho_chave(r.responsabilidade_setor);
 if assunto is not null then aplica:=true;end if;
 if r.responsabilidade_modo='origem' and rh_desempenho_disponivel(p_empresa,assunto,p_data) then dono:=assunto;motivo:='origem';
 else
  if r.responsabilidade_modo='fixo' then dono:=r.responsabilidade_funcionario;motivo:='regra';
  elsif r.responsabilidade_modo in ('etapa','origem') and etapa is not null then
   select array_agg(distinct f.id) into ids from operacao_etapa_pessoas ep join funcionarios_acesso f on f.id=ep.funcionario_id and f.empresa_id=ep.empresa_id
    where ep.etapa_id=etapa and ep.empresa_id=p_empresa and ep.papel='responsavel';
   if cardinality(ids)=1 then dono:=ids[1];motivo:='etapa';end if;
  end if;
  if dono is not null and not rh_desempenho_disponivel(p_empresa,dono,p_data) then substituido:=dono;dono:=null;end if;
  if dono is null and rh_desempenho_disponivel(p_empresa,r.responsabilidade_suplente,p_data) then dono:=r.responsabilidade_suplente;motivo:='substituto_regra';end if;
  if dono is null and rh_desempenho_disponivel(p_empresa,s.responsavel_id,p_data) then dono:=s.responsavel_id;motivo:='setor';end if;
  if dono is null and rh_desempenho_disponivel(p_empresa,s.substituto_id,p_data) then dono:=s.substituto_id;motivo:='substituto_setor';end if;
  if assunto is null and r.responsabilidade_pontua and motivo in ('regra','etapa','setor') and dono is not null and not externo then assunto:=dono;aplica:=true;end if;
 end if;
 if dono is null then
  if rh_desempenho_disponivel(p_empresa,cfg.responsavel_geral,p_data) then dono:=cfg.responsavel_geral;motivo:='geral';
  elsif rh_desempenho_disponivel(p_empresa,cfg.substituto_geral,p_data) then dono:=cfg.substituto_geral;motivo:='substituto_geral';
  else
   -- Fora da jornada de todos os substitutos, o gestor mantém a titularidade para acompanhamento.
   select id into dono from funcionarios_acesso where id=cfg.responsavel_geral and empresa_id=p_empresa and ativo;
   if dono is not null then motivo:='geral_fora_jornada';else select id into dono from funcionarios_acesso where id=cfg.substituto_geral and empresa_id=p_empresa and ativo;motivo:='substituto_geral_fora_jornada';end if;
  end if;
 end if;
 if dono is null then raise exception 'Configure um responsável geral ativo em Parâmetros > Ocorrências > Responsabilidade automática.';end if;
 return jsonb_build_object('responsavel_id',dono,'funcionario_id',coalesce(assunto,dono),'pontuavel',aplica,'via',motivo,'etapa_id',etapa,'setor',r.responsabilidade_setor,'substituido_id',substituido,'regra_versao',r.versao,'config_versao',cfg.versao,'em',now(),
  'responsavel_nome',(select nome from funcionarios_acesso where id=dono and empresa_id=p_empresa));
end $$;

create function rh_desempenho_responsabilidade_capturar() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare anterior rh_desempenho_eventos;v jsonb;ativa boolean;
begin
 select responsabilidade_ativa into ativa from rh_desempenho_config where empresa_id=new.empresa_id;
 if ativa is not true then
  new.pontuavel:=new.funcionario_id is not null;return new;
 end if;
 new.responsabilidade_ativa:=true;
 if tg_op='INSERT' then
  select * into anterior from rh_desempenho_eventos where empresa_id=new.empresa_id and origem=new.origem and origem_id=new.origem_id;
 elsif old.responsavel_id is not null and old.chave=new.chave then
  -- Mudanças da fonte ou de parâmetros não trocam o responsável histórico.
  new.responsavel_id:=old.responsavel_id;new.responsabilidade:=old.responsabilidade;new.pontuavel:=old.pontuavel;new.funcionario_id:=old.funcionario_id;return new;
 end if;
 if anterior.responsavel_id is not null and anterior.chave=new.chave then
  new.responsavel_id:=anterior.responsavel_id;new.responsabilidade:=anterior.responsabilidade;new.pontuavel:=anterior.pontuavel;new.funcionario_id:=anterior.funcionario_id;return new;
 end if;
 v:=rh_desempenho_resolver(new.empresa_id,new.origem,new.origem_id,new.funcionario_id,new.chave,new.data_ocorrencia);
 if tg_op='UPDATE' and old.responsavel_id is null then v:=v||jsonb_build_object('atribuicao_historica',true);end if;
 new.responsavel_id:=(v->>'responsavel_id')::uuid;new.funcionario_id:=(v->>'funcionario_id')::uuid;new.pontuavel:=(v->>'pontuavel')::boolean;new.responsabilidade:=v;
 return new;
end $$;
create trigger a_rh_desempenho_responsabilidade before insert or update on rh_desempenho_eventos for each row execute function rh_desempenho_responsabilidade_capturar();
create function rh_desempenho_responsabilidade_auditar() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if new.responsabilidade is null then return new;end if;
 if tg_op='INSERT' then insert into rh_desempenho_responsabilidade_historico(empresa_id,evento_id,depois) values(new.empresa_id,new.id,new.responsabilidade);
 elsif old.responsabilidade is distinct from new.responsabilidade then insert into rh_desempenho_responsabilidade_historico(empresa_id,evento_id,antes,depois) values(new.empresa_id,new.id,old.responsabilidade,new.responsabilidade);end if;
 return new;
end $$;
create trigger rh_desempenho_responsabilidade_auditar after insert or update on rh_desempenho_eventos for each row execute function rh_desempenho_responsabilidade_auditar();

-- A escolha do supervisor ativa o processamento dos registros antigos na mesma transação.
alter table rh_desempenho_config add constraint rh_desempenho_ativacao_com_supervisor check(not responsabilidade_ativa or responsavel_geral is not null);
alter table rh_desempenho_eventos add constraint rh_desempenho_responsavel_obrigatorio check(not responsabilidade_ativa or (responsavel_id is not null and funcionario_id is not null and responsabilidade is not null));

create function rh_desempenho_proteger_responsavel() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if old.ativo and (not new.ativo or new.empresa_id is distinct from old.empresa_id) and exists(select 1 from rh_desempenho_config where empresa_id=old.empresa_id and responsabilidade_ativa) and (
  exists(select 1 from rh_desempenho_config where empresa_id=old.empresa_id and old.id in (responsavel_geral,substituto_geral)) or
  exists(select 1 from rh_desempenho_setores where empresa_id=old.empresa_id and old.id in (responsavel_id,substituto_id)) or
  exists(select 1 from rh_desempenho_regras where empresa_id=old.empresa_id and old.id in (responsabilidade_funcionario,responsabilidade_suplente))
 ) then raise exception 'Defina outro responsável em Parâmetros > Ocorrências antes de inativar ou transferir esta pessoa.';end if;
 return new;
end $$;
create trigger rh_desempenho_proteger_responsavel before update of ativo,empresa_id on funcionarios_acesso for each row execute function rh_desempenho_proteger_responsavel();

-- O vínculo por ocorrência passa a ser exclusivamente automático.
revoke all on function rh_desempenho_vincular(uuid,uuid,uuid) from authenticated;
revoke all on function rh_desempenho_id(text),rh_desempenho_regra_padrao(),rh_desempenho_responsabilidade_preparar(uuid),rh_desempenho_disponivel(uuid,uuid,date),rh_desempenho_resolver(uuid,text,uuid,uuid,text,date),rh_desempenho_responsabilidade_capturar(),rh_desempenho_responsabilidade_auditar(),rh_desempenho_proteger_responsavel() from public,anon,authenticated;

create function rh_desempenho_responsabilidades_ler(p_empresa uuid) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if seguranca_2fa_ok() is not true or (rh_pode(p_empresa,'configuracoes.empresa.editar') or rh_pode(p_empresa,'rh.colaboradores.visualizar')) is not true then raise exception 'Sem permissão para consultar responsabilidades.';end if;
 perform rh_desempenho_responsabilidade_preparar(p_empresa);
 return jsonb_build_object(
  'config',(select to_jsonb(c)-'empresa_id' from rh_desempenho_config c where empresa_id=p_empresa),
  'regras',(select coalesce(jsonb_agg(to_jsonb(r)-'empresa_id' order by origem,nome),'[]') from rh_desempenho_regras r where empresa_id=p_empresa),
  'setores',(select coalesce(jsonb_agg(to_jsonb(s)-'empresa_id' order by setor),'[]') from rh_desempenho_setores s where empresa_id=p_empresa),
  'pessoas',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'nome',nome,'setor',setor,'ativo',ativo) order by nome),'[]') from funcionarios_acesso where empresa_id=p_empresa)
 );
end $$;
create function rh_desempenho_validar_pessoa(p_empresa uuid,p_pessoa uuid,p_obrigatorio boolean default false) returns void language plpgsql stable set search_path=public,pg_temp as $$
begin
 if p_pessoa is null and not p_obrigatorio then return;end if;
 if not exists(select 1 from funcionarios_acesso where empresa_id=p_empresa and id=p_pessoa and ativo) then raise exception 'Escolha um funcionário ativo desta empresa para a responsabilidade.';end if;
end $$;
create function rh_desempenho_responsabilidades_salvar(p_empresa uuid,p_config jsonb,p_setores jsonb,p_regras jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare x jsonb;geral uuid;suplente uuid;responsavel uuid;substituto uuid;r rh_desempenho_regras;v_setor text;v_chave text;atual integer;n numeric;
begin
 if seguranca_2fa_ok() is not true or rh_pode(p_empresa,'configuracoes.empresa.editar') is not true then raise exception 'Sem permissão para editar responsabilidades.';end if;
 if jsonb_typeof(p_setores) is distinct from 'array' or jsonb_typeof(p_regras) is distinct from 'array' or jsonb_array_length(p_setores)>200 or jsonb_array_length(p_regras)>500 then raise exception 'Responsabilidades inválidas.';end if;
 perform rh_desempenho_responsabilidade_preparar(p_empresa);
 geral:=rh_desempenho_id(p_config->>'responsavel_geral');suplente:=rh_desempenho_id(p_config->>'substituto_geral');
 perform rh_desempenho_validar_pessoa(p_empresa,geral,true);perform rh_desempenho_validar_pessoa(p_empresa,suplente);
 if geral=suplente then raise exception 'O substituto deve ser outra pessoa.';end if;
 update rh_desempenho_config set responsavel_geral=geral,substituto_geral=suplente,responsabilidade_ativa=true,versao=versao+1,atualizado_em=now() where empresa_id=p_empresa and versao=(p_config->>'versao')::integer;
 if not found then raise exception 'A configuração mudou. Atualize os parâmetros antes de salvar.';end if;
 for x in select * from jsonb_array_elements(p_setores) loop
  v_setor:=trim(x->>'setor');v_chave:=rh_desempenho_chave(v_setor);
  if v_chave='' or length(v_setor)>150 then raise exception 'Setor inválido.';end if;
  responsavel:=rh_desempenho_id(x->>'responsavel_id');substituto:=rh_desempenho_id(x->>'substituto_id');
  perform rh_desempenho_validar_pessoa(p_empresa,responsavel);perform rh_desempenho_validar_pessoa(p_empresa,substituto);
  if responsavel=substituto then raise exception 'O substituto do setor deve ser outra pessoa.';end if;
  select versao into atual from rh_desempenho_setores where empresa_id=p_empresa and chave=v_chave for update;
  if found then
   if atual is distinct from (x->>'versao')::integer then raise exception 'Um setor mudou. Atualize os parâmetros antes de salvar.';end if;
   update rh_desempenho_setores set responsavel_id=responsavel,substituto_id=substituto,versao=versao+1,atualizado_em=now() where empresa_id=p_empresa and chave=v_chave;
  else insert into rh_desempenho_setores(empresa_id,setor,chave,responsavel_id,substituto_id) values(p_empresa,v_setor,v_chave,responsavel,substituto);end if;
 end loop;
 for x in select * from jsonb_array_elements(p_regras) loop
  select * into r from rh_desempenho_regras where empresa_id=p_empresa and id=rh_desempenho_id(x->>'id') for update;
  if not found or r.versao is distinct from (x->>'versao')::integer then raise exception 'Uma regra mudou. Atualize os parâmetros antes de salvar.';end if;
  if (x->>'responsabilidade_modo') is null or x->>'responsabilidade_modo' not in ('origem','etapa','setor','fixo') then raise exception 'Escolha para quem encaminhar cada tipo.';end if;
  responsavel:=rh_desempenho_id(x->>'responsabilidade_funcionario');substituto:=rh_desempenho_id(x->>'responsabilidade_suplente');
  perform rh_desempenho_validar_pessoa(p_empresa,responsavel,x->>'responsabilidade_modo'='fixo');perform rh_desempenho_validar_pessoa(p_empresa,substituto);
  if responsavel=substituto then raise exception 'O substituto da regra deve ser outra pessoa.';end if;
  v_setor:=trim(x->>'responsabilidade_setor');
  if v_setor is null or v_setor='' or length(v_setor)>150 then raise exception 'Escolha um setor de referência para cada regra.';end if;
  n:=case when x ? 'pontos' then (x->>'pontos')::numeric else r.pontos end;
  if n is null or n::text in ('NaN','Infinity','-Infinity') or n not between -10 and 10 or n<>round(n,2) then raise exception 'Use pontos entre -10 e 10, com até duas casas decimais.';end if;
  update rh_desempenho_regras set pontos=n,ativa=coalesce((x->>'ativa')::boolean,r.ativa),responsabilidade_modo=x->>'responsabilidade_modo',responsabilidade_setor=v_setor,responsabilidade_funcionario=responsavel,responsabilidade_suplente=substituto,responsabilidade_pontua=coalesce((x->>'responsabilidade_pontua')::boolean,false),versao=versao+1,atualizado_em=now() where id=r.id;
 end loop;
 -- A primeira ativação resolve todo o histórico. Os pesos gravados não são recalculados.
 update rh_desempenho_eventos set responsabilidade_ativa=true where empresa_id=p_empresa and responsavel_id is null;
 return rh_desempenho_responsabilidades_ler(p_empresa);
end $$;
revoke all on function rh_desempenho_validar_pessoa(uuid,uuid,boolean),rh_desempenho_responsabilidades_ler(uuid),rh_desempenho_responsabilidades_salvar(uuid,jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function rh_desempenho_responsabilidades_ler(uuid),rh_desempenho_responsabilidades_salvar(uuid,jsonb,jsonb,jsonb) to authenticated;
notify pgrst,'reload schema';

-- O painel operacional apresenta o destinatário, sem expor notas ou pesos do RH.
create or replace function public.ocorrencias_painel(p_empresa uuid)
 returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare desligados text[];
begin
 if not public.ocorrencias_painel_pode(p_empresa) then raise exception 'Sem acesso ao painel de ocorrências';end if;
 perform public.ocorrencias_sincronizar(p_empresa);
 select coalesce(r.tipos_desligados,'{}') into desligados from (select 1) a left join operacao_ocorrencias_regras r on r.empresa_id=p_empresa;
 return (select coalesce(jsonb_agg(c.dados||jsonb_build_object('id',c.id,'detectada_em',c.primeira_deteccao,'atualizado_em',c.atualizado_em,
  'responsavel_id',e.responsavel_id,'responsavel_nome',e.responsabilidade->>'responsavel_nome','responsabilidade_via',e.responsabilidade->>'via') order by c.primeira_deteccao desc),'[]')
  from operacao_casos_automaticos c left join rh_desempenho_eventos e on e.empresa_id=c.empresa_id and e.origem='automatica' and e.origem_id=c.id
  where c.empresa_id=p_empresa and not (coalesce(c.dados->>'tipo','')=any(coalesce(desligados,'{}'))));
end $$;

create or replace function public.rh_desempenho_saldo(p_empresa uuid,p_funcionario uuid,p_inicio date,p_fim date) returns numeric language plpgsql stable set search_path=public,pg_temp as $$
declare nota numeric:=10;e record;
begin
 for e in select pontos from rh_desempenho_eventos where empresa_id=p_empresa and funcionario_id=p_funcionario
  and elegivel and pontuavel and estado_origem not in ('cancelada','em_revisao') and (p_inicio is null or data_ocorrencia>=p_inicio) and data_ocorrencia<=p_fim
  order by data_ocorrencia,criado_em,id loop
  nota:=greatest(0,least(10,nota+e.pontos));
 end loop;
 return nota;
end $$;

create or replace function public.rh_desempenho_contexto(p_empresa uuid,p_inicio date default null,p_fim date default null,p_todos boolean default false) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare cfg rh_desempenho_config;ini date;fim date;hoje date:=(now() at time zone 'America/Sao_Paulo')::date;ps jsonb;sem_pessoa jsonb;
begin
 if not seguranca_2fa_ok() or not rh_pode(p_empresa,'rh.colaboradores.visualizar') then raise exception 'Sem permissão para consultar avaliações.';end if;
 perform rh_desempenho_preparar(p_empresa);
 perform ocorrencias_sincronizar(p_empresa);
 select * into cfg from rh_desempenho_config where empresa_id=p_empresa;
 ini:=case when p_todos then null else p_inicio end;fim:=coalesce(p_fim,hoje);
 if ini>fim then raise exception 'A data inicial deve ser anterior à final.';end if;
 with eventos as (
  select e.*,case when elegivel and pontuavel and estado_origem not in ('cancelada','em_revisao') then pontos else 0 end impacto
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


create or replace function public.rh_desempenho_detalhe(p_empresa uuid,p_funcionario uuid,p_inicio date default null,p_fim date default null,p_pagina integer default 0) returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare lista jsonb;total integer;
begin
 if not seguranca_2fa_ok() or not rh_pode(p_empresa,'rh.colaboradores.visualizar') then raise exception 'Sem permissão para consultar avaliações.';end if;
 if not exists(select 1 from funcionarios_acesso where id=p_funcionario and empresa_id=p_empresa) then raise exception 'Funcionário inválido.';end if;
 if p_pagina is null or p_pagina<0 or p_pagina>100000 then raise exception 'Página inválida.';end if;
 select count(*) into total from rh_desempenho_eventos where empresa_id=p_empresa and funcionario_id=p_funcionario and (p_inicio is null or data_ocorrencia>=p_inicio) and (p_fim is null or data_ocorrencia<=p_fim);
 select coalesce(jsonb_agg(to_jsonb(e) order by e.data_ocorrencia desc,e.id),'[]') into lista from (
  select id,nome,origem,origem_id,data_ocorrencia,observacao,pontos,regra_versao,responsavel_id,responsabilidade,pontuavel,
   case when estado_origem in ('cancelada','em_revisao') then 'desconsiderada' when not pontuavel then 'acompanhamento' when not elegivel then 'em_apuracao' when pontos=0 then 'neutra' else 'aplicada' end estado,
   case when elegivel and pontuavel and estado_origem not in ('cancelada','em_revisao') then pontos else 0 end impacto
  from rh_desempenho_eventos where empresa_id=p_empresa and funcionario_id=p_funcionario and (p_inicio is null or data_ocorrencia>=p_inicio) and (p_fim is null or data_ocorrencia<=p_fim) order by data_ocorrencia desc,id limit 50 offset p_pagina*50
 ) e;
 return jsonb_build_object('itens',lista,'total',total,'pagina',p_pagina);
end $$;
