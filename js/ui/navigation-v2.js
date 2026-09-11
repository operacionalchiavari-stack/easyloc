(function(){
  "use strict";
  const nav=document.getElementById("sidebar");
  if(!nav)return;
  const desktop=()=>window.matchMedia("(min-width: 1201px)").matches;
  const topPanels=()=>Array.from(nav.querySelectorAll(":scope > .menu > .submenu"));
  function resetPanel(panel){
    if(!panel)return;
    panel.classList.remove("is-open");panel.removeAttribute("style");
    panel.previousElementSibling?.setAttribute("aria-expanded","false");
    panel.querySelectorAll(".submenu-group.is-open").forEach(resetPanel);
  }
  function closeAll(except){topPanels().forEach(panel=>{if(panel!==except)resetPanel(panel);});}
  function position(panel,trigger,nested=false){
    if(!desktop())return;
    const rect=trigger.getBoundingClientRect();
    const width=nested?240:250;
    const wanted=nested?rect.right+8:rect.left;
    const left=Math.max(10,Math.min(wanted,innerWidth-width-10));
    const top=nested?Math.max(80,Math.min(rect.top-6,innerHeight-220)):80;
    panel.style.left=`${Math.round(left)}px`;panel.style.top=`${Math.round(top)}px`;panel.style.width=`${width}px`;
  }
  function toggle(panel,trigger,nested=false){
    const opening=!panel.classList.contains("is-open");
    if(!nested)closeAll(opening?panel:null);
    else panel.parentElement?.querySelectorAll(":scope > .submenu-group.is-open").forEach(other=>{if(other!==panel)resetPanel(other);});
    if(!opening){resetPanel(panel);return;}
    position(panel,trigger,nested);trigger.setAttribute("aria-expanded","true");panel.classList.add("is-open");
  }
  window.toggleSubmenu=(id,trigger)=>{const panel=document.getElementById(id);if(panel&&trigger)toggle(panel,trigger,false);};
  window.toggleNestedSubmenu=(id,trigger)=>{const panel=document.getElementById(id);if(panel&&trigger)toggle(panel,trigger,true);};
  window.toggleMenu=()=>{const open=!nav.classList.contains("is-mobile-open");nav.classList.toggle("is-mobile-open",open);document.body.classList.toggle("nav-mobile-open",open);};
  window.toggleUserMenu=event=>{event?.stopPropagation();const menu=document.getElementById("userDropdown");if(menu)menu.style.display=menu.style.display==="block"?"none":"block";};
  nav.querySelectorAll(".menu-item.has-sub,.submenu-trigger").forEach(el=>{el.setAttribute("aria-expanded","false");el.setAttribute("tabindex","0");});
  nav.addEventListener("keydown",event=>{if((event.key==="Enter"||event.key===" ")&&event.target.matches(".menu-item.has-sub")){event.preventDefault();event.target.click();}if(event.key==="Escape")closeAll();});
  nav.addEventListener("click",event=>{const item=event.target.closest(".submenu-item");if(item){nav.querySelectorAll(":scope>.menu>.menu-item.active").forEach(el=>el.classList.remove("active"));item.closest(".submenu")?.previousElementSibling?.classList.add("active");closeAll();if(!desktop()){nav.classList.remove("is-mobile-open");document.body.classList.remove("nav-mobile-open");}}});
  document.addEventListener("pointerdown",event=>{if(!event.target.closest(".user-account,.user-dropdown-modern")){const userMenu=document.getElementById("userDropdown");if(userMenu)userMenu.style.display="none";}if(desktop()&&!nav.contains(event.target))closeAll();if(!desktop()&&document.body.classList.contains("nav-mobile-open")&&!nav.contains(event.target)&&!event.target.closest(".hamburger"))window.toggleMenu();});
  window.addEventListener("resize",()=>{closeAll();if(desktop()){nav.classList.remove("is-mobile-open");document.body.classList.remove("nav-mobile-open");}});
})();
