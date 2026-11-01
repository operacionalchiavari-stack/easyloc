-- A conferência acompanha os ambientes da lista comercial e preserva o total carregado.
create or replace function public.mont_entrega_itens(p_token text,p_etapa uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare s app_sessoes:=app_sessao(p_token,'montador'); e operacao_etapas; r operacao_registros;
 base jsonb; lista jsonb:='[]'; it jsonb; amb jsonb; projeto jsonb; item_pai text;
 restante numeric; planejado numeric; quantidade numeric; ordem int; distribuido boolean;
begin
 select * into e from operacao_etapas where id=p_etapa and empresa_id=s.empresa_id;
 if e.id is null or not mont_pode_ver(s,p_etapa) then raise exception 'Você não tem acesso a esta etapa.'; end if;
 if e.tipo<>'montagem' then raise exception 'A conferência de entrega é da montagem.'; end if;
 base:=mont_contagem_itens(p_token,p_etapa);
 select * into r from operacao_registros where etapa_id=p_etapa and tipo='conferencia_entrega';
 if r.id is not null then
  return jsonb_build_object('itens',r.dados->'lista','enviado',true,'conferencia',r.dados->'itens','autor',r.autor,'em',r.dados->'em');
 end if;
 for it in select value from jsonb_array_elements(base->'itens') loop
  select p.observacoes->'projeto_comercial'->'dados',si.item_id::text into projeto,item_pai
   from separacoes_itens si join separacoes_pedidos p on p.id=si.separacao_pedido_id
   where si.id::text=split_part(it->>'chave','|',1) and p.empresa_id=s.empresa_id;
  restante:=(it->>'esperado')::numeric; ordem:=0; distribuido:=false;
  for amb in select value from jsonb_array_elements(coalesce(projeto->'ambientes','[]')) loop
   ordem:=ordem+1;
   select sum(greatest(0,floor((x->>'quantidade')::numeric))*coalesce((it->>'por_kit')::numeric,1)) into planejado
    from jsonb_array_elements(coalesce(amb->'itens','[]')) x where x->>'item_id'=item_pai;
   if coalesce(planejado,0)<=0 then continue; end if;
   quantidade:=least(restante,planejado); restante:=restante-quantidade; distribuido:=true;
   lista:=lista||jsonb_build_array(it||jsonb_build_object('chave',(it->>'chave')||'@amb:'||ordem,
    'esperado',quantidade,'ambiente_id',coalesce(amb->>'id',ordem::text),
    'ambiente',coalesce(nullif(btrim(amb->>'nome'),''),'Ambiente '||ordem),'ambiente_ordem',ordem));
  end loop;
  if restante>0 or not distribuido then
   lista:=lista||jsonb_build_array(it||jsonb_build_object('esperado',restante,'ambiente_id','outros',
    'ambiente',case when jsonb_array_length(coalesce(projeto->'ambientes','[]'))>0 then 'Outros itens' else 'Itens do pedido' end,'ambiente_ordem',2147483647));
  end if;
 end loop;
 return jsonb_build_object('itens',lista,'enviado',false,'conferencia','{}'::jsonb);
end $$;
revoke all on function public.mont_entrega_itens(text,uuid) from public;
grant execute on function public.mont_entrega_itens(text,uuid) to anon,authenticated;

-- O último check-out de quem esteve presente encerra o tempo da etapa.
create or replace function public.mont_encerrar_por_checkout(p_etapa uuid)
returns void language plpgsql security definer set search_path=public as $$
declare e operacao_etapas; fim_equipe timestamptz;
begin
 select * into e from operacao_etapas where id=p_etapa for update;
 if e.id is null or e.tipo not in ('montagem','desmontagem') then return; end if;
 if exists(select 1 from free_inscricoes i join free_vagas v on v.id=i.vaga_id
  where v.etapa_id=e.id and v.empresa_id=e.empresa_id and i.empresa_id=e.empresa_id
   and v.status<>'CANCELADA' and i.status='CONFIRMADO' and i.checkin_em is not null and i.checkout_em is null) then return; end if;
 select max(i.checkout_em) into fim_equipe from free_inscricoes i join free_vagas v on v.id=i.vaga_id
  where v.etapa_id=e.id and v.empresa_id=e.empresa_id and i.empresa_id=e.empresa_id
   and v.status<>'CANCELADA' and i.status='CONFIRMADO' and i.checkin_em is not null;
 if fim_equipe is null then return; end if;
 update operacao_apontamentos set fim=greatest(inicio,least(fim_equipe,now())),status='ENCERRADO'
  where etapa_id=e.id and empresa_id=e.empresa_id and status='ATIVO';
end $$;
revoke all on function public.mont_encerrar_por_checkout(uuid) from public,anon,authenticated;

create or replace function public.mont_checkout_trigger()
returns trigger language plpgsql security definer set search_path=public as $$
declare etapa uuid;
begin
 if new.checkout_em is null or new.checkin_em is null or new.status<>'CONFIRMADO' then return new; end if;
 select etapa_id into etapa from free_vagas where id=new.vaga_id and empresa_id=new.empresa_id and status<>'CANCELADA';
 if etapa is not null then perform mont_encerrar_por_checkout(etapa); end if;
 return new;
end $$;
revoke all on function public.mont_checkout_trigger() from public,anon,authenticated;
drop trigger if exists mont_ultimo_checkout on public.free_inscricoes;
create trigger mont_ultimo_checkout after insert or update of checkout_em on public.free_inscricoes
 for each row execute function public.mont_checkout_trigger();

create or replace function public.mont_checkin_apontamento(p_token text,p_etapa uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare s app_sessoes:=app_sessao(p_token,'montador'); e operacao_etapas; inicio timestamptz; a jsonb;
begin
 select * into e from operacao_etapas where id=p_etapa and empresa_id=s.empresa_id;
 if e.id is null or not mont_pode_ver(s,p_etapa) then raise exception 'Você não tem acesso a esta etapa.'; end if;
 select min(i.checkin_em) into inicio from free_inscricoes i join free_vagas v on v.id=i.vaga_id
  where v.etapa_id=e.id and v.empresa_id=e.empresa_id and i.empresa_id=e.empresa_id and i.status='CONFIRMADO' and v.status<>'CANCELADA';
 if inicio is not null then perform mont_inicio_por_presenca(e.id,s.funcionario_id,s.nome,inicio); end if;
 perform mont_encerrar_por_checkout(e.id);
 select jsonb_build_object('id',p.id,'idEtapa',p.etapa_id,'inicio',p.inicio,'fim',p.fim,'status',p.status) into a
  from operacao_apontamentos p where p.etapa_id=e.id and p.empresa_id=e.empresa_id
  and ((s.funcionario_id is not null and p.funcionario_id=s.funcionario_id) or (s.funcionario_id is null and p.nome=s.nome))
  order by p.inicio desc limit 1;
 return a;
end $$;
revoke all on function public.mont_checkin_apontamento(text,uuid) from public;
grant execute on function public.mont_checkin_apontamento(text,uuid) to anon,authenticated;

-- A Central resolve a identidade pela sessão, nunca por um CPF/ID enviado pelo navegador.
create or replace function public.mont_bonus_cadastro(p_token text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare s app_sessoes:=app_sessao(p_token,'montador'); f funcionarios_acesso;
begin
 if s.empresa_id<>gs_empresa_dona() then raise exception 'Sem acesso ao bônus desta empresa.'; end if;
 select * into f from funcionarios_acesso where id=s.funcionario_id and empresa_id=s.empresa_id and ativo;
 if f.id is null then raise exception 'Meu bônus está disponível no acesso individual do funcionário.'; end if;
 return jsonb_build_object('id',f.id,'empresa_id',f.empresa_id,'nome',f.nome,'cpf',f.cpf,'foto_url',f.foto_url);
end $$;
revoke all on function public.mont_bonus_cadastro(text) from public,anon,authenticated;
grant execute on function public.mont_bonus_cadastro(text) to service_role;
