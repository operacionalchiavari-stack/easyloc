/* =====================================================
   KITS – MODAL
===================================================== */

const supabase = window.supabaseClient;

let kitItensDisponiveis = [];

let kitZoom = 1;
let kitZoomInterval = null;
/* ===============================
   ABRIR MODAL
=============================== */

window.kits_openAdd = async function(){

  const modal = document.getElementById("kitsModal");

  if(!modal){
    console.error("Modal de kit não encontrado");
    return;
  }

modal.style.display = "flex";

kitZoom = 1;

const img = document.getElementById("kitFotoPreview");
if(img){
  img.style.transform = "scale(1)";
}

await kits_carregarItens();

  document.getElementById("kitItensBody").innerHTML="";

  document.getElementById("kitCodigo").value="";
  document.getElementById("kitProduto").value="";
  document.getElementById("kitMaterial").value="";
  document.getElementById("kitCor").value="";

  kits_addItem();

};


/* ===============================
   FECHAR MODAL
=============================== */

window.kits_closeModal = function(){

  const modal = document.getElementById("kitsModal");
  if(!modal) return;

  modal.style.display = "none";

  /* limpar campos */

  document.getElementById("kitId").value = "";

  document.getElementById("kitCodigo").value = "";
  document.getElementById("kitProduto").value = "";
  document.getElementById("kitMaterial").value = "";
  document.getElementById("kitCor").value = "";
  document.getElementById("kitDescricaoComplementar").value = "";
  document.getElementById("kitDescricaoTotal").value = "";

  document.getElementById("kitFamilia").value = "";
  document.getElementById("kitCategoria").value = "";

  document.getElementById("kitLargura").value = "";
  document.getElementById("kitAltura").value = "";
  document.getElementById("kitProfundidade").value = "";

  document.getElementById("kitItensBody").innerHTML = "";

  document.getElementById("kitTotalCusto").innerText = "R$ 0,00";
  document.getElementById("kitTotalReposicao").innerText = "R$ 0,00";
  document.getElementById("kitTotalLocacao").innerText = "R$ 0,00";

  const img = document.getElementById("kitFotoPreview");

  if(img){
    img.src = img.dataset.placeholder;
  }

};


/* ===============================
   CARREGAR ITENS
=============================== */

async function kits_carregarItens(){

  const empresaId = window.__CONTEXT?.empresa_id;

  if(!empresaId){
    console.warn("Empresa não encontrada");
    return;
  }

const { data, error } = await supabase
  .from("itens")
.select("id,produto,descricao_total,valor_locacao,valor_reposicao,custo,foto_url,tipo")
  .eq("empresa_id",empresaId)
  .neq("tipo","Kit")
  .order("descricao_total");

  if(error){
    console.error(error);
    return;
  }

  kitItensDisponiveis = data || [];

}


/* ===============================
   ADICIONAR ITEM AO KIT
=============================== */

window.kits_addItem = function(){

  const body = document.getElementById("kitItensBody");

  if(!body) return;

  const row = document.createElement("tr");
  row.className="kit-item-row";

row.innerHTML = `

<td class="kit-item-foto">
<img class="kit-foto-preview" src="https://awemuohtvwvrdzfxwrmd.supabase.co/storage/v1/object/public/logos/placeholders/sem-foto.png">
</td>

<td class="kit-item-busca">

<input
type="text"
class="kit-item-input"
placeholder="Buscar item..."
autocomplete="off">

<div class="kit-item-dropdown"></div>

</td>

<td>
<input type="number" class="kit-item-qtd" value="1" min="1">
</td>

<td class="valor-custo">
R$ 0,00
</td>

<td class="valor-reposicao">
R$ 0,00
</td>

<td class="valor-locacao">
R$ 0,00
</td>

<td>
<button class="remove">×</button>
</td>

`;

  body.appendChild(row);

const input = row.querySelector(".kit-item-input");
const dropdown = row.querySelector(".kit-item-dropdown");

input.addEventListener("input",()=>{
  kits_buscaItem(input,dropdown,row);
});

row.querySelector(".kit-item-qtd")
.addEventListener("input",kits_updateValores);

  row.querySelector(".remove").onclick=()=>{
    row.remove();
    kits_updateValores();
  };

};



/* ===============================
   ATUALIZAR FOTO DO ITEM
=============================== */

function kits_atualizarFoto(row){

  const img = row.querySelector(".kit-foto-preview");
  if(!img) return;

  const foto = row.dataset.foto;

  img.src = foto
    ? foto
    : "https://awemuohtvwvrdzfxwrmd.supabase.co/storage/v1/object/public/logos/placeholders/sem-foto.png";

}
function formatarMoeda(valor){

  return valor.toLocaleString("pt-BR",{
    style:"currency",
    currency:"BRL"
  });

}

/* ===============================
   ATUALIZAR VALORES
=============================== */

function kits_updateValores(){

  let totalCusto = 0;
  let totalLocacao = 0;
  let totalReposicao = 0;

  document.querySelectorAll(".kit-item-row").forEach(row=>{

    const qtd = parseFloat(
      row.querySelector(".kit-item-qtd").value || 0
    );

    const valorLocacao = parseFloat(
      row.dataset.valor || 0
    );

    const valorReposicao = parseFloat(
      row.dataset.reposicao || 0
    );

    const custo = parseFloat(
      row.dataset.custo || 0
    );

    const subtotalCusto = custo * qtd;
    const subtotalLocacao = valorLocacao * qtd;
    const subtotalReposicao = valorReposicao * qtd;

    row.querySelector(".valor-custo").innerText =
      formatarMoeda(subtotalCusto);

    row.querySelector(".valor-locacao").innerText =
      formatarMoeda(subtotalLocacao);

    row.querySelector(".valor-reposicao").innerText =
      formatarMoeda(subtotalReposicao);

    totalCusto += subtotalCusto;
    totalLocacao += subtotalLocacao;
    totalReposicao += subtotalReposicao;

  });

  const totalCustoCampo = document.getElementById("kitTotalCusto");
  const totalLocacaoCampo = document.getElementById("kitTotalLocacao");
  const totalReposicaoCampo = document.getElementById("kitTotalReposicao");

  if(totalCustoCampo)
    totalCustoCampo.innerText = formatarMoeda(totalCusto);

  if(totalLocacaoCampo)
    totalLocacaoCampo.innerText = formatarMoeda(totalLocacao);

  if(totalReposicaoCampo)
    totalReposicaoCampo.innerText = formatarMoeda(totalReposicao);

}

/* ===============================
   SALVAR KIT
=============================== */

window.kits_salvar = async function(){

  const empresaId = window.__CONTEXT?.empresa_id;

  const codigo = document.getElementById("kitCodigo")?.value;
  const produto = document.getElementById("kitProduto")?.value;

if(!codigo || !produto){
  alerta("Preencha código e produto.");
  return;
}

const material =
document.getElementById("kitMaterial")?.value || "";

const cor =
document.getElementById("kitCor")?.value || "";

const descricaoComplementar =
document.getElementById("kitDescricaoComplementar")?.value || "";

const descricaoTotal =
document.getElementById("kitDescricaoTotal")?.value || "";

const largura =
parseFloat(document.getElementById("kitLargura")?.value || 0);

const altura =
parseFloat(document.getElementById("kitAltura")?.value || 0);

const profundidade =
parseFloat(document.getElementById("kitProfundidade")?.value || 0);

const familia =
document.getElementById("kitFamilia")?.value || "";

const categoria =
document.getElementById("kitCategoria")?.value || "";

const exibirSite =
document.getElementById("kitExibirSite")?.value === "true";

/* ===============================
   PEGAR VALORES DO MODAL
=============================== */

function parseMoeda(texto){
  if(!texto) return 0;

  return parseFloat(
    texto
      .replace("R$","")
      .replace(/\./g,"")
      .replace(",",".")
      .trim()
  ) || 0;
}

const totalLocacao =
parseMoeda(
  document.getElementById("kitTotalLocacao")?.innerText
);

const totalReposicao =
parseMoeda(
  document.getElementById("kitTotalReposicao")?.innerText
);

const totalCusto =
parseMoeda(
  document.getElementById("kitTotalCusto")?.innerText
);


const kitIdExistente = document.getElementById("kitId")?.value;

let kit;
let error;

if(kitIdExistente){

  /* UPDATE */

  const res = await supabase
  .from("itens")
  .update({

    codigo: codigo,
    produto: produto,

    material: material,
    cor: cor,

    descricao_complementar: descricaoComplementar,
    descricao_total: descricaoTotal,

    largura: largura,
    altura: altura,
    profundidade: profundidade,

    familia: familia,
    categoria: categoria,

    valor_locacao: totalLocacao,
    valor_reposicao: totalReposicao,
    custo: totalCusto,

    exibir_no_site: exibirSite,
    ativo: kitStatus === "Ativo"

  })
  .eq("id", kitIdExistente)
  .select()
  .single();

  kit = res.data;
  error = res.error;

}else{

  /* INSERT */

  const res = await supabase
  .from("itens")
  .insert({

    empresa_id: empresaId,

    codigo: codigo,
    produto: produto,

    material: material,
    cor: cor,

    descricao_complementar: descricaoComplementar,
    descricao_total: descricaoTotal,

    largura: largura,
    altura: altura,
    profundidade: profundidade,

    familia: familia,
    categoria: categoria,

    setor_estoque: "Kits",

    valor_locacao: totalLocacao,
    valor_reposicao: totalReposicao,
    custo: totalCusto,

    foto_url: null,

    tipo: "Kit",

    exibir_no_site: exibirSite,
    ativo: kitStatus === "Ativo"

  })
  .select()
  .single();

  kit = res.data;
  error = res.error;

}
/* ===============================
   UPLOAD FOTO DO KIT
=============================== */

const inputFoto = document.getElementById("kitFotoInput");
const fileFoto = inputFoto?.files?.[0];

if(fileFoto){

  const filePath =
  `${empresaId}/${kitId}/principal.png`;

  const { error:uploadError } =
  await supabase.storage
  .from("itens")
  .upload(filePath, fileFoto, { upsert:true });

  if(uploadError){
    console.error("Erro upload foto kit:", uploadError);
  }else{

    const { data } = supabase.storage
    .from("itens")
    .getPublicUrl(filePath);

    const fotoUrl = data.publicUrl;

    await supabase
    .from("itens")
    .update({ foto_url: fotoUrl })
    .eq("id", kitId);

  }

}

  const rows = document.querySelectorAll(".kit-item-row");

for(const row of rows){

  const itemId = row.dataset.itemId;

  const qtd = parseFloat(
    row.querySelector(".kit-item-qtd")?.value || 1
  );

if(!itemId || qtd <= 0){
  continue;
}

  const { error:compError } = await supabase
  .from("kit_itens")
  .insert({
    empresa_id: empresaId,
    kit_id: kitId,
    item_id: itemId,
    quantidade: qtd
  });

  if(compError){
    console.error("Erro salvando componente:", compError);
  }

}


  document.getElementById("kitItensBody").innerHTML="";

  kits_closeModal();

};
function kits_buscaItem(input,dropdown,row){

const termo = input.value.toLowerCase();

dropdown.innerHTML="";

const resultados = kitItensDisponiveis.filter(i => {

const texto = (i.descricao_total || i.produto || "").toLowerCase();

return texto.includes(termo);

}).slice(0,20); // limita resultados

resultados.forEach(i=>{

const div = document.createElement("div");

div.className="kit-item-option";

div.innerHTML = `
<strong>${i.produto}</strong>
<div style="font-size:12px;color:#64748b;">
${i.descricao_total || ""}
</div>
`;

div.onclick = ()=>{

input.value = i.descricao_total || i.produto;

row.dataset.itemId = i.id;
row.dataset.valor = i.valor_locacao;
row.dataset.reposicao = i.valor_reposicao;
row.dataset.custo = i.custo || 0;
row.dataset.foto = i.foto_url;
kits_atualizarFoto(row);

kits_updateValores();

dropdown.style.display="none";

};

dropdown.appendChild(div);

});

dropdown.style.display="block";

}
window.kits_startZoom = function(direction){

  const img = document.querySelector("#kitsModal #kitFotoPreview");

  if(!img) return;

  clearInterval(kitZoomInterval);

  kitZoomInterval = setInterval(()=>{

    kitZoom += direction * 0.03;

    if(kitZoom < 0.5) kitZoom = 0.5;
    if(kitZoom > 3) kitZoom = 3;

    img.style.transform = `scale(${kitZoom})`;

  },20);

};
window.kits_stopZoom = function(){

  clearInterval(kitZoomInterval);
  kitZoomInterval = null;

};
window.kits_selecionarFoto = function(){

  document.getElementById("kitFotoInput").click();

};
const kitFotoInput = document.getElementById("kitFotoInput");

if(kitFotoInput){

  kitFotoInput.addEventListener("change",function(e){

    const file = e.target.files[0];

    if(!file) return;

    const reader = new FileReader();

    reader.onload = function(ev){

      const img = document.getElementById("kitFotoPreview");

      if(img){
        img.src = ev.target.result;
      }

    };

    reader.readAsDataURL(file);

  });

}
function kits_gerarDescricao(){

  const produto =
    document.getElementById("kitProduto")?.value || "";

  const material =
    document.getElementById("kitMaterial")?.value || "";

  const cor =
    document.getElementById("kitCor")?.value || "";

  const desc =
    document.getElementById("kitDescricaoComplementar")?.value || "";

  const largura =
    document.getElementById("kitLargura")?.value || "";

  const altura =
    document.getElementById("kitAltura")?.value || "";

  const profundidade =
    document.getElementById("kitProfundidade")?.value || "";

  let texto = produto;

  if(material) texto += ` ${material}`;
  if(cor) texto += ` ${cor}`;
  if(desc) texto += ` ${desc}`;

  let medidas = [];

  if(largura) medidas.push(`(L) ${largura}`);
  if(altura) medidas.push(`(A) ${altura}`);
  if(profundidade) medidas.push(`(P) ${profundidade}`);

  if(medidas.length){
    texto += " " + medidas.join(" ");
  }

  document.getElementById("kitDescricaoTotal").value = texto;

}
[
"kitProduto",
"kitMaterial",
"kitCor",
"kitDescricaoComplementar",
"kitLargura",
"kitAltura",
"kitProfundidade"
].forEach(id=>{

  const el = document.getElementById(id);

  if(el){
    el.addEventListener("input",kits_gerarDescricao);
  }

});
let kitStatus = "Ativo";
window.kits_setStatus = function(btn){

  document
  .querySelectorAll(".status-btn")
  .forEach(b=>b.classList.remove("active"));

  btn.classList.add("active");

kitStatus = btn.dataset.ativo === "true" ? "Ativo" : "Inativo";

};
/* =====================================================
   ABRIR KIT EXISTENTE
===================================================== */

window.kits_openEdit = async function(kitId){

  const empresaId = window.__CONTEXT?.empresa_id;

  const modal = document.getElementById("kitsModal");
  if(!modal) return;

  modal.style.display = "flex";

  await kits_carregarItens();

  /* ===============================
     BUSCAR KIT
  =============================== */

  const { data:kit, error } = await supabase
  .from("itens")
  .select("*")
  .eq("empresa_id", empresaId)
  .eq("id", kitId)
  .single();

if(error){
  console.error(error);
  alerta("Erro ao carregar kit.", "Erro");
  return;
}

  /* ===============================
     PREENCHER FORMULÁRIO
  =============================== */

  document.getElementById("kitId").value = kit.id;

  document.getElementById("kitCodigo").value = kit.codigo || "";
  document.getElementById("kitProduto").value = kit.produto || "";
  document.getElementById("kitMaterial").value = kit.material || "";
  document.getElementById("kitCor").value = kit.cor || "";
  document.getElementById("kitDescricaoComplementar").value = kit.descricao_complementar || "";
  document.getElementById("kitDescricaoTotal").value = kit.descricao_total || "";

  document.getElementById("kitFamilia").value = kit.familia || "";
  document.getElementById("kitCategoria").value = kit.categoria || "";

  document.getElementById("kitLargura").value = kit.largura || "";
  document.getElementById("kitAltura").value = kit.altura || "";
  document.getElementById("kitProfundidade").value = kit.profundidade || "";

  document.getElementById("kitExibirSite").value =
    kit.exibir_no_site ? "true" : "false";

  /* FOTO */

  const img = document.getElementById("kitFotoPreview");

  if(img){
    img.src = kit.foto_url ||
    "https://awemuohtvwvrdzfxwrmd.supabase.co/storage/v1/object/public/logos/placeholders/sem-foto.png";
  }

  /* ===============================
     LIMPAR COMPONENTES
  =============================== */

  const body = document.getElementById("kitItensBody");
  body.innerHTML = "";

  /* ===============================
     BUSCAR COMPONENTES DO KIT
  =============================== */

const { data:componentes, error:compError } = await supabase
.from("kit_itens")
.select("*")
.eq("empresa_id", empresaId)
.eq("kit_id", kitId);

if(compError){
  console.error(compError);
  return;
}

const itemIds = componentes.map(c => c.item_id);

const { data:itens, error:itensError } = await supabase
.from("itens")
.select(`
  id,
  produto,
  descricao_total,
  valor_locacao,
  valor_reposicao,
  custo,
  foto_url
`)
.in("id", itemIds);

if(itensError){
  console.error(itensError);
  return;
}

for(const comp of componentes){

  const item = itens.find(i => i.id === comp.item_id);

  if(!item) continue;

  kits_addItem();

  const body = document.getElementById("kitItensBody");
  const row = body.lastElementChild;

  row.dataset.itemId = item.id;
  row.dataset.valor = item.valor_locacao;
  row.dataset.reposicao = item.valor_reposicao;
  row.dataset.custo = item.custo;
  row.dataset.foto = item.foto_url;

  row.querySelector(".kit-item-input").value =
    item.descricao_total || item.produto;

  row.querySelector(".kit-item-qtd").value = comp.quantidade;

  kits_atualizarFoto(row);

}


};