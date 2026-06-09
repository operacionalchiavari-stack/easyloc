/**
 * USUARIO MODULE — User Profile & Preferences
 * 
 * Exports:
 * - window.atualizarAvatarSidebar()
 * - window.ativarAusencia()
 * - criarModalPerfil()
 */

function avisarUsuario(mensagem, titulo = "Atenção", tipo = "aviso") {
  if (typeof window.alerta === "function") {
    window.alerta(mensagem, titulo, tipo);
    return;
  }
  alert(mensagem);
}

/* =====================================================
   OTIMIZA IMAGEM ANTES DO UPLOAD
===================================================== */
async function otimizarImagem(file){

  return new Promise((resolve) => {

    const img = new Image();
    const reader = new FileReader();

    reader.onload = (e) => img.src = e.target.result;

    img.onload = () => {

      const canvas = document.createElement("canvas");
      const maxSize = 400;

      let width = img.width;
      let height = img.height;

      if(width > height){
        if(width > maxSize){
          height *= maxSize / width;
          width = maxSize;
        }
      } else {
        if(height > maxSize){
          width *= maxSize / height;
          height = maxSize;
        }
      }

      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob((blob) => {
        resolve(blob);
      }, "image/jpeg", 0.8);
    };

    reader.readAsDataURL(file);
  });
}

/* =====================================================
   ATUALIZA AVATAR NA SIDEBAR
===================================================== */
async function atualizarAvatarSidebar(){

  const empresaId = window.__CONTEXT.empresa_id;
  const userId = window.__CONTEXT.usuario_id;

  const path = `${empresaId}/${userId}.jpg`;

  const { data } =
    window.supabaseClient
      .storage
      .from("avatares")
      .getPublicUrl(path);

  const avatar = document.getElementById("userAvatar");

  if(data?.publicUrl){

    avatar.innerHTML = `
      <img src="${data.publicUrl}?t=${Date.now()}"
           style="width:100%;height:100%;border-radius:50%;object-fit:cover;">
    `;

  } else {

    const iniciais = window.__CONTEXT.usuario_nome
      .split(" ")
      .map(p => p[0])
      .slice(0, 2)
      .join("")
      .toUpperCase();

    avatar.innerText = iniciais;
  }
}

/* =====================================================
   SALVAR PERFIL (COM SHADOW DOM)
===================================================== */
async function salvarPerfilShadow(shadow){

  const nome = shadow.getElementById("nomeInput").value.trim();
  const senha = shadow.getElementById("senhaInput").value;
  const senha2 = shadow.getElementById("senha2Input").value;

  const userId = window.__CONTEXT.usuario_id;

  // Atualiza nome
  if(nome){
    await window.supabaseClient
      .from("usuarios")
      .update({ nome })
      .eq("id", userId);

    window.__CONTEXT.usuario_nome = nome;
    document.getElementById("usuarioNome").childNodes[0].nodeValue = nome;
  }

  // Atualiza senha
  if(senha){
    if(senha !== senha2){
      avisarUsuario("As senhas não coincidem.");
      return;
    }

    await window.supabaseClient.auth.updateUser({
      password: senha
    });
  }

  await atualizarAvatarSidebar();

  document.getElementById("modal-root").innerHTML = "";
}

/* =====================================================
   PREENCHE DADOS DO PERFIL NO MODAL
===================================================== */
async function preencherDadosPerfilModal(modal){

  const empresaId = window.__CONTEXT.empresa_id;
  const userId = window.__CONTEXT.usuario_id;
  const path = `${empresaId}/${userId}.jpg`;

  const { data: usuario } =
    await window.supabaseClient
      .from("usuarios")
      .select("*")
      .eq("id", userId)
      .single();

  const { data: authUser } =
    await window.supabaseClient.auth.getUser();

  modal.querySelector("#nomeInput").value = usuario?.nome || "";
  modal.querySelector("#telefoneInput").value = usuario?.telefone || "";
  modal.querySelector("#emailInput").value = authUser?.user?.email || "";

  modal.querySelector("#departamentoInfo").innerText = usuario?.departamento || "-";
  modal.querySelector("#setorInfo").innerText = usuario?.setor || "-";
  modal.querySelector("#cargoInfo").innerText = usuario?.cargo || "-";
  modal.querySelector("#perfilInfo").innerText = usuario?.perfil || "-";
  modal.querySelector("#nivelInfo").innerText = usuario?.nivel_acesso || "-";

  modal.querySelector("#createdInfo").innerText =
    "Criado em: " + (usuario?.created_at ? new Date(usuario.created_at).toLocaleString("pt-BR") : "-");

  modal.querySelector("#lastLoginInfo").innerText =
    "Último login: " +
    (usuario?.ultimo_login
      ? new Date(usuario.ultimo_login).toLocaleString("pt-BR")
      : "-");

  const { data } =
    window.supabaseClient
      .storage
      .from("avatares")
      .getPublicUrl(path);

  const avatar = modal.querySelector("#avatarPreview");

  if(data?.publicUrl){
    avatar.innerHTML = `
      <img src="${data.publicUrl}?t=${Date.now()}"
           style="width:100%;height:100%;object-fit:cover;">
    `;
  } else {
    avatar.innerText = window.__CONTEXT.usuario_nome
      .split(" ")
      .map(p => p[0])
      .slice(0,2)
      .join("")
      .toUpperCase();
  }
}

/* =====================================================
   CRIAR MODAL PERFIL
===================================================== */
function criarModalPerfil(){

  const root = document.getElementById("modal-root");
  root.innerHTML = "";

  const overlay = document.createElement("div");
  overlay.style.position = "fixed";
  overlay.style.inset = "0";
  overlay.style.background = "rgba(15,23,42,.42)";
  overlay.style.backdropFilter = "blur(6px)";
  overlay.style.display = "flex";
  overlay.style.alignItems = "center";
  overlay.style.justifyContent = "center";
  overlay.style.zIndex = "999999";

  const modal = document.createElement("div");
  modal.style.width = "760px";
  modal.style.maxWidth = "95%";
  modal.style.background = "#ffffff";
  modal.style.borderRadius = "20px";
  modal.style.padding = "32px";
  modal.style.boxShadow = "0 40px 90px rgba(0,0,0,.25)";
  modal.style.fontFamily = "Inter, sans-serif";

  modal.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:22px;">
      <h3 style="margin:0;font-size:20px;font-weight:700;color:#0f2a44;">
        Meu Perfil
      </h3>
      <button id="closeModal" style="background:none;border:none;font-size:20px;cursor:pointer;color:#64748b;">
        ✕
      </button>
    </div>

    <div style="display:grid;grid-template-columns:220px 1fr;gap:28px;">

      <div style="display:flex;flex-direction:column;gap:18px;">

        <div style="text-align:center;">
          <div id="avatarPreview"
               style="width:120px;height:120px;border-radius:50%;background:#f1f5f9;margin:auto;overflow:hidden;border:2px solid #e5e7eb;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:22px;color:#0f2a44;">
          </div>

          <div id="alterarFoto"
               style="margin-top:10px;font-size:13px;color:#ff6a00;cursor:pointer;font-weight:600;">
            Alterar foto
          </div>

          <input type="file" id="fotoInput" accept="image/*" style="display:none;">
        </div>

        <div style="font-size:12px;color:#64748b;line-height:1.6;">
          <div><strong>Departamento:</strong> <span id="departamentoInfo"></span></div>
          <div><strong>Setor:</strong> <span id="setorInfo"></span></div>
          <div><strong>Cargo:</strong> <span id="cargoInfo"></span></div>
          <div><strong>Perfil:</strong> <span id="perfilInfo"></span></div>
          <div><strong>Nível:</strong> <span id="nivelInfo"></span></div>
          <hr style="margin:10px 0;border:none;border-top:1px solid #e5e7eb;">
          <div id="createdInfo"></div>
          <div id="lastLoginInfo"></div>
        </div>

      </div>

      <div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">

          <div style="grid-column:1/-1;">
            <label>Nome completo</label>
            <input id="nomeInput" style="width:100%;padding:9px;border-radius:10px;border:1px solid #e5e7eb;">
          </div>

          <div>
            <label>Email</label>
            <input id="emailInput" disabled style="background:#f8fafc;width:100%;padding:9px;border-radius:10px;border:1px solid #e5e7eb;">
          </div>

          <div>
            <label>Telefone</label>
            <input id="telefoneInput" style="width:100%;padding:9px;border-radius:10px;border:1px solid #e5e7eb;">
          </div>

          <div>
            <label>Senha atual</label>
            <input id="senhaAtualInput" type="password" autocomplete="new-password"
                   style="width:100%;padding:9px;border-radius:10px;border:1px solid #e5e7eb;">
          </div>

          <div>
            <label>Nova senha</label>
            <input id="senhaInput" type="password" autocomplete="new-password"
                   style="width:100%;padding:9px;border-radius:10px;border:1px solid #e5e7eb;">
          </div>

          <div>
            <label>Confirmar nova senha</label>
            <input id="senha2Input" type="password" autocomplete="new-password"
                   style="width:100%;padding:9px;border-radius:10px;border:1px solid #e5e7eb;">
          </div>

        </div>

        <div style="margin-top:24px;display:flex;justify-content:flex-end;gap:10px;">
          <button id="cancelBtn" style="padding:8px 18px;border-radius:12px;border:none;background:#e5e7eb;cursor:pointer;">
            Cancelar
          </button>
          <button id="saveBtn" style="padding:8px 18px;border-radius:12px;border:none;background:#ff6a00;color:#fff;font-weight:600;cursor:pointer;">
            Salvar
          </button>
        </div>

      </div>

    </div>
  `;

  overlay.appendChild(modal);
  root.appendChild(overlay);

  overlay.onclick = (e) => {
    if(e.target === overlay){
      root.innerHTML = "";
    }
  };

  modal.querySelector("#closeModal").onclick =
  modal.querySelector("#cancelBtn").onclick = () => {
    root.innerHTML = "";
  };

  // =====================================
  // FOTO DE PERFIL MULTIEMPRESA
  // =====================================

  const alterarFotoBtn = modal.querySelector("#alterarFoto");
  const fotoInput = modal.querySelector("#fotoInput");

  alterarFotoBtn.onclick = () => fotoInput.click();

  fotoInput.addEventListener("change", async function(){

    const file = this.files[0];
    if(!file) return;

    const empresaId = window.__CONTEXT.empresa_id;
    const userId = window.__CONTEXT.usuario_id;
    const path = `${empresaId}/${userId}.jpg`;

    const imagemOtimizada = await otimizarImagem(file);

    const { error } =
      await window.supabaseClient
        .storage
        .from("avatares")
        .upload(path, imagemOtimizada, {
          upsert: true,
          cacheControl: "3600"
        });

    if(error){
      avisarUsuario("Erro ao enviar imagem.", "Erro", "erro");
      console.error(error);
      return;
    }

    await atualizarAvatarSidebar();
    preencherDadosPerfilModal(modal);
  });

  modal.querySelector("#saveBtn").onclick = async () => {

    const nome = modal.querySelector("#nomeInput").value.trim();
    const telefone = modal.querySelector("#telefoneInput").value.trim();

    const userId = window.__CONTEXT.usuario_id;

    await window.supabaseClient
      .from("usuarios")
      .update({ nome, telefone })
      .eq("id", userId);

    window.__CONTEXT.usuario_nome = nome;
    document.getElementById("usuarioNome").childNodes[0].nodeValue = nome;

    root.innerHTML = "";
  };

  preencherDadosPerfilModal(modal);
}

/* =====================================================
   MODO AUSÊNCIA (LOCK SCREEN COM FOTO REAL)
===================================================== */

async function ativarAusencia(){

  const empresaId = window.__CONTEXT.empresa_id;
  const userId = window.__CONTEXT.usuario_id;
  const path = `${empresaId}/${userId}.jpg`;

  const { data } =
    window.supabaseClient
      .storage
      .from("avatares")
      .getPublicUrl(path);

  const overlay = document.createElement("div");
  overlay.id = "absence-lock";
  overlay.style.position = "fixed";
  overlay.style.inset = "0";
  overlay.style.background = "rgba(15,23,42,.42)";
  overlay.style.display = "flex";
  overlay.style.alignItems = "center";
  overlay.style.justifyContent = "center";
  overlay.style.zIndex = "9999999";
  overlay.style.backdropFilter = "blur(6px)";

  const box = document.createElement("div");
  box.style.background = "#ffffff";
  box.style.padding = "32px";
  box.style.borderRadius = "20px";
  box.style.width = "380px";
  box.style.textAlign = "center";
  box.style.boxShadow = "0 40px 80px rgba(0,0,0,.4)";
  box.style.fontFamily = "Inter, sans-serif";

  const avatarHTML = data?.publicUrl
    ? `<img src="${data.publicUrl}?t=${Date.now()}"
         style="width:84px;height:84px;border-radius:50%;object-fit:cover;">`
    : `<div style="
          width:84px;height:84px;border-radius:50%;
          background:#ff6a00;color:#fff;
          display:flex;align-items:center;justify-content:center;
          font-weight:700;font-size:26px;">
         ${window.__CONTEXT.usuario_nome
           .split(" ")
           .map(p => p[0])
           .slice(0,2)
           .join("")
           .toUpperCase()}
       </div>`;
  
  box.innerHTML = `
    <div style="margin-bottom:18px;">
      ${avatarHTML}
    </div>

    <h3 style="margin:0 0 6px 0;">Sessão em ausência</h3>
    <p style="font-size:13px;color:#64748b;margin-bottom:20px;">
      Digite sua senha para retornar
    </p>

    <input type="password"
      id="unlockPassword"
      autocomplete="new-password"
      placeholder="Sua senha"
      style="width:100%;padding:12px;border-radius:12px;
             border:1px solid #e5e7eb;
             font-size:14px;">

    <!-- MENSAGEM DE ERRO -->
    <div id="unlockError"
         style="height:18px;
                font-size:12px;
                color:#dc2626;
                margin-top:6px;
                opacity:0;
                transition:.2s;">
    </div>

    <button id="unlockBtn"
      style="width:100%;padding:12px;border:none;border-radius:14px;
             background:#ff6a00;color:#fff;font-weight:600;
             cursor:pointer;font-size:14px;margin-top:14px;">
      Desbloquear
    </button>
  `;

  overlay.appendChild(box);
  document.body.appendChild(overlay);

  const inputSenha = document.getElementById("unlockPassword");
  const errorDiv = document.getElementById("unlockError");
  const btn = document.getElementById("unlockBtn");

  // sempre inicia vazio
  setTimeout(() => {
    inputSenha.value = "";
    inputSenha.focus();
  }, 50);

  // limpa erro ao digitar
  inputSenha.addEventListener("input", () => {
    errorDiv.style.opacity = "0";
    errorDiv.innerText = "";
    inputSenha.style.borderColor = "#e5e7eb";
  });

  btn.onclick = async () => {

    const senha = inputSenha.value.trim();

    if(!senha){
      errorDiv.innerText = "Digite sua senha";
      errorDiv.style.opacity = "1";
      inputSenha.style.borderColor = "#dc2626";
      return;
    }

    const { data: { user } } = await window.supabaseClient.auth.getUser();

    const { error, data } = await window.supabaseClient.auth.signInWithPassword({
      email: user.email,
      password: senha
    });

    if(error){
      errorDiv.innerText = "Senha incorreta";
      errorDiv.style.opacity = "1";
      inputSenha.style.borderColor = "#dc2626";
      inputSenha.value = "";
      return;
    }

    // 🔥 restaura sessão corretamente
    if(data?.session){
      await window.supabaseClient.auth.setSession(data.session);
    }

    document.getElementById("absence-lock")?.remove();
  };
}

/* ========================================
   INICIALIZAÇÕES DO DASHBOARD
======================================== */
window.addEventListener("load", () => {

  const inputFoto = document.getElementById("perfilFotoInput");

  if(inputFoto){
    inputFoto.addEventListener("change", async function(){

      const file = this.files[0];
      if(!file) return;

      const userId = window.__CONTEXT.usuario_id;

      await window.supabaseClient
        .storage
        .from("Avatares")
        .upload(`${userId}/avatar.jpg`, file, { upsert:true });

      await atualizarAvatarSidebar();
    });
  }

});
