-- A foto registra a chegada sem solicitar nem armazenar a posição do aparelho.
-- Mantém o horário, a sessão, o vínculo com a etapa e o apontamento do evento.
create or replace function public.mont_registro_salvar(p_token text, p_etapa uuid, p_tipo text, p_dados jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare s app_sessoes:=app_sessao(p_token,'montador'); e operacao_etapas; atual operacao_registros;
 dados jsonb:=coalesce(p_dados,'{}'); apont jsonb; previsto timestamptz;
begin
 select * into e from operacao_etapas where id=p_etapa;
 if e.id is null or e.empresa_id<>s.empresa_id or not mont_pode_ver(s,p_etapa) then
  raise exception 'Entre no app como responsável por esta etapa.';
 end if;
 if e.tipo not in ('montagem','desmontagem') then raise exception 'Esta etapa não é de montagem ou desmontagem.'; end if;
 select * into atual from operacao_registros where etapa_id=p_etapa and tipo=p_tipo;
 if atual.id is not null and p_tipo<>'observacoes' then return atual.dados||jsonb_build_object('enviado',true,'jaExistia',true); end if;
 if p_tipo='equipe' then
  apont:=mont_apontamento_ativo(s);
  if apont is null or (apont->>'idEtapa')::uuid<>p_etapa then
   raise exception 'Inicie este evento no cronograma antes de enviar. O apontamento pode ter sido encerrado em outro aparelho.';
  end if;
  perform operacao_validar_etapa_campo(p_etapa);
  if coalesce(dados->>'foto','')='' then raise exception 'Tire uma foto da equipe completa antes de enviar.'; end if;
  previsto:=(e.data+coalesce(e.hora,time '08:00')) at time zone 'America/Sao_Paulo';
  dados:=(dados-'latitude'-'longitude'-'precisaoGPS'-'chegada')||jsonb_build_object('chegada',jsonb_build_object(
   'em',now(),'previsto',previsto,'atraso',greatest(0,ceil(extract(epoch from (now()-previsto))/60)),
   'localStatus','NAO_COLETADA','autor',s.nome,'apontamentoId',apont->>'id'));
 elsif p_tipo='desmontagem_concluida' then
  if (select count(*) from operacao_registros where etapa_id=p_etapa and tipo in ('equipe','lista_conferida'))<2 then
   raise exception 'Envie a foto da equipe e a lista conferida antes de concluir.';
  end if;
  if not exists(select 1 from operacao_registros where etapa_id=p_etapa and tipo='contagem_itens') then
   raise exception 'Lance a contagem de cada item (a partir da lista) antes de concluir.';
  end if;
 end if;
 insert into operacao_registros(empresa_id,etapa_id,tipo,dados,autor) values(e.empresa_id,p_etapa,p_tipo,dados,s.nome)
 on conflict(etapa_id,tipo) do update set dados=excluded.dados,autor=excluded.autor,atualizado_em=now();
 return dados||jsonb_build_object('enviado',true);
end $$;

create or replace function public.mont_equipe_foto(p_token text,p_etapa uuid,p_dados jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare s app_sessoes:=app_sessao(p_token,'montador'); e operacao_etapas; a jsonb; r jsonb; id_apont uuid;
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
 r:=mont_registro_salvar(p_token,p_etapa,'equipe',jsonb_build_object('foto',p_dados->>'foto'));
 return r||jsonb_build_object('apontamento',a);
end $$;
