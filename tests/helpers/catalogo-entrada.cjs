// A entrada atual do cliente permite escolher projeto ou consultar sem projeto.
// Mantém os testes de produtos no caminho de consulta, usando o botão real.
module.exports=async function entrarSemProjeto(page){
 const continuar=page.locator('[data-entry-without]');
 await continuar.or(page.locator('.catalog-home-grid')).first().waitFor();
 if(await continuar.isVisible())await continuar.click();
};
