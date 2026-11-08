/* =====================================================
   CONFERÊNCIA POR BIPAGEM (out/2026)
   conferencia.html?pedido=<id>&etapa=carregamento|retorno — aberta pelo cronograma.
   Confere só lendo etiquetas: a etiqueta de envio de cada móvel (ACERVO:ENV:) ou o QR fixo dele
   (ACERVO:PAT:, que marca a próxima etiqueta daquele item). Não há marcação manual, de propósito.
   - carregamento: marca separacoes_etiquetas.lida_carregamento_em
   - retorno (triagem da volta): marca lida_retorno_em
   Concluir grava no pedido status_operacional (carregado/retornado) e operacao.<etapa>
   (quando, quem, lidas, total, o que faltou).
===================================================== */
(function () {
  "use strict";
  const ETAPAS = {
    descarregamento: { campo: "lida_descarregamento_em", titulo: "Conferência do descarregamento", rotulo: "Descarregamento", status: "descarregado", verbo: "descarregado" },
    carregamento: { campo: "lida_carregamento_em", titulo: "Conferência do carregamento", rotulo: "Carregamento", status: "carregado", verbo: "carregado" },
    retorno: { campo: "lida_retorno_em", titulo: "Conferência da volta", rotulo: "Triagem da volta", status: "retornado", verbo: "voltou" }
  };
  const params = new URLSearchParams(location.search);
  const etapa = ETAPAS[params.get("etapa")] ? params.get("etapa") : "carregamento";
  const cfg = ETAPAS[etapa];
  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const s = { sb: null, empresa: null, usuario: null, nome: "", pedido: null, itens: [], etiquetas: [], patLidos: new Set(), nomes: new Map(), ocupado: false, base: [], revelado: false, recontou: false };
  // Volta (descarregamento na Expedição e triagem de volta): divergência pede uma segunda contagem antes de concluir,
  // e o que continuar diferente fica aberto (falta/sobra) até alguém resolver.
  const etapaVolta = etapa === "retorno" || etapa === "descarregamento";
  // Retorno às cegas: quem confere não vê quantos volumes deviam voltar nem o que falta; o sistema compara
  // com o que saiu no carregamento só quando a conferência é concluída (s.revelado). O descarregamento também é às
  // cegas quando Parâmetros > Operação manda (empresa_logistica_regras.descarregamento_conferencia = 'cegas').
  let cega = etapa === "retorno";
  const voltaOuChegou = () => etapa === "retorno" ? "voltou" : "foi descarregada";
  const escondido = () => cega && !s.revelado;
  function confirmarConclusao(faltas=[],oculto=false){
    if(document.querySelector('dialog.cf-confirmacao[open]'))return Promise.resolve(false);
    return new Promise(resolve=>{
      const d=document.createElement('dialog');d.className='cf-confirmacao';
      const pendente=!oculto&&faltas.length>0;
      d.innerHTML='<form><header><span class="cf-confirmacao-icone" aria-hidden="true">'+(pendente?'!':'✓')+'</span><div><small>'+esc(cfg.rotulo)+' · Pedido '+esc(s.pedido.numero_pedido||'')+'</small><h2>'+(oculto?(etapa==='retorno'?'Concluir conferência de retorno?':'Concluir conferência do descarregamento?'):pendente?'Concluir com pendências?':'Concluir conferência?')+'</h2></div></header><div class="cf-confirmacao-corpo"><p>'+(oculto?'O sistema vai comparar as quantidades conferidas com o que saiu no carregamento. Se faltar ou sobrar alguma peça, a diferença vai para Estoque › Gestão do acervo, que faz a contagem geral e resolve.':pendente?'Alguns itens estão com a quantidade menor que a esperada. Você pode voltar para revisar ou concluir; as diferenças vão para Estoque › Gestão do acervo, que faz a contagem geral e resolve.':'Todos os itens informados estão conferidos. Deseja concluir esta etapa?')+'</p>'+
        (pendente?'<div class="cf-confirmacao-resumo"><b>'+faltas.length+' item(ns) com pendência</b><ul>'+faltas.map(f=>'<li><span>'+esc(f.nome||'Item')+'</span>'+(f.faltam!=null?'<strong>'+esc(f.faltam)+' faltante(s)</strong>':'')+'</li>').join('')+'</ul></div>':'')+'</div><footer><button type="button" class="btn btn-secondary" data-voltar>Revisar conferência</button><button type="submit" class="btn btn-primary">'+(pendente?'Concluir com pendências':'Concluir conferência')+'</button></footer></form>';
      let aceito=false;d.querySelector('[data-voltar]').onclick=()=>d.close();d.querySelector('form').onsubmit=e=>{e.preventDefault();aceito=true;d.close();};d.addEventListener('close',()=>{d.remove();resolve(aceito);},{once:true});document.body.append(d);d.showModal();d.querySelector('[data-voltar]').focus();
    });
  }
  // Pendências do carregamento (out/2026): foto de cada item, motivo cadastrado em Parâmetros e data/hora para carregar
  // o que ficou. Vira uma etapa no cronograma e a escala escolhe o caminhão pelo volume desses itens.
  async function confirmarPendencias(faltas){
    if(document.querySelector('dialog.cf-confirmacao[open]'))return null;
    const ids=[...new Set(faltas.map(f=>String(f.item_id||'')).filter(Boolean))];
    const [{data:motivos,error:eM},{data:cad}]=await Promise.all([
      s.sb.from('logistica_motivos').select('id,nome').eq('empresa_id',s.empresa).eq('etapa','carregamento').eq('ativo',true).order('nome'),
      ids.length?s.sb.from('itens').select('id,foto_url,volume_cubico').eq('empresa_id',s.empresa).in('id',ids):Promise.resolve({data:[]})
    ]);
    if(eM){avisar(eM.message,cfg.rotulo,'erro');return null;}
    const info=new Map((cad||[]).map(c=>[String(c.id),c]));
    const m3=faltas.reduce((t,f)=>t+Number(f.faltam||1)*Number(info.get(String(f.item_id))?.volume_cubico||0),0);
    const hoje=new Date(Date.now()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,10);
    return new Promise(resolve=>{
      const d=document.createElement('dialog');d.className='cf-confirmacao cf-pendencias';
      const fotoHtml=f=>{const u=info.get(String(f.item_id))?.foto_url;return /^(https?:|data:)/i.test(u||'')?'<img src="'+esc(u)+'" alt="" loading="lazy">':'<span class="cf-qtd-sem-foto"></span>';};
      d.innerHTML='<form novalidate><header><span class="cf-confirmacao-icone" aria-hidden="true">!</span><div><small>'+esc(cfg.rotulo)+' · Pedido '+esc(s.pedido.numero_pedido||'')+'</small><h2>Concluir com pendências?</h2></div></header>'+
        '<div class="cf-confirmacao-corpo"><p>Os itens abaixo não foram carregados. Informe o motivo e quando eles serão carregados: isso entra no cronograma e o sistema escolhe o caminhão pelo volume.</p>'+
        '<ul class="cf-pend-itens">'+faltas.map(f=>'<li>'+fotoHtml(f)+'<span>'+esc(f.nome||'Item')+'</span><strong>'+esc(f.faltam??1)+' faltante(s)</strong></li>').join('')+'</ul>'+
        (m3>0?'<p class="cf-pend-volume">Volume das pendências: <b>'+m3.toLocaleString('pt-BR',{maximumFractionDigits:2})+' m³</b></p>':'')+
        '<div class="cf-pend-campos"><label class="cf-pend-motivo">Motivo<select name="motivo" required><option value="">Escolha o motivo</option>'+(motivos||[]).map(m=>'<option value="'+esc(m.id)+'">'+esc(m.nome)+'</option>').join('')+'</select></label>'+
        '<label>Data do carregamento<input type="date" name="data" required min="'+hoje+'"></label><label>Horário<input type="time" name="hora" required></label></div>'+
        (!(motivos||[]).length?'<p class="cf-pend-erro">Nenhum motivo cadastrado. Cadastre em Gestão &gt; Parâmetros (Pendência do carregamento).</p>':'')+
        '<p class="cf-pend-erro" data-erro hidden></p></div>'+
        '<footer><button type="button" class="btn btn-secondary" data-voltar>Revisar conferência</button><button type="submit" class="btn btn-primary">Concluir com pendências</button></footer></form>';
      let valor=null;const f=d.querySelector('form'),erro=d.querySelector('[data-erro]');
      d.querySelector('[data-voltar]').onclick=()=>d.close();
      f.onsubmit=e=>{e.preventDefault();
        const motivo=f.elements.motivo.value,data=f.elements.data.value,hora=f.elements.hora.value;
        const falta=!motivo?['motivo','Escolha o motivo da pendência.']:!data?['data','Informe a data do carregamento das pendências.']:data<hoje?['data','A data não pode ser no passado.']:!hora?['hora','Informe o horário do carregamento.']:null;
        if(falta){erro.hidden=false;erro.textContent=falta[1];f.elements[falta[0]].focus();return;}
        valor={motivo_id:motivo,data,hora};d.close();};
      d.addEventListener('close',()=>{d.remove();resolve(valor);},{once:true});document.body.append(d);d.showModal();f.elements.motivo.focus();
    });
  }
  function avisoPendencia(registro){
    const p=registro?.pendencia;if(!p)return '';
    const dia=String(p.data||'').split('-').reverse().join('/');
    const cams=(p.caminhoes||[]).map(c=>c.codigo||c.placa).filter(Boolean).join(', ');
    return ' Pendências no cronograma em '+dia+' às '+(p.hora||'')+(cams?' · caminhão '+cams:' · caminhão a definir no Painel Logístico')+'.';
  }
  const chavePendencias = () => ["acervo-leituras-pendentes",s.empresa,s.usuario,s.pedido?.id,etapa].join(":");
  const pendenciasRede = () => { try { return JSON.parse(localStorage.getItem(chavePendencias()) || "[]"); } catch { return []; } };
  function mostrarPendenciasRede(){
    const el = $("cfPendenciasRede"), fila = pendenciasRede();
    if(!el) return;
    el.hidden = !fila.length;
    el.innerHTML = fila.length ? '<p>' + fila.length + ' leitura(s) aguardando envio. Elas ainda não contam como conferidas.</p><button type="button" class="btn" id="cfReenviarLeituras">Tentar enviar</button>' : '';
    $("cfReenviarLeituras")?.addEventListener("click", reenviarPendencias);
  }
  function guardarLeitura(texto){
    const fila = pendenciasRede();
    if(!fila.includes(texto)) fila.push(texto);
    try { localStorage.setItem(chavePendencias(),JSON.stringify(fila)); }
    catch { throw new Error("Sem rede e sem espaço para guardar a leitura. Bipe novamente quando a conexão voltar."); }
    mostrarPendenciasRede();
  }
  async function reenviarPendencias(){
    if(s.ocupado || !s.pedido) return;
    s.ocupado = true;
    try {
      for(const texto of pendenciasRede()){
        const lido = window.EasyLocLeitor.ler(texto);
        const { data, error } = await s.sb.rpc("operacao_ler_peca", { p_pedido:s.pedido.id,p_etapa:etapa,p_tipo:lido.tipo === "PAT" ? "PAT" : "ENV",p_codigo:lido.codigo });
        if(error && !/já conferid|já foi conferid/i.test(error.message)) { ultima("erro","Envio pendente",error.message); break; }
        if(data){ const e=s.etiquetas.find(e=>e.id===data.id); if(e) Object.assign(e,data); }
        localStorage.setItem(chavePendencias(),JSON.stringify(pendenciasRede().filter(v=>v!==texto)));
      }
      pintar();mostrarPendenciasRede();
    } finally { s.ocupado=false; }
  }

  function avisar(msg, titulo = cfg.rotulo, tipo = "aviso") { window.alerta ? window.alerta(msg, titulo, tipo) : alert(msg); }
  function mostrarAviso(msg) { $("cfAviso").hidden = false; $("cfAviso").textContent = msg; }

  function ultima(tipo, texto, detalhe) {
    const el = $("cfUltima");
    el.className = "cf-ultima " + (tipo === "ok" ? "is-ok" : "is-erro");
    $("cfUltimaTexto").textContent = texto;
    $("cfUltimaDetalhe").textContent = detalhe || "";
    if (tipo !== "ok") navigator.vibrate?.([80, 60, 80]);
  }

  // Nome da peça da etiqueta: o do próprio item (num Kit, o componente), senão o da linha do pedido.
  function nomeItem(etq) {
    if (etq && s.nomes.has(String(etq.item_id))) return s.nomes.get(String(etq.item_id));
    const i = s.itens.find((x) => String(x.id) === String(etq?.separacao_item_id));
    return i?.item_nome || "Item";
  }

  function anexarCapasQuantidade(lista,caixa,editavel){
    if(!s.capas)return;
    const cab=caixa.querySelector('.cf-qtd-cabeca');
    if(cab){const th=document.createElement('span');th.className='cp-coluna';th.textContent='Material de proteção';cab.insertBefore(th,cab.lastElementChild);}
    caixa.querySelectorAll('.cf-qtd-linha:not(.cf-qtd-cabeca)').forEach((linha,i)=>{const p=lista[i];if(!p)return;const quantidade=linha.children[3];if(quantidade){const grupo=document.createElement('label');grupo.className='cp-pecas-coluna';const rotulo=document.createElement('span');rotulo.className='cp-mobile-label';rotulo.textContent='Quantidade de peças';grupo.append(rotulo);linha.replaceChild(grupo,quantidade);grupo.append(quantidade);}const div=document.createElement('div');div.innerHTML=s.capas.celula(p,editavel);linha.insertBefore(div.firstElementChild,linha.lastElementChild);});
  }
  // Nov/2026 (pedido do usuário): no QR, foto e a contagem do material de proteção na MESMA linha do item (uma lista só).
  function fotoEtqHtml(e){ const u = s.fotoEtq?.get(String(e.item_id)); return '<span class="cf-item-foto">' + (/^(https?:|data:)/i.test(u || "") ? '<img src="' + esc(u) + '" alt="" loading="lazy">' : "") + "</span>"; }
  function capaDoGrupo(e){ const r = s.capas?.rows?.find((x) => String(x.item_id) === String(e.item_id)); return r ? '<div class="cf-item-capa">' + s.capas.celula(r) + "</div>" : ""; }
  function pintarCapasBipe(){
    if(!s.capas||!s.capas.rows.length||!$('cfCorpo')||$('cfCorpo').hidden)return;
    let box=$('cfCapasBipe');if(!box){box=document.createElement('section');box.id='cfCapasBipe';box.className='cf-capas-bipe';document.querySelector('.cf-lista').append(box);}
    const naLista=new Set(s.etiquetas.map(e=>String(e.item_id)));const resto=s.capas.rows.filter(r=>!naLista.has(String(r.item_id)));
    if(!resto.length){box.remove();return;}
    box.innerHTML='<h3>Materiais de proteção de itens sem etiqueta</h3><p>Conte todas as capas deste modelo, inclusive as que estão nas sacolas.</p><div class="cp-bipe-cab"><span>Item</span><span>Qtd. lida</span><span>Material de proteção</span></div>'+resto.map(r=>{
      const n=s.etiquetas.filter(e=>String(e.item_id)===String(r.item_id)&&e[cfg.campo]).length;
      return '<div class="cp-bipe-linha"><strong>'+esc(r.nome)+'</strong><span>'+n+'</span>'+s.capas.celula(r)+'</div>';
    }).join('');
  }
  function pintarCego() {
    pintarCapasBipe();
    const lidas = s.etiquetas.filter((e) => e[cfg.campo]);
    $("cfPercent").hidden = true; $("cfBarra").parentElement.hidden = true;
    $("cfSoFaltando").parentElement.hidden = true;
    document.querySelector(".cf-lista-topo h3").textContent = "Peças lidas";
    $("cfContagem").textContent = lidas.length + " peça" + (lidas.length === 1 ? "" : "s") + " lida" + (lidas.length === 1 ? "" : "s");
    $("cfRodapeTexto").textContent = lidas.length + " peça" + (lidas.length === 1 ? "" : "s") + " conferida" + (lidas.length === 1 ? "" : "s") + " · conferência às cegas";
    $("cfRodape").classList.remove("is-completo"); $("cfRodape").classList.add("is-cega");
    const grupos = new Map();
    lidas.forEach((e) => { const k = e.separacao_item_id + "|" + e.item_id; if (!grupos.has(k)) grupos.set(k, []); grupos.get(k).push(e); });
    $("cfItens").innerHTML = [...grupos.values()].map((lista) => '<article class="cf-item"><div class="cf-item-linha">' + fotoEtqHtml(lista[0]) + '<div class="cf-item-meio"><div class="cf-item-topo"><strong>' + esc(nomeItem(lista[0])) +
      '</strong><span>' + lista.length + '</span></div><div class="cf-etiquetas">' + lista.map((e) => '<span class="cf-etq is-ok">' + esc(e.codigo) + "</span>").join("") + "</div></div>" + capaDoGrupo(lista[0]) + "</div></article>").join("")
      || '<p class="cf-vazio">Bipe cada peça que ' + voltaOuChegou() + '. O sistema compara com o que saiu quando você concluir.</p>';
  }

  function pintar() {
    pintarCapasBipe();
    if (escondido()) { pintarCego(); return; }
    $("cfPercent").hidden = false; $("cfBarra").parentElement.hidden = false; $("cfSoFaltando").parentElement.hidden = false;
    document.querySelector(".cf-lista-topo h3").textContent = "Volumes do pedido";
    $("cfRodape").classList.remove("is-cega");
    const conferir = etapa !== "carregamento" ? s.base : s.etiquetas;
    const total = conferir.length, lidas = conferir.filter((e) => e[cfg.campo]).length;
    const pct = total ? Math.round((lidas / total) * 100) : 0;
    $("cfPercent").textContent = pct + "%";
    $("cfBarra").style.width = pct + "%";
    $("cfContagem").textContent = lidas + " de " + total + " volumes";
    $("cfRodapeTexto").textContent = total - lidas ? (total - lidas) + " volume(s) faltando" : "Tudo conferido";
    $("cfRodape").classList.toggle("is-completo", total > 0 && lidas === total);
    const soFaltando = $("cfSoFaltando").checked;
    const grupos = new Map();
    conferir.forEach((e) => { const k = e.separacao_item_id + "|" + e.item_id; if (!grupos.has(k)) grupos.set(k, []); grupos.get(k).push(e); });
    $("cfItens").innerHTML = [...grupos.entries()].map(([, lista]) => {
      const ok = lista.filter((e) => e[cfg.campo]).length;
      if (soFaltando && ok === lista.length) return "";
      return '<article class="cf-item' + (ok === lista.length ? " is-ok" : "") + '"><div class="cf-item-linha">' + fotoEtqHtml(lista[0]) + '<div class="cf-item-meio"><div class="cf-item-topo"><strong>' + esc(nomeItem(lista[0])) +
        '</strong><span>' + ok + " / " + lista.length + '</span></div><div class="cf-etiquetas">' +
        lista.map((e) => '<span class="cf-etq' + (e[cfg.campo] ? " is-ok" : "") + '" title="' + esc(e.codigo) + '">' + esc(e.codigo) + "</span>").join("") + "</div></div>" + capaDoGrupo(lista[0]) + "</div></article>";
    }).join("") || '<p class="cf-vazio">Nada faltando.</p>';
  }

  async function registrar(dados) {
    const { error } = await s.sb.from("separacoes_leituras").insert({
      empresa_id: s.empresa, separacao_pedido_id: s.pedido.id, tipo_controle: etapa,
      usuario_id: s.usuario, usuario_nome: s.nome, ...dados
    });
    if (error) console.warn("Leitura não registrada no histórico:", error);
  }

  async function marcar(etq, codigoLido) {
    const lido = window.EasyLocLeitor.ler(codigoLido);
    const { data, error } = await s.sb.rpc("operacao_ler_peca", { p_pedido: s.pedido.id, p_etapa: etapa, p_tipo: lido.tipo === "PAT" ? "PAT" : "ENV", p_codigo: lido.codigo });
    if (error) {
      if(!navigator.onLine || /fetch|network|failed to fetch/i.test(error.message)){
        guardarLeitura(codigoLido);
        ultima("erro","Leitura aguardando envio","A peça só será confirmada quando o servidor receber a leitura.");
        return false;
      }
      throw error;
    }
    // O servidor pode escolher outra etiqueta do mesmo item quando dois aparelhos leem ao mesmo tempo.
    const atual = s.etiquetas.find(e => e.id === data.id) || etq;
    Object.assign(atual, data);
    ultima("ok", nomeItem(etq), "Etiqueta " + etq.codigo + (escondido() ? "" : " · " + etq.sequencia + " de " + etq.total_item));
    pintar();
    return true;
  }

  async function aoLer(texto) {
    if (s.ocupado || !s.pedido) return;
    s.ocupado = true;
    try {
      const { tipo, codigo } = window.EasyLocLeitor.ler(texto);
      if (tipo === "PAT") {
        if (s.patLidos.has(codigo)) { ultima("erro", "Este móvel já foi conferido", codigo); return; }
        if(await marcar({}, texto)) s.patLidos.add(codigo);
        return;
      }
      if (tipo === "ITEM") { ultima("erro", "Leia a etiqueta de envio ou o QR fixo do móvel", "O QR do item não identifica qual unidade é."); return; }
      const etq = s.etiquetas.find((e) => e.codigo === codigo);
      if (!etq) {
        const { data: outra } = await s.sb.from("separacoes_etiquetas").select("separacao_pedido_id").eq("empresa_id", s.empresa).eq("codigo", codigo).maybeSingle();
        ultima("erro", outra ? "Etiqueta de outro pedido" : "Etiqueta não encontrada", codigo + (outra ? " — separe este móvel" : ""));
        await registrar({ codigo_lido: codigo, status_leitura: "erro", observacao: outra ? "Etiqueta de outro pedido" : "Etiqueta não encontrada" });
        return;
      }
      if (etq[cfg.campo]) { ultima("erro", "Já conferida", etq.codigo + " · " + nomeItem(etq)); return; }
      await marcar(etq, texto);
    } catch (e) {
      console.error(e);
      ultima("erro", "Erro ao registrar a leitura", e?.message || "");
    } finally { s.ocupado = false; }
  }

  async function concluir() {
    if(pendenciasRede().length){ avisar("Envie as leituras pendentes antes de concluir."); return; }
    const conferir = etapa !== "carregamento" ? s.base : s.etiquetas;
    const faltando = conferir.filter((e) => !e[cfg.campo]);
    if (etapaVolta && faltando.length && !s.recontou) {
      s.recontou = true;
      // por bipe: um item por peça que não bateu, com quantas saíram e quantas já foram lidas
      const grupos = new Map();
      conferir.forEach((e) => {
        const k = String(e.item_id || nomeItem(e)); const g = grupos.get(k) || { p: { item_id: e.item_id, nome: nomeItem(e), esperado: 0 }, v: 0, falta: 0 };
        g.p.esperado += 1; if (e[cfg.campo]) g.v += 1; else g.falta += 1; grupos.set(k, g);
      });
      const ids = [...grupos.values()].map((g) => g.p.item_id).filter(Boolean);
      const fotos = new Map();
      if (ids.length) { const { data: cad } = await s.sb.from("itens").select("id,foto_url").eq("empresa_id", s.empresa).in("id", ids); (cad || []).forEach((c) => fotos.set(String(c.id), c.foto_url || "")); }
      const fotoBipe = (p) => /^(https?:|data:)/i.test(fotos.get(String(p.item_id)) || "") ? '<img src="' + esc(fotos.get(String(p.item_id))) + '" alt="" loading="lazy">' : '<span class="cf-qtd-sem-foto"></span>';
      await pedirSegundaContagem([...grupos.values()].filter((g) => g.falta > 0), fotoBipe, cega, (p) => esc(p.nome), true);
      $("cfEntrada")?.focus();
      return;
    }
    if (!(await escolherCaminhoes())) return;
    let pendencia = null;
    if (escondido()) {
      const ok = await confirmarConclusao([],true);
      if (!ok) return;
    } else if (faltando.length && etapa === "carregamento") {
      const grupos = new Map();
      faltando.forEach((e) => { const k = String(e.item_id || nomeItem(e)); const g = grupos.get(k) || { item_id: e.item_id, nome: nomeItem(e), faltam: 0 }; g.faltam += 1; grupos.set(k, g); });
      pendencia = await confirmarPendencias([...grupos.values()]);
      if (!pendencia) return;
    } else if (faltando.length) {
      const ok = await confirmarConclusao(faltando.map(e=>({nome:nomeItem(e),faltam:1})));
      if (!ok) return;
    }
    try{await s.capas?.salvar(true);}catch(e){avisar(e.message,'Material de proteção','aviso');return;}
    const { data: registro, error } = pendencia
      ? await s.sb.rpc("operacao_concluir_com_pendencia", { p_pedido: s.pedido.id, p_etapa: etapa, p_aceitar_faltas: true, p_pendencia: pendencia })
      : await s.sb.rpc("operacao_concluir_conferencia", { p_pedido: s.pedido.id, p_etapa: etapa, p_aceitar_faltas: faltando.length > 0 });
    if (error) { avisar(error.message, cfg.rotulo, "erro"); return; }
    const operacao = { ...(s.pedido.operacao || {}), [etapa]: registro };
    s.pedido.operacao = operacao;
    await s.capas?.carregar().catch(console.error);
    $("cfLiberarTriagem")?.remove();
    leitor?.desligar();
    if (cega) { s.revelado = true; pintar(); mostrarResultadoRetorno(registro); await carregarOcorrencias(); }
    if (etapaVolta) await carregarDivergencias();
    const divCapas=s.capas?.diferencas()||0;
    avisar(faltando.length ? "Conferência concluída com " + faltando.length + " pendência(s)." + avisoPendencia(registro) : divCapas?'Conferência concluída. Diferenças de capas registradas em '+divCapas+' modelo(s).':"Conferência concluída: tudo " + cfg.verbo + ".", cfg.rotulo, faltando.length||divCapas ? "aviso" : "sucesso");
    travarConcluida(registro);
  }

  // Conferência concluída não pode ser refeita: o pedido já passou para a etapa seguinte e o servidor recusa
  // (era o "Concluída · conferir de novo", que mostrava "Confirme a coleta…"). Trava leitura e botão.
  function travarConcluida(feito) {
    leitor?.desligar();
    ["cfConcluir", "cfBtnCamera", "cfEntrada"].forEach((id) => { if ($(id)) $(id).disabled = true; });
    if ($("cfConcluir")) $("cfConcluir").textContent = "Conferência concluída";
    if (feito?.concluido_em) mostrarAviso("Conferência concluída em " + new Date(feito.concluido_em).toLocaleString("pt-BR") + (feito.por ? " por " + feito.por : "") + " (" + feito.lidas + " de " + feito.total + "). O pedido já seguiu para a próxima etapa.");
  }

  async function carregarOcorrencias(){
    const raiz = $("cfOcorrencias");
    if(!raiz || etapa !== "retorno") return;
    const { data, error } = await s.sb.from("operacao_ocorrencias").select("*").eq("pedido_id", s.pedido.id).order("criado_em");
    if(error){ mostrarAviso("Não foi possível carregar as ocorrências. Tente novamente."); return; }
    raiz.hidden = false;
    raiz.innerHTML = '<h3>Ocorr&#234;ncias e encerramento</h3><p>As ocorr&#234;ncias s&#227;o geradas pelos registros da opera&#231;&#227;o. <a href="../../Chiavari/Ocorrencias/OcorrenciasOperacionais.html">Visualizar painel autom&#225;tico</a></p>' +
      (data || []).filter(o => !["falta", "sobra"].includes(o.tipo)).map(o => '<p>' + esc(o.tipo + ': ' + o.descricao) + (o.resolvida_em ? ' · Resolvida' : ' · Pendente <button type="button" class="btn" data-resolver="' + esc(o.id) + '">Resolver</button>') + '</p>').join('') +
      '<button type="button" class="btn primary" id="cfEncerrar">Encerrar operação</button><p id="cfEncerramentoMensagem" role="status"></p>';
    raiz.querySelectorAll("[data-resolver]").forEach(btn => btn.onclick = async () => {
      const o = data.find(o => o.id === btn.dataset.resolver);
      const destino = o.tipo === "falta" ? prompt("Digite devolvido para conferir uma peça recebida, ou perda para confirmar a baixa do estoque:", "devolvido") : "resolvido";
      if(!destino) return;
      if(!["devolvido","perda","resolvido"].includes(destino)){ avisar("Destino inválido"); return; }
      if(destino === "devolvido"){ avisar("Bipe a etiqueta da peça e conclua novamente a triagem; a falta será resolvida automaticamente."); return; }
      const motivo = prompt("Descreva o encaminhamento ou a solução:");
      if(!motivo?.trim()) return;
      if(destino === "perda" && !await window.confirmarGlobal("A perda será registrada e a peça será baixada do estoque. Confirmar?", "Confirmar perda", { confirmarTexto: "Confirmar perda", cancelarTexto: "Voltar" })) return;
      const { error } = await s.sb.rpc("operacao_resolver_ocorrencia", { p_id: o.id, p_destino: destino, p_motivo: motivo.trim() });
      if(error) avisar(error.message); else await carregarOcorrencias();
    });
    $("cfEncerrar").onclick = async () => {
      const { error } = await s.sb.rpc("operacao_encerrar", { p_pedido: s.pedido.id });
      $("cfEncerramentoMensagem").textContent = error ? error.message : "Operação encerrada. O fechamento financeiro permanece independente.";
      if(!error){ s.pedido.status_operacional="encerrado"; bloquearOperacaoEncerrada(); }
    };
    bloquearOperacaoEncerrada();
  }
  function bloquearOperacaoEncerrada(){
    if(s.pedido?.status_operacional !== "encerrado") return;
    ["cfEncerrar","cfConcluir","cfBtnCamera","cfEntrada","cfNovaOcorrencia"].forEach(id=>{if($(id)) $(id).disabled=true;});
    if($("cfEncerrar")) $("cfEncerrar").textContent="Operação encerrada";
  }

  // Depois de concluída, o sistema mostra o resultado: o que voltou e o que não voltou.
  function mostrarResultadoRetorno(feito) {
    const falta = Array.isArray(feito.faltando) ? feito.faltando : [];
    const el = $("cfAviso"); el.hidden = false;
    el.classList.toggle("is-divergente", falta.length > 0); el.classList.toggle("is-ok", !falta.length);
    el.innerHTML = "<strong>" + (falta.length ? (etapa === "retorno" ? "Não voltaram " : "Não foram descarregadas ") + falta.length + " de " + feito.total + " peças." : (etapa === "retorno" ? "Tudo voltou: " : "Tudo descarregado: ") + feito.total + " de " + feito.total + " peças.") + "</strong>" +
      " Conferido em " + esc(new Date(feito.concluido_em).toLocaleString("pt-BR")) + (feito.por ? " por " + esc(feito.por) : "") + "." +
      (falta.length ? '<ul class="cf-faltaram">' + falta.map((f) => "<li><code>" + esc(f.codigo) + "</code> " + esc(f.item) + "</li>").join("") + "</ul>" : "");
  }

  let leitor = null;

  /* Caminhões (out/2026): os programados para a entrega (escala do Painel Logístico) aparecem em destaque no topo; no fim
     do carregamento a pessoa escolhe em qual caminhão carregou (operacao_registrar_caminhoes; o servidor exige). */
  const nomeCaminhao = (c) => [c.codigo, c.placa && !/^SEM PLACA/i.test(c.placa) ? c.placa : "", c.modelo].filter(Boolean).join(" · ") || "Caminhão";
  async function mostrarCaminhoes() {
    const caixa = $("cfCaminhoes"); if (!caixa) return;
    const carregados = s.pedido.operacao?.carregamento?.caminhoes || s.pedido.operacao?.carregamento_caminhoes;
    let lista = [], rotulo = "Caminhões programados";
    if (etapa !== "carregamento" && Array.isArray(carregados) && carregados.length) { lista = carregados; rotulo = "Carregado em"; }
    else {
      const { data } = await s.sb.rpc("operacao_caminhoes_programados", { p_pedidos: [s.pedido.id] });
      lista = data || []; s.programados = lista;
    }
    caixa.hidden = false;
    caixa.replaceChildren();
    const r = document.createElement("span"); r.className = "cf-caminhoes-rotulo"; r.textContent = rotulo; caixa.append(r);
    if (!lista.length) { const v = document.createElement("span"); v.className = "cf-caminhoes-vazio"; v.textContent = "Nenhum caminhão programado no Painel Logístico"; caixa.append(v); return; }
    lista.forEach((c) => {
      const chip = document.createElement("span"); chip.className = "cf-caminhao";
      if (/^https?:\/\//i.test(c.foto_url || "")) { const img = document.createElement("img"); img.src = c.foto_url; img.alt = ""; img.onerror = () => img.remove(); chip.append(img); }
      const t = document.createElement("strong"); t.textContent = c.codigo || c.placa || "Caminhão"; chip.append(t);
      const d = [c.placa && !/^SEM PLACA/i.test(c.placa) ? c.placa : "", c.modelo].filter(Boolean).join(" · ");
      if (d) { const sm = document.createElement("small"); sm.textContent = d; chip.append(sm); }
      caixa.append(chip);
    });
  }
  function escolherCaminhoes() {
    if (etapa !== "carregamento") return Promise.resolve(true);
    return new Promise(async (resolve) => {
      const { data: frota, error } = await s.sb.rpc("operacao_frota", { p_empresa: s.empresa });
      if (error) { avisar(error.message, cfg.rotulo, "erro"); resolve(false); return; }
      const programados = new Set((s.programados || []).map((c) => String(c.caminhao_id || c.id)));
      for(const c of s.pedido.operacao?.carga_por_veiculo||[])programados.add(String(c.caminhao_id));
      const lista = (frota || []).slice().sort((a, b) => (programados.has(String(b.id)) - programados.has(String(a.id))));
      const dlg = document.createElement("dialog"); dlg.className = "cf-escolha-caminhao";
      dlg.innerHTML = '<h3>Em qual caminhão o pedido foi carregado?</h3><p class="cf-escolha-dica">Ao concluir, o carregamento fica registrado e o pedido segue para a entrega.</p><div class="cf-escolha-lista"></div><div class="cf-escolha-acoes"><button type="button" class="btn secondary" data-v>Voltar</button><button type="button" class="btn primary" data-ok>Concluir carregamento</button></div>';
      const box = dlg.querySelector(".cf-escolha-lista");
      if (!lista.length) box.innerHTML = "<p>Nenhum caminhão cadastrado em Logística > Caminhões.</p>";
      lista.forEach((c) => {
        const l = document.createElement("label"); l.className = "cf-escolha-item" + (programados.has(String(c.id)) ? " is-programado" : "");
        const cb = document.createElement("input"); cb.type = "checkbox"; cb.value = c.id; cb.checked = programados.has(String(c.id));
        const t = document.createElement("span"); t.textContent = nomeCaminhao(c);
        const foto = document.createElement('span'); foto.className = 'cf-escolha-foto';
        foto.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M3 5h11v12H3zM14 9h4l3 4v4h-7"/><circle cx="7" cy="18" r="2"/><circle cx="18" cy="18" r="2"/></svg>';
        const fotoUrl = c.foto_url || (s.programados || []).find(p => String(p.caminhao_id || p.id) === String(c.id))?.foto_url;
        if (/^https?:\/\//i.test(fotoUrl || '')) {
          const img = document.createElement('img'); img.src = fotoUrl; img.alt = 'Foto do caminhão'; img.loading = 'lazy';
          img.onerror = () => img.remove(); foto.append(img);
        }
        t.className = 'cf-escolha-nome';
        const codigo=document.createElement('strong');codigo.textContent=c.codigo||c.placa||'Caminhão';
        const placa=document.createElement('span');placa.className='cf-escolha-placa';placa.textContent=c.codigo?c.placa||'':'';
        const modelo=document.createElement('span');modelo.className='cf-escolha-modelo';modelo.textContent=c.modelo||'';
        t.replaceChildren(codigo,placa,modelo);cb.setAttribute('aria-label',nomeCaminhao(c));
        l.append(cb, foto, t);
        if (programados.has(String(c.id))) { const tag = document.createElement("small"); tag.textContent = "Programado"; l.append(tag); }
        box.append(l);
      });
      document.body.append(dlg);
      const fim = (v) => { dlg.close(); dlg.remove(); resolve(v); };
      dlg.addEventListener("cancel", (e) => { e.preventDefault(); fim(false); });
      dlg.querySelector("[data-v]").onclick = () => fim(false);
      dlg.querySelector("[data-ok]").onclick = async () => {
        const ids = [...box.querySelectorAll("input:checked")].map((i) => i.value);
        if (!ids.length) { avisar("Selecione o caminhão em que o pedido foi carregado.", cfg.rotulo, "aviso"); return; }
        const b = dlg.querySelector("[data-ok]"); b.disabled = true;
        const { data: gravado, error: e2 } = await s.sb.rpc("operacao_registrar_caminhoes", { p_pedido: s.pedido.id, p_caminhoes: ids });
        if (e2) { b.disabled = false; avisar(e2.message, cfg.rotulo, "erro"); return; }
        s.pedido.operacao = { ...(s.pedido.operacao || {}), carregamento_caminhoes: gravado };
        fim(true);
      };
      dlg.showModal();
    });
  }

  // Topo (out/2026): foto do decorador (cadastro do cliente; sem foto, a inicial), nome, local e data.
  function pintarCliente(pedido, data) {
    const el = $("cfPedidoMeta"); if (!el) return;
    const nome = pedido.cliente_nome || "Cliente não informado";
    const inicial = nome.trim().charAt(0).toUpperCase() || "?";
    const foto = document.createElement("span"); foto.className = "cf-cliente-foto"; foto.textContent = inicial;
    const n = document.createElement("strong"); n.className = "cf-cliente-nome"; n.textContent = nome;
    const resto = document.createElement("span"); resto.className = "cf-cliente-local";
    resto.textContent = [pedido.local_nome, data].filter(Boolean).join(" · ");
    el.replaceChildren(foto, n, ...(resto.textContent ? [resto] : []));
    let q = s.sb.from("clientes_empresas").select("catalogo_logo_url").eq("empresa_id", s.empresa);
    q = pedido.cliente_id ? q.eq("id", pedido.cliente_id) : q.eq("nome_razao", nome);
    Promise.resolve(q.limit(1)).then(({ data: linhas }) => {
      const url = linhas?.[0]?.catalogo_logo_url || "";
      if (!/^https?:\/\//i.test(url) || !foto.isConnected) return;
      const img = document.createElement("img"); img.src = url; img.alt = "";
      img.onerror = () => { img.remove(); foto.textContent = inicial; };
      foto.textContent = ""; foto.appendChild(img);
    }).catch(() => {});
  }

  async function iniciar() {
    $("cfTitulo").textContent = cfg.titulo;
    const origem = { expedicao: ["Modulos/Logistica/Expedicao/expedicao.html", "../Expedicao/expedicao.html"], separacao: ["Modulos/Estoque/SeparacaoMateriais/separacao-materiais.html", "../../Estoque/SeparacaoMateriais/separacao-materiais.html"] }[params.get("de")];
    if (origem) {
      const voltar = $("cfVoltar"); voltar.hidden = false;
      voltar.addEventListener("click", () => {
        try { if (window.top !== window && typeof window.top.shellNavigate === "function") { window.top.shellNavigate(origem[0]); return; } } catch (_) {}
        location.href = origem[1];
      });
    }
    $("cfEtapaRotulo").textContent = cfg.rotulo;
    const ctx = await window.aguardarContexto?.();
    s.sb = window.supabaseClient;
    s.empresa = ctx?.empresa_id || window.__CONTEXT?.empresa_id;
    s.usuario = ctx?.usuario_id || window.__CONTEXT?.usuario_id || null;
    s.nome = ctx?.usuario_nome || window.__CONTEXT?.usuario_nome || "";
    const pedidoId = params.get("pedido");
    if (!s.empresa || !pedidoId) { mostrarAviso("Abra a conferência pelo cronograma, na etapa do pedido."); return; }
    const [{ data: pedido }, { data: itens }, { data: etiquetas, error }] = await Promise.all([
      s.sb.from("separacoes_pedidos").select("id,numero_pedido,cliente_nome,local_nome,data_entrega,data_coleta,data_evento,status,status_operacional,operacao,modo_separacao,cliente_id,pedido_origem_id").eq("empresa_id", s.empresa).eq("id", pedidoId).maybeSingle(),
      s.sb.from("separacoes_itens").select("id,item_id,item_nome").eq("empresa_id", s.empresa).eq("separacao_pedido_id", pedidoId),
      s.sb.from("separacoes_etiquetas").select("*").eq("empresa_id", s.empresa).eq("separacao_pedido_id", pedidoId).order("codigo")
    ]);
    if (error) { console.error(error); mostrarAviso("Não foi possível carregar as etiquetas do pedido."); return; }
    if (!pedido) { mostrarAviso("Pedido não encontrado."); return; }
    // Pedido extra (out/2026): da coleta em diante a volta é conferida junto com o pedido principal.
    if (etapa !== "carregamento" && pedido.pedido_origem_id) {
      mostrarAviso("A volta do pedido extra " + (pedido.numero_pedido || "") + " é conferida junto com o pedido " + String(pedido.numero_pedido || "").split("/")[0] + ". Abra o pedido principal.");
      return;
    }
    s.extras = [];
    if (etapa !== "carregamento") {
      const { data: extras } = await s.sb.from("separacoes_pedidos").select("id,numero_pedido,operacao,status,status_comercial,pedido_origem_id").eq("empresa_id", s.empresa).eq("pedido_origem_id", pedidoId);
      s.extras = (extras || []).filter((x) => String(x.pedido_origem_id) === String(pedidoId) && x.id !== pedidoId && x.status !== "cancelado" && x.status_comercial !== "cancelado");
      if (s.extras.length) {
        const { data: etqExtras } = await s.sb.from("separacoes_etiquetas").select("separacao_item_id,item_id,lida_carregamento_em").eq("empresa_id", s.empresa).in("separacao_pedido_id", s.extras.map((x) => x.id));
        s.etiquetasExtras = etqExtras || [];
      }
    }
    s.grupo = s.extras.length > 0;
    if (etapa === "descarregamento") {
      const { data: regra } = await s.sb.from("empresa_logistica_regras").select("descarregamento_conferencia").eq("empresa_id", s.empresa).maybeSingle();
      cega = regra?.descarregamento_conferencia === "cegas";
    }
    const {data:assumido,error:erroInicio}=await s.sb.rpc('operacao_iniciar_conferencia',{p_pedido:pedidoId,p_etapa:etapa});
    if(erroInicio){mostrarAviso(erroInicio.message);return;}
    s.pedido = assumido?.id?assumido:pedido; s.itens = itens || []; s.etiquetas = etiquetas || [];
    // Nov/2026: foto do item em cada linha da conferência por QR.
    s.fotoEtq = new Map();
    try { const idsF = [...new Set(s.etiquetas.map((e) => e.item_id).filter(Boolean))]; for (let i = 0; i < idsF.length; i += 200) { const { data: fs } = await s.sb.from("itens").select("id,foto_url").in("id", idsF.slice(i, i + 200)); (fs || []).forEach((c) => s.fotoEtq.set(String(c.id), c.foto_url || "")); } } catch (e) { console.warn(e); }
    if(window.CapasOperacao){s.capas=window.CapasOperacao.criar({sb:s.sb,pedido:pedido.id,etapa,cega});try{await s.capas.pronto;}catch(e){mostrarAviso('Não foi possível carregar as materiais de proteção: '+e.message);return;}}
    if(etapa==='carregamento'&&!s.pedido.operacao?.carregamento?.concluido_em){
      const liberar=document.createElement('button');liberar.id='cfLiberarTriagem';liberar.type='button';liberar.className='btn secondary cf-liberar';liberar.textContent='Devolver para a Triagem';liberar.title='O pedido volta para a separação (Triagem) para ser revisado';$('cfImprimir').before(liberar);
      liberar.onclick=async()=>{const certo=typeof window.confirmarGlobal==='function'?await window.confirmarGlobal('O pedido volta para a separação (Triagem) e sai da Expedição. Tem certeza?','Devolver para a Triagem',{confirmarTexto:'Devolver',cancelarTexto:'Voltar',tipo:'warning'}):confirm('O pedido volta para a Triagem. Tem certeza?');if(!certo)return;const motivo='Liberado pela Expedição para a Triagem';liberar.disabled=true;try{const {error}=await s.sb.rpc('operacao_transferir_pedido',{p_pedido:pedidoId,p_acao:'devolver_triagem',p_motivo:motivo});if(error)throw error;leitor?.desligar();if(typeof window.top.shellNavigate==='function')window.top.shellNavigate('Modulos/Logistica/Expedicao/expedicao.html');else location.href='../Expedicao/expedicao.html';}catch(e){avisar(e.message,'Devolver para a Triagem','aviso');liberar.disabled=false;}};
    }
    // Triagem da volta: registrar item danificado (nov/2026), em conferencia-avarias.js

    // O que deve voltar = o que saiu no carregamento (se ele foi conferido); senão, todas as etiquetas.
    const carregadas = s.etiquetas.filter((e) => e.lida_carregamento_em);
    s.base = carregadas.length ? carregadas : s.etiquetas;
    const idsItens = [...new Set(s.etiquetas.map((e) => e.item_id).filter(Boolean))];
    if (idsItens.length) {
      const { data: cad } = await s.sb.from("itens").select("id,produto,descricao_total").eq("empresa_id", s.empresa).in("id", idsItens);
      (cad || []).forEach((c) => s.nomes.set(String(c.id), c.descricao_total || c.produto || "Item"));
    }
    $("cfPedido").hidden = false;
    $("cfPedidoNumero").textContent = "Pedido " + (pedido.numero_pedido || "-") + (s.grupo ? " + " + s.extras.map((x) => x.numero_pedido).join(", ") : "");
    const data = (etapaVolta ? pedido.data_coleta : pedido.data_entrega) || pedido.data_evento; // Nov/2026: na volta, a data da coleta
    pintarCliente(pedido, data ? new Date(data + "T12:00:00").toLocaleDateString("pt-BR") : "");
    mostrarCaminhoes().catch((e) => console.error(e));
    // Sem etiquetas de envio, ou separado no modo manual / 1 clique (out/2026): não há bipe, a conferência é por quantidade.
    // Pedido com extras: a volta soma tudo e é sempre por quantidade (cada linha diz de qual pedido veio).
    if (etapa === "retorno" || s.grupo || !s.etiquetas.length || ["manual", "um-clique"].includes(s.pedido.modo_separacao || pedido.modo_separacao)) {
      await mostrarSemEtiquetas();
      if (etapa === "retorno" && s.pedido.operacao?.retorno?.concluido_em) await carregarOcorrencias();
      if (etapaVolta && s.pedido.operacao?.[etapa]?.concluido_em) await carregarDivergencias();
      return;
    }
    const feito = pedido.operacao?.[etapa];
    if (feito?.concluido_em && cega) {
      s.revelado = true;
      mostrarResultadoRetorno(feito);
    }
    if (escondido()) $("cfUltimaDetalhe").textContent = "Conferência às cegas: bipe cada peça que " + voltaOuChegou() + ". Ao concluir, o sistema mostra o que faltou.";
    $("cfCorpo").hidden = false; $("cfRodape").hidden = false;
    leitor = window.EasyLocLeitor.criar({
      video: $("cfVideo"), aoLer,
      aoMudar: (ligada) => { $("cfCamera").hidden = !ligada; $("cfBtnCamera").textContent = ligada ? "Desligar câmera" : "Ler com a câmera"; }
    });
    $("cfBtnCamera").addEventListener("click", () => (leitor.ligada ? leitor.desligar() : leitor.ligar().catch((e) => avisar(e.message, "Câmera"))));
    window.EasyLocLeitor.teclado($("cfEntrada"), aoLer);
    $("cfSoFaltando").addEventListener("change", pintar);
    $("cfConcluir").addEventListener("click", () => concluir().catch(console.error));
    pintar();
    if (feito?.concluido_em) { travarConcluida(feito); if (cega) $("cfAviso").hidden = true; }
    if(etapa === "retorno" && feito?.concluido_em) await carregarOcorrencias();
    if(etapaVolta && feito?.concluido_em) await carregarDivergencias();
    mostrarPendenciasRede();
    window.addEventListener("online",reenviarPendencias);
    $("cfEntrada").focus();
  }

  /* "Imprimir lista" fica na linha do título, à direita (como o "← Voltar" à esquerda). */
  function mostrarBotaoImprimir(acao) {
    const botao = $("cfImprimir");
    botao.hidden = false;
    botao.onclick = acao;
  }

  /* Lista impressa da conferência por quantidade (A4): item, quantidade esperada (nunca na volta às cegas, antes de
     concluir) e caixas em branco para anotar o que foi carregado/descarregado/voltou; assinaturas no fim. */
  function imprimirLista(lista, foto, feitos) {
    const verbo = { carregamento: "Carregado", descarregamento: "Descarregado", retorno: "Voltou" }[etapa];
    const mostrarEsperado = !cega || !!feitos;
    const data = (etapaVolta ? s.pedido.data_coleta : s.pedido.data_entrega) || s.pedido.data_evento;
    const linhas = lista.map((p, i) => {
      const r = feitos?.get(p.chave);
      return "<tr><td class='n'>" + (i + 1) + "</td><td class='f'>" + foto(p) + "</td><td>" + esc(p.nome) + (p.kit_nome ? "<br><small>Parte do kit: " + esc(String(p.kit_nome).replace(/s+/g, " ").trim()) + (Number(p.por_kit) ? " (" + esc(p.por_kit) + " por kit)" : "") + "</small>" : "") + "</td>" +
        (mostrarEsperado ? "<td class='q'>" + esc(r ? r.esperado : p.esperado) + "</td>" : "") +
        "<td class='q'>" + (r ? esc(r.conferido) : "<span class='caixa'></span>") + "</td><td class='q cp-print'>"+(s.capas?.linha(p)?.usa_capa?(feitos?esc(s.capas.linha(p).quantidade??'Sem registro'):"<span class='caixa'></span>"):'—')+"</td><td class='ok'><span class='caixa pq'></span></td><td class='obs-c'>" + esc(r?.obs || "") + "</td></tr>";
    }).join("");
    const html = "<!doctype html><html><head><meta charset='utf-8'><title>Lista - Pedido " + esc(s.pedido.numero_pedido || "") + "</title><style>" +
      "@page{size:A4;margin:12mm}body{font:12px Inter,Arial,sans-serif;color:#1f2020;margin:0}h1{font:600 20px Georgia,serif;margin:0 0 4px;letter-spacing:.04em}" +
      ".meta{color:#4f4f4f;margin:0 0 14px}table{width:100%;border-collapse:collapse}th{font-size:10px;letter-spacing:.08em;text-transform:uppercase;text-align:left;color:#6b6b6b;border-bottom:1.5px solid #1f2020;padding:6px 6px}" +
      "td{border-bottom:1px solid #d9dde3;padding:6px;vertical-align:middle}tr{break-inside:avoid}td.n{width:22px;color:#6b6b6b}td.f{width:46px}td.f img,td.f span{width:40px;height:40px;object-fit:cover;border-radius:6px;display:block;background:#f1f3f5}" +
      "td.q,th.q{width:80px;text-align:center;font-size:14px;font-weight:600}td.ok,th.ok{width:40px;text-align:center}td.obs-c{width:30%;border-bottom:1px solid #9aa3ad}.caixa{display:inline-block;width:56px;height:26px;border:1.5px solid #1f2020;border-radius:4px}.caixa.pq{width:20px;height:20px}" +
      ".obs{margin-top:18px;border:1px solid #d9dde3;border-radius:6px;height:60px;padding:6px;color:#6b6b6b}.ass{display:flex;gap:24px;margin-top:34px}.ass div{flex:1;border-top:1px solid #1f2020;padding-top:4px;color:#4f4f4f;font-size:11px}" +
      "</style></head><body><h1>Lista de " + esc(cfg.rotulo.toLowerCase()) + " · Pedido " + esc(s.pedido.numero_pedido || "-") + "</h1><p class='meta'>" +
      esc([s.pedido.cliente_nome, s.pedido.local_nome, data ? new Date(data + "T12:00:00").toLocaleDateString("pt-BR") : ""].filter(Boolean).join(" · ")) + "</p>" +
      "<table><thead><tr><th></th><th></th><th>Item</th>" + (mostrarEsperado ? "<th class='q'>" + (etapa === "carregamento" ? "Pedido" : "Esperado") + "</th>" : "") +
      "<th class='q'>" + verbo + "</th><th class='q'>Capas</th><th class='ok'>OK</th><th>Observação</th></tr></thead><tbody>" + linhas + "</tbody></table>" +
      "<div class='obs'>Observações</div><div class='ass'><div>Conferido por</div><div>Motorista / responsável</div><div>Data e hora</div></div></body></html>";
    const quadro = document.createElement("iframe");
    quadro.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";
    document.body.appendChild(quadro);
    const doc = quadro.contentDocument; doc.open(); doc.write(html); doc.close();
    window.__ultimaListaImpressa = html; // para os testes
    setTimeout(() => { quadro.contentWindow.focus(); quadro.contentWindow.print(); setTimeout(() => quadro.remove(), 60000); }, 400);
  }

  /* Pedido separado sem etiquetas de envio ("1 clique"): sem bipe, conferência por QUANTIDADE. A lista de peças
     (Kit aberto nos componentes) vem de operacao_conferencia_pecas; a pessoa digita quanto foi carregado/descarregado/voltou.
     Esperado: carregamento = pedido; descarregamento e volta = o que o carregamento conferiu. A volta é às cegas. */
  async function mostrarSemEtiquetas() {
    const verbo = { carregamento: "Carregado", descarregamento: "Descarregado", retorno: "Voltou" }[etapa];
    const { data: pecas, error } = await s.sb.rpc("operacao_conferencia_pecas", { p_pedido: s.pedido.id, p_grupo: !!s.grupo });
    if (error) { console.error(error); mostrarAviso("Não foi possível carregar os itens do pedido."); return; }
    if (!(pecas || []).length) { mostrarAviso("Este pedido não tem itens para conferir."); return; }
    const base = etapa !== "carregamento" ? s.pedido.operacao?.carregamento?.itens : null;
    // com extras: base = carregamento de todos; sem lista do carregamento, as etiquetas lidas; senão o pedido (igual ao banco)
    const baseGrupo = s.grupo ? [s.pedido, ...s.extras].flatMap((g) => Array.isArray(g.operacao?.carregamento?.itens) ? g.operacao.carregamento.itens : []) : null;
    const etqGrupo = s.grupo ? [...(s.etiquetas || []), ...(s.etiquetasExtras || [])] : [];
    const esperadoGrupo = (p) => {
      const anterior = baseGrupo.find((x) => x.chave === p.chave);
      if (anterior) return anterior.conferido;
      const etq = etqGrupo.filter((t) => String(t.separacao_item_id) + "|" + String(t.item_id) === p.chave);
      return etq.length ? etq.filter((t) => t.lida_carregamento_em).length : p.esperado;
    };
    const lista = pecas.map((p) => {
      if (s.grupo) return { ...p, esperado: Number(esperadoGrupo(p)) || 0 };
      if(etapa==='retorno'&&!base){const etiquetas=s.etiquetas.filter(t=>String(t.separacao_item_id)+'|'+String(t.item_id)===p.chave);if(etiquetas.length)return {...p,esperado:etiquetas.filter(t=>t.lida_carregamento_em).length};}
      const anterior = Array.isArray(base) ? base.find((x) => x.chave === p.chave) : null;
      return { ...p, esperado: Number(anterior ? anterior.conferido : base ? 0 : p.esperado) || 0 };
    }).sort((a, b) => String(a.nome).localeCompare(String(b.nome), "pt-BR"));
    const fotos = new Map();
    const ids = [...new Set(lista.map((p) => p.item_id).filter(Boolean))];
    if (ids.length) {
      const { data: cad } = await s.sb.from("itens").select("id,foto_url").eq("empresa_id", s.empresa).in("id", ids);
      (cad || []).forEach((c) => fotos.set(String(c.id), c.foto_url || ""));
    }
    const caixa = $("cfQtd");
    // Componente de Kit: embaixo do nome, o Kit de que ele faz parte (igual à Triagem).
    const nomeComKit = (p) => esc(p.nome) + (s.grupo && p.pedido_numero ? '<small class="cf-qtd-kit cf-qtd-pedido">Pedido ' + esc(p.pedido_numero) + "</small>" : "") + (p.kit_nome ? '<small class="cf-qtd-kit">Parte do kit: ' + esc(String(p.kit_nome).replace(/\s+/g, " ").trim()) + (Number(p.por_kit) ? " (" + esc(p.por_kit) + " por kit)" : "") + "</small>" : "");
    const foto = (p) => fotos.get(String(p.item_id)) ? '<img src="' + esc(fotos.get(String(p.item_id))) + '" alt="" loading="lazy">' : '<span class="cf-qtd-sem-foto"></span>';
    const atualizarProgresso = (total, conferido) => {
      const pct = total ? Math.min(100, Math.round((conferido / total) * 100)) : 0;
      $("cfPercent").textContent = pct + "%"; $("cfBarra").style.width = pct + "%";
      // Nov/2026: 100% preenchido não é concluído; até concluir, a contagem avisa que falta confirmar.
      const concluida = !!s.pedido?.operacao?.[etapa]?.concluido_em;
      $("cfContagem").textContent = conferido + " de " + total + " peças" + (!concluida && total && conferido >= total ? " · falta concluir" : "");
    };
    const totalEsperado = lista.reduce((t, p) => t + p.esperado, 0);

    const feito = s.pedido.operacao?.[etapa];
    if (feito?.concluido_em) {
      const itens = Array.isArray(feito.itens) ? feito.itens : [];
      const porChave = new Map(itens.map((x) => [x.chave, x]));
      const contagem1 = feito.primeira_contagem || {};
      let dv = null;
      if (etapaVolta) { try { dv = await buscarDivergencias(); } catch (e) { console.error(e); } }
      s.divAtuais = dv?.todas || []; s.divMotivos = dv?.motivos || s.divMotivos;
      const divPorChave = new Map((dv?.todas || []).map((o) => [chaveDiv(o), o]));
      // A divergência não se resolve mais aqui (out/2026): vai para Estoque > Gestão do acervo (contagem geral do item).
      const comResolver = false;
      s.divNaTabela = new Set();
      const primeira = (r) => (r.chave in contagem1 && Number(contagem1[r.chave]) !== Number(r.conferido)) ? contagem1[r.chave] : "";
      // Divergência dos dois lados (out/2026): faltou (vermelho) e veio a mais (amarelo).
      // Sem a faixa "conferido em… · Divergência: …" (pedido do usuário): as cores e as colunas da tabela já dizem isso.
      $("cfPedidoNota").hidden = true;
      $("cfAviso").hidden = true;
      atualizarProgresso(Number(feito.total) || 0, Number(feito.lidas) || 0);
      caixa.hidden = false;
      caixa.innerHTML = '<div class="cf-qtd-tabela' + (comResolver ? " com-resolver" : "") + '">' +
        '<div class="cf-qtd-linha cf-qtd-cabeca"><span></span><span>Item</span><span>' + (etapa === "carregamento" ? "Pedido" : "Esperado") + '</span><span>' + verbo + '</span><span>Observação</span>' + (comResolver ? "<span>2ª conferência</span><span>Motivo</span>" : "") + "</div>" +
        lista.map((p) => {
          const r = porChave.get(p.chave) || {};
          const falta = Number(r.conferido) < Number(r.esperado), sobra = Number(r.conferido) > Number(r.esperado);
          return '<div class="cf-qtd-linha' + (falta ? " is-div-falta" : sobra ? " is-div-sobra" : r.conferido != null && Number(r.conferido) === Number(r.esperado ?? p.esperado) ? " is-ok" : "") + '">' + foto(p) + '<strong>' + nomeComKit(p) + '</strong><span>' + esc(r.esperado ?? p.esperado) +
            '</span><span class="cf-qtd-valor">' + esc(r.conferido ?? "-") + (primeira(r) ? '<small class="cf-qtd-primeira">1ª contagem: ' + esc(primeira(r)) + "</small>" : "") + (falta ? ' <small>faltam ' + esc(Number(r.esperado) - Number(r.conferido)) + "</small>" : sobra ? ' <small>' + esc(Number(r.conferido) - Number(r.esperado)) + " a mais</small>" : "") + '</span><em class="cf-qtd-obs-texto">' + esc(r.obs || "—") + "</em>" + (comResolver ? (() => { const o = divPorChave.get(p.chave); if (o) s.divNaTabela.add(String(o.id)); return celulaResolver(o, dv.motivos); })() : "") + "</div>";
        }).join("") + "</div>" + (comResolver ? RODAPE_SEGUNDA : "");
      anexarCapasQuantidade(lista,caixa,false);
      if(etapa==='retorno')await window.RetornoColunas.montar({caixa,lista,sb:s.sb,empresa:s.empresa,pedido:s.pedido,feito});
      atualizarRodapeSegunda();
      mostrarBotaoImprimir(() => imprimirLista(lista, foto, porChave));
      return;
    }

    $("cfAviso").hidden = true;
    $("cfPedidoNota").hidden = true;
    $("cfPedidoNota").textContent = cega
      ? "Pedido separado sem etiquetas de envio: conte as peças de cada item que " + (etapa === "retorno" ? "voltaram" : "foram descarregadas") + " e digite a quantidade. Ao concluir, o sistema compara com o que saiu."
      : "Pedido separado sem etiquetas de envio (1 clique): sem bipagem. Digite a quantidade de cada item que foi " + verbo.toLowerCase() + ".";
    atualizarProgresso(cega ? 0 : totalEsperado, 0);
    if (cega) { $("cfPercent").hidden = true; $("cfBarra").parentElement.hidden = true; $("cfContagem").textContent = "Conferência às cegas"; }
    caixa.hidden = false;
    caixa.innerHTML = '<div class="cf-qtd-tabela"><div class="cf-qtd-linha cf-qtd-cabeca"><span></span><span>Item</span><span>' + (cega ? "" : etapa === "carregamento" ? "Pedido" : "Esperado") + '</span><span>' + verbo + '</span><span>Observação</span></div>' +
      lista.map((p, i) => '<div class="cf-qtd-linha">' + foto(p) + '<strong>' + nomeComKit(p) + '</strong><span>' + (cega ? "" : esc(p.esperado)) + '</span>' +
        '<input type="number" class="el-input cf-qtd-input" min="0" step="1" inputmode="numeric" data-chave="' + esc(p.chave) + '" data-i="' + i + '" aria-label="' + esc(verbo + ": " + p.nome) + '">' +
        '<input type="text" class="el-input cf-qtd-obs" maxlength="500" placeholder="Opcional" data-chave="' + esc(p.chave) + '" aria-label="' + esc("Observação: " + p.nome) + '"></div>').join("") +
      '</div><footer class="cf-qtd-rodape"><span id="cfQtdResumo"></span><button type="button" class="btn primary" id="cfQtdConfirmar">Confirmar ' + esc(cfg.rotulo.toLowerCase()) + "</button></footer>";

    anexarCapasQuantidade(lista,caixa,true);
    if(etapa==='retorno')await window.RetornoColunas.montar({caixa,lista,sb:s.sb,empresa:s.empresa,pedido:s.pedido});
    const inputs = [...caixa.querySelectorAll(".cf-qtd-input")];
    const somar = () => {
      let conferido = 0, preenchidos = 0;
      inputs.forEach((inp) => {
        const p = lista[Number(inp.dataset.i)], v = inp.value === "" ? null : Number(inp.value);
        if (v != null) { preenchidos += 1; conferido += Math.min(v, p.esperado); }
        inp.closest(".cf-qtd-linha").classList.toggle("is-falta", !cega && v != null && v < p.esperado);
        // Verde só com a quantidade exata; a mais também é conferência errada (amarelo, out/2026).
        inp.closest(".cf-qtd-linha").classList.toggle("is-a-mais", !cega && v != null && v > p.esperado);
        inp.closest(".cf-qtd-linha").classList.toggle("is-ok", !cega && v != null && v === p.esperado);
      });
      if (!cega) atualizarProgresso(totalEsperado, conferido);
      $("cfQtdResumo").textContent = preenchidos + " de " + inputs.length + " itens preenchidos";
    };
    inputs.forEach((inp, i) => {
      inp.addEventListener("input", somar);
      inp.addEventListener("keydown", (ev) => { if (ev.key === "Enter") { ev.preventDefault(); (inputs[i + 1] || $("cfQtdConfirmar")).focus(); } });
    });
    mostrarBotaoImprimir(() => imprimirLista(lista, foto, null));
    $("cfQtdConfirmar").addEventListener("click", async (ev) => {
      const botao=ev.currentTarget;
      const vazio = inputs.find((inp) => inp.value === "" || Number(inp.value) < 0 || !Number.isInteger(Number(inp.value)));
      if (vazio) { avisar("Informe a quantidade de todos os itens (número inteiro; 0 se nada " + (etapa === "retorno" ? "voltou" : "foi " + verbo.toLowerCase()) + ").", cfg.rotulo); vazio.focus(); return; }
      const quantidades = {};
      inputs.forEach((inp) => { quantidades[inp.dataset.chave] = Number(inp.value); });
      if (etapaVolta && !s.primeira) {
        const diferentes = inputs.filter((inp) => Number(inp.value) !== lista[Number(inp.dataset.i)].esperado);
        if (diferentes.length) {
          s.primeira = { ...quantidades };
          if(etapa==='retorno')window.RetornoColunas.segunda(quantidades);
          const recontar = diferentes.map((inp) => ({ p: lista[Number(inp.dataset.i)], v: Number(inp.value) }));
          inputs.forEach((inp) => {
            const linha = inp.closest(".cf-qtd-linha"), recontar = diferentes.includes(inp);
            linha.classList.toggle("is-recontar", recontar);
            linha.classList.toggle("is-travada", !recontar);
            if (recontar) { inp.value = ""; inp.placeholder = "Recontar"; } else inp.readOnly = true;
          });
          botao.textContent = "Confirmar segunda contagem";
          somar();
          await pedirSegundaContagem(recontar, foto, cega, nomeComKit);
          diferentes[0].focus();
          return;
        }
      }
      const observacoes = {};
      caixa.querySelectorAll(".cf-qtd-obs").forEach((inp) => { if (inp.value.trim()) observacoes[inp.dataset.chave] = inp.value.trim(); });
      const faltas = cega ? [] : inputs.filter((inp) => Number(inp.value) < lista[Number(inp.dataset.i)].esperado);
      if (!(await escolherCaminhoes())) return;
      const itensFalta = faltas.map(inp=>{const p=lista[Number(inp.dataset.i)];return {item_id:p.item_id,nome:p.nome,faltam:p.esperado-Number(inp.value)};});
      let pendencia = null;
      if (etapa === "carregamento" && itensFalta.length) {
        pendencia = await confirmarPendencias(itensFalta);
        if (!pendencia) return;
      } else if (itensFalta.length || cega) {
        const ok = await confirmarConclusao(itensFalta,cega);
        if (!ok) return;
      } else if (etapa !== "carregamento") {
        // Nov/2026: no carregamento a escolha do caminhão já é a confirmação final (eram três perguntas seguidas)
        const ok = await confirmarConclusao([],false);
        if (!ok) return;
      }
      try{await s.capas?.salvar(true);}catch(e){avisar(e.message,'Material de proteção','aviso');return;}
      botao.disabled = true;
      // A volta é às cegas: aceita a diferença (as faltas viram ocorrência no servidor).
      const args = { p_pedido: s.pedido.id, p_etapa: etapa, p_aceitar_faltas: cega || faltas.length > 0, p_quantidades: quantidades, p_observacoes: observacoes, ...(s.primeira ? { p_primeira: s.primeira } : {}) };
      let avarias={};
      if(etapa==='retorno'){try{avarias=await window.RetornoColunas.payload(caixa,quantidades);}catch(e){botao.disabled=false;avisar(e.message,cfg.rotulo,'aviso');return;}}
      const { data: registro, error: erro } = pendencia
        ? await s.sb.rpc("operacao_concluir_com_pendencia", { ...args, p_pendencia: pendencia })
        : await s.sb.rpc(etapa==='retorno'?"operacao_concluir_retorno_avarias":"operacao_concluir_conferencia", {...args,...avarias});
      if (erro) { botao.disabled = false; avisar(erro.message, cfg.rotulo, "erro"); return; }
      s.pedido.operacao = { ...(s.pedido.operacao || {}), [etapa]: registro };
      await s.capas?.carregar().catch(console.error);
      $("cfLiberarTriagem")?.remove();
      $("cfPercent").hidden = false; $("cfBarra").parentElement.hidden = false;
      $("cfContagem").textContent = $("cfContagem").textContent.replace(" · falta concluir", "");
      await mostrarSemEtiquetas();
      if (cega) await carregarOcorrencias();
      if (etapaVolta) await carregarDivergencias();
      const n = (registro.faltando || []).length;
      const mais = (registro.itens || []).filter((x) => Number(x.conferido) > Number(x.esperado)).length;
      const divCapas=s.capas?.diferencas()||0;
      const div = [n ? n + " item(ns) faltando" : "", mais ? mais + " item(ns) a mais" : "",divCapas?divCapas+' modelo(s) com diferença de capas':''].filter(Boolean).join(" e ");
      avisar(div ? "Conferência concluída com divergência: " + div + "." + avisoPendencia(registro) : "Conferência concluída: tudo " + cfg.verbo + ".", cfg.rotulo, div ? "aviso" : "sucesso");
    });
    somar();
    inputs[0]?.focus();
  }

  // Segunda contagem (out/2026): lista os itens que não bateram, com foto, nome (e o kit) e o que foi contado na 1ª vez.
  // Às cegas não mostra quanto saiu; sem ser às cegas, mostra quanto saiu e se faltou ou veio a mais.
  function pedirSegundaContagem(itens, foto, cega, nomeComKit, bipe) {
    return new Promise((resolve) => {
      const d = document.createElement("dialog"); d.className = "cf-confirmacao cf-segunda";
      const n = itens.length;
      const linhas = itens.map(({ p, v }) => {
        const dif = v - Number(p.esperado || 0);
        const lado = cega ? "" : '<span class="cf-seg-dif ' + (dif < 0 ? "is-falta" : "is-mais") + '">Saiu ' + esc(p.esperado) + " · " + (dif < 0 ? "faltam " + esc(-dif) : esc(dif) + " a mais") + "</span>";
        return '<li><span class="cf-seg-foto">' + foto(p) + '</span><span class="cf-seg-nome">' + nomeComKit(p) + '</span><span class="cf-seg-qtd"><small>' + (bipe ? 'Lidas' : '1ª contagem') + '</small><b>' + esc(v) + "</b>" + lado + "</span></li>";
      }).join("");
      d.innerHTML = '<form><header><span class="cf-seg-badge" aria-hidden="true">' + n + '</span><div><small>' + esc(cfg.rotulo) + " · Pedido " + esc(s.pedido.numero_pedido || "") +
        '</small><h2>Segunda contagem</h2><p class="cf-seg-sub">' + (n === 1 ? "1 item não bateu" : n + " itens não bateram") + " com o que saiu. Conte de novo só estes:</p></div></header>" +
        '<div class="cf-confirmacao-corpo"><ul class="cf-seg-lista">' + linhas + "</ul>" +
        (bipe ? '<ol class="cf-seg-passos"><li><span>Procure de novo as peças destes itens</span></li><li><span>Bipe a etiqueta de cada peça que encontrar</span></li><li><span>Clique em <b>Concluir</b> de novo</span></li></ol></div>' : '<ol class="cf-seg-passos"><li><span>Conte de novo cada item da lista</span></li><li><span>Digite a nova quantidade na linha destacada em azul</span></li><li><span>Clique em <b>Confirmar segunda contagem</b></span></li></ol></div>') +
        '<footer><button type="submit" class="btn btn-primary">Começar a segunda contagem</button></footer></form>';
      d.querySelector("form").onsubmit = (e) => { e.preventDefault(); d.close(); };
      d.addEventListener("close", () => { d.remove(); resolve(); }, { once: true });
      document.body.append(d); d.showModal();
    });
  }

  /* Divergências da volta (out/2026): o que faltou (vermelho) e o que veio a mais (amarelo) ficam abertos até alguém
     resolver, na coluna "Resolver" do resultado, com um motivo cadastrado em Parâmetros > Operação (Divergência: faltou /
     veio a mais). Falta: "Apareceu" (quantas) ou "Perda" (baixa no estoque). A mais: "Conferido". */
  const chaveDiv = (o) => String(o.codigo || "").replace(/^descarregamento:/, "");
  const textoDiv = (o) => String(o.descricao || "").replace(/^(Peça não devolvida|Peça não descarregada|Veio a mais): /, "");
  async function buscarDivergencias() {
    const [{ data, error }, { data: motivos }] = await Promise.all([
      s.sb.from("operacao_ocorrencias").select("*").eq("pedido_id", s.pedido.id).in("tipo", ["falta", "sobra"]).order("criado_em"),
      s.sb.from("logistica_motivos").select("id,nome,etapa,situacao").eq("empresa_id", s.empresa).in("etapa", ["divergencia_falta", "divergencia_sobra"]).eq("ativo", true).order("nome")
    ]);
    if (error) throw error;
    const todas = (data || []).filter((o) => (o.etapa || "retorno") === etapa);
    return { todas, motivos: { falta: (motivos || []).filter((m) => m.etapa === "divergencia_falta"), sobra: (motivos || []).filter((m) => m.etapa === "divergencia_sobra") } };
  }
  // Duas células: "2ª conferência" (quantidade contada de novo) e "Motivo". Preenchidas as duas, fecha sozinho.
  // Foto (avatar público da conta, o mesmo do menu) e nome de quem fez a 2ª conferência; sem foto, as iniciais.
  function quemResolveu(o) {
    const nome = String(o.resolvido_por_nome || "").trim(); if (!nome) return "";
    const iniciais = nome.split(/s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase();
    let url = ""; try { if (o.resolvido_por) url = s.sb.storage.from("avatares").getPublicUrl(s.empresa + "/" + o.resolvido_por + ".jpg").data?.publicUrl || ""; } catch (_) {}
    return '<span class="cf-div-quem" title="2ª conferência por ' + esc(nome) + '"><span class="cf-div-avatar">' + esc(iniciais) +
      (url ? '<img src="' + esc(url) + '" alt="" loading="lazy" onerror="this.remove()">' : "") + "</span>" + esc(nome) + "</span>";
  }
  // Esperado da divergência e o que a 2ª conferência significa: bateu, continua (quanto) ou contagem impossível.
  const esperadoDiv = (o) => Number(o.esperado ?? (Number(o.conferido || 0) + (o.tipo === "sobra" ? -1 : 1) * Number(o.quantidade)));
  function avaliarSegunda(o, q) {
    const e = esperadoDiv(o);
    if (q === e) return { sit: "bateu", texto: "Bateu com o esperado", cls: "is-bateu" };
    if (o.tipo === "falta" && q > e) return { sit: null, texto: "Passou do esperado (" + e + "): conte de novo", cls: "is-erro" };
    if (o.tipo === "sobra" && q < e) return { sit: null, texto: "Abaixo do esperado (" + e + "): conte de novo", cls: "is-erro" };
    return o.tipo === "falta" ? { sit: "continua", texto: "Ainda faltam " + (e - q), cls: "is-falta" } : { sit: "continua", texto: "Ainda " + (q - e) + " a mais", cls: "is-sobra" };
  }
  function celulaResolver(o, motivos) {
    if (!o) return '<span class="cf-div-celula is-vazia"></span><span class="cf-div-celula is-vazia"></span>';
    if (o.resolvida_em) {
      const nome = [...(motivos.falta || []), ...(motivos.sobra || [])].find((m) => String(m.id) === String(o.motivo_id))?.nome || "Resolvida";
      const r = o.segunda_contagem != null ? avaliarSegunda(o, Number(o.segunda_contagem)) : null;
      return '<span class="cf-div-celula cf-div-ok cf-div-num">' + esc(o.segunda_contagem ?? "—") + (r ? '<small class="cf-div-sit ' + r.cls + '">' + esc(r.sit === "bateu" ? "bateu" : r.texto.replace(/^Ainda /, "")) + "</small>" : "") +
        '</span><span class="cf-div-celula cf-div-ok cf-div-mot" title="' + esc(o.resolucao || "") + '"><span class="cf-div-mot-nome">✓ ' + esc(nome) + "</span>" + quemResolveu(o) + "</span>";
    }
    const lista = motivos[o.tipo] || [];
    if (!lista.length) return '<span class="cf-div-celula is-vazia"></span><span class="cf-div-celula cf-div-sem-motivo">Cadastre os motivos de divergência em Gestão &gt; Parâmetros &gt; Operação.</span>';
    return '<span class="cf-div-celula" data-div="' + esc(o.id) + '"><input type="number" class="el-input cf-div-segunda" min="0" step="1" inputmode="numeric" aria-label="2ª conferência" placeholder="Qtd."><small class="cf-div-sit" aria-live="polite"></small></span>' +
      '<span class="cf-div-celula cf-mot" data-div="' + esc(o.id) + '"><input type="hidden" class="cf-div-motivo" value=""><button type="button" class="cf-mot-btn" aria-haspopup="listbox" aria-expanded="false" aria-label="Motivo" disabled><span>Conte primeiro</span></button></span>';
  }
  // Só os motivos que combinam com o resultado da 2ª conferência (Parâmetros: "quando bate" / "quando a diferença continua").
  function prepararMotivos(id, linha) {
    const o = (s.divAtuais || []).find((x) => String(x.id) === id); if (!o) return null;
    const qtdEl = linha.querySelector('[data-div="' + id + '"] .cf-div-segunda'), caixa = linha.querySelector('[data-div="' + id + '"].cf-mot');
    const motEl = caixa.querySelector(".cf-div-motivo"), btn = caixa.querySelector(".cf-mot-btn");
    const sitEl = qtdEl.parentElement.querySelector(".cf-div-sit");
    const valor = qtdEl.value.trim(), q = Number(valor);
    const r = valor === "" || !Number.isInteger(q) || q < 0 ? null : avaliarSegunda(o, q);
    sitEl.textContent = r ? r.texto : ""; sitEl.className = "cf-div-sit" + (r ? " " + r.cls : "");
    const lista = r?.sit ? ((s.divMotivos || {})[o.tipo] || []).filter((m) => !m.situacao || m.situacao === r.sit) : [];
    if (!lista.some((m) => String(m.id) === motEl.value)) motEl.value = "";
    const escolhido = lista.find((m) => String(m.id) === motEl.value);
    caixa._lista = lista;
    btn.disabled = !lista.length;
    btn.classList.toggle("is-escolhido", !!escolhido);
    btn.firstElementChild.textContent = escolhido ? escolhido.nome : !r ? "Conte primeiro" : !r.sit ? "Conte de novo" : lista.length ? "Escolha o motivo" : "Nenhum motivo cadastrado";
    return { o, q, r, qtdEl, motEl };
  }
  // Lista de motivos que abre sob o botão (fixa na tela, por cima da tabela).
  function fecharListaMotivos() { document.querySelector(".cf-mot-pop")?.remove(); document.querySelectorAll('.cf-mot-btn[aria-expanded="true"]').forEach((b) => b.setAttribute("aria-expanded", "false")); }
  function abrirListaMotivos(caixa) {
    fecharListaMotivos();
    const btn = caixa.querySelector(".cf-mot-btn"), atual = caixa.querySelector(".cf-div-motivo").value, rect = btn.getBoundingClientRect();
    const pop = document.createElement("div"); pop.className = "cf-mot-pop"; pop.setAttribute("role", "listbox");
    pop.innerHTML = (caixa._lista || []).map((m) => '<button type="button" role="option" data-mot="' + esc(m.id) + '" aria-selected="' + (String(m.id) === atual) + '">' + esc(m.nome) + "</button>").join("");
    pop.style.left = rect.left + "px"; pop.style.width = Math.max(rect.width, 220) + "px";
    document.body.append(pop);
    const alto = pop.offsetHeight, embaixo = rect.bottom + 6 + alto <= window.innerHeight;
    pop.style.top = (embaixo ? rect.bottom + 6 : rect.top - 6 - alto) + "px";
    pop._caixa = caixa; btn.setAttribute("aria-expanded", "true");
    (pop.querySelector('[aria-selected="true"]') || pop.querySelector("button"))?.focus();
  }
  // Rodapé com o botão que grava todas as 2ª conferências preenchidas da tela.
  const RODAPE_SEGUNDA = '<footer class="cf-qtd-rodape cf-div-rodape"><span class="cf-div-resumo"></span><button type="button" class="btn primary cf-div-salvar" disabled>Salvar 2ª conferência</button></footer>';
  function prontasParaSalvar() {
    return [...document.querySelectorAll(".cf-mot[data-div]")].map((caixa) => {
      const id = caixa.dataset.div, linha = caixa.closest(".cf-qtd-linha, .cf-div-linha");
      const p = prepararMotivos(id, linha); return p && p.r?.sit && p.motEl.value ? { id, ...p } : null;
    }).filter(Boolean);
  }
  function atualizarRodapeSegunda() {
    const abertas = document.querySelectorAll(".cf-mot[data-div]").length, prontas = prontasParaSalvar().length;
    document.querySelectorAll(".cf-div-rodape").forEach((r) => {
      r.hidden = !abertas;
      r.querySelector(".cf-div-resumo").textContent = prontas ? prontas + " de " + abertas + " divergência(s) pronta(s) para salvar" : "Preencha a 2ª conferência e o motivo de cada divergência";
      r.querySelector(".cf-div-salvar").disabled = !prontas;
    });
  }

  // Fora da tabela por quantidade (bipe, ou divergência sem linha correspondente): mesmo controle, num bloco próprio.
  let avisoDivergencia = null;
  function mostrarAvisoDivergencia() { if (!avisoDivergencia) return; window.fecharAlertaGlobal?.(); avisar(avisoDivergencia, "Divergência na contagem", "aviso"); }
  document.addEventListener("click", (ev) => {
    // composedPath: o botão Fechar já saiu da tela quando o clique chega aqui.
    if (!avisoDivergencia || ev.composedPath().some((n) => n.classList?.contains("el-alert") || n.classList?.contains("el-alert-confirm"))) return;
    mostrarAvisoDivergencia();
  });
  async function carregarDivergencias() {
    let raiz = $("cfDivergencias");
    if (!raiz) { raiz = document.createElement("section"); raiz.id = "cfDivergencias"; raiz.className = "cf-divergencias"; ($("cfQtd") || $("cfAviso")).after(raiz); }
    let dv;
    try { dv = await buscarDivergencias(); } catch (_) { raiz.hidden = false; raiz.innerHTML = '<p class="cf-vazio">Não foi possível carregar as divergências.</p>'; return; }
    s.divMotivos = dv.motivos;
    s.divAtuais = [...new Map([...(s.divAtuais || []), ...dv.todas].map((o) => [String(o.id), o])).values()];
    const todas = dv.todas || [], abertas = todas.filter((o) => !o.resolvida_em), faltas = abertas.filter((o) => o.tipo === "falta").length, sobras = abertas.length - faltas;
    if (!todas.length) { raiz.hidden = true; raiz.innerHTML = ""; avisoDivergencia = null; return; }
    raiz.hidden = false;
    // Pedido do usuário (nov/2026): o resultado vai também para o alerta global e volta a cada clique na tela.
    avisoDivergencia = abertas.length
      ? "A contagem não bateu: " + [faltas ? faltas + " item(ns) faltando" : "", sobras ? sobras + " item(ns) a mais" : ""].filter(Boolean).join(" e ") +
        ". A divergência foi enviada para Estoque > Gestão do acervo, que faz a contagem geral do item e resolve. Nada mais a fazer aqui."
      : null;
    mostrarAvisoDivergencia();
    // Nov/2026 (pedido do usuário): a mensagem fica só no alerta global, não na tela.
    raiz.hidden = true; raiz.innerHTML = "";
  }
  document.addEventListener("input", (ev) => {
    const campo = ev.target.closest(".cf-div-segunda"); if (!campo) return;
    fecharListaMotivos();
    prepararMotivos(campo.closest("[data-div]").dataset.div, campo.closest(".cf-qtd-linha, .cf-div-linha"));
    atualizarRodapeSegunda();
  });
  document.addEventListener("click", async (ev) => {
    const abrir = ev.target.closest(".cf-mot-btn");
    if (abrir) { const aberta = abrir.getAttribute("aria-expanded") === "true"; fecharListaMotivos(); if (!aberta && !abrir.disabled) abrirListaMotivos(abrir.closest(".cf-mot")); return; }
    const opcao = ev.target.closest(".cf-mot-pop [data-mot]");
    if (opcao) { const caixa = opcao.closest(".cf-mot-pop")._caixa; caixa.querySelector(".cf-div-motivo").value = opcao.dataset.mot; fecharListaMotivos();
      prepararMotivos(caixa.dataset.div, caixa.closest(".cf-qtd-linha, .cf-div-linha")); atualizarRodapeSegunda(); caixa.querySelector(".cf-mot-btn").focus(); return; }
    if (!ev.target.closest(".cf-mot-pop")) fecharListaMotivos();
    const salvar = ev.target.closest(".cf-div-salvar"); if (!salvar || salvar.disabled) return;
    const prontas = prontasParaSalvar(); if (!prontas.length) return;
    const perdas = prontas.filter((p) => p.o.tipo === "falta" && p.r.sit === "continua").reduce((t, p) => t + (esperadoDiv(p.o) - p.q), 0);
    if (perdas && !(await window.confirmarGlobal("A 2ª conferência confirmou " + perdas + " peça(s) faltando. Elas ficam como perda. Salvar?", "Confirmar perda", { confirmarTexto: "Salvar", cancelarTexto: "Voltar" }))) return;
    salvar.disabled = true; salvar.textContent = "Salvando…";
    const erros = [];
    for (const p of prontas) {
      const { error: erro } = await s.sb.rpc("operacao_fechar_divergencia", { p_id: p.id, p_contagem: p.q, p_motivo_id: p.motEl.value });
      if (erro) erros.push(erro.message);
    }
    if (!$("cfQtd").hidden) await mostrarSemEtiquetas();
    await carregarDivergencias();
    if (erros.length) avisar(erros.join(" · "), "Divergência", "erro");
  });
  document.addEventListener("keydown", (ev) => {
    const pop = document.querySelector(".cf-mot-pop"); if (!pop) return;
    if (ev.key === "Escape") { const btn = pop._caixa.querySelector(".cf-mot-btn"); fecharListaMotivos(); btn.focus(); ev.preventDefault(); return; }
    if (ev.key === "ArrowDown" || ev.key === "ArrowUp") {
      const ops = [...pop.querySelectorAll("button")], k = ops.indexOf(document.activeElement);
      ops[(k + (ev.key === "ArrowDown" ? 1 : -1) + ops.length) % ops.length]?.focus(); ev.preventDefault();
    }
  });
  window.addEventListener("scroll", (ev) => { if (!ev.target.closest?.(".cf-mot-pop")) fecharListaMotivos(); }, true);
  window.addEventListener("resize", fecharListaMotivos);

  window.addEventListener("pagehide", () => leitor?.desligar());
  iniciar().catch((e) => { console.error(e); mostrarAviso("Não foi possível abrir a conferência."); });
})();
