(function () {

const META_MENSAL = 150;

    const checklistBase = [
      "Estrutura firme",
      "Sem folga",
      "Sem rachaduras",
      "Sem ferrugem",
      "Pintura em bom estado",
      "Tecido em bom estado",
      "Estofado em bom estado",
      "Madeira em bom estado",
      "Solda em bom estado",
      "Pés nivelados",
      "Item limpo",
      "Sem manchas",
      "Sem rasgos",
      "Sem avarias visuais",
      "Pronto para locação"
    ];

    let itens = [];
    let inspecoes = [];
    let itemAtualIndex = 0;
    let statusSelecionado = "";
    let checklistRespostas = {};

    window.eventListenersControledequalidade = window.eventListenersControledequalidade || [];

    const el = id => {
      const elem = document.getElementById(id);
      return elem || { 
        textContent: "", 
        value: "", 
        innerHTML: "", 
        classList: { add: () => {}, remove: () => {}, toggle: () => {} },
        appendChild: () => {},
        querySelectorAll: () => [],
        addEventListener: () => {}
      };
    };

    function addControledequalidadeListener(target, event, handler){
      if (!target || !target.addEventListener) return;
      target.addEventListener(event, handler);
      window.eventListenersControledequalidade.push({ target, event, handler });
    }


    function hojeISO(){
      const d = new Date();
      const y = d.getFullYear();
      const m = String(d.getMonth()+1).padStart(2,'0');
      const day = String(d.getDate()).padStart(2,'0');
      return `${y}-${m}-${day}`;
    }

    function formatarMoeda(v){
      if(v === null || v === undefined || v === "") return "R$ 0,00";

      if(typeof v === "string"){
        const limpo = v.replace(/[^\d,.-]/g,'').replace(/\./g,'').replace(',', '.');
        const num = Number(limpo);
        if(!isNaN(num)){
          return num.toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
        }
        return v;
      }

      if(typeof v === "number"){
        return v.toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
      }

      return String(v);
    }

    function mostrarToast(msg){
      const t = el("toast");
      t.textContent = msg;
      t.classList.add("show");
      setTimeout(()=>t.classList.remove("show"), 2200);
    }

    function criarChecklist(){
      const wrap = el("checklistContainer");
      wrap.innerHTML = "";

      checklistBase.forEach((nome, idx)=>{
        const key = `check_${idx}`;
        checklistRespostas[key] = "";

        const div = document.createElement("div");
        div.className = "check-item";
        div.innerHTML = `
          <div class="check-name">${nome}</div>
          <div class="check-actions">
            <button class="check-chip ok" data-key="${key}" data-value="OK">OK</button>
            <button class="check-chip attention" data-key="${key}" data-value="Atenção">Atenção</button>
            <button class="check-chip problem" data-key="${key}" data-value="Problema">Problema</button>
          </div>
        `;
        wrap.appendChild(div);
      });

      wrap.querySelectorAll(".check-chip").forEach(btn=>{
        btn.addEventListener("click", ()=>{
          const key = btn.dataset.key;
          const value = btn.dataset.value;
          checklistRespostas[key] = value;

          const group = btn.parentElement.querySelectorAll(".check-chip");
          group.forEach(b=>b.classList.remove("active"));
          btn.classList.add("active");
        });
      });
    }

    function configurarStatusButtons(){
      document.querySelectorAll(".status-btn").forEach(btn=>{
        btn.addEventListener("click", ()=>{
          document.querySelectorAll(".status-btn").forEach(b=>b.classList.remove("active"));
          btn.classList.add("active");
          statusSelecionado = btn.dataset.status;
        });
      });
    }

    function preencherItemAtual(){
      if(!itens.length){
        el("itemNome").textContent = "Nenhum item encontrado";
        el("itemCodigo").textContent = "-";
        el("itemValor").textContent = "-";
        el("itemCategoriaPill").textContent = "Sem dados";
        el("itemIndex").textContent = "0";
        el("itemTotal").textContent = "0";
        return;
      }

      if(itemAtualIndex >= itens.length){
        itemAtualIndex = 0;
      }

      const item = itens[itemAtualIndex];

      el("itemNome").textContent = item.nome || "Sem nome";
      el("itemCodigo").textContent = item.codigo || "-";
      el("itemValor").textContent = formatarMoeda(item.valor);
      el("itemCategoriaPill").textContent = item.categoria || "Sem categoria";
      el("itemIndex").textContent = itemAtualIndex + 1;
      el("itemTotal").textContent = itens.length;

      if(item.foto){
        el("itemFoto").innerHTML = `<img src="${item.foto}" style="width:100%;height:100%;object-fit:cover;border-radius:16px;">`;
      }else{
        el("itemFoto").textContent = "Imagem de referência do item";
      }

      limparFormularioItem();
    }

    function limparFormularioItem(){
      statusSelecionado = "";
      document.querySelectorAll(".status-btn").forEach(b=>b.classList.remove("active"));

      el("acaoNecessaria").value = "";
      el("prioridade").value = "";
      el("destinoItem").value = "";
      el("observacoes").value = "";

      checklistRespostas = {};
      criarChecklist();
    }

    function proximoItem(){
      itemAtualIndex++;
      if(itemAtualIndex >= itens.length){
        itemAtualIndex = 0;
      }
      preencherItemAtual();
    }

    function getTagStatus(status){
      if(status === "Aprovado") return `<span class="tag green">Aprovado</span>`;
      if(status === "Aprovado com observação") return `<span class="tag yellow">Observação</span>`;
      if(status === "Reprovado") return `<span class="tag red">Reprovado</span>`;
      return `<span class="tag blue">${status || "-"}</span>`;
    }

    function getTagPrioridade(prioridade){
      if(prioridade === "Urgente") return `<span class="tag red">Urgente</span>`;
      if(prioridade === "Alta") return `<span class="tag yellow">Alta</span>`;
      if(prioridade === "Média") return `<span class="tag blue">Média</span>`;
      if(prioridade === "Baixa") return `<span class="tag green">Baixa</span>`;
      return `<span class="tag blue">-</span>`;
    }

    function formatarDataTabela(data){
      if(!data) return "-";
      const d = new Date(data);
      if(isNaN(d)) return data;
      return d.toLocaleDateString('pt-BR');
    }

    function renderTabela(){
      const busca = el("filtroBusca").value.trim().toLowerCase();
      const status = el("filtroStatus").value;

      const tbody = el("tabelaInspecoes");

      const filtrado = inspecoes.filter(x=>{
        const okBusca = !busca ||
          String(x.nome || "").toLowerCase().includes(busca) ||
          String(x.codigo || "").toLowerCase().includes(busca) ||
          String(x.responsavel || "").toLowerCase().includes(busca);

        const okStatus = !status || x.status === status;

        return okBusca && okStatus;
      });

      if(!filtrado.length){
        tbody.innerHTML = `<tr><td colspan="7" class="empty-state">Nenhuma inspeção encontrada</td></tr>`;
        return;
      }

      tbody.innerHTML = filtrado
        .slice()
        .reverse()
        .slice(0, 30)
        .map(x=>`
          <tr>
            <td>${formatarDataTabela(x.data)}</td>
            <td>${x.codigo || "-"}</td>
            <td>${x.nome || "-"}</td>
            <td>${getTagStatus(x.status)}</td>
            <td>${x.acao || "-"}</td>
            <td>${getTagPrioridade(x.prioridade)}</td>
            <td>${x.responsavel || "-"}</td>
          </tr>
        `).join("");
    }

function atualizarCards(){
  const totalItens = itens.length;
  const totalInspecoes = inspecoes.length;
  const aprovados = inspecoes.filter(x => x.status === "Aprovado").length;
  const observacao = inspecoes.filter(x => x.status === "Aprovado com observação").length;
  const reprovados = inspecoes.filter(x => x.status === "Reprovado").length;
  const pendentes = Math.max(totalItens - totalInspecoes, 0);

  el("cardTotalItens").textContent = totalItens;
  el("cardPendentes").textContent = pendentes;
  el("cardAprovados").textContent = aprovados;
  el("cardObservacao").textContent = observacao;
  el("cardReprovados").textContent = reprovados;

  el("metaAtual").textContent = totalInspecoes;
  el("metaMensal").textContent = META_MENSAL;

  const perc = META_MENSAL > 0
    ? Math.min((totalInspecoes / META_MENSAL) * 100, 100)
    : 0;

  el("metaBar").style.width = perc + "%";
}

    function coletarPayload(){
      const item = itens[itemAtualIndex];

      return {
        data: el("dataAnalise").value || hojeISO(),
        categoria: item.categoria || "",
        nome: item.nome || "",
        codigo: item.codigo || "",
        valor: item.valor || "",
        responsavel: el("responsavel").value.trim(),
        status: statusSelecionado,
        acao: el("acaoNecessaria").value,
        prioridade: el("prioridade").value,
        destino: el("destinoItem").value,
        observacoes: el("observacoes").value.trim(),
        checklist: checklistRespostas
      };
    }

    function validarPayload(p){
      if(!p.responsavel) return "Preencha o responsável";
      if(!p.status) return "Selecione o status do item";
      return "";
    }

    function salvarInspecaoLocal(payload){
      inspecoes.push(payload);
      atualizarCards();
      renderTabela();
    }

    function salvarEProximo(){
      const payload = coletarPayload();
      const erro = validarPayload(payload);

      if(erro){
        alert(erro);
        return;
      }

      // TODO: Implementar com Supabase depois
      salvarInspecaoLocal(payload);
      mostrarToast("✔ Inspeção salva com sucesso");
      proximoItem();
    }

    function carregarDados(){
      el("dataAnalise").value = hojeISO();

      // TODO: Implementar com Supabase depois
      // Para agora, carregar dados mock
      itens = [
        { categoria:"Aparadores", nome:"Aparador Clássico P", codigo:"APA001", valor:"2800" },
        { categoria:"Aparadores", nome:"Aparador Clássico M", codigo:"APA002", valor:"5400" },
        { categoria:"Aparadores", nome:"Aparador Romance", codigo:"APA003", valor:"2000" }
      ];

      inspecoes = [];
      atualizarCards();
      preencherItemAtual();
      renderTabela();
    }

    function initControledequalidade() {
      const root = document.getElementById("main-content");
      if (!root) return;
    
      if (window.controledequalidadeInitialized) {
        cleanupControledequalidade();
      }
    
      window.controledequalidadeInitialized = true;
    
      addControledequalidadeListener(el("btnSalvarProximo"), "click", salvarEProximo);
      addControledequalidadeListener(el("btnPular"), "click", proximoItem);
      addControledequalidadeListener(el("filtroBusca"), "input", renderTabela);
      addControledequalidadeListener(el("filtroStatus"), "change", renderTabela);
    
      configurarStatusButtons();
      criarChecklist();
      carregarDados();
    
      // 🔥 CONTROLE DE ABAS
      const tabs = document.querySelectorAll(".tab");
      tabs.forEach(btn => {
        addControledequalidadeListener(btn, "click", function () {
          tabs.forEach(b => b.classList.remove("active"));
          this.classList.add("active");
          const tabName = this.getAttribute("data-tab");
          document.querySelectorAll(".tab-content").forEach(el => {
            el.style.display = "none";
          });
          const alvo = document.getElementById("tab-" + tabName);
          if (alvo) {
            alvo.style.display = "block";
          }
        });
      });
    
      document.querySelectorAll(".tab-content").forEach(el => el.style.display = "none");
      document.getElementById("tab-inspecao").style.display = "block";

      if (window.finalizarCarregamentoModulo) {
        window.finalizarCarregamentoModulo();
      }
    }

    function cleanupControledequalidade() {
      // Remover todos os event listeners relacionados ao módulo
      window.eventListenersControledequalidade.forEach(({ target, event, handler }) => {
        if (target && target.removeEventListener) {
          target.removeEventListener(event, handler);
        }
      });
      window.eventListenersControledequalidade = [];

      const root = document.getElementById("main-content");
      if (root) {
        root.querySelectorAll(".tab").forEach(el => {
          el.replaceWith(el.cloneNode(true));
        });
      }
    
      // Resetar estado do módulo
      itens = [];
      inspecoes = [];
      itemAtualIndex = 0;
      statusSelecionado = "";
      checklistRespostas = {};
      window.controledequalidadeInitialized = false;
    }

  // Exponha funções para handlers inline e inicialização
  window.salvarEProximo = salvarEProximo;
  window.proximoItem = proximoItem;
  window.carregarDados = carregarDados;
  window.criarChecklist = criarChecklist;
  window.configurarStatusButtons = configurarStatusButtons;
  window.renderTabela = renderTabela;
  window.preencherItemAtual = preencherItemAtual;

  // Inicialização do módulo
  window.__moduleInit = initControledequalidade;
  window.__activeModuleDestroy = cleanupControledequalidade;

})();