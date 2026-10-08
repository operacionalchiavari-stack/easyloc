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

  function montarMural(){
    const m = estado.mural || {};
    const capa = (m.galeria && m.galeria[0] && m.galeria[0].foto) || FOTO_PADRAO;
    const atalhos = [["Modulos/Chiavari/Cronograma/cronograma.html", "calendar", "Cronograma"]].concat(
      m.aniversariantes && m.aniversariantes.length ? [["#aniversariantes", "cake", "Aniversariantes"]] : []
    ).concat(m.reconhecimentos && m.reconhecimentos.length ? [["#reconhecimentos", "award", "Reconhecimentos"]] : []);

    let html =
      '<header class="hero">' +
        '<div class="hero-foto" id="heroFoto"><div class="hero-img" style="background-image:url(\'' + esc(capa) + '\')"></div><div class="hero-sombra"></div></div>' +
        '<div class="hero-saudacao revelar visivel"><span>' + esc(dataLonga()) + '</span></div>' +
        '<div class="hero-conteudo">' +
          '<div class="hero-data revelar visivel">Chiavari Eventos</div>' +
          '<h1 class="revelar visivel" style="--atraso:.1s">Bem-vindo ao portal da nossa equipe.</h1>' +
          '<p class="revelar visivel" style="--atraso:.2s">Avisos da semana, aniversariantes e quem está fazendo a diferença, tudo em um só lugar.</p>' +
          '<div class="hero-atalhos revelar visivel" style="--atraso:.3s">' + atalhos.map(function(a){
            const acao = a[0].charAt(0) === "#" ? 'document.querySelector(\'' + a[0] + '\').scrollIntoView({behavior:\'smooth\'})' : 'shellNavigate(\'' + a[0] + '\')';
            return '<button class="atalho" type="button" onclick="' + acao + '"><i data-lucide="' + a[1] + '"></i>' + a[2] + '</button>';
          }).join("") + '</div>' +
        '</div>' +
        '<div class="rolar" aria-hidden="true"></div>' +
      '</header>';

    // Avisos
    if((m.avisos || []).length){
      html += '<section class="secao">' + cabecalho("Quadro de avisos", "Fique por dentro", "Comunicados da empresa para toda a equipe.") +
        '<div class="avisos">' + m.avisos.map(function(a, i){
          const imp = a.prioridade === "IMPORTANTE";
          return '<article class="aviso revelar' + (imp ? " importante" : "") + '" style="--atraso:' + (i % 3) * 0.1 + 's">' +
            (a.fixado ? '<span class="fixado" title="Fixado"><i data-lucide="pin"></i></span>' : "") +
            '<span class="aviso-tag"><i data-lucide="' + (imp ? "alert-circle" : "megaphone") + '"></i>' + (imp ? "Importante" : "Aviso") + '</span>' +
            '<h3>' + esc(a.titulo) + '</h3>' + (a.texto ? '<p>' + esc(a.texto) + '</p>' : "") +
            '<div class="aviso-data">' + esc(String(a.publicadoEm || "").slice(0, 10)) + '</div>' +
          '</article>';
        }).join("") + '</div></section>';
    }

    // Números do mês
    if(m.numeros){
      const p = String(m.numeros.mes).split("-");
      const caminho = "M -20 330 C 260 322, 520 290, 760 200 S 1080 40, 1240 -30";
      let faixas = "";
      for(let i = 0; i < 14; i++){
        faixas += '<i style="left:' + (4 + i * 7) + '%;animation-delay:' + (i * 0.37 % 4.5).toFixed(2) + 's;animation-duration:' + (3.6 + (i % 4) * 0.6).toFixed(1) + 's"></i>';
      }
      html += '<section class="secao larga">' + cabecalho("Este mês", "Nossos números de " + MESES[Number(p[1]) - 1], "Sempre para cima.") +
        '<div class="numeros revelar">' +
          '<div class="faixas" aria-hidden="true">' + faixas + '</div>' +
          '<svg class="trajetoria" viewBox="0 0 1200 320" preserveAspectRatio="none" aria-hidden="true">' +
            '<defs><linearGradient id="gradRastro" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#b08d57" stop-opacity="0"/><stop offset=".55" stop-color="#b08d57" stop-opacity=".55"/><stop offset="1" stop-color="#f3dfb6" stop-opacity="1"/></linearGradient>' +
            '<radialGradient id="gradCometa"><stop offset="0" stop-color="#fff8e8"/><stop offset=".4" stop-color="#f3dfb6" stop-opacity=".8"/><stop offset="1" stop-color="#f3dfb6" stop-opacity="0"/></radialGradient></defs>' +
            '<path class="rastro-largo" d="' + caminho + '"/>' +
            '<path class="rastro" id="rastroNumeros" d="' + caminho + '"/>' +
            '<circle class="cometa" r="9" fill="url(#gradCometa)"><animateMotion id="voo" dur="2.6s" begin="indefinite" fill="freeze" keyPoints="0;1" keyTimes="0;1" calcMode="spline" keySplines=".55 .05 .25 1"><mpath href="#rastroNumeros"/></animateMotion></circle>' +
          '</svg>' +
          '<div class="numero"><strong><b data-contar="' + m.numeros.eventos + '">0</b><i data-lucide="arrow-up-right"></i></strong><span>Eventos</span></div>' +
          '<div class="numero"><strong><b data-contar="' + m.numeros.montagens + '">0</b><i data-lucide="arrow-up-right"></i></strong><span>Montagens</span></div>' +
          '<div class="numero"><strong><b data-contar="' + m.numeros.desmontagens + '">0</b><i data-lucide="arrow-up-right"></i></strong><span>Desmontagens</span></div>' +
        '</div></section>';
    }

    // Aniversariantes
    if((m.aniversariantes || []).length){
      const mes = MESES[new Date().getMonth()];
      html += '<section class="secao larga" id="aniversariantes"><div class="festa revelar"><canvas id="fogos" aria-hidden="true"></canvas>' +
        '<div class="festa-topo"><small>Aniversariantes de ' + mes + '</small><h2>Parabéns, <em>' + (m.aniversariantes.length > 1 ? "aniversariantes!" : "aniversariante!") + '</em></h2>' +
        '<p>Deixe um abraço para quem está celebrando mais um ano com a gente.</p></div>' +
        '<div class="anivers">' + m.aniversariantes.map(function(a, i){
          return '<div class="aniver revelar' + (a.hoje ? " hoje" : "") + '" style="--atraso:' + (i % 5) * 0.08 + 's">' + (a.hoje ? confetes() : "") +
            '<div class="aniver-foto">' + fotoOuInicial(a.foto, a.nome) + '</div>' +
            '<b>' + esc(a.nome) + '</b>' + (a.setor ? '<small>' + esc(a.setor) + '</small>' : "") +
            '<span class="aniver-dia">' + (a.hoje ? "É hoje!" : "Dia " + esc(a.dia)) + '</span>' +
          '</div>';
        }).join("") + '</div></div></section>';
    }

    // Reconhecimentos e premiações (sem valores)
    if((m.reconhecimentos || []).length){
      html += '<section class="secao" id="reconhecimentos">' + cabecalho("Reconhecimentos", "Quem está fazendo a diferença", "Premiações conquistadas pela nossa equipe.") +
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

    // Galeria
    if((m.galeria || []).length){
      html += '<section class="secao">' + cabecalho("Galeria", "Eventos em destaque", "O resultado do nosso trabalho.") +
        '<div class="galeria">' + m.galeria.map(function(g, i){
          return '<figure class="revelar" style="--atraso:' + (i % 4) * 0.08 + 's" onclick="abrirLuz(\'' + esc(g.foto) + '\', \'' + esc(String(g.legenda || "").replace(/'/g, "")) + '\')"><img src="' + esc(g.foto) + '" alt="" loading="lazy">' + (g.legenda ? '<figcaption>' + esc(g.legenda) + '</figcaption>' : "") + '</figure>';
        }).join("") + '</div></section>';
    }

    html += '<footer class="rodape"><b>Chiavari</b><span>Portal Interno · uso exclusivo da equipe</span></footer>';

    document.getElementById("portalInicio").innerHTML = html;
    icones();
    iniciarAnimacoes();
    iniciarFila();
    iniciarFogos();
  }

  /* Fogos de artifício no espaço dos aniversariantes (só rodam quando estão na tela) */
  const fogos = { rodando: false, visivel: false, particulas: [], foguetes: [], proximo: 0 };

  function iniciarFogos(){
    const canvas = document.getElementById("fogos");
    if(!canvas){ return; }
    if(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches){ return; }
    const ctx = canvas.getContext("2d");
    const CORES = ["#f3dfb6", "#e9cf9f", "#ffffff", "#f6b26b", "#e88d8d", "#a9c7f0", "#c9b2f2"];

    function ajustar(){
      const r = canvas.getBoundingClientRect(), d = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = r.width * d; canvas.height = r.height * d;
      ctx.setTransform(d, 0, 0, d, 0, 0);
    }
    ajustar();
    if(!fogos.ouvindoResize){ fogos.ouvindoResize = true; window.addEventListener("resize", function(){ if(document.getElementById("fogos")){ ajustar(); } }); }

    function lancar(){
      const r = canvas.getBoundingClientRect();
      fogos.foguetes.push({
        x: r.width * (.12 + Math.random() * .76), y: r.height + 10,
        alvo: r.height * (.12 + Math.random() * .35), vy: -(6 + Math.random() * 3),
        cor: CORES[Math.floor(Math.random() * CORES.length)]
      });
    }

    function explodir(f){
      const n = 46 + Math.floor(Math.random() * 30);
      const forca = 2.2 + Math.random() * 1.8;
      for(let i = 0; i < n; i++){
        const ang = (Math.PI * 2 * i) / n, v = forca * (.55 + Math.random() * .45);
        fogos.particulas.push({ x: f.x, y: f.y, vx: Math.cos(ang) * v, vy: Math.sin(ang) * v, vida: 1, cor: Math.random() < .25 ? "#ffffff" : f.cor, brilho: Math.random() < .3 });
      }
    }

    function quadro(t){
      if(!fogos.visivel || !document.getElementById("fogos")){ fogos.rodando = false; return; }
      const r = canvas.getBoundingClientRect();
      ctx.globalCompositeOperation = "destination-out";
      ctx.fillStyle = "rgba(0,0,0,.18)";
      ctx.fillRect(0, 0, r.width, r.height);
      ctx.globalCompositeOperation = "lighter";

      if(t > fogos.proximo){ lancar(); fogos.proximo = t + 500 + Math.random() * 800; }

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
      requestAnimationFrame(quadro);
    }

    new IntersectionObserver(function(e){
      fogos.visivel = e[0].isIntersecting;
      if(fogos.visivel && !fogos.rodando){ fogos.rodando = true; ajustar(); requestAnimationFrame(quadro); }
    }, { root: document.getElementById("portalInicio"), threshold: 0.05 }).observe(canvas);
  }

  /* Fila de reconhecimentos: troca sozinha a cada 5s, pausa com o mouse em cima */
  const fila = { atual: 0, timer: null };

  function posicionarFila(){
    const cartoes = document.querySelectorAll("#fila .premio");
    const n = cartoes.length;
    const passo = window.innerWidth < 860 ? 88 : 96;
    cartoes.forEach(function(c, i){
      let d = ((i - fila.atual) % n + n) % n;
      if(d > n / 2){ d -= n; }
      const dist = Math.abs(d);
      const escala = dist === 0 ? 1 : dist === 1 ? .8 : .64;
      c.classList.toggle("centro", d === 0);
      c.style.transform = "translateX(calc(-50% + " + (d * passo - Math.sign(d) * (dist - 1) * 18 * (dist > 1 ? 1 : 0)) + "%)) scale(" + escala + ")";
      c.style.opacity = dist > 2 ? 0 : dist === 2 ? .35 : 1;
      c.style.filter = dist === 0 ? "none" : "brightness(.55) saturate(.8)";
      c.style.zIndex = 10 - dist;
      c.style.pointerEvents = dist > 2 ? "none" : "";
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
    const area = document.getElementById("portalInicio");
    const observador = new IntersectionObserver(function(entradas){
      entradas.forEach(function(e){
        if(!e.isIntersecting){ return; }
        e.target.classList.add("visivel");
        e.target.querySelectorAll("[data-contar]").forEach(contar);
        const voo = e.target.querySelector("#voo");
        if(voo && voo.beginElement){ setTimeout(function(){ try{ voo.beginElement(); }catch(err){} }, 200); }
        observador.unobserve(e.target);
      });
    }, { root: area, threshold: 0.15 });
    document.querySelectorAll(".revelar:not(.visivel)").forEach(function(el){ observador.observe(el); });

    const capa = document.getElementById("heroFoto");
    if(area.dataset.parallax){ return; }
    area.dataset.parallax = "1";
    area.addEventListener("scroll", function(){
      const capa = document.getElementById("heroFoto");
      if(capa){ capa.style.transform = "translateY(" + Math.min(area.scrollTop * 0.35, 260) + "px)"; }
    }, { passive: true });
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
    const servidor = /\.vercel\.app$/i.test(location.hostname) ? "" : "https://easyloc-zeta.vercel.app/";
    const r = await fetch(servidor + "api/portal-mural", { headers: { Authorization: "Bearer " + token } });
    if(!r.ok){ return null; }
    const j = await r.json().catch(function(){ return null; });
    return j && j.ok ? j.resultado : null;
  }

  function mostrar(){
    const raiz = document.getElementById("portalInicio");
    if(!raiz){ return; }
    if(!raiz.innerHTML.trim()){ montarMural(); }
    if(estado.mural || estado.carregando){ return; }
    estado.carregando = buscarMural()
      .then(function(m){ if(m){ estado.mural = m; montarMural(); } })
      .catch(function(e){ console.warn("[Mural] não carregou:", e); })
      .finally(function(){ estado.carregando = null; });
  }

  Object.assign(window, { cliqueFila: cliqueFila, moverFila: moverFila, irFila: irFila, abrirLuz: abrirLuz, fecharLuz: fecharLuz });
  window.portalMural = { mostrar: mostrar };
  if(document.body.classList.contains("portal-em-inicio")){ mostrar(); }
})();
