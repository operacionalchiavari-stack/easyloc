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
      hero.dispatchEvent(new Event("hero-slide-change"));
    }
    function atualizarPausa(){ pausa.textContent = pausado ? "Retomar" : "Pausar"; pausa.setAttribute("aria-label", pausado ? "Retomar troca dos destaques" : "Pausar troca dos destaques"); }
    pontos.forEach((ponto, i) => ponto.addEventListener("click", () => mostrarSlide(i)));
    hero.querySelector(".hero-anterior").addEventListener("click", () => mostrarSlide(atual - 1));
    hero.querySelector(".hero-proximo").addEventListener("click", () => mostrarSlide(atual + 1));
    pausa.addEventListener("click", () => { pausado = !pausado; atualizarPausa(); });
    mostrarSlide(0); atualizarPausa();
    const timer = setInterval(() => {
      if(!pausado && !document.hidden && document.body.classList.contains("portal-em-inicio") && !hero.matches(":hover, :focus-within")) mostrarSlide(atual + 1);
    }, 7000);
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

  /* Resumo do dia: o que o Cronograma tem hoje (triagem, carregamento, montagem,
     desmontagem) e a agenda interna. Um cartão por tipo de etapa, com contagem. */
  const ICONE_ETAPA = {
    "Triagem (Separação)": "package-search",
    "Triagem (Conferência)": "clipboard-check",
    "Carregamento": "truck",
    "Montagem": "hammer",
    "Desmontagem": "package-open"
  };
  function resumoDiaHtml(r){
    if(!r){ return ""; }
    const etapas = r.etapas || [];
    const agenda = r.agenda || [];
    const linha = function(it){
      const lista = function(v){ return String(v || "").split("|").map(function(x){ return x.trim(); }).filter(Boolean).join(", "); };
      const detalhes = [it.local, it.responsavel && ("Resp.: " + it.responsavel), it.equipe && ("Equipe: " + lista(it.equipe)), it.caminhao && ("Caminhão: " + lista(it.caminhao))].filter(Boolean).join(" · ");
      return '<li><span class="rd-hora">' + esc(it.horario || "—") + '</span><div><strong>' +
        (it.pedido ? "Pedido " + esc(it.pedido) + (it.cliente ? " · " : "") : "") + esc(it.cliente || "") + '</strong>' +
        (detalhes ? '<small>' + esc(detalhes) + '</small>' : "") + '</div></li>';
    };
    const total = r.totalEtapas || 0;
    const textoResumo = total ? total + (total === 1 ? " etapa" : " etapas") + " no cronograma hoje" + (agenda.length ? " e " + agenda.length + (agenda.length === 1 ? " compromisso" : " compromissos") + " na agenda." : ".") : "O que temos no cronograma hoje.";
    let corpo;
    if(!etapas.length && !agenda.length){
      corpo = '<div class="rd-vazio revelar">Nada no cronograma para hoje.</div>';
    } else {
      corpo =
        '<div class="rd-grade">' + etapas.map(function(g, i){
          const corEtapa = g.etapa.startsWith("Triagem") ? "triagem" : ({ Carregamento: "carregamento", Montagem: "montagem", Desmontagem: "desmontagem" }[g.etapa] || "agenda");
          return '<article class="rd-cartao rd-' + corEtapa + ' revelar" style="--atraso:' + (i % 3) * 0.1 + 's"><header><i data-lucide="' + (ICONE_ETAPA[g.etapa] || "calendar") + '"></i><h3>' + esc(g.etapa) + '</h3><b>' + g.total + '</b></header><ul>' +
            g.itens.map(linha).join("") + '</ul></article>';
        }).join("") + (agenda.length ? '<article class="rd-cartao rd-agenda revelar"><header><i data-lucide="calendar-clock"></i><h3>Agenda interna</h3><b>' + agenda.length + '</b></header><ul>' +
          agenda.map(function(a){
            return '<li><span class="rd-hora">' + esc(a.horario || "—") + '</span><div><strong>' + esc([a.tipo, a.setor].filter(Boolean).join(" · ") || "Compromisso") + '</strong>' +
              (a.descricao ? '<small>' + esc(a.descricao) + '</small>' : "") + '</div></li>';
          }).join("") + '</ul></article>' : "") + '</div>';
    }
    return '<section class="secao cheia" id="resumoDia"><div class="secao-topo revelar"><div><small>Hoje</small><h2>Resumo do dia</h2></div>' +
      '<div class="rd-topo-acoes"><p>' + esc(textoResumo) + '</p><button class="rd-abrir" type="button" onclick="shellNavigate(\'Modulos/Chiavari/Cronograma/cronograma.html\')"><i data-lucide="calendar"></i>Abrir o cronograma</button></div></div>' + corpo + '</section>';
  }

  function montarMural(){
    const m = estado.mural || {};
    // A capa de boas-vindas usa sempre a equipe; a galeria contém fotos de eventos.
    const capa = FOTO_PADRAO;
    const aniversariantesHero = (m.aniversariantes || []).slice().sort((a,b) => Number(Boolean(b.hoje))-Number(Boolean(a.hoje)) || Number(a.dia)-Number(b.dia));
    const fotosHero = [capa, null].concat(aniversariantesHero.map(() => null));
    const atalhos = (m.resumoDia ? [["#resumoDia", "list-checks", "Resumo do dia"]] : []).concat([["Modulos/Chiavari/Cronograma/cronograma.html", "calendar", "Cronograma"]]).concat(
      m.aniversariantes && m.aniversariantes.length ? [["#aniversariantes", "cake", "Aniversariantes"]] : []
    ).concat([["Modulos/RH/IdeiaPremiada/ideia-premiada.html", "lightbulb", "Ideia Premiada"]]);

    let html =
      '<header class="hero" aria-label="Destaques do portal" aria-roledescription="carrossel">' +
        '<div class="hero-foto" id="heroFoto">' + fotosHero.map((foto, i) => foto ? '<div class="hero-img' + (i === 0 ? ' ativo' : '') + '" style="background-image:url(\'' + esc(foto) + '\')"></div>' : i === 1 ? '<div class="hero-img hero-ideia"><div class="hero-ideia-simbolo" aria-hidden="true"><i data-lucide="lightbulb"></i></div></div>' : '<div class="hero-img hero-festa-fundo"></div>').join('') + '<div class="hero-sombra"></div></div>' +
        (aniversariantesHero.length ? '<canvas id="fogos" class="hero-fogos" aria-hidden="true"></canvas>' : '') +
        '<div class="hero-saudacao revelar visivel"><span>' + esc(dataLonga()) + '</span></div>' +
        '<div class="hero-conteudo hero-slide ativo" role="group" aria-roledescription="slide" aria-label="Boas-vindas">' +
          '<div class="hero-data revelar visivel">Chiavari Eventos</div>' +
          '<h1 class="revelar visivel" style="--atraso:.1s">Bem-vindo ao portal da nossa equipe.</h1>' +
          '<p class="revelar visivel" style="--atraso:.2s">Avisos da semana, aniversariantes e quem está fazendo a diferença, tudo em um só lugar.</p>' +
          '<div class="hero-atalhos revelar visivel" style="--atraso:.3s">' + atalhos.map(function(a){
            const acao = a[0] === "#aniversariantes" ? 'document.querySelectorAll(\'#portalInicio .hero-ponto\')[2].click()' : a[0].charAt(0) === "#" ? 'document.querySelector(\'' + a[0] + '\').scrollIntoView({behavior:\'smooth\'})' : 'shellNavigate(\'' + a[0] + '\')';
            return '<button class="atalho" type="button" onclick="' + acao + '"><i data-lucide="' + a[1] + '"></i>' + a[2] + '</button>';
          }).join("") + '</div>' +
        '</div><div class="hero-conteudo hero-slide hero-convite" role="group" aria-roledescription="slide" aria-label="Participe da Ideia Premiada" aria-hidden="true" inert>' +
          '<div class="hero-data">Ideia Premiada · Sua visão faz a diferença</div><h1>A próxima melhoria<br>pode começar com você.</h1><p>Uma solução mais simples. Um cuidado com a equipe. Um novo jeito de fazer. Compartilhe sua ideia e ajude a Chiavari a evoluir.</p>' +
          '<div class="hero-atalhos"><button class="atalho atalho-ideia" type="button" onclick="shellNavigate(\'Modulos/RH/IdeiaPremiada/ideia-premiada.html\')"><i data-lucide="lightbulb"></i>Quero participar<i data-lucide="arrow-up-right"></i></button></div></div>' +
        aniversariantesHero.map(a => '<div class="hero-conteudo hero-slide hero-aniversario" role="group" aria-roledescription="slide" aria-label="Aniversário de ' + esc(a.nome) + '" aria-hidden="true" inert><div class="hero-aniversario-texto"><div class="hero-data">Aniversariantes de ' + MESES[new Date().getMonth()] + '</div><h1>Parabéns,<br>' + esc(a.nome) + '!</h1><p>' + (a.hoje ? 'Hoje é o seu dia!' : 'Celebrando no dia ' + esc(a.dia) + '.') + (a.setor ? ' · ' + esc(a.setor) : '') + '<br>Que seu novo ano venha cheio de conquistas.<br>É uma alegria ter você na nossa equipe.</p></div><div class="hero-aniversario-foto">' + fotoOuInicial(a.foto,a.nome) + '</div></div>').join('') +
        '<div class="hero-controles"><button class="hero-anterior" type="button" aria-label="Destaque anterior">‹</button><div class="hero-pontos">' + fotosHero.map((_, i) => '<button class="hero-ponto" type="button" aria-label="Ir para destaque ' + (i + 1) + '" aria-pressed="' + (i === 0) + '"></button>').join('') + '</div><button class="hero-proximo" type="button" aria-label="Próximo destaque">›</button><button class="hero-pausa" type="button">Pausar</button></div>' +
        '<div class="rolar" aria-hidden="true"></div>' +
      '</header>';

    // Resumo do dia (out/2026): etapas do Cronograma de hoje + agenda interna (api/portal-mural.js → PORTAL_resumoDia_)
    html += resumoDiaHtml(m.resumoDia);

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

    // Avisos
    if((m.avisos || []).length){
      html += '<section class="secao cheia" id="avisos">' + cabecalho("Quadro de avisos", "Fique por dentro", "Comunicados da empresa para toda a equipe.") +
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
    iniciarHero();
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
    const CORES = ["#f3dfb6", "#e9cf9f", "#ffffff", "#f6b26b", "#e88d8d", "#a9c7f0", "#c9b2f2"];

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
      const n = 46 + Math.floor(Math.random() * 30);
      const forca = 2.2 + Math.random() * 1.8;
      for(let i = 0; i < n; i++){
        const ang = (Math.PI * 2 * i) / n, v = forca * (.55 + Math.random() * .45);
        fogos.particulas.push({ x: f.x, y: f.y, vx: Math.cos(ang) * v, vy: Math.sin(ang) * v, vida: 1, cor: Math.random() < .25 ? "#ffffff" : f.cor, brilho: Math.random() < .3 });
      }
    }

    function quadro(t){
      if(!fogos.visivel || !canvas.isConnected || document.hidden || !document.body.classList.contains("portal-em-inicio")){ fogos.rodando = false; return; }
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

    const blocos = Array.from(area.querySelectorAll(".secao > .secao-topo, .secao > .rd-grade, .secao > .galeria, .secao > .fila"));
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
    const servidor = /\.vercel\.app$/i.test(location.hostname) ? "" : "https://easyloc-zeta.vercel.app/";
    const r = await fetch(servidor + "api/portal-mural", { headers: { Authorization: "Bearer " + token } });
    if(!r.ok){ return null; }
    const j = await r.json().catch(function(){ return null; });
    return j && j.ok ? j.resultado : null;
  }

  /* Resumo do dia lido direto do Supabase (out/2026): as abas Cronograma e Agenda da planilha do
     Cronograma (gs_linhas) têm leitura liberada para quem está logado na empresa (migration
     20261008000500_gs_leitura_equipe). Mesma regra de PORTAL_resumoDia_ (servidor), sem precisar da Vercel. */
  const RESUMO_PLANILHA = "14HXOljlAeE_8oTd56QB5bsDrDHbuNrdI772HP0I1QAQ";
  const RESUMO_ORDEM = ["Triagem (Separação)", "Triagem (Conferência)", "Carregamento", "Montagem", "Desmontagem"];
  const FUSO = "America/Sao_Paulo";
  function diaSP(d){ return new Intl.DateTimeFormat("en-CA", { timeZone: FUSO, year: "numeric", month: "2-digit", day: "2-digit" }).format(d); }
  function dataDe(v){ return v && typeof v === "object" && v.$d ? new Date(v.$d) : null; }
  function horaDe(v){
    const d = dataDe(v);
    if(d){ return new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d); }
    return String(v == null ? "" : v).replace(/^'/, "").trim();
  }
  function txt(v){ return String(v == null ? "" : v).trim(); }
  async function linhasDoDia(aba, coluna, hoje){
    const sb = window.supabaseClient;
    // Janela larga em UTC e depois o filtro exato pelo dia em São Paulo.
    const ini = new Date(hoje + "T00:00:00Z"); ini.setUTCDate(ini.getUTCDate() - 1);
    const fim = new Date(hoje + "T00:00:00Z"); fim.setUTCDate(fim.getUTCDate() + 2);
    const campo = "valores->" + coluna + "->>$d";
    const { data, error } = await sb.from("gs_linhas").select("linha,valores")
      .eq("planilha_id", RESUMO_PLANILHA).eq("aba", aba)
      .gte(campo, ini.toISOString()).lt(campo, fim.toISOString()).order("linha");
    if(error){ throw error; }
    return (data || []).map(function(r){ return r.valores || []; })
      .filter(function(l){ const d = dataDe(l[coluna]); return d && diaSP(d) === hoje; });
  }
  async function buscarResumoDia(){
    if(!window.supabaseClient){ return null; }
    const hoje = diaSP(new Date());
    const [crono, agendaLinhas] = await Promise.all([linhasDoDia("Cronograma", 6, hoje), linhasDoDia("Agenda", 2, hoje)]);
    const grupos = {};
    crono.forEach(function(l){
      if(!l[0] || !l[5]){ return; }
      const etapa = txt(l[5]);
      (grupos[etapa] = grupos[etapa] || []).push({
        pedido: txt(l[1]), cliente: txt(l[3]), local: txt(l[4]), horario: horaDe(l[7]),
        caminhao: txt(l[8]), responsavel: txt(l[9]), equipe: txt(l[10])
      });
    });
    const porHora = function(a, b){ return (a.horario || "99").localeCompare(b.horario || "99"); };
    const etapas = Object.keys(grupos).sort(function(a, b){
      const ia = RESUMO_ORDEM.indexOf(a), ib = RESUMO_ORDEM.indexOf(b);
      return ((ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib)) || a.localeCompare(b);
    }).map(function(etapa){ const itens = grupos[etapa].sort(porHora); return { etapa: etapa, total: itens.length, itens: itens }; });
    const agenda = agendaLinhas.map(function(a){
      return { horario: horaDe(a[9]), tipo: txt(a[4]), setor: txt(a[3]), descricao: txt(a[5]), responsavel: txt(a[1]) };
    }).sort(porHora);
    return { data: hoje, totalEtapas: etapas.reduce(function(s, g){ return s + g.total; }, 0), etapas: etapas, agenda: agenda };
  }

  function mostrar(){
    const raiz = document.getElementById("portalInicio");
    if(!raiz){ return; }
    if(!raiz.innerHTML.trim()){ montarMural(); }
    if(estado.mural || estado.carregando){ return; }
    estado.carregando = Promise.all([
      buscarMural().catch(function(e){ console.warn("[Mural] não carregou:", e); return null; }),
      buscarResumoDia().catch(function(e){ console.warn("[Resumo do dia] não carregou:", e); return null; })
    ])
      .then(function(r){
        const m = r[0], resumo = r[1] || (m && m.resumoDia) || null;
        if(m || resumo){ estado.mural = Object.assign({}, m || {}, { resumoDia: resumo }); montarMural(); }
      })
      .catch(function(e){ console.warn("[Mural] não carregou:", e); })
      .finally(function(){ estado.carregando = null; });
  }

  Object.assign(window, { cliqueFila: cliqueFila, moverFila: moverFila, irFila: irFila, abrirLuz: abrirLuz, fecharLuz: fecharLuz });
  window.portalMural = { mostrar: mostrar };
  if(document.body.classList.contains("portal-em-inicio")){ mostrar(); }
})();
