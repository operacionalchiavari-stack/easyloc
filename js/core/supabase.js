(function(){

  if(window.supabaseClient) return;

  window.supabaseClient =
    window.supabase.createClient(
      "https://awemuohtvwvrdzfxwrmd.supabase.co",
      "sb_publishable_tlm-v5vvX9jgChODJmDCtw_JqMxLtpZ",
      {
        global:{
          fetch:(input,init={})=>{
            const headers=new Headers(init.headers || (input instanceof Request ? input.headers : undefined));
            const operacao=window.__comercialOperacaoAtual;
            const url=input instanceof Request?input.url:String(input);
            if(operacao && /\/rest\/v1\/(rpc\/pedido_|rpc\/contrato|separacoes_pedidos|separacoes_itens|contratos_pedidos)/.test(url)){
              headers.set('x-comercial-operacao',operacao);
            }
            return fetch(input,{...init,headers});
          }
        },
        auth:{
          storageKey:"easyloc-auth",
          persistSession:true,
          autoRefreshToken:true
        }
      }
    );

})();
