(function(){

  if(window.supabaseClient) return;

  window.supabaseClient =
    window.supabase.createClient(
      "https://awemuohtvwvrdzfxwrmd.supabase.co",
      "sb_publishable_tlm-v5vvX9jgChODJmDCtw_JqMxLtpZ",
      {
        auth:{
          storageKey:"easyloc-auth",
          persistSession:true,
          autoRefreshToken:true
        }
      }
    );

})();
