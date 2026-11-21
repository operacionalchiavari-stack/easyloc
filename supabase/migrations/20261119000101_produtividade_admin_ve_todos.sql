-- Produtividade comercial (19/11/2026): quem configura a empresa (administrador) vê todos os participantes, mesmo sem
-- cadastro de funcionário e sem estar na matriz "quem vê quem". Antes um administrador sem cadastro (ex.: o dono) via
-- "Nenhuma pessoa do Comercial liberada para você". Troca só o filtro de alvos das duas funções que o usam.
do $$
declare fn text; d text;
begin
  foreach fn in array array['comercial_prod_indicadores', 'comercial_prod_detalhe'] loop
    select pg_get_functiondef(p.oid) into d from pg_proc p where p.proname = fn and p.pronamespace = 'public'::regnamespace;
    if d is null or position('f.id = auth.uid() or exists' in d) = 0 then raise exception 'Trecho não encontrado em %', fn; end if;
    if position('operacao_pode(p_empresa, ''configuracoes.empresa.editar'') or exists' in d) = 0 then
      d := replace(d, 'f.id = auth.uid() or exists', 'f.id = auth.uid() or operacao_pode(p_empresa, ''configuracoes.empresa.editar'') or exists');
      execute d;
    end if;
  end loop;
end $$;
-- a tela precisa saber que é administrador (para listar todos os participantes)
do $$
declare d text;
begin
  select pg_get_functiondef('public.comercial_prod_contexto'::regproc) into d;
  if position('''admin''' in d) = 0 then
    d := replace(d, 'jsonb_build_object(''config'',cfg,''pessoas'',pessoas,''usuario'',auth.uid())',
      'jsonb_build_object(''config'',cfg,''pessoas'',pessoas,''usuario'',auth.uid(),''admin'',operacao_pode(p_empresa,''configuracoes.empresa.editar''))');
    if position('''admin''' in d) = 0 then raise exception 'Trecho não encontrado em comercial_prod_contexto'; end if;
    execute d;
  end if;
end $$;
