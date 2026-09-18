begin;
-- Portal de entrada: virou UMA foto só cobrindo a tela inteira, em vez
-- das 3 fotos por bloco (pedido explícito do usuário: "ao invés de ser
-- 3 fotos quero que seja uma foto só... a foto será da tela toda, o
-- funcionamento dos módulos continuam normal"). A tabela
-- `catalogo_capas` (20260916000300_catalogo_capas_portal.sql) continua
-- igual — mesma estrutura, mesmo bucket "biblioteca", mesmas RPCs de
-- leitura/permissão — só a CHECK de `chave` precisa aceitar a nova
-- chave "portal" (a foto única) além das 3 antigas. As 3 linhas antigas
-- ('catalogo'/'biblioteca'/'modulo3d'), se existirem pra alguma
-- empresa, ficam órfãs no banco (não lidas mais pelo frontend a partir
-- desta versão) — não apagadas de propósito, mesma cautela já usada
-- nesta sessão pra CSS/RPCs legados: não misturar limpeza não pedida
-- com a mudança pedida.
alter table public.catalogo_capas drop constraint if exists catalogo_capas_chave_check;
alter table public.catalogo_capas add constraint catalogo_capas_chave_check
  check (chave in ('catalogo', 'biblioteca', 'modulo3d', 'portal'));
commit;
