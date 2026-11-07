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

  const ocultarLista = () => {
    clienteLista.innerHTML = "";
    clienteLista.style.display = "none";
  };

  window.__ocultarAutocompleteClientePedido = ocultarLista;

  const doBusca = debounce(async () => {

    const termo = (clienteInput.value || "").trim();

    if (termo.length < 2) {
      ocultarLista();
      return;
    }

    const { data, error } = await supabase
      .from("clientes_empresas")
      .select("id, nome_razao, telefone, catalogo_logo_url, tags")
      .eq("empresa_id", window.__CONTEXT?.empresa_id)
      .ilike("nome_razao", `%${termo}%`)
      .limit(10);

    // Uma resposta antiga não pode repor sugestões depois de editar/limpar o campo.
    if((clienteInput.value || '').trim() !== termo) return;

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
      const retrato = document.createElement("span");
      retrato.className = "cliente-busca-retrato";
      retrato.setAttribute("aria-hidden", "true");
      retrato.textContent = cliente.nome_razao?.trim().charAt(0).toUpperCase() || "?";
      if (/^https?:\/\//i.test(cliente.catalogo_logo_url || "")) {
        const foto = document.createElement("img");
        foto.src = cliente.catalogo_logo_url;
        foto.alt = "";
        foto.addEventListener("error", () => foto.remove(), { once: true });
        retrato.appendChild(foto);
      }
      const nome = document.createElement("span");
      nome.className = "cliente-busca-nome";
      nome.textContent = cliente.nome_razao;
      item.append(retrato, nome);

      item.addEventListener("click", () => {
        clienteInput.value = cliente.nome_razao;

        if(clienteIdHidden) clienteIdHidden.value = cliente.id;
        if(telefoneInput) telefoneInput.value = cliente.telefone || "";
        if(responsavelInput) responsavelInput.value = cliente.nome_razao;
        clienteInput.dispatchEvent(new CustomEvent('cliente-selecionado',{detail:cliente}));

        ocultarLista();
      });

      clienteLista.appendChild(item);
    });

    clienteLista.style.display = "block";

  }, 300);

  clienteInput.addEventListener("input", () => {
    if(clienteIdHidden?.value){
      if(telefoneInput)telefoneInput.value='';
      if(responsavelInput)responsavelInput.value='';
    }
    if(clienteIdHidden) clienteIdHidden.value = '';
    ocultarLista();
    doBusca();
  });

  document.addEventListener("click", function (e) {
    if (!e.target.closest(".autocomplete-wrapper")) {
      ocultarLista();
    }
  });
}
