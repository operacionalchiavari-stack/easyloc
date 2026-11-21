// Etapa 1: quem faz a operação (vendedora com login + equipe), decoradoras com foto e locais com mapa.
const C = require("./comum.cjs");
const { chromium } = require("playwright");
const crypto = require("crypto");

const DECORADORAS = [
  { nome: "Mariana Albuquerque", pf: true, tel: "24998127745", email: "mariana.albuquerque.decor@exemplo.com.br", end: "Rua do Imperador, 288 - Centro, Petrópolis - RJ, 25620-000", estilo: ["Clássico", "Luxo"], orc: "Premium", comp: ["Detalhista"], bv: 10 },
  { nome: "Ateliê Flor de Lis", pf: false, tel: "24992214580", email: "contato@ateliefordelis.com.br", end: "Estrada União e Indústria, 9153 - Itaipava, Petrópolis - RJ, 25730-745", estilo: ["Boho", "Rústico"], orc: "Intermediário", comp: ["Objetivo"], bv: 0 },
  { nome: "Bruna Campos Eventos", pf: false, tel: "21987451230", email: "bruna@brunacamposeventos.com.br", end: "Rua Visconde de Pirajá, 414 - Ipanema, Rio de Janeiro - RJ, 22410-002", estilo: ["Moderno", "Luxo"], orc: "Premium", comp: ["Exigente"], bv: 12, desconto: 5 },
  { nome: "Casa Lume Decoração", pf: false, tel: "24999031256", email: "ola@casalume.com.br", end: "Rua Paulo Barbosa, 81 - Centro, Petrópolis - RJ, 25620-030", estilo: ["Moderno"], orc: "Intermediário", comp: ["Indeciso"], bv: 0 },
  { nome: "Patrícia Moreira", pf: true, tel: "24988765012", email: "patricia.moreira.festas@exemplo.com.br", end: "Rua Teresa, 1280 - Alto da Serra, Petrópolis - RJ, 25635-530", estilo: ["Clássico"], orc: "Econômico", comp: ["Objetivo"], bv: 0 },
  { nome: "Juliana Prado Design", pf: false, tel: "21996632104", email: "juliana@julianaprado.design", end: "Av. das Américas, 4666 - Barra da Tijuca, Rio de Janeiro - RJ, 22640-102", estilo: ["Moderno", "Boho"], orc: "Premium", comp: ["Detalhista", "Exigente"], bv: 15 },
  { nome: "Studio Ramos Festas", pf: false, tel: "24992458871", email: "studio@ramosfestas.com.br", end: "Rua Luiz Winter, 120 - Duarte da Silveira, Petrópolis - RJ, 25665-431", estilo: ["Rústico"], orc: "Intermediário", comp: ["Objetivo"], bv: 0 },
  { nome: "Carolina Vieira", pf: true, tel: "21991127730", email: "carolvieira.decor@exemplo.com.br", end: "Rua Duque de Caxias, 54 - Várzea, Teresópolis - RJ, 25953-020", estilo: ["Boho"], orc: "Intermediário", comp: ["Indeciso"], bv: 8 },
  { nome: "Renata Lins Decorações", pf: false, tel: "24988103347", email: "renata@renatalins.com.br", end: "Estrada das Arcas, 1500 - Itaipava, Petrópolis - RJ, 25745-125", estilo: ["Clássico", "Luxo"], orc: "Premium", comp: ["Detalhista"], bv: 10, desconto: 8 },
  { nome: "Aline Duarte Eventos", pf: true, tel: "24999560218", email: "aline.duarte.eventos@exemplo.com.br", end: "Rua Coronel Veiga, 870 - Coronel Veiga, Petrópolis - RJ, 25655-151", estilo: ["Moderno", "Rústico"], orc: "Econômico", comp: ["Objetivo"], bv: 0 },
];
const LOCAIS = [
  { nome: "Quinta das Araucárias", end: "Estrada das Arcas, 3920 - Itaipava, Petrópolis - RJ, 25745-125", num: "3920", lat: -22.3921, lng: -43.1239, tipo: "Casa de Festa", orc: "Premium", obs: ["Caminhão para em frente"], part: "Gramado com irrigação automática: o caminhão não pode entrar no gramado. Descarregar no estacionamento." },
  { nome: "Recanto Serra Verde", end: "Estrada União e Indústria, 11800 - Itaipava, Petrópolis - RJ, 25730-735", num: "11800", lat: -22.4104, lng: -43.1371, tipo: "Pousada", orc: "Intermediário", obs: ["Tem escadas", "Caminhão para perto"], part: "Salão no 2º andar, escada estreita (sem elevador). Levar carrinho." },
  { nome: "Casa Alvorada Eventos", end: "Rua Teresa, 455 - Centro, Petrópolis - RJ, 25625-020", num: "455", lat: -22.5051, lng: -43.1802, tipo: "Casa de Festa", orc: "Intermediário", obs: ["Rígido com horários"], part: "Entrega só até 10h: depois disso a rua fica fechada para carga." },
  { nome: "Fazenda Vale do Cuiabá", end: "Estrada do Cuiabá, 2100 - Itaipava, Petrópolis - RJ, 25745-330", num: "2100", lat: -22.3601, lng: -43.0752, tipo: "Residência", orc: "Premium", obs: ["Necessita Baldeação"], part: "Estrada de terra no último km: caminhão grande não passa, fazer baldeação com o pequeno." },
  { nome: "Pousada Bosque das Hortênsias", end: "Rua Ipiranga, 760 - Nogueira, Petrópolis - RJ, 25720-110", num: "760", lat: -22.4571, lng: -43.1462, tipo: "Pousada", orc: "Intermediário", obs: ["Caminhão para perto"], part: "" },
  { nome: "Hotel Mirante da Serra", end: "Estrada Bernardo Coutinho, 4300 - Araras, Petrópolis - RJ, 25725-025", num: "4300", lat: -22.4333, lng: -43.2331, tipo: "Hotel", orc: "Premium", obs: ["Tem Elevador", "Rígido com horários"], part: "Montagem só depois das 14h (check-out dos hóspedes). Usar o elevador de serviço." },
  { nome: "Espaço Lago Azul", end: "Estrada Teresópolis-Friburgo, km 12 - Vargem Grande, Teresópolis - RJ, 25995-000", num: "km 12", lat: -22.4152, lng: -42.9663, tipo: "Clube", orc: "Econômico", obs: ["Caminhão para em frente"], part: "" },
  { nome: "Solar das Palmeiras", end: "Estrada União e Indústria, 21400 - Pedro do Rio, Petrópolis - RJ, 25750-225", num: "21400", lat: -22.3302, lng: -43.1271, tipo: "Casa de Festa", orc: "Premium", obs: ["Tem escadas"], part: "Deck de madeira: proteger os pés dos móveis com feltro." },
];
const EQUIPE = [
  { nome: "Rodrigo Teixeira", setor: "Montagem", cargo: "Montador líder", equipe: "montagem", lider: true },
  { nome: "Felipe Andrade", setor: "Montagem", cargo: "Montador", equipe: "montagem" },
  { nome: "Thiago Moura", setor: "Logística", cargo: "Auxiliar de carregamento", equipe: "carregamento", lider: true },
  { nome: "Camila Rocha", setor: "Triagem", cargo: "Auxiliar de triagem", equipe: "triagem", lider: true },
];

(async () => {
  const E = C.lerEstado();
  const browser = await chromium.launch({ channel: "msedge" });
  const reg = [];
  try {
    /* vendedora com login (administradora, faz tudo pelo sistema) */
    if (!E.usuario) {
      const senha = "Demo-" + crypto.randomUUID() + "!";
      const email = "larissa.mendes.demo@exemplo.com.br";
      const u = C.check(await C.admin.auth.admin.createUser({ email, password: senha, email_confirm: true, user_metadata: { nome: "Larissa Mendes" } }), "usuário").user;
      C.check(await C.admin.from("usuarios_empresas").insert({ user_id: u.id, empresa_id: C.EMPRESA, role: "admin" }), "vínculo");
      await C.admin.from("usuarios").upsert({ id: u.id, nome: "Larissa Mendes", email });
      const foto = await C.fotoFicticia(browser, { seed: "larissa" });
      C.check(await C.admin.storage.from("avatares").upload(`${C.EMPRESA}/${u.id}.jpg`, foto, { contentType: "image/jpeg", upsert: true }), "avatar");
      E.usuario = { id: u.id, email, senha };
      C.gravarEstado(E);
      console.log("ok - vendedora Larissa Mendes");
    }
    const { client: sb } = await C.sessaoDe(E.usuario.email, E.usuario.senha);

    /* equipe pelo Cadastro de Funcionários (mesma função da tela), com foto e PIN */
    E.equipe ||= {};
    for (const [i, f] of EQUIPE.entries()) {
      if (E.equipe[f.nome]) continue;
      const foto = await C.fotoFicticia(browser, { seed: "func-" + f.nome });
      const doc = C.cpf("func" + f.nome);
      const r = await sb.functions.invoke("funcionarios-admin", { body: { action: "save", empresa_id: C.EMPRESA, photo: "data:image/jpeg;base64," + foto.toString("base64"),
        employee: { nome: f.nome, setor: f.setor, cargo: f.cargo, acesso_sistema: false, ativo: true, pin: String(1234 + i), nivel_acesso: "Visualizador", cpf: doc, telefone: "2499" + String(1000000 + i * 7311).slice(0, 7), equipe_operacional: f.equipe, data_admissao: C.dia(-400 - i * 60), dados_rh: { data_nascimento: "199" + i + "-0" + (i + 3) + "-1" + i, whatsapp: "2499" + String(2000000 + i * 5113).slice(0, 7), endereco: "Petrópolis - RJ" } } } });
      if (r.error) { let d; try { d = await r.error.context.json(); } catch {} throw Error("funcionário " + f.nome + ": " + (d?.error || r.error.message)); }
      const id = r.data.id;
      if (f.lider) C.check(await sb.rpc("rh_definir_lider", { p_empresa_id: C.EMPRESA, p_funcionario: id, p_lider: true }), "líder");
      E.equipe[f.nome] = { id, cpf: doc, pin: String(1234 + i) };
      await C.anotar([{ tabela: "funcionarios_acesso", chave: "id", valor: id }]);
      C.gravarEstado(E);
      console.log("ok - funcionário " + f.nome);
    }

    /* decoradoras: mesmo caminho do Cadastro de Clientes (documento protegido + logo/foto do catálogo) */
    E.clientes ||= {};
    for (const [i, d] of DECORADORAS.entries()) {
      if (E.clientes[d.nome]) continue;
      const documento = d.pf ? C.cpf(d.nome) : C.cnpj(d.nome);
      const prot = await sb.functions.invoke("cadastro-protegido", { body: { action: "proteger", tabela: "cliente", empresa_id: C.EMPRESA, documento } });
      if (prot.error) { let x; try { x = await prot.error.context.json(); } catch {} throw Error("documento: " + (x?.error || prot.error.message)); }
      const id = crypto.randomUUID();
      const numero = (d.end.match(/,\s*([^ -]+)\s*-/) || [])[1] || "";
      const payload = { id, empresa_id: C.EMPRESA, nome_razao: d.nome, telefone: d.tel, email: d.email, endereco: d.end, numero_endereco: numero, ponto_referencia: i % 2 ? "Próximo à praça" : "Em frente à padaria",
        status: "Ativo", tipo_pessoa: d.pf ? "PF" : "PJ", inscricao_estadual: d.pf ? null : "isento",
        tags: { estilo: d.estilo, canal: ["WhatsApp", "Ligação", "WhatsApp", "Email"][i % 4], horario: ["Manhã", "Tarde", "Noite"][i % 3], orcamento: d.orc, comportamento: d.comp },
        bv_recebe: d.bv > 0, bv_percentual: d.bv || 0, bv_observacao: d.bv ? "Parceira antiga, BV combinado na tabela de 2026." : null, bv_negociado_por: d.bv ? "Larissa Mendes" : null, bv_aprovado_por: d.bv ? "Jonatan Falck" : null,
        desconto_fixo_ativo: !!d.desconto, desconto_fixo_percentual: d.desconto || 0, desconto_fixo_observacao: d.desconto ? "Condição especial por volume de eventos." : null,
        cpf_cnpj: prot.data.cpf_cnpj, cpf_cnpj_hash: prot.data.cpf_cnpj_hash, cofre_mascaras: { cpf_cnpj: prot.data.mascara || "" } };
      C.check(await sb.from("clientes_empresas").insert(payload), "cliente " + d.nome);
      const img = await C.fotoFicticia(browser, d.pf ? { seed: "cli-" + d.nome } : { tipo: "logo", seed: "cli-" + d.nome, texto: d.nome.split(" ").slice(-1)[0] });
      const pth = `${C.EMPRESA}/${id}/logo-${Date.now()}.jpg`;
      C.check(await sb.storage.from("catalogo-clientes").upload(pth, img, { contentType: "image/jpeg", cacheControl: "31536000" }), "logo");
      const urlLogo = sb.storage.from("catalogo-clientes").getPublicUrl(pth).data.publicUrl;
      C.check(await sb.from("clientes_empresas").update({ catalogo_logo_url: urlLogo }).eq("id", id), "logo no cadastro");
      E.clientes[d.nome] = { id, documento };
      await C.anotar([{ tabela: "clientes_empresas", chave: "id", valor: id }]);
      C.gravarEstado(E);
      console.log("ok - decoradora " + d.nome);
    }

    /* locais com coordenadas, distância do galpão, etiquetas e particularidades */
    E.locais ||= {};
    for (const [i, l] of LOCAIS.entries()) {
      if (E.locais[l.nome]) continue;
      const id = crypto.randomUUID(), dist = C.km(l.lat, l.lng);
      const protL = await sb.functions.invoke("cadastro-protegido", { body: { action: "proteger", tabela: "local", empresa_id: C.EMPRESA, documento: C.cnpj("local" + l.nome) } });
      if (protL.error) throw Error("documento do local: " + protL.error.message);
      C.check(await sb.from("locais_empresas").insert({ id, empresa_id: C.EMPRESA, nome_razao: l.nome, telefone: "24" + String(22430000 + i * 17311).slice(0, 8), email: l.nome.toLowerCase().normalize("NFD").replace(/[^a-z]/g, "") + "@exemplo.com.br",
        endereco: l.end, numero_endereco: l.num, ponto_referencia: "Portão principal", particularidades: l.part || null, status: "Ativo", tipo_pessoa: "PJ", inscricao_estadual: "isento",
        latitude: l.lat, longitude: l.lng, distancia_galpao_km: dist, distancia_galpao_texto: String(dist).replace(".", ",") + " km", distancia_calculada_em: new Date().toISOString(),
        tags: { tipo: l.tipo, canal: "WhatsApp", horario: ["Manhã", "Tarde"][i % 2], orcamento: l.orc, observacoes: l.obs },
        cpf_cnpj: protL.data.cpf_cnpj, cpf_cnpj_hash: protL.data.cpf_cnpj_hash, cofre_mascaras: { cpf_cnpj: protL.data.mascara || "" } }), "local " + l.nome);
      E.locais[l.nome] = { id, km: dist };
      await C.anotar([{ tabela: "locais_empresas", chave: "id", valor: id }]);
      C.gravarEstado(E);
      console.log("ok - local " + l.nome + " (" + dist + " km)");
    }
    if (reg.length) await C.anotar(reg);
  } finally { await browser.close(); }
})().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
