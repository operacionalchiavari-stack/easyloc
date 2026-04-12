/* =====================================================
   SUPABASE CLIENT USADO (instância global em js/core/supabase.js)
===================================================== */
/* =====================================================
   BOOT PRINCIPAL
===================================================== */

async function iniciarBoot(){

  const sb = window.supabaseClient;

  console.log("🚀 Boot iniciado");


  /* ===============================
     RESTAURA SESSÃO
  =============================== */

  const {
    data:{ session }
  } = await sb.auth.getSession();


  if(!session){
    console.warn("❌ Sessão não encontrada");
    window.location.href = "/index.html"; // ✅ ABSOLUTO
    return;
  }

  console.log("✅ Sessão restaurada");


  /* ===============================
     CONTEXTO
  =============================== */

  const empresaId =
    sessionStorage.getItem("empresa_id");

  const nomeUsuario =
    sessionStorage.getItem("usuario_nome");

  if(!empresaId){
    console.warn("❌ empresa_id ausente");
    window.location.href = "/index.html"; // ✅ ABSOLUTO
    return;
  }


  /* ===============================
     TEXO BOOT
  =============================== */

  const titulo =
    document.querySelector(".boot-title");

  if(titulo){
    titulo.innerText =
      `Olá ${nomeUsuario}, preparando seu ambiente`;
  }


  /* ===============================
     LOGO EMPRESA
  =============================== */

  try{

    const { data:empresa } =
      await sb
        .from("empresas")
        .select("id,nome,logo_url")
        .eq("id",empresaId)
        .single();

    if(empresa){
      sessionStorage.setItem(
        "empresa_data",
        JSON.stringify(empresa)
      );

      const logoContainer =
        document.getElementById("logoContainer");

      if(logoContainer){

        if(empresa.logo_url){

          const img = new Image();
          img.src = empresa.logo_url;
          img.style.maxWidth="80%";
          img.style.maxHeight="80%";
          img.style.objectFit="contain";

          logoContainer.innerHTML="";
          logoContainer.appendChild(img);

        }else{

          logoContainer.innerHTML =
            `<strong>${empresa.nome}</strong>`;
        }
      }
    }

  }catch(e){
    console.error("❌ erro boot:",e);
  }


  /* ===============================
     REDIRECT FINAL
  =============================== */

  console.log("✅ Indo para dashboard");

  setTimeout(()=>{
    window.location.href = "/dashboard.html"; // ✅ ABSOLUTO
  },400);

}


/* =====================================================
   START
===================================================== */

iniciarBoot();