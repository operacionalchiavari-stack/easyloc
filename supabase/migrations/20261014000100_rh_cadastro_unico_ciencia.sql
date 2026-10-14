-- Cadastro único do RH. Listas importadas ficam arquivadas, sem leitura operacional.
begin;
alter table public.funcionarios_acesso drop constraint if exists funcionarios_acesso_id_fkey;
alter table public.funcionarios_acesso alter column id set default gen_random_uuid();
alter table public.funcionarios_acesso alter column login drop not null;
alter table public.funcionarios_acesso alter column email drop not null;
alter table public.funcionarios_acesso drop constraint if exists funcionarios_acesso_login_check;
alter table public.funcionarios_acesso add column if not exists acesso_sistema boolean not null default true;
alter table public.funcionarios_acesso add column if not exists cpf text;
alter table public.funcionarios_acesso add column if not exists salario_bruto numeric(14,2) not null default 0 check(salario_bruto>=0);
alter table public.funcionarios_acesso add column if not exists data_admissao date;
alter table public.funcionarios_acesso add column if not exists equipe_operacional text check(equipe_operacional in ('triagem','carregamento','montagem','producao'));
alter table public.funcionarios_acesso add column if not exists pin_version integer not null default 1;
alter table public.funcionarios_acesso add column if not exists dados_rh jsonb not null default '{}';
create unique index if not exists funcionarios_cpf_empresa on public.funcionarios_acesso(empresa_id,cpf) where cpf is not null and cpf<>'';
create or replace function public.rh_pin_versao_atualizar() returns trigger language plpgsql set search_path=public as $$
begin
 if new.pin_hash is distinct from old.pin_hash then new.pin_version:=old.pin_version+1; end if;
 return new;
end $$;
drop trigger if exists rh_pin_versao on funcionarios_acesso;
create trigger rh_pin_versao before update on funcionarios_acesso for each row execute function rh_pin_versao_atualizar();

create table if not exists public.rh_cadastros_arquivados (
  planilha_id text not null, aba text not null, linha integer not null, valores jsonb not null,
  arquivado_em timestamptz not null default now(), primary key(planilha_id,aba,linha)
);
alter table public.rh_cadastros_arquivados enable row level security;
revoke all on public.rh_cadastros_arquivados from anon,authenticated;
grant all on public.rh_cadastros_arquivados to service_role;

create table if not exists public.rh_fontes_legadas (
  planilha_id text not null, aba text not null, empresa_id uuid not null references empresas(id),
  primary key(planilha_id,aba)
);
alter table public.rh_fontes_legadas enable row level security;
revoke all on public.rh_fontes_legadas from anon,authenticated;
grant select on public.rh_fontes_legadas to service_role;
insert into rh_fontes_legadas values
 ('1Jk1ScSsqmdYo70AiD96A5HRmfnVe2zdyljPn5f9EAZo','Funcionarios','bb1260f0-99cd-4d17-ab9b-23c299b4c50b'),
 ('1IIW1wI52mlymAJ7q4a8Y7y-cjNniCCaPm1EHP4hNFRI','Funcionarios','bb1260f0-99cd-4d17-ab9b-23c299b4c50b')
 on conflict do nothing;

-- Só a lista de RH é autoridade para salário, setor e identidade. Outra lista
-- importa apenas nomes ausentes; PINs antigos nunca são copiados.
insert into rh_cadastros_arquivados(planilha_id,aba,linha,valores)
 select planilha_id,aba,linha,valores from gs_linhas
 where (aba='Funcionarios' and planilha_id in (select planilha_id from rh_fontes_legadas))
 or (aba='App Equipe' and planilha_id='1EvCBsoDsB0svzEyrGvH46oHHCH3lCTPJMU4If8-LZgE')
 on conflict do nothing;
do $$
declare r record; v_nome text; v_cpf text; v_sal numeric; v_id uuid; v_data date; v_empresa uuid:='bb1260f0-99cd-4d17-ab9b-23c299b4c50b';
begin
 for r in select valores from rh_cadastros_arquivados where planilha_id='1Jk1ScSsqmdYo70AiD96A5HRmfnVe2zdyljPn5f9EAZo' and aba='Funcionarios' and linha>1 order by linha loop
  v_nome:=trim(concat_ws(' ',nullif(trim(r.valores->>0),''),nullif(trim(r.valores->>1),'')));
  if v_nome='' then continue; end if;
  v_cpf:=nullif(regexp_replace(coalesce(r.valores->>2,''),'\D','','g'),'');
  if v_cpf is not null then v_cpf:=lpad(v_cpf,11,'0'); end if;
  if v_cpf is not null and length(v_cpf)<>11 then raise exception 'CPF inválido no cadastro legado'; end if;
  v_sal:=0;
  v_data:=null;
  if r.valores->6 ? '$d' then v_data:=((r.valores->6)->>'$d')::timestamptz::date;
  elsif coalesce(r.valores->>6,'') ~ '^\d{4}-\d{2}-\d{2}' then v_data:=left(r.valores->>6,10)::date;
  elsif coalesce(r.valores->>6,'') ~ '^\d{2}/\d{2}/\d{4}$' then v_data:=to_date(r.valores->>6,'DD/MM/YYYY'); end if;
  if jsonb_typeof(r.valores->5)='number' then v_sal:=(r.valores->>5)::numeric;
  elsif nullif(trim(r.valores->>5),'') is not null then
   v_sal:=replace(replace(regexp_replace(r.valores->>5,'[^0-9,.-]','','g'),'.',''),',','.')::numeric;
  end if;
  select id into v_id from funcionarios_acesso where empresa_id=v_empresa and
   ((v_cpf is not null and cpf=v_cpf) or lower(trim(nome))=lower(v_nome)) limit 1;
  if v_id is null then
   insert into funcionarios_acesso(empresa_id,nome,setor,cargo,cpf,salario_bruto,data_admissao,ativo,acesso_sistema,nivel_acesso)
    values(v_empresa,v_nome,coalesce(nullif(trim(r.valores->>3),''),'Sem setor'),coalesce(r.valores->>4,''),v_cpf,v_sal,v_data,
     lower(coalesce(r.valores->>7,'Ativo')) not in ('inativo','desligado'),false,'Visualizador');
  else
   update funcionarios_acesso set cpf=coalesce(cpf,v_cpf),data_admissao=coalesce(data_admissao,v_data),salario_bruto=case when salario_bruto=0 then v_sal else salario_bruto end where id=v_id;
  end if;
 end loop;
 for r in select valores from rh_cadastros_arquivados where planilha_id='1IIW1wI52mlymAJ7q4a8Y7y-cjNniCCaPm1EHP4hNFRI' and aba='Funcionarios' and linha>1 loop
  v_nome:=trim(coalesce(r.valores->>0,''));
  if v_nome<>'' and not exists(select 1 from funcionarios_acesso where empresa_id=v_empresa and
   (lower(trim(nome))=lower(v_nome) or lower(nome) like lower(v_nome)||' %')) then
   insert into funcionarios_acesso(empresa_id,nome,setor,acesso_sistema,nivel_acesso)
    values(v_empresa,v_nome,'Sem setor',false,'Visualizador');
  end if;
 end loop;
end $$;
-- Sem inferir equipe a partir de um setor amplo: RH deve indicar a equipe.
update funcionarios_acesso set equipe_operacional=case lower(setor)
 when 'triagem' then 'triagem' when 'setor 02' then 'triagem' when 'setor 03' then 'triagem' when 'carregamento' then 'carregamento'
 when 'expedição' then 'carregamento' when 'montagem' then 'montagem'
 when 'operacoes externas' then 'montagem' when 'operações externas' then 'montagem'
 when 'produção' then 'producao' else null end where equipe_operacional is null;

-- CPF e foto do App antigo complementam uma identidade já conciliada, nunca o PIN.
update funcionarios_acesso f set cpf=coalesce(f.cpf,nullif(regexp_replace(a.valores->>2,'\D','','g'),'')),
 foto_url=case when f.foto_url='' and coalesce(a.valores->>4,'')<>'' then
  'https://drive.google.com/thumbnail?id='||(a.valores->>4)||'&sz=w400' else f.foto_url end
from rh_cadastros_arquivados a where a.aba='App Equipe' and a.linha>1
 and f.empresa_id='bb1260f0-99cd-4d17-ab9b-23c299b4c50b' and lower(trim(f.nome))=lower(trim(a.valores->>1));

create or replace function public.rh_fonte_empresa(p_planilha text,p_aba text)
returns uuid language sql security definer set search_path=public as $$
 select empresa_id from rh_fontes_legadas where planilha_id=p_planilha and lower(aba)=lower(p_aba);
$$;
revoke all on function rh_fonte_empresa(text,text) from public,anon,authenticated;
grant execute on function rh_fonte_empresa(text,text) to service_role;

create table if not exists public.rh_registros_arquivados (
 origem text not null,id uuid not null,dados jsonb not null,arquivado_em timestamptz not null default now(),primary key(origem,id)
);
create table if not exists public.rh_cadastro_vinculos (
 origem text not null,id_legado uuid not null,funcionario_id uuid not null references funcionarios_acesso(id) on update cascade,
 primary key(origem,id_legado)
);
alter table rh_registros_arquivados enable row level security;
alter table rh_cadastro_vinculos enable row level security;
revoke all on rh_registros_arquivados,rh_cadastro_vinculos from anon,authenticated;
grant all on rh_registros_arquivados,rh_cadastro_vinculos to service_role;
-- Concilia cadastros de pessoas usados pelo RH antigo e pela Logística.
do $$
declare origem text; r record; f_id uuid; v_nome text; v_empresa uuid; v_cpf text; fk record; col text;
begin
 foreach origem in array array['rh_colaboradores','colaboradores'] loop
  if exists(select 1 from pg_class where oid=to_regclass('public.'||origem) and relkind='r') then
   for r in execute format('select id,to_jsonb(t) dados from public.%I t',origem) loop
    insert into rh_registros_arquivados values(origem,r.id,r.dados,now()) on conflict do nothing;
    v_empresa:=(r.dados->>'empresa_id')::uuid;
    v_nome:=trim(coalesce(r.dados->>'nome_completo',r.dados->>'nome',''));
    v_cpf:=nullif(regexp_replace(coalesce(r.dados->>'cpf',''),'\D','','g'),'');
    select id into f_id from funcionarios_acesso where empresa_id=v_empresa and
     ((v_cpf is not null and cpf=v_cpf) or lower(trim(nome))=lower(v_nome)) limit 1;
    if f_id is null then
     f_id:=case when exists(select 1 from funcionarios_acesso where id=r.id) then gen_random_uuid() else r.id end;
     insert into funcionarios_acesso(id,empresa_id,nome,setor,cargo,telefone,email,cpf,data_admissao,ativo,acesso_sistema,nivel_acesso,foto_url)
     values(f_id,v_empresa,v_nome,coalesce(nullif(r.dados->>'setor',''),'Sem setor'),coalesce(r.dados->>'funcao',''),coalesce(r.dados->>'telefone',''),
      nullif(r.dados->>'email',''),v_cpf,nullif(r.dados->>'data_admissao','')::date,
      lower(coalesce(r.dados->>'status','Ativo')) not in ('inativo','desligado','indisponivel'),false,'Visualizador',coalesce(r.dados->>'foto_url',''));
    end if;
    insert into rh_cadastro_vinculos values(origem,r.id,f_id) on conflict do nothing;
    update funcionarios_acesso set dados_rh=coalesce(r.dados,'{}')||dados_rh where id=f_id;
   end loop;
   -- Mantém documentos, ocorrências, solicitações e agendas ligados à pessoa conciliada.
   for fk in select c.conname,c.conrelid::regclass tabela,c.conkey from pg_constraint c
    where c.contype='f' and c.confrelid=to_regclass('public.'||origem) loop
    if array_length(fk.conkey,1)<>1 then raise exception 'Vínculo legado composto requer conciliação'; end if;
    select attname into col from pg_attribute where attrelid=fk.tabela and attnum=fk.conkey[1];
    execute format('alter table %s drop constraint %I',fk.tabela,fk.conname);
    execute format('update %s t set %I=v.funcionario_id from rh_cadastro_vinculos v where v.origem=$1 and t.%I=v.id_legado',fk.tabela,col,col) using origem;
    execute format('alter table %s add constraint %I foreign key(%I) references public.funcionarios_acesso(id) on update cascade on delete restrict',fk.tabela,fk.conname,col);
   end loop;
   execute format('alter table public.%I rename to %I',origem,origem||'_arquivo');
   execute format('revoke all on public.%I from anon,authenticated',origem||'_arquivo');
  end if;
 end loop;
end $$;

create or replace view public.rh_funcionarios_lista as
 select f.id,f.empresa_id,f.nome,f.nome nome_completo,f.setor,f.cargo funcao,f.telefone,f.email,f.foto_url,
 f.ativo,case when f.ativo then 'Ativo' else 'Inativo' end status,f.data_admissao,f.created_at,f.updated_at,
 case when funcionario_pode(f.empresa_id,auth.uid(),'rh.funcionarios.visualizar') then f.cpf else null end cpf,
 case when funcionario_pode(f.empresa_id,auth.uid(),'rh.funcionarios.visualizar') then f.dados_rh->>'rg' end rg,
 case when funcionario_pode(f.empresa_id,auth.uid(),'rh.funcionarios.visualizar') then nullif(f.dados_rh->>'data_nascimento','')::date end data_nascimento,
 f.dados_rh->>'whatsapp' whatsapp,
 case when funcionario_pode(f.empresa_id,auth.uid(),'rh.funcionarios.visualizar') then f.dados_rh->>'endereco' end endereco,
 case when funcionario_pode(f.empresa_id,auth.uid(),'rh.funcionarios.visualizar') then f.dados_rh->>'observacoes' end observacoes
 from funcionarios_acesso f where exists(select 1 from usuarios_empresas ue where ue.empresa_id=f.empresa_id and ue.user_id=auth.uid())
 and not exists(select 1 from funcionarios_acesso a where a.id=auth.uid() and not a.ativo);
grant select on rh_funcionarios_lista to authenticated;
-- Compatibilidade somente de leitura; os nomes antigos também apontam para o RH.
create or replace view public.rh_colaboradores as select * from rh_funcionarios_lista;
create or replace view public.colaboradores as select id,empresa_id,nome,funcao,telefone,foto_url,
 case when ativo then 'disponivel' else 'indisponivel' end status,observacoes,created_at,updated_at from rh_funcionarios_lista;
revoke all on rh_colaboradores,colaboradores from anon,authenticated;
grant select on rh_colaboradores,colaboradores to authenticated;

create or replace function public.rh_funcionarios_operacionais(p_empresa uuid)
returns jsonb language sql security definer set search_path=public as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'nome',nome,'setor',setor,'cargo',cargo,'cpf',cpf,
  'salario_bruto',salario_bruto,'data_admissao',data_admissao,'ativo',ativo,'equipe_operacional',equipe_operacional,
  'foto_url',foto_url,'tem_pin',pin_hash is not null,'pin_version',pin_version) order by nome),'[]')
 from funcionarios_acesso where empresa_id=p_empresa;
$$;
revoke all on function rh_funcionarios_operacionais(uuid) from public,anon,authenticated;
grant execute on function rh_funcionarios_operacionais(uuid) to service_role;

create or replace function public.funcionarios_listar(p_empresa_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
begin
 if not funcionario_pode(p_empresa_id,auth.uid(),'rh.funcionarios.visualizar') then raise exception 'Acesso negado'; end if;
 return (select coalesce(jsonb_agg(item),'[]') from (select jsonb_build_object('id',f.id,'nome',f.nome,'setor',f.setor,'cargo',f.cargo,
  'login',f.login,'email',f.email,'telefone',f.telefone,'nivel_acesso',f.nivel_acesso,'ativo',f.ativo,
  'foto_url',f.foto_url,'cpf',f.cpf,'salario_bruto',f.salario_bruto,'data_admissao',f.data_admissao,
  'equipe_operacional',f.equipe_operacional,'acesso_sistema',f.acesso_sistema,'tem_pin',f.pin_hash is not null,'dados_rh',f.dados_rh,
  'ultimo_acesso',a.last_sign_in_at,'gerenciado',true) item from funcionarios_acesso f
  left join auth.users a on a.id=f.id where f.empresa_id=p_empresa_id
  union all select jsonb_build_object('id',ue.user_id,'nome',coalesce(u.nome,a.email),'setor',coalesce(u.setor,'Administrativo'),
   'cargo',coalesce(u.cargo,''),'login',a.email,'email',a.email,'telefone',coalesce(u.telefone,''),
   'nivel_acesso',case when lower(ue.role) in ('admin','owner','administrador') then 'Administrador' else 'Visualizador' end,
   'ativo',true,'foto_url',coalesce(u.avatar_url,''),'acesso_sistema',true,'gerenciado',false,'salario_bruto',0,'tem_pin',false)
   from usuarios_empresas ue join auth.users a on a.id=ue.user_id left join usuarios u on u.id=ue.user_id
   where ue.empresa_id=p_empresa_id and not exists(select 1 from funcionarios_acesso f where f.id=ue.user_id)
  ) x);
end $$;

create or replace function public.rh_funcionario_salvar(p_empresa uuid,p_ator uuid,p_id uuid,p_dados jsonb,p_pin text default null)
returns uuid language plpgsql security definer set search_path=public,extensions as $$
declare v_id uuid:=coalesce(p_id,gen_random_uuid()); v_proprio boolean:=p_id=p_ator; v_cpf text;
begin
 if not funcionario_pode(p_empresa,p_ator,case when p_id is null then 'rh.funcionarios.criar' else 'rh.funcionarios.editar' end) and not coalesce(v_proprio,false) then raise exception 'Acesso negado'; end if;
 if p_id is not null and not exists(select 1 from funcionarios_acesso where id=p_id and empresa_id=p_empresa) then raise exception 'Funcionário não pertence à empresa'; end if;
 if coalesce(trim(p_dados->>'nome'),'')='' or coalesce(trim(p_dados->>'setor'),'')='' then raise exception 'Informe nome e setor'; end if;
 v_cpf:=nullif(regexp_replace(coalesce(p_dados->>'cpf',''),'\D','','g'),'');
 if v_cpf is not null and length(v_cpf)<>11 then raise exception 'CPF deve ter 11 dígitos'; end if;
 if p_pin is not null and p_pin !~ '^[0-9]{4}$' then raise exception 'PIN deve ter 4 dígitos'; end if;
 if not coalesce(v_proprio,false) then
  insert into funcionarios_acesso(id,empresa_id,nome,setor,cargo,telefone,email,cpf,salario_bruto,data_admissao,equipe_operacional,ativo,acesso_sistema,nivel_acesso,pin_hash)
   values(v_id,p_empresa,trim(p_dados->>'nome'),trim(p_dados->>'setor'),coalesce(p_dados->>'cargo',''),coalesce(p_dados->>'telefone',''),nullif(p_dados->>'email',''),v_cpf,
   coalesce((p_dados->>'salario_bruto')::numeric,0),nullif(p_dados->>'data_admissao','')::date,nullif(p_dados->>'equipe_operacional',''),coalesce((p_dados->>'ativo')::boolean,true),false,'Visualizador',
   case when p_pin is not null then crypt(p_pin,gen_salt('bf',10)) end)
  on conflict(id) do update set nome=excluded.nome,setor=excluded.setor,cargo=excluded.cargo,telefone=excluded.telefone,
   email=case when funcionarios_acesso.acesso_sistema then funcionarios_acesso.email else excluded.email end,
   cpf=excluded.cpf,salario_bruto=excluded.salario_bruto,data_admissao=excluded.data_admissao,equipe_operacional=excluded.equipe_operacional,
   ativo=excluded.ativo,pin_hash=coalesce(excluded.pin_hash,funcionarios_acesso.pin_hash),
   pin_version=funcionarios_acesso.pin_version+case when p_pin is not null then 1 else 0 end,updated_at=now();
 else
  -- Equipe, salário e status nunca podem ser alterados pelo próprio funcionário.
  update funcionarios_acesso set telefone=coalesce(p_dados->>'telefone',telefone),
   pin_hash=case when p_pin is not null then crypt(p_pin,gen_salt('bf',10)) else pin_hash end,
   pin_version=pin_version+case when p_pin is not null then 1 else 0 end,updated_at=now() where id=p_id;
 end if;
 if not coalesce(v_proprio,false) then
  update funcionarios_acesso set dados_rh=dados_rh||coalesce(p_dados->'dados_rh','{}') where id=v_id;
 end if;
 return v_id;
end $$;
revoke all on function rh_funcionario_salvar(uuid,uuid,uuid,jsonb,text) from public,anon,authenticated;
grant execute on function rh_funcionario_salvar(uuid,uuid,uuid,jsonb,text) to service_role;

create or replace function public.rh_funcionario_promover(p_empresa uuid,p_ator uuid,p_antigo uuid,p_novo uuid,p_dados jsonb,p_permissoes jsonb,p_pin text)
returns void language plpgsql security definer set search_path=public as $$
begin
 if not funcionario_pode(p_empresa,p_ator,'rh.funcionarios.editar') or not funcionario_pode(p_empresa,p_ator,'configuracoes.permissoes.editar') then raise exception 'Acesso negado'; end if;
 if not exists(select 1 from funcionarios_acesso where id=p_antigo and empresa_id=p_empresa and not acesso_sistema) then raise exception 'Cadastro inválido'; end if;
 if p_novo<>p_antigo then raise exception 'A liberação de acesso deve preservar a identidade do funcionário'; end if;
 perform funcionario_salvar(p_empresa,p_ator,p_novo,p_dados,p_permissoes,p_pin);
 perform rh_funcionario_salvar(p_empresa,p_ator,p_novo,p_dados,null);
 update funcionarios_acesso set acesso_sistema=true where id=p_novo;
end $$;
revoke all on function rh_funcionario_promover(uuid,uuid,uuid,uuid,jsonb,jsonb,text) from public,anon,authenticated;
grant execute on function rh_funcionario_promover(uuid,uuid,uuid,uuid,jsonb,jsonb,text) to service_role;

create or replace function public.rh_funcionario_acesso_salvar(p_empresa uuid,p_ator uuid,p_id uuid,p_dados jsonb,p_permissoes jsonb,p_pin text)
returns void language plpgsql security definer set search_path=public as $$
begin
 perform funcionario_salvar(p_empresa,p_ator,p_id,p_dados,p_permissoes,p_pin);
 perform rh_funcionario_salvar(p_empresa,p_ator,p_id,p_dados,null);
end $$;
revoke all on function rh_funcionario_acesso_salvar(uuid,uuid,uuid,jsonb,jsonb,text) from public,anon,authenticated;
grant execute on function rh_funcionario_acesso_salvar(uuid,uuid,uuid,jsonb,jsonb,text) to service_role;

-- Dados de lotação são do RH; edição própria só altera contato, foto e credenciais.
create or replace function public.funcionario_salvar_proprio(p_empresa uuid,p_ator uuid,p_dados jsonb,p_pin text default null)
returns jsonb language plpgsql security definer set search_path=public,extensions as $$
begin
 if not exists(select 1 from usuarios_empresas where empresa_id=p_empresa and user_id=p_ator)
  or exists(select 1 from funcionarios_acesso where id=p_ator and not ativo) then raise exception 'Acesso negado'; end if;
 if p_pin is not null and p_pin !~ '^[0-9]{4}$' then raise exception 'PIN deve ter 4 dígitos'; end if;
 update funcionarios_acesso set nome=coalesce(nullif(trim(p_dados->>'nome'),''),nome),telefone=coalesce(p_dados->>'telefone',telefone),
  foto_url=coalesce(p_dados->>'foto_url',foto_url),pin_hash=case when p_pin is not null then crypt(p_pin,gen_salt('bf',10)) else pin_hash end,
  pin_version=pin_version+case when p_pin is not null then 1 else 0 end,updated_at=now() where id=p_ator and empresa_id=p_empresa;
 update usuarios set nome=coalesce(nullif(trim(p_dados->>'nome'),''),nome),telefone=coalesce(p_dados->>'telefone',telefone),
  avatar_url=coalesce(p_dados->>'foto_url',avatar_url) where id=p_ator;
 return jsonb_build_object('aviso',case when p_pin is not null and not exists(select 1 from funcionarios_acesso where id=p_ator) then 'Para ter PIN operacional, o administrador precisa vincular sua pessoa ao cadastro do RH.' else '' end);
end $$;

create table if not exists public.itens_danos_ciencia (
 empresa_id uuid not null references empresas(id), dano_id text not null, equipe text not null,
 assinatura text not null, status text not null default 'pendente' check(status in ('pendente','confirmado','contestado')),
 registrado_por uuid, confirmado_por uuid references funcionarios_acesso(id) on update cascade,
 confirmado_em timestamptz, justificativa text, atualizado_em timestamptz not null default now(),
 primary key(empresa_id,dano_id)
);
create table if not exists public.itens_danos_ciencia_auditoria (
 id bigint generated always as identity primary key, empresa_id uuid not null, dano_id text not null,
 acao text not null, funcionario_id uuid, ator_id uuid, assinatura text not null, criado_em timestamptz not null default now(), detalhes jsonb
);
create table if not exists public.rh_pin_tentativas (
 empresa_id uuid not null, funcionario_id uuid not null, erros integer not null default 0,
 bloqueado_ate timestamptz, atualizado_em timestamptz not null default now(), primary key(empresa_id,funcionario_id)
);
alter table itens_danos_ciencia enable row level security;
alter table itens_danos_ciencia_auditoria enable row level security;
alter table rh_pin_tentativas enable row level security;
revoke all on itens_danos_ciencia,itens_danos_ciencia_auditoria,rh_pin_tentativas from anon,authenticated;
grant all on itens_danos_ciencia,itens_danos_ciencia_auditoria,rh_pin_tentativas to service_role;
grant usage,select on sequence itens_danos_ciencia_auditoria_id_seq to service_role;

create or replace function public.rh_pin_conferir(p_empresa uuid,p_funcionario uuid,p_pin text)
returns boolean language plpgsql security definer set search_path=public,extensions as $$
declare f funcionarios_acesso; t rh_pin_tentativas;
begin
 insert into rh_pin_tentativas(empresa_id,funcionario_id) values(p_empresa,p_funcionario) on conflict do nothing;
 select * into t from rh_pin_tentativas where empresa_id=p_empresa and funcionario_id=p_funcionario for update;
 if t.bloqueado_ate>now() then return false; end if;
 if t.atualizado_em<now()-interval '15 minutes' then t.erros:=0; end if;
 select * into f from funcionarios_acesso where id=p_funcionario and empresa_id=p_empresa and ativo;
 if f.id is null or f.pin_hash is null or p_pin is null or p_pin !~ '^[0-9]{4}$' or crypt(p_pin,f.pin_hash)<>f.pin_hash then
  update rh_pin_tentativas set erros=t.erros+1,bloqueado_ate=case when t.erros+1>=5 then now()+interval '15 minutes' else null end,atualizado_em=now()
   where empresa_id=p_empresa and funcionario_id=p_funcionario;
  return false;
 end if;
 delete from rh_pin_tentativas where empresa_id=p_empresa and funcionario_id=p_funcionario;
 return true;
end $$;
revoke all on function rh_pin_conferir(uuid,uuid,text) from public,anon,authenticated;
grant execute on function rh_pin_conferir(uuid,uuid,text) to service_role;

create or replace function public.rh_equipe_cadastro(p_cpf text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v jsonb; n integer;
begin
 if p_cpf !~ '^[0-9]{11}$' then return null; end if;
 select count(*) into n from funcionarios_acesso where cpf=p_cpf and ativo and pin_hash is not null;
 if n<>1 then return null; end if;
 select jsonb_build_object('id',id,'empresa_id',empresa_id,'nome',nome,'cpf',cpf,'foto_url',foto_url,'pin_version',pin_version)
  into v from funcionarios_acesso where cpf=p_cpf and ativo and pin_hash is not null;
 return v;
end $$;
revoke all on function rh_equipe_cadastro(text) from public,anon,authenticated;
grant execute on function rh_equipe_cadastro(text) to service_role;

create or replace function public.rh_danos_ciencias(p_empresa uuid)
returns jsonb language sql security definer set search_path=public as $$
 select coalesce(jsonb_agg(to_jsonb(c)||jsonb_build_object('confirmado_nome',f.nome)),'[]') from itens_danos_ciencia c
 left join funcionarios_acesso f on f.id=c.confirmado_por where c.empresa_id=p_empresa;
$$;
revoke all on function rh_danos_ciencias(uuid) from public,anon,authenticated;
grant execute on function rh_danos_ciencias(uuid) to service_role;

create or replace function public.rh_dano_ciencia_salvar(p_empresa uuid,p_ator uuid,p_dados jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_id text:=p_dados->>'id'; v_equipe text:=p_dados->>'equipe'; v_sig text:=p_dados->>'assinatura';
 v_acao text:=p_dados->>'acao'; v_func uuid; c itens_danos_ciencia; f funcionarios_acesso;
begin
 if not exists(select 1 from usuarios_empresas where empresa_id=p_empresa and user_id=p_ator)
 or exists(select 1 from funcionarios_acesso where id=p_ator and not ativo) then raise exception 'Acesso negado'; end if;
 if v_id is null or v_sig is null or v_equipe not in ('triagem','carregamento','montagem','producao') then raise exception 'Dano inválido'; end if;
 insert into itens_danos_ciencia(empresa_id,dano_id,equipe,assinatura,registrado_por)
 values(p_empresa,v_id,v_equipe,v_sig,p_ator) on conflict do nothing;
 select * into c from itens_danos_ciencia where empresa_id=p_empresa and dano_id=v_id for update;
 if c.assinatura<>v_sig or c.equipe<>v_equipe then
  insert into itens_danos_ciencia_auditoria(empresa_id,dano_id,acao,ator_id,assinatura,detalhes)
   values(p_empresa,v_id,'dano_alterado',p_ator,v_sig,to_jsonb(c));
  update itens_danos_ciencia set equipe=v_equipe,assinatura=v_sig,status='pendente',confirmado_por=null,confirmado_em=null,justificativa=null,atualizado_em=now()
  where empresa_id=p_empresa and dano_id=v_id;
 end if;
 if v_acao in ('confirmar','contestar') then
  v_func:=(p_dados->>'funcionario_id')::uuid;
  select * into f from funcionarios_acesso where id=v_func and empresa_id=p_empresa and ativo and equipe_operacional=v_equipe;
  if f.id is null then return jsonb_build_object('ok',false,'msg','Selecione um funcionário ativo da equipe indicada.'); end if;
  if not rh_pin_conferir(p_empresa,v_func,p_dados->>'pin') then return jsonb_build_object('ok',false,'msg','PIN inválido ou temporariamente bloqueado.'); end if;
  select * into c from itens_danos_ciencia where empresa_id=p_empresa and dano_id=v_id;
  if c.status<>'pendente' then return jsonb_build_object('ok',false,'msg','Este dano já recebeu uma resposta.'); end if;
  if v_acao='contestar' and length(trim(coalesce(p_dados->>'justificativa','')))<5 then raise exception 'Explique a contestação'; end if;
  update itens_danos_ciencia set status=case when v_acao='confirmar' then 'confirmado' else 'contestado' end,
   confirmado_por=v_func,confirmado_em=now(),justificativa=left(p_dados->>'justificativa',1000),atualizado_em=now()
   where empresa_id=p_empresa and dano_id=v_id;
  insert into itens_danos_ciencia_auditoria(empresa_id,dano_id,acao,funcionario_id,ator_id,assinatura,detalhes)
   values(p_empresa,v_id,v_acao,v_func,p_ator,v_sig,jsonb_build_object('equipe',v_equipe,'justificativa',left(p_dados->>'justificativa',1000)));
 elsif v_acao='reabrir' then
  if not funcionario_pode(p_empresa,p_ator,'configuracoes.permissoes.editar') or length(trim(coalesce(p_dados->>'justificativa','')))<5 then raise exception 'Revisão não autorizada'; end if;
  insert into itens_danos_ciencia_auditoria(empresa_id,dano_id,acao,ator_id,assinatura,detalhes)
   values(p_empresa,v_id,'atribuicao_revisada',p_ator,v_sig,jsonb_build_object('antes',to_jsonb(c),'justificativa',left(p_dados->>'justificativa',1000)));
  update itens_danos_ciencia set status='pendente',confirmado_por=null,confirmado_em=null,justificativa=null,atualizado_em=now()
   where empresa_id=p_empresa and dano_id=v_id;
 elsif v_acao<>'sincronizar' then raise exception 'Ação inválida'; end if;
 return jsonb_build_object('ok',true);
end $$;
revoke all on function rh_dano_ciencia_salvar(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function rh_dano_ciencia_salvar(uuid,uuid,jsonb) to service_role;

-- PIN antigo deixa de existir como fonte de autenticação. Dados preservados no arquivo.
delete from gs_linhas where (aba='Funcionarios' and planilha_id in(select planilha_id from rh_fontes_legadas))
 or (aba='App Equipe' and planilha_id='1EvCBsoDsB0svzEyrGvH46oHHCH3lCTPJMU4If8-LZgE');
update gs_abas set versao=versao+1 where (nome='Funcionarios' and planilha_id in(select planilha_id from rh_fontes_legadas))
 or (nome='App Equipe' and planilha_id='1EvCBsoDsB0svzEyrGvH46oHHCH3lCTPJMU4If8-LZgE');
commit;
