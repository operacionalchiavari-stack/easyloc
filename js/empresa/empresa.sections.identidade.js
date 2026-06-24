(function () {
  const DEFAULT = window.EasyLocTheme?.DEFAULT_THEME || {
    logo_url: "",
    logo_zoom: 1,
    cor_sidebar: "#0F2A44",
    cor_destaque: "#FF6A00",
    cor_fundo: "#FFFAF6"
  };

  function render(container) {
    container.innerHTML = `
      <div style="display:grid;grid-template-columns:320px 1fr;gap:22px;">
        <section style="border:1px solid #e5e7eb;border-radius:18px;padding:18px;background:#fff;">
          <div style="font-size:12px;font-weight:700;text-transform:uppercase;color:#64748b;margin-bottom:6px;">Logo da empresa</div>
          <div id="identidadeLogoPreview" style="height:150px;border:1px dashed #cbd5e1;border-radius:16px;background:#f8fafc;display:flex;align-items:center;justify-content:center;overflow:hidden;margin-bottom:14px;color:#64748b;">
            Nenhuma logo
          </div>
          <input id="identidadeLogoInput" type="file" accept="image/png,image/jpeg,image/jpg,image/webp" style="display:none;">
          <button class="btn secondary" type="button" id="identidadeLogoBtn" style="width:100%;">Selecionar logo</button>
          <div style="display:grid;grid-template-columns:42px 1fr 42px;gap:8px;align-items:center;margin-top:10px;">
            <button class="btn secondary" type="button" id="identidadeLogoZoomOut" style="height:40px;padding:0;">-</button>
            <div id="identidadeLogoZoomLabel" style="text-align:center;color:#64748b;font-size:12px;font-weight:700;">100%</div>
            <button class="btn secondary" type="button" id="identidadeLogoZoomIn" style="height:40px;padding:0;">+</button>
          </div>
          <p style="margin:10px 0 0;color:#64748b;font-size:12px;line-height:1.45;">Use PNG ou WEBP sem fundo para melhor acabamento no menu e nas propostas.</p>
        </section>

        <section style="border:1px solid #e5e7eb;border-radius:18px;padding:18px;background:#fff;">
          <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:18px;">
            <div>
              <div style="font-size:12px;font-weight:700;text-transform:uppercase;color:#64748b;margin-bottom:6px;">Identidade Visual</div>
              <h3 style="margin:0;color:#0f2a44;font-size:20px;">Paleta da empresa</h3>
            </div>
            <span id="identidadeStatus" style="font-size:12px;color:#64748b;">Pronto</span>
          </div>

          <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;margin-bottom:18px;">
            ${colorField("Cor do menu lateral", "identidadeCorSidebar")}
            ${colorField("Cor de destaque", "identidadeCorDestaque")}
            ${colorField("Cor do fundo", "identidadeCorFundo")}
          </div>

          <div style="border:1px solid #e5e7eb;border-radius:18px;overflow:hidden;background:#fff;">
            <div style="padding:12px 14px;border-bottom:1px solid #e5e7eb;font-size:12px;font-weight:700;color:#64748b;text-transform:uppercase;">Preview do sistema</div>
            <div id="identidadePreview" style="display:grid;grid-template-columns:90px 1fr;min-height:170px;background:#fffaf6;">
              <div data-preview-sidebar style="background:#0f2a44;padding:14px;color:#fff;">
                <div data-preview-logo style="width:34px;height:34px;border-radius:10px;background:#fff;display:flex;align-items:center;justify-content:center;color:#0f2a44;font-weight:800;margin-bottom:28px;">E</div>
                <div style="height:8px;background:rgba(255,255,255,.65);border-radius:99px;margin-bottom:10px;"></div>
                <div style="height:8px;background:rgba(255,255,255,.35);border-radius:99px;margin-bottom:10px;"></div>
                <div style="height:8px;background:rgba(255,255,255,.35);border-radius:99px;"></div>
              </div>
              <div data-preview-bg style="background:#fffaf6;padding:18px;">
                <div style="background:#fff;border:1px solid #e5e7eb;border-radius:14px;padding:14px;box-shadow:0 12px 28px rgba(15,23,42,.08);">
                  <div style="height:12px;width:46%;background:#0f2a44;border-radius:99px;margin-bottom:12px;"></div>
                  <div style="height:10px;width:72%;background:#e5e7eb;border-radius:99px;margin-bottom:16px;"></div>
                  <button data-preview-button class="btn primary" type="button" style="pointer-events:none;">Botao principal</button>
                </div>
              </div>
            </div>
          </div>

          <div id="identidadeContrastAlert" style="display:none;margin-top:12px;padding:11px 12px;border-radius:12px;background:#fff7ed;border:1px solid #fed7aa;color:#9a3412;font-size:13px;"></div>

          <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:16px;">
            <button class="btn secondary" type="button" id="identidadeRestaurarBtn">Restaurar padrao EasyLoc</button>
            <button class="btn primary" type="button" id="identidadeSalvarBtn">Salvar alteracoes</button>
          </div>
        </section>
      </div>
    `;
  }

  function colorField(label, id) {
    return `
      <label style="display:grid;gap:8px;font-size:12px;color:#64748b;font-weight:700;">
        ${label}
        <div style="display:grid;grid-template-columns:46px 1fr;gap:8px;">
          <input id="${id}Picker" type="color" style="width:46px;height:46px;border:1px solid #e5e7eb;border-radius:12px;background:#fff;padding:4px;">
          <input id="${id}" class="el-input" maxlength="7" placeholder="#FF6A00">
        </div>
      </label>
    `;
  }

  async function bind(container, state, api) {
    const current = { ...DEFAULT, logo_url: state.empresa?.logo_url || "", ...(state.identidadeVisual || {}) };
    let logoFile = null;
    let logoPreviewUrl = current.logo_url || "";
    let logoZoom = Number(current.logo_zoom || 1) || 1;

    const els = {
      logoPreview: container.querySelector("#identidadeLogoPreview"),
      logoInput: container.querySelector("#identidadeLogoInput"),
      logoBtn: container.querySelector("#identidadeLogoBtn"),
      logoZoomOut: container.querySelector("#identidadeLogoZoomOut"),
      logoZoomIn: container.querySelector("#identidadeLogoZoomIn"),
      logoZoomLabel: container.querySelector("#identidadeLogoZoomLabel"),
      sidebar: container.querySelector("#identidadeCorSidebar"),
      sidebarPicker: container.querySelector("#identidadeCorSidebarPicker"),
      destaque: container.querySelector("#identidadeCorDestaque"),
      destaquePicker: container.querySelector("#identidadeCorDestaquePicker"),
      fundo: container.querySelector("#identidadeCorFundo"),
      fundoPicker: container.querySelector("#identidadeCorFundoPicker"),
      preview: container.querySelector("#identidadePreview"),
      alert: container.querySelector("#identidadeContrastAlert"),
      status: container.querySelector("#identidadeStatus"),
      save: container.querySelector("#identidadeSalvarBtn"),
      restore: container.querySelector("#identidadeRestaurarBtn")
    };

    function setStatus(text, color = "#64748b") {
      els.status.textContent = text;
      els.status.style.color = color;
    }

    function fill(theme) {
      els.sidebar.value = theme.cor_sidebar;
      els.sidebarPicker.value = theme.cor_sidebar;
      els.destaque.value = theme.cor_destaque;
      els.destaquePicker.value = theme.cor_destaque;
      els.fundo.value = theme.cor_fundo;
      els.fundoPicker.value = theme.cor_fundo;
      logoPreviewUrl = theme.logo_url || "";
      logoZoom = Number(theme.logo_zoom || logoZoom || 1) || 1;
      renderLogo();
      updatePreview();
    }

    function renderLogo() {
      logoZoom = Math.min(2.2, Math.max(0.5, Number(logoZoom || 1)));
      if (els.logoZoomLabel) els.logoZoomLabel.textContent = `${Math.round(logoZoom * 100)}%`;
      if (logoPreviewUrl) {
        els.logoPreview.innerHTML = `<img src="${logoPreviewUrl}" style="max-width:90%;max-height:110px;object-fit:contain;transform:scale(${logoZoom});transform-origin:center;transition:transform .16s ease;" alt="Logo">`;
      } else {
        els.logoPreview.textContent = "Nenhuma logo";
      }
    }

    function readTheme() {
      return {
        logo_url: logoPreviewUrl,
        logo_zoom: logoZoom,
        cor_sidebar: els.sidebar.value.trim(),
        cor_destaque: els.destaque.value.trim(),
        cor_fundo: els.fundo.value.trim()
      };
    }

    function updatePreview() {
      const validation = window.EasyLocTheme.validateTheme(readTheme());
      const theme = validation.theme;
      els.preview.querySelector("[data-preview-sidebar]").style.background = theme.cor_sidebar;
      els.preview.querySelector("[data-preview-bg]").style.background = theme.cor_fundo;
      els.preview.querySelector("[data-preview-button]").style.background = theme.cor_destaque;
      els.preview.querySelector("[data-preview-button]").style.borderColor = theme.cor_destaque;
      els.preview.style.background = theme.cor_fundo;

      if (!validation.ok) {
        els.alert.style.display = "block";
        els.alert.innerHTML = validation.errors.join("<br>");
      } else {
        els.alert.style.display = "none";
        els.alert.innerHTML = "";
      }
      return validation;
    }

    function syncColor(textInput, picker) {
      textInput.addEventListener("input", () => {
        if (window.EasyLocTheme.isHex(textInput.value)) picker.value = textInput.value;
        updatePreview();
      });
      picker.addEventListener("input", () => {
        textInput.value = picker.value.toUpperCase();
        updatePreview();
      });
    }

    async function uploadLogoIfNeeded() {
      if (!logoFile) return logoPreviewUrl;
      if (logoFile.size > 2 * 1024 * 1024) throw new Error("A logo deve ter no maximo 2MB.");
      const ext = (logoFile.name.split(".").pop() || "png").toLowerCase();
      const path = `${state.empresaId}/identidade-logo.${ext}`;
      const { error } = await window.supabaseClient.storage
        .from("empresas-logos")
        .upload(path, logoFile, { upsert: true, cacheControl: "3600" });
      if (error) throw error;
      const { data } = window.supabaseClient.storage.from("empresas-logos").getPublicUrl(path);
      return data?.publicUrl || "";
    }

    async function saveIdentity(showMessage = true) {
      const validation = updatePreview();
      if (!validation.ok) {
        if (typeof window.alerta === "function") window.alerta(validation.errors[0], "Identidade Visual", "aviso");
        else alert(validation.errors[0]);
        return false;
      }
      try {
        setStatus("Salvando...", "#f97316");
        const logoUrl = await uploadLogoIfNeeded();
        const payload = {
          empresa_id: state.empresaId,
          logo_url: logoUrl,
          logo_zoom: logoZoom,
          cor_sidebar: validation.theme.cor_sidebar,
          cor_destaque: validation.theme.cor_destaque,
          cor_fundo: validation.theme.cor_fundo,
          updated_at: new Date().toISOString()
        };
        const { data, error } = await api.saveIdentidadeVisual(payload);
        if (error) throw error;
        const { error: erroLogoEmpresa } = await api.saveEmpresa(state.empresaId, { logo_url: logoUrl || null });
        if (erroLogoEmpresa) throw erroLogoEmpresa;
        state.identidadeVisual = data || payload;
        state.empresa.logo_url = logoUrl || null;
        logoPreviewUrl = payload.logo_url;
        logoFile = null;
        window.EasyLocTheme.applyTheme(payload);
        setStatus("Salvo", "#16a34a");
        if (showMessage && typeof window.alerta === "function") window.alerta("Identidade visual salva.", "Empresa", "sucesso");
        return true;
      } catch (error) {
        console.error("Erro ao salvar identidade visual:", error);
        setStatus("Erro ao salvar", "#dc2626");
        const tabelaNaoExiste = error?.code === "PGRST205" || String(error?.message || "").includes("configuracoes_empresa");
        const mensagem = tabelaNaoExiste
          ? "A tabela configuracoes_empresa ainda nao existe no Supabase. Aplique a migration 20260620000200_empresa_identidade_visual.sql e tente salvar novamente."
          : (error.message || "Erro ao salvar identidade visual.");
        if (typeof window.alerta === "function") window.alerta(mensagem, "Identidade Visual", "erro");
        else alert(mensagem);
        return false;
      }
    }

    async function restoreDefault() {
      const ok = typeof window.confirmarGlobal === "function"
        ? await window.confirmarGlobal("Deseja restaurar a identidade padrao EasyLoc?", "Identidade Visual", { confirmarTexto: "Restaurar", tipo: "warning" })
        : confirm("Deseja restaurar a identidade padrao EasyLoc?");
      if (!ok) return;
      logoFile = null;
      fill({ ...DEFAULT, logo_url: logoPreviewUrl, logo_zoom: logoZoom });
      await saveIdentity(true);
    }

    fill(current);
    syncColor(els.sidebar, els.sidebarPicker);
    syncColor(els.destaque, els.destaquePicker);
    syncColor(els.fundo, els.fundoPicker);

    els.logoBtn.addEventListener("click", () => els.logoInput.click());
    els.logoInput.addEventListener("change", () => {
      const file = els.logoInput.files?.[0];
      if (!file) return;
      if (!["image/png", "image/jpeg", "image/jpg", "image/webp"].includes(file.type)) {
        if (typeof window.alerta === "function") window.alerta("Formato de logo invalido.", "Identidade Visual", "aviso");
        return;
      }
      logoFile = file;
      logoPreviewUrl = URL.createObjectURL(file);
      logoZoom = 1;
      renderLogo();
    });
    els.logoZoomOut.addEventListener("click", () => {
      logoZoom = Math.max(0.5, logoZoom - 0.1);
      renderLogo();
    });
    els.logoZoomIn.addEventListener("click", () => {
      logoZoom = Math.min(2.2, logoZoom + 0.1);
      renderLogo();
    });
    els.save.addEventListener("click", () => saveIdentity(true));
    els.restore.addEventListener("click", restoreDefault);

    window.__salvarIdentidadeVisual = () => saveIdentity(false);
    return () => {
      if (window.__salvarIdentidadeVisual) delete window.__salvarIdentidadeVisual;
    };
  }

  window.empresa = window.empresa || {};
  window.empresa.sections = window.empresa.sections || {};
  window.empresa.sections.identidade = { render, bind };
})();
