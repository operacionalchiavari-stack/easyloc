-- Cofre, etapa 2 (out/2026): dados sensíveis do RH cifrados.
-- CPF, RG, salário, PIS, CTPS, agência, conta e PIX passam a chegar ao banco já cifrados ("cofre:v1:..."), pelas
-- Edge Functions funcionarios-admin e rh-protegido (chave ACERVO_COFRE_CHAVE, fora do banco). O banco guarda junto
-- uma máscara para mostrar na tela (•••.•••.•••-01) e, para o CPF, um índice cego (HMAC) usado no login do Meu Bônus.
-- Esta migration só ACRESCENTA: as funções aceitam o valor cifrado ou o antigo, em texto. A trava contra texto puro
-- vem depois que os dados forem convertidos (20261023000400).

alter table public.funcionarios_acesso
  add column if not exists cpf_hash text,
  add column if not exists salario_cifrado text,
  add column if not exists cofre_mascaras jsonb not null default '{}'::jsonb;
create index if not exists funcionarios_acesso_cpf_hash on public.funcionarios_acesso(cpf_hash);
alter table public.rh_fichas add column if not exists cofre_mascaras jsonb not null default '{}'::jsonb;

insert into public.permissoes_catalogo (chave, modulo, submodulo, acao, descricao, sensivel, ordem) values
('rh.dados_sensiveis.ver', 'RH', 'Dados sensíveis', 'visualizar',
 'Ver CPF, RG, salário e dados bancários completos (cada consulta fica registrada)', true, 403)
on conflict (chave) do update set descricao = excluded.descricao, sensivel = true;

-- O que a tela mostra: a máscara, se o valor está cifrado; o próprio valor, se ainda é antigo.
create or replace function public.cofre_exibir(p_valor text, p_mascara text)
returns text language sql immutable set search_path = public as $$
  select case when p_valor like 'cofre:v1:%' then coalesce(nullif(p_mascara, ''), '••••') else p_valor end
$$;

-- Só as chaves pedidas de um objeto de máscaras.
create or replace function public.cofre_mascaras_de(p_m jsonb, p_campos text[])
returns jsonb language sql immutable set search_path = public as $$
  select coalesce(jsonb_object_agg(k, v), '{}'::jsonb) from jsonb_each(coalesce(p_m, '{}'::jsonb)) e(k, v) where k = any(p_campos)
$$;

-- Cadastro de funcionários sem acesso ao sistema (chamado pela Edge Function funcionarios-admin).
create or replace function public.rh_funcionario_salvar(p_empresa uuid, p_ator uuid, p_id uuid, p_dados jsonb, p_pin text default null)
returns uuid language plpgsql security definer set search_path to 'public', 'extensions' as $function$
declare
  v_id uuid := coalesce(p_id, gen_random_uuid()); v_proprio boolean := p_id = p_ator; v_cpf text;
  v_tem_cpf boolean := p_dados ? 'cpf';
  v_sal_cif boolean := p_dados ? 'salario_cifrado';
  v_sal_num boolean := p_dados ? 'salario_bruto';
  v_masc jsonb := public.cofre_mascaras_de(p_dados->'cofre_mascaras', array['cpf','salario','rg']);
begin
 if not funcionario_pode(p_empresa,p_ator,case when p_id is null then 'rh.funcionarios.criar' else 'rh.funcionarios.editar' end) and not coalesce(v_proprio,false) then raise exception 'Acesso negado'; end if;
 if p_id is not null and not exists(select 1 from funcionarios_acesso where id=p_id and empresa_id=p_empresa) then raise exception 'Funcionário não pertence à empresa'; end if;
 if coalesce(trim(p_dados->>'nome'),'')='' or coalesce(trim(p_dados->>'setor'),'')='' then raise exception 'Informe nome e setor'; end if;
 v_cpf := nullif(p_dados->>'cpf','');
 if v_cpf is not null and v_cpf not like 'cofre:v1:%' then
   v_cpf := nullif(regexp_replace(v_cpf,'\D','','g'),'');
   if v_cpf is not null and length(v_cpf)<>11 then raise exception 'CPF deve ter 11 dígitos'; end if;
 end if;
 if p_pin is not null and p_pin !~ '^[0-9]{4}$' then raise exception 'PIN deve ter 4 dígitos'; end if;
 if not coalesce(v_proprio,false) then
  insert into funcionarios_acesso(id,empresa_id,nome,setor,cargo,telefone,email,cpf,cpf_hash,salario_bruto,salario_cifrado,cofre_mascaras,data_admissao,equipe_operacional,ativo,acesso_sistema,nivel_acesso,pin_hash)
   values(v_id,p_empresa,trim(p_dados->>'nome'),trim(p_dados->>'setor'),coalesce(p_dados->>'cargo',''),coalesce(p_dados->>'telefone',''),nullif(p_dados->>'email',''),v_cpf,
   nullif(p_dados->>'cpf_hash',''),
   case when v_sal_cif then 0 else coalesce((p_dados->>'salario_bruto')::numeric,0) end,
   case when v_sal_cif then nullif(p_dados->>'salario_cifrado','') end,
   v_masc,
   nullif(p_dados->>'data_admissao','')::date,nullif(p_dados->>'equipe_operacional',''),coalesce((p_dados->>'ativo')::boolean,true),false,'Visualizador',
   case when p_pin is not null then crypt(p_pin,gen_salt('bf',10)) end)
  on conflict(id) do update set nome=excluded.nome,setor=excluded.setor,cargo=excluded.cargo,telefone=excluded.telefone,
   email=case when funcionarios_acesso.acesso_sistema then funcionarios_acesso.email else excluded.email end,
   cpf=case when v_tem_cpf then excluded.cpf else funcionarios_acesso.cpf end,
   cpf_hash=case when v_tem_cpf then excluded.cpf_hash else funcionarios_acesso.cpf_hash end,
   salario_bruto=case when v_sal_cif then 0 when v_sal_num then excluded.salario_bruto else funcionarios_acesso.salario_bruto end,
   salario_cifrado=case when v_sal_cif then excluded.salario_cifrado when v_sal_num then null else funcionarios_acesso.salario_cifrado end,
   cofre_mascaras=funcionarios_acesso.cofre_mascaras || excluded.cofre_mascaras,
   data_admissao=excluded.data_admissao,equipe_operacional=excluded.equipe_operacional,
   ativo=excluded.ativo,pin_hash=coalesce(excluded.pin_hash,funcionarios_acesso.pin_hash),
   pin_version=funcionarios_acesso.pin_version+case when p_pin is not null then 1 else 0 end,updated_at=now();
 else
  -- Equipe, salário e status nunca podem ser alterados pelo próprio funcionário.
  update funcionarios_acesso set telefone=coalesce(p_dados->>'telefone',telefone),
   pin_hash=case when p_pin is not null then crypt(p_pin,gen_salt('bf',10)) else pin_hash end,
   pin_version=pin_version+case when p_pin is not null then 1 else 0 end,updated_at=now() where id=p_id;
 end if;
 if not coalesce(v_proprio,false) then
  update funcionarios_acesso set dados_rh=(dados_rh||coalesce(p_dados->'dados_rh','{}')) - 'cpf' where id=v_id;
 end if;
 return v_id;
end $function$;

-- Ficha do RH (Gestão de Pessoas). Valores sensíveis chegam cifrados pela Edge Function rh-protegido.
create or replace function public.rh_ficha_salvar(p_empresa uuid, p_funcionario uuid, p_dados jsonb)
returns void language plpgsql security definer set search_path to 'public' as $function$
declare v_cpf text; v_adm text; v_nasc text;
  v_masc jsonb := coalesce(p_dados->'cofre_mascaras', '{}'::jsonb);
  t text := 'cofre:v1:%';
begin
  if not rh_pode(p_empresa, 'rh.colaboradores.editar') then raise exception 'Sem permissão para editar colaboradores' using errcode = '42501'; end if;
  if not exists (select 1 from funcionarios_acesso where id = p_funcionario and empresa_id = p_empresa) then raise exception 'Funcionário não encontrado'; end if;
  v_cpf := coalesce(p_dados->>'cpf', '');
  if v_cpf not like t then
    v_cpf := regexp_replace(v_cpf, '\D', '', 'g');
    if v_cpf <> '' and length(v_cpf) <> 11 then raise exception 'CPF deve ter 11 dígitos'; end if;
  end if;
  v_adm := nullif(p_dados->>'data_admissao', ''); v_nasc := nullif(p_dados->>'data_nascimento', '');
  update funcionarios_acesso set
    cargo = case when p_dados ? 'cargo' then nullif(trim(p_dados->>'cargo'), '') else cargo end,
    telefone = case when p_dados ? 'telefone' then nullif(trim(p_dados->>'telefone'), '') else telefone end,
    cpf = case when p_dados ? 'cpf' then nullif(v_cpf, '') else cpf end,
    cpf_hash = case when p_dados ? 'cpf' then nullif(p_dados->>'cpf_hash', '') else cpf_hash end,
    data_admissao = case when p_dados ? 'data_admissao' then v_adm::date else data_admissao end,
    cofre_mascaras = cofre_mascaras || public.cofre_mascaras_de(v_masc, array['cpf','rg']),
    dados_rh = (coalesce(dados_rh, '{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object(
      'rg', case when p_dados ? 'rg' then coalesce(p_dados->>'rg', '') end,
      'data_nascimento', case when p_dados ? 'data_nascimento' then coalesce(v_nasc, '') end,
      'endereco', case when p_dados ? 'endereco' then coalesce(p_dados->>'endereco', '') end,
      'whatsapp', case when p_dados ? 'whatsapp' then coalesce(p_dados->>'whatsapp', '') end))) - 'cpf',
    updated_at = now()
  where id = p_funcionario;
  insert into rh_fichas(funcionario_id, empresa_id) values (p_funcionario, p_empresa) on conflict (funcionario_id) do nothing;
  update rh_fichas set
    matricula = case when p_dados ? 'matricula' then nullif(trim(p_dados->>'matricula'), '') else matricula end,
    pis = case when p_dados ? 'pis' then nullif(trim(p_dados->>'pis'), '') else pis end,
    ctps = case when p_dados ? 'ctps' then nullif(trim(p_dados->>'ctps'), '') else ctps end,
    tipo_contrato = coalesce(nullif(p_dados->>'tipo_contrato', ''), tipo_contrato),
    jornada = case when p_dados ? 'jornada' then nullif(trim(p_dados->>'jornada'), '') else jornada end,
    experiencia_fim = case when p_dados ? 'experiencia_fim' then nullif(p_dados->>'experiencia_fim', '')::date else experiencia_fim end,
    contato_emergencia = case when p_dados ? 'contato_emergencia' then nullif(trim(p_dados->>'contato_emergencia'), '') else contato_emergencia end,
    contato_emergencia_telefone = case when p_dados ? 'contato_emergencia_telefone' then nullif(trim(p_dados->>'contato_emergencia_telefone'), '') else contato_emergencia_telefone end,
    estado_civil = case when p_dados ? 'estado_civil' then nullif(p_dados->>'estado_civil', '') else estado_civil end,
    escolaridade = case when p_dados ? 'escolaridade' then nullif(p_dados->>'escolaridade', '') else escolaridade end,
    dependentes = case when p_dados ? 'dependentes' then greatest(coalesce(nullif(p_dados->>'dependentes', '')::int, 0), 0) else dependentes end,
    banco = case when p_dados ? 'banco' then nullif(trim(p_dados->>'banco'), '') else banco end,
    agencia = case when p_dados ? 'agencia' then nullif(trim(p_dados->>'agencia'), '') else agencia end,
    conta = case when p_dados ? 'conta' then nullif(trim(p_dados->>'conta'), '') else conta end,
    pix = case when p_dados ? 'pix' then nullif(trim(p_dados->>'pix'), '') else pix end,
    cofre_mascaras = cofre_mascaras || public.cofre_mascaras_de(v_masc, array['pis','ctps','agencia','conta','pix']),
    tamanho_camisa = case when p_dados ? 'tamanho_camisa' then nullif(p_dados->>'tamanho_camisa', '') else tamanho_camisa end,
    tamanho_calca = case when p_dados ? 'tamanho_calca' then nullif(p_dados->>'tamanho_calca', '') else tamanho_calca end,
    tamanho_calcado = case when p_dados ? 'tamanho_calcado' then nullif(p_dados->>'tamanho_calcado', '') else tamanho_calcado end,
    transporte_tipo = case when p_dados ? 'transporte_tipo' then nullif(p_dados->>'transporte_tipo', '') else transporte_tipo end,
    transporte_passagens_dia = case when p_dados ? 'transporte_passagens_dia' then nullif(p_dados->>'transporte_passagens_dia', '')::numeric else transporte_passagens_dia end,
    transporte_tarifa = case when p_dados ? 'transporte_tarifa' then nullif(p_dados->>'transporte_tarifa', '')::numeric else transporte_tarifa end,
    observacoes = case when p_dados ? 'observacoes' then nullif(trim(p_dados->>'observacoes'), '') else observacoes end,
    updated_at = now()
  where funcionario_id = p_funcionario;
end $function$;

-- Gestão de Pessoas: devolve só a máscara dos dados cifrados (o valor inteiro só pela Edge Function, com registro).
create or replace function public.rh_pessoas(p_empresa uuid)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $function$
declare v_pode boolean;
begin
  if not rh_pode(p_empresa, 'rh.colaboradores.visualizar') then raise exception 'Sem permissão para ver o RH' using errcode = '42501'; end if;
  v_pode := funcionario_pode(p_empresa, auth.uid(), 'rh.dados_sensiveis.ver');
  return (select coalesce(jsonb_agg(jsonb_build_object(
      'id', f.id, 'nome', f.nome, 'setor', f.setor, 'cargo', f.cargo, 'email', f.email, 'telefone', f.telefone,
      'ativo', f.ativo, 'acesso_sistema', f.acesso_sistema,
      'cpf', public.cofre_exibir(f.cpf, f.cofre_mascaras->>'cpf'), 'data_admissao', f.data_admissao,
      'dados_rh', (coalesce(f.dados_rh, '{}'::jsonb) - 'cpf')
         || case when f.dados_rh ? 'rg' then jsonb_build_object('rg', public.cofre_exibir(f.dados_rh->>'rg', f.cofre_mascaras->>'rg')) else '{}'::jsonb end,
      'eu', f.id = auth.uid(),
      'protegidos', (select coalesce(jsonb_agg(c), '[]'::jsonb) from (values
          ('cpf', f.cpf), ('rg', f.dados_rh->>'rg'), ('pis', r.pis), ('ctps', r.ctps), ('agencia', r.agencia), ('conta', r.conta), ('pix', r.pix)
        ) x(c, v) where v like 'cofre:v1:%'),
      'pode_revelar', v_pode,
      'ficha', case when r.funcionario_id is null then null else
        (to_jsonb(r) - 'empresa_id' - 'funcionario_id' - 'cofre_mascaras') || jsonb_build_object(
          'pis', public.cofre_exibir(r.pis, r.cofre_mascaras->>'pis'), 'ctps', public.cofre_exibir(r.ctps, r.cofre_mascaras->>'ctps'),
          'agencia', public.cofre_exibir(r.agencia, r.cofre_mascaras->>'agencia'), 'conta', public.cofre_exibir(r.conta, r.cofre_mascaras->>'conta'),
          'pix', public.cofre_exibir(r.pix, r.cofre_mascaras->>'pix')) end
    ) order by f.nome), '[]'::jsonb)
    from funcionarios_acesso f left join rh_fichas r on r.funcionario_id = f.id
    where f.empresa_id = p_empresa);
end $function$;

-- Cadastro de Funcionários: idem (CPF mascarado; salário cifrado não sai).
create or replace function public.funcionarios_listar(p_empresa_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare v_pode boolean;
begin
 if not funcionario_pode(p_empresa_id,auth.uid(),'rh.funcionarios.visualizar') then raise exception 'Acesso negado'; end if;
 v_pode := funcionario_pode(p_empresa_id, auth.uid(), 'rh.dados_sensiveis.ver');
 return (select coalesce(jsonb_agg(item),'[]') from (select jsonb_build_object('id',f.id,'nome',f.nome,'setor',f.setor,'cargo',f.cargo,
  'login',f.login,'email',f.email,'telefone',f.telefone,'nivel_acesso',f.nivel_acesso,'ativo',f.ativo,
  'foto_url',f.foto_url,'cpf',public.cofre_exibir(f.cpf, f.cofre_mascaras->>'cpf'),
  'salario_bruto',case when f.salario_cifrado is not null then null else f.salario_bruto end,
  'salario_mascara',case when f.salario_cifrado is not null then coalesce(f.cofre_mascaras->>'salario','R$ ••••••') end,
  'protegidos',(select coalesce(jsonb_agg(c),'[]'::jsonb) from (values ('cpf',f.cpf),('salario',f.salario_cifrado),('rg',f.dados_rh->>'rg')) x(c,v) where v like 'cofre:v1:%'),
  'pode_revelar',v_pode,
  'data_admissao',f.data_admissao,
  'equipe_operacional',f.equipe_operacional,'lider_operacao',f.lider_operacao,'acesso_sistema',f.acesso_sistema,'tem_pin',f.pin_hash is not null,
  'dados_rh',(coalesce(f.dados_rh,'{}'::jsonb) - 'cpf') || case when f.dados_rh ? 'rg' then jsonb_build_object('rg',public.cofre_exibir(f.dados_rh->>'rg', f.cofre_mascaras->>'rg')) else '{}'::jsonb end,
  'ultimo_acesso',a.last_sign_in_at,'gerenciado',true) item from funcionarios_acesso f
  left join auth.users a on a.id=f.id where f.empresa_id=p_empresa_id
  union all select jsonb_build_object('id',ue.user_id,'nome',coalesce(u.nome,a.email),'setor',coalesce(u.setor,'Administrativo'),
   'cargo',coalesce(u.cargo,''),'login',a.email,'email',a.email,'telefone',coalesce(u.telefone,''),
   'nivel_acesso',case when lower(ue.role) in ('admin','owner','administrador') then 'Administrador' else 'Visualizador' end,
   'ativo',true,'foto_url',coalesce(u.avatar_url,''),'acesso_sistema',true,'gerenciado',false,'salario_bruto',0,'tem_pin',false,
   'protegidos','[]'::jsonb,'pode_revelar',v_pode)
   from usuarios_empresas ue join auth.users a on a.id=ue.user_id left join usuarios u on u.id=ue.user_id
   where ue.empresa_id=p_empresa_id and not exists(select 1 from funcionarios_acesso f where f.id=ue.user_id)
  ) x);
end $function$;

-- Servidor da Vercel (Central de Metas): leva o salário cifrado; quem abre é api/_gas/cofre.js.
create or replace function public.rh_funcionarios_operacionais(p_empresa uuid)
returns jsonb language sql security definer set search_path to 'public' as $function$
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'nome',nome,'setor',setor,'cargo',cargo,'cpf',cpf,
  'salario_bruto',salario_bruto,'salario_cifrado',salario_cifrado,'data_admissao',data_admissao,'ativo',ativo,'equipe_operacional',equipe_operacional,
  'foto_url',foto_url,'tem_pin',pin_hash is not null,'pin_version',pin_version) order by nome),'[]')
 from funcionarios_acesso where empresa_id=p_empresa;
$function$;

-- Login do Meu Bônus: aceita o índice cego do CPF (64 hex) ou, até a conversão, o CPF em números.
create or replace function public.rh_equipe_cadastro(p_cpf text)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare v jsonb; n integer; v_hash boolean := p_cpf ~ '^[0-9a-f]{64}$';
begin
 if not v_hash and p_cpf !~ '^[0-9]{11}$' then return null; end if;
 select count(*) into n from funcionarios_acesso where (case when v_hash then cpf_hash = p_cpf else cpf = p_cpf end) and ativo and pin_hash is not null;
 if n<>1 then return null; end if;
 select jsonb_build_object('id',id,'empresa_id',empresa_id,'nome',nome,'cpf',cpf,'foto_url',foto_url,'pin_version',pin_version)
  into v from funcionarios_acesso where (case when v_hash then cpf_hash = p_cpf else cpf = p_cpf end) and ativo and pin_hash is not null;
 return v;
end $function$;

revoke all on function public.rh_funcionario_salvar(uuid,uuid,uuid,jsonb,text) from public, anon, authenticated;
revoke all on function public.rh_funcionarios_operacionais(uuid) from public, anon, authenticated;
revoke all on function public.rh_equipe_cadastro(text) from public, anon, authenticated;
revoke all on function public.rh_ficha_salvar(uuid,uuid,jsonb) from public, anon;
grant execute on function public.rh_ficha_salvar(uuid,uuid,jsonb) to authenticated;
revoke all on function public.rh_pessoas(uuid) from public, anon;
grant execute on function public.rh_pessoas(uuid) to authenticated;
revoke all on function public.funcionarios_listar(uuid) from public, anon;
grant execute on function public.funcionarios_listar(uuid) to authenticated;
