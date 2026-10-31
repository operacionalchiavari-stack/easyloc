-- CPF do RH continua cifrado. A Edge Function calcula o índice e entrega somente a sessão do app.
create or replace function public.mont_login_cpf_cofre(p_cpf_hash text,p_cpf_legado text,p_pin text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare f funcionarios_acesso; n integer;
begin
 if coalesce(p_cpf_hash,'')!~'^[0-9a-f]{64}$' or coalesce(p_cpf_legado,'')!~'^[0-9]{11}$' or coalesce(p_pin,'')!~'^[0-9]{4}$' then
  return jsonb_build_object('error','CPF ou PIN incorretos.');
 end if;
 select count(*) into n from funcionarios_acesso where empresa_id=gs_empresa_dona() and ativo
  and equipe_operacional='montagem' and (cpf_hash=p_cpf_hash or cpf=p_cpf_legado);
 if n<>1 then return jsonb_build_object('error','CPF ou PIN incorretos.'); end if;
 select * into f from funcionarios_acesso where empresa_id=gs_empresa_dona() and ativo
  and equipe_operacional='montagem' and (cpf_hash=p_cpf_hash or cpf=p_cpf_legado);
 -- Retorna o erro em vez de lançar: mantém o contador de PINs errados do RH.
 if not rh_pin_conferir(f.empresa_id,f.id,p_pin) then return jsonb_build_object('error','CPF ou PIN incorretos.'); end if;
 return mont_login(f.id,p_pin);
end $$;
revoke all on function public.mont_login_cpf_cofre(text,text,text) from public,anon,authenticated;
grant execute on function public.mont_login_cpf_cofre(text,text,text) to service_role;

-- Auxiliar interno: um apontamento por pessoa/etapa; abrir a tela nunca cria um início fictício.
create or replace function public.mont_inicio_por_presenca(p_etapa uuid,p_funcionario uuid,p_nome text,p_inicio timestamptz)
returns uuid language plpgsql security definer set search_path=public as $$
declare e operacao_etapas; a operacao_apontamentos;
begin
 select * into e from operacao_etapas where id=p_etapa;
 if e.id is null or e.tipo not in ('montagem','desmontagem') or p_inicio is null then return null; end if;
 perform pg_advisory_xact_lock(hashtextextended('mont-presenca:'||e.empresa_id||':'||coalesce(p_funcionario::text,p_nome),0));
 select * into a from operacao_apontamentos where empresa_id=e.empresa_id and etapa_id=e.id
  and ((p_funcionario is not null and funcionario_id=p_funcionario) or (p_funcionario is null and funcionario_id is null and nome=p_nome)) order by inicio limit 1;
 if a.id is not null then return a.id; end if;
 if exists(select 1 from operacao_apontamentos where empresa_id=e.empresa_id and status='ATIVO'
  and ((p_funcionario is not null and funcionario_id=p_funcionario) or (p_funcionario is null and funcionario_id is null and nome=p_nome))) then return null; end if;
 insert into operacao_apontamentos(empresa_id,etapa_id,funcionario_id,nome,inicio)
  values(e.empresa_id,e.id,p_funcionario,p_nome,least(p_inicio,now())) returning * into a;
 return a.id;
end $$;
revoke all on function public.mont_inicio_por_presenca(uuid,uuid,text,timestamptz) from public,anon,authenticated;

create or replace function public.mont_inicio_checkin_trigger()
returns trigger language plpgsql security definer set search_path=public as $$
declare e operacao_etapas; p record; inicio timestamptz;
begin
 if new.checkin_em is null or new.status<>'CONFIRMADO' then return new; end if;
 select e1.* into e from operacao_etapas e1 join free_vagas v on v.etapa_id=e1.id
  where v.id=new.vaga_id and v.empresa_id=new.empresa_id and e1.empresa_id=new.empresa_id and v.status<>'CANCELADA';
 if e.id is null or e.tipo not in ('montagem','desmontagem') then return new; end if;
 select min(i.checkin_em) into inicio from free_inscricoes i join free_vagas v on v.id=i.vaga_id
  where v.etapa_id=e.id and v.empresa_id=e.empresa_id and i.empresa_id=e.empresa_id and i.status='CONFIRMADO' and v.status<>'CANCELADA';
 for p in select ep.funcionario_id,ep.nome from operacao_etapa_pessoas ep join funcionarios_acesso f on f.id=ep.funcionario_id
  where ep.etapa_id=e.id and ep.empresa_id=e.empresa_id and ep.papel='responsavel' and f.empresa_id=e.empresa_id and f.ativo loop
  perform mont_inicio_por_presenca(e.id,p.funcionario_id,p.nome,inicio);
 end loop;
 return new;
end $$;
revoke all on function public.mont_inicio_checkin_trigger() from public,anon,authenticated;
drop trigger if exists mont_inicio_checkin on public.free_inscricoes;
create trigger mont_inicio_checkin after insert or update of checkin_em on public.free_inscricoes
 for each row execute function public.mont_inicio_checkin_trigger();

create or replace function public.mont_checkin_apontamento(p_token text,p_etapa uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare s app_sessoes:=app_sessao(p_token,'montador'); e operacao_etapas; inicio timestamptz; a jsonb;
begin
 select * into e from operacao_etapas where id=p_etapa;
 if e.id is null or e.empresa_id<>s.empresa_id or not mont_pode_ver(s,p_etapa) then raise exception 'Você não tem acesso a esta etapa.'; end if;
 select min(i.checkin_em) into inicio from free_inscricoes i join free_vagas v on v.id=i.vaga_id
  where v.etapa_id=e.id and v.empresa_id=e.empresa_id and i.empresa_id=e.empresa_id and i.status='CONFIRMADO' and v.status<>'CANCELADA';
 if inicio is not null then perform mont_inicio_por_presenca(e.id,s.funcionario_id,s.nome,inicio); end if;
 a:=mont_apontamento_ativo(s);
 return case when a->>'idEtapa'=p_etapa::text then a else null end;
end $$;
revoke all on function public.mont_checkin_apontamento(text,uuid) from public;
grant execute on function public.mont_checkin_apontamento(text,uuid) to anon,authenticated;

-- Sem equipe Free, a foto/GPS registra a chegada e o início na mesma transação.
create or replace function public.mont_equipe_foto(p_token text,p_etapa uuid,p_dados jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare s app_sessoes:=app_sessao(p_token,'montador'); e operacao_etapas; a jsonb; r jsonb; id_apont uuid; dados jsonb;
begin
 select * into e from operacao_etapas where id=p_etapa;
 if e.id is null or e.empresa_id<>s.empresa_id or not mont_pode_ver(s,p_etapa) then raise exception 'Você não tem acesso a esta etapa.'; end if;
 if coalesce(p_dados->>'foto','')='' then raise exception 'Tire a foto da equipe.'; end if;
 perform operacao_validar_etapa_campo(p_etapa);
 a:=mont_checkin_apontamento(p_token,p_etapa);
 if a is null then
  id_apont:=mont_inicio_por_presenca(e.id,s.funcionario_id,s.nome,now());
  if id_apont is null then raise exception 'Encerre o atendimento em andamento antes de registrar esta chegada.'; end if;
  a:=mont_apontamento_ativo(s);
 end if;
 if a is null then raise exception 'Este atendimento já foi encerrado.'; end if;
 dados:=jsonb_build_object('foto',p_dados->>'foto','latitude',p_dados->'latitude','longitude',p_dados->'longitude','precisaoGPS',p_dados->'precisaoGPS');
 r:=mont_registro_salvar(p_token,p_etapa,'equipe',dados);
 return r||jsonb_build_object('apontamento',a);
end $$;
revoke all on function public.mont_equipe_foto(text,uuid,jsonb) from public;
grant execute on function public.mont_equipe_foto(text,uuid,jsonb) to anon,authenticated;
