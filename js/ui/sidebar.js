/* =========================================
   EASYLOC SIDEBAR CONTROLLER
========================================= */

window.toggleSubmenu = function(id, el){

  const submenu = document.getElementById(id);

  if(!submenu) return;

  document
    .querySelectorAll(".submenu")
    .forEach(s => {
      if(s !== submenu) s.classList.remove("open");
    });

  submenu.classList.toggle("open");

  document
    .querySelectorAll(".menu-item.has-sub")
    .forEach(item => {
      if(item !== el) item.classList.remove("open");
    });

  el.classList.toggle("open");
};


window.toggleUserMenu = function(event){

  event.stopPropagation();

  const dropdown =
    document.getElementById("userDropdown");

  if(!dropdown) return;

  dropdown.style.display =
    dropdown.style.display === "block"
      ? "none"
      : "block";
};


window.toggleMenu = function(){

  const sidebar =
    document.getElementById("sidebar");

  sidebar.classList.toggle("expanded");
};


/* fecha dropdown clicando fora */
document.addEventListener("click", () => {

  const dropdown =
    document.getElementById("userDropdown");

  if(dropdown)
    dropdown.style.display = "none";

});