-- Etiquetas dos cadastros de Clientes e Locais (Estilo, Canal, Horário, Orçamento...) editáveis em
-- Parâmetros > Comercial (out/2026). Antes eram fixas no HTML de cada cadastro.
-- grupos = [{ chave, titulo, cor, unica, obrigatoria, opcoes:[texto] }]. A chave é o nome gravado em
-- clientes_empresas.tags / locais_empresas.tags (não muda depois de criada; o título pode mudar).
create table if not exists public.cadastro_etiquetas (
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  cadastro text not null check (cadastro in ('cliente', 'local')),
  grupos jsonb not null default '[]'::jsonb check (jsonb_typeof(grupos) = 'array'),
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid default auth.uid(),
  primary key (empresa_id, cadastro)
);
alter table public.cadastro_etiquetas enable row level security;

drop policy if exists cadastro_etiquetas_ler on public.cadastro_etiquetas;
create policy cadastro_etiquetas_ler on public.cadastro_etiquetas for select to authenticated
  using (public.eh_membro_empresa(empresa_id));
drop policy if exists cadastro_etiquetas_gravar on public.cadastro_etiquetas;
create policy cadastro_etiquetas_gravar on public.cadastro_etiquetas for all to authenticated
  using (public.eh_membro_empresa(empresa_id) and public.operacao_pode(empresa_id, 'configuracoes.empresa.editar'))
  with check (public.eh_membro_empresa(empresa_id) and public.operacao_pode(empresa_id, 'configuracoes.empresa.editar'));
drop policy if exists seguranca_2fa on public.cadastro_etiquetas;
create policy seguranca_2fa on public.cadastro_etiquetas as restrictive for all to authenticated
  using ((select public.seguranca_2fa_ok())) with check ((select public.seguranca_2fa_ok()));
grant select, insert, update on public.cadastro_etiquetas to authenticated;

-- Cada empresa começa com as opções que estavam fixas nas telas.
insert into public.cadastro_etiquetas (empresa_id, cadastro, grupos)
select e.id, 'cliente', '[
  {"chave":"estilo","titulo":"Estilo","cor":"azul","unica":false,"obrigatoria":true,"opcoes":["Clássico","Moderno","Rústico","Boho","Luxo"]},
  {"chave":"canal","titulo":"Canal","cor":"verde","unica":true,"obrigatoria":true,"opcoes":["WhatsApp","Ligação","Email"]},
  {"chave":"horario","titulo":"Horário","cor":"amarelo","unica":true,"obrigatoria":true,"opcoes":["Manhã","Tarde","Noite"]},
  {"chave":"orcamento","titulo":"Orçamento","cor":"laranja","unica":true,"obrigatoria":true,"opcoes":["Econômico","Intermediário","Premium"]},
  {"chave":"comportamento","titulo":"Comportamento","cor":"vermelho","unica":false,"obrigatoria":true,"opcoes":["Detalhista","Indeciso","Objetivo","Exigente"]}
]'::jsonb from public.empresas e
on conflict do nothing;

insert into public.cadastro_etiquetas (empresa_id, cadastro, grupos)
select e.id, 'local', '[
  {"chave":"tipo","titulo":"Tipo","cor":"azul","unica":true,"obrigatoria":true,"opcoes":["Casa de Festa","Pousada","Residência","Hotel","Clube"]},
  {"chave":"canal","titulo":"Canal","cor":"verde","unica":true,"obrigatoria":true,"opcoes":["WhatsApp","Ligação","Email"]},
  {"chave":"horario","titulo":"Horário","cor":"amarelo","unica":true,"obrigatoria":true,"opcoes":["Manhã","Tarde","Noite"]},
  {"chave":"orcamento","titulo":"Orçamento","cor":"laranja","unica":true,"obrigatoria":true,"opcoes":["Econômico","Intermediário","Premium"]},
  {"chave":"observacoes","titulo":"Observações","cor":"vermelho","unica":false,"obrigatoria":true,"opcoes":["Rígido com horários","Necessita Baldeação","Caminhão para em frente","Tem escadas","Tem Elevador","Caminhão para perto"]}
]'::jsonb from public.empresas e
on conflict do nothing;
