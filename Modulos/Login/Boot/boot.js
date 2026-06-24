async function iniciarBoot() {
  const sb = window.supabaseClient;

  const { data: { session } } = await sb.auth.getSession();
  if (!session) {
    window.location.href = "/index.html";
    return;
  }

  const empresaId = sessionStorage.getItem("empresa_id");
  const nomeUsuario = sessionStorage.getItem("usuario_nome") || "Usuario";

  if (!empresaId) {
    window.location.href = "/index.html";
    return;
  }

  const primeiroNome = nomeUsuario.split(" ")[0] || "Usuario";
  const titulo = document.querySelector(".boot-title");
  const subtitulo = document.querySelector(".boot-subtitle");
  const logoContainer = document.getElementById("logoContainer");

  if (titulo) titulo.innerText = `Ola ${primeiroNome}, preparando seu ambiente`;
  if (subtitulo) {
    subtitulo.innerHTML = "Carregando identidade visual, permissoes e dados da empresa...";
  }

  let empresa = null;

  try {
    const { data } = await sb
      .from("empresas")
      .select("id,nome,logo_url")
      .eq("id", empresaId)
      .single();

    empresa = data || null;
    if (empresa) sessionStorage.setItem("empresa_data", JSON.stringify(empresa));
  } catch (error) {
    console.warn("[Boot] Nao foi possivel buscar empresa:", error);
  }

  let theme = null;
  if (window.EasyLocTheme?.applyForEmpresa) {
    theme = await window.EasyLocTheme.applyForEmpresa(empresaId);
  }

  const logoUrl = theme?.logo_url || empresa?.logo_url || "";
  if (logoContainer) {
    if (logoUrl) {
      const img = new Image();
      img.src = logoUrl;
      img.alt = empresa?.nome || "Logo da empresa";
      img.style.maxWidth = "80%";
      img.style.maxHeight = "80%";
      img.style.objectFit = "contain";
      logoContainer.innerHTML = "";
      logoContainer.appendChild(img);
    } else {
      logoContainer.innerHTML = `<strong>${empresa?.nome || "EasyLoc"}</strong>`;
    }
  }

  if (subtitulo) {
    subtitulo.innerHTML = "Tudo pronto. Abrindo seu painel...";
  }

  setTimeout(() => {
    window.location.href = "/dashboard.html";
  }, 650);
}

iniciarBoot();
