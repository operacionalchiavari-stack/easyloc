/**
 * MURAL DO INÍCIO — cópia do mural do Portal Interno da Chiavari
 * (o antigo Modulos/Chiavari/Portal/portal.html, já apagado — função montarMural e vizinhas),
 * mostrado na tela "Início" do dashboard. Os dados vêm da Edge Function
 * central-metas do Supabase (chamarMural/muralDados; nov/2026, antes era a
 * planilha do Portal pela Vercel).
 */
(function(){
  "use strict";
  const FOTO_PADRAO = "https://awemuohtvwvrdzfxwrmd.supabase.co/storage/v1/object/public/sistema%20interno/007_Ana%20Paula%20Astino_APA_20251216111706.jpg";
  const MESES = ["janeiro","fevereiro","março","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"];
  const MESES_CURTOS = ["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"];
  const DIAS = ["domingo","segunda-feira","terça-feira","quarta-feira","quinta-feira","sexta-feira","sábado"];
  const estado = { mural: null, carregando: null };
  try{estado.metasSimulacao=sessionStorage.getItem('portal_metas_simulacao')!=='false';}catch(_){estado.metasSimulacao=true;}
  let encerrarHero = null;
  let encerrarMovimento = null;
  let encerrarFogos = null;
  let encerrarPremiacoes = null;

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
    function atualizarPausa(){ hero.classList.toggle('festive-paused', pausado); pausa.textContent = pausado ? "Retomar" : "Pausar"; pausa.setAttribute("aria-label", pausado ? "Retomar troca e animação dos destaques" : "Pausar troca e animação dos destaques"); }
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
    const nomesLista=v=>(Array.isArray(v)?v:String(v||'').split(/[|,]/)).map(x=>String(x).trim()).filter(Boolean);
    const pessoas=valor=>{
      const nomes=nomesLista(valor);if(!nomes.length)return '\u2014';
      return '<span class="rd-pessoas">'+nomes.map(nome=>{
        const foto=r.fotos?.[nome],iniciais=nome.split(/\s+/).slice(0,2).map(n=>n[0]).join('').toUpperCase();
        return '<span class="rd-pessoa"><span class="rd-avatar"><span>'+esc(iniciais)+'</span>'+(/^https?:\/\//i.test(foto||'')?'<img src="'+esc(foto)+'" alt="" loading="lazy">':'')+'</span><span>'+esc(nome)+'</span></span>';
      }).join('')+'</span>';
    };
    const clienteHtml=it=>{
      if(!it.pedido||!it.cliente)return esc(it.cliente||'\u2014');
      const iniciais=String(it.cliente).trim().split(/\s+/).slice(0,2).map(nome=>nome[0]).join('').toUpperCase();
      const foto=/^https?:\/\//i.test(it.cliente_foto_url||'')?'<img src="'+esc(it.cliente_foto_url)+'" alt="" loading="lazy" onerror="this.remove()">':'';
      return '<span class="rd-cliente"><span class="rd-avatar" aria-hidden="true"><span>'+esc(iniciais)+'</span>'+foto+'</span><span class="rd-cliente-nome">'+esc(it.cliente)+'</span></span>';
    };
    const caminhoesHtml=valor=>{
      const codigos=nomesLista(valor);if(!codigos.length)return '\u2014';
      return '<span class="rd-caminhoes">'+codigos.map(codigo=>{
        const url=r.fotosCaminhoes?.[codigo];
        const foto=/^https?:\/\//i.test(url||'')?'<img src="'+esc(url)+'" alt="" loading="lazy" onerror="this.remove()">':'';
        return '<span class="rd-caminhao"><span class="rd-caminhao-foto" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 5h11v12H3zM14 9h4l3 4v4h-7"/><circle cx="7" cy="18" r="2"/><circle cx="18" cy="18" r="2"/></svg>'+foto+'</span><span class="rd-caminhao-codigo">'+esc(codigo)+'</span></span>';
      }).join('')+'</span>';
    };
    const linhas=(r.etapas||[]).flatMap(grupo=>(grupo.itens||[]).map(item=>({...item,etapa:grupo.etapa})));
    for(const a of r.agenda||[])linhas.push({horario:a.horario,cliente:[a.tipo,a.setor].filter(Boolean).join(' \u00b7 '),etapa:'Agenda interna',local:a.descricao,responsavel:a.responsavel});
    linhas.sort((a,b)=>(a.horario||'99:99').localeCompare(b.horario||'99:99')||RESUMO_ORDEM.indexOf(a.etapa)-RESUMO_ORDEM.indexOf(b.etapa)||String(a.pedido||'').localeCompare(String(b.pedido||''),'pt-BR',{numeric:true}));
    const tipo=nome=>nome?.startsWith('Triagem')?'triagem':({Carregamento:'carregamento',Montagem:'montagem',Desmontagem:'desmontagem',Descarregamento:'descarregamento'}[nome]||'agenda');
    const colunas=['Data','Hor\u00e1rio','Pedido','Cliente','Etapa','Local','Respons\u00e1vel','Equipe','Caminh\u00e3o'];
    const celula=(valor,i)=>'<td data-label="'+colunas[i]+'">'+valor+'</td>';
    const tabela='<div class="rd-tabela-caixa"><table class="rd-tabela"><colgroup>'+colunas.map((_,i)=>'<col class="rd-coluna-'+i+'">').join('')+'</colgroup><thead><tr>'+colunas.map(c=>'<th scope="col">'+c+'</th>').join('')+'</tr></thead><tbody>'+linhas.map(it=>'<tr class="rd-linha">'+[
      '<strong>'+dataBr+'</strong>',esc(it.horario||'\u2014'),it.pedido?'<span class="rd-pedido">'+esc(String(it.pedido).replace(/^#/,''))+'</span>':'\u2014',clienteHtml(it),'<span class="rd-etapa rd-etapa-'+tipo(it.etapa)+'">'+esc(it.etapa)+'</span>',esc(it.local||'\u2014'),pessoas(it.responsavel),pessoas(it.equipe),caminhoesHtml(it.caminhao)
    ].map(celula).join('')+'</tr>').join('')+(linhas.length?'':'<tr><td colspan="9" class="rd-tabela-vazia">Nada no cronograma para hoje.</td></tr>')+'</tbody></table></div>';
    return '<section class="secao cheia" id="resumoDia"><div class="secao-topo rd-resumo-topo revelar"><div class="rd-titulo"><span class="rd-titulo-orn" aria-hidden="true"></span><h2>Resumo <em>do dia</em></h2><span class="rd-titulo-orn" aria-hidden="true"></span></div><div class="rd-topo-acoes"><p>'+linhas.length+' atividade(s) hoje</p><button class="rd-abrir" type="button" onclick="shellNavigate(\'Modulos/Chiavari/Cronograma/cronograma.html\')"><i data-lucide="calendar"></i>Abrir o cronograma</button></div></div>'+tabela+'</section>';
  }

  function simularMetasSetores(dados){
    const mes=/^\d{4}-\d{2}$/.test(dados?.mes || '')?dados.mes:new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo'}).format(new Date()).slice(0,7);
    const ano=Number(mes.slice(0,4)),mesAtual=Number(mes.slice(5,7))-1;
    const nomes=(Array.isArray(dados?.setores)&&dados.setores.length?dados.setores.map(s=>s.setor):['Acabamento e Pintura','Almoxarifado','Costura','Forração','Limpeza de Estofados','Marcenaria','Solda']).filter(Boolean);
    const integrantes=['Ana','Rafael','Mariana','Lucas','Camila','Carlos','Juliana','Roberto'];
    const equipes=nomes.map((setor,si)=>({setor,equipe:Array.from({length:3+si%3},(_,i)=>{
      const indice=(si*2+i)%integrantes.length;
      return {id:'simulacao-'+si+'-'+i,nome:integrantes[indice]+' · exemplo',foto:new URL('assets/demo/equipe/integrante-'+String(indice+1).padStart(2,'0')+'.jpg',document.baseURI).href};
    })}));
    const indicador=(nome,real,meta,unidade,menor)=>({nome,real,meta,unidade,atingiu:menor?real<meta:real>=meta});
    const setores=nomes.map(function(setor,si){
      function resultado(mi){
        const ganhou=(si*3+mi)%7!==1;
        const almox=String(setor).toLocaleLowerCase('pt-BR').includes('almox');
        const producao=100+si*15+mi*4;
        const indicadores=almox?[
          indicador('Contagem',ganhou?104+(mi*3+si)%17:86+mi%8,100,'%',false),
          indicador('Assertividade',91+mi%8,85,'%',false),
          indicador('Uso do teto de gastos',62+(mi*4+si)%28,100,'%',true)
        ]:[
          indicador('Produção',ganhou?producao+12+(si+mi)%24:producao-12-mi%8,producao,'itens',false),
          indicador('Qualidade',94+(si+mi)%6,90,'%',false),
          indicador('Prazo',96+(si+mi)%5,95,'%',false),
          indicador('Tempo',3+(si+mi)%2,5,'dias',true),
          indicador('Uso do teto de gastos',61+(si*4+mi*3)%31,100,'%',true)
        ];
        return {mes:ano+'-'+String(mi+1).padStart(2,'0'),status:indicadores.every(i=>i.atingiu===true),indicadores};
      }
      const atual=resultado(mesAtual),historico=Array.from({length:mesAtual},(_,mi)=>resultado(mi));
      return {setor,status:atual.status,indicadores:atual.indicadores,motivo:'',historicoDisponivel:true,historico,trofeusAno:historico.filter(h=>h.status).length};
    });
    const temEntregas=Array.isArray(dados?.premiacoes?.itens)&&dados.premiacoes.itens.some(p=>p.nome&&/^https?:\/\//i.test(p.foto || ''));
    const premiacoes=temEntregas?dados.premiacoes:{itens:[
      ['Rafael Souza','Caixa de som portátil','rafael','Almoxarifado'],
      ['Ana Lima','Cafeteira','ana','Costura'],
      ['Carlos Santos','Fone sem fio','carlos','Marcenaria'],
      ['Mariana Costa','Relógio inteligente','mariana','Acabamento e Pintura']
    ].map(([nome,titulo,arquivo,setor],i)=>({nome,titulo,setor,mes:new Date(Date.UTC(ano,mesAtual-1-i,1)).toISOString().slice(0,7),foto:new URL('assets/demo/entregas/'+arquivo+'.png',document.baseURI).href}))};
    return {mes,ano,setores,equipes,premiacoes,equipesPremiacoes:dados?.equipes || [],avisos:[],simulacao:true};
  }

  function metasSetoresVisaoHtml(dados){
    estado.metasOriginais=dados;
    return metasSetoresHtml(estado.metasSimulacao?simularMetasSetores(dados):dados);
  }

  function premiacoesSetoresHtml(dados){
    const itens=(Array.isArray(dados?.premiacoes?.itens)?dados.premiacoes.itens:[]).filter(p=>p.nome&&/^https?:\/\//i.test(p.foto || '')).slice(0,24);
    const normalizar=nome=>String(nome || '').trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR').replace(/\s+/g,' ');
    const setoresPorPessoa=new Map();
    const equipes=dados?.equipesPremiacoes ?? dados?.equipes;
    (Array.isArray(equipes)?equipes:[]).forEach(g=>{
      const setor=String(g.setor || '').trim();if(!setor)return;
      (Array.isArray(g.equipe)?g.equipe:[]).forEach(p=>{
        const chave=normalizar(p.nome);if(!chave)return;
        if(!setoresPorPessoa.has(chave))setoresPorPessoa.set(chave,setor);
        else if(normalizar(setoresPorPessoa.get(chave))!==normalizar(setor))setoresPorPessoa.set(chave,'');
      });
    });
    const setorPremiado=p=>String(p.setor || '').trim() || [...new Set(String(p.nome).split(' · ').map(nome=>setoresPorPessoa.get(normalizar(nome))).filter(Boolean))].join(' · ') || 'Setor não informado';
    const podeAbrir=window.EasyLocPermissions?.hasPermission('rh.colaboradores.visualizar',false)===true;
    const acao=podeAbrir?'<button type="button" class="premiacoes-abrir" data-premiacoes-abrir>Abrir Central de Metas <span aria-hidden="true">↗</span></button>':'';
    const presente='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" aria-hidden="true"><path d="M3 8h18v4H3zM5 12v9h14v-9M12 8v13"/><path d="M12 8H8a3 3 0 1 1 3-3l1 3Zm0 0h4a3 3 0 1 0-3-3l-1 3Z"/></svg>';
    const fotos=itens.length?'<div class="premiacoes-grade" role="region" aria-label="Fotos da equipe recebendo as premiações" tabindex="0">'+itens.map(p=>'<figure class="premiacoes-item"><div class="premiacoes-foto"><span class="premiacoes-sem-foto" aria-hidden="true">'+presente+'<small>Foto indisponível</small></span><img src="'+esc(p.foto)+'" alt="'+esc(p.nome+' recebendo a premiação')+'" loading="lazy" onerror="this.remove()"></div><figcaption><b>'+esc(p.nome)+'</b><span class="premiacoes-setor">'+esc(setorPremiado(p))+'</span>'+(p.titulo?'<span>'+esc(p.titulo)+'</span>':'')+'<small>'+esc(mesCurto(p.mes))+'</small></figcaption></figure>').join('')+'</div>'+(itens.length>1?'<div class="premiacoes-controles"><button type="button" data-premiacoes-anterior aria-label="Fotos anteriores">‹</button><button type="button" class="premiacoes-pausa" data-premiacoes-pausa>Pausar fotos</button><button type="button" data-premiacoes-proxima aria-label="Próximas fotos">›</button></div>':''):'<div class="premiacoes-vazio">'+presente+'<p>'+esc(dados?.premiacoes?.indisponivel?'Não foi possível carregar as fotos das premiações agora.':'As fotos da equipe recebendo os presentes aparecerão aqui após o registro da entrega na Central de Metas.')+'</p></div>';
    return '<section class="quadro-premiacoes" aria-labelledby="premiacoesEquipeTitulo"><div class="premiacoes-topo"><div class="rd-titulo"><span class="rd-titulo-orn" aria-hidden="true"></span><h3 id="premiacoesEquipeTitulo">Premiações <em>da equipe</em></h3><span class="rd-titulo-orn" aria-hidden="true"></span></div>'+acao+'</div>'+fotos+'</section>';
  }

  function metasSetoresHtml(dados){
    const simulacao=dados?.simulacao===true;
    const chaveSetor=nome=>String(nome || '').trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR').replace(/\s+/g,' ');
    const equipes=new Map((Array.isArray(dados?.equipes)?dados.equipes:[]).map(g=>[chaveSetor(g.setor),g.equipe]));
    const setores = (Array.isArray(dados?.setores) ? dados.setores : []).slice().sort((a,b)=>String(a.setor).localeCompare(String(b.setor),'pt-BR'));
    const mes = /^\d{4}-\d{2}$/.test(dados?.mes || '') ? dados.mes : new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo'}).format(new Date()).slice(0,7);
    const ano = Number(mes.slice(0,4)), mesAtual = Number(mes.slice(5,7))-1;
    const trofeu = '<svg viewBox="0 0 100 112" fill="none" aria-hidden="true"><path class="trofeu-alca" d="M27 19H11v13c0 17 11 26 27 26M73 19h16v13c0 17-11 26-27 26"/><path class="trofeu-copo" d="M23 10h54v26c0 21-12 34-27 34S23 57 23 36V10Z"/><path class="trofeu-brilho" d="M33 17v20c0 11 3 18 9 23"/><path class="trofeu-haste" d="M46 69h8v23h-8z"/><path class="trofeu-base" d="M35 90h30l8 12H27l8-12Z"/><path class="trofeu-estrela" d="m50 26 4 9 10 1-8 7 2 11-8-6-8 6 2-11-8-7 10-1 4-9Z"/><path class="trofeu-pedestal" d="M24 103h52v5H24z"/></svg>';
    const valor = (v,u) => v==null || !Number.isFinite(Number(v)) ? '—' : Number(v).toLocaleString('pt-BR',{maximumFractionDigits:1})+(u==='%'?'%':u?' '+u:'');
    const linhas = setores.map(function(s,si){
      const equipe=(equipes.get(chaveSetor(s.setor)) || []).map(p=>{
        const nome=String(p.nome || ''),iniciais=nome.trim().split(/\s+/).slice(0,2).map(n=>n[0]).join('').toUpperCase();
        const foto=/^https?:\/\//i.test(p.foto || '')?'<img src="'+esc(p.foto)+'" alt="" loading="lazy" onerror="this.remove()">':'';
        return '<span class="quadro-equipe-avatar" role="listitem" aria-label="'+esc(nome)+'" title="'+esc(nome)+'"><span aria-hidden="true">'+esc(iniciais)+'</span>'+foto+'</span>';
      }).join('');
      const fotos=equipe?'<div class="quadro-equipe" role="list" aria-label="Equipe de '+esc(s.setor)+'" tabindex="0">'+equipe+'</div>':'';
      let painelInicial = '';
      const historico = new Map((s.historicoDisponivel===true && Array.isArray(s.historico) ? s.historico : []).filter(h=>/^\d{4}-\d{2}$/.test(h.mes || '') && h.mes.slice(0,4)===String(ano) && h.mes<=mes).map(h=>[h.mes,h]));
      const trofeus = s.historicoDisponivel===true ? [...historico.values()].filter(h=>h.status===true).length : null;
      const celulas = MESES_CURTOS.map(function(n,mi){
        const iso = ano+'-'+String(mi+1).padStart(2,'0'), h=historico.get(iso), atual=mi===mesAtual, futuro=mi>mesAtual;
        const fechado = !!h, status = fechado ? h.status : atual ? s.status : null;
        const indicadores = (fechado ? h.indicadores : atual ? s.indicadores : null) || [];
        const atingidos = indicadores.filter(i=>i.atingiu===true).length;
        const classe = status===true ? fechado?'ganho':'parcial' : status===false ? 'pendente' : futuro?'futuro':'sem-registro';
        const situacao = status===true ? simulacao?'Meta atingida · simulação':fechado?'Meta atingida · fechamento confirmado':'Meta atingida · parcial do mês' : status===false ? simulacao?'Em busca da meta · simulação':fechado?'Meta não atingida no fechamento':'Em busca da meta' : futuro?'Mês futuro' : fechado?'Resultado indisponível no fechamento' : atual?(s.motivo || 'Sem avaliação neste mês'):'Sem resultado fechado disponível';
        const detalhe = (indicadores.length ? '<ol class="quadro-timeline">'+indicadores.map(i=>'<li class="'+(i.atingiu===true?'atingido':i.atingiu===false?'pendente':'sem-resultado')+'"><span class="quadro-marco" aria-hidden="true">'+(i.atingiu===true?'✓':i.atingiu===false?'·':'—')+'</span><b>'+esc(i.nome)+'</b><p>'+esc(valor(i.real,i.unidade))+'<small> / '+esc(valor(i.meta,i.unidade))+'</small></p><span class="quadro-criterio-status">'+(i.atingiu===true?'Atingido':i.atingiu===false?'Em busca':'Sem resultado')+'</span></li>').join('')+'</ol>' : '<p class="quadro-sem-indicadores">'+esc(futuro?'As metas deste mês aparecerão quando o período começar.':fechado?'O fechamento registra o resultado do setor, mas não contém o detalhamento dos indicadores.':atual?(s.motivo === 'Resultados indisponíveis'?'Os resultados deste mês estão indisponíveis no momento.':'Ainda não há indicadores disponíveis para este setor neste mês.'):'Não há metas e resultados fechados disponíveis para este mês.')+'</p>');
        const selecionada = atual;
        if(selecionada) painelInicial=detalhe;
        return '<div class="quadro-celula"><button type="button" class="quadro-taca '+classe+'" data-quadro-setor="'+si+'" data-quadro-mes="'+mi+'" aria-pressed="'+selecionada+'" aria-controls="quadroMetasDetalhe-'+si+'" aria-label="'+esc(s.setor+' · '+MESES[mi]+' '+ano+': '+situacao)+'" title="'+esc(situacao)+'" tabindex="'+(selecionada?'0':'-1')+'"><span class="quadro-mes-nome" aria-hidden="true">'+n+'</span>'+trofeu+'<small aria-hidden="true">'+(indicadores.length?atingidos+'/'+indicadores.length:status===true?'✓':status===false?'—':'·')+'</small></button><template>'+detalhe+'</template></div>';
      }).join('');
      return '<article class="quadro-setor" aria-labelledby="quadroSetorNome-'+si+'"><header class="quadro-setor-topo"><div class="quadro-setor-identidade"><h3 id="quadroSetorNome-'+si+'">'+esc(s.setor)+'</h3>'+fotos+'</div><small class="quadro-total" title="'+(trofeus==null?'Histórico indisponível':'Conquistas confirmadas nos fechamentos do ano')+'">'+(trofeus==null?'Histórico indisponível':trofeus+' '+(trofeus===1?'troféu no ano':'troféus no ano'))+'</small></header><div class="quadro-tabela-caixa" role="group" aria-label="Taças dos doze meses de '+esc(s.setor)+'"><div class="quadro-tacas-grade">'+celulas+'</div></div><div class="quadro-detalhe" id="quadroMetasDetalhe-'+si+'" role="region" aria-label="Metas de '+esc(s.setor)+'" aria-live="polite">'+painelInicial+'</div></article>';
    }).join('');
    const controle=simulacao?'<div class="quadro-demo" role="status"><div><b>Simulação · janeiro a '+esc(MESES[mesAtual])+' de '+ano+'</b><p>Dados fictícios para visualizar as conquistas do ano. Fotos ilustrativas da equipe. Os resultados reais permanecem preservados.</p></div><button type="button" data-metas-demo="false">Ver dados reais</button></div>':'<div class="quadro-demo-acao"><button type="button" data-metas-demo="true">Simular conquistas do ano</button></div>';
    const topo = '<section class="secao cheia" id="metasSetores" data-metas-simulacao="'+simulacao+'"><div class="secao-topo metas-topo revelar"><div class="rd-titulo"><span class="rd-titulo-orn" aria-hidden="true"></span><h2>Metas <em>por setor</em></h2><span class="rd-titulo-orn" aria-hidden="true"></span></div></div>'+controle;
    if(!setores.length) return topo+'<p class="metas-vazio revelar">As metas dos setores estão indisponíveis no momento.</p>'+premiacoesSetoresHtml(dados)+'</section>';
    return topo+'<div class="quadro-metas"><div class="quadro-setores-grade">'+linhas+'</div></div>'+(dados?.avisos?.length?'<p class="quadro-nota">'+dados.avisos.map(esc).join(' ')+'</p>':'')+premiacoesSetoresHtml(dados)+'</section>';
  }

  function iniciarGaleriaPremiacoes(secao){
    encerrarPremiacoes?.();encerrarPremiacoes=null;
    const galeria=secao?.querySelector('.quadro-premiacoes'),grade=galeria?.querySelector('.premiacoes-grade'),controles=galeria?.querySelector('.premiacoes-controles');
    if(!grade || !controles)return;
    const originais=[...grade.children],copias=[];
    const copiar=original=>{
      const copia=original.cloneNode(true);
      copia.dataset.premiacoesCopia='true';copia.setAttribute('aria-hidden','true');copia.inert=true;
      copia.querySelectorAll('img').forEach(img=>img.alt='');copias.push(copia);return copia;
    };
    grade.prepend(...originais.map(copiar));
    grade.append(...originais.map(copiar),...originais.map(copiar));
    const movimento=window.matchMedia('(prefers-reduced-motion: reduce)');
    let pausado=movimento.matches,ciclo=0,posicao=0,destino=null,ultimoAplicado=0,anterior=0,quadro=0,tocando=false,interacaoAte=0,visivel=true;
    const botaoPausa=controles.querySelector('[data-premiacoes-pausa]');
    const ouvintes=[];
    const ouvir=(alvo,tipo,fn,opcoes)=>{alvo.addEventListener(tipo,fn,opcoes);ouvintes.push(()=>alvo.removeEventListener(tipo,fn,opcoes));};
    const atualizarPausa=()=>{botaoPausa.textContent=pausado?'Reproduzir fotos':'Pausar fotos';botaoPausa.setAttribute('aria-pressed',String(pausado));};
    const aplicar=()=>{grade.scrollLeft=posicao;ultimoAplicado=grade.scrollLeft;};
    function normalizar(){
      if(!ciclo)return;
      // A faixa repetida é idêntica: a troca de posição mantém as mesmas fotos à vista.
      while(posicao<ciclo){posicao+=ciclo;if(destino!=null)destino+=ciclo;}
      while(posicao>=ciclo*2){posicao-=ciclo;if(destino!=null)destino-=ciclo;}
    }
    function medir(){
      const fase=ciclo?((posicao-ciclo)%ciclo+ciclo)%ciclo/ciclo:0;
      ciclo=originais[0].offsetLeft-grade.firstElementChild.offsetLeft;
      posicao=ciclo*(1+fase);destino=null;aplicar();
      controles.hidden=false;
    }
    function mover(direcao){
      const passo=ciclo/originais.length;
      destino=(destino??posicao)+direcao*passo;
      if(movimento.matches){posicao=destino;destino=null;normalizar();aplicar();}
    }
    function animar(tempo){
      if(!grade.isConnected)return;
      const dt=anterior?Math.min(tempo-anterior,64):0;anterior=tempo;
      const antes=posicao;
      if(destino!=null){
        posicao+=(destino-posicao)*(1-Math.exp(-dt/85));
        if(Math.abs(destino-posicao)<.2){posicao=destino;destino=null;}
      }else if(!pausado && visivel && !document.hidden && !tocando && tempo>=interacaoAte && !galeria.matches(':focus-within')){
        posicao+=28*dt/1000;
      }
      normalizar();if(posicao!==antes)aplicar();
      quadro=requestAnimationFrame(animar);
    }
    ouvir(controles.querySelector('[data-premiacoes-anterior]'),'click',()=>mover(-1));
    ouvir(controles.querySelector('[data-premiacoes-proxima]'),'click',()=>mover(1));
    ouvir(botaoPausa,'click',()=>{pausado=!pausado;atualizarPausa();});
    ouvir(movimento,'change',()=>{if(movimento.matches)pausado=true;atualizarPausa();});
    ouvir(window,'resize',medir);
    ouvir(grade,'pointerdown',()=>{tocando=true;destino=null;});
    ouvir(window,'pointerup',()=>{if(tocando){tocando=false;interacaoAte=performance.now()+700;}});
    ouvir(window,'pointercancel',()=>{tocando=false;});
    ouvir(grade,'scroll',()=>{
      if(Math.abs(grade.scrollLeft-ultimoAplicado)>1){posicao=grade.scrollLeft;destino=null;interacaoAte=performance.now()+700;normalizar();aplicar();}
    },{passive:true});
    const observador=new IntersectionObserver(entradas=>{visivel=entradas[0].isIntersecting;});observador.observe(grade);
    medir();atualizarPausa();quadro=requestAnimationFrame(animar);
    encerrarPremiacoes=()=>{cancelAnimationFrame(quadro);observador.disconnect();ouvintes.forEach(remover=>remover());copias.forEach(copia=>copia.remove());grade.scrollLeft=0;};
  }

  function iniciarConquistasSetores(){
    const secao=document.getElementById('metasSetores');
    iniciarGaleriaPremiacoes(secao);
    if(!secao) return;
    secao.querySelector('[data-premiacoes-abrir]')?.addEventListener('click',()=>window.shellNavigate?.('Modulos/Chiavari/CentralMetas/central.html'));
    secao.querySelector('[data-metas-demo]')?.addEventListener('click',function(){
      estado.metasSimulacao=this.dataset.metasDemo==='true';
      try{sessionStorage.setItem('portal_metas_simulacao',String(estado.metasSimulacao));}catch(_){}
      const caixa=document.createElement('div');caixa.innerHTML=metasSetoresVisaoHtml(estado.metasOriginais);
      secao.replaceWith(caixa.firstElementChild);
      document.querySelectorAll('#metasSetores .revelar').forEach(el=>el.classList.add('visivel'));
      iniciarConquistasSetores();icones();
    });
    const botoes=[...secao.querySelectorAll('[data-quadro-setor]')];
    function selecionar(botao,focar,inicial){
      if(!botao)return;
      botoes.filter(b=>b.dataset.quadroSetor===botao.dataset.quadroSetor).forEach(b=>{const ativo=b===botao;b.setAttribute('aria-pressed',String(ativo));b.tabIndex=ativo?0:-1;});
      const painel=document.getElementById(botao.getAttribute('aria-controls'));
      painel.innerHTML=botao.parentElement.querySelector('template').innerHTML;
      painel.setAttribute('aria-label',botao.getAttribute('aria-label'));
      // Ao montar a tela não mede nada: medir aqui obrigava o navegador a recalcular a página inteira para cada
      // setor (17 vezes, segundos de tela travada logo depois da abertura; nov/2026).
      if(inicial)return;
      const caixa=botao.closest('.quadro-tabela-caixa'),limites=caixa.getBoundingClientRect(),r=botao.getBoundingClientRect();
      if(r.left<limites.left)caixa.scrollLeft-=limites.left-r.left+6;
      else if(r.right>limites.right)caixa.scrollLeft+=r.right-limites.right+6;
      if(focar)botao.focus();
    }
    botoes.forEach(b=>{
      b.addEventListener('click',()=>selecionar(b,false));
      b.addEventListener('keydown',e=>{
        const si=Number(b.dataset.quadroSetor),mi=Number(b.dataset.quadroMes);
        let setor=si,mes=mi;
        if(e.key==='ArrowRight')mes=Math.min(11,mi+1);else if(e.key==='ArrowLeft')mes=Math.max(0,mi-1);else if(e.key==='ArrowDown')setor=si+1;else if(e.key==='ArrowUp')setor=Math.max(0,si-1);else if(e.key==='Home')mes=0;else if(e.key==='End')mes=11;else return;
        e.preventDefault();selecionar(botoes.find(x=>Number(x.dataset.quadroSetor)===setor&&Number(x.dataset.quadroMes)===mes),true);
      });
    });
    botoes.filter(b=>b.getAttribute('aria-pressed')==='true').forEach(b=>selecionar(b,false,true));
  }


  function feedbacksDecoradoresHtml(dados){
    const itens = Array.isArray(dados?.itens) ? dados.itens.slice(0,6) : [];
    const dataFeedback = function(v){
      if(!v) return '';
      const d = new Date(String(v).length === 10 ? v + 'T12:00:00-03:00' : v);
      return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('pt-BR',{timeZone:'America/Sao_Paulo'});
    };
    const setores = {triagem:'Triagem',carregamento:'Carregamento',montagem:'Montagem'};
    const eventoHtml = function(e){
      return '<div class="fd-evento">' + (e.pedido ? '<span class="rd-pedido">' + esc(String(e.pedido).replace(/^#/,'')) + '</span>' : '') + '<span><b>' + esc(e.tipo || 'Evento') + '</b><small>' + esc([dataFeedback(e.data),e.local].filter(Boolean).join(' · ')) + '</small></span></div>';
    };
    const linhas = itens.map(function(f,index){
      const nome = String(f.decorador || 'Decorador'), iniciais = nome.trim().split(/\s+/).slice(0,2).map(n=>n[0]).join('').toUpperCase();
      const foto = /^https?:\/\//i.test(f.foto || '') ? '<img src="' + esc(f.foto) + '" alt="" loading="lazy" onerror="this.remove()">' : '';
      const respostas = (Array.isArray(f.respostas) ? f.respostas : []).filter(r=>Array.isArray(r.respostas) && r.respostas.some(v=>String(v || '').trim()));
      const observacoes = Object.entries(setores).filter(([k])=>String(f.observacoes_setor?.[k] || '').trim());
      const observacao = String(f.observacao || '').trim();
      const previa = observacao || (respostas.length ? [respostas[0].pergunta,respostas[0].respostas.join(', ')].filter(Boolean).join(': ') : observacoes.map(([k,n])=>n + ': ' + f.observacoes_setor[k]).join('\n'));
      const eventos = Array.isArray(f.eventos) ? f.eventos : [];
      const atencao = f.atencao === true && f.retorno_concluido !== true;
      const status = atencao ? 'Precisa de atenção' : f.atencao === true && f.retorno_concluido === true ? 'Retorno concluído' : 'Feedback recebido';
      return '<tr class="fd-linha"><td><div class="fd-decorador"><span class="fd-avatar" aria-hidden="true"><span>' + esc(iniciais) + '</span>' + foto + '</span><div><b class="fd-nome">' + esc(nome) + '</b><small>Registrado em ' + esc(dataFeedback(f.recebido_em)) + '</small></div></div></td><td>' + eventos.slice(0,1).map(eventoHtml).join('') + (eventos.length > 1 ? '<small class="fd-outros-eventos">+ ' + (eventos.length - 1) + ' evento(s) nesta avaliação</small>' : '') + '</td><td><p class="fd-relato">' + esc(previa || 'Avaliação registrada no pós-venda.') + '</p></td><td><span class="fd-status' + (atencao ? ' fd-status-atencao' : f.atencao === true ? ' fd-status-resolvido' : '') + '"><i aria-hidden="true"></i>' + status + '</span></td><td><button class="fd-ver" type="button" data-fd-avaliacao aria-expanded="false" aria-controls="fd-avaliacao-' + index + '" aria-label="Ver avaliação de ' + esc(nome) + '">Ver avaliação<i data-lucide="chevron-down" aria-hidden="true"></i></button></td></tr><tr class="fd-linha-detalhes" id="fd-avaliacao-' + index + '" hidden><td colspan="5"><div class="fd-completo"><h3>Avaliação de ' + esc(nome) + '</h3>' +
        (observacao ? '<div class="fd-observacao"><h4>Relato registrado</h4><p>' + esc(observacao) + '</p></div>' : '') +
        (respostas.length ? '<dl class="fd-respostas">' + respostas.map(r=>'<div' + (r.ruim === true ? ' class="fd-resposta-atencao"' : '') + '><dt>' + esc(r.pergunta || 'Avaliação') + '</dt><dd>' + esc(r.respostas.join(', ')) + '</dd></div>').join('') + '</dl>' : '') +
        observacoes.map(([k,n])=>'<div class="fd-observacao"><h4>' + n + '</h4><p>' + esc(f.observacoes_setor[k]) + '</p></div>').join('') +
        (eventos.length > 1 ? '<div class="fd-todos-eventos"><h4>Eventos desta avaliação</h4>' + eventos.map(eventoHtml).join('') + '</div>' : '') + '</div></td></tr>';
    }).join('');
    const podeAbrir = window.EasyLocPermissions?.hasPermission('comercial.pedidos.visualizar',false) === true;
    const vazio = dados?.indisponivel ? '<i data-lucide="cloud-off" aria-hidden="true"></i><p>Não foi possível carregar os feedbacks agora.</p><button type="button" data-fd-recarregar>Tentar novamente</button>' : dados ? '<i data-lucide="messages-square" aria-hidden="true"></i><p>Os próximos retornos dos decoradores aparecerão aqui.</p><small>As avaliações são registradas no Pós-venda após os eventos.</small>' : '<p role="status">Carregando os últimos feedbacks…</p>';
    const tabela = '<div class="fd-tabela-caixa" role="region" aria-label="Últimos feedbacks dos decoradores" tabindex="0"><table class="fd-tabela"><colgroup><col class="fd-col-decorador"><col class="fd-col-evento"><col class="fd-col-feedback"><col class="fd-col-situacao"><col class="fd-col-avaliacao"></colgroup><thead><tr>' + ['Decorador','Evento','Feedback','Situação','Avaliação'].map(t=>'<th scope="col">' + t + '</th>').join('') + '</tr></thead><tbody>' + (itens.length ? linhas : '<tr><td colspan="5"><div class="fd-vazio">' + vazio + '</div></td></tr>') + '</tbody></table></div>';
    return '<section class="secao cheia" id="feedbackDecoradores" aria-label="Feedback dos decoradores"><div class="secao-topo fd-topo revelar"><div class="rd-titulo"><span class="rd-titulo-orn" aria-hidden="true"></span><h2>Feedback <em>dos decoradores</em></h2><span class="rd-titulo-orn" aria-hidden="true"></span></div>' + (podeAbrir ? '<button class="fd-abrir" type="button" data-fd-abrir>Abrir o pós-venda<i data-lucide="arrow-up-right" aria-hidden="true"></i></button>' : '') + '</div>' + tabela + '</section>';
  }

  function iniciarFeedbacksDecoradores(){
    const secao = document.getElementById('feedbackDecoradores');
    secao?.querySelector('[data-fd-abrir]')?.addEventListener('click',()=>window.shellNavigate?.('Modulos/Chiavari/Feedback/feedback.html'));
    secao?.querySelectorAll('[data-fd-avaliacao]').forEach(botao=>botao.addEventListener('click',function(){
      const linha = document.getElementById(this.getAttribute('aria-controls'));
      if(!linha) return;
      const abrir = this.getAttribute('aria-expanded') !== 'true';
      this.setAttribute('aria-expanded',String(abrir));
      this.closest('tr').classList.toggle('fd-expandida',abrir);
      linha.hidden = !abrir;
    }));
    secao?.querySelector('[data-fd-recarregar]')?.addEventListener('click',async function(){
      this.disabled = true; this.textContent = 'Carregando…';
      await atualizarFeedbacksDecoradores();
    });
  }

  async function buscarFeedbacksDecoradores(){
    const sb = window.supabaseClient;
    const contexto = window.__CONTEXT || await window.aguardarContexto?.();
    if(!sb || !contexto?.empresa_id) return {indisponivel:true};
    const {data,error} = await sb.rpc('portal_feedbacks_decoradores',{p_empresa:contexto.empresa_id,p_limite:6});
    if(error) throw error;
    return {itens:Array.isArray(data?.itens) ? data.itens : []};
  }

  function atualizarFeedbacksDecoradores(){
    if(estado.feedbacksCarregando) return estado.feedbacksCarregando;
    estado.feedbacksCarregando = buscarFeedbacksDecoradores().catch(function(e){console.warn('[Feedback dos decoradores] não carregou:',e);return {indisponivel:true};}).then(function(dados){
      estado.feedbacksAtualizados = Date.now();
      if(estado.mural) estado.mural.feedbacksDecoradores = dados;
      const secao = document.getElementById('feedbackDecoradores');
      if(secao){secao.outerHTML = feedbacksDecoradoresHtml(dados);document.querySelectorAll('#feedbackDecoradores .revelar').forEach(el=>el.classList.add('visivel'));iniciarFeedbacksDecoradores();icones();}
      return dados;
    }).finally(function(){estado.feedbacksCarregando = null;});
    return estado.feedbacksCarregando;
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
        const j=await chamarMural('muralParabens',[form.dataset.destinatario,input.value]);if(!j.ok)throw Error(j.erro || 'Não foi possível enviar.');
        form.previousElementSibling.innerHTML=mensagensParabens(j.resultado);input.value='';status.textContent='Mensagem enviada!';
        if(form.dataset.destinatario==='todos'){if(estado.mural)estado.mural.parabensTodos=j.resultado;}else{const a=estado.mural?.aniversariantes?.find(a=>a.id===form.dataset.destinatario);if(a)a.mensagens=j.resultado;}
      }catch(err){status.textContent=err.message;}finally{botao.disabled=false;}
    }));
  }


  window.abrirAvisoPortal = function(){
    let modal=document.getElementById('novoAvisoPortal');
    if(!modal){
      modal=document.createElement('dialog');modal.id='novoAvisoPortal';
      /* Nov/2026: o comunicado é escrito OU um anexo (foto). Anexo: só a foto e até quando fica. */
      modal.innerHTML='<form><h2>Novo comunicado</h2><fieldset class="aviso-modo"><legend>O que você vai publicar?</legend><label><input type="radio" name="modo" value="escrito" checked><span>Algo escrito</span></label><label><input type="radio" name="modo" value="anexo"><span>Anexo (foto)</span></label></fieldset><div data-so="escrito"><label>Título<input name="titulo" maxlength="120"></label><label>Mensagem<textarea name="texto" rows="4" maxlength="1200"></textarea></label></div><div data-so="anexo" hidden><label class="aviso-anexo-campo">Foto<input name="anexo" type="file" accept="image/jpeg,image/png,image/webp"><span class="aviso-anexo-previa" hidden></span></label></div><label>Válido até (opcional)<input name="validoAte" type="date"></label><div data-so="escrito"><fieldset class="aviso-cores"><legend>Cor do comunicado</legend><label><input type="radio" name="cor" value="neutro" checked><span class="aviso-amostra aviso-cor-neutro"></span>Neutro</label><label><input type="radio" name="cor" value="areia" ><span class="aviso-amostra aviso-cor-areia"></span>Areia</label><label><input type="radio" name="cor" value="verde" ><span class="aviso-amostra aviso-cor-verde"></span>Verde</label><label><input type="radio" name="cor" value="azul" ><span class="aviso-amostra aviso-cor-azul"></span>Azul</label><label><input type="radio" name="cor" value="lavanda" ><span class="aviso-amostra aviso-cor-lavanda"></span>Lavanda</label></fieldset><label class="aviso-check"><input name="importante" type="checkbox">Importante</label><label class="aviso-check"><input name="fixado" type="checkbox">Fixar comunicado</label></div><p role="status"></p><footer><button type="button">Cancelar</button><button type="submit">Publicar</button></footer></form>';
      document.body.appendChild(modal);modal.querySelector('[type=button]').onclick=()=>modal.close();
      const limparPrevia=()=>{const pv=modal.querySelector('.aviso-anexo-previa');pv.hidden=true;pv.innerHTML='';};
      const aplicarModo=()=>{const m=modal.querySelector('[name=modo]:checked').value;modal.querySelectorAll('[data-so]').forEach(el=>{el.hidden=el.dataset.so!==m;});modal.querySelector('[role=status]').textContent='';};
      modal.querySelectorAll('[name=modo]').forEach(r=>r.addEventListener('change',aplicarModo));
      modal.querySelector('[name=anexo]').addEventListener('change',function(){const f=this.files[0],pv=modal.querySelector('.aviso-anexo-previa');if(!f){limparPrevia();return;}pv.hidden=false;pv.innerHTML='<img alt="" src="'+URL.createObjectURL(f)+'">';});
      modal.querySelector('form').onsubmit=async function(e){
        e.preventDefault();const f=e.currentTarget,b=f.querySelector('[type=submit]'),status=f.querySelector('[role=status]');
        const modoAnexo=f.elements.modo.value==='anexo';
        const arquivo=modoAnexo?f.elements.anexo.files[0]:null;
        let titulo,texto;
        if(modoAnexo){
          if(!arquivo){status.textContent='Escolha a foto.';return;}
          if(!/^image\//.test(arquivo.type)){status.textContent='Envie uma foto (JPG, PNG ou WebP).';return;}
          // O servidor exige título: vai um título técnico (não aparece no quadro), único para achar o aviso depois.
          titulo=('Anexo · '+(arquivo.name.replace(/\.[^.]+$/,'')||'foto')).slice(0,100)+' · '+Date.now().toString(36).slice(-5);texto=titulo;
        }else{
          titulo=f.elements.titulo.value.trim();texto=f.elements.texto.value.trim();
          if(!titulo){status.textContent='Escreva o título.';f.elements.titulo.focus();return;}
          if(!texto){status.textContent='Escreva a mensagem.';f.elements.texto.focus();return;}
        }
        b.disabled=true;status.textContent='Publicando...';
        try{
          const anexo=arquivo?await subirAnexoAviso(arquivo):null;
          const idsAntes=new Set(((estado.mural&&estado.mural.avisos)||[]).map(a=>a.id));
          const j=await chamarMural('muralPublicarAviso',[{titulo:titulo,texto:texto,validoAte:f.elements.validoAte.value,importante:!modoAnexo&&f.elements.importante.checked,fixado:!modoAnexo&&f.elements.fixado.checked,cor:modoAnexo?'neutro':f.elements.cor.value}]);if(!j.ok)throw Error(j.erro || 'Falha ao publicar.');
          const novo=Object.assign({},await buscarMural(),{resumoDia:estado.mural?.resumoDia,celebracao:estado.mural?.celebracao,numeros:estado.mural?.numeros,feedbacksDecoradores:estado.mural?.feedbacksDecoradores});
          if(anexo){const aviso=(novo.avisos||[]).filter(a=>!idsAntes.has(a.id)&&a.titulo===titulo)[0];if(aviso)await gravarAnexoAviso(aviso.id,anexo);}
          await juntarAnexos(novo);estado.mural=novo;montarMural();
          const pontos=document.querySelectorAll('#portalInicio .hero-ponto');pontos[pontos.length-1]?.click();
          f.reset();limparPrevia();aplicarModo();modal.close();
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
      // A Início é montada por baixo da abertura (antes de a logo voar): a abertura espera window.__portalInicioPronto.
  // Só não se monta DURANTE o voo: montar trava o navegador por alguns segundos e a logo engasgava no fim (nov/2026).
  const adiados = new Set();
  function aposAbertura(fn){
    const ab = document.getElementById("acervoAbertura");
    if(!ab || !ab.classList.contains("voando")){ fn(); return; }
    if(adiados.has(fn)) return;
    adiados.add(fn);
    window.addEventListener("acervo:abertura-fim", function(){ requestAnimationFrame(function(){ setTimeout(function(){ adiados.delete(fn); fn(); }, 0); }); }, { once: true });
  }

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
      const j=await chamarMural('muralCorAviso',[{id:select.dataset.id,cor:select.value}]);if(!j.ok)throw Error(j.erro || 'Falha ao salvar cor.');
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
      if(foto){
        // Nov/2026: aviso com foto mostra só a foto, grande (sem selo, data, título nem texto).
        return '<article class="qa-nota qa-so-foto com-foto" data-aviso="' + esc(a.id) + '" style="--i:' + i + ';--r:' + GIRO[i % 6] + 'deg">' +
          '<span class="qa-pino" aria-hidden="true"></span>' +
          '<button type="button" class="qa-foto" onclick="abrirAnexoAviso(\'' + esc(a.id) + '\')" aria-label="Ampliar a foto do aviso"><img src="' + esc(ax.url) + '" alt="Comunicado" loading="eager"></button>' +
          '<button type="button" class="qa-anexar" onclick="anexarAvisoPortal(\'' + esc(a.id) + '\')"><i data-lucide="paperclip" aria-hidden="true"></i>Trocar foto</button></article>';
      }
      return '<article class="qa-nota aviso-cor-' + cor(a) + (imp ? ' is-importante' : '') + (foto ? ' com-foto' : '') + (pdf ? ' com-pdf' : '') + '" data-aviso="' + esc(a.id) + '" style="--i:' + i + ';--r:' + GIRO[i % 6] + 'deg">' +
        '<span class="qa-pino" aria-hidden="true"></span>' +
        '<div class="qa-topo"><span class="qa-selo">' + (imp ? 'Importante' : 'Comunicado') + (a.fixado ? ' · Fixado' : '') + '</span><time>' + esc(avisoData(a.publicadoEm)) + '</time></div>' +
        '<h2>' + esc(a.titulo) + '</h2>' + (soTitulo ? '' : '<div class="qa-texto" tabindex="0">' + esc(a.texto || '') + '</div>') +
        (pdf ? '<a class="qa-pdf" href="' + esc(ax.url) + '" target="_blank" rel="noopener"><i data-lucide="file-text" aria-hidden="true"></i>Abrir PDF</a>' : '') +
        '<button type="button" class="qa-anexar" onclick="anexarAvisoPortal(\'' + esc(a.id) + '\')"><i data-lucide="paperclip" aria-hidden="true"></i>' + (ax ? 'Trocar anexo' : 'Anexar foto') + '</button>' +
        
        '<select class="aviso-cor-seletor" aria-label="Cor do papel" data-id="' + esc(a.id) + '" onchange="alterarCorAviso(this)">' + AV_CORES.map(function(c){ return '<option value="' + c[0] + '"' + (c[0] === cor(a) ? ' selected' : '') + '>' + c[1] + '</option>'; }).join('') + '</select></article>';
    });
    // Nov/2026: o "Novo comunicado" virou um ícone discreto no canto inferior esquerdo do destaque (.hero-novo-aviso).
    if(!avisos.length){ notas.push('<p class="qa-vazio">Nenhum comunicado por enquanto.</p>'); }
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
  // Nov/2026: "Nossos últimos números" lido do Supabase (só eventos do mês). O mural antigo lia a planilha do Cronograma, parada.
  async function buscarNumeros(){
    const sb = window.supabaseClient; if(!sb){ return null; }
    const contexto = window.__CONTEXT || await window.aguardarContexto?.(); const empresa = contexto && contexto.empresa_id;
    if(!empresa){ return null; }
    const { data, error } = await sb.rpc("portal_numeros_mes", { p_empresa: empresa });
    if(error){ throw error; }
    return data && data.mes ? { mes: data.mes, eventos: Number(data.eventos) || 0 } : null;
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
    const festive = window.EasyLocTheme?.activeFestiveTheme(window.__COMPANY_THEME);
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
        (festive && window.EasyLocFestive ? window.EasyLocFestive.welcomeHtml(festive.id, true) : celebracao ? celebracaoHtml(celebracao) :
        '<div class="hero-conteudo hero-slide hero-convite ativo" role="group" aria-roledescription="slide" aria-label="Participe da Ideia Premiada">' +
          '<div class="hero-data">Ideia Premiada · Sua visão faz a diferença</div><h1>A próxima melhoria<br>pode começar com você.</h1><p>Uma solução mais simples. Um cuidado com a equipe. Um novo jeito de fazer. Compartilhe sua ideia e ajude a Chiavari a evoluir.</p>' +
          '<div class="hero-atalhos"><button class="atalho atalho-ideia" type="button" onclick="shellNavigate(\'Modulos/RH/IdeiaPremiada/ideia-premiada.html\')"><i data-lucide="lightbulb"></i>Quero participar<i data-lucide="arrow-up-right"></i></button></div></div>') +
        (aniversariantesHero.length ? '<div class="hero-conteudo hero-slide hero-aniversario hero-aniversarios" role="group" aria-roledescription="slide" aria-label="Aniversariantes de ' + MESES[new Date().getMonth()] + '" aria-hidden="true" inert><div class="hero-aniversario-texto"><div class="hero-data">Aniversariantes de ' + MESES[new Date().getMonth()] + '</div><h1>Parabéns,<br>' + (aniversariantesHero.length === 1 ? esc(aniversariantesHero[0].nome) : 'aniversariantes') + '!</h1><p>Que o novo ano venha cheio de conquistas. É uma alegria ter vocês na nossa equipe.</p><div class="aniver-lista">' + aniversariantesHero.map(a => '<div class="aniver-pessoa' + (a.hoje ? ' is-hoje' : '') + '"><span class="aniver-pessoa-foto">' + fotoOuInicial(a.foto,a.nome) + '</span><b>' + esc(a.nome) + '</b><small>' + (a.hoje ? 'Hoje!' : 'Dia ' + esc(a.dia)) + (a.setor && !/^sem setor$/i.test(a.setor) ? ' · ' + esc(a.setor) : '') + '</small></div>').join('') + '</div></div>' + parabensHtml({ id: 'todos', titulo: aniversariantesHero.length === 1 ? 'Carinho da equipe' : 'Carinho para todos', mensagens: m.parabensTodos || aniversariantesHero.flatMap(a => a.mensagens || []) }) + '</div>' : '') +
        paginasAvisos.map(avisosSlideHtml).join('') +
        (m.numeros ? '<div class="hero-conteudo hero-slide hero-numeros" role="group" aria-roledescription="slide" aria-label="Nossos últimos números" aria-hidden="true" inert><div class="hero-numeros-texto"><div class="hero-data">' + esc(mesCurto(m.numeros.mes)) + ' &middot; Em equipe, vamos mais longe</div><h1>Nossos últimos números.</h1><p>Cada entrega é uma conquista de todos nós.</p><div class="hero-numeros-indicadores">' + [['eventos','Eventos']].map(n=>'<div><b data-contar="' + Math.max(0,Number(m.numeros[n[0]]) || 0) + '">0</b><span>' + n[1] + '</span></div>').join('') + '</div></div></div>' : '') +
        (m.numeros ? '<div class="hero-subida" aria-hidden="true"><svg viewBox="0 0 420 300" preserveAspectRatio="xMidYMid meet"><defs><linearGradient id="subidaBarra" x1="0" y1="1" x2="0" y2="0"><stop stop-color="#b08d57" stop-opacity=".05"/><stop offset="1" stop-color="#b08d57" stop-opacity=".32"/></linearGradient><linearGradient id="subidaLinha" x1="0" y1="1" x2="1" y2="0"><stop stop-color="#c9a24f" stop-opacity=".35"/><stop offset="1" stop-color="#9b793f"/></linearGradient><radialGradient id="subidaLuz"><stop stop-color="#e9cf9f" stop-opacity=".9"/><stop offset="1" stop-color="#e9cf9f" stop-opacity="0"/></radialGradient></defs><g class="subida-grade"><line x1="20" y1="260" x2="400" y2="260"/><line x1="20" y1="200" x2="400" y2="200"/><line x1="20" y1="140" x2="400" y2="140"/><line x1="20" y1="80" x2="400" y2="80"/></g><rect class="subida-barra" style="--i:0" x="38" y="220" width="28" height="40" rx="3"/><rect class="subida-barra" style="--i:1" x="98" y="190" width="28" height="70" rx="3"/><rect class="subida-barra" style="--i:2" x="158" y="164" width="28" height="96" rx="3"/><rect class="subida-barra" style="--i:3" x="218" y="122" width="28" height="138" rx="3"/><rect class="subida-barra" style="--i:4" x="278" y="84" width="28" height="176" rx="3"/><rect class="subida-barra" style="--i:5" x="338" y="38" width="28" height="222" rx="3"/><path class="subida-area" d="M30 238 C 110 225, 150 200, 200 160 S 300 70, 372 34 L372 260 L30 260 Z"/><path class="subida-linha" pathLength="1" d="M30 238 C 110 225, 150 200, 200 160 S 300 70, 372 34"/><path class="subida-seta" d="M356 30 L374 33 L366 49"/><circle class="subida-luz" cx="372" cy="34" r="30"/><circle class="subida-anel" cx="372" cy="34" r="6"/><circle class="subida-ponto" cx="372" cy="34" r="4.5"/></svg><span class="subida-traco" style="--i:0"></span><span class="subida-traco" style="--i:1"></span><span class="subida-traco" style="--i:2"></span></div>' : '') +
        '<button type="button" class="hero-novo-aviso" onclick="abrirAvisoPortal()" aria-label="Novo comunicado" title="Novo comunicado"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg></button>' +
        '<div class="hero-controles"><button class="hero-anterior" type="button" aria-label="Destaque anterior">‹</button><div class="hero-pontos">' + fotosHero.map((_, i) => '<button class="hero-ponto" type="button" aria-label="Ir para destaque ' + (i + 1) + '" aria-pressed="' + (i === 0) + '"></button>').join('') + '</div><button class="hero-proximo" type="button" aria-label="Próximo destaque">›</button><button class="hero-pausa" type="button">Pausar</button></div>' +
        '<div class="rolar" aria-hidden="true"></div>' +
      '</header>';

    // Resumo do dia (out/2026): etapas do Cronograma de hoje + agenda interna (banco, operacao_resumo_dia)
    html += resumoDiaHtml(m.resumoDia);
    html += feedbacksDecoradoresHtml(m.feedbacksDecoradores);
    html += metasSetoresVisaoHtml(m.metasSetores);

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

    document.getElementById("portalInicio").innerHTML = html;
    icones();
    iniciarAnimacoes();
    iniciarFila();
    iniciarHero();
    iniciarAvisos();
    iniciarDetalhesCronograma();
    iniciarFeedbacksDecoradores();
    iniciarConquistasSetores();
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
    function coresFogos(){
      const css = getComputedStyle(hero);
      return ['text', 'accent', 'art', 'glow'].map(role => css.getPropertyValue('--portal-hero-' + role).trim()).filter(Boolean);
    }

    function ajustar(){
      const r = canvas.getBoundingClientRect(), d = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = r.width * d; canvas.height = r.height * d;
      ctx.setTransform(d, 0, 0, d, 0, 0);
    }
    ajustar();
    window.addEventListener("resize", ajustar);

    function lancar(){
      const r = canvas.getBoundingClientRect();
      const cores = coresFogos();
      fogos.foguetes.push({
        x: r.width * (.12 + Math.random() * .76), y: r.height + 10,
        alvo: r.height * (.12 + Math.random() * .35), vy: -(6 + Math.random() * 3),
        cor: cores[Math.floor(Math.random() * cores.length)] || '#ffffff'
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
  /* Mural (nov/2026): avisos, aniversários, reconhecimentos e metas por setor saem da Edge Function central-metas
     do Supabase (tabelas portal_avisos, portal_parabens e central_*). Antes vinham da planilha do Portal pela Vercel. */
  async function chamarMural(fn, args){
    const sessao = await window.supabaseClient?.auth.getSession();
    const token = sessao?.data?.session?.access_token;
    if(!token){ return { ok:false, erro:'Sessão expirada. Entre de novo.' }; }
    const empresa = window.__CONTEXT?.empresa_id || sessionStorage.getItem('empresa_id') || '';
    try{
      const r = await fetch('https://awemuohtvwvrdzfxwrmd.supabase.co/functions/v1/central-metas', { method:'POST',
        headers:{ 'Content-Type':'application/json', apikey:'sb_publishable_tlm-v5vvX9jgChODJmDCtw_JqMxLtpZ', Authorization:'Bearer ' + token },
        body: JSON.stringify({ fn, args: args || [], empresa_id: empresa }) });
      const j = await r.json().catch(function(){ return { error:'Falha de conexão.' }; });
      return j.error ? { ok:false, erro:j.error } : { ok:true, resultado:j.resultado };
    }catch(e){ return { ok:false, erro:'Sem conexão com o servidor.' }; }
  }
  async function buscarMural(){
    const j = await chamarMural('muralDados');
    return j.ok ? j.resultado : null;
  }

  /* Resumo do dia lido direto do Supabase (out/2026): das tabelas da operação (operacao_etapas,
     pessoas, caminhões e operacao_agenda) pela função operacao_resumo_dia — toda a equipe vê,
     só leitura. Antes vinha da planilha do Cronograma. */
  const RESUMO_ORDEM = ["Triagem (Separação)", "Carregamento", "Montagem", "Desmontagem", "Descarregamento", "Triagem (Conferência)"];
  async function detalhesResumoDia(sb,etapas){
    const fotos={},locais=new Map(),clientes=new Map(),fotosCaminhoes=Object.create(null);
    const carregarCaminhoes=async()=>{
      const contexto=window.__CONTEXT||await window.aguardarContexto?.(),empresa=contexto?.empresa_id;
      const codigos=[...new Set(etapas.flatMap(e=>Array.isArray(e.caminhao)?e.caminhao:String(e.caminhao||'').split(/[|,]/)).map(codigo=>String(codigo).trim()).filter(Boolean))];
      if(!empresa||!codigos.length||!sb.from)return;
      for(let i=0;i<codigos.length;i+=100){const r=await sb.from('caminhoes').select('codigo,foto_url').eq('empresa_id',empresa).in('codigo',codigos.slice(i,i+100));if(r.error)return;(r.data||[]).forEach(c=>{if(/^https?:\/\//i.test(c.foto_url||''))fotosCaminhoes[c.codigo]=c.foto_url;});}
    };
    const carregarPessoas=async()=>{
      const r=await sb.rpc('operacao_pessoas');if(r.error)return;
      const pessoas=r.data||[],paths=[...new Set(pessoas.filter(p=>!p.free&&p.foto_url&&!/^https?:\/\//i.test(p.foto_url)).map(p=>p.foto_url))];
      const assinadas=new Map();
      if(paths.length&&sb.storage)for(let i=0;i<paths.length;i+=100){const lote=await sb.storage.from('funcionarios-fotos').createSignedUrls(paths.slice(i,i+100),3600);if(!lote.error)(lote.data||[]).forEach(f=>{if(f.signedUrl)assinadas.set(f.path,f.signedUrl);});}
      pessoas.forEach(p=>{const url=assinadas.get(p.foto_url)||p.foto_url;if(/^https?:\/\//i.test(url||''))fotos[p.nome]=url;});
    };
    const carregarPedidos=async()=>{
      const contexto=window.__CONTEXT||await window.aguardarContexto?.(),empresa=contexto?.empresa_id;
      const numeros=[...new Set(etapas.map(e=>e.pedido).filter(Boolean))];if(!empresa||!numeros.length||!sb.from)return;
      const pedidos=[];for(let i=0;i<numeros.length;i+=100){const r=await sb.from('separacoes_pedidos').select('numero_pedido,local_id,cliente_id').eq('empresa_id',empresa).in('numero_pedido',numeros.slice(i,i+100));if(r.error)return;pedidos.push(...r.data||[]);}
      const carregarClientes=async()=>{
        const ids=[...new Set(pedidos.map(p=>p.cliente_id).filter(Boolean))],retratos=new Map();
        for(let i=0;i<ids.length;i+=100){const r=await sb.from('clientes_empresas').select('id,catalogo_logo_url').eq('empresa_id',empresa).in('id',ids.slice(i,i+100));if(r.error)return;(r.data||[]).forEach(c=>{if(/^https?:\/\//i.test(c.catalogo_logo_url||''))retratos.set(c.id,c.catalogo_logo_url);});}
        pedidos.forEach(p=>{if(retratos.has(p.cliente_id))clientes.set(String(p.numero_pedido),retratos.get(p.cliente_id));});
      };
      const carregarLocais=async()=>{
        const ids=[...new Set(pedidos.map(p=>p.local_id).filter(Boolean))],enderecos=new Map();
        for(let i=0;i<ids.length;i+=100){const r=await sb.from('locais_empresas').select('id,endereco,numero_endereco').eq('empresa_id',empresa).in('id',ids.slice(i,i+100));if(r.error)return;(r.data||[]).forEach(l=>{const endereco=String(l.endereco||'').trim(),numero=String(l.numero_endereco||'').trim();enderecos.set(l.id,[endereco,numero&&!endereco.includes(numero)?numero:''].filter(Boolean).join(', '));});}
        pedidos.forEach(p=>{if(enderecos.get(p.local_id))locais.set(String(p.numero_pedido),enderecos.get(p.local_id));});
      };
      await Promise.allSettled([carregarClientes(),carregarLocais()]);
    };
    await Promise.allSettled([carregarPessoas(),carregarPedidos(),carregarCaminhoes()]);
    return {fotos,locais,clientes,fotosCaminhoes};
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
        pedido: e.pedido || "", cliente: e.cliente || "", cliente_foto_url: detalhes.clientes.get(String(e.pedido)) || '', local: [e.local,detalhes.locais.get(String(e.pedido))&&!String(e.local||'').includes(detalhes.locais.get(String(e.pedido)))?detalhes.locais.get(String(e.pedido)):''].filter(Boolean).join(' - '), horario: e.horario || "",
        caminhao: e.caminhao || "", responsavel: e.responsavel || "", equipe: e.equipe || ""
      });
    });
    const porHora = function(a, b){ return (a.horario || "99").localeCompare(b.horario || "99"); };
    const etapas = Object.keys(grupos).sort(function(a, b){
      const ia = RESUMO_ORDEM.indexOf(a), ib = RESUMO_ORDEM.indexOf(b);
      return ((ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib)) || a.localeCompare(b);
    }).map(function(etapa){ const itens = grupos[etapa].sort(porHora); return { etapa: etapa, total: itens.length, itens: itens }; });
    const agenda = (data.agenda || []).slice().sort(porHora);
    return { data: data.data, fotos:detalhes.fotos, fotosCaminhoes:detalhes.fotosCaminhoes, totalEtapas: etapas.reduce(function(s, g){ return s + g.total; }, 0), etapas: etapas, agenda: agenda };
  }

  // Enquanto a abertura (logo voando até o menu) está na tela, a Início não é montada: montar o mural trava o
  // navegador por alguns segundos e a logo engasgava no fim do voo (nov/2026). Monta assim que a abertura sai.
  function aposAbertura(fn){
    if(!document.getElementById("acervoAbertura")){ fn(); return; }
    let feito = false;
    const vai = function(){ if(feito) return; feito = true; requestAnimationFrame(function(){ setTimeout(fn, 0); }); };
    window.addEventListener("acervo:abertura-fim", vai, { once: true });
    setTimeout(function(){ if(!document.getElementById("acervoAbertura")) vai(); }, 12000);
  }

  function mostrar(){
    const raiz = document.getElementById("portalInicio");
    if(!raiz){ return; }
    if(!raiz.innerHTML.trim()){ aposAbertura(function(){ if(!raiz.innerHTML.trim()) montarMural(); }); }
    if(estado.mural || estado.carregando){
      if(estado.mural && Date.now() - (estado.feedbacksAtualizados || 0) > 60000) atualizarFeedbacksDecoradores();
      return;
    }
    estado.carregando = Promise.all([
      buscarMural().catch(function(e){ console.warn("[Mural] não carregou:", e); return null; }),
      buscarResumoDia().catch(function(e){ console.warn("[Resumo do dia] não carregou:", e); return null; }),
      buscarCelebracao().catch(function(e){ console.warn("[Ideia premiada] não carregou:", e); return null; }),
      buscarNumeros().catch(function(e){ console.warn("[Números do mês] não carregou:", e); return null; }),
      atualizarFeedbacksDecoradores()
    ])
      .then(function(r){
        const m = r[0], resumo = r[1] || (m && m.resumoDia) || null, celebracao = r[2], numeros = r[3];
        if(m || resumo || numeros || r[4] || (celebracao && (celebracao.ideias || []).length)){ estado.mural = Object.assign({}, m || {}, { resumoDia: resumo, celebracao: celebracao, numeros: numeros || (m && m.numeros) || null, feedbacksDecoradores:r[4] }); aposAbertura(montarMural);
          juntarAnexos(estado.mural).then(function(mm){ if(mm === estado.mural && (mm.avisos || []).some(function(a){ return a.anexo; })){ aposAbertura(montarMural); } }); }
      })
      .catch(function(e){ console.warn("[Mural] não carregou:", e); })
      .finally(function(){ estado.carregando = null; window.__portalInicioPronto = true; });
  }

  Object.assign(window, { cliqueFila: cliqueFila, moverFila: moverFila, irFila: irFila, abrirLuz: abrirLuz, fecharLuz: fecharLuz });
  window.portalMural = { mostrar: mostrar };
  let lastFestive = window.EasyLocTheme?.activeFestiveTheme(window.__COMPANY_THEME)?.id || '';
  window.addEventListener('easyloc:themechange', event => {
    const next = window.EasyLocTheme?.activeFestiveTheme(event.detail)?.id || '';
    if (next === lastFestive) return;
    lastFestive = next;
    if (document.getElementById('portalInicio')?.innerHTML.trim()) montarMural();
  });
  if(document.body.classList.contains("portal-em-inicio")){ mostrar(); }
})();
