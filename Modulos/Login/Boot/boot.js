const MIN_LOADING_TIME = 5000;

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sanitizeName(name) {
  return String(name || "").trim();
}

function setProgress(percent) {
  const progress = document.getElementById("bootProgress");
  const progressBar = document.querySelector(".boot-progress");
  const value = Math.max(0, Math.min(100, percent));

  if (progress) progress.style.width = `${value}%`;
  if (progressBar) progressBar.setAttribute("aria-valuenow", String(Math.round(value)));
}

function setActiveStep(index) {
  document.querySelectorAll(".boot-step").forEach((step, stepIndex) => {
    step.classList.toggle("active", stepIndex === index);
    step.classList.toggle("done", stepIndex < index);
  });
}

function updateStepsByElapsed(elapsed) {
  if (elapsed >= 3500) {
    setActiveStep(2);
    return;
  }

  if (elapsed >= 2000) {
    setActiveStep(1);
    return;
  }

  setActiveStep(0);
}

function startProgressAnimation(startTime) {
  return setInterval(() => {
    const elapsed = Date.now() - startTime;
    const progress = Math.min(96, (elapsed / MIN_LOADING_TIME) * 96);
    setProgress(progress);
    updateStepsByElapsed(elapsed);
  }, 50);
}

async function getNomeUsuario(sb, session) {
  const sessionName = sanitizeName(sessionStorage.getItem("usuario_nome"));
  if (sessionName && sessionName.toLowerCase() !== "usuario") return sessionName;

  const metadataName = sanitizeName(
    session?.user?.user_metadata?.nome ||
    session?.user?.user_metadata?.name
  );

  try {
    if (!session?.user?.id) return metadataName;

    const { data } = await sb
      .from("usuarios")
      .select("nome")
      .eq("id", session.user.id)
      .maybeSingle();

    const dbName = sanitizeName(data?.nome);
    if (dbName) {
      sessionStorage.setItem("usuario_nome", dbName);
      return dbName;
    }
  } catch (error) {
    console.warn("[Boot] Nao foi possivel buscar usuario:", error);
  }

  return metadataName;
}

function updateGreeting(nomeUsuario) {
  const greeting = document.getElementById("bootGreeting");
  if (!greeting) return;

  const nome = sanitizeName(nomeUsuario);
  greeting.textContent = nome ? `Olá, ${nome}!` : "Olá!";
}

async function carregarAmbiente(sb, session, empresaId) {
  const nomeUsuario = await getNomeUsuario(sb, session);
  updateGreeting(nomeUsuario);

  const subtitulo = document.querySelector(".boot-subtitle");
  if (subtitulo) {
    subtitulo.innerHTML = "Carregando informa&ccedil;&otilde;es da sua opera&ccedil;&atilde;o...";
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

  if (window.EasyLocTheme?.applyForEmpresa) {
    await window.EasyLocTheme.applyForEmpresa(empresaId);
  }

  return empresa;
}

async function iniciarBoot() {
  const startTime = Date.now();
  const progressTimer = startProgressAnimation(startTime);
  const sb = window.supabaseClient;

  const { data: { session } } = await sb.auth.getSession();
  if (!session) {
    clearInterval(progressTimer);
    window.location.href = "/index.html";
    return;
  }

  const empresaId = sessionStorage.getItem("empresa_id");

  if (!empresaId) {
    clearInterval(progressTimer);
    window.location.href = "/index.html";
    return;
  }

  const logoContainer = document.getElementById("logoContainer");
  if (logoContainer) {
    logoContainer.textContent = "ACERVO";
  }

  await carregarAmbiente(sb, session, empresaId);

  const elapsed = Date.now() - startTime;
  const remaining = Math.max(0, MIN_LOADING_TIME - elapsed);

  if (remaining > 0) {
    await wait(remaining);
  }

  clearInterval(progressTimer);
  setActiveStep(2);
  setProgress(100);

  const subtitulo = document.querySelector(".boot-subtitle");
  if (subtitulo) {
    subtitulo.innerHTML = "Tudo pronto. Abrindo seu painel...";
  }

  await wait(280);
  window.location.href = "/dashboard.html";
}

iniciarBoot();
