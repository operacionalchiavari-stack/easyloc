(function(){
  const u = window.empresa.utils;

  function render(container, state) {
    container.innerHTML = `
      <div style="display:grid;grid-template-columns:260px 1fr;gap:40px;">

        <div style="display:flex;flex-direction:column;align-items:center;gap:18px;">

          <div id="logoPreview"
            style="width:100%;height:120px;border-radius:16px;background:#ffffff;border:2px solid #e5e7eb;display:flex;align-items:center;justify-content:center;font-weight:700;color:#0f2a44;font-size:18px;box-shadow:0 10px 25px rgba(15,42,68,.06);overflow:hidden;">
          </div>

          <div style="display:flex;align-items:center;justify-content:center;gap:14px;">

            <button id="zoomOutBtn"
              style="width:34px;height:34px;border-radius:12px;border:1px solid #e5e7eb;background:#ffffff;cursor:pointer;font-size:16px;font-weight:600;">
              −
            </button>

            <div id="alterarLogo"
              style="font-size:14px;color:#ff6a00;cursor:pointer;font-weight:600;">
              Alterar logo
            </div>

            <button id="zoomInBtn"
              style="width:34px;height:34px;border-radius:12px;border:1px solid #e5e7eb;background:#ffffff;cursor:pointer;font-size:16px;font-weight:600;">
              +
            </button>

          </div>

          <input type="file" id="logoInput" accept="image/*" style="display:none;">

          <div style="margin-top:14px;width:100%;font-size:13px;color:#334155;line-height:1.7;">

            <hr style="margin:14px 0;border:none;border-top:1px solid #e5e7eb;">

            <div style="margin-bottom:16px;">
              <div style="font-weight:700;font-size:12px;letter-spacing:.5px;color:#0f2a44;margin-bottom:8px;text-transform:uppercase;">
                Informações da Conta
              </div>

              <div><strong>Usuários ativos:</strong> <span id="empresaUsuariosAtivos">0</span></div>
              <div><strong>Itens cadastrados:</strong> <span id="empresaTotalItens">0</span></div>
              <div><strong>Clientes cadastrados:</strong> <span id="empresaTotalClientes">0</span></div>
              <div><strong>Locais cadastrados:</strong> <span id="empresaTotalLocais">0</span></div>
            </div>

            <hr style="margin:12px 0;border:none;border-top:1px solid #f1f5f9;">

            <div>
              <div style="font-weight:700;font-size:12px;letter-spacing:.5px;color:#0f2a44;margin-bottom:8px;text-transform:uppercase;">
                Assinatura
              </div>

              <div><strong>Plano:</strong> <span id="empresaPlano">EasyLoc Pro</span></div>
              <div><strong>Limite de usuários:</strong> <span id="empresaLimiteUsuarios">0</span></div>
              <div><strong>Vencimento:</strong> <span id="empresaVencimento">--/--/----</span></div>
              <div><strong>Status:</strong> <span id="empresaStatusPlano" style="color:#16a34a;font-weight:600;">Ativa</span></div>
            </div>

          </div>

        </div>

        <!-- CAMPOS -->
        <div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:18px;">

            <div style="grid-column:1/-1;">
              <label>Nome Fantasia</label>
              <input id="empresaNomeInput" style="width:100%;padding:10px;border-radius:12px;border:1px solid #e5e7eb;">
            </div>

            <div style="grid-column:1/-1;">
              <label>Razão Social</label>
              <input id="razaoSocialInput" style="width:100%;padding:10px;border-radius:12px;border:1px solid #e5e7eb;">
            </div>

            <div>
              <label>CNPJ</label>
              <input id="cnpjInput" style="width:100%;padding:10px;border-radius:12px;border:1px solid #e5e7eb;">
            </div>

            <div>
              <label>Inscrição Estadual</label>
              <input id="ieInput" style="width:100%;padding:10px;border-radius:12px;border:1px solid #e5e7eb;">
            </div>

            <div>
              <label>Telefone</label>
              <input id="empresaTelefoneInput" style="width:100%;padding:10px;border-radius:12px;border:1px solid #e5e7eb;">
            </div>

            <div>
              <label>Email</label>
              <input id="empresaEmailInput" style="width:100%;padding:10px;border-radius:12px;border:1px solid #e5e7eb;">
            </div>

            <div style="grid-column:1/-1;">
              <label>Logradouro</label>
              <input id="logradouroInput" style="width:100%;padding:10px;border-radius:12px;border:1px solid #e5e7eb;">
            </div>

            <div>
              <label>Número</label>
              <input id="numeroInput" style="width:100%;padding:10px;border-radius:12px;border:1px solid #e5e7eb;">
            </div>

            <div>
              <label>Bairro</label>
              <input id="bairroInput" style="width:100%;padding:10px;border-radius:12px;border:1px solid #e5e7eb;">
            </div>

            <div>
              <label>Cidade</label>
              <input id="cidadeInput" style="width:100%;padding:10px;border-radius:12px;border:1px solid #e5e7eb;">
            </div>

            <div>
              <label>UF</label>
              <input id="ufInput" style="width:100%;padding:10px;border-radius:12px;border:1px solid #e5e7eb;">
            </div>

            <div>
              <label>CEP</label>
              <input id="cepInput" style="width:100%;padding:10px;border-radius:12px;border:1px solid #e5e7eb;">
            </div>

            <!-- 🔥 NOVO CAMPO ENDEREÇO GOOGLE -->
            <div style="grid-column:1/-1;">
              <label style="font-weight:600;">
                Endereço Google (usado para cálculo de frete)
              </label>
              <input
                id="empresaEnderecoGoogleInput"
                placeholder="Ex: Rua X, 120 - Centro, Petrópolis - RJ, Brasil"
                style="
                  width:100%;
                  padding:10px;
                  border-radius:12px;
                  border:1px solid #e5e7eb;
                ">
            </div>

          </div>
        </div>

      </div>
    `;
  }

  async function bind(container, state, api) {
    const empresa = state.empresa || {};
    const dashboard = state.dashboard || {};

    const logoPreview = container.querySelector("#logoPreview");
    let zoomAtual = 1;
    function aplicarZoom() {
      const img = logoPreview.querySelector("img");
      if (!img) return;
      img.style.transform = `scale(${zoomAtual})`;
      img.style.transition = "transform .2s ease";
      img.style.transformOrigin = "center";
    }

    container.querySelector("#zoomInBtn").addEventListener("click", () => {
      zoomAtual = Math.min(3, zoomAtual + 0.1);
      aplicarZoom();
    });
    container.querySelector("#zoomOutBtn").addEventListener("click", () => {
      zoomAtual = Math.max(0.5, zoomAtual - 0.1);
      aplicarZoom();
    });

    const alterarLogoBtn = container.querySelector("#alterarLogo");
    const logoInput = container.querySelector("#logoInput");
    alterarLogoBtn.addEventListener("click", () => logoInput.click());

    logoInput.addEventListener("change", async function () {
      const file = this.files[0];
      if (!file) return;
      const imagemOtimizada = await otimizarImagem(file);
      const path = `${state.empresaId}/logo.jpg`;
      const { error: uploadError } =
        await window.supabaseClient
          .storage
          .from("empresas-logos")
          .upload(path, imagemOtimizada, {
            upsert: true,
            cacheControl: "3600"
          });
      if (uploadError) {
        console.error(uploadError);
        alert("Erro ao enviar logo");
        return;
      }
      const { data: publicData } =
        window.supabaseClient
          .storage
          .from("empresas-logos")
          .getPublicUrl(path);
      if (!publicData?.publicUrl) {
        alert("Erro ao gerar URL pública");
        return;
      }
      const publicUrl = publicData.publicUrl;
      const { error: updateError } =
        await window.supabaseClient
          .from("empresas")
          .update({ logo_url: publicUrl })
          .eq("id", state.empresaId);
      if (updateError) {
        console.error(updateError);
        alert("Erro ao salvar logo no banco");
        return;
      }
      logoPreview.innerHTML =
        `<img src="${publicUrl}?t=${Date.now()}"
              style="width:100%;height:100%;object-fit:contain;">`;
    });

    // stats
    if (dashboard) {
      container.querySelector("#empresaUsuariosAtivos").innerText =
        dashboard.usuarios || 0;
      container.querySelector("#empresaTotalItens").innerText =
        dashboard.itens || 0;
      container.querySelector("#empresaTotalClientes").innerText =
        dashboard.clientes || 0;
      container.querySelector("#empresaTotalLocais").innerText =
        dashboard.locais || 0;
      if (dashboard.assinatura) {
        const a = dashboard.assinatura;
        container.querySelector("#empresaPlano").innerText = a.plano || "—";
        container.querySelector("#empresaLimiteUsuarios").innerText =
          a.limite_usuarios || "—";
        container.querySelector("#empresaVencimento").innerText =
          a.vencimento
            ? new Date(a.vencimento).toLocaleDateString("pt-BR")
            : "—";
        const statusEl = container.querySelector("#empresaStatusPlano");
        if (statusEl) {
          statusEl.innerText = a.status || "—";
          statusEl.style.color =
            a.status === "Ativa"
              ? "#16a34a"
              : a.status === "Trial"
              ? "#f59e0b"
              : "#dc2626";
        }
      }
    }

    // populate form inputs
    container.querySelector("#empresaNomeInput").value = empresa.nome || "";
    container.querySelector("#razaoSocialInput").value = empresa.razao_social || "";
    container.querySelector("#cnpjInput").value = empresa.cnpj || "";
    container.querySelector("#ieInput").value = empresa.inscricao_estadual || "";
    container.querySelector("#empresaTelefoneInput").value = empresa.telefone || "";
    container.querySelector("#empresaEmailInput").value = empresa.email || "";
    container.querySelector("#logradouroInput").value = empresa.logradouro || "";
    container.querySelector("#numeroInput").value = empresa.numero || "";
    container.querySelector("#bairroInput").value = empresa.bairro || "";
    container.querySelector("#cidadeInput").value = empresa.cidade || "";
    container.querySelector("#ufInput").value = empresa.uf || "";
    container.querySelector("#cepInput").value = empresa.cep || "";
    container.querySelector("#empresaEnderecoGoogleInput").value =
      empresa.endereco_google || "";

    // logo initial preview
    if (empresa.logo_url) {
      logoPreview.innerHTML = `
        <div style="
          width:60%;
          height:40px;
          background:#f1f5f9;
          border-radius:8px;
          animation:pulse 1.2s infinite;
        "></div>
      `;
      const img = new Image();
      img.onload = () => {
        logoPreview.innerHTML = "";
        img.style.width = "100%";
        img.style.height = "100%";
        img.style.objectFit = "contain";
        logoPreview.appendChild(img);
      };
      img.src = empresa.logo_url + "?t=" + Date.now();
    } else {
      logoPreview.innerText = empresa.nome || "LOGO";
    }

    // google places autocomplete
    async function setupGoogle() {
      if (!window.google?.maps?.places) {
        await window.carregarGooglePlaces();
      }
      const inputGoogle = container.querySelector("#empresaEnderecoGoogleInput");
      if (inputGoogle) {
        const autocomplete = new google.maps.places.Autocomplete(inputGoogle, {
          types: ["address"],
          componentRestrictions: { country: "br" }
        });
        autocomplete.addListener("place_changed", function() {
          const place = autocomplete.getPlace();
          if (!place.geometry) {
            console.warn("Endereço não reconhecido");
            return;
          }
          console.log("Endereço selecionado:", place.formatted_address);
        });
        state.autocomplete = autocomplete;
      }
    }

    setupGoogle();

    return () => {
      if (state.autocomplete) {
        state.autocomplete.unbindAll && state.autocomplete.unbindAll();
        state.autocomplete = null;
      }
    };
  }

  window.empresa = window.empresa || {};
  window.empresa.sections = window.empresa.sections || {};
  window.empresa.sections.dados = { render, bind };
})();