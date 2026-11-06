/**
 * MURAL DO INÍCIO — cópia do mural do Portal Interno da Chiavari
 * (o antigo Modulos/Chiavari/Portal/portal.html, já apagado — função montarMural e vizinhas),
 * mostrado na tela "Início" do dashboard. Os dados vêm de
 * /api/portal-mural (mesmo MURAL_dadosPublicos_ do Portal, conferindo a
 * sessão do Acervo). Sem o servidor (ex.: GitHub Pages) mostra só a capa.
 * Gerado a partir do portal.html: ao mudar o mural lá, replicar aqui.
 */
(function(){
  "use strict";
  const FOTO_PADRAO = "https://awemuohtvwvrdzfxwrmd.supabase.co/storage/v1/object/public/sistema%20interno/007_Ana%20Paula%20Astino_APA_20251216111706.jpg";
  const MESES = ["janeiro","fevereiro","março","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"];
  const MESES_CURTOS = ["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"];
  const DIAS = ["domingo","segunda-feira","terça-feira","quarta-feira","quinta-feira","sexta-feira","sábado"];
  const estado = { mural: null, carregando: null };
  let encerrarHero = null;
  let encerrarMovimento = null;
  let encerrarFogos = null;

  function iniciarHero(){
    encerrarHero?.();
    const hero = document.querySelector("#portalInicio .hero");
    const slides = hero?.querySelectorAll(".hero-slide");
    if(!slides || slides.length < 2) return;
    const fotos = hero.querySelectorAll(".hero-img");
    const pontos = hero.querySelectorAll(".hero-ponto");
    const pausa = hero.querySelector(".hero-pausa");
    let atual = 0, pausado = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    function mostrarSlide(indice){
      atual = (indice + slides.length) % slides.length;
      slides.forEach((slide, i) => { slide.classList.toggle("ativo", i === atual); slide.inert = i !== atual; slide.setAttribute("aria-hidden", String(i !== atual)); });
      fotos.forEach((foto, i) => foto.classList.toggle("ativo", i === atual));
      pontos.forEach((ponto, i) => ponto.setAttribute("aria-pressed", String(i === atual)));
      if(slides[atual].classList.contains("hero-numeros")) slides[atual].querySelectorAll("[data-contar]").forEach(contar);
      hero.dispatchEvent(new Event("hero-slide-change"));
    }
    function atualizarPausa(){ pausa.textContent = pausado ? "Retomar" : "Pausar"; pausa.setAttribute("aria-label", pausado ? "Retomar troca dos destaques" : "Pausar troca dos destaques"); }
    pontos.forEach((ponto, i) => ponto.addEventListener("click", () => mostrarSlide(i)));
    hero.querySelector(".hero-anterior").addEventListener("click", () => mostrarSlide(atual - 1));
    hero.querySelector(".hero-proximo").addEventListener("click", () => mostrarSlide(atual + 1));
    pausa.addEventListener("click", () => { pausado = !pausado; atualizarPausa(); });
    mostrarSlide(0); atualizarPausa();
    let desde = Date.now();
    hero.addEventListener("hero-slide-change", () => { desde = Date.now(); });
    const timer = setInterval(() => {
      if(pausado || document.hidden || !document.body.classList.contains("portal-em-inicio") || hero.matches(":hover, :focus-within")){ desde = Date.now() - Math.min(Date.now() - desde, 6000); return; }
      if(Date.now() - desde >= (Number(slides[atual].dataset.duracao) || 7000)) mostrarSlide(atual + 1);
    }, 500);
    encerrarHero = () => clearInterval(timer);
  }

  function esc(v){ return String(v == null ? "" : v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;"); }
  function icones(){ try{ if(window.lucide){ lucide.createIcons(); } }catch(e){} }

  /* =========================================================
     MURAL DE DESTAQUES
  ========================================================= */
  function saudacao(){
    const h = new Date().getHours();
    return h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
  }

  function dataLonga(){
    const d = new Date();
    return DIAS[d.getDay()] + ", " + d.getDate() + " de " + MESES[d.getMonth()];
  }

  function mesCurto(iso){
    const p = String(iso || "").split("-");
    return p.length >= 2 ? MESES_CURTOS[Number(p[1]) - 1] + " " + p[0] : "";
  }

  function fotoOuInicial(foto, nome){
    return foto ? '<img src="' + esc(foto) + '" alt="" loading="lazy">' : esc(String(nome || "?").charAt(0).toUpperCase());
  }

  function cabecalho(sobre, titulo, texto){
    return '<div class="secao-topo revelar"><div><small>' + sobre + '</small><h2>' + titulo + '</h2></div>' + (texto ? '<p>' + texto + '</p>' : "") + '</div>';
  }

  function confetes(){
    const cores = ["#b08d57","#dc2626","#16a34a","#1d4ed8","#7c3aed","#f59e0b"];
    let h = "";
    for(let i = 0; i < 18; i++){
      h += '<i class="confete" style="left:' + (5 + Math.random() * 90) + '%;background:' + cores[i % cores.length] + ';animation-delay:' + (Math.random() * 3).toFixed(2) + 's;animation-duration:' + (2.6 + Math.random() * 1.8).toFixed(2) + 's"></i>';
    }
    return h;
  }

  /* Mesma leitura do cronograma, em linhas ordenadas pelo horario. */
  function resumoDiaHtml(r){
    if(!r)return '';
    const dataISO=r.data||new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo'}).format(new Date());
    const dataBr=dataISO.split('-').reverse().join('/');
    const dia=new Date(dataISO+'T12:00:00Z').toLocaleDateString('pt-BR',{weekday:'long',timeZone:'America/Sao_Paulo'});
    const nomesLista=v=>(Array.isArray(v)?v:String(v||'').split(/[|,]/)).map(x=>String(x).trim()).filter(Boolean);
    const pessoas=valor=>{
      const nomes=nomesLista(valor);if(!nomes.length)return '\u2014';
      return '<span class="rd-pessoas">'+nomes.map(nome=>{
        const foto=r.fotos?.[nome],iniciais=nome.split(/\s+/).slice(0,2).map(n=>n[0]).join('').toUpperCase();
        return '<span class="rd-pessoa"><span class="rd-avatar"><span>'+esc(iniciais)+'</span>'+(/^https?:\/\//i.test(foto||'')?'<img src="'+esc(foto)+'" alt="" loading="lazy">':'')+'</span><span>'+esc(nome)+'</span></span>';
      }).join('')+'</span>';
    };
    const linhas=(r.etapas||[]).flatMap(grupo=>(grupo.itens||[]).map(item=>({...item,etapa:grupo.etapa})));
    for(const a of r.agenda||[])linhas.push({horario:a.horario,cliente:[a.tipo,a.setor].filter(Boolean).join(' \u00b7 '),etapa:'Agenda interna',local:a.descricao,responsavel:a.responsavel});
    linhas.sort((a,b)=>(a.horario||'99:99').localeCompare(b.horario||'99:99')||RESUMO_ORDEM.indexOf(a.etapa)-RESUMO_ORDEM.indexOf(b.etapa)||String(a.pedido||'').localeCompare(String(b.pedido||''),'pt-BR',{numeric:true}));
    const tipo=nome=>nome?.startsWith('Triagem')?'triagem':({Carregamento:'carregamento',Montagem:'montagem',Desmontagem:'desmontagem',Descarregamento:'descarregamento'}[nome]||'agenda');
    const colunas=['Data','Hor\u00e1rio','Pedido','Cliente','Etapa','Local','Respons\u00e1vel','Equipe','Caminh\u00e3o'];
    const celula=(valor,i)=>'<td data-label="'+colunas[i]+'">'+valor+'</td>';
    const tabela='<div class="rd-tabela-caixa"><table class="rd-tabela"><colgroup>'+colunas.map((_,i)=>'<col class="rd-coluna-'+i+'">').join('')+'</colgroup><thead><tr>'+colunas.map(c=>'<th scope="col">'+c+'</th>').join('')+'</tr></thead><tbody><tr class="rd-dia"><th colspan="9" scope="rowgroup"><span class="rd-dia-numero">'+dataISO.slice(-2)+'</span><span>'+esc(dia[0].toUpperCase()+dia.slice(1))+', '+dataBr+'</span></th></tr>'+linhas.map(it=>'<tr class="rd-linha">'+[
      '<strong>'+dataBr+'</strong>',esc(it.horario||'\u2014'),it.pedido?'<span class="rd-pedido">#'+esc(String(it.pedido).replace(/^#/,''))+'</span>':'\u2014',esc(it.cliente||'\u2014'),'<span class="rd-etapa rd-etapa-'+tipo(it.etapa)+'">'+esc(it.etapa)+'</span>',esc(it.local||'\u2014'),pessoas(it.responsavel),pessoas(it.equipe),esc(nomesLista(it.caminhao).join(', ')||'\u2014')
    ].map(celula).join('')+'</tr>').join('')+(linhas.length?'':'<tr><td colspan="9" class="rd-tabela-vazia">Nada no cronograma para hoje.</td></tr>')+'</tbody></table></div>';
    return '<section class="secao cheia" id="resumoDia"><div class="secao-topo revelar"><div><small>Hoje</small><h2>Resumo do dia</h2></div><div class="rd-topo-acoes"><p>'+linhas.length+' atividade(s) hoje</p><button class="rd-abrir" type="button" onclick="shellNavigate(\'Modulos/Chiavari/Cronograma/cronograma.html\')"><i data-lucide="calendar"></i>Abrir o cronograma</button></div></div>'+tabela+'</section>';
  }

  function metasSetoresHtml(dados){
    const setores = dados?.setores || [];
    const mes = dados?.mes ? mesCurto(dados.mes) : "este mês";
    const atingidos = setores.filter(s => s.status === true).length;
    const pendentes = setores.filter(s => s.status === false).length;
    const semDados = setores.length - atingidos - pendentes;
    const percentual = atingidos + pendentes ? Math.round(atingidos / (atingidos + pendentes) * 100) : null;
    const resumo = '<div class="metas-painel revelar"><div class="metas-visao"><span class="metas-eyebrow">VISÃO GERAL</span><h3>Cada setor.<br>Uma mesma direção.</h3><p>Resultados reais, acompanhados ao longo do mês.</p><div class="metas-pulso"><i></i>Parcial do mês</div></div><div class="metas-donut" style="--progresso:' + (percentual || 0) + '%"><div><b>' + (percentual == null ? '—' : percentual + '%') + '</b><span>setores com meta atingida</span></div></div><div class="metas-totais">' + [[atingidos,'Meta atingida','ok'],[pendentes,'Em busca da meta','andamento'],[semDados,'Sem avaliação disponível','neutro']].map(t => '<div><i class="' + t[2] + '"></i><b>' + t[0] + '</b><span>' + t[1] + '</span></div>').join('') + '<small>' + setores.length + ' setores · Percentual considera apenas os avaliados</small></div></div>';
    const valor = function(v, unidade){
      if(v == null || !Number.isFinite(Number(v))) return "—";
      return Number(v).toLocaleString("pt-BR", {maximumFractionDigits:1}) + (unidade === "%" ? "%" : " " + (unidade || ""));
    };
    return '<section class="secao cheia" id="metasSetores">' + cabecalho("Evolução em equipe", "Metas por setor", "Parcial de " + esc(mes) + " · Acompanhamento do mês") +
      (setores.length ? '<div class="metas-dashboard">' + resumo + '<div class="metas-orbitas">' + setores.map(function(s, index){
        const classe = s.status === true ? "atingida" : s.status === false ? "pendente" : "sem-meta";
        const status = s.status === true ? "Meta atingida" : s.status === false ? "Ainda não atingida" : (s.motivo || "Sem meta cadastrada");
        const principal = (s.indicadores || []).find(i => i.nome === "Produção" || i.nome === "Contagem");
        const progresso = principal && principal.real != null && Number(principal.meta) > 0 ? Math.max(0,Number(principal.real)/Number(principal.meta)*100) : null;
        const porcentagem = progresso == null ? "—" : progresso.toLocaleString("pt-BR", {maximumFractionDigits:1}) + "%";
        const detalhe = progresso == null ? (s.motivo || "Sem indicador principal") : progresso >= 100 ? "Meta de " + principal.nome.toLowerCase() + " alcançada" : "Faltam " + (100-progresso).toLocaleString("pt-BR",{maximumFractionDigits:1}) + "% da meta de " + principal.nome.toLowerCase();
        const tooltip = '<div class="meta-detalhes" id="meta-detalhes-' + index + '" role="tooltip"><b>' + esc(s.setor) + '</b>' + ((s.indicadores || []).length ? '<div class="meta-detalhes-legenda"><span>Indicador</span><span>Atual / Meta</span></div>' + s.indicadores.map(i => '<div class="meta-detalhes-linha"><span>' + esc(i.nome) + '</span><span class="' + (i.atingiu === true ? 'ok' : '') + '">' + esc(valor(i.real,i.unidade)) + ' <em>/ ' + esc(valor(i.meta,i.unidade)) + '</em></span></div>').join('') : '<p>' + esc(s.motivo || 'Sem meta cadastrada') + '</p>') + '<small>' + esc(detalhe) + '</small></div>';
        return '<div class="meta-orbita revelar ' + classe + '" tabindex="0" aria-describedby="meta-detalhes-' + index + '" style="--atraso:' + (index % 7) * .06 + 's"><div class="meta-anel">' + (s.status === true ? '<span class="meta-medalha" aria-hidden="true"><i data-lucide="medal"></i></span>' : '') + '<svg viewBox="0 0 100 100" aria-hidden="true"><circle class="meta-anel-base" cx="50" cy="50" r="43"/><circle class="meta-anel-valor" cx="50" cy="50" r="43" pathLength="100" style="--anel:' + Math.min(100,progresso || 0) + '"/></svg><strong>' + porcentagem + '</strong></div><h3>' + esc(s.setor) + '</h3><span class="meta-status ' + classe + '">' + esc(status) + '</span>' + tooltip + '</div>';
      }).join("") + '</div></div><p class="metas-nota">Círculos: percentual da meta de produção ou contagem. O status considera todos os critérios da Central de Metas.</p>' : '<p class="metas-vazio revelar">As metas dos setores estão indisponíveis no momento.</p>') +
      (dados?.avisos?.length ? '<p class="metas-nota">' + dados.avisos.map(esc).join(" ") + '</p>' : "") + '</section>';
  }


  function mensagensParabens(lista){
    return (lista || []).map(m => '<div class="parabens-recado"><div class="parabens-avatar">' + fotoOuInicial(/^https?:\/\//i.test(m.foto || '') ? m.foto : '',m.autor) + '</div><div class="parabens-recado-texto"><b>' + esc(m.autor) + '</b><span>' + esc(m.texto) + '</span></div></div>').join('') || '<small class="parabens-vazio">Seja o primeiro a deixar uma mensagem.</small>';
  }
  function parabensHtml(a){
    return '<div class="parabens-mural"><h2>' + esc(a.titulo || 'Carinho da equipe') + '</h2><div class="parabens-recados" aria-live="polite">' + mensagensParabens(a.mensagens) + '</div><form class="parabens-form" data-destinatario="' + esc(a.id) + '"><input aria-label="Mensagem de aniversário" required maxlength="300" placeholder="Deixe sua mensagem de parabéns..."><button type="submit">Enviar</button><small role="status"></small></form></div>';
  }
  function iniciarParabens(){
    document.querySelectorAll('#portalInicio .parabens-form').forEach(form => form.addEventListener('submit', async function(e){
      e.preventDefault();const input=form.querySelector('input'),botao=form.querySelector('button'),status=form.querySelector('small');
      botao.disabled=true;status.textContent='Enviando...';
      try{
        const sessao=await window.supabaseClient.auth.getSession();const token=sessao.data.session?.access_token;
        const local=/^(localhost|127\.0\.0\.1)$/.test(location.hostname);
        const base=(local && location.port==='3000') ? '/' : /\.vercel\.app$/.test(location.hostname) ? '/' : 'https://easyloc-zeta.vercel.app/';
        const r=await fetch(base+'api/portal-mural',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({destinatario:form.dataset.destinatario,texto:input.value})});
        const j=await r.json();if(!r.ok || !j.ok)throw Error(j.erro || 'Não foi possível enviar.');
        form.previousElementSibling.innerHTML=mensagensParabens(j.resultado);input.value='';status.textContent='Mensagem enviada!';
        if(form.dataset.destinatario==='todos'){if(estado.mural)estado.mural.parabensTodos=j.resultado;}else{const a=estado.mural?.aniversariantes?.find(a=>a.id===form.dataset.destinatario);if(a)a.mensagens=j.resultado;}
      }catch(err){status.textContent=err.message;}finally{botao.disabled=false;}
    }));
  }


  window.abrirAvisoPortal = function(){
    let modal=document.getElementById('novoAvisoPortal');
    if(!modal){
      modal=document.createElement('dialog');modal.id='novoAvisoPortal';
      modal.innerHTML='<form><h2>Novo comunicado</h2><label>Título<input name="titulo" required maxlength="120"></label><label>Mensagem<textarea name="texto" rows="4" maxlength="1200" placeholder="Opcional quando houver foto ou PDF"></textarea></label><label class="aviso-anexo-campo">Foto ou PDF (opcional)<input name="anexo" type="file" accept="image/jpeg,image/png,image/webp,application/pdf"><span class="aviso-anexo-previa" hidden></span></label><label>Válido até (opcional)<input name="validoAte" type="date"></label><fieldset class="aviso-cores"><legend>Cor do comunicado</legend><label><input type="radio" name="cor" value="neutro" checked><span class="aviso-amostra aviso-cor-neutro"></span>Neutro</label><label><input type="radio" name="cor" value="areia" ><span class="aviso-amostra aviso-cor-areia"></span>Areia</label><label><input type="radio" name="cor" value="verde" ><span class="aviso-amostra aviso-cor-verde"></span>Verde</label><label><input type="radio" name="cor" value="azul" ><span class="aviso-amostra aviso-cor-azul"></span>Azul</label><label><input type="radio" name="cor" value="lavanda" ><span class="aviso-amostra aviso-cor-lavanda"></span>Lavanda</label></fieldset><label class="aviso-check"><input name="importante" type="checkbox">Importante</label><label class="aviso-check"><input name="fixado" type="checkbox">Fixar comunicado</label><p role="status"></p><footer><button type="button">Cancelar</button><button type="submit">Publicar</button></footer></form>';
      document.body.appendChild(modal);modal.querySelector('[type=button]').onclick=()=>modal.close();
      modal.querySelector('[name=anexo]').addEventListener('change',function(){const f=this.files[0],pv=modal.querySelector('.aviso-anexo-previa');if(!f){pv.hidden=true;pv.innerHTML='';return;}pv.hidden=false;pv.innerHTML=/^image\//.test(f.type)?'<img alt="" src="'+URL.createObjectURL(f)+'">':'<b>PDF</b> '+esc(f.name);});
      modal.querySelector('form').onsubmit=async function(e){
        e.preventDefault();const f=e.currentTarget,b=f.querySelector('[type=submit]'),status=f.querySelector('[role=status]');
        const arquivo=f.elements.anexo.files[0];
        if(!f.elements.texto.value.trim() && !arquivo){status.textContent='Escreva a mensagem ou anexe uma foto/PDF.';f.elements.texto.focus();return;}
        b.disabled=true;status.textContent='Publicando...';
        try{
          const anexo=arquivo?await subirAnexoAviso(arquivo):null;
          const idsAntes=new Set(((estado.mural&&estado.mural.avisos)||[]).map(a=>a.id));
          const sessao=await window.supabaseClient.auth.getSession();
          const local=/^(localhost|127\.0\.0\.1)$/.test(location.hostname);
          const base=(local && location.port==='3000') ? '/' : /\.vercel\.app$/.test(location.hostname) ? '/' : 'https://easyloc-zeta.vercel.app/';
          const r=await fetch(base+'api/portal-mural',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+sessao.data.session?.access_token},body:JSON.stringify({acao:'aviso',dados:{titulo:f.elements.titulo.value,texto:f.elements.texto.value.trim()||f.elements.titulo.value,validoAte:f.elements.validoAte.value,importante:f.elements.importante.checked,fixado:f.elements.fixado.checked,cor:f.elements.cor.value}})});
          const j=await r.json();if(!j.ok)throw Error(j.erro || 'Falha ao publicar.');
          const novo=Object.assign({},await buscarMural(),{resumoDia:estado.mural?.resumoDia,celebracao:estado.mural?.celebracao});
          if(anexo){const aviso=(novo.avisos||[]).filter(a=>!idsAntes.has(a.id)&&a.titulo===f.elements.titulo.value.trim())[0];if(aviso)await gravarAnexoAviso(aviso.id,anexo);}
          await juntarAnexos(novo);estado.mural=novo;montarMural();
          const pontos=document.querySelectorAll('#portalInicio .hero-ponto');pontos[pontos.length-1]?.click();
          f.reset();const pv=f.querySelector('.aviso-anexo-previa');pv.hidden=true;pv.innerHTML='';status.textContent='';modal.close();
        }catch(err){status.textContent=err.message;}finally{b.disabled=false;}
      };
    }
    modal.showModal();
  };

  function iniciarDetalhesCronograma(){
    document.querySelectorAll('#portalInicio .rd-avatar img').forEach(img=>{img.onerror=()=>img.remove();});
    document.getElementById('rdDetalhesFlutuantes')?.remove();
    const painel=document.createElement('div');painel.id='rdDetalhesFlutuantes';painel.setAttribute('role','tooltip');document.body.appendChild(painel);
    function esconder(){painel.classList.remove('aberto');}
    document.querySelectorAll('#portalInicio .rd-item-detalhes').forEach(item=>{
      function mostrar(){
        painel.innerHTML=item.querySelector('template').innerHTML;
        painel.classList.add('aberto');
        const r=item.getBoundingClientRect(), largura=painel.offsetWidth,altura=painel.offsetHeight;
        let x=r.right+12;if(x+largura>innerWidth-16)x=r.left-largura-12;
        if(x<16)x=Math.max(16,Math.min(innerWidth-largura-16,r.left));
        const y=Math.max(16,Math.min(innerHeight-altura-16,r.top));
        painel.style.left=x+'px';painel.style.top=y+'px';
      }
      item.addEventListener('mouseenter',mostrar);item.addEventListener('mouseleave',esconder);
      item.addEventListener('focus',mostrar);item.addEventListener('blur',esconder);
      item.addEventListener('keydown',e=>{if(e.key==='Escape')esconder();});
    });
    document.getElementById('portalInicio').addEventListener('scroll',esconder,{passive:true,once:true});
  }

  window.alterarCorAviso=async function(select){
    const antigo=estado.mural.avisos.find(a=>a.id===select.dataset.id);select.disabled=true;
    try{
      const sessao=await window.supabaseClient.auth.getSession();
      const local=/^(localhost|127\.0\.0\.1)$/.test(location.hostname);
      const base=(local&&location.port==='3000')?'/':/\.vercel\.app$/.test(location.hostname)?'/':'https://easyloc-zeta.vercel.app/';
      const r=await fetch(base+'api/portal-mural',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+sessao.data.session?.access_token},body:JSON.stringify({acao:'corAviso',dados:{id:select.dataset.id,cor:select.value}})});
      const j=await r.json();if(!j.ok)throw Error(j.erro || 'Falha ao salvar cor.');
      const art=select.closest('article');art.className=art.className.replace(/aviso-cor-\w+/,'aviso-cor-'+select.value);if(antigo)antigo.cor=select.value;
    }catch(err){select.value=antigo?.cor || 'neutro';alert(err.message);}finally{select.disabled=false;}
  };

  /* Anexo dos avisos (nov/2026): foto ou PDF por aviso, no bucket público empresas-logos (<empresa>/avisos/) e
     ligado ao aviso pela tabela portal_avisos_anexos (o aviso em si continua no Mural do Portal). */
  async function empresaAtual(){ const c = window.__CONTEXT || await window.aguardarContexto?.(); return c && c.empresa_id; }
  function imagemMenor(arquivo){
    if(!/^image\/(jpeg|png|webp)$/.test(arquivo.type) || arquivo.size <= 2500000){ return Promise.resolve(arquivo); }
    return new Promise(function(ok){
      const img = new Image(); img.onload = function(){
        const k = Math.min(1, 1800 / Math.max(img.width, img.height)), c = document.createElement("canvas");
        c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        const g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
        c.toBlob(function(b){ ok(b ? new File([b], "aviso.jpg", { type: "image/jpeg" }) : arquivo); }, "image/jpeg", .88);
      }; img.onerror = function(){ ok(arquivo); }; img.src = URL.createObjectURL(arquivo);
    });
  }
  async function subirAnexoAviso(arquivoOriginal){
    const sb = window.supabaseClient, empresa = await empresaAtual();
    if(!/^(image\/(jpeg|png|webp)|application\/pdf)$/.test(arquivoOriginal.type)){ throw Error("Envie uma foto (JPG, PNG ou WebP) ou um PDF."); }
    if(arquivoOriginal.size > 15 * 1024 * 1024){ throw Error("O arquivo passa de 15 MB."); }
    const arquivo = await imagemMenor(arquivoOriginal), pdf = arquivo.type === "application/pdf";
    const ext = pdf ? "pdf" : arquivo.type === "image/png" ? "png" : arquivo.type === "image/webp" ? "webp" : "jpg";
    const path = empresa + "/avisos/" + (crypto.randomUUID ? crypto.randomUUID() : Date.now() + "-" + Math.random().toString(36).slice(2)) + "." + ext;
    const { error } = await sb.storage.from("empresas-logos").upload(path, arquivo, { contentType: arquivo.type, upsert: false });
    if(error){ throw Error("Não foi possível enviar o arquivo: " + error.message); }
    return { path: path, url: sb.storage.from("empresas-logos").getPublicUrl(path).data.publicUrl, tipo: pdf ? "pdf" : "imagem", nome: arquivoOriginal.name || "" };
  }
  async function gravarAnexoAviso(avisoId, anexo){
    const sb = window.supabaseClient, empresa = await empresaAtual();
    const { error } = await sb.from("portal_avisos_anexos").upsert({ empresa_id: empresa, aviso_id: avisoId, url: anexo.url, path: anexo.path, tipo: anexo.tipo, nome: anexo.nome }, { onConflict: "empresa_id,aviso_id" });
    if(error){ throw Error("O aviso foi publicado, mas o anexo não foi gravado: " + error.message); }
  }
  async function juntarAnexos(mural){
    try{
      const sb = window.supabaseClient, empresa = await empresaAtual();
      if(!mural || !(mural.avisos || []).length || !sb || !sb.from || !empresa){ return mural; }
      const { data } = await sb.from("portal_avisos_anexos").select("aviso_id,url,tipo,nome").eq("empresa_id", empresa).in("aviso_id", mural.avisos.map(function(a){ return a.id; }));
      const mapa = {}; (data || []).forEach(function(x){ mapa[x.aviso_id] = x; });
      mural.avisos.forEach(function(a){ a.anexo = mapa[a.id] || null; });
    }catch(e){ console.warn("[Avisos] anexos não carregaram:", e); }
    return mural;
  }
  window.anexarAvisoPortal = function(id){
    const input = document.createElement("input"); input.type = "file"; input.accept = "image/jpeg,image/png,image/webp,application/pdf";
    input.onchange = async function(){
      const arquivo = input.files[0]; if(!arquivo){ return; }
      try{ const anexo = await subirAnexoAviso(arquivo); await gravarAnexoAviso(id, anexo); const a = ((estado.mural || {}).avisos || []).find(function(x){ return x.id === id; }); if(a){ a.anexo = anexo; } montarMural(); const pontos = document.querySelectorAll('#portalInicio .hero-ponto'); const i = Array.from(document.querySelectorAll('#portalInicio .hero-slide')).findIndex(function(sl){ return sl.querySelector('[data-aviso="' + id + '"]'); }); if(i >= 0 && pontos[i]){ pontos[i].click(); } }
      catch(e){ (window.alerta || alert)(e.message, "Quadro de avisos", "erro"); }
    };
    input.click();
  };
  window.abrirAnexoAviso = function(id){
    const a = ((estado.mural || {}).avisos || []).find(function(x){ return x.id === id; });
    if(a && a.anexo && a.anexo.tipo === "imagem"){ abrirLuz(a.anexo.url, a.titulo); }
  };

  /* Ideia Premiada na Início (nov/2026): por N dias depois de uma ideia ser premiada (Parâmetros > Recursos
     humanos), o 1º destaque vira uma celebração no lugar do convite "Quero participar". */
  /* Quadro de avisos (nov/2026, mesmo estilo do banner da premiação): um aviso em destaque por vez (ícone com
     anéis de luz, título grande, texto) e a lista dos avisos ao lado, trocando sozinho com uma barra dourada.
     O carrossel fica no slide o tempo de passar por todos (7s por aviso, até 6: data-duracao). */
  const AV_CORES = [['neutro','Neutro'],['areia','Areia'],['verde','Verde'],['azul','Azul'],['lavanda','Lavanda']];
  const AV_MS = 7000;
  let encerrarAvisos = null;
  function avisoData(d){ return String(d || '').slice(0,10).split('-').reverse().join('/'); }
  function avisosSlideHtml(avisos){
    // Quadro de avisos de verdade (nov/2026): cortiça com moldura de madeira e os avisos como papéis presos com
    // alfinete, cada um levemente torto; entram caindo no quadro um por um e balançam de leve.
    const GIRO = [-2.2, 1.6, -1.1, 2.4, -1.7, 1.2];
    const cor = function(a){ return AV_CORES.some(function(c){ return c[0] === a.cor; }) ? a.cor : 'neutro'; };
    const notas = avisos.map(function(a, i){
      const imp = a.prioridade === 'IMPORTANTE';
      const ax = a.anexo, foto = ax && ax.tipo === 'imagem', pdf = ax && ax.tipo === 'pdf';
      const soTitulo = String(a.texto || '').trim() === String(a.titulo || '').trim();
      return '<article class="qa-nota aviso-cor-' + cor(a) + (imp ? ' is-importante' : '') + (foto ? ' com-foto' : '') + (pdf ? ' com-pdf' : '') + '" data-aviso="' + esc(a.id) + '" style="--i:' + i + ';--r:' + GIRO[i % 6] + 'deg">' +
        '<span class="qa-pino" aria-hidden="true"></span>' +
        (foto ? '<button type="button" class="qa-foto" onclick="abrirAnexoAviso(\'' + esc(a.id) + '\')" aria-label="Ampliar a foto do aviso"><img src="' + esc(ax.url) + '" alt="' + esc(a.titulo) + '" loading="eager"></button>' : '') +
        '<div class="qa-topo"><span class="qa-selo">' + (imp ? 'Importante' : 'Comunicado') + (a.fixado ? ' · Fixado' : '') + '</span><time>' + esc(avisoData(a.publicadoEm)) + '</time></div>' +
        '<h2>' + esc(a.titulo) + '</h2>' + (soTitulo ? '' : '<div class="qa-texto" tabindex="0">' + esc(a.texto || '') + '</div>') +
        (pdf ? '<a class="qa-pdf" href="' + esc(ax.url) + '" target="_blank" rel="noopener"><i data-lucide="file-text" aria-hidden="true"></i>Abrir PDF</a>' : '') +
        '<button type="button" class="qa-anexar" onclick="anexarAvisoPortal(\'' + esc(a.id) + '\')"><i data-lucide="paperclip" aria-hidden="true"></i>' + (ax ? 'Trocar anexo' : 'Anexar foto') + '</button>' +
        
        '<select class="aviso-cor-seletor" aria-label="Cor do papel" data-id="' + esc(a.id) + '" onchange="alterarCorAviso(this)">' + AV_CORES.map(function(c){ return '<option value="' + c[0] + '"' + (c[0] === cor(a) ? ' selected' : '') + '>' + c[1] + '</option>'; }).join('') + '</select></article>';
    });
    if(avisos.length < 6){
      notas.push('<button type="button" class="qa-nota qa-nova' + (avisos.length ? '' : ' is-sozinha') + '" style="--i:' + avisos.length + ';--r:' + GIRO[avisos.length % 6] + 'deg" onclick="abrirAvisoPortal()"><span class="qa-pino" aria-hidden="true"></span><i data-lucide="plus" aria-hidden="true"></i><b class="qa-nova-titulo">' + (avisos.length ? 'Novo comunicado' : 'Nenhum comunicado por enquanto') + '</b><small>Clique para publicar um aviso.</small></button>');
    }
    return '<div class="hero-conteudo hero-slide hero-aviso" role="group" aria-roledescription="slide" aria-label="Quadro de avisos" aria-hidden="true" inert data-duracao="12000">' +
      '<div class="qa-quadro"><div class="qa-placa">Quadro de avisos</div><div class="qa-cortica"><div class="qa-notas" data-qtd="' + notas.length + '">' + notas.join('') + '</div></div></div></div>';
  }
  function iniciarAvisos(){
    if(encerrarAvisos){ encerrarAvisos(); encerrarAvisos = null; }
    const hero = document.querySelector('#portalInicio .hero'), slide = hero && hero.querySelector('.hero-aviso');
    if(!slide || !slide.querySelector('.av-item')) return;
    const itens = slide.querySelectorAll('.av-item'), linhas = slide.querySelectorAll('.av-linha');
    let atual = 0, inicio = Date.now();
    function ir(n){
      atual = (n + itens.length) % itens.length; inicio = Date.now();
      itens.forEach(function(it, i){ const on = i === atual; it.hidden = !on; it.classList.toggle('ativo', on); it.classList.remove('entrando'); if(on){ void it.offsetWidth; it.classList.add('entrando'); } });
      linhas.forEach(function(l, i){ l.classList.toggle('ativo', i === atual); const p = l.querySelector('.av-progresso'); if(p){ p.style.animation = 'none'; void p.offsetWidth; p.style.animation = ''; } });
    }
    linhas.forEach(function(l){ l.addEventListener('click', function(){ ir(Number(l.dataset.avIr)); }); });
    hero.addEventListener('hero-slide-change', function(){ if(slide.classList.contains('ativo')) ir(0); });
    const timer = setInterval(function(){
      const parado = /Retomar/.test((hero.querySelector('.hero-pausa') || {}).textContent || '') || slide.matches(':hover, :focus-within');
      slide.classList.toggle('av-pausado', parado);
      if(!slide.classList.contains('ativo') || parado || document.hidden){ inicio = Date.now() - Math.min(Date.now() - inicio, AV_MS - 300); return; }
      if(Date.now() - inicio >= AV_MS) ir(atual + 1);
    }, 250);
    encerrarAvisos = function(){ clearInterval(timer); };
  }

  function celebracaoFundoHtml(){
    const confetes = Array.from({length:28}, function(_, i){
      return '<span class="cel-confete" style="--x:' + ((i*37)%100) + '%;--d:' + (6 + (i%5)*1.3).toFixed(1) + 's;--a:-' + ((i*0.73)%9).toFixed(1) + 's;--r:' + ((i*53)%360) + 'deg" data-c="' + (i%4) + '"></span>';
    }).join('');
    return '<div class="hero-img hero-celebracao-fundo"><div class="cel-raios" aria-hidden="true"></div><div class="cel-trofeu" aria-hidden="true"><i data-lucide="trophy"></i></div><div class="cel-confetes" aria-hidden="true">' + confetes + '</div></div>';
  }
  function celebracaoHtml(ideias){
    const principal = ideias[0], outras = ideias.slice(1);
    const foto = estado.fotosAutores && estado.fotosAutores[principal.autor_id];
    const inicial = esc(String(principal.autor || "?").charAt(0).toUpperCase());
    return '<div class="hero-conteudo hero-slide hero-convite hero-celebracao ativo" role="group" aria-roledescription="slide" aria-label="Ideia premiada">' +
      '<div class="cel-grade"><span class="cel-autor-foto" data-inicial="' + inicial + '">' + (foto ? '<img src="' + esc(foto) + '" alt="Foto de ' + esc(principal.autor) + '" loading="eager" onerror="this.parentNode.textContent=this.parentNode.dataset.inicial">' : inicial) + '</span>' +
      '<div class="cel-texto"><div class="hero-data">Ideia Premiada · Parabéns!</div>' +
      '<div class="cel-autor"><small>Ideia escolhida de</small> <b>' + esc(principal.autor) + '</b>' + (principal.area ? ' <em>· ' + esc(principal.area) + '</em>' : '') + '</div>' +
      '<h1>“' + esc(principal.titulo) + '”</h1>' +
      (principal.proposta ? '<p>' + esc(principal.proposta) + '</p>' : '') +
      '<div class="cel-rodape">' + (principal.premio ? '<div class="cel-premio"><i data-lucide="gift"></i><span>Premiação</span><b>' + esc(principal.premio) + '</b></div>' : '') +
      '<button class="atalho atalho-ideia" type="button" onclick="shellNavigate(\'Modulos/RH/IdeiaPremiada/ideia-premiada.html\')"><i data-lucide="lightbulb"></i>Envie a sua ideia<i data-lucide="arrow-up-right"></i></button></div>' +
      (outras.length ? '<div class="cel-outras">Também premiadas: ' + outras.map(function(o){ return '<b>' + esc(o.titulo) + '</b> (' + esc(o.autor) + ')'; }).join(' · ') + '</div>' : '') +
      '</div></div></div>';
  }
  async function buscarCelebracao(){
    const sb = window.supabaseClient; if(!sb){ return null; }
    const contexto = window.__CONTEXT || await window.aguardarContexto?.(); const empresa = contexto && contexto.empresa_id;
    if(!empresa){ return null; }
    const { data, error } = await sb.rpc("ideias_premiadas_celebracao", { p_empresa: empresa });
    if(error){ throw error; }
    estado.fotosAutores = estado.fotosAutores || {};
    // Foto de quem ganhou: 1º a do Cadastro de Funcionários (bucket privado, link assinado), senão a de "Minha conta".
    const carrega = function(url){ return url ? new Promise(function(res){ const img = new Image(); img.onload = function(){ res(true); }; img.onerror = function(){ res(false); }; img.src = url; }) : Promise.resolve(false); };
    // Uma busca por pessoa (a mesma pessoa pode ter várias ideias premiadas; buscas em paralelo se apagavam).
    const autores = {};
    ((data && data.ideias) || []).forEach(function(i){ if(i.autor_id){ autores[i.autor_id] = autores[i.autor_id] || i.foto_url || ""; } });
    await Promise.all(Object.keys(autores).map(async function(id){
      if(estado.fotosAutores[id] || !sb.storage){ return; }
      const foto = autores[id];
      let url = null;
      if(foto){
        if(/^https?:\/\//i.test(foto)){ url = foto; }
        else { try{ const r = await sb.storage.from("funcionarios-fotos").createSignedUrl(foto, 3600); url = r && r.data && r.data.signedUrl; }catch(_){ url = null; } }
        if(!(await carrega(url))){ url = null; }
      }
      if(!url){ try{ const avatar = sb.storage.from("avatares").getPublicUrl(empresa + "/" + id + ".jpg").data.publicUrl; url = (await carrega(avatar)) ? avatar : null; }catch(_){ url = null; } }
      estado.fotosAutores[id] = url;
    }));
    return data;
  }

  function montarMural(){
    const m = estado.mural || {};
    const aniversariantesHero = (m.aniversariantes || []).slice().sort((a,b) => Number(Boolean(b.hoje))-Number(Boolean(a.hoje)) || Number(a.dia)-Number(b.dia));
    const avisosHero = (m.avisos || []).slice().sort((a,b) => Number(Boolean(b.fixado))-Number(Boolean(a.fixado)));
    const paginasAvisos = []; // nov/2026: um quadro de cortiça por página, até 6 papéis
    for(let i = 0; i < avisosHero.length; i += 6) paginasAvisos.push(avisosHero.slice(i, i + 6));
    if(!paginasAvisos.length) paginasAvisos.push([]);
    const celebracao = (m.celebracao && (m.celebracao.ideias || []).length) ? m.celebracao.ideias : null;
    const fotosHero = [null].concat(aniversariantesHero.length ? [null] : [], paginasAvisos.map(() => null), m.numeros ? [null] : []);
    let html =
      '<header class="hero" aria-label="Destaques do portal" aria-roledescription="carrossel">' +
        '<div class="hero-foto" id="heroFoto">' + fotosHero.map((foto, i) => foto ? '<div class="hero-img' + (i === 0 ? ' ativo' : '') + '" style="background-image:url(\'' + esc(foto) + '\')"></div>' : i === 0 ? (celebracao ? celebracaoFundoHtml() : '<div class="hero-img hero-ideia"><div class="hero-ideia-simbolo" aria-hidden="true"><i data-lucide="lightbulb"></i></div></div>') : m.numeros && i === fotosHero.length-1 ? '<div class="hero-img hero-numeros-fundo"></div>' : i === 1 && aniversariantesHero.length ? '<div class="hero-img hero-festa-fundo"></div>' : '<div class="hero-img hero-aviso-fundo"><span class="av-luz av-luz-1" aria-hidden="true"></span><span class="av-luz av-luz-2" aria-hidden="true"></span><span class="av-luz av-luz-3" aria-hidden="true"></span></div>').join('') + '<div class="hero-sombra"></div></div>' +
        (aniversariantesHero.length ? '<canvas id="fogos" class="hero-fogos" aria-hidden="true"></canvas>' : '') +
        '<div class="hero-saudacao revelar visivel"><span class="hero-data-dia">' + esc(dataLonga()) + '</span><span class="hero-rotulo-avisos">Quadro de avisos</span></div>' +
        (celebracao ? celebracaoHtml(celebracao) :
        '<div class="hero-conteudo hero-slide hero-convite ativo" role="group" aria-roledescription="slide" aria-label="Participe da Ideia Premiada">' +
          '<div class="hero-data">Ideia Premiada · Sua visão faz a diferença</div><h1>A próxima melhoria<br>pode começar com você.</h1><p>Uma solução mais simples. Um cuidado com a equipe. Um novo jeito de fazer. Compartilhe sua ideia e ajude a Chiavari a evoluir.</p>' +
          '<div class="hero-atalhos"><button class="atalho atalho-ideia" type="button" onclick="shellNavigate(\'Modulos/RH/IdeiaPremiada/ideia-premiada.html\')"><i data-lucide="lightbulb"></i>Quero participar<i data-lucide="arrow-up-right"></i></button></div></div>') +
        (aniversariantesHero.length ? '<div class="hero-conteudo hero-slide hero-aniversario hero-aniversarios" role="group" aria-roledescription="slide" aria-label="Aniversariantes de ' + MESES[new Date().getMonth()] + '" aria-hidden="true" inert><div class="hero-aniversario-texto"><div class="hero-data">Aniversariantes de ' + MESES[new Date().getMonth()] + '</div><h1>Parabéns,<br>' + (aniversariantesHero.length === 1 ? esc(aniversariantesHero[0].nome) : 'aniversariantes') + '!</h1><p>Que o novo ano venha cheio de conquistas. É uma alegria ter vocês na nossa equipe.</p><div class="aniver-lista">' + aniversariantesHero.map(a => '<div class="aniver-pessoa' + (a.hoje ? ' is-hoje' : '') + '"><span class="aniver-pessoa-foto">' + fotoOuInicial(a.foto,a.nome) + '</span><b>' + esc(a.nome) + '</b><small>' + (a.hoje ? 'Hoje!' : 'Dia ' + esc(a.dia)) + (a.setor && !/^sem setor$/i.test(a.setor) ? ' · ' + esc(a.setor) : '') + '</small></div>').join('') + '</div></div>' + parabensHtml({ id: 'todos', titulo: aniversariantesHero.length === 1 ? 'Carinho da equipe' : 'Carinho para todos', mensagens: m.parabensTodos || aniversariantesHero.flatMap(a => a.mensagens || []) }) + '</div>' : '') +
        paginasAvisos.map(avisosSlideHtml).join('') +
        (m.numeros ? '<div class="hero-conteudo hero-slide hero-numeros" role="group" aria-roledescription="slide" aria-label="Nossos últimos números" aria-hidden="true" inert><div class="hero-numeros-texto"><div class="hero-data">' + esc(mesCurto(m.numeros.mes)) + ' &middot; Em equipe, vamos mais longe</div><h1>Nossos últimos números.</h1><p>Cada entrega é uma conquista de todos nós.</p><div class="hero-numeros-indicadores">' + [['eventos','Eventos'],['montagens','Montagens'],['desmontagens','Desmontagens']].map(n=>'<div><b data-contar="' + Math.max(0,Number(m.numeros[n[0]]) || 0) + '">0</b><span>' + n[1] + '</span></div>').join('') + '</div></div></div>' : '') +
        (m.numeros ? '<div class="hero-subida" aria-hidden="true"><svg viewBox="0 0 420 300" preserveAspectRatio="xMidYMid meet"><defs><linearGradient id="subidaBarra" x1="0" y1="1" x2="0" y2="0"><stop stop-color="#b08d57" stop-opacity=".05"/><stop offset="1" stop-color="#b08d57" stop-opacity=".32"/></linearGradient><linearGradient id="subidaLinha" x1="0" y1="1" x2="1" y2="0"><stop stop-color="#c9a24f" stop-opacity=".35"/><stop offset="1" stop-color="#9b793f"/></linearGradient><radialGradient id="subidaLuz"><stop stop-color="#e9cf9f" stop-opacity=".9"/><stop offset="1" stop-color="#e9cf9f" stop-opacity="0"/></radialGradient></defs><g class="subida-grade"><line x1="20" y1="260" x2="400" y2="260"/><line x1="20" y1="200" x2="400" y2="200"/><line x1="20" y1="140" x2="400" y2="140"/><line x1="20" y1="80" x2="400" y2="80"/></g><rect class="subida-barra" style="--i:0" x="38" y="220" width="28" height="40" rx="3"/><rect class="subida-barra" style="--i:1" x="98" y="190" width="28" height="70" rx="3"/><rect class="subida-barra" style="--i:2" x="158" y="164" width="28" height="96" rx="3"/><rect class="subida-barra" style="--i:3" x="218" y="122" width="28" height="138" rx="3"/><rect class="subida-barra" style="--i:4" x="278" y="84" width="28" height="176" rx="3"/><rect class="subida-barra" style="--i:5" x="338" y="38" width="28" height="222" rx="3"/><path class="subida-area" d="M30 238 C 110 225, 150 200, 200 160 S 300 70, 372 34 L372 260 L30 260 Z"/><path class="subida-linha" pathLength="1" d="M30 238 C 110 225, 150 200, 200 160 S 300 70, 372 34"/><path class="subida-seta" d="M356 30 L374 33 L366 49"/><circle class="subida-luz" cx="372" cy="34" r="30"/><circle class="subida-anel" cx="372" cy="34" r="6"/><circle class="subida-ponto" cx="372" cy="34" r="4.5"/></svg><span class="subida-traco" style="--i:0"></span><span class="subida-traco" style="--i:1"></span><span class="subida-traco" style="--i:2"></span></div>' : '') +
        '<div class="hero-controles"><button class="hero-anterior" type="button" aria-label="Destaque anterior">‹</button><div class="hero-pontos">' + fotosHero.map((_, i) => '<button class="hero-ponto" type="button" aria-label="Ir para destaque ' + (i + 1) + '" aria-pressed="' + (i === 0) + '"></button>').join('') + '</div><button class="hero-proximo" type="button" aria-label="Próximo destaque">›</button><button class="hero-pausa" type="button">Pausar</button></div>' +
        '<div class="rolar" aria-hidden="true"></div>' +
      '</header>';

    // Resumo do dia (out/2026): etapas do Cronograma de hoje + agenda interna (api/portal-mural.js → PORTAL_resumoDia_)
    html += resumoDiaHtml(m.resumoDia);
    html += metasSetoresHtml(m.metasSetores);

    // Reconhecimentos e premiações (sem valores)
    if((m.reconhecimentos || []).length){
      html += '<section class="secao cheia" id="reconhecimentos">' + cabecalho("Reconhecimentos", "Quem está fazendo a diferença", "Premiações conquistadas pela nossa equipe.") +
        '<div class="fila revelar" id="fila">' + m.reconhecimentos.map(function(r, i){
          return '<figure class="premio" data-i="' + i + '" onclick="cliqueFila(' + i + ', \'' + esc(r.foto) + '\', \'' + esc(String(r.nome).replace(/'/g, "")) + '\')">' +
            (r.foto ? '<img src="' + esc(r.foto) + '" alt="" loading="lazy">' : "") +
            '<figcaption class="premio-texto"><small>' + esc(r.origem === "RH" ? "Reconhecimento" : "Premiação") + '</small>' +
              '<b>' + esc(r.nome) + '</b>' + (r.titulo ? '<span>' + esc(r.titulo) + '</span>' : "") +
              (r.texto ? '<span>' + esc(r.texto) + '</span>' : "") + (r.data ? '<em>' + esc(mesCurto(r.data)) + '</em>' : "") +
            '</figcaption></figure>';
        }).join("") + '</div>' +
        (m.reconhecimentos.length > 1
          ? '<div class="fila-controles"><button class="seta" type="button" onclick="moverFila(-1)" aria-label="Anterior"><i data-lucide="chevron-left"></i></button>' +
            '<div class="pontos">' + m.reconhecimentos.map(function(r, i){ return '<i onclick="irFila(' + i + ')"></i>'; }).join("") + '</div>' +
            '<button class="seta" type="button" onclick="moverFila(1)" aria-label="Próxima"><i data-lucide="chevron-right"></i></button></div>'
          : "") +
        '</section>';
    }

    // Boas-vindas
    if((m.novos || []).length){
      html += '<section class="secao">' + cabecalho("Boas-vindas", "Quem chegou na equipe", "") +
        '<div class="novos">' + m.novos.map(function(n, i){
          return '<div class="novo revelar" style="--atraso:' + (i % 4) * 0.08 + 's"><div class="aniver-foto">' + fotoOuInicial(n.foto, n.nome) + '</div><div><b>' + esc(n.nome) + '</b><small>' + esc(n.setor || "Seja bem-vindo!") + '</small></div></div>';
        }).join("") + '</div></section>';
    }

    html += '<footer class="rodape"><b>Chiavari</b><span>Portal Interno · uso exclusivo da equipe</span></footer>';

    document.getElementById("portalInicio").innerHTML = html;
    icones();
    iniciarAnimacoes();
    iniciarFila();
    iniciarHero();
    iniciarAvisos();
    iniciarDetalhesCronograma();
    iniciarParabens();
    iniciarFogos();
  }

  /* Fogos de artifício no espaço dos aniversariantes (só rodam quando estão na tela) */
  const fogos = { rodando: false, visivel: false, particulas: [], foguetes: [], proximo: 0 };

  function iniciarFogos(){
    encerrarFogos?.();
    fogos.rodando = false; fogos.visivel = false; fogos.particulas = []; fogos.foguetes = []; fogos.proximo = 0;
    const canvas = document.getElementById("fogos");
    if(!canvas){ return; }
    if(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches){ return; }
    const ctx = canvas.getContext("2d");
    const hero = canvas.closest(".hero");
    let emTela = false, frame = null;
    const CORES = ["#b08d57", "#c9a24f", "#d9677a", '#656565', "#3f9a63", '#656565', "#e08a3c"];

    function ajustar(){
      const r = canvas.getBoundingClientRect(), d = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = r.width * d; canvas.height = r.height * d;
      ctx.setTransform(d, 0, 0, d, 0, 0);
    }
    ajustar();
    window.addEventListener("resize", ajustar);

    function lancar(){
      const r = canvas.getBoundingClientRect();
      fogos.foguetes.push({
        x: r.width * (.12 + Math.random() * .76), y: r.height + 10,
        alvo: r.height * (.12 + Math.random() * .35), vy: -(6 + Math.random() * 3),
        cor: CORES[Math.floor(Math.random() * CORES.length)]
      });
    }

    function explodir(f){
      const n = 30 + Math.floor(Math.random() * 18);
      const forca = 2.2 + Math.random() * 1.8;
      for(let i = 0; i < n; i++){
        const ang = (Math.PI * 2 * i) / n, v = forca * (.55 + Math.random() * .45);
        fogos.particulas.push({ x: f.x, y: f.y, vx: Math.cos(ang) * v, vy: Math.sin(ang) * v, vida: 1, cor: f.cor, brilho: Math.random() < .3 });
      }
    }

    function quadro(t){
      if(!fogos.visivel || !canvas.isConnected || document.hidden || !document.body.classList.contains("portal-em-inicio")){ fogos.rodando = false; return; }
      const r = canvas.getBoundingClientRect();
      ctx.globalCompositeOperation = "destination-out";
      ctx.fillStyle = "rgba(0,0,0,.18)";
      ctx.fillRect(0, 0, r.width, r.height);
      ctx.globalCompositeOperation = "source-over";

      if(t > fogos.proximo){ lancar(); fogos.proximo = t + 1800 + Math.random() * 1400; }

      fogos.foguetes = fogos.foguetes.filter(function(f){
        f.y += f.vy; f.vy *= .985;
        ctx.fillStyle = f.cor; ctx.beginPath(); ctx.arc(f.x, f.y, 1.6, 0, Math.PI * 2); ctx.fill();
        if(f.y <= f.alvo || f.vy > -1.2){ explodir(f); return false; }
        return true;
      });

      fogos.particulas = fogos.particulas.filter(function(p){
        p.x += p.vx; p.y += p.vy; p.vx *= .975; p.vy = p.vy * .975 + .035; p.vida -= .011;
        if(p.vida <= 0){ return false; }
        ctx.globalAlpha = Math.max(0, p.vida) * (p.brilho && Math.random() < .3 ? .4 : 1);
        ctx.fillStyle = p.cor; ctx.beginPath(); ctx.arc(p.x, p.y, 2.1, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
        return true;
      });
      frame = requestAnimationFrame(quadro);
    }

    function sincronizar(){
      fogos.visivel = emTela && Boolean(hero.querySelector(".hero-aniversario.ativo")) && !document.hidden;
      if(fogos.visivel && !fogos.rodando){ fogos.rodando = true; ajustar(); frame = requestAnimationFrame(quadro); }
    }
    const observador = new IntersectionObserver(function(e){
      emTela = e[0].isIntersecting; sincronizar();
    }, { root: document.getElementById("portalInicio"), threshold: 0.05 });
    observador.observe(canvas);
    hero.addEventListener("hero-slide-change", sincronizar);
    document.addEventListener("visibilitychange", sincronizar);
    encerrarFogos = () => {
      observador.disconnect(); cancelAnimationFrame(frame);
      window.removeEventListener("resize", ajustar);
      hero.removeEventListener("hero-slide-change", sincronizar);
      document.removeEventListener("visibilitychange", sincronizar);
    };
  }

  /* Fila de reconhecimentos: troca sozinha a cada 5s, pausa com o mouse em cima */
  const fila = { atual: 0, timer: null };

  function posicionarFila(){
    const cartoes = document.querySelectorAll("#fila .premio");
    const n = cartoes.length;
    if(!n) return;
    const larguraFila = document.getElementById("fila")?.clientWidth || window.innerWidth;
    const larguraCartao = cartoes[0]?.offsetWidth || 300;
    // Mostra até cinco premiações em telas largas, preservando as fotos verticais.
    const raio = larguraFila >= larguraCartao * 4 ? 2 : 1;
    const passo = window.innerWidth < 860 ? 88 : Math.max(88, Math.min(135, ((larguraFila - larguraCartao) / (2 * raio * larguraCartao)) * 100));
    const posicoes = Array.from(cartoes, function(c, i){
      let d = ((i - fila.atual) % n + n) % n;
      if(d > n / 2){ d -= n; }
      const dist = Math.abs(d);
      const escala = dist === 0 ? 1 : dist === 1 ? .94 : .88;
      return { d, dist, escala };
    });
    const visiveis = posicoes.filter(p => p.dist <= raio);
    const esquerda = Math.min(...visiveis.map(p => (p.d * passo / 100 - p.escala / 2) * larguraCartao));
    const direita = Math.max(...visiveis.map(p => (p.d * passo / 100 + p.escala / 2) * larguraCartao));
    const ajusteCentro = -(esquerda + direita) / 2;
    cartoes.forEach(function(c, i){
      const { d, dist, escala } = posicoes[i];
      c.classList.toggle("centro", d === 0);
      c.style.transform = "translateX(calc(-50% + " + (d * passo) + "% + " + ajusteCentro + "px)) scale(" + escala + ")";
      c.style.opacity = dist > raio ? 0 : 1;
      c.style.filter = dist === 0 ? "none" : "brightness(.85) saturate(.95)";
      c.style.zIndex = 10 - dist;
      c.style.pointerEvents = dist > raio ? "none" : "";
    });
    document.querySelectorAll(".pontos i").forEach(function(p, i){ p.classList.toggle("ativo", i === fila.atual); });
  }

  function irFila(i){
    const n = document.querySelectorAll("#fila .premio").length;
    if(!n){ return; }
    fila.atual = ((i % n) + n) % n;
    posicionarFila();
    reiniciarFila();
  }
  function moverFila(d){ irFila(fila.atual + d); }

  function cliqueFila(i, foto, nome){
    if(i === fila.atual){ abrirLuz(foto, nome); } else { irFila(i); }
  }

  function reiniciarFila(){
    clearInterval(fila.timer);
    if(document.querySelectorAll("#fila .premio").length > 1){
      fila.timer = setInterval(function(){ if(!fila.pausada){ moverFila(1); } }, 5000);
    }
  }

  function iniciarFila(){
    const el = document.getElementById("fila");
    if(!el){ return; }
    fila.atual = 0;
    el.addEventListener("mouseenter", function(){ fila.pausada = true; });
    el.addEventListener("mouseleave", function(){ fila.pausada = false; });
    let x0 = null;
    el.addEventListener("touchstart", function(e){ x0 = e.touches[0].clientX; }, { passive: true });
    el.addEventListener("touchend", function(e){
      if(x0 === null){ return; }
      const dx = e.changedTouches[0].clientX - x0;
      if(Math.abs(dx) > 40){ moverFila(dx < 0 ? 1 : -1); }
      x0 = null;
    });
    if(!fila.ouvindo){ fila.ouvindo = true; window.addEventListener("resize", posicionarFila); }
    posicionarFila();
    reiniciarFila();
  }

  /* Animações: revelar ao rolar, contadores e leve parallax na capa */
  function iniciarAnimacoes(){
    encerrarMovimento?.();
    const area = document.getElementById("portalInicio");
    const movimentoReduzido = window.matchMedia("(prefers-reduced-motion: reduce)");
    const observador = new IntersectionObserver(function(entradas){
      entradas.forEach(function(e){
        if(!e.isIntersecting){
          if(!movimentoReduzido.matches) e.target.classList.remove("visivel");
          return;
        }
        e.target.classList.add("visivel");
        if(e.target.dataset.animado) return;
        e.target.dataset.animado = "1";
        e.target.querySelectorAll("[data-contar]").forEach(contar);
        const voo = e.target.querySelector("#voo");
        if(voo && voo.beginElement){ setTimeout(function(){ try{ voo.beginElement(); }catch(err){} }, 200); }
      });
    }, { root: area, threshold: 0 });
    area.querySelectorAll(".secao .revelar").forEach(function(el){ observador.observe(el); });

    const blocos = Array.from(area.querySelectorAll(".secao > .secao-topo, .secao > .rd-grade, .secao > .fila, .secao > .metas-dashboard"));
    blocos.forEach(el => el.classList.add("portal-movimento"));
    let quadro = null;
    function atualizar(){
      quadro = null;
      const capa = document.getElementById("heroFoto");
      if(capa) capa.style.transform = movimentoReduzido.matches ? "none" : "translateY(" + Math.min(area.scrollTop * 0.22, 140) + "px)";
      const altura = area.clientHeight;
      const topo = area.getBoundingClientRect().top;
      blocos.forEach(el => {
        const rect = el.closest(".secao").getBoundingClientRect();
        const progresso = Math.max(-1, Math.min(1, (rect.top - topo - altura * .35) / altura));
        const deslocamento = movimentoReduzido.matches ? 0 : progresso * (el.classList.contains("secao-topo") ? 14 : -10);
        el.style.setProperty("--portal-deslocamento", deslocamento.toFixed(2) + "px");
      });
    }
    function agendar(){ if(quadro === null) quadro = requestAnimationFrame(atualizar); }
    area.addEventListener("scroll", agendar, { passive:true });
    window.addEventListener("resize", agendar);
    movimentoReduzido.addEventListener("change", agendar);
    atualizar();
    encerrarMovimento = () => {
      observador.disconnect();
      area.removeEventListener("scroll", agendar);
      window.removeEventListener("resize", agendar);
      movimentoReduzido.removeEventListener("change", agendar);
      if(quadro !== null) cancelAnimationFrame(quadro);
    };
  }

  function contar(el){
    const alvo = Number(el.dataset.contar) || 0;
    const inicio = performance.now();
    const dur = 1400;
    function passo(t){
      const p = Math.min(1, (t - inicio) / dur);
      el.textContent = Math.round(alvo * (1 - Math.pow(1 - p, 3)));
      if(p < 1){ requestAnimationFrame(passo); }
    }
    requestAnimationFrame(passo);
  }

  function abrirLuz(foto, texto){
    if(!foto){ return; }
    document.getElementById("luzImg").src = foto.replace(/sz=w\d+/, "sz=w2000");
    document.getElementById("luzTexto").textContent = texto || "";
    document.getElementById("luz").classList.add("ver");
  }
  function fecharLuz(){ document.getElementById("luz").classList.remove("ver"); }

  document.addEventListener("keydown", function(e){ if(e.key === "Escape"){ fecharLuz(); } });

  /* ---------- carregar dados ---------- */
  async function buscarMural(){
    const sessao = await window.supabaseClient?.auth.getSession();
    const token = sessao?.data?.session?.access_token;
    if(!token){ return null; }
    // O servidor só existe na Vercel; aberto em outro lugar (GitHub Pages) chama a Vercel direto.
    const local = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
    const servidor = (local && location.port === "3000") ? "/" : /\.vercel\.app$/i.test(location.hostname) ? "/" : "https://easyloc-zeta.vercel.app/";
    const r = await fetch(servidor + "api/portal-mural", { headers: { Authorization: "Bearer " + token } });
    if(!r.ok){ return null; }
    const j = await r.json().catch(function(){ return null; });
    return j && j.ok ? j.resultado : null;
  }

  /* Resumo do dia lido direto do Supabase (out/2026): das tabelas da operação (operacao_etapas,
     pessoas, caminhões e operacao_agenda) pela função operacao_resumo_dia — toda a equipe vê,
     só leitura. Antes vinha da planilha do Cronograma. */
  const RESUMO_ORDEM = ["Triagem (Separação)", "Carregamento", "Montagem", "Desmontagem", "Descarregamento", "Triagem (Conferência)"];
  async function detalhesResumoDia(sb,etapas){
    const fotos={},locais=new Map();
    const carregarPessoas=async()=>{
      const r=await sb.rpc('operacao_pessoas');if(r.error)return;
      const pessoas=r.data||[],paths=[...new Set(pessoas.filter(p=>!p.free&&p.foto_url&&!/^https?:\/\//i.test(p.foto_url)).map(p=>p.foto_url))];
      const assinadas=new Map();
      if(paths.length&&sb.storage)for(let i=0;i<paths.length;i+=100){const lote=await sb.storage.from('funcionarios-fotos').createSignedUrls(paths.slice(i,i+100),3600);if(!lote.error)(lote.data||[]).forEach(f=>{if(f.signedUrl)assinadas.set(f.path,f.signedUrl);});}
      pessoas.forEach(p=>{const url=assinadas.get(p.foto_url)||p.foto_url;if(/^https?:\/\//i.test(url||''))fotos[p.nome]=url;});
    };
    const carregarEnderecos=async()=>{
      const contexto=window.__CONTEXT||await window.aguardarContexto?.(),empresa=contexto?.empresa_id;
      const numeros=[...new Set(etapas.map(e=>e.pedido).filter(Boolean))];if(!empresa||!numeros.length||!sb.from)return;
      const pedidos=[];for(let i=0;i<numeros.length;i+=100){const r=await sb.from('separacoes_pedidos').select('numero_pedido,local_id').eq('empresa_id',empresa).in('numero_pedido',numeros.slice(i,i+100));if(r.error)return;pedidos.push(...r.data||[]);}
      const ids=[...new Set(pedidos.map(p=>p.local_id).filter(Boolean))],enderecos=new Map();
      for(let i=0;i<ids.length;i+=100){const r=await sb.from('locais_empresas').select('id,endereco,numero_endereco').eq('empresa_id',empresa).in('id',ids.slice(i,i+100));if(r.error)return;(r.data||[]).forEach(l=>{const endereco=String(l.endereco||'').trim(),numero=String(l.numero_endereco||'').trim();enderecos.set(l.id,[endereco,numero&&!endereco.includes(numero)?numero:''].filter(Boolean).join(', '));});}
      pedidos.forEach(p=>{if(enderecos.get(p.local_id))locais.set(String(p.numero_pedido),enderecos.get(p.local_id));});
    };
    await Promise.allSettled([carregarPessoas(),carregarEnderecos()]);
    return {fotos,locais};
  }
  async function buscarResumoDia(){
    const sb = window.supabaseClient;
    if(!sb){ return null; }
    const { data, error } = await sb.rpc("operacao_resumo_dia");
    if(error){ throw error; }
    if(!data){ return null; }
    const detalhes=await detalhesResumoDia(sb,data.etapas||[]);
    const grupos = {};
    (data.etapas || []).forEach(function(e){
      (grupos[e.etapa] = grupos[e.etapa] || []).push({
        pedido: e.pedido || "", cliente: e.cliente || "", local: [e.local,detalhes.locais.get(String(e.pedido))&&!String(e.local||'').includes(detalhes.locais.get(String(e.pedido)))?detalhes.locais.get(String(e.pedido)):''].filter(Boolean).join(' - '), horario: e.horario || "",
        caminhao: e.caminhao || "", responsavel: e.responsavel || "", equipe: e.equipe || ""
      });
    });
    const porHora = function(a, b){ return (a.horario || "99").localeCompare(b.horario || "99"); };
    const etapas = Object.keys(grupos).sort(function(a, b){
      const ia = RESUMO_ORDEM.indexOf(a), ib = RESUMO_ORDEM.indexOf(b);
      return ((ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib)) || a.localeCompare(b);
    }).map(function(etapa){ const itens = grupos[etapa].sort(porHora); return { etapa: etapa, total: itens.length, itens: itens }; });
    const agenda = (data.agenda || []).slice().sort(porHora);
    return { data: data.data, fotos:detalhes.fotos, totalEtapas: etapas.reduce(function(s, g){ return s + g.total; }, 0), etapas: etapas, agenda: agenda };
  }

  function mostrar(){
    const raiz = document.getElementById("portalInicio");
    if(!raiz){ return; }
    if(!raiz.innerHTML.trim()){ montarMural(); }
    if(estado.mural || estado.carregando){ return; }
    estado.carregando = Promise.all([
      buscarMural().catch(function(e){ console.warn("[Mural] não carregou:", e); return null; }),
      buscarResumoDia().catch(function(e){ console.warn("[Resumo do dia] não carregou:", e); return null; }),
      buscarCelebracao().catch(function(e){ console.warn("[Ideia premiada] não carregou:", e); return null; })
    ])
      .then(function(r){
        const m = r[0], resumo = r[1] || (m && m.resumoDia) || null, celebracao = r[2];
        if(m || resumo || (celebracao && (celebracao.ideias || []).length)){ estado.mural = Object.assign({}, m || {}, { resumoDia: resumo, celebracao: celebracao }); montarMural();
          juntarAnexos(estado.mural).then(function(mm){ if(mm === estado.mural && (mm.avisos || []).some(function(a){ return a.anexo; })){ montarMural(); } }); }
      })
      .catch(function(e){ console.warn("[Mural] não carregou:", e); })
      .finally(function(){ estado.carregando = null; });
  }

  Object.assign(window, { cliqueFila: cliqueFila, moverFila: moverFila, irFila: irFila, abrirLuz: abrirLuz, fecharLuz: fecharLuz });
  window.portalMural = { mostrar: mostrar };
  if(document.body.classList.contains("portal-em-inicio")){ mostrar(); }
})();
