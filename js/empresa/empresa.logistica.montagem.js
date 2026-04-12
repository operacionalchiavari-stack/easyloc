(function(){
  async function render(container, state) {
    container.innerHTML = `
      <div style="
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap:16px;
        margin-bottom:18px;
        flex-wrap:nowrap;
      ">

        <div style="
          font-weight:600;
          font-size:15px;
          color:#0f2a44;
          min-width:220px;
        ">
          Categorias de Montagem
        </div>

        <div style="
          display:flex;
          align-items:end;
          gap:8px;
        ">

          <div>
            <label style="font-size:11px;color:#64748b;">
              Montagem mín (R$)
            </label>
            <input id="montagemMinimaInput"
              type="number"
              step="0.01"
              style="
                width:95px;
                padding:6px 8px;
                border-radius:8px;
                border:1px solid #e5e7eb;
                font-size:13px;
              ">
          </div>

          <div>
            <label style="font-size:11px;color:#64748b;">
              Montagem máx (R$)
            </label>
            <input id="montagemMaximaInput"
              type="number"
              step="0.01"
              style="
                width:95px;
                padding:6px 8px;
                border-radius:8px;
                border:1px solid #e5e7eb;
                font-size:13px;
              ">
          </div>

          <div>
            <label style="font-size:11px;color:#64748b;">
              Diária (R$)
            </label>
            <input id="diariaMontadorInput"
              type="number"
              step="0.01"
              style="
                width:95px;
                padding:6px 8px;
                border-radius:8px;
                border:1px solid #e5e7eb;
                font-size:13px;
              ">
          </div>

        </div>

        <button id="novaCategoriaMontagemBtn"
          type="button"
          style="
            padding:8px 16px;
            border-radius:12px;
            border:none;
            background:#ff6a00;
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

        <!-- HEADER -->
        <div style="
          display:grid;
          grid-template-columns:2fr 1fr 80px 100px;
          padding:14px 18px;
          background:#f8fafc;
          font-size:13px;
          font-weight:600;
          color:#64748b;
        ">
          <div>Combinação</div>
          <div>Qtd Montadores</div>
          <div>Ordem</div>
          <div>Ativo</div>
        </div>

        <div id="listaCategoriasMontagem"></div>

      </div>
    `;
  }

  async function bind(container, state, api) {
    console.log('🔷 [MONTAGEM] bind START - empresaId:', state.empresaId, 'container:', container.id);
    
    container.querySelector("#montagemMinimaInput").value =
      state.config?.montagem_minima ?? 0;
    container.querySelector("#montagemMaximaInput").value =
      state.config?.montagem_maxima ?? 0;
    container.querySelector("#diariaMontadorInput").value =
      state.config?.diaria_montador ?? 0;

    const listaEl = container.querySelector("#listaCategoriasMontagem");
    console.log('🔷 [MONTAGEM] listaEl found:', !!listaEl);

async function loadCategorias() {
    console.log('🟢 [loadCategorias] START - empresaId:', state.empresaId);

  let resp;
  try {
    resp = await api.listCategoriasMontagem(state.empresaId);
    console.log('🟢 [loadCategorias] resp recebido:', resp);
  } catch (e) {
    console.error("❌ [loadCategorias] Exceção:", e);
    listaEl.innerHTML = `
      <div style="padding:20px;text-align:center;color:#ef4444;font-weight:600;">
        Erro ao carregar categorias (ver console).
      </div>
    `;
    return;
  }

  const cats  = Array.isArray(resp) ? resp : (resp?.data || []);
  const error = Array.isArray(resp) ? null : (resp?.error || null);
  console.log('🟢 [loadCategorias] Processado: cats.length =', cats?.length || 0, ', error =', error);

  // Se estiver vindo erro de permissão/RLS, você vai ver aqui
  if (error) {
    console.error("❌ [loadCategorias] Erro detectado:", error);
    listaEl.innerHTML = `
      <div style="padding:20px;text-align:center;color:#ef4444;">
        Não foi possível listar as categorias. <br>
        <span style="color:#64748b;font-size:12px;">
          Verifique permissão/RLS da tabela (ver console).
        </span>
      </div>
    `;
    return;
  }

  listaEl.innerHTML = "";

  if (!cats || cats.length === 0) {
    console.log('⚠️ [loadCategorias] Nenhuma categoria encontrada');
    listaEl.innerHTML = `
      <div style="padding:20px;text-align:center;color:#64748b;">
        Nenhuma categoria cadastrada.
      </div>
    `;
    return;
  }

  console.log('✅ [loadCategorias] Renderizando', cats.length, 'categorias');

  cats.forEach(cat => {
    const row = document.createElement("div");
    row.style.display = "grid";
    row.style.gridTemplateColumns = "2fr 1fr 80px 100px";
    row.style.padding = "14px 18px";
    row.style.borderTop = "1px solid #e5e7eb";
    row.style.alignItems = "center";

    const combinacaoTexto = cat.combinacao || "";

    /*
      captura:
      P
      G
      2M
      3XL
      independente de "+"
    */
    const partes = combinacaoTexto.match(/(\d*[A-Z]+)/g) || [];

    const chips = partes.map(p => {

      const match = p.match(/^(\d+)?([A-Z]+)/);
      if (!match) return "";

      const qtd  = match[1] ? Number(match[1]) : 1;
      const nome = match[2];

      return `
        <div style="
          display:flex;
          align-items:center;
          gap:6px;
          background:#f1f5f9;
          padding:4px 10px;
          border-radius:8px;
          font-weight:600;
          font-size:13px;
        ">
          ${nome}
          <span style="
            background:#0f2a44;
            color:#fff;
            padding:2px 6px;
            border-radius:6px;
            font-size:11px;
          ">
            ${qtd}
          </span>
        </div>
      `;
    }).join("");

    row.innerHTML = `
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        ${chips}
      </div>

      <div>${cat.qtd_montadores}</div>
      <div>${cat.ordem ?? 0}</div>

      <div>
<div>
  <div
    class="toggleMontagemAtivo"
    data-id="${cat.id}"
    data-ativo="${cat.ativo ? "1" : "0"}"
    style="
      width:42px;
      height:22px;
      border-radius:22px;
      background:${cat.ativo ? "#16a34a" : "#e5e7eb"};
      position:relative;
      cursor:pointer;
      transition:.2s;
    "
    title="Ativar/Inativar"
  >
    <div style="
      width:18px;
      height:18px;
      border-radius:50%;
      background:#ffffff;
      position:absolute;
      top:2px;
      left:${cat.ativo ? "22px" : "2px"};
      transition:.2s;
      box-shadow:0 2px 6px rgba(0,0,0,.15);
    "></div>
  </div>
</div>
    `;

    listaEl.appendChild(row);
  });

listaEl.querySelectorAll(".toggleMontagemAtivo").forEach(el => {
  el.addEventListener("click", async function () {

    const id = this.dataset.id;
    const ativoAtual = this.dataset.ativo === "1";
    const novoAtivo = !ativoAtual;

    console.log("🟦 [MONTAGEM] toggle click:", { id, ativoAtual, novoAtivo });

    // atualiza UI imediatamente
    this.dataset.ativo = novoAtivo ? "1" : "0";
    this.style.background = novoAtivo ? "#16a34a" : "#e5e7eb";

    const bolinha = this.querySelector("div");
    if (bolinha) bolinha.style.left = novoAtivo ? "22px" : "2px";

    // atualiza banco
    const upd = await api.updateCategoriaMontagem(id, { ativo: novoAtivo });

    if (upd?.error) {
      console.error("❌ [MONTAGEM] erro update:", upd.error);
      alert("Erro ao atualizar status (ver console).");

      // desfaz UI se falhar
      this.dataset.ativo = ativoAtual ? "1" : "0";
      this.style.background = ativoAtual ? "#16a34a" : "#e5e7eb";
      if (bolinha) bolinha.style.left = ativoAtual ? "22px" : "2px";
      return;
    }

    // garante consistência
    await loadCategorias();
  });
});
}

    await loadCategorias();

    const novaBtn = container.querySelector("#novaCategoriaMontagemBtn");
    if (novaBtn) {
      novaBtn.onclick = () => {
        const row = document.createElement("div");
        row.style.display = "grid";
        row.style.gridTemplateColumns = "2fr 1fr 80px 160px";
        row.style.padding = "14px 18px";
        row.style.borderTop = "1px solid #e5e7eb";
        row.style.background = "#fff7ed";
        row.style.alignItems = "center";
row.innerHTML = `
<div style="
  display:flex;
  align-items:center;
  gap:18px;
  flex-wrap:nowrap;
">

  ${["P","M","G","XL"].map(cat=>`
    <div class="mont-cat" data-cat="${cat}" style="
      display:flex;
      align-items:center;
      gap:6px;
      background:#f8fafc;
      padding:6px 10px;
      border-radius:10px;
    ">
      <strong>${cat}</strong>

      <button class="minus"
        style="
          border:none;
          background:#e5e7eb;
          width:22px;
          height:22px;
          border-radius:6px;
          cursor:pointer;
        ">−</button>

      <input
        type="number"
        value="0"
        min="0"
        class="qtd"
        style="
          width:32px;
          text-align:center;
          border:none;
          background:transparent;
          font-weight:600;
        ">

      <button class="plus"
        style="
          border:none;
          background:#e5e7eb;
          width:22px;
          height:22px;
          border-radius:6px;
          cursor:pointer;
        ">+</button>
    </div>
  `).join("")}

  <input class="mont-qtd"
    type="number"
    placeholder="Mont."
    style="width:70px;padding:6px;border:1px solid #e5e7eb;border-radius:8px;">

  <input class="mont-ordem"
    type="number"
    value="0"
    style="width:60px;padding:6px;border:1px solid #e5e7eb;border-radius:8px;">

  <div style="display:flex;align-items:center;">
    <label style="position:relative;width:42px;height:22px;">
      <input type="checkbox"
        class="mont-ativo"
        checked
        style="opacity:0;width:0;height:0;">
      <span style="
        position:absolute;
        inset:0;
        background:#16a34a;
        border-radius:22px;
      "></span>
    </label>
  </div>

</div>
`;
row.querySelectorAll(".mont-cat").forEach(catEl=>{

  const input = catEl.querySelector(".qtd");

  catEl.querySelector(".plus").onclick = ()=>{
    input.value = Number(input.value)+1;
  };

  catEl.querySelector(".minus").onclick = ()=>{
    input.value = Math.max(0, Number(input.value)-1);
  };

});
        listaEl.prepend(row);

        const salvar = async () => {
const composicao = {};

row.querySelectorAll(".mont-cat").forEach(cat=>{
  const nome = cat.dataset.cat;
  const qtd  = parseInt(cat.querySelector(".qtd").value)||0;
  if(qtd>0) composicao[nome]=qtd;
});

if(Object.keys(composicao).length===0) return;

const combinacao = Object.entries(composicao)
  .map(([k,v])=> v>1 ? `${v}${k}` : k)
  .join(" + ");
          if (!combinacao) return;
          const payload = {
            empresa_id: state.empresaId,
            combinacao,
            qtd_montadores: parseInt(row.querySelector(".mont-qtd").value, 10) || 1,
            ordem: parseInt(row.querySelector(".mont-ordem").value, 10) || 0,
            ativo: row.querySelector(".mont-ativo").checked
          };
          const { error } = await api.insertCategoriaMontagem(payload);
          if (error) {
            console.error("Erro ao criar categoria montagem:", error);
            alert("Erro ao salvar categoria de montagem.");
            return;
          }
          await loadCategorias();
        };

        row.querySelectorAll("input").forEach(input => {
          input.addEventListener("keydown", async function (e) {
            if (e.key === "Enter") {
              e.preventDefault();
              await salvar();
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
  window.empresa.logistica.montagem = { render, bind };
})();