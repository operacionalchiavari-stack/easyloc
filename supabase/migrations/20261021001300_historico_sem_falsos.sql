-- Histórico do comercial: tirar registros falsos (pedido do usuário: "tirei de pré-reserva pra reservado e ele registrou
-- tudo isso"). Causas: (1) texto vazio "" vs sem valor (null) contava como mudança — "Alterou o contato: (vazio) → (vazio)";
-- (2) a tela grava "cancelamento": null nas observações e isso virava "Registrou o cancelamento"; (3) a validade da
-- pré-reserva é limpa sozinha quando o pedido sai de pré-reserva — já está dito na linha da situação; (4) parcelas
-- regravadas iguais (só status/recebido mudaram — recebimento já é registrado pelas baixas) viravam "Alterou as condições".

-- Texto mudou de verdade? (vazio e sem valor são a mesma coisa)
create or replace function public.comercial_hist_mudou(a text, b text) returns boolean language sql immutable as $$
  select nullif(btrim(coalesce(a, '')), '') is distinct from nullif(btrim(coalesce(b, '')), '')
$$;

-- Resumo das parcelas que importa para quem negocia (o que, quanto, quando, como).
create or replace function public.comercial_hist_parcelas(p jsonb) returns jsonb language sql immutable as $$
  select coalesce(jsonb_agg(jsonb_build_array(x->>'componente', round(coalesce((x->>'valor')::numeric, 0), 2), x->>'vencimento', x->>'metodo')
         order by x->>'componente', x->>'vencimento', (x->>'valor')::numeric), '[]'::jsonb)
    from jsonb_array_elements(case when jsonb_typeof(p) = 'array' then p else '[]'::jsonb end) x
$$;

create or replace function public.comercial_hist_pedido()
returns trigger language plpgsql security definer set search_path=public as $$
declare
  e uuid; k text; rot text; v_de text; v_para text;
  campos jsonb := '{"horario_entrega":"o horário de entrega","horario_coleta":"o horário de coleta","observacoes_entrega":"a observação de entrega","observacoes_coleta":"a observação de coleta","observacoes_separacao":"a observação de separação","descricao":"a descrição do pedido"}';
  etapa text; reg jsonb; canc jsonb;
begin
  if tg_op = 'DELETE' then
    perform public.comercial_hist_gravar(old.empresa_id, old.id, 'pedido', null, 'Excluiu o pedido ' || coalesce(old.numero_pedido, '') || coalesce(' de ' || old.cliente_nome, ''),
      jsonb_build_object('pedido_numero', old.numero_pedido, 'cliente_nome', old.cliente_nome));
    return old;
  end if;
  e := new.empresa_id;
  if tg_op = 'INSERT' then
    perform public.comercial_hist_gravar(e, new.id, 'pedido', null, 'Criou o pedido (' || public.comercial_hist_status(new.status_comercial) || ')' ||
      case when new.observacoes ? 'projeto_catalogo_id' then ' a partir de um projeto do catálogo' else '' end, '{}');
    return new;
  end if;
  -- Situação
  if new.status_comercial is distinct from old.status_comercial then
    perform public.comercial_hist_gravar(e, new.id, 'status', null, 'Mudou a situação: ' || public.comercial_hist_status(old.status_comercial) || ' → ' || public.comercial_hist_status(new.status_comercial), '{}'); end if;
  if new.pre_reserva_ate is distinct from old.pre_reserva_ate
     and not (new.pre_reserva_ate is null and new.status_comercial is distinct from old.status_comercial) then
    perform public.comercial_hist_gravar(e, new.id, 'status', 'campo:pre_reserva_ate', null, jsonb_build_object('campo','a validade da pré-reserva','de',public.comercial_hist_data(old.pre_reserva_ate),'para',public.comercial_hist_data(new.pre_reserva_ate))); end if;
  -- Cliente, evento, datas e local
  if public.comercial_hist_mudou(old.numero_pedido, new.numero_pedido) then
    perform public.comercial_hist_gravar(e, new.id, 'evento', 'campo:numero', null, jsonb_build_object('campo','o número do pedido','de',old.numero_pedido,'para',new.numero_pedido)); end if;
  if public.comercial_hist_mudou(old.cliente_nome, new.cliente_nome) then
    perform public.comercial_hist_gravar(e, new.id, 'evento', 'campo:cliente', null, jsonb_build_object('campo','o cliente','de',old.cliente_nome,'para',new.cliente_nome)); end if;
  if public.comercial_hist_mudou(old.contato_cliente, new.contato_cliente) then
    perform public.comercial_hist_gravar(e, new.id, 'evento', 'campo:contato', null, jsonb_build_object('campo','o contato do cliente','de',old.contato_cliente,'para',new.contato_cliente)); end if;
  if public.comercial_hist_mudou(old.tipo_evento, new.tipo_evento) then
    perform public.comercial_hist_gravar(e, new.id, 'evento', 'campo:tipo', null, jsonb_build_object('campo','o tipo de evento','de',old.tipo_evento,'para',new.tipo_evento)); end if;
  if public.comercial_hist_mudou(old.local_nome, new.local_nome) then
    perform public.comercial_hist_gravar(e, new.id, 'evento', 'campo:local', null, jsonb_build_object('campo','o local','de',old.local_nome,'para',new.local_nome)); end if;
  if new.data_evento is distinct from old.data_evento then
    perform public.comercial_hist_gravar(e, new.id, 'evento', 'campo:data_evento', null, jsonb_build_object('campo','a data do evento','de',public.comercial_hist_data(old.data_evento),'para',public.comercial_hist_data(new.data_evento))); end if;
  if new.data_evento_fim is distinct from old.data_evento_fim then
    perform public.comercial_hist_gravar(e, new.id, 'evento', 'campo:data_evento_fim', null, jsonb_build_object('campo','o último dia do evento','de',public.comercial_hist_data(old.data_evento_fim),'para',public.comercial_hist_data(new.data_evento_fim))); end if;
  if new.data_entrega is distinct from old.data_entrega then
    perform public.comercial_hist_gravar(e, new.id, 'evento', 'campo:data_entrega', null, jsonb_build_object('campo','a data de entrega','de',public.comercial_hist_data(old.data_entrega),'para',public.comercial_hist_data(new.data_entrega))); end if;
  if new.data_coleta is distinct from old.data_coleta then
    perform public.comercial_hist_gravar(e, new.id, 'evento', 'campo:data_coleta', null, jsonb_build_object('campo','a data de coleta','de',public.comercial_hist_data(old.data_coleta),'para',public.comercial_hist_data(new.data_coleta))); end if;
  for k in select jsonb_object_keys(campos) loop
    v_de := old.observacoes->>k; v_para := new.observacoes->>k;
    if public.comercial_hist_mudou(v_de, v_para) then
      perform public.comercial_hist_gravar(e, new.id, 'evento', 'campo:obs.' || k, null, jsonb_build_object('campo', campos->>k, 'de', left(v_de, 160), 'para', left(v_para, 160)));
    end if;
  end loop;
  -- Valores e pagamento
  if new.valor_total is distinct from old.valor_total then
    perform public.comercial_hist_gravar(e, new.id, 'valores', 'campo:valor_total', null, jsonb_build_object('campo','o valor total','de',public.comercial_hist_moeda(old.valor_total),'para',public.comercial_hist_moeda(new.valor_total))); end if;
  for k, rot in select * from (values ('locacao','o valor da locação'),('frete','o frete'),('montagem','a montagem')) v(k, rot) loop
    if old.observacoes ? 'valores' and round(coalesce((old.observacoes->'valores'->>k)::numeric, 0), 2) <> round(coalesce((new.observacoes->'valores'->>k)::numeric, 0), 2) then
      perform public.comercial_hist_gravar(e, new.id, 'valores', 'campo:valores.' || k, null, jsonb_build_object('campo', rot,
        'de', public.comercial_hist_moeda(coalesce((old.observacoes->'valores'->>k)::numeric, 0)), 'para', public.comercial_hist_moeda(coalesce((new.observacoes->'valores'->>k)::numeric, 0))));
    end if;
  end loop;
  if public.comercial_hist_parcelas(old.observacoes->'parcelas_financeiras') is distinct from public.comercial_hist_parcelas(new.observacoes->'parcelas_financeiras') then
    perform public.comercial_hist_gravar(e, new.id, 'valores', 'parcelas', 'Alterou as condições de pagamento: ' ||
      jsonb_array_length(public.comercial_hist_parcelas(new.observacoes->'parcelas_financeiras')) || ' parcela(s), ' ||
      coalesce(public.comercial_hist_moeda((select sum((p->>'valor')::numeric) from jsonb_array_elements(case when jsonb_typeof(new.observacoes->'parcelas_financeiras') = 'array' then new.observacoes->'parcelas_financeiras' else '[]'::jsonb end) p)), 'R$ 0,00'), '{}');
  end if;
  canc := new.observacoes->'cancelamento';
  if jsonb_typeof(canc) = 'object' and canc <> '{}'::jsonb and canc is distinct from old.observacoes->'cancelamento' then
    perform public.comercial_hist_gravar(e, new.id, 'status', null, 'Registrou o cancelamento' || coalesce(': ' || nullif(btrim(canc->>'motivo'), ''), ''), '{}'); end if;
  -- Operação
  if new.status is distinct from old.status then
    perform public.comercial_hist_gravar(e, new.id, 'operacao', null, 'Separação: ' || public.comercial_hist_status(old.status) || ' → ' || public.comercial_hist_status(new.status), '{}'); end if;
  if new.status_operacional is distinct from old.status_operacional and new.status_operacional is not null then
    perform public.comercial_hist_gravar(e, new.id, 'operacao', null, 'Operação: ' || public.comercial_hist_status(new.status_operacional), '{}'); end if;
  foreach etapa in array array['carregamento','descarregamento','retorno'] loop
    reg := new.operacao->etapa;
    if (reg->>'concluido_em') is distinct from (old.operacao->etapa->>'concluido_em') and reg->>'concluido_em' is not null then
      perform public.comercial_hist_gravar(e, new.id, 'operacao', null,
        'Concluiu a conferência ' || case etapa when 'carregamento' then 'do carregamento' when 'descarregamento' then 'do descarregamento' else 'da volta' end ||
        ' (' || coalesce(reg->>'lidas','0') || ' de ' || coalesce(reg->>'total','0') ||
        case when coalesce(reg->>'sem_etiquetas','false')::boolean then ' peças, por quantidade' else ' volumes' end || ')' ||
        case when jsonb_array_length(coalesce(reg->'faltando','[]')) > 0 then ' — ' || jsonb_array_length(reg->'faltando') || ' pendência(s)' else '' end, '{}');
    end if;
  end loop;
  if new.encerrado_operacional_em is distinct from old.encerrado_operacional_em and new.encerrado_operacional_em is not null then
    perform public.comercial_hist_gravar(e, new.id, 'operacao', null, 'Encerrou o pedido na operação', '{}'); end if;
  if new.reducao_liberada_em is distinct from old.reducao_liberada_em then
    perform public.comercial_hist_gravar(e, new.id, 'operacao', null, case when new.reducao_liberada_em is null then 'Retirou a liberação para reduzir itens' else 'Liberou a redução de itens de um pedido já separado' end, '{}'); end if;
  return new;
exception when others then
  raise warning 'comercial_hist_pedido: %', sqlerrm;
  return coalesce(new, old);
end $$;

revoke all on function public.comercial_hist_pedido(), public.comercial_hist_mudou(text,text), public.comercial_hist_parcelas(jsonb) from public, anon, authenticated;

-- Apaga os registros falsos que já tinham sido gravados.
delete from public.comercial_historico
 where descricao like '%: (vazio) → (vazio)'
    or (descricao = 'Registrou o cancelamento' and tipo = 'status');
