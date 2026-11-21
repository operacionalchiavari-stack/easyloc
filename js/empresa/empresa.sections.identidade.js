(function () {
  const DEFAULT = window.EasyLocTheme?.DEFAULT_THEME || {
    logo_url: "",
    logo_zoom: 1,
    cor_sidebar: "#5a5a55",
    cor_destaque: "#7d603d",
    cor_fundo: "#f3f5f6"
  };
  const LOGO_TYPES = ["image/png", "image/jpeg", "image/jpg", "image/webp", "image/svg+xml"];
  const LOGO_EXTS = ["png", "jpg", "jpeg", "webp", "svg"];

  function render(container) {
    container.innerHTML = `
      <div class="identity-layout">
        <section style="border:1px solid #e5e7eb;border-radius:18px;padding:18px;background:#fff;">
          <div style="font-size:12px;font-weight:700;text-transform:uppercase;color:#64748b;margin-bottom:6px;">Logo da empresa</div>
          <div id="identidadeLogoPreview" style="height:150px;border:1px dashed #cbd5e1;border-radius:16px;background:var(--el-color-surface-soft,#f6f7f9);display:flex;align-items:center;justify-content:center;overflow:hidden;margin-bottom:14px;color:#e2e8f0;">
            Nenhuma logo
          </div>
          <input id="identidadeLogoInput" type="file" accept="image/png,image/jpeg,image/jpg,image/webp,image/svg+xml,.png,.jpg,.jpeg,.webp,.svg" style="display:none;">
          <button class="btn secondary" type="button" id="identidadeLogoBtn" style="width:100%;">Selecionar logo</button>
          <div style="display:grid;grid-template-columns:42px 1fr 42px;gap:8px;align-items:center;margin-top:10px;">
            <button class="btn secondary" type="button" id="identidadeLogoZoomOut" style="height:40px;padding:0;">-</button>
            <div id="identidadeLogoZoomLabel" style="text-align:center;color:#64748b;font-size:12px;font-weight:700;">100%</div>
            <button class="btn secondary" type="button" id="identidadeLogoZoomIn" style="height:40px;padding:0;">+</button>
          </div>
          <p style="margin:10px 0 0;color:#64748b;font-size:12px;line-height:1.45;">Use PNG, WEBP ou SVG com fundo transparente para melhor acabamento no menu e nas propostas.</p>
        </section>

        <section style="border:1px solid #e5e7eb;border-radius:18px;padding:18px;background:#fff;">
          <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:18px;">
            <div>
              <div style="font-size:12px;font-weight:700;text-transform:uppercase;color:#64748b;margin-bottom:6px;">Identidade Visual</div>
              <h3 style="margin:0;color:#2E1F1F;font-size:20px;">Cores do sistema</h3>
            </div>
            <span id="identidadeStatus" style="font-size:12px;color:#64748b;">Pronto</span>
          </div>

          <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;margin-bottom:18px;">
            ${colorField("Menu", DEFAULT.cor_sidebar, "identidadeCorMenu")}
            ${colorField("Botões", DEFAULT.cor_destaque, "identidadeCorBotoes")}
            ${colorField("Fundo", DEFAULT.cor_fundo)}
          </div>

          <div style="border:1px solid #e5e7eb;border-radius:18px;overflow:hidden;background:#fff;">
            <div style="padding:12px 14px;border-bottom:1px solid #e5e7eb;font-size:12px;font-weight:700;color:#64748b;text-transform:uppercase;">Personalize as cores da sua empresa. O fundo cinza permanece fixo.</div>
            <div id="identidadePreview" style="display:grid;grid-template-columns:1fr;grid-template-rows:60px 1fr;min-height:170px;background:#ffffff;">
              <div data-preview-sidebar style="background:var(--el-color-surface-soft,#f6f7f9);padding:14px;color:#fff;display:flex;align-items:center;gap:16px;">
                <div data-preview-logo style="width:54px;height:38px;border-radius:8px;background:transparent;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:600;margin-bottom:0;overflow:hidden;">E</div>
                <div style="height:8px;background:rgba(255,255,255,.65);border-radius:99px;margin-bottom:10px;"></div>
                <div style="height:8px;background:rgba(255,255,255,.35);border-radius:99px;margin-bottom:10px;"></div>
                <div style="height:8px;background:rgba(255,255,255,.35);border-radius:99px;"></div>
              </div>
              <div data-preview-bg style="background:#ffffff;padding:18px;">
                <div style="background:#fff;border:1px solid #e5e7eb;border-radius:14px;padding:14px;box-shadow:0 12px 28px rgba(15,23,42,.08);">
                  <div style="height:12px;width:46%;background:#2E1F1F;border-radius:99px;margin-bottom:12px;"></div>
                  <div style="height:10px;width:72%;background:#e5e7eb;border-radius:99px;margin-bottom:16px;"></div>
                  <button data-preview-button class="btn primary" type="button" style="pointer-events:none;">Botao principal</button>
                </div>
              </div>
            </div>
          </div>

          <label style="display:flex;align-items:center;gap:16px;margin-top:20px;flex-wrap:wrap;"><span>Zoom padrão do sistema</span><select id="identidadeSistemaZoom" style="width:130px;"><option value="75">75%</option><option value="80">80%</option><option value="85">85%</option><option value="90">90%</option><option value="95">95%</option><option value="100">100%</option><option value="105">105%</option><option value="110">110%</option><option value="115">115%</option><option value="120">120%</option><option value="125">125%</option></select><small style="color:#64748b;">Padrão da empresa no computador. Cada pessoa pode ajustar também pelo navegador.</small></label>
          <div id="identidadeContrastAlert" style="display:none;margin-top:12px;padding:11px 12px;border-radius:12px;background:#eef0f2;border:1px solid #d8d0cc;color:#2E1F1F;font-size:13px;"></div>

          <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:16px;">
            <button class="btn primary" type="button" id="identidadeSalvarBtn">Salvar alteracoes</button>
          </div>
        </section>
      </div>
      <section class="festive-settings" aria-labelledby="festiveSettingsTitle">
        <div class="festive-settings-head"><div><span class="festive-settings-kicker">Um toque de carinho no dia a dia</span>
          <h3 id="festiveSettingsTitle">Temas festivos do sistema</h3>
          <p class="festive-settings-description">Escolha uma identidade pronta para toda a equipe. As cores do sistema e as boas-vindas do Início entram no clima da data, com uma cena animada e uma mensagem especial. Sua logo e os layouts de impressão são preservados.</p>
        </div><span class="festive-system-badge">Exclusivo do sistema</span></div>
        <div class="festive-options" role="radiogroup" aria-label="Tema festivo do sistema">
          <button class="festive-option" type="button" role="radio" aria-checked="true" data-festive-theme="" tabindex="0">
            <span class="festive-option-check" aria-hidden="true">✓</span><span class="festive-option-art"><span class="festive-original-art"><span class="festive-original-window"></span></span></span>
            <span class="festive-option-info">Identidade da empresa<span class="festive-swatches" aria-hidden="true"><i style="background:#5a5a55"></i><i style="background:#7d603d"></i></span></span>
          </button>
          ${Object.values(window.EasyLocTheme.FESTIVE_THEMES).map(theme => `<button class="festive-option" type="button" role="radio" aria-checked="false" data-festive-theme="${theme.id}" tabindex="-1"><span class="festive-option-check" aria-hidden="true">✓</span><span class="festive-option-art">${window.EasyLocFestive.sceneHtml(theme.id)}</span><span class="festive-option-info">${theme.nome}<span class="festive-swatches" aria-hidden="true">${theme.cores.map(color=>`<i style="background:${color}"></i>`).join('')}</span></span></button>`).join('')}
        </div>
        <fieldset class="festive-period" id="festivePeriod" hidden>
          <legend>Período de exibição</legend>
          <div class="festive-period-fields">
            <label for="festivePeriodStart"><span>Data de início</span><input type="date" id="festivePeriodStart" aria-describedby="festivePeriodHelp"></label>
            <label for="festivePeriodEnd"><span>Data de fim</span><input type="date" id="festivePeriodEnd" aria-describedby="festivePeriodHelp"></label>
          </div>
          <p id="festivePeriodHelp">O tema aparece da data inicial até o fim da data final, no horário de Brasília. Antes e depois, o sistema usa a identidade original. A prévia abaixo pode ser vista a qualquer momento.</p>
        </fieldset>
        <div class="festive-preview-head" id="festivePreviewHead" hidden><span>Prévia das boas-vindas no Início</span><button type="button" class="festive-preview-toggle" id="festivePreviewToggle" aria-pressed="false">Pausar animação</button></div>
        <div class="festive-preview-frame" id="festivePreviewFrame"></div>
        <p class="festive-selection-status" id="festiveSelectionStatus" role="status"></p>
        <div style="display:flex;justify-content:flex-end;margin-top:14px;"><button type="button" class="btn primary" id="festiveSaveBtn">Salvar tema e identidade</button></div>
      </section>
    `;
  }

  function colorField(label, color, id) {
    if(!id)return '<div style="display:grid;gap:8px;font-size:13px;"><span>'+label+' (cinza fixo)</span><span style="display:block;height:36px;border:1px solid var(--el-color-border);border-radius:9px;background:'+color+';"></span></div>';
    return '<label style="display:grid;gap:8px;font-size:13px;"><span>'+label+'</span><input type="color" id="'+id+'" aria-label="Cor de '+label+'" value="'+color+'" style="width:100%;height:40px;padding:3px;border:1px solid var(--el-color-border);border-radius:9px;cursor:pointer;"></label>';
  }

  async function bind(container, state, api) {
    const current = window.EasyLocTheme.validateTheme({ ...DEFAULT, logo_url: state.empresa?.logo_url || "", ...(state.identidadeVisual || {}) }).theme;
    let logoFile = null;
    let logoPreviewUrl = current.logo_url || "";
    let logoZoom = Number(current.logo_zoom || 1) || 1;
    let selectedFestive = current.tema_festivo;
    let saving = false;

    const els = {
      logoPreview: container.querySelector("#identidadeLogoPreview"),
      logoInput: container.querySelector("#identidadeLogoInput"),
      logoBtn: container.querySelector("#identidadeLogoBtn"),
      logoZoomOut: container.querySelector("#identidadeLogoZoomOut"),
      logoZoomIn: container.querySelector("#identidadeLogoZoomIn"),
      logoZoomLabel: container.querySelector("#identidadeLogoZoomLabel"),

      systemZoom: container.querySelector("#identidadeSistemaZoom"),
      menuColor: container.querySelector("#identidadeCorMenu"),
      buttonColor: container.querySelector("#identidadeCorBotoes"),
      preview: container.querySelector("#identidadePreview"),
      alert: container.querySelector("#identidadeContrastAlert"),
      status: container.querySelector("#identidadeStatus"),
      save: container.querySelector("#identidadeSalvarBtn")

    };
    const festiveOptions = [...container.querySelectorAll('[data-festive-theme]')];
    const festivePreview = container.querySelector('#festivePreviewFrame');
    const festiveStatus = container.querySelector('#festiveSelectionStatus');
    const festiveSave = container.querySelector('#festiveSaveBtn');
    const festiveToggle = container.querySelector('#festivePreviewToggle');
    const periodStart = container.querySelector('#festivePeriodStart');
    const periodEnd = container.querySelector('#festivePeriodEnd');
    periodStart.value = current.tema_festivo_inicio || '';
    periodEnd.value = current.tema_festivo_fim || '';
    const dateLabel = value => value.split('-').reverse().join('/');

    function updateFestivePreview(dirty = false) {
      festiveOptions.forEach(button => {
        const active = button.dataset.festiveTheme === selectedFestive;
        button.setAttribute('aria-checked', String(active));
        button.tabIndex = active ? 0 : -1;
      });
      const festive = window.EasyLocTheme.festiveTheme(selectedFestive);
      container.querySelector('#festivePeriod').hidden = !festive;
      periodStart.required = periodEnd.required = Boolean(festive);
      periodEnd.min = periodStart.value;
      container.querySelector('#festivePreviewHead').hidden = !festive;
      festivePreview.innerHTML = window.EasyLocFestive.welcomeHtml(selectedFestive);
      festivePreview.classList.remove('festive-paused');
      festiveToggle.textContent = 'Pausar animação';
      festiveToggle.setAttribute('aria-pressed', 'false');
      const validation = window.EasyLocTheme.validateTheme(readTheme());
      const today = window.EasyLocTheme.todayISO();
      const stateLabel = periodStart.value > today ? 'Agendado' : periodEnd.value < today ? 'Período encerrado' : 'Em exibição';
      festiveStatus.textContent = festive
        ? !validation.ok ? validation.errors[0]
          : `${dirty ? 'Período selecionado' : stateLabel}: ${festive.nome}, de ${dateLabel(periodStart.value)} a ${dateLabel(periodEnd.value)}.${dirty ? ' Salve para confirmar a programação.' : ''} As impressões continuam com a identidade original.`
        : `Identidade original ${dirty ? 'selecionada. Salve para retirar o tema festivo.' : 'ativa. Escolha uma data para ver a animação.'}`;
      updatePreview();
    }

    festiveOptions.forEach((button, index) => {
      button.addEventListener('click', () => {
        selectedFestive = button.dataset.festiveTheme;
        updateFestivePreview(true);
      });
      button.addEventListener('keydown', event => {
        const keys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'];
        if (!keys.includes(event.key)) return;
        event.preventDefault();
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? festiveOptions.length - 1
          : (index + (['ArrowRight', 'ArrowDown'].includes(event.key) ? 1 : -1) + festiveOptions.length) % festiveOptions.length;
        festiveOptions[next].focus();
        festiveOptions[next].click();
      });
    });
    festiveToggle.addEventListener('click', () => {
      const paused = festivePreview.classList.toggle('festive-paused');
      festiveToggle.setAttribute('aria-pressed', String(paused));
      festiveToggle.textContent = paused ? 'Retomar animação' : 'Pausar animação';
    });
    [periodStart, periodEnd].forEach(input => input.addEventListener('input', () => updateFestivePreview(true)));

    function setStatus(text, color = (window.EasyLocTheme?.color?.('accent') || '#7d603d')) {
      els.status.textContent = text;
      els.status.style.color = color;
    }

    function logoFileIsValid(file) {
      const ext = (file.name.split(".").pop() || "").toLowerCase();
      return LOGO_TYPES.includes(file.type) || LOGO_EXTS.includes(ext);
    }

    function fill(theme) {
      els.systemZoom.value = String(theme.sistema_zoom || 100);
      els.menuColor.value = theme.cor_sidebar;
      els.buttonColor.value = theme.cor_destaque;

      logoPreviewUrl = theme.logo_url || "";
      logoZoom = Number(theme.logo_zoom || logoZoom || 1) || 1;
      renderLogo();
      updatePreview();
    }

    function renderLogo() {
      logoZoom = Math.min(2.2, Math.max(0.5, Number(logoZoom || 1)));
      if (els.logoZoomLabel) els.logoZoomLabel.textContent = `${Math.round(logoZoom * 100)}%`;
      if (logoPreviewUrl) {
        els.logoPreview.innerHTML = `<img src="${logoPreviewUrl}" style="max-width:90%;max-height:110px;object-fit:contain;transform:scale(${logoZoom});transform-origin:center;transition:transform .16s ease;filter:drop-shadow(0 10px 18px rgba(0,0,0,.18));" alt="Logo">`;
      } else {
        els.logoPreview.textContent = "Nenhuma logo";
      }
    }

    function readTheme() {
      return {
        sistema_zoom: Number(els.systemZoom.value),
        tema_festivo: selectedFestive,
        tema_festivo_inicio: selectedFestive ? periodStart.value : null,
        tema_festivo_fim: selectedFestive ? periodEnd.value : null,
        logo_url: logoPreviewUrl,
        logo_zoom: logoZoom,
        cor_sidebar: els.menuColor.value,
        cor_destaque: els.buttonColor.value,
        cor_fundo: DEFAULT.cor_fundo
      };
    }

    function updatePreview() {
      const validation = window.EasyLocTheme.validateTheme(readTheme());
      const theme = window.EasyLocTheme.systemTheme(validation.theme, { preview: true });
      els.preview.querySelector("[data-preview-sidebar]").style.background = theme.cor_sidebar;
      els.preview.querySelector("[data-preview-bg]").style.background = theme.cor_fundo;
      const previewButton = els.preview.querySelector("[data-preview-button]");
      previewButton.style.setProperty('background', theme.cor_destaque, 'important');
      previewButton.style.setProperty('border-color', theme.cor_destaque, 'important');
      previewButton.style.setProperty('color', window.EasyLocTheme.contrast(theme.cor_destaque, '#FFFFFF') >= 4.5 ? '#FFFFFF' : '#142033', 'important');
      els.logoPreview.style.background = theme.cor_sidebar;
      els.preview.querySelector("[data-preview-button]").style.borderColor = theme.cor_destaque;
      els.preview.style.background = theme.cor_fundo;
      const previewLogo = els.preview.querySelector("[data-preview-logo]");
      if (previewLogo) {
        previewLogo.innerHTML = logoPreviewUrl
          ? `<img src="${logoPreviewUrl}" style="max-width:100%;max-height:100%;object-fit:contain;transform:scale(${Math.min(1.35, Math.max(0.75, logoZoom))});transform-origin:center;" alt="Logo">`
          : "E";
      }

      if (!validation.ok) {
        els.alert.style.display = "block";
        els.alert.innerHTML = validation.errors.join("<br>");
      } else {
        els.alert.style.display = "none";
        els.alert.innerHTML = "";
      }
      return validation;
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
      const publicUrl = data?.publicUrl || "";
      return publicUrl ? `${publicUrl}?v=${Date.now()}` : "";
    }

    async function saveIdentity(showMessage = true) {
      if (saving || window.EasyLocPermissions?.hasPermission?.('configuracoes.empresa.editar') === false) return false;
      const validation = updatePreview();
      if (!validation.ok) {
        if (typeof window.alerta === "function") window.alerta(validation.errors[0], "Identidade Visual", "aviso");
        else alert(validation.errors[0]);
        return false;
      }
      try {
        saving = true;
        els.save.disabled = festiveSave.disabled = true;
        festiveOptions.forEach(button => { button.disabled = true; });
        periodStart.disabled = periodEnd.disabled = true;
        setStatus("Salvando...", "#2E1F1F");
        const logoUrl = await uploadLogoIfNeeded();
        const payload = {
          empresa_id: state.empresaId,
          logo_url: logoUrl,
          logo_zoom: logoZoom,
          sistema_zoom: validation.theme.sistema_zoom,
          tema_festivo: selectedFestive,
          tema_festivo_inicio: validation.theme.tema_festivo_inicio,
          tema_festivo_fim: validation.theme.tema_festivo_fim,
          cor_sidebar: validation.theme.cor_sidebar,
          cor_destaque: validation.theme.cor_destaque,
          cor_fundo: DEFAULT.cor_fundo,

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
        try {
          localStorage.removeItem(`easyloc_theme_${state.empresaId}`);
        } catch (cacheError) {
          console.warn("[EasyLoc Theme] cache antigo ignorado:", cacheError);
        }
        window.EasyLocTheme.applyTheme(payload);
        if(window.parent!==window)window.parent.EasyLocTheme?.applyTheme(payload);
        setStatus("Salvo", "#16a34a");
        updateFestivePreview();
        if (showMessage && typeof window.alerta === "function") window.alerta("Identidade visual salva.", "Empresa", "sucesso");
        return true;
      } catch (error) {
        console.error("Erro ao salvar identidade visual:", error);
        setStatus("Erro ao salvar", "#dc2626");
        const missingFestive = String(error?.message || '').includes('tema_festivo');
        const missingPeriod = /tema_festivo_(inicio|fim)/.test(String(error?.message || ''));
        const tabelaNaoExiste = error?.code === "PGRST205" || String(error?.message || "").includes("configuracoes_empresa");
        const mensagem = missingPeriod
          ? 'Não foi possível salvar o período do tema. Atualize o banco com supabase/migrations/20261115001800_temas_festivos_periodo.sql e tente novamente.'
          : missingFestive
          ? 'Os temas festivos precisam da atualização do banco: supabase/migrations/20261115001700_temas_festivos_sistema.sql. A seleção ainda não foi salva.'
          : tabelaNaoExiste
          ? "A tabela configuracoes_empresa ainda nao existe no Supabase. Aplique o SQL supabase/APLICAR_AGORA_identidade_visual_empresa.sql no Supabase e tente salvar novamente."
          : (error.message || "Erro ao salvar identidade visual.");
        if (typeof window.alerta === "function") window.alerta(mensagem, "Identidade Visual", "erro");
        else alert(mensagem);
        return false;
      } finally {
        saving = false;
        els.save.disabled = festiveSave.disabled = window.EasyLocPermissions?.hasPermission?.('configuracoes.empresa.editar') === false;
        festiveOptions.forEach(button => { button.disabled = false; });
        periodStart.disabled = periodEnd.disabled = false;
      }
    }

    fill(current);
    updateFestivePreview();
    els.save.disabled = festiveSave.disabled = window.EasyLocPermissions?.hasPermission?.('configuracoes.empresa.editar') === false;
    els.menuColor.addEventListener("input", updatePreview);
    els.buttonColor.addEventListener("input", updatePreview);

    els.logoBtn.addEventListener("click", () => els.logoInput.click());
    els.logoInput.addEventListener("change", () => {
      const file = els.logoInput.files?.[0];
      if (!file) return;
      if (!logoFileIsValid(file)) {
        if (typeof window.alerta === "function") window.alerta("Formato de logo invalido. Use PNG, WEBP, SVG ou JPG.", "Identidade Visual", "aviso");
        return;
      }
      logoFile = file;
      logoPreviewUrl = URL.createObjectURL(file);
      logoZoom = 1;
      renderLogo();
      updatePreview();
    });
    els.logoZoomOut.addEventListener("click", () => {
      logoZoom = Math.max(0.5, logoZoom - 0.1);
      renderLogo();
      updatePreview();
    });
    els.logoZoomIn.addEventListener("click", () => {
      logoZoom = Math.min(2.2, logoZoom + 0.1);
      renderLogo();
      updatePreview();
    });
    els.save.addEventListener("click", () => saveIdentity(true));
    festiveSave.addEventListener('click', () => saveIdentity(true));

    window.__salvarIdentidadeVisual = () => saveIdentity(false);
    return () => {
      if (window.__salvarIdentidadeVisual) delete window.__salvarIdentidadeVisual;
    };
  }

  window.empresa = window.empresa || {};
  window.empresa.sections = window.empresa.sections || {};
  window.empresa.sections.identidade = { render, bind };
})();
