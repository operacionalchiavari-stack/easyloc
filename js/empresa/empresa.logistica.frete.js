(function(){
  async function render(container, state) {
container.innerHTML = `
  <div style="
    margin-bottom:42px;
  ">
        <div style="
          font-weight:600;
          font-size:15px;
          color:#2E1F1F;
          margin-bottom:18px;
        ">
          Frete
        </div>

        <div style="
          display:flex;
          align-items:center;
          justify-content:space-between;
          gap:20px;
          margin-bottom:18px;
          flex-wrap:wrap;
        ">

          <div style="
            font-weight:600;
            font-size:15px;
            color:#2E1F1F;
            min-width:220px;
          ">
            Categorias de CaminhÃ£o
          </div>

          <div style="
            display:flex;
            align-items:end;
            gap:12px;
          ">

            <div>
              <label style="font-size:12px;color:#64748b;">
                Frete mÃ­n (R$)
              </label>
              <input id="freteMinimoInput"
                type="text"
                inputmode="decimal"
                style="
                  width:120px;
                  padding:8px;
                  border-radius:10px;
                  border:1px solid #e5e7eb;
                ">
            </div>

            <div>
              <label style="font-size:12px;color:#64748b;">
                Frete mÃ¡x (R$)
              </label>
              <input id="freteMaximoInput"
                type="text"
                inputmode="decimal"
                style="
                  width:120px;
                  padding:8px;
                  border-radius:10px;
                  border:1px solid #e5e7eb;
                ">
            </div>

          </div>

          <button id="novaCategoriaBtn"
            type="button"
            style="
              padding:8px 16px;
              border-radius:12px;
              border:none;
              background:#2E1F1F;
              color:#ffffff;
              font-weight:600;
              cursor:pointer;
              white-space:nowrap;
            ">
            + Nova Categoria
          </button>

        </div>

        <div style="
          border:1px solid #e5e7eb;
          border-radius:16px;
          overflow:hidden;
        ">

          <div style="
            display:grid;
            grid-template-columns:1fr 1fr 1fr 120px 110px 80px 100px;
            padding:14px 18px;
            background:#f8fafc;
            font-size:13px;
            font-weight:600;
            color:#64748b;
          ">
            <div>Nome</div>
            <div>Volume mÃ­n (mÂ³)</div>
            <div>Volume mÃ¡x (mÂ³)</div>
            <div>Valor/KM (R$)</div>
            <div>Qtd Carregadores</div>
            <div>Ordem</div>
            <div>Ativo</div>
          </div>

          <div id="listaCategoriasCaminhao"></div>

        </div>

      </div>
    `;
  }

  async function bind(container, state, api) {
    container.querySelector("#freteMinimoInput").value =
      state.config?.frete_minimo ?? 0;
    container.querySelector("#freteMaximoInput").value =
      state.config?.frete_maximo ?? 0;

    const listaEl = container.querySelector("#listaCategoriasCaminhao");

    async function loadCategorias() {
      const cats = await api.listCategoriasCaminhao(state.empresaId) || [];
      listaEl.innerHTML = "";
      if (cats.length === 0) {
        listaEl.innerHTML = `
          <div style="padding:20px;text-align:center;color:#64748b;">
            Nenhuma categoria cadastrada.
          </div>
        `;
        return;
      }
      cats.forEach(cat => {
        const row = document.createElement("div");
        row.style.display = "grid";
        row.style.gridTemplateColumns =
          "1fr 1fr 1fr 120px 110px 80px 100px";
        row.style.padding = "14px 18px";
        row.style.borderTop = "1px solid #e5e7eb";
        row.style.alignItems = "center";
        row.innerHTML = `
          <div>${cat.nome}</div>
          <div>${cat.volume_minimo ?? 0}</div>
          <div>${cat.volume_maximo ?? 0}</div>
          <div>R$ ${Number(cat.valor_km ?? 0).toFixed(2)}</div>
          <div>${cat.qtd_carregadores ?? 0}</div>
          <div>${cat.ordem ?? 0}</div>
          <div style="display:flex;align-items:center;">
            <label style="position:relative;display:inline-block;width:42px;height:22px;">
              <input 
                type="checkbox"
                class="toggleCategoriaAtivo"
                data-id="${cat.id}"
                ${cat.ativo ? "checked" : ""}
                style="opacity:0;width:0;height:0;"
              >
              <span style="
                position:absolute;
                inset:0;
                cursor:pointer;
                background:${cat.ativo ? "#16a34a" : "#e5e7eb"};
                border-radius:22px;
                transition:.3s;
              "></span>
            </label>
          </div>
        `;
        listaEl.appendChild(row);
      });

      listaEl.querySelectorAll(".toggleCategoriaAtivo").forEach(toggle => {
        toggle.addEventListener("change", async function () {
          const categoriaId = this.dataset.id;
          const novoStatus = this.checked;
          const span = this.nextElementSibling;
          if (span) {
            span.style.background = novoStatus ? "#16a34a" : "#e5e7eb";
          }
          await api.updateCategoriaCaminhao(categoriaId, { ativo: novoStatus });
        });
      });
    }

    await loadCategorias();

    const novaBtn = container.querySelector("#novaCategoriaBtn");
    if (novaBtn) {
      novaBtn.onclick = () => {
        const row = document.createElement("div");
        row.style.display = "grid";
        row.style.gridTemplateColumns =
          "1fr 1fr 1fr 120px 110px 80px 160px";
        row.style.padding = "14px 18px";
        row.style.borderTop = "1px solid #e5e7eb";
        row.style.alignItems = "center";
        row.style.background = "#f4f1ef";
row.innerHTML = `
  <input class="cat-input-nome"
    placeholder="Nome"
    style="padding:6px;border:1px solid #e5e7eb;border-radius:8px;">

  <input class="cat-input-volmin"
    type="number"
    step="0.01"
    style="padding:6px;border:1px solid #e5e7eb;border-radius:8px;">

  <input class="cat-input-volmax"
    type="number"
    step="0.01"
    style="padding:6px;border:1px solid #e5e7eb;border-radius:8px;">

  <input class="cat-input-valorkm"
    type="number"
    step="0.01"
    style="padding:6px;border:1px solid #e5e7eb;border-radius:8px;">

  <input class="cat-input-qtd"
    type="number"
    style="padding:6px;border:1px solid #e5e7eb;border-radius:8px;">

  <input class="cat-input-ordem"
    type="number"
    style="padding:6px;border:1px solid #e5e7eb;border-radius:8px;">

  <div style="display:flex;align-items:center;">
    <input type="checkbox"
      class="cat-input-ativo"
      checked>
  </div>
`;
        listaEl.prepend(row);

        const salvarCategoria = async () => {
          const nome = row.querySelector(".cat-input-nome").value.trim();
          if (!nome) return;
          const payload = {
            empresa_id: state.empresaId,
            nome,
            volume_minimo: parseFloat(row.querySelector(".cat-input-volmin").value) || 0,
            volume_maximo: parseFloat(row.querySelector(".cat-input-volmax").value) || 0,
            valor_km: parseFloat(row.querySelector(".cat-input-valorkm").value) || 0,
            qtd_carregadores: parseInt(row.querySelector(".cat-input-qtd").value, 10) || 0,
            ordem: parseInt(row.querySelector(".cat-input-ordem").value, 10) || 0,
            ativo: row.querySelector(".cat-input-ativo").checked
          };
          const { error } = await api.insertCategoriaCaminhao(payload);
          if (error) {
            console.error("Erro ao criar categoria:", error);
            if (typeof window.alerta === "function") window.alerta("Erro ao criar categoria.", "Erro", "erro");
            else alert("Erro ao criar categoria.");
            return;
          }
          await loadCategorias();
        };

        row.querySelectorAll("input").forEach(input => {
          input.addEventListener("keydown", async function (e) {
            if (e.key === "Enter") {
              e.preventDefault();
              await salvarCategoria();
            }
          });
        });
      };
    }

    return () => {
      if (novaBtn) novaBtn.onclick = null;
    };
  }

  window.empresa = window.empresa || {};
  window.empresa.logistica = window.empresa.logistica || {};
  window.empresa.logistica.frete = { render, bind };
})();
