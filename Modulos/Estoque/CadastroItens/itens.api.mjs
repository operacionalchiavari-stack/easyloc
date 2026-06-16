/* =====================================================
   API – ITENS (SUPABASE)
===================================================== */

const supabase = window.supabaseClient;


let itensCache = [];
window.itensCache = itensCache;

function gerarQrCodeCadastro(){
  return window.EasyLocQR?.generateValue?.()
    || window.crypto?.randomUUID?.()
    || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function colunaQrAusente(error){
  return error?.code === "42703"
    || String(error?.message || "").includes("qr_code does not exist");
}

/* =====================================================
   EMPRESA ATUAL
===================================================== */

export async function getEmpresaAtualId(){

  const { data: sessionData, error: sessionError } =
    await supabase.auth.getSession();

  if(sessionError || !sessionData?.session?.user){
    throw new Error("Usuário não autenticado");
  }

  const userId = sessionData.session.user.id;

  const { data, error } = await supabase
    .from("usuarios_empresas")
    .select("empresa_id")
    .eq("user_id", userId)
    .single();

  if(error || !data?.empresa_id){
    throw new Error("Empresa não encontrada para este usuário");
  }

  return data.empresa_id;
}

/* =====================================================
   CARREGAR ITENS
===================================================== */

export async function carregarItens(){

  try{

    const empresaId = await getEmpresaAtualId();

    const { data, error } = await supabase
      .from("itens")
      .select("*")
      .eq("empresa_id", empresaId)
      .order("produto",{ascending:true});

    if(error) throw error;

    itensCache = data || [];
    window.itensCache = itensCache;

    window.renderTabelaItens?.(itensCache);

  }catch(err){

    console.error("Erro ao carregar itens:",err);

  }

}

/* =====================================================
   SALVAR ITEM
===================================================== */

window.itens_salvar = async function(){

/* =====================================================
   PEGAR CAMPOS
===================================================== */

const produto = document.getElementById("itensProduto")?.value?.trim();
const material = document.getElementById("itensMaterial")?.value?.trim();
const cor = document.getElementById("itensCor")?.value?.trim();
const descricaoComplementar = document.getElementById("itensDescricaoComplementar")?.value?.trim();
const largura = document.getElementById("itensLargura")?.value?.trim();
const altura = document.getElementById("itensAltura")?.value?.trim();
const profundidade = document.getElementById("itensProfundidade")?.value?.trim();
const categoria = document.getElementById("itensCategoria")?.value?.trim();
const setor = document.getElementById("itensSetor")?.value?.trim();
const valorLocacao = document.getElementById("itensValorLocacao")?.value?.trim();
const valorReposicao = document.getElementById("itensValorReposicao")?.value?.trim();

/* =====================================================
   VALIDAÇÃO
===================================================== */

if(!produto){
  alerta("Informe o produto.");
  return;
}

if(!material){
  alerta("Informe o material.");
  return;
}

if(!cor){
  alerta("Informe a cor.");
  return;
}

if(!largura || !altura || !profundidade){
  alerta("Informe todas as dimensões.");
  return;
}

if(!categoria){
  alerta("Informe a categoria.");
  return;
}

if(!setor){
  alerta("Informe o setor de estoque.");
  return;
}

if(!valorLocacao){
  alerta("Informe o valor de locação.");
  return;
}

if(!valorReposicao){
  alerta("Informe o valor de reposição.");
  return;
}
try{

  if(!supabase){
    console.error("Supabase não encontrado.");
    return;
  }
    /* =====================================================
       PEGAR EMPRESA
    ===================================================== */

    const empresaId = await getEmpresaAtualId();

    if(!empresaId){
      console.error("Empresa não encontrada.");
      return;
    }

    /* =====================================================
       PEGAR CAMPOS
    ===================================================== */

let codigo = document.getElementById("itensCodigo")?.value?.trim();

if(!codigo){
  codigo = Date.now().toString();
  document.getElementById("itensCodigo").value = codigo;
}

    /* =====================================================
   VALIDAR CAMPOS OBRIGATÓRIOS
===================================================== */



const largura = parseFloat(
  document.getElementById("itensLargura")?.value
) || 0;

const altura = parseFloat(
  document.getElementById("itensAltura")?.value
) || 0;

const profundidade = parseFloat(
  document.getElementById("itensProfundidade")?.value
) || 0;
const volumeCubico = Number(
  (largura * altura * profundidade).toFixed(3)
);

    const familia = document.getElementById("itensFamilia")?.value?.trim();
    const categoria = document.getElementById("itensCategoria")?.value?.trim();
    const setor = document.getElementById("itensSetor")?.value;

    const exibirSite = document.getElementById("itensExibirSite")?.value === "true";

    const custo = parseFloat(
      document.getElementById("itensCusto")?.value.replace(",",".")
    ) || 0;

    const valorLocacao = parseFloat(
      document.getElementById("itensValorLocacao")?.value.replace(",",".")
    ) || 0;

    const valorReposicao = parseFloat(
      document.getElementById("itensValorReposicao")?.value.replace(",",".")
    ) || 0;

    /* =====================================================
       STATUS / TIPO
    ===================================================== */

const statusBtn = document.querySelector(".status-btn.active");
const ativo = statusBtn?.dataset?.ativo === "true";

    const tipoBtn = document.querySelector(".tipo-btn.active");
    const tipo = tipoBtn?.innerText || "Item";

/* =====================================================
   FOTO (USAR SISTEMA DE ZOOM DO EDITOR)
===================================================== */

let fotoUrl = null;

const itemId =
  window.itemAtualId ||
  crypto.randomUUID();

const urlFoto =
  await window.itens_processarFoto(itemId);

if(urlFoto){
  fotoUrl = urlFoto;
}
/* =====================================================
   GERAR NOME AUTOMÁTICO DO ITEM
===================================================== */
let nomeGerado = produto || "";

/* material */
if(material && material.length > 0){
  nomeGerado += " " + material;
}

/* cor */
if(cor && cor.length > 0){
  nomeGerado += " " + cor;
}

/* descrição complementar */
if(descricaoComplementar && descricaoComplementar.length > 0){
  nomeGerado += " " + descricaoComplementar;
}

/* dimensões */
if(largura){
  nomeGerado += ` (L) ${Number(largura).toFixed(2)} m`;
}

if(altura){
  nomeGerado += ` (A) ${Number(altura).toFixed(2)} m`;
}

if(profundidade){
  nomeGerado += ` (P) ${Number(profundidade).toFixed(2)} m`;
}

/* =====================================================
   OBJETO ITEM
===================================================== */

const itemData = {

  empresa_id: empresaId,
  qr_code: window.itemAtualQrCode || gerarQrCodeCadastro(),

  codigo,
  produto,
  material,
  cor,
  descricao_complementar: descricaoComplementar,

  descricao_total: nomeGerado,

  largura,
  altura,
  profundidade,
  volume_cubico: volumeCubico,

  familia,
  categoria,
  setor_estoque: setor,

  custo,
  valor_locacao: valorLocacao,
  valor_reposicao: valorReposicao,

  tipo,
  ativo,
  exibir_no_site: exibirSite,

  foto_url: fotoUrl || undefined

};
    /* =====================================================
       UPDATE
    ===================================================== */

    if(window.itemAtualId){

      let { error } = await supabase
        .from("itens")
        .update(itemData)
        .eq("id", window.itemAtualId);

      if(colunaQrAusente(error)){
        delete itemData.qr_code;
        window.itemAtualQrCode = null;
        ({ error } = await supabase
          .from("itens")
          .update(itemData)
          .eq("id", window.itemAtualId));
      }

      if(error){
        console.error("Erro ao atualizar item:", error);
        return;
      }

      console.log("Item atualizado");
      window.itemAtualQrCode = itemData.qr_code;

    }

    /* =====================================================
       INSERT
    ===================================================== */

    else{

      let { error } = await supabase
        .from("itens")
        .insert(itemData);

      if(colunaQrAusente(error)){
        delete itemData.qr_code;
        window.itemAtualQrCode = null;
        ({ error } = await supabase
          .from("itens")
          .insert(itemData));
      }

      if(error){
        console.error("Erro ao criar item:", error);
        return;
      }

      console.log("Item criado");
      window.itemAtualQrCode = itemData.qr_code;

    }

    /* =====================================================
       RECARREGAR TABELA
    ===================================================== */

    await carregarItens();

    /* =====================================================
       FECHAR MODAL
    ===================================================== */

    window.itens_closeModal?.();

  }

  catch(err){

    console.error("Erro ao salvar item:",err);

  }

};

/* =====================================================
   SALVAR KIT
===================================================== */

window.kits_salvar = async function(){

  console.log("Salvar kit");

};
/* =====================================================
   GERAR CÓDIGO AUTOMÁTICO
===================================================== */

window.itens_gerarCodigo = function(){

  const campo = document.getElementById("itensCodigo");

  if(!campo) return;

  if(!campo.value){
    campo.value = Date.now().toString();
  }

};
/* =====================================================
   GERAR CÓDIGO FORMATADO DO ITEM
===================================================== */

window.itens_gerarCodigoFormatado = function(){

  const numero = Math.floor(Math.random() * 999999) + 1;

  const codigo =
    "ITM-" +
    numero
      .toString()
      .padStart(6,"0");

  return codigo;

};
