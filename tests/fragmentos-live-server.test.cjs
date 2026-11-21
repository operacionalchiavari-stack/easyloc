// O Live Server (computador local) injeta o script de recarga no primeiro tipo de marca que achar no HTML
// (</body>, senão </svg>, senão </head>), em TODAS as ocorrências, mas avisa o tamanho do arquivo contando uma injeção só.
// Com duas ou mais, o fim da página chega cortado. Aconteceu em 15/11/2026: a Disponibilidade de Itens (fragmento sem
// </body>, com dois ícones <svg> desde 31/10) perdeu a tabela. Este teste barra o problema em qualquer HTML do projeto.
// Uso: node --test tests/fragmentos-live-server.test.cjs
const test = require("node:test"), assert = require("node:assert/strict");
const { execSync } = require("node:child_process"), fs = require("node:fs"), path = require("node:path");
const raiz = path.resolve(__dirname, "..");
const conta = (t, re) => (t.match(re) || []).length;

test("nenhum HTML recebe mais de uma injeção do Live Server", () => {
  const arquivos = execSync("git ls-files *.html **/*.html", { cwd: raiz, encoding: "utf8" }).split(/\r?\n/).filter(Boolean);
  assert.ok(arquivos.length > 50, "lista de HTML vazia: " + arquivos.length);
  const ruins = [];
  for (const rel of new Set(arquivos)) {
    const t = fs.readFileSync(path.join(raiz, rel), "utf8");
    const body = conta(t, /<\/body>/gi), svg = conta(t, /<\/svg>/g), head = conta(t, /<\/head>/gi);
    if (body) { if (body > 1) ruins.push(rel + ": " + body + "× </body>"); continue; }
    // fragmento (tela antiga colada por carregarNaMain): nenhuma marca, nem em comentário; ícones pelo JS ou CSS
    if (svg || head) ruins.push(rel + ": fragmento com " + [svg && svg + "× </svg>", head && head + "× </head>"].filter(Boolean).join(", "));
  }
  assert.deepEqual(ruins, [], "Arquivos que o Live Server cortaria:\n" + ruins.join("\n"));
});
