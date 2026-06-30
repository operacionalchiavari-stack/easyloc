(function(){

  function render(container, state){

    container.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:18px;max-width:980px;">

        <div style="
          display:flex;
          justify-content:space-between;
          align-items:center;
          gap:18px;
          flex-wrap:wrap;
        ">

<div style="display:flex;gap:10px;">

<button
  id="btnAdicionarServico"
  type="button"
  style="
    padding:10px 14px;
    border-radius:12px;
    border:none;
    background:#2E1F1F;
    color:#fff;
    font-weight:700;
    cursor:pointer;
  "
>
  + Adicionar serviÃ§o
</button>

</div>

        </div>

        <div style="
          border:1px solid #e5e7eb;
          border-radius:16px;
          overflow:hidden;
          background:#fff;
          box-shadow:0 10px 24px rgba(0,0,0,.06);
        ">

<div>
  <table style="width:100%;border-collapse:collapse;">
              <thead>
<tr style="background:#f8fafc;border-bottom:1px solid #e5e7eb;">

<th style="text-align:left;padding:12px 14px;font-size:13px;color:#475569;">
Nome
</th>

<th style="text-align:left;padding:12px 14px;font-size:13px;color:#475569;">
Grupo
</th>

<th style="text-align:right;padding:12px 14px;font-size:13px;color:#475569;">
Fixo (R$)
</th>

<th style="text-align:right;padding:12px 14px;font-size:13px;color:#475569;">
M.O (R$)
</th>

<th style="text-align:right;padding:12px 14px;font-size:13px;color:#475569;">
KM (R$)
</th>

<th style="text-align:right;padding:12px 14px;font-size:13px;color:#475569;">
mÂ³ (R$)
</th>

<th style="text-align:center;padding:12px 14px;font-size:13px;color:#475569;">
Status
</th>

</tr>
              </thead>

              <tbody id="servicosTbody"></tbody>

            </table>
          </div>

        </div>

        <div id="servicosAviso" style="display:none;font-size:13px;color:#ef4444;"></div>

      </div>
    `;
  }

  async function bind(container, state){

    const sb = window.supabaseClient;
    const empresaId = state.empresaId;

    const tbody = container.querySelector("#servicosTbody");
    const btnAdd = container.querySelector("#btnAdicionarServico");
    const aviso = container.querySelector("#servicosAviso");

    if(!sb || !empresaId || !tbody) return () => {};

    let servicos = [];

    function showErro(msg){
      aviso.style.display = "block";
      aviso.innerText = msg;
    }

    function fmtValor(v){
      const n = Number(v || 0);
      return n.toFixed(2);
    }

    function parseValor(str){
      if(!str) return 0;
      const s = String(str).replace(",", ".");
      const n = Number(s);
      return Number.isFinite(n) ? n : 0;
    }

    function aplicarBloqueio(tr){

      const fixo = parseValor(tr.querySelector(".svc-fixo").value);

      const mao = tr.querySelector(".svc-mao");
      const km = tr.querySelector(".svc-km");
      const volume = tr.querySelector(".svc-volume");

      if(fixo > 0){

        mao.disabled = true;
        km.disabled = true;
        volume.disabled = true;

        mao.style.background = "#f1f5f9";
        km.style.background = "#f1f5f9";
        volume.style.background = "#f1f5f9";

      }else{

        mao.disabled = false;
        km.disabled = false;
        volume.disabled = false;

        mao.style.background = "#fff";
        km.style.background = "#fff";
        volume.style.background = "#fff";

      }

    }

function atualizarObjeto(tr, s){

  s.nome = tr.querySelector(".svc-nome").value.trim();
  s.grupo = tr.querySelector(".svc-grupo").value;

  s.valor_fixo = parseValor(tr.querySelector(".svc-fixo").value);
  s.valor_mao_obra = parseValor(tr.querySelector(".svc-mao").value);
  s.valor_km = parseValor(tr.querySelector(".svc-km").value);
  s.valor_volume = parseValor(tr.querySelector(".svc-volume").value);

}


function renderRows(){

      tbody.innerHTML = "";

      if(!servicos.length){
        tbody.innerHTML = `
          <tr>
            <td colspan="7" style="padding:18px 14px;color:#64748b;font-size:13px;">
              Nenhum serviÃ§o cadastrado.
            </td>
          </tr>
        `;
        return;
      }

      servicos.forEach((s)=>{

        const tr = document.createElement("tr");

        tr.innerHTML = `

<td style="padding:10px 14px;">
<input class="svc-nome"
value="${s.nome || ""}"
style="width:100%;padding:10px;border-radius:10px;border:1px solid #e5e7eb;">
</td>

<td style="padding:10px 14px;">
<select class="svc-grupo"
style="width:220px;padding:10px;border-radius:10px;border:1px solid #e5e7eb;">

<option value="LogÃ­stica/OperaÃ§Ãµes" ${s.grupo==="LogÃ­stica/OperaÃ§Ãµes"?"selected":""}>
LogÃ­stica/OperaÃ§Ãµes
</option>

<option value="Comercial" ${s.grupo==="Comercial"?"selected":""}>
Comercial
</option>

<option value="Estoque" ${s.grupo==="Estoque"?"selected":""}>
Estoque
</option>

<option value="Administrativo" ${s.grupo==="Administrativo"?"selected":""}>
Administrativo
</option>

</select>
</td>

<td style="padding:10px 14px;text-align:right;">
<input class="svc-fixo"
value="${fmtValor(s.valor_fixo)}"
style="width:60px;text-align:right;padding:8px;border-radius:10px;border:1px solid #e5e7eb;">
</td>

<td style="padding:10px 14px;text-align:right;">
<input class="svc-mao"
value="${fmtValor(s.valor_mao_obra)}"
style="width:60px;text-align:right;padding:8px;border-radius:10px;border:1px solid #e5e7eb;">
</td>

<td style="padding:10px 14px;text-align:right;">
<input class="svc-km"
value="${fmtValor(s.valor_km)}"
style="width:60px;text-align:right;padding:8px;border-radius:10px;border:1px solid #e5e7eb;">
</td>

<td style="padding:10px 14px;text-align:right;">
<input class="svc-volume"
value="${fmtValor(s.valor_volume)}"
style="width:60px;text-align:right;padding:8px;border-radius:10px;border:1px solid #e5e7eb;">
</td>

<td style="text-align:center;">
<button class="svc-toggle"
style="
padding:6px 10px;
border-radius:999px;
border:1px solid #e5e7eb;
background:${s.ativo ? "#ecfdf5":"#fff1f2"};
color:${s.ativo ? "#16a34a":"#ef4444"};
font-weight:700;
cursor:pointer;
">
${s.ativo ? "ATIVO":"INATIVO"}
</button>
</td>

`;

        aplicarBloqueio(tr);

        tr.querySelector(".svc-fixo").oninput = ()=>aplicarBloqueio(tr);

        // ðŸ”’ BLOQUEIA EDIÃ‡ÃƒO SE O SERVIÃ‡O JÃ EXISTE NO BANCO
        if(s.id){

          tr.querySelector(".svc-nome").disabled = true;
          tr.querySelector(".svc-grupo").disabled = true;
          tr.querySelector(".svc-fixo").disabled = true;
          tr.querySelector(".svc-mao").disabled = true;
          tr.querySelector(".svc-km").disabled = true;
          tr.querySelector(".svc-volume").disabled = true;

          tr.querySelector(".svc-nome").style.background = "#f1f5f9";
          tr.querySelector(".svc-grupo").style.background = "#f1f5f9";
          tr.querySelector(".svc-fixo").style.background = "#f1f5f9";
          tr.querySelector(".svc-mao").style.background = "#f1f5f9";
          tr.querySelector(".svc-km").style.background = "#f1f5f9";
          tr.querySelector(".svc-volume").style.background = "#f1f5f9";

        }

tr.querySelectorAll("input, select").forEach((input)=>{
  input.onchange = ()=>{
    atualizarObjeto(tr,s);
  };
});

tr.querySelector(".svc-toggle").onclick = ()=>{
  s.ativo = !s.ativo;
  renderRows();
};

        tbody.appendChild(tr);

      });

    }

    async function carregar(){

      const { data, error } = await sb
      .from("servicos_adicionais")
      .select("id,nome,grupo,valor_fixo,valor_mao_obra,valor_km,valor_volume,ativo")
      .eq("empresa_id",empresaId)
      .order("nome");

      if(error){
        console.error(error);
        showErro("Erro ao carregar serviÃ§os");
        return;
      }

      servicos = data || [];
      renderRows();

    }

    function adicionarLinha(){

      servicos.unshift({

        id:null,
        nome:"",
        grupo:"LogÃ­stica/OperaÃ§Ãµes",
        valor_fixo:0,
        valor_mao_obra:0,
        valor_km:0,
        valor_volume:0,
        ativo:true

      });

      renderRows();

    }
async function salvar(){

  console.log("ðŸ”¥ SALVAR SERVIÃ‡OS COMERCIAIS EXECUTOU");

  const novos = [];
  const existentes = [];

  servicos.forEach(s => {

    if(!s.nome || !s.nome.trim()) return;

    const obj = {
      empresa_id: empresaId,
      nome: s.nome.trim(),
      grupo: s.grupo,
      valor_fixo: s.valor_fixo || 0,
      valor_mao_obra: s.valor_mao_obra || 0,
      valor_km: s.valor_km || 0,
      valor_volume: s.valor_volume || 0,
      ativo: s.ativo ?? true
    };

    if(s.id){
      obj.id = s.id;
      existentes.push(obj);
    }else{
      novos.push(obj);
    }

  });

  try{

    // INSERT (serviÃ§os novos)
    if(novos.length){

      const { error } = await sb
        .from("servicos_adicionais")
        .insert(novos);

      if(error) throw error;

    }

    // UPDATE (serviÃ§os existentes)
    for(const s of existentes){

      const { id, ...dados } = s;

      const { error } = await sb
        .from("servicos_adicionais")
        .update(dados)
        .eq("id", id);

      if(error) throw error;

    }

    aviso.style.display = "none";

  }catch(error){

    console.error(error);
    showErro("Erro ao salvar serviÃ§os");

  }

}
btnAdd.onclick = adicionarLinha;

// expÃµe a funÃ§Ã£o salvar para o modal principal
window.__salvarServicosComercial = salvar;

await carregar();

  }
  window.empresa = window.empresa || {};
  window.empresa.sections = window.empresa.sections || {};
  window.empresa.sections.comercial = { render, bind };

})();