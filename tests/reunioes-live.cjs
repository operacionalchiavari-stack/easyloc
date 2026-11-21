// Teste opt-in (RUN_REUNIOES_LIVE=1) das Reuniões contra o banco, o Storage, a Edge Function reunioes-ia e a IA reais.
// Empresa e usuários temporários (apagados no fim). A reunião é gerada com duas vozes sintéticas diferentes (OpenAI TTS):
// Igor (voz masculina) e Larissa (voz feminina), cada um com a voz cadastrada. Confere: convite, quem vê a reunião
// confidencial, voz cadastrada, transcrição que separa e dá NOME a quem falou, ata com decisão e tarefa para a Larissa,
// "pergunte à reunião" e aprovação travando a ata.
require("dotenv").config({ quiet: true });
const { createClient } = require("@supabase/supabase-js");
const { randomUUID } = require("node:crypto");
const assert = require("node:assert/strict");

// Vozes geradas pelo narrador do Windows (Microsoft Maria). A segunda voz ("grave") é a mesma fala esticada no tempo:
// o tom fica mais grave e mais lento, outra "pessoa" para a separação de vozes.
const { execFileSync } = require("node:child_process"), os = require("node:os"), pth = require("node:path"), fsx = require("node:fs");
function falar(texto, voz) {
  const arq = pth.join(os.tmpdir(), "reun-" + randomUUID() + ".wav");
  const ps = `Add-Type -AssemblyName System.Speech; $s=New-Object System.Speech.Synthesis.SpeechSynthesizer; $s.SelectVoice('Microsoft Maria Desktop'); $f=New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(24000,[System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen,[System.Speech.AudioFormat.AudioChannel]::Mono); $s.SetOutputToWaveFile('${arq}',$f); $s.Speak([string]$env:TEXTO); $s.Dispose()`;
  execFileSync("powershell.exe", ["-NoProfile", "-Command", ps], { env: { ...process.env, TEXTO: texto } });
  let b = fsx.readFileSync(arq); fsx.unlinkSync(arq);
  if (voz === "grave") b = esticar(b, 1.32);
  return b;
}
function esticar(b, f) {
  let i = 12, ini = 0, n = 0; while (i < b.length) { const id = b.toString("ascii", i, i + 4), t = b.readUInt32LE(i + 4); if (id === "data") { ini = i + 8; n = t; break; } i += 8 + t; }
  const amostras = n / 2, novo = Math.floor(amostras * f), out = Buffer.alloc(44 + novo * 2);
  b.copy(out, 0, 0, 44); out.write("data", 36); out.writeUInt32LE(novo * 2, 40); out.writeUInt32LE(36 + novo * 2, 4);
  for (let k = 0; k < novo; k++) { const x = k / f, a = Math.floor(x), fr = x - a; const s0 = b.readInt16LE(ini + Math.min(a, amostras - 1) * 2), s1 = b.readInt16LE(ini + Math.min(a + 1, amostras - 1) * 2); out.writeInt16LE(Math.round(s0 + (s1 - s0) * fr), 44 + k * 2); }
  return out;
}
// junta WAVs (mesmo formato do TTS: PCM 16 bits) com silêncio entre eles
function juntarWav(lista, silencioSeg = 0.7) {
  const pcm = (b) => { if (b.toString('ascii', 36, 40) === 'data') return b.subarray(44, 44 + b.readUInt32LE(40)); let i = 12; while (i < b.length) { const id = b.toString("ascii", i, i + 4), n = b.readUInt32LE(i + 4); if (id === "data") return b.subarray(i + 8, Math.min(b.length, i + 8 + n)); i += 8 + n; } throw Error("wav sem data"); };
  const fmt = lista[0].subarray(0, 44), taxa = lista[0].readUInt32LE(24), canais = lista[0].readUInt16LE(22);
  const sil = Buffer.alloc(Math.round(taxa * silencioSeg) * 2 * canais);
  const dados = Buffer.concat(lista.flatMap((b, i) => (i ? [sil, pcm(b)] : [pcm(b)])));
  const cab = Buffer.from(fmt); cab.write("RIFF", 0); cab.writeUInt32LE(36 + dados.length, 4); cab.write("data", 36); cab.writeUInt32LE(dados.length, 40);
  return { wav: Buffer.concat([cab, dados]), seg: dados.length / (taxa * 2 * canais) };
}

(async () => {
  if (process.env.RUN_REUNIOES_LIVE !== "1") throw Error("Defina RUN_REUNIOES_LIVE=1");
  const url = process.env.SUPABASE_URL, anon = process.env.SUPABASE_ANON_KEY;
  const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const check = (r) => { if (r.error) throw Error(r.error.message); return r.data; };
  const sfx = randomUUID().slice(0, 8), senha = "Temp-" + randomUUID() + "!";
  let empresa; const users = []; const arquivos = [];
  const criarPessoa = async (nome, setor, role) => {
    const u = check(await admin.auth.admin.createUser({ email: `reun-${nome.split(" ")[0].normalize("NFD").replace(/[^a-z]/gi, "").toLowerCase()}-${sfx}@example.invalid`, password: senha, email_confirm: true })).user;
    users.push(u.id);
    check(await admin.from("usuarios").insert({ id: u.id, empresa_id: empresa, nome }));
    check(await admin.from("usuarios_empresas").insert({ user_id: u.id, empresa_id: empresa, role }));
    check(await admin.from("funcionarios_acesso").insert({ id: u.id, empresa_id: empresa, nome, setor, nivel_acesso: role === "admin" ? "Administrador" : "Operador" }));
    const c = createClient(url, anon, { auth: { persistSession: false } });
    check(await c.auth.signInWithPassword({ email: u.email, password: senha }));
    const { data: { session } } = await c.auth.getSession();
    return { id: u.id, nome, c, token: session.access_token };
  };
  const rpc = async (p, n, a) => check(await p.c.rpc(n, a));
  const ia = async (p, body) => {
    const r = await fetch(url + "/functions/v1/reunioes-ia", { method: "POST", headers: { "Content-Type": "application/json", apikey: anon, Authorization: "Bearer " + p.token }, body: JSON.stringify({ empresa_id: empresa, ...body }) });
    const d = await r.json(); if (!r.ok || d.erro) throw Error(d.erro || r.status); return d;
  };
  try {
    empresa = check(await admin.from("empresas").insert({ nome: "TESTE REUNIOES " + sfx }).select("id").single()).id;
    const igor = await criarPessoa("Igor Ramos", "Comercial", "admin");
    const larissa = await criarPessoa("Larissa Marques", "Logística", "member");
    const joao = await criarPessoa("João Pedro", "Montagem", "member");

    // 1) marcar a reunião confidencial com a Larissa
    const amanha = new Date(Date.now() + 864e5).toISOString();
    const { id } = await rpc(igor, "reuniao_salvar", { p_empresa: empresa, p_dados: { titulo: "Planejamento da frota de dezembro", tipo: "Logística", inicio: amanha, duracao_min: 30, visibilidade: "confidencial", pauta: "Caminhões para dezembro", participantes: [{ funcionario_id: larissa.id }] } });
    const vistoL = await rpc(larissa, "reunioes_listar", { p_empresa: empresa, p_de: "2026-01-01", p_ate: "2027-12-31" });
    const vistoJ = await rpc(joao, "reunioes_listar", { p_empresa: empresa, p_de: "2026-01-01", p_ate: "2027-12-31" });
    assert.equal(vistoL.length, 1, "convidada vê"); assert.equal(vistoL[0].minha_resposta, "pendente");
    assert.equal(vistoJ.length, 0, "quem não foi convidado não vê a confidencial");
    await rpc(larissa, "reuniao_responder", { p_id: id, p_resposta: "confirmado" });
    console.log("ok 1 convite, resposta e reunião confidencial escondida de quem não foi convidado");

    // 2) vozes cadastradas (cada um a sua) + o João não consegue ler a pasta das vozes
    for (const [p, voz, frase] of [[igor, "grave", "Olá, eu sou Igor. Estou cadastrando a minha voz para o sistema me reconhecer nas reuniões."], [larissa, "normal", "Olá, eu sou Larissa. Estou cadastrando a minha voz para o sistema me reconhecer nas reuniões."]]) {
      const w = falar(frase, voz);
      const path = `${empresa}/vozes/${p.id}-1.wav`;
      check(await p.c.storage.from("reunioes").upload(path, w, { contentType: "audio/wav" })); arquivos.push(path);
      await rpc(p, "reuniao_voz_salvar", { p_empresa: empresa, p_funcionario: p.id, p_path: path, p_tipo: "audio/wav", p_segundos: 6 });
    }
    const roubo = await joao.c.storage.from("reunioes").download(`${empresa}/vozes/${larissa.id}-1.wav`);
    assert.ok(roubo.error, "João não baixa a voz da Larissa");
    console.log("ok 2 vozes cadastradas e protegidas");

    // 3) a reunião: Igor e Larissa conversando
    const falas = [
      ["grave", "Bom dia, Larissa. Vamos falar da frota para dezembro, que vai ser o mês mais cheio do ano."],
      ["normal", "Bom dia, Igor. Pelos pedidos que já temos, vamos precisar de um caminhão a mais nos fins de semana de dezembro."],
      ["grave", "Concordo. Então fica decidido: vamos alugar um caminhão extra para dezembro."],
      ["normal", "Combinado. Eu fico responsável por fazer três cotações com as transportadoras até sexta-feira."],
      ["grave", "Perfeito. Ainda fica em aberto se o motorista vai ser nosso ou da locadora. Falamos disso na próxima segunda."],
    ];
    const { wav, seg } = juntarWav(falas.map(([v, t]) => falar(t, v)));
    const pathR = `${empresa}/${id}/parte-1-${Date.now()}.wav`;
    check(await larissa.c.storage.from("reunioes").upload(pathR, wav, { contentType: "audio/wav" })); arquivos.push(pathR);
    const intruso = await joao.c.storage.from("reunioes").download(pathR);
    assert.ok(intruso.error, "João não baixa a gravação da reunião confidencial");
    const parteId = await rpc(larissa, "reuniao_parte_registrar", { p_id: id, p_ordem: 1, p_path: pathR, p_tipo: "audio/wav", p_segundos: Math.round(seg), p_tamanho: wav.length });
    let negado = false; try { await ia(joao, { acao: "transcrever_parte", reuniao_id: id, parte_id: parteId }); } catch { negado = true; }
    assert.ok(negado, "João não usa a IA na reunião dos outros");
    const t0 = Date.now();
    const tr = await ia(larissa, { acao: "transcrever_parte", reuniao_id: id, parte_id: parteId });
    const det = await rpc(igor, "reuniao_obter", { p_id: id });
    const segs = det.partes_lista[0].transcricao;
    console.log(`  transcrição (${((Date.now() - t0) / 1000).toFixed(0)} s, ${tr.vozes} voz(es) reconhecida(s)):`);
    segs.forEach((s) => console.log(`   [${s.ini.toFixed(0)}s] ${s.quem}: ${s.texto}`));
    const quem = new Set(segs.map((s) => s.quem));
    assert.ok(quem.has("Igor Ramos") && quem.has("Larissa Marques"), "as duas vozes reconhecidas pelo nome: " + [...quem].join(", "));
    assert.ok(segs.some((s) => s.quem === "Larissa Marques" && /cota/i.test(s.texto)), "a fala das cotações é da Larissa");
    console.log("ok 3 transcrição separa as falas e dá o nome de quem falou");

    // 4) ata
    await ia(igor, { acao: "gerar_ata", reuniao_id: id });
    const r4 = await rpc(igor, "reuniao_obter", { p_id: id });
    console.log("  ATA:", JSON.stringify(r4.ata, null, 1).slice(0, 1600));
    console.log("  TAREFAS:", JSON.stringify(r4.tarefas));
    assert.ok(r4.ata.resumo.length > 30); assert.equal(r4.ata_status, "rascunho"); assert.equal(r4.status, "realizada");
    assert.ok(r4.ata.decisoes.some((d) => /caminh/i.test(d)), "decisão do caminhão extra");
    assert.ok(r4.ata.pendencias.some((d) => /motorista/i.test(d)), "pendência do motorista");
    const tarefa = r4.tarefas.find((t) => /cota/i.test(t.descricao));
    assert.ok(tarefa && tarefa.responsavel_id === larissa.id, "tarefa das cotações para a Larissa");
    assert.ok(tarefa.prazo, "prazo convertido de 'sexta-feira'");
    assert.ok(r4.participantes.find((p) => p.funcionario_id === larissa.id).presente, "quem falou fica presente");
    const minhas = await rpc(larissa, "reunioes_minhas_tarefas", { p_empresa: empresa });
    assert.equal(minhas.length, 1, "a tarefa aparece para a Larissa");
    console.log("ok 4 ata com decisão, pendência e tarefa com responsável e prazo");

    // 5) pergunte à reunião
    const p = await ia(larissa, { acao: "perguntar", reuniao_id: id, pergunta: "Quem ficou de fazer as cotações e até quando?" });
    console.log("  PERGUNTA:", p.resposta);
    assert.match(p.resposta, /Larissa/i);
    console.log("ok 5 pergunte à reunião");

    // 6) só o organizador aprova; aprovada não muda mais
    let barrou = false; try { await rpc(larissa, "reuniao_ata_aprovar", { p_id: id }); } catch { barrou = true; }
    assert.ok(barrou, "convidada não aprova");
    await rpc(igor, "reuniao_ata_aprovar", { p_id: id });
    barrou = false; try { await ia(igor, { acao: "gerar_ata", reuniao_id: id }); } catch { barrou = true; }
    assert.ok(barrou, "ata aprovada não é refeita");
    console.log("ok 6 aprovação pelo organizador trava a ata");
  } finally {
    if (arquivos.length) await admin.storage.from("reunioes").remove(arquivos);
    if (empresa) {
      await admin.from("reunioes").delete().eq("empresa_id", empresa);
      await admin.from("reuniao_vozes").delete().eq("empresa_id", empresa);
      await admin.from("funcionarios_acesso").delete().eq("empresa_id", empresa);
      await admin.from("usuarios_empresas").delete().eq("empresa_id", empresa);
      await admin.from("usuarios").delete().eq("empresa_id", empresa);
      await admin.from("empresas").delete().eq("id", empresa);
    }
    for (const u of users) await admin.auth.admin.deleteUser(u);
  }
})().catch((e) => { console.error(e); process.exit(1); });
