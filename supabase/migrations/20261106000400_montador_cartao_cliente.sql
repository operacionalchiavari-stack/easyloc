-- App do Montador (nov/2026): os cartões mostram a foto do cliente e o endereço como link; mont_dados passa a devolver
-- clienteFoto (clientes_empresas.catalogo_logo_url), localNome e endereco separados (o campo "local" antigo continua igual).
CREATE OR REPLACE FUNCTION public.mont_dados(p_token text, p_id_extra uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare s app_sessoes := app_sessao(p_token, 'montador'); sup boolean := s.perfil = 'SUPERVISOR'; apont jsonb := mont_apontamento_ativo(s);
begin
  return jsonb_build_object('nome', s.nome, 'perfil', s.perfil, 'pasta', s.pasta, 'apontamento', apont,
    'etapas', coalesce((select jsonb_agg(row_to_json(x) order by x."dataISO", x.horario) from (
      select e.id, coalesce(sp.numero_pedido, '') pedido, to_char(sp.data_evento, 'DD/MM/YYYY') "dataEvento", coalesce(sp.cliente_nome, '') cliente,
             (select c.catalogo_logo_url from clientes_empresas c where c.empresa_id = sp.empresa_id and (c.id = sp.cliente_id or (sp.cliente_id is null and lower(trim(c.nome_razao)) = lower(trim(sp.cliente_nome)))) limit 1) "clienteFoto",
             coalesce(sp.local_nome, '') "localNome",
             trim(both ', ' from coalesce(l.endereco, '') || coalesce(', ' || nullif(l.numero_endereco, ''), '')) endereco,
             trim(both ' - ' from coalesce(sp.local_nome, '') || ' - ' || coalesce(l.endereco, '') || coalesce(', ' || l.numero_endereco, '')) local,
             e.nome etapa, e.tipo, e.data "dataISO", to_char(e.hora, 'HH24:MI') horario,
             (select string_agg(k.codigo, ',') from operacao_etapa_caminhoes c join caminhoes k on k.id = c.caminhao_id where c.etapa_id = e.id) caminhao,
             coalesce((select nome from operacao_etapa_pessoas where etapa_id = e.id and papel = 'responsavel'), '') responsavel,
             coalesce((select jsonb_agg(nome order by ordem) from operacao_etapa_pessoas where etapa_id = e.id and papel = 'equipe'), '[]') equipe,
             e.observacao, l.latitude lat, l.longitude lng,
             (select to_jsonb(i) from operacao_pedidos_info i where i.pedido_id = e.pedido_id) info,
             coalesce((select jsonb_object_agg(r.tipo, r.dados) from operacao_registros r where r.etapa_id = e.id), '{}') registros,
             coalesce((select jsonb_agg(to_jsonb(t) order by t.solicitado_em) from operacao_trocas t where t.etapa_id = e.id and t.status <> 'CANCELADO'), '[]') trocas,
             (select jsonb_build_object('problema', a.problema, 'observacao', a.observacao, 'enviadoPor', a.enviado_por)
                from operacao_alertas_motorista a where a.pedido_id = e.pedido_id and a.status not in ('RESOLVIDO','FINALIZADO') order by a.criado_em desc limit 1) alerta,
             (select jsonb_build_object('idVaga', v.id, 'status', v.status, 'quantidade', v.quantidade, 'horario', v.horario, 'pontoEncontro', v.ponto_encontro, 'lider', v.lider,
                'pessoas', coalesce((select jsonb_agg(jsonb_build_object('nome', i.nome, 'telefone', i.telefone, 'miniatura', coalesce(c.foto_url, ''),
                   'fase', free_fase(v.status, v.data, v.horario, i.checkin_em, i.checkout_em), 'checkinEm', i.checkin_em, 'checkoutEm', i.checkout_em, 'nota', c.nota))
                   from free_inscricoes i join free_cadastros c on c.id = i.free_id where i.vaga_id = v.id and i.status = 'CONFIRMADO'), '[]'))
                from free_vagas_v v where v.etapa_id = e.id and v.status <> 'CANCELADA' limit 1) free,
             coalesce((select jsonb_agg(jsonb_build_object('etapa', o.nome, 'dataISO', o.data, 'horario', to_char(o.hora, 'HH24:MI'),
                 'caminhao', (select string_agg(k.codigo, ',') from operacao_etapa_caminhoes c join caminhoes k on k.id = c.caminhao_id where c.etapa_id = o.id),
                 'responsavel', coalesce((select nome from operacao_etapa_pessoas where etapa_id = o.id and papel = 'responsavel'), '')) order by o.data, o.hora)
               from operacao_etapas o where o.pedido_id = e.pedido_id and o.id <> e.id), '[]') "outrasEtapas",
             case when e.tipo = 'desmontagem' then coalesce((select jsonb_agg(jsonb_build_object('codigo', sac->>'codigo', 'fotos', coalesce(sac->'fotos', '[]'), 'dataMontagem', m.data))
               from operacao_etapas m join operacao_registros r on r.etapa_id = m.id and r.tipo = 'sacolas', jsonb_array_elements(r.dados->'sacolas') sac
               where m.pedido_id = e.pedido_id and m.tipo = 'montagem'), '[]') else '[]' end "sacolasMontagem"
        from operacao_etapas e
        left join separacoes_pedidos sp on sp.id = e.pedido_id
        left join locais_empresas l on l.id = sp.local_id
       where e.empresa_id = s.empresa_id
         and ((e.id = p_id_extra) or (apont is not null and e.id = (apont->>'idEtapa')::uuid)
              or (e.data between current_date - 2 and current_date + case when sup then 30 else 7 end
                  and (case when sup then e.tipo in ('montagem','desmontagem')
                       else exists (select 1 from operacao_etapa_pessoas p where p.etapa_id = e.id and p.funcionario_id = s.funcionario_id and p.papel = 'responsavel') end)))
    ) x), '[]'),
    'avisoExtra', case when p_id_extra is not null and not sup and not exists (select 1 from operacao_etapa_pessoas p where p.etapa_id = p_id_extra and p.funcionario_id = s.funcionario_id and p.papel = 'responsavel')
      then coalesce('Esta etapa é de ' || (select nome from operacao_etapa_pessoas where etapa_id = p_id_extra and papel = 'responsavel') || '. Peça para ele registrar ou entre como supervisor.', 'Etapa não encontrada.') end);
end $function$;
notify pgrst, 'reload schema';
