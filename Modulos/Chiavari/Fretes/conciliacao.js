/* =====================================================
   CONCILIAÇÃO DE FRETES (out/2026, no banco)
   - "Sistema": cada caminhão escalado no Painel Logístico, separado em Entrega (carregamento/montagem) e Coleta
     (desmontagem/descarregamento). Valor = valor/km da categoria do caminhão × km do pedido ÷ 2 (frete_sincronizar).
   - "Transportadora": o que ela informou no Cadastro de Fretes (pode lançar viagem extra).
   - Valor final: a logística define (Enter salva) e fecha várias viagens da MESMA transportadora → uma conta a pagar
     no Financeiro e um custo por pedido em Resultados (frete_fechar). Desfazer (sem pagamento) reabre as viagens.
===================================================== */
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const brl = (v) => (v == null || v === "" ? "—" : Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
  const dataBr = (v) => (v ? new Date(String(v).slice(0, 10) + "T12:00:00").toLocaleDateString("pt-BR") : "-");
  const num = (v) => (v == null || v === "" ? null : Number(v));
  const S = { sb: null, emp: null, dados: { viagens: [], fechamentos: [] }, sel: new Set(), agrupamento: "eventos", podeEditar: false };

  async function rpc(nome, args) { if(window.FretesExemplos)return window.FretesExemplos.rpc(nome, args); const { data, error } = await S.sb.rpc(nome, args); if (error) throw new Error(error.message || error); return data; }
  const avisar = (m, t = "Conciliação de Fretes", tipo = "aviso") => window.alerta ? window.alerta(m, t, tipo) : alert(m);

  async function completarIdentidade(){
    const sb=S.sb||window.supabaseClient,empresa=S.emp||window.__CONTEXT?.empresa_id;if(!sb?.from||!empresa)return;
    try{
      if(!window.FretesExemplos){
        const ids=[...new Set(S.dados.viagens.map(v=>v.pedido_id).filter(Boolean))];
        for(let i=0;i<ids.length;i+=100){const {data,error}=await sb.from('pedidos').select('id,data_evento,cliente_id,local_nome').eq('empresa_id',empresa).in('id',ids.slice(i,i+100));if(!error&&Array.isArray(data)){const porId=new Map(data.map(p=>[p.id,p]));S.dados.viagens.forEach(v=>{const p=porId.get(v.pedido_id);if(p)Object.assign(v,{data_evento:p.data_evento,cliente_id:p.cliente_id,local_nome:p.local_nome});});}}
      }
      const nomes=[...new Set(S.dados.viagens.map(v=>v.cliente).filter(Boolean))];
      for(let i=0;i<nomes.length;i+=100){const {data,error}=await sb.from('clientes_empresas').select('id,nome_razao,catalogo_logo_url').eq('empresa_id',empresa).in('nome_razao',nomes.slice(i,i+100));if(!error&&Array.isArray(data))S.dados.viagens.forEach(v=>{const c=data.find(c=>v.cliente_id?c.id===v.cliente_id:c.nome_razao===v.cliente);if(c&&/^https?:\/\//i.test(c.catalogo_logo_url||''))v.cliente_foto=c.catalogo_logo_url;});}
    }catch(e){console.warn('Foto do decorador indisponivel',e);}
  }
  async function carregar() {
    S.dados = await rpc("frete_conciliacao", { p_empresa: S.emp, p_de: null, p_ate: null });
    await completarIdentidade();
    const fornecs = [...new Map(S.dados.viagens.filter((v) => v.fornecedor_id).map((v) => [v.fornecedor_id, v.fornecedor])).entries()].sort((a, b) => String(a[1]).localeCompare(String(b[1])));
    const sel = $("cfTransp"), atual = sel.value;
    sel.innerHTML = '<option value="">Todas</option>' + fornecs.map(([id, n]) => '<option value="' + id + '">' + esc(n) + "</option>").join("");
    sel.value = fornecs.some(([id]) => id === atual) ? atual : "";
    const sf = Number(S.dados.sem_fornecedor || 0);
    $("cfAvisoForn").hidden = !sf;
    $("cfAvisoForn").textContent = sf ? sf + " caminhão(ões) escalado(s) sem fornecedor: os fretes deles não entram aqui. Ligue o caminhão à transportadora em Logística > Caminhões." : "";
    for (const id of [...S.sel]) if (!S.dados.viagens.some((v) => v.id === id && v.status === "aberto")) S.sel.delete(id);
    pintar();
  }

  function filtradas() {
    const t = $("cfTransp").value, st = $("cfSituacao").value, q = $("cfBusca").value.trim().toLowerCase();
    return S.dados.viagens.filter((v) => v.status === st && (!t || v.fornecedor_id === t) &&
      (!q || [v.pedido, v.cliente, v.caminhao, v.fornecedor].some((x) => String(x || "").toLowerCase().includes(q))));
  }

  function linha(v) {
    const aberto = v.status === "aberto", dif = v.valor_transportadora != null ? Number(v.valor_transportadora) - Number(v.valor_sistema) : null;
    const tipo = '<span class="cf-tipo ' + v.direcao + '">' + (v.direcao === "entrega" ? "Entrega · Ida" : "Coleta · Volta") + "</span>" + (v.extra ? '<span class="cf-tipo extra" title="Lançada pela transportadora, sem estar escalada">Extra</span>' : "") + (v.fora_escala ? '<span class="cf-tipo fora" title="O caminhão saiu da escala depois de a transportadora informar o valor">Fora da escala</span>' : "");
    const difHtml = dif == null ? '<span class="cf-pend">aguardando</span>' : Math.abs(dif) < 0.005 ? '<span class="cf-ok">igual</span>' : '<span class="' + (dif > 0 ? "cf-mais" : "cf-menos") + '">' + (dif > 0 ? "+" : "") + brl(dif) + "</span>";
    const final = aberto && S.podeEditar
      ? '<div class="cf-final"><input type="number" min="0" step="0.01" data-final="' + v.id + '" value="' + (v.valor_final ?? "") + '" placeholder="R$" aria-label="Valor final"><div class="cf-atalhos">' +
        '<button type="button" data-usar="sistema" data-id="' + v.id + '">= sistema</button>' + (v.valor_transportadora != null ? '<button type="button" data-usar="transp" data-id="' + v.id + '">= transportadora</button>' : "") + "</div></div>"
      : "<b>" + brl(v.valor_final) + "</b>";
    const notas=[v.obs,v.transp_obs?'Transportadora: '+v.transp_obs:''].filter(Boolean).join('\n\n');
    const obs=notas||aberto&&S.podeEditar?'<button type="button" class="cf-obs-icone '+(notas?'com-nota':'sem-nota')+'" data-nota="'+esc(v.id)+'" title="'+esc(notas||'Adicionar observação')+'" aria-label="'+esc(notas||'Adicionar observação')+'"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M5 4h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-6 4V6a2 2 0 0 1 2-2Z"/><path d="M7 9h10M7 13h7"/></svg></button>':'<span class="cf-sem-nota">—</span>';

    const caixa = comSelecao() ? '<td class="cf-sel">' + (aberto ? '<input type="checkbox" data-sel="' + esc(v.id) + '"' + (S.sel.has(v.id) ? " checked" : "") + (v.valor_final == null ? ' title="Defina o valor final para poder enviar"' : "") + ' aria-label="Enviar ao Contas a Pagar">' : "") + "</td>" : "";
    return "<tr" + (S.sel.has(v.id) ? ' class="is-sel"' : "") + ">" +

      "<td><b>" + (v.pedido ? "Pedido " + esc(v.pedido) : "Sem pedido") + "</b><small>" + esc(v.cliente || "") + "</small></td>" +
      "<td>" + tipo + "<small>" + dataBr(v.data) + "</small></td>" +
      "<td>" + esc(v.caminhao || "-") + (v.categoria ? "<small>Categoria " + esc(v.categoria) + "</small>" : "") + "</td>" +
      '<td class="cf-origem">' + esc(v.origem || '—') + '</td>' +
      '<td class="cf-destino">' + esc(v.destino || '—') + (Number(v.km) ? '<small>' + esc(String(v.km).replace('.', ',')) + ' km</small>' : '') + '</td>' +
      '<td class="num cf-valor-ch">' + brl(v.valor_sistema) + '</td>' +
      '<td class="num cf-valor-transportadora">' + brl(v.valor_transportadora) + '</td>' +
      '<td class="num">' + difHtml + "</td>" +
      '<td class="num">' + final + '</td><td class="cf-observacao">' + obs + "</td>" + caixa + "</tr>";
  }

  const pessoaFrete=v=>v.freteiro_nome||v.motorista_nome||v.fornecedor||'Sem responsável';
  const chaveEvento=v=>String(v.pedido_id||v.pedido||v.id);
  const somar=(vs,campo)=>vs.reduce((n,v)=>n+Number(v[campo]||0),0);
  const organizar=(lista,chave)=>{const g=new Map();lista.forEach(v=>{const k=chave(v);if(!g.has(k))g.set(k,[]);g.get(k).push(v);});return [...g.entries()];};
  function comSelecao(){return $("cfSituacao").value==="aberto"&&S.podeEditar;}
  function tabelaViagens(vs){const sel=comSelecao(),eleg=vs.filter(v=>v.status==="aberto"&&v.valor_final!=null);return '<div class="cf-rolar"><table class="cf-tabela cf-viagens"><colgroup>'+'<col style="width:10%"><col style="width:12%"><col style="width:12%"><col style="width:13%"><col style="width:14%"><col style="width:8%"><col style="width:10%"><col style="width:8%"><col style="width:8%"><col style="width:5%">'+(sel?'<col style="width:78px">':'')+'</colgroup><thead><tr>'+'<th>Pedido</th><th>Tipo · data</th><th>Caminhão</th><th>Origem</th><th>Destino</th><th class="num cf-valor-ch">Valor CH</th><th class="num cf-valor-transportadora">Valor transportadora</th><th class="num">Diferença</th><th class="num">Valor final</th><th class="cf-observacao" title="Observação">Obs.</th>'+(sel?'<th class="cf-sel" title="Enviar ao Contas a Pagar">'+(eleg.length?'<label class="cf-sel-todos"><input type="checkbox" data-sel-grupo="'+esc(eleg.map(v=>v.id).join(","))+'"'+(eleg.every(v=>S.sel.has(v.id))?' checked':'')+' aria-label="Marcar todas as viagens com valor final">Enviar</label>':'Enviar')+'</th>':'')+'</tr></thead><tbody>'+vs.map(linha).join('')+'</tbody></table></div>';}
  function blocoGrupo(titulo,sub,vs,cabecalho){
    const final=vs.every(v=>v.valor_final!=null)?brl(somar(vs,'valor_final')):'—';
    return '<section class="cf-evento"><header class="cf-evento-topo">'+(cabecalho||'<div><h3>'+esc(titulo)+'</h3><p>'+esc(sub)+'</p></div>')+'<div class="cf-evento-totais"><span>Valor CH <b>'+brl(somar(vs,'valor_sistema'))+'</b></span><span>Transportadora <b>'+brl(somar(vs,'valor_transportadora'))+'</b></span><span>Total final <strong>'+final+'</strong></span></div></header>'+tabelaViagens(vs)+'</section>';
  }
  function cabecalhoEvento(v,vs){
    const dia=String(v.data_evento||v.data||'').slice(0,10),semana=dia?new Date(dia+'T12:00:00').toLocaleDateString('pt-BR',{weekday:'short'}):'',nome=v.cliente||'Sem cliente',ini=nome.trim().split(/\s+/).slice(0,2).map(n=>n.charAt(0)).join('').toUpperCase();
    const foto=/^https?:\/\//i.test(v.cliente_foto||'')?'<img src="'+esc(v.cliente_foto)+'" alt="Foto de '+esc(nome)+'" loading="lazy" onerror="this.remove()">':'';
    return '<div class="cf-evento-data"><small>'+esc(semana)+'</small><b>'+esc(dia?dataBr(dia).slice(0,5):'—')+'</b></div><div class="cf-evento-foto">'+foto+'<b>'+esc(ini)+'</b></div><span class="cf-evento-pedido">Pedido '+esc(v.pedido||'—')+'</span><div class="cf-evento-identidade"><strong>'+esc(nome)+(v.local_nome?' – '+esc(v.local_nome):'')+'</strong><span>'+esc([...new Set(vs.map(pessoaFrete))].join(' / '))+' · '+vs.length+' viagem(ns)</span></div>';
  }
  function htmlEventos(lista){return organizar(lista,chaveEvento).sort((a,b)=>String(a[1][0].pedido).localeCompare(String(b[1][0].pedido),'pt-BR',{numeric:true})).map(([k,vs])=>{vs.sort((a,b)=>String(a.data).localeCompare(String(b.data)));const v=vs[0],nomes=[...new Set(vs.map(pessoaFrete))].join(' / ');return blocoGrupo('Pedido '+(v.pedido||'sem número')+' · '+(v.cliente||'Sem cliente'),nomes+' · '+vs.length+' viagem(ns)',vs,cabecalhoEvento(v,vs));}).join('');}
  function htmlAgrupado(lista){
    if(S.agrupamento==='pessoas')return organizar(lista,v=>String(v.motorista_id||v.freteiro_id||v.fornecedor_id||pessoaFrete(v))).sort((a,b)=>pessoaFrete(a[1][0]).localeCompare(pessoaFrete(b[1][0]),'pt-BR')).map(([k,vs])=>blocoGrupo(pessoaFrete(vs[0]),new Set(vs.map(chaveEvento)).size+' evento(s) · '+vs.length+' viagem(ns)',vs.sort((a,b)=>String(a.data).localeCompare(String(b.data))))).join('');
    if(S.agrupamento==='dias')return organizar(lista,v=>String(v.data||'').slice(0,10)).sort((a,b)=>a[0].localeCompare(b[0])).map(([dia,vs])=>'<section class="cf-dia"><h3 class="cf-dia-titulo"><span>'+esc(dia?new Date(dia+'T12:00:00').toLocaleDateString('pt-BR',{weekday:'long',day:'2-digit',month:'2-digit'}):'Sem data')+'</span><span>'+new Set(vs.map(chaveEvento)).size+' evento(s) · '+vs.length+' viagem(ns) · '+brl(somar(vs,'valor_sistema'))+'</span></h3>'+htmlEventos(vs)+'</section>').join('');
    return htmlEventos(lista);
  }
  function pintar() {
    const lista = filtradas(), st = $("cfSituacao").value;
    const soma=somar;
    $('cfConteudo').innerHTML=lista.length?htmlAgrupado(lista):'<div class="cf-vazio">Nenhuma viagem nesta situação.</div>';
    pintarBarraEnvio();
    const fechs = S.dados.fechamentos || [];
    $("cfFechamentos").hidden = !fechs.length;
    $("cfFechLista").innerHTML = '<div class="cf-rolar"><table class="cf-tabela"><thead><tr><th>Documento</th><th>Transportadora</th><th class="num">Total</th><th>Vencimento</th><th>Situação</th><th>Feito por</th><th></th></tr></thead><tbody>' +
      fechs.map((f) => {
        const sit = f.status === "cancelado" ? "Desfeito" : f.pagar_status === "pago" ? "Pago" : f.pagar_status === "cancelado" ? "Cancelado no Financeiro" : "No Contas a Pagar";
        const pode = f.status === "ativo" && f.pagar_status !== "pago" && !(Number(f.pago) > 0) && S.podeEditar;
        return "<tr" + (f.status === "cancelado" ? ' class="is-desfeito"' : "") + "><td><b>FR-" + String(f.numero).padStart(4, "0") + "</b></td><td>" + esc(f.beneficiario) + '</td><td class="num">' + brl(f.total) + "</td><td>" + dataBr(f.vencimento) + "</td><td>" + sit + "</td><td>" + esc(f.criado_por || "") + "<small>" + new Date(f.criado_em).toLocaleString("pt-BR") + "</small></td><td>" + (pode ? '<button type="button" class="btn" data-desfazer="' + f.id + '">Desfazer</button>' : "") + "</td></tr>";
      }).join("") + "</tbody></table></div>";
  }

  async function salvarFinal(id, valor, observacao) {
    const v = S.dados.viagens.find((x) => x.id === id); if (!v) return;
    const obs = observacao ?? v.obs ?? "";
    try {
      const novo = await rpc("frete_definir_final", { p_empresa: S.emp, p_viagem: id, p_valor: valor, p_obs: obs });
      Object.assign(v, novo);
      if (valor == null) S.sel.delete(id);
      pintar();return true;
    } catch (e) { avisar(e.message);return false; }
  }

  // Nov/2026: marcar as viagens (caixa em cada linha ou no cabeçalho do evento), barra embaixo e janela de envio,
  // como no Pagamento de Freelancer. Cada transportadora vira uma conta no Contas a Pagar (frete_fechar).
  function selecionadas(){return S.dados.viagens.filter(v=>S.sel.has(v.id)&&v.status==="aberto");}
  function pintarBarraEnvio(){
    let b=$("cfBarraEnvio");const vs=comSelecao()?selecionadas():[];
    if(!vs.length){if(b)b.hidden=true;return;}
    if(!b){b=document.createElement("div");b.id="cfBarraEnvio";b.className="cf-barra-envio";document.body.appendChild(b);}
    const forns=new Set(vs.map(v=>v.fornecedor_id||"")),sem=vs.filter(v=>v.valor_final==null).length;
    b.innerHTML='<span><b>'+vs.length+(vs.length===1?' viagem':' viagens')+'</b> de '+forns.size+(forns.size===1?' transportadora':' transportadoras')+' · Total final <b class="cf-rs">'+brl(somar(vs,"valor_final"))+'</b>'+(sem?' · <em>'+sem+' sem valor final</em>':'')+'</span><button type="button" class="btn secondary" data-envio-limpar>Desmarcar</button><button type="button" class="btn primary" data-envio-abrir>Enviar ao Contas a Pagar</button>';
    b.hidden=false;
  }
  function abrirEnvio(){
    const vs=selecionadas();if(!vs.length)return;
    const sem=vs.filter(v=>v.valor_final==null);
    if(sem.length)return avisar("Defina o valor final de todas as viagens marcadas ("+sem.length+" sem valor).");
    const grupos=organizar(vs,v=>v.fornecedor_id||"");
    const difs=vs.filter(v=>v.valor_transportadora!=null&&Math.abs(Number(v.valor_final)-Number(v.valor_transportadora))>=0.005);
    const venc=new Date(Date.now()+7*864e5).toISOString().slice(0,10),total=somar(vs,"valor_final");
    const d=document.createElement("dialog");d.className="cf-nota-dialog cf-envio-dialog";
    d.innerHTML='<form><h3>Enviar ao Contas a Pagar</h3><p class="cf-envio-sub">Cada transportadora vira uma conta a pagar no Financeiro. O custo também entra no resultado de cada pedido.</p>'+
      (difs.length?'<div class="cf-envio-aviso">'+difs.length+(difs.length===1?' viagem tem':' viagens têm')+' valor final diferente do informado pela transportadora. Confira antes de enviar.</div>':'')+
      '<table class="cf-envio-resumo"><thead><tr><th>Transportadora</th><th class="num">Viagens</th><th class="num">Total final</th></tr></thead><tbody>'+
      grupos.map(([fid,g])=>'<tr><td>'+esc(g[0].fornecedor||"Sem fornecedor")+'<small>'+g.map(v=>(v.pedido?"Pedido "+esc(v.pedido):"Sem pedido")+" · "+(v.direcao==="entrega"?"Ida":"Volta")+" "+dataBr(v.data).slice(0,5)+" · "+brl(v.valor_final)).join(" · ")+'</small></td><td class="num">'+g.length+'</td><td class="num"><b class="cf-rs">'+brl(somar(g,"valor_final"))+'</b></td></tr>').join('')+
      '</tbody><tfoot><tr><td>Total</td><td class="num">'+vs.length+'</td><td class="num"><b class="cf-rs">'+brl(total)+'</b></td></tr></tfoot></table>'+
      '<div class="cf-envio-campos"><label>Vencimento<input type="date" name="venc" value="'+venc+'"></label><label class="cf-envio-obs">Observação (opcional)<input type="text" name="obs" maxlength="300"></label></div>'+
      '<div><button type="button" class="btn secondary" data-fechar-nota>Cancelar</button><button type="submit" class="btn primary">Enviar '+brl(total)+'</button></div></form>';
    document.body.appendChild(d);d.showModal();
    d.querySelector("[data-fechar-nota]").onclick=()=>d.close();d.addEventListener("close",()=>d.remove());
    d.querySelector("form").onsubmit=async e=>{
      e.preventDefault();const f=e.target,v=f.venc.value;if(!v)return avisar("Informe o vencimento.");
      const bt=f.querySelector('[type="submit"]');bt.disabled=true;const docs=[];
      try{
        for(const [fid,g] of grupos){
          const r=await rpc("frete_fechar",{p_empresa:S.emp,p_viagens:g.map(x=>x.id),p_vencimento:v,p_obs:f.obs.value||null});
          docs.push(r.documento+" ("+brl(r.total)+")");g.forEach(x=>S.sel.delete(x.id));
        }
        d.close();avisar("Enviado ao Contas a Pagar: "+docs.join(", ")+". O custo de cada pedido já aparece em Financeiro > Resultados.","Fretes enviados","sucesso");
      }catch(err){bt.disabled=false;avisar((docs.length?"Enviados: "+docs.join(", ")+". ":"")+err.message);}
      await carregar();
    };
  }

  async function fechar(fid) {
    const ids = filtradas().filter((v) => (v.fornecedor_id || "") === fid && S.sel.has(v.id)).map((v) => v.id);
    if (!ids.length) return;
    const semFinal = S.dados.viagens.filter((v) => ids.includes(v.id) && v.valor_final == null).length;
    if (semFinal) return avisar("Defina o valor final de todas as viagens selecionadas (" + semFinal + " sem valor).");
    const total = S.dados.viagens.filter((v) => ids.includes(v.id)).reduce((s, v) => s + Number(v.valor_final || 0), 0);
    const venc = document.querySelector('[data-venc="' + fid + '"]')?.value;
    if (!venc) return avisar("Informe o vencimento.");
    const ok = window.confirmarGlobal ? await window.confirmarGlobal("Fechar " + ids.length + " viagem(ns) no total de " + brl(total) + " e enviar ao Contas a Pagar com vencimento em " + dataBr(venc) + "?", "Fechar fretes") : confirm("Fechar?");
    if (!ok) return;
    try {
      const r = await rpc("frete_fechar", { p_empresa: S.emp, p_viagens: ids, p_vencimento: venc, p_obs: document.querySelector('[data-obsfech="' + fid + '"]')?.value || null });
      ids.forEach((id) => S.sel.delete(id));
      avisar("Fechamento " + r.documento + " (" + brl(r.total) + ") enviado ao Contas a Pagar. O custo de cada pedido já aparece em Financeiro > Resultados.", "Fretes fechados", "sucesso");
      await carregar();
    } catch (e) { avisar(e.message); }
  }

  function abrirObservacao(v){
    if(!v)return;const editar=v.status==='aberto'&&S.podeEditar,d=document.createElement('dialog');d.className='cf-nota-dialog';
    d.innerHTML='<form><h3>Observação · Pedido '+esc(v.pedido||'—')+'</h3>'+(v.transp_obs?'<p class="cf-nota-transp"><b>Transportadora</b><br>'+esc(v.transp_obs)+'</p>':'')+(editar?'<textarea aria-label="Observação" rows="4">'+esc(v.obs||'')+'</textarea>':'<p class="cf-nota-texto">'+esc(v.obs||'')+'</p>')+'<div><button type="button" class="btn secondary" data-fechar-nota>Fechar</button>'+(editar?'<button type="submit" class="btn primary">Salvar</button>':'')+'</div></form>';
    d.querySelector('[data-fechar-nota]').onclick=()=>d.close();d.addEventListener('close',()=>d.remove());d.querySelector('form').onsubmit=async e=>{e.preventDefault();if(!editar)return;const bt=d.querySelector('[type="submit"]');bt.disabled=true;const ok=await salvarFinal(v.id,v.valor_final==null?null:Number(v.valor_final),d.querySelector('textarea').value);if(ok)d.close();else bt.disabled=false;};document.body.append(d);d.showModal();
  }
  function ligar() {
    try{const salva=localStorage.getItem('fretes_agrupar');if(['eventos','pessoas','dias'].includes(salva))S.agrupamento=salva;}catch(_){}
    $('cfAgrupar').value=S.agrupamento;
    $('cfAgrupar').addEventListener('change',e=>{S.agrupamento=e.target.value;try{localStorage.setItem('fretes_agrupar',S.agrupamento);}catch(_){}pintar();});
    ["cfTransp", "cfSituacao"].forEach((id) => $(id).addEventListener("change", () => { S.sel.clear(); pintar(); }));
    $("cfBusca").addEventListener("input", pintar);
    document.addEventListener("click", async (e) => {
      const nota=e.target.closest("[data-nota]");if(nota){abrirObservacao(S.dados.viagens.find(v=>v.id===nota.dataset.nota));return;}

      const u = e.target.closest("[data-usar]");
      if (u) { const v = S.dados.viagens.find((x) => x.id === u.dataset.id); return salvarFinal(u.dataset.id, u.dataset.usar === "sistema" ? Number(v.valor_sistema) : Number(v.valor_transportadora)); }
      const f = e.target.closest("[data-fechar]"); if (f) return fechar(f.dataset.fechar);
      if (e.target.closest("[data-envio-abrir]")) return abrirEnvio();
      if (e.target.closest("[data-envio-limpar]")) { S.sel.clear(); return pintar(); }
      const d = e.target.closest("[data-desfazer]");
      if (d) {
        const ok = window.confirmarGlobal ? await window.confirmarGlobal("Desfazer este fechamento? A conta a pagar é cancelada e as viagens voltam para Em aberto.", "Desfazer fechamento") : confirm("Desfazer?");
        if (!ok) return;
        try { await rpc("logistica_fechamento_desfazer", { p_empresa: S.emp, p_fechamento: d.dataset.desfazer }); await carregar(); } catch (err) { avisar(err.message); }
      }
    });
    document.addEventListener("change", (e) => {
      const c = e.target.closest("[data-sel]");
      if (c) {
        const v = S.dados.viagens.find((x) => x.id === c.dataset.sel);
        if (c.checked && v?.valor_final == null) { c.checked = false; return avisar("Defina o valor final antes de selecionar."); }
        c.checked ? S.sel.add(c.dataset.sel) : S.sel.delete(c.dataset.sel); return pintar();
      }
      const g = e.target.closest("[data-sel-grupo]");
      if (g) { g.dataset.selGrupo.split(",").filter(Boolean).forEach((id) => g.checked ? S.sel.add(id) : S.sel.delete(id)); return pintar(); }
      const t = e.target.closest("[data-sel-todos]");
      if (t) {
        filtradas().filter((v) => (v.fornecedor_id || "") === t.dataset.selTodos && v.valor_final != null).forEach((v) => t.checked ? S.sel.add(v.id) : S.sel.delete(v.id));
        return pintar();
      }
      const fi = e.target.closest("[data-final]"); if (fi) return salvarFinal(fi.dataset.final, num(fi.value));
      const ob = e.target.closest("[data-obs]");
      if (ob) { const v = S.dados.viagens.find((x) => x.id === ob.dataset.obs); if (v) salvarFinal(v.id, v.valor_final == null ? null : Number(v.valor_final)); }
    });
    document.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      const fi = e.target.closest?.("[data-final]"); if (!fi) return;
      e.preventDefault();
      const todos = [...document.querySelectorAll("[data-final]")], i = todos.indexOf(fi), prox = todos[i + 1]?.dataset.final;
      fi.blur();
      setTimeout(() => { const n = prox && document.querySelector('[data-final="' + prox + '"]'); if (n) { n.focus(); n.select?.(); } }, 250);
    });
  }

  async function iniciar() {
    if(window.FretesExemplos){const ctx=await window.aguardarContexto?.();S.sb=window.supabaseClient;S.emp=ctx?.empresa_id||window.__CONTEXT?.empresa_id;S.podeEditar=true;ligar();await carregar();return;}
    const ctx = await window.aguardarContexto?.();
    S.sb = window.supabaseClient; S.emp = ctx?.empresa_id || window.__CONTEXT?.empresa_id;
    try { await window.EasyLocPermissions?.load?.(); S.podeEditar = window.EasyLocPermissions?.hasPermission ? !!window.EasyLocPermissions.hasPermission("logistica.planejamento.editar") : true; } catch (_) { S.podeEditar = true; }
    ligar();
    try { await carregar(); } catch (e) { $("cfConteudo").innerHTML = '<div class="cf-vazio">' + esc(e.message) + "</div>"; }
  }
  iniciar();
})();
