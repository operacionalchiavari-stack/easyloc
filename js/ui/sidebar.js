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

function normalizeSidebarSearchText(text){
  return String(text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function getSidebarItemText(element){
  if(!element) return "";

  const span = element.querySelector("span");
  return normalizeSidebarSearchText(span ? span.textContent : element.textContent);
}

function resetSidebarSearch(menu){
  menu
    .querySelectorAll(".sidebar-menu-hidden, .sidebar-search-match, .sidebar-search-open")
    .forEach(element => {
      element.classList.remove(
        "sidebar-menu-hidden",
        "sidebar-search-match",
        "sidebar-search-open"
      );
    });
}

function filterSidebarMenu(query){
  const sidebar = document.getElementById("sidebar");
  const menu = sidebar?.querySelector(".menu");
  const searchBox = document.getElementById("sidebarSearch");

  if(!menu) return;

  const normalizedQuery = normalizeSidebarSearchText(query);
  searchBox?.classList.toggle("has-value", Boolean(normalizedQuery));
  resetSidebarSearch(menu);

  if(!normalizedQuery) return;

  menu.querySelectorAll(".menu-item.has-sub").forEach(menuItem => {
    const submenu = menuItem.nextElementSibling?.classList.contains("submenu")
      ? menuItem.nextElementSibling
      : null;

    const categoryMatches = getSidebarItemText(menuItem).includes(normalizedQuery);
    let hasVisibleChild = false;

    submenu?.querySelectorAll(".submenu-item").forEach(submenuItem => {
      const itemMatches = getSidebarItemText(submenuItem).includes(normalizedQuery);
      const shouldShow = categoryMatches || itemMatches;

      submenuItem.classList.toggle("sidebar-menu-hidden", !shouldShow);
      submenuItem.classList.toggle("sidebar-search-match", itemMatches);
      hasVisibleChild = hasVisibleChild || shouldShow;
    });

    const shouldShowGroup = categoryMatches || hasVisibleChild;
    menuItem.classList.toggle("sidebar-menu-hidden", !shouldShowGroup);
    menuItem.classList.toggle("sidebar-search-match", categoryMatches);

    if(submenu){
      submenu.classList.toggle("sidebar-menu-hidden", !shouldShowGroup);
      submenu.classList.toggle("sidebar-search-open", shouldShowGroup);
    }
  });
}

function initSidebarSearch(){
  const sidebar = document.getElementById("sidebar");
  const searchBox = document.getElementById("sidebarSearch");
  const input = document.getElementById("sidebarSearchInput");
  const clearButton = document.getElementById("sidebarSearchClear");

  if(!sidebar || !searchBox || !input) return;

  searchBox.addEventListener("click", () => {
    if(window.innerWidth <= 1200){
      sidebar.classList.add("expanded");
    }

    input.focus();
  });

  input.addEventListener("input", () => {
    filterSidebarMenu(input.value);
  });

  input.addEventListener("keydown", event => {
    if(event.key === "Escape"){
      input.value = "";
      filterSidebarMenu("");
      input.blur();
    }
  });

  clearButton?.addEventListener("click", event => {
    event.stopPropagation();
    input.value = "";
    filterSidebarMenu("");
    input.focus();
  });
}

if(document.readyState === "loading"){
  document.addEventListener("DOMContentLoaded", initSidebarSearch);
}else{
  initSidebarSearch();
}


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
