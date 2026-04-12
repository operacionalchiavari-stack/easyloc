import { debounce } from "./pedido.utils.mjs";

export function initAutocompleteClientes({
  supabase,
  clienteInput,
  clienteLista,
  clienteIdHidden,
  telefoneInput,
  responsavelInput,
}){

  if(!clienteInput || !clienteLista) return;

  const doBusca = debounce(async () => {

    const termo = (clienteInput.value || "").trim();

    if (termo.length < 2) {
      clienteLista.innerHTML = "";
      clienteLista.style.display = "none";
      return;
    }

    const { data, error } = await supabase
      .from("clientes_empresas")
      .select("id, nome_razao, telefone")
      .eq("empresa_id", window.__CONTEXT?.empresa_id)
      .ilike("nome_razao", `%${termo}%`)
      .limit(10);

    if (error) {
      console.error("Erro ao buscar clientes:", error);
      return;
    }

    clienteLista.innerHTML = "";

    if (!data?.length) {
      clienteLista.innerHTML = `
        <div class="autocomplete-empty">
          🔴 Usuário não cadastrado
        </div>
      `;
      clienteLista.style.display = "block";
      return;
    }

    data.forEach(cliente => {
      const item = document.createElement("div");
      item.classList.add("autocomplete-item");
      item.innerText = cliente.nome_razao;

      item.addEventListener("click", () => {
        clienteInput.value = cliente.nome_razao;

        if(clienteIdHidden) clienteIdHidden.value = cliente.id;
        if(telefoneInput) telefoneInput.value = cliente.telefone || "";
        if(responsavelInput) responsavelInput.value = cliente.nome_razao;

        clienteLista.innerHTML = "";
        clienteLista.style.display = "none";
      });

      clienteLista.appendChild(item);
    });

    clienteLista.style.display = "block";

  }, 300);

  clienteInput.addEventListener("input", doBusca);

  document.addEventListener("click", function (e) {
    if (!e.target.closest(".autocomplete-wrapper")) {
      clienteLista.style.display = "none";
    }
  });
}