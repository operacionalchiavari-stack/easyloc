// Clientes finais do pedido (18/11/2026): quem contrata de fato (ex.: os noivos). O decorador continua sendo quem faz o
// pedido, mas o CONTRATO sai no nome dos clientes finais. Fica em observacoes.clientes_finais =
// [{ nome, documento, rg, ie, telefone, email, endereco }] (RG para CPF, inscrição estadual para CNPJ; 18/11/2026). Obrigatório (nome + CPF/CNPJ) para salvar o pedido como Reservado.
const esc = (v) => String(v ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const CAMPOS = [
  ["nome", "Nome completo", "text", "", 160, true],
  ["documento", "CPF ou CNPJ", "text", "cpfcnpj", 18, true],
  ["rg", "RG", "text", "", 30, false],
  ["ie", "Inscrição estadual", "text", "", 30, false],
  ["telefone", "Telefone", "tel", "telefone", 20, false],
  ["email", "E-mail", "email", "", 160, false],
  ["endereco", "Endereço completo", "text", "", 300, false],
];
const vazio = () => ({ nome: "", documento: "", rg: "", ie: "", telefone: "", email: "", endereco: "" });
const soDigitos = (v) => String(v || "").replace(/\D/g, "");

function cpfValido(c){ if(!/^\d{11}$/.test(c) || /^(\d)\1+$/.test(c)) return false; let s = 0; for(let i = 0; i < 9; i++) s += +c[i] * (10 - i); let d = (s * 10) % 11 % 10; if(d !== +c[9]) return false; s = 0; for(let i = 0; i < 10; i++) s += +c[i] * (11 - i); d = (s * 10) % 11 % 10; return d === +c[10]; }
function cnpjValido(c){ if(!/^\d{14}$/.test(c) || /^(\d)\1+$/.test(c)) return false; const calc = (n) => { let s = 0, p = n - 7; for(let i = 0; i < n; i++){ s += +c[i] * p--; if(p < 2) p = 9; } const r = s % 11; return r < 2 ? 0 : 11 - r; }; return calc(12) === +c[12] && calc(13) === +c[13]; }
export const documentoValido = (v) => { const d = soDigitos(v); return d.length === 11 ? cpfValido(d) : d.length === 14 ? cnpjValido(d) : false; };

// CPF → mostra o campo RG; CNPJ → mostra o campo Inscrição estadual (cada um guardado no seu campo).
const ehCnpj = (v) => soDigitos(v).length > 11;

export function initClientesFinais(){
  const s = { lista: [vazio()], pedidoRef: undefined };
  const sec = document.createElement("section");
  sec.className = "pedido-clientes-finais";
  sec.setAttribute("aria-labelledby", "clientesFinaisTitulo");

  const ler = () => {
    s.lista = [...sec.querySelectorAll("[data-cf-pessoa]")].map((bloco) => {
      const o = vazio();
      for(const [k] of CAMPOS){ const el = bloco.querySelector(`[data-cf="${k}"]`); o[k] = String(el?.value ?? "").trim(); }
      return o;
    });
  };
  function pintar(){
    sec.innerHTML = `<header><div><h4 id="clientesFinaisTitulo">Clientes finais</h4><p>Quem contrata o evento (ex.: os noivos). O contrato sai no nome destas pessoas, não no do decorador.</p></div>
      <button type="button" class="pedido-cf-add" data-cf-add>+ Adicionar outro cliente final</button></header>
      ${s.lista.map((p, i) => `<div class="pedido-cf-pessoa" data-cf-pessoa="${i}">
        ${s.lista.length > 1 ? `<div class="pedido-cf-pessoa-topo"><b>Cliente final ${i + 1}</b><button type="button" data-cf-remover="${i}">Remover</button></div>` : ""}
        <div class="pedido-cf-grade">${CAMPOS.map(([k, rotulo, tipo, mascara, max, obrig]) => `<label class="pedido-cf-campo pedido-cf-${k}"${(k === "rg" && ehCnpj(p.documento)) || (k === "ie" && !ehCnpj(p.documento)) ? " hidden" : ""}><span>${rotulo}${obrig ? ' <i aria-hidden="true">*</i>' : ""}</span><input class="el-input" type="${tipo}" data-cf="${k}" maxlength="${max}"${mascara ? ` data-mascara="${mascara}"` : ""} value="${esc(p[k])}" autocomplete="off"></label>`).join("")}</div>
      </div>`).join("")}`;
  }
  sec.addEventListener("input", (e) => { if(e.target.matches('[data-cf="documento"]')){ const bloco = e.target.closest("[data-cf-pessoa]"); const pj = ehCnpj(e.target.value); bloco.querySelector(".pedido-cf-rg").hidden = pj; bloco.querySelector(".pedido-cf-ie").hidden = !pj; }
    if(e.target.matches("[data-cf]")){ e.target.closest(".pedido-cf-campo")?.classList.remove("is-invalido"); ler(); if(e.isTrusted) window.__pedidoHouveEdicao?.(); } });
  sec.addEventListener("click", (e) => {
    if(e.target.closest("[data-cf-add]")){ ler(); s.lista.push(vazio()); pintar(); sec.querySelector(`[data-cf-pessoa="${s.lista.length - 1}"] [data-cf="nome"]`)?.focus(); window.__pedidoHouveEdicao?.(); return; }
    const rem = e.target.closest("[data-cf-remover]");
    if(rem){ ler(); s.lista.splice(+rem.dataset.cfRemover, 1); if(!s.lista.length) s.lista.push(vazio()); pintar(); window.__pedidoHouveEdicao?.(); }
  });
  pintar();

  // Entra no bloco "O evento" dos dados do pedido, antes das observações (pedido.entrada.mjs monta os blocos).
  let tentativas = 0;
  const montar = () => {
    const obs = document.querySelector(".entrada-dados .pedido-observacoes-evento") || (tentativas > 40 ? document.querySelector(".pedido-observacoes-evento") : null);
    if(!obs){ tentativas++; if(tentativas < 60) setTimeout(montar, 250); return; }
    obs.before(sec);
  };
  montar();

  // Pedido aberto (ou rascunho recuperado): traz os clientes finais gravados.
  setInterval(() => {
    const atual = window.__PEDIDO_DADOS_ATUAL;
    if(atual === s.pedidoRef) return;
    s.pedidoRef = atual;
    const salvos = atual?.observacoes?.clientes_finais;
    s.lista = Array.isArray(salvos) && salvos.length ? salvos.map((p) => ({ ...vazio(), ...p })) : [vazio()];
    pintar();
  }, 600);

  window.__pedidoClientesFinais = () => { ler(); return s.lista.filter((p) => Object.values(p).some(Boolean)); };
  // Reservado precisa de pelo menos um cliente final com nome e CPF/CNPJ válido (vai no contrato).
  window.__pedidoValidarClientesFinais = ({ exigir = false } = {}) => {
    ler();
    sec.querySelectorAll(".is-invalido").forEach((el) => el.classList.remove("is-invalido"));
    const preenchidos = s.lista.map((p, i) => [p, i]).filter(([p]) => Object.values(p).some(Boolean));
    const marcar = (i, k, msg) => { const campo = sec.querySelector(`[data-cf-pessoa="${i}"] [data-cf="${k}"]`); campo?.closest(".pedido-cf-campo")?.classList.add("is-invalido"); campo?.focus({ preventScroll: false }); return msg; };
    if(exigir && !preenchidos.length) return marcar(0, "nome", "Informe o cliente final (nome completo e CPF ou CNPJ): o contrato sai no nome dele.");
    for(const [p, i] of preenchidos){
      if(p.nome.length < 5 || !/\s/.test(p.nome)) return marcar(i, "nome", "Informe o nome completo do cliente final.");
      if(!p.documento) return marcar(i, "documento", `Informe o CPF ou CNPJ de ${p.nome}.`);
      if(!documentoValido(p.documento)) return marcar(i, "documento", `O CPF/CNPJ de ${p.nome} não é válido.`);
      if(p.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email)) return marcar(i, "email", `O e-mail de ${p.nome} não é válido.`);
    }
    return "";
  };
}
