const {spawnSync}=require('node:child_process');
const suites=[
 'tests/pedido-ciclo-excecoes.test.cjs','tests/fluxo-unico-pedidos.test.cjs','tests/fin-posicao-final.test.cjs',
 'tests/ciclo-operacional.test.cjs','tests/continuidade-operacional.test.cjs',
 'tests/inventario-qualidade.test.cjs','tests/acervo-operacao-real.test.cjs',
 'tests/permissoes-operacao.test.cjs','tests/acervo-painel.test.cjs','tests/acervo-tabela-browser.test.cjs',
 'tests/gestao-acervo-browser.test.cjs','tests/os-historico-browser.test.cjs',
 'tests/ordens-visualizacao-browser.test.cjs'
];
const r=spawnSync(process.execPath,['--test','--test-concurrency=1',...suites],{stdio:'inherit',env:process.env});
if(r.error){console.error(r.error.message);process.exitCode=1;}else process.exitCode=r.status??1;
