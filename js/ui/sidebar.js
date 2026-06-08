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


document.addEventListener("click", (event) => {

  const sidebar = document.getElementById("sidebar");

  if(!sidebar || window.innerWidth > 1200) return;

  if(event.target.closest(".submenu-item")){
    sidebar.classList.remove("expanded");
    return;
  }

  if(
    sidebar.classList.contains("expanded") &&
    !event.target.closest("#sidebar") &&
    !event.target.closest(".hamburger")
  ){
    sidebar.classList.remove("expanded");
  }

});


/* fecha dropdown clicando fora */
document.addEventListener("click", () => {

  const dropdown =
    document.getElementById("userDropdown");

  if(dropdown)
    dropdown.style.display = "none";

});
