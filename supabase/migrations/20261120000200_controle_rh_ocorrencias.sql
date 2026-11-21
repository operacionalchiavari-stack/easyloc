-- (A tabela rh_ocorrencias antiga, vazia, é de outra tela; esta é a do Controle RH.)
-- Controle RH sai da planilha do Google (nov/2026): ocorrências numa tabela de verdade.
create table if not exists public.controle_rh_ocorrencias (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  codigo_antigo text,                       -- ID da linha na planilha antiga (migração)
  data_ocorrencia date not null,
  hora_ocorrencia time,
  funcionario_id uuid references public.funcionarios_acesso(id) on delete set null,
  funcionario_nome text not null check (btrim(funcionario_nome) <> ''),
  setor text,
  tipo text not null check (btrim(tipo) <> ''),
  observacao text,
  responsavel text,
  registrado_por uuid default auth.uid(),
  registrado_em timestamptz not null default now()
);
create index if not exists controle_rh_ocorrencias_empresa_data on public.controle_rh_ocorrencias(empresa_id, data_ocorrencia desc);
create unique index if not exists controle_rh_ocorrencias_codigo_antigo on public.controle_rh_ocorrencias(empresa_id, codigo_antigo) where codigo_antigo is not null;
alter table public.controle_rh_ocorrencias enable row level security;
drop policy if exists controle_rh_ocorrencias_ler on public.controle_rh_ocorrencias;
create policy controle_rh_ocorrencias_ler on public.controle_rh_ocorrencias for select to authenticated
  using (public.eh_membro_empresa(empresa_id) and public.operacao_pode(empresa_id, 'rh.colaboradores.visualizar'));
drop policy if exists controle_rh_ocorrencias_criar on public.controle_rh_ocorrencias;
create policy controle_rh_ocorrencias_criar on public.controle_rh_ocorrencias for insert to authenticated
  with check (public.eh_membro_empresa(empresa_id) and public.operacao_pode(empresa_id, 'rh.colaboradores.visualizar'));
drop policy if exists seguranca_2fa on public.controle_rh_ocorrencias;
create policy seguranca_2fa on public.controle_rh_ocorrencias as restrictive for all to authenticated
  using (public.seguranca_2fa_ok()) with check (public.seguranca_2fa_ok());
grant select, insert on public.controle_rh_ocorrencias to authenticated;

-- Traz as linhas da planilha (Controle RH, aba OcorrenciasRH) para a empresa dona.
insert into public.controle_rh_ocorrencias(empresa_id, codigo_antigo, data_ocorrencia, hora_ocorrencia, funcionario_nome, setor, tipo, observacao, responsavel, registrado_por, registrado_em)
select public.gs_empresa_dona(), nullif(btrim(l.valores->>0),''),
  to_date(l.valores->>1,'DD/MM/YYYY'),
  nullif(btrim(l.valores->>2),'')::time,
  btrim(concat_ws(' ', nullif(btrim(l.valores->>3),''), nullif(btrim(l.valores->>4),''))),
  nullif(btrim(l.valores->>5),''), coalesce(nullif(btrim(l.valores->>6),''),'Ocorrência'),
  nullif(btrim(l.valores->>7),''), nullif(btrim(l.valores->>8),''), null,
  coalesce(to_timestamp(coalesce(nullif(l.valores->>9,''),l.valores->>1)||' '||coalesce(nullif(l.valores->>10,''),'08:00:00'),'DD/MM/YYYY HH24:MI:SS') at time zone 'America/Sao_Paulo', now())
from public.gs_linhas l
where l.planilha_id = '1Jk1ScSsqmdYo70AiD96A5HRmfnVe2zdyljPn5f9EAZo' and l.aba = 'OcorrenciasRH' and l.linha > 1
  and l.valores->>1 ~ '^\d{2}/\d{2}/\d{4}$'
on conflict do nothing;

-- Liga ao Cadastro de Funcionários pelo nome (sem acento/maiúscula).
update public.controle_rh_ocorrencias o set funcionario_id = f.id
from public.funcionarios_acesso f
where o.funcionario_id is null and f.empresa_id = o.empresa_id
  and lower(translate(btrim(f.nome),'ÁÀÂÃÉÊÍÓÔÕÚÇáàâãéêíóôõúç','AAAAEEIOOOUCaaaaeeiooouc')) = lower(translate(btrim(o.funcionario_nome),'ÁÀÂÃÉÊÍÓÔÕÚÇáàâãéêíóôõúç','AAAAEEIOOOUCaaaaeeiooouc'));
