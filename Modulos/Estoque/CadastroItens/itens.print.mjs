/* =====================================================
   IMPRESSÃƒO DE ITENS
===================================================== */

window.itens_imprimir = function(){

  const lista =
    window.itensFiltrados ||
    window.itensCache ||
    [];

  if(!lista.length){
    if (typeof window.alerta === "function") {
      window.alerta("Nenhum item para imprimir.", "AtenÃ§Ã£o", "aviso");
    } else {
      alert("Nenhum item para imprimir.");
    }
    return;
  }

  const iframe = document.getElementById("printFrame");

  const doc = iframe.contentWindow.document;

  doc.open();

  doc.write(`
  <html>
  <head>
  <title>Itens - Acervo</title>
  </head>

  <body>

  <table>

  ${lista.map(i=>`

  <tr>
    <td>${i.nome || "-"}</td>
  </tr>

  `).join("")}

  </table>

  </body>
  </html>
  `);

  doc.close();

  setTimeout(()=>{
    iframe.contentWindow.focus();
    iframe.contentWindow.print();
  },300);

};
