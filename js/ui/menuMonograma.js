// Monograma do menu fechado (pedido do usuário, out/2026): com o menu recolhido, o espaço em cima dos ícones mostra a
// PRÓPRIA logo da empresa recortada no primeiro bloco de letras (na Chiavari, o "Ch"). Não é um desenho novo: o recorte
// sai dos pixels da logo que está em #sidebarLogo — o primeiro grupo de colunas com tinta até a primeira separação
// vertical. Fica em branco (como a logo do menu) e guardado no localStorage por endereço da logo, então o script
// anti-flash do dashboard.html já mostra o recorte antes de a página terminar de carregar.
(function(){
  const CHAVE = "easyloc_monograma";
  const logo = document.getElementById("sidebarLogo");
  const mono = document.getElementById("sidebarMonograma");
  const botao = logo?.closest(".menu-nome");
  if(!logo || !mono || !botao) return;

  // Endereço sem o ?v= de cache, para o mesmo arquivo não gerar recortes diferentes.
  const limpar = (url) => String(url || "").replace(/([?&])v=[^&]*(&?)/, (m, a, b) => (b ? a : ""));

  function aplicar(dataUrl){
    if(dataUrl){ mono.src = dataUrl; mono.hidden = false; botao.classList.add("tem-monograma"); }
    else { mono.removeAttribute("src"); mono.hidden = true; botao.classList.remove("tem-monograma"); }
  }

  // Devolve o recorte (data URL, PNG branco com fundo transparente) ou "" se a logo não tem um bloco inicial separado.
  async function recortar(src){
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = src;
    await img.decode();
    const w = img.naturalWidth, h = img.naturalHeight;
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    const px = ctx.getImageData(0, 0, w, h).data;
    const tinta = (x, y) => px[(y * w + x) * 4 + 3] > 40;
    const colunaTemTinta = new Array(w).fill(false);
    for(let x = 0; x < w; x++) for(let y = 0; y < h; y++) if(tinta(x, y)){ colunaTemTinta[x] = true; break; }
    const esquerda = colunaTemTinta.indexOf(true), direita = colunaTemTinta.lastIndexOf(true);
    if(esquerda < 0) return "";
    // Primeira separação: ao menos ~0,5% da largura sem tinta (na Chiavari, entre o "h" e o "IAVARI").
    const vao = Math.max(2, Math.round(w * 0.005));
    let fim = -1;
    for(let x = esquerda, vazio = 0; x <= direita; x++){
      if(colunaTemTinta[x]) vazio = 0;
      else if(++vazio >= vao){ fim = x - vazio; break; }
    }
    // Sem separação, ou o primeiro bloco já é quase a logo inteira: não é um monograma.
    if(fim < 0 || (fim - esquerda + 1) > (direita - esquerda + 1) * 0.6) return "";
    let topo = h, base = -1;
    for(let y = 0; y < h; y++) for(let x = esquerda; x <= fim; x++) if(tinta(x, y)){ topo = Math.min(topo, y); base = Math.max(base, y); break; }
    const cw = fim - esquerda + 1, ch = base - topo + 1;
    const alvo = 160; // altura do recorte guardado (o menu mostra em ~34px; sobra pra telas de alta densidade)
    const escala = Math.min(1, alvo / ch);
    const out = document.createElement("canvas");
    out.width = Math.max(1, Math.round(cw * escala)); out.height = Math.max(1, Math.round(ch * escala));
    const o = out.getContext("2d");
    o.drawImage(img, esquerda, topo, cw, ch, 0, 0, out.width, out.height);
    // Branco onde houver tinta (mesmo efeito do filter: brightness(0) invert(1) da logo do menu).
    o.globalCompositeOperation = "source-in";
    o.fillStyle = "#fff"; o.fillRect(0, 0, out.width, out.height);
    return out.toDataURL("image/png");
  }

  let ultimo = "";
  async function atualizar(){
    const src = logo.currentSrc || logo.src;
    const chave = limpar(src);
    if(!chave || chave === ultimo) return;
    ultimo = chave;
    let cache = null;
    try { cache = JSON.parse(localStorage.getItem(CHAVE) || "null"); } catch {}
    if(cache?.url === chave){ aplicar(cache.img); return; }
    try {
      const recorte = await recortar(src);
      if(limpar(logo.currentSrc || logo.src) !== chave) return; // a logo trocou no meio do caminho
      aplicar(recorte);
      try { localStorage.setItem(CHAVE, JSON.stringify({ url: chave, img: recorte })); } catch {}
    } catch(error){
      console.warn("[Menu] Não foi possível recortar a logo para o menu fechado:", error);
      aplicar("");
    }
  }

  logo.addEventListener("load", atualizar);
  new MutationObserver(atualizar).observe(logo, { attributes: true, attributeFilter: ["src"] });
  if(logo.complete && logo.naturalWidth) atualizar();
})();
