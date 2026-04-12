/**
 * AUTH GUARD MODULE — Session Validation & Protection
 * 
 * Exports:
 * - window.garantirSessao() — validates session exists
 * - logout() — logs out and redirects
 */

/* =====================================================
   GARANTIA DE SESSÃO GLOBAL
===================================================== */
window.garantirSessao = async function(){

  const { data:{ session } } =
    await window.supabaseClient.auth.getSession();

  if(!session){
    window.location.href = "index.html";
    return false;
  }

  return true;
};

/* =====================================================
   LOGOUT
===================================================== */
async function logout() {
  await window.supabaseClient.auth.signOut();
  location.href = "index.html";
}
