// Usa as telas completas sem desmontar o pedido que está sendo preenchido.
export function abrirCadastroDoPedido({tipo,nome='',id='',origem='pedido',supabase,aoSelecionar}){
  if(document.getElementById('pedidoCadastroTela'))return;
  const local=tipo==='local';
  const pagina=local?'CadastroLocais/cadastro-locais.html':'CadastroClientes/cadastro-clientes.html';
  const url=new URL('../../Modulos/Comercial/'+pagina,import.meta.url);
  url.searchParams.set('origem',origem);url.searchParams.set('nome',nome);
  if(id)url.searchParams.set('id',id);
  const frame=document.createElement('iframe');
  frame.id='pedidoCadastroTela';frame.title=local?'Cadastro do local':'Cadastro do cliente';
  frame.style.cssText='position:fixed;inset:0;width:100%;height:100%;border:0;background:#f3f5f6;z-index:2500';
  const anterior=document.activeElement;
  const overflow=document.body.style.overflow;document.body.style.overflow='hidden';
  let recebendo=false;
  const receber=async event=>{
    if(event.origin!==location.origin||event.source!==frame.contentWindow||event.data?.tipo!=='pedido-cadastro-retorno'||recebendo)return;
    recebendo=true;
    try{
      if(event.data.id && aoSelecionar){
        const {data,error}=await supabase.from(local?'locais_empresas':'clientes_empresas').select('*')
          .eq('empresa_id',window.__CONTEXT?.empresa_id).eq('id',event.data.id).single();
        if(error)throw error;
        if(!data)throw new Error('Cadastro não encontrado.');
        await aoSelecionar(data);
      }
      window.removeEventListener('message',receber);frame.remove();
      document.body.style.overflow=overflow;anterior?.focus({preventScroll:true});
    }catch(error){window.alerta?.(error.message,'Cadastro','erro');recebendo=false;}
  };
  window.addEventListener('message',receber);
  frame.src=url.href;document.body.appendChild(frame);
}
