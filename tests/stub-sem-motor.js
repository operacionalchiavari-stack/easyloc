/* Usado pelos testes de navegador do Cronograma/Painel (out/2026): no lugar do operacao-sem-motor.js
   (que fala com o Supabase), repassa cada função para o /api/gs simulado pelo teste. */
window.ACERVO_LOCAL = new Proxy({}, { get: function (t, fn) {
  if (typeof fn !== "string" || fn === "then") { return undefined; }
  return function () {
    var args = Array.prototype.slice.call(arguments);
    return fetch("/api/gs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projeto: "cronograma", fn: fn, args: args }) })
      .then(function (r) { return r.json(); })
      .then(function (j) { if (!j || !j.ok) { throw new Error((j && j.erro) || "Erro"); } return j.resultado; });
  };
} });
