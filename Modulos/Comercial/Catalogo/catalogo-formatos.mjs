// Formatos reutilizáveis do 3D Livre (Estúdio de Ambientes) — bloco de móveis (posições/rotações) que a pessoa
// monta uma vez e reaplica depois, em qualquer ambiente ("Salvar formato"/aba "Formatos" da biblioteca lateral,
// ver catalogo-studio3d.mjs). Extraído do Módulo Lounge ("Composições") quando esse módulo foi removido por
// pedido explícito do usuário ("dentro do modulo de 3d deixe apenas o 3d livre... pode remover os outros") — os
// formatos em si (`lounge_formatos`/RPCs `lounge_formatos_listar`/`lounge_formato_salvar`, nomeados assim no
// banco desde quando só o Lounge os usava) nunca foram exclusivos daquele módulo na prática, e o 3D Livre passou
// a ser o único consumidor. Puramente funções de dado (sem DOM/Three.js/Supabase) — self-contido, sem importar
// nada de catalogo-studio3d.mjs nem o contrário.

// Papéis reconhecidos num formato "legado" (salvo antes da versão 2, que guarda item_id/posição direto por peça
// — ver toRuntimeFormat abaixo) — mesmos papéis/regex que o preset "Lounge compacto" já usava.
const ROLE_DEFS = {
  sofa: { label: "Sofá", pattern: /sof[aá]/i },
  armchair: { label: "Poltrona", pattern: /poltrona/i },
  center: { label: "Mesa de centro", pattern: /mesa.*centro|centro.*mesa/i },
  side: { label: "Mesa lateral/canto", pattern: /mesa.*(lateral|canto)|(lateral|canto).*mesa/i },
  console: { label: "Aparador", pattern: /aparador/i },
};
const ROLE_ORDER = ["sofa", "armchair", "center", "side", "console"];
const REQUIRED_ROLES = new Set(["sofa", "armchair"]);

function roleDefinition(key){
  return { key, ...ROLE_DEFS[key], required: REQUIRED_ROLES.has(key) };
}

// "Lounge compacto" é o único formato embutido no código — continua existindo como formato de fábrica, sempre
// disponível, nunca editável/excluível pela tela (mesmo raciocínio de quando só existia dentro do Módulo Lounge).
const BUILTIN_FORMATS = [
  {
    key: "lounge-compacto",
    title: "Lounge compacto",
    description: "Sofá com poltronas nas pontas, viradas para o centro, sem sobreposições.",
    // Categoria obrigatória em todo formato NOVO desta sessão em diante (pedido explícito do usuário) — este é
    // embutido no código, nunca passa pela validação, então ganha a categoria direto aqui.
    categoria: "Lounge",
    // Sem `recordId` (não é uma linha do banco), não tem onde persistir um favorito — nunca aparece com a
    // estrela ativável no modal (ver "Formatos: modal grande + categoria obrigatória + favoritos" no CLAUDE.md).
    favorito: false,
    roles: ROLE_ORDER.map(roleDefinition),
    // Posições relativas (metros) de cada peça ao redor do sofá, escaladas pela largura/profundidade REAL do
    // sofá escolhido (poltronas nas pontas, viradas pro centro).
    layout(sofaSize){
      const halfW = Math.max(sofaSize.width || 1.8, 1.4) / 2;
      const depth = sofaSize.depth || 0.9;
      return {
        sofa: [{ position: [0, 0, 0], rotation: 0 }],
        armchair: [
          { position: [-(halfW + 0.78), 0, depth * 0.72], rotation: Math.PI / 2 },
          { position: [halfW + 0.78, 0, depth * 0.72], rotation: -Math.PI / 2 },
        ],
        center: [{ position: [0, 0, depth + 0.85], rotation: 0 }],
        side: [
          { position: [-(halfW + 0.4), 0, depth * 0.1], rotation: 0 },
          { position: [halfW + 0.4, 0, depth * 0.1], rotation: 0 },
        ],
        console: [{ position: [0, 0, -depth - 0.35], rotation: Math.PI }],
      };
    },
  },
];

// Exportada além de studioFormats/studioFormatPlacements: catalogo-studio3d.mjs precisa dela pra montar o picker
// de móveis do diálogo "Escolher os móveis" (filtra as opções de CADA papel do formato clicado — ver seção
// "Formatos: foto no lugar do 3D ao vivo + escolher os móveis" no CLAUDE.md).
export function matchingItems(role, items){
  if(role.subSlug) return items.filter(item => item.glb && item.cat === role.catSlug && item.subcat === role.subSlug);
  if(role.catSlug) return items.filter(item => item.glb && item.cat === role.catSlug);
  if(role.categoria) return items.filter(item => item.glb && item.catLabel === role.categoria);
  if(role.itemId) return items.filter(item => item.glb && String(item.id) === String(role.itemId));
  return items.filter(item => item.glb && role.pattern?.test((item.catLabel || '') + ' ' + (item.name || '')));
}

// Papéis de formatos salvos antes da versão com subcategoria (ver roleDefinitionForKey).
const LEGACY_ROLE_LABELS = { sofa: "Sofá", armchair: "Poltrona", center: "Mesa de centro", side: "Mesa lateral/canto", console: "Aparador" };

// Resolve um papel a partir só da CHAVE salva — usado por toRuntimeFormat() pra reconstruir um formato salvo. 3
// formatos de chave possíveis, do mais novo pro mais antigo: "sub:<catSlug>:<subSlug>" (subcategoria), "cat:<slug>"
// (categoria inteira — formato salvo numa fase intermediária) e as chaves fixas de LEGACY_ROLE_LABELS (mais
// antigo). Os rótulos buscam o catálogo ATUAL (pode ter mudado desde que o formato foi salvo — nesse caso cai no
// slug mesmo, melhor que travar).
function roleDefinitionForKey(key, items){
  if(key.startsWith("sub:")){
    const [, catSlug, subSlug] = key.split(":");
    const found = items.find((item) => item.cat === catSlug && item.subcat === subSlug);
    const subLabel = found?.subcatLabel || subSlug;
    const catLabel = found?.catLabel || catSlug;
    const duplicated = items.some((item) => item.subcat === subSlug && item.subcatLabel && item.cat !== catSlug);
    return { key, label: duplicated ? `${subLabel} (${catLabel})` : subLabel, catSlug, subSlug, required: false };
  }
  if(key.startsWith("cat:")){
    const slug = key.slice(4);
    const found = items.find((item) => item.cat === slug);
    const label = found?.catLabel || slug;
    return { key, label, categoria: label, required: false };
  }
  if(LEGACY_ROLE_LABELS[key]){
    return { key, label: LEGACY_ROLE_LABELS[key], pattern: ROLE_DEFS[key]?.pattern || /(?:)/, required: false };
  }
  return null;
}

function groupPapeisByRole(papeis){
  const grouped = {};
  (Array.isArray(papeis) ? papeis : []).forEach((piece) => {
    if(!piece?.role) return;
    if(!grouped[piece.role]) grouped[piece.role] = [];
    grouped[piece.role].push(piece);
  });
  return grouped;
}

// Área virtual (metros) que o diagrama 2D do editor de formatos representava, em qualquer formato "legado"
// (versão 1, sem posição em metros salva direto) — valores calibrados pra ficar na mesma ordem de grandeza que o
// "Lounge compacto" embutido já ocupava.
const DIAGRAM_SPAN_X = 6;
const DIAGRAM_SPAN_Z = 5;

// Converte um registro salvo (banco) num formato "de verdade" pro resto do módulo consumir — mesma forma de
// BUILTIN_FORMATS[0] (key/title/description/roles/layout()), só que os papéis e o layout vêm dos dados salvos,
// não de código fixo. Cada peça pode ser "versão 2" (posição em metros + item_id salvos direto, formato atual do
// 3D Livre) ou "versão 1"/legada (posição normalizada 0-1 num diagrama 2D, papel por regex/categoria).
function toRuntimeFormat(record, items){
  const grouped = groupPapeisByRole(record.papeis);
  const roles = Object.entries(grouped).map(([key, pieces]) => {
    const piece = pieces[0];
    return piece.version === 2 ? { key, label: piece.label || "Móvel", catSlug: piece.cat, subSlug: piece.subcat, itemId: piece.item_id, required: false } : roleDefinitionForKey(key, items);
  }).filter(Boolean);
  return {
    key: `custom:${record.id}`,
    title: record.nome,
    description: record.equipe ? "Formato criado pela equipe." : "Formato criado por você.",
    roles,
    custom: true,
    recordId: record.id,
    ownerId: record.cliente_id || null,
    isTeamFormat: Boolean(record.equipe),
    rawPapeis: record.papeis,
    // Foto de capa (ver "Formatos: foto no lugar do 3D ao vivo" no CLAUDE.md) — null pra formato salvo antes
    // dessa feature existir; a lista trata isso com fallback (renderiza o 3D ao vivo só nesse caso e preenche
    // a foto de volta no banco pra nunca mais precisar renderizar de novo).
    capaUrl: record.capa_url || null,
    // Categoria obrigatória em formato NOVO (ver lounge_formato_salvar), mas null é possível pra formato salvo
    // antes desta feature existir — quem agrupa por categoria (catalogo-studio3d.mjs) decide o rótulo de
    // fallback ("Outros"), não este módulo puramente de dado.
    categoria: record.categoria || null,
    favorito: Boolean(record.favorito),
    layout(){
      const out = {};
      Object.entries(grouped).forEach(([role, list]) => {
        out[role] = list.map((piece) => ({
          position: piece.version === 2 ? piece.position : [(Number(piece.x) - .5) * DIAGRAM_SPAN_X, 0, (Number(piece.z) - .23) * DIAGRAM_SPAN_Z],
          rotation: (Number(piece.rotation) || 0) * Math.PI / 180,
        }));
      });
      return out;
    },
  };
}

export function studioFormats(records, items){
  return [...BUILTIN_FORMATS, ...records.map(record => toRuntimeFormat(record, items))];
}

// `selection` (opcional): mapa role.key -> item ESCOLHIDO À MÃO (ver diálogo "Escolher os móveis" em
// catalogo-studio3d.mjs) — quando presente pra um papel, vence sobre a escolha automática de sempre (item
// salvo originalmente, senão o 1º disponível). Sem `selection` nenhuma (ou papel ausente dela), o
// comportamento é EXATAMENTE o de antes — usado assim pela prévia da lista (renderFormatPreview) e por
// qualquer chamada que não passe por aquele diálogo.
export function studioFormatPlacements(format, items, selection){
  const selected = new Map(format.roles.map(role => {
    const chosen = selection?.[role.key];
    if(chosen) return [role.key, chosen];
    const options = matchingItems(role, items);
    const item = options.find(item => String(item.id) === String(role.itemId)) ||
      ((format.custom || role.required) ? options[0] : null);
    return [role.key, item];
  }));
  const sofa = selected.get('sofa');
  const layout = format.layout(sofa?.dimensions || { width: 1.8, depth: .9 });
  const placements = [];
  for(const role of format.roles){
    const item = selected.get(role.key);
    if(!item && (format.custom || role.required)) throw new Error(`Nenhum modelo 3D disponível para ${role.label}.`);
    if(item) (layout[role.key] || []).forEach(placement => placements.push({item, ...placement}));
  }
  return placements;
}
