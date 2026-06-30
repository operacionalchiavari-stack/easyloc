/* =========================================
   EASYLOC SIDEBAR CONTROLLER
========================================= */

const SIDEBAR_CLOSE_DELAY = 170;
const SIDEBAR_OPEN_DELAY = 260;
const SIDEBAR_SWITCH_DELAY = 190;
const SIDEBAR_TOUCH_QUERY = "(hover: none), (pointer: coarse)";
const sidebarCloseTimers = new WeakMap();
const sidebarOpenTimers = new WeakMap();
let pendingTopOpenTimer = null;
let pendingTopOpenTarget = null;

function isSidebarTouchMode(){
  return window.matchMedia(SIDEBAR_TOUCH_QUERY).matches;
}

function normalizeSidebarSearchText(text){
  return String(text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function getCleanSidebarText(element){
  return String(element?.textContent || "")
    .replace(/\s+/g, " ")
    .trim();
}

function getTopSubmenuForItem(menuItem){
  const submenu = menuItem?.nextElementSibling;
  return submenu?.classList.contains("submenu") ? submenu : null;
}

function getNestedGroupForTrigger(trigger){
  const group = trigger?.nextElementSibling;
  return group?.classList.contains("submenu-group") ? group : null;
}

function getContainingFlyoutPanel(element){
  return element?.parentElement?.closest(".submenu-group, .submenu") || null;
}

function getPanelTrigger(panel){
  const trigger = panel?.previousElementSibling;
  if(trigger?.classList.contains("menu-item") || trigger?.classList.contains("submenu-trigger")){
    return trigger;
  }
  return null;
}

function clearPanelClose(panel){
  const timer = sidebarCloseTimers.get(panel);
  if(timer){
    clearTimeout(timer);
    sidebarCloseTimers.delete(panel);
  }
}

function clearPanelOpen(panel){
  const timer = sidebarOpenTimers.get(panel);
  if(timer){
    clearTimeout(timer);
    sidebarOpenTimers.delete(panel);
  }
}

function clearPendingTopOpen(){
  if(pendingTopOpenTimer){
    clearTimeout(pendingTopOpenTimer);
  }

  pendingTopOpenTimer = null;
  pendingTopOpenTarget = null;
}

function getOpenTopSubmenu(exceptPanel){
  return Array
    .from(document.querySelectorAll(".menu > .submenu.floating-open, .menu > .submenu.open"))
    .find(panel => panel !== exceptPanel);
}

function getSidebarTargetWidth(){
  if(window.matchMedia("(max-width: 1200px)").matches){
    return Math.min(window.innerWidth * 0.86, 320);
  }

  return 244;
}

function isSidebarReadyForFlyout(){
  const sidebar = document.getElementById("sidebar");
  if(!sidebar) return true;

  const rect = sidebar.getBoundingClientRect();
  const targetWidth = getSidebarTargetWidth();

  return rect.width >= targetWidth - 2 && rect.right >= targetWidth - 2;
}

function setSidebarFlyoutLock(locked){
  document.getElementById("sidebar")?.classList.toggle("flyout-locked", Boolean(locked));
}

function syncSidebarFlyoutLock(){
  requestAnimationFrame(() => {
    const hasOpenPanel = Boolean(document.querySelector(".submenu.floating-open, .submenu-group.floating-open"));
    const hasPendingPanel = Boolean(pendingTopOpenTimer || pendingTopOpenTarget);
    setSidebarFlyoutLock(hasOpenPanel || hasPendingPanel);
  });
}

function closeFloatingPanel(panel){
  if(!panel) return;

  clearPanelClose(panel);
  clearPanelOpen(panel);
  if(pendingTopOpenTarget?.submenu === panel){
    clearPendingTopOpen();
  }

  panel
    .querySelectorAll(".submenu-group")
    .forEach(group => closeFloatingPanel(group));

  panel.classList.remove("open", "floating-open", "sidebar-search-open");
  panel.style.removeProperty("top");
  panel.style.removeProperty("left");
  panel.style.removeProperty("width");
  panel.style.removeProperty("max-height");

  getPanelTrigger(panel)?.classList.remove("open");
  syncSidebarFlyoutLock();
}

function closeAllFloatingPanels(exceptPanel){
  if(!exceptPanel){
    clearPendingTopOpen();
  }

  document
    .querySelectorAll(".submenu, .submenu-group")
    .forEach(panel => {
      if(panel !== exceptPanel && (!exceptPanel || !panel.contains(exceptPanel))){
        closeFloatingPanel(panel);
      }
    });
}

function closeSiblingTopPanels(exceptPanel){
  document
    .querySelectorAll(".menu > .submenu")
    .forEach(panel => {
      if(panel !== exceptPanel){
        closeFloatingPanel(panel);
      }
    });
}

function closeSiblingNestedPanels(trigger, exceptPanel){
  const parentPanel = getContainingFlyoutPanel(trigger);

  parentPanel
    ?.querySelectorAll(":scope > .submenu-group")
    .forEach(panel => {
      if(panel !== exceptPanel){
        closeFloatingPanel(panel);
      }
    });
}

function schedulePanelClose(panel){
  if(!panel) return;
  if(isSidebarTouchMode() && !panel.classList.contains("floating-open")) return;

  clearPanelOpen(panel);
  clearPanelClose(panel);

  const timer = setTimeout(() => {
    const trigger = getPanelTrigger(panel);

    if(panel.matches(":hover") || trigger?.matches(":hover")){
      return;
    }

    closeFloatingPanel(panel);
  }, SIDEBAR_CLOSE_DELAY);

  sidebarCloseTimers.set(panel, timer);
}

function clampPanelTop(top, panel){
  const panelHeight = Math.min(panel.offsetHeight || 220, window.innerHeight - 24);
  const maxTop = Math.max(8, window.innerHeight - panelHeight - 8);
  return Math.min(Math.max(top, 8), maxTop);
}

function positionTopSubmenu(menuItem, submenu){
  const sidebar = document.getElementById("sidebar");
  const sidebarRect = sidebar?.getBoundingClientRect();
  const itemRect = menuItem.getBoundingClientRect();
  const preferredLeft = Math.round(Math.max(sidebarRect?.right || 0, itemRect.right) + 10);
  const availableWidth = Math.max(220, window.innerWidth - preferredLeft - 8);
  const panelWidth = Math.min(286, availableWidth);
  const panelTop = clampPanelTop(itemRect.top - 4, submenu);

  submenu.style.left = `${preferredLeft}px`;
  submenu.style.width = `${panelWidth}px`;
  submenu.style.top = `${Math.round(panelTop)}px`;
  submenu.style.maxHeight = `calc(100vh - ${Math.round(panelTop + 10)}px)`;
}

function positionNestedSubmenu(trigger, group){
  const parentPanel = getContainingFlyoutPanel(trigger);
  const parentRect = parentPanel?.getBoundingClientRect();
  const triggerRect = trigger.getBoundingClientRect();
  const preferredLeft = Math.round((parentRect?.right || triggerRect.right) + 8);
  const availableWidth = Math.max(220, window.innerWidth - preferredLeft - 8);
  const panelWidth = Math.min(270, availableWidth);
  const panelTop = clampPanelTop(triggerRect.top - 4, group);

  group.style.left = `${preferredLeft}px`;
  group.style.width = `${panelWidth}px`;
  group.style.top = `${Math.round(panelTop)}px`;
  group.style.maxHeight = `calc(100vh - ${Math.round(panelTop + 10)}px)`;
}

function openTopSubmenuNow(menuItem, submenu, options = {}){
  if(!submenu) return;

  const forceFloating = Boolean(options.forceFloating);

  if(pendingTopOpenTarget?.submenu === submenu){
    clearPendingTopOpen();
  }

  clearPanelOpen(submenu);
  clearPanelClose(submenu);
  setSidebarFlyoutLock(true);

  if(isSidebarTouchMode() && !forceFloating){
    closeSiblingTopPanels(submenu);
    menuItem.classList.add("open");
    submenu.classList.add("open");
    submenu.classList.remove("floating-open");
    return;
  }

  closeSiblingTopPanels(submenu);
  menuItem.classList.add("open");
  submenu.classList.add("open", "floating-open");

  requestAnimationFrame(() => positionTopSubmenu(menuItem, submenu));
}

function openTopSubmenu(menuItem, submenu, options = {}){
  if(!submenu) return;

  const forceFloating = Boolean(options.forceFloating);

  setSidebarFlyoutLock(true);
  clearPanelOpen(submenu);
  clearPanelClose(submenu);

  if(isSidebarTouchMode() && !forceFloating){
    openTopSubmenuNow(menuItem, submenu);
    return;
  }

  if(pendingTopOpenTarget?.submenu === submenu){
    return;
  }

  if(pendingTopOpenTarget){
    clearPendingTopOpen();
  }

  const openTopPanel = getOpenTopSubmenu(submenu);
  if(openTopPanel){
    clearPendingTopOpen();
    closeFloatingPanel(openTopPanel);
    setSidebarFlyoutLock(true);

    pendingTopOpenTarget = { menuItem, submenu };
    pendingTopOpenTimer = setTimeout(() => {
      const target = pendingTopOpenTarget;
      clearPendingTopOpen();

      if(!target) return;

      if(target.menuItem.matches(":hover") || target.submenu.matches(":hover")){
        openTopSubmenu(target.menuItem, target.submenu, { forceFloating });
        return;
      }

      syncSidebarFlyoutLock();
    }, SIDEBAR_SWITCH_DELAY);

    return;
  }

  if(isSidebarReadyForFlyout()){
    openTopSubmenuNow(menuItem, submenu, { forceFloating });
    return;
  }

  const timer = setTimeout(() => {
    sidebarOpenTimers.delete(submenu);

    if(menuItem.matches(":hover") || submenu.matches(":hover")){
      openTopSubmenuNow(menuItem, submenu, { forceFloating });
      return;
    }

    syncSidebarFlyoutLock();
  }, SIDEBAR_OPEN_DELAY);

  sidebarOpenTimers.set(submenu, timer);
}

function openNestedSubmenu(trigger, group, options = {}){
  if(!group) return;

  const forceFloating = Boolean(options.forceFloating);

  setSidebarFlyoutLock(true);
  clearPanelClose(group);

  if(isSidebarTouchMode() && !forceFloating){
    closeSiblingNestedPanels(trigger, group);
    trigger.classList.add("open");
    group.classList.add("open");
    group.classList.remove("floating-open");
    return;
  }

  closeSiblingNestedPanels(trigger, group);
  trigger.classList.add("open");
  group.classList.add("open", "floating-open");

  requestAnimationFrame(() => positionNestedSubmenu(trigger, group));
}

window.toggleSubmenu = function(id, el){
  const submenu = document.getElementById(id);
  if(!submenu || !el) return;

  if(isSidebarTouchMode()){
    const shouldOpen = !submenu.classList.contains("open");
    closeFloatingPanel(submenu);

    if(shouldOpen){
      openTopSubmenu(el, submenu);
    }
    return;
  }

  openTopSubmenu(el, submenu);
};

window.toggleNestedSubmenu = function(id, el){
  const group = document.getElementById(id);
  if(!group || !el) return;

  if(isSidebarTouchMode()){
    const shouldOpen = !group.classList.contains("open");
    closeFloatingPanel(group);

    if(shouldOpen){
      openNestedSubmenu(el, group);
    }
    return;
  }

  openNestedSubmenu(el, group);
};

window.toggleUserMenu = function(event){
  event.stopPropagation();

  const dropdown = document.getElementById("userDropdown");
  if(!dropdown) return;

  dropdown.style.display = dropdown.style.display === "block" ? "none" : "block";
};

window.toggleMenu = function(){
  document.getElementById("sidebar")?.classList.toggle("expanded");
};

function setActiveSidebarBranch(target){
  document
    .querySelectorAll(".menu-item.active, .sidebar-favorite.active")
    .forEach(item => item.classList.remove("active"));

  if(target?.classList.contains("sidebar-favorite")){
    target.classList.add("active");
    return;
  }

  const topSubmenu = target?.closest(".submenu");
  const topTrigger = getPanelTrigger(topSubmenu);
  topTrigger?.classList.add("active");
}

function initFloatingSidebarMenus(){
  const sidebar = document.getElementById("sidebar");
  const menu = sidebar?.querySelector(".menu");
  if(!sidebar || !menu) return;

  menu.querySelectorAll(".menu-item.has-sub").forEach(menuItem => {
    const submenu = getTopSubmenuForItem(menuItem);
    if(!submenu) return;

    menuItem.addEventListener("mouseenter", () => {
      openTopSubmenu(menuItem, submenu, { forceFloating: true });
    });

    menuItem.addEventListener("mouseleave", () => schedulePanelClose(submenu));
    submenu.addEventListener("mouseenter", () => clearPanelClose(submenu));
    submenu.addEventListener("mouseleave", () => schedulePanelClose(submenu));
  });

  menu.querySelectorAll(".submenu-trigger").forEach(trigger => {
    const group = getNestedGroupForTrigger(trigger);
    if(!group) return;

    trigger.addEventListener("mouseenter", () => {
      clearPanelClose(getContainingFlyoutPanel(trigger));
      openNestedSubmenu(trigger, group, { forceFloating: true });
    });

    trigger.addEventListener("mouseleave", () => schedulePanelClose(group));
    group.addEventListener("mouseenter", () => {
      clearPanelClose(group);
      clearPanelClose(getContainingFlyoutPanel(trigger));
    });
    group.addEventListener("mouseleave", () => {
      schedulePanelClose(group);
      schedulePanelClose(getContainingFlyoutPanel(trigger));
    });
  });

  menu.addEventListener("click", event => {
    const submenuItem = event.target.closest(".submenu-item");
    if(!submenuItem) return;

    setActiveSidebarBranch(submenuItem);
    closeAllFloatingPanels();

    if(isSidebarTouchMode()){
      sidebar.classList.remove("expanded");
    }
  });

  document.querySelectorAll(".sidebar-favorite").forEach(favorite => {
    favorite.addEventListener("click", () => {
      setActiveSidebarBranch(favorite);
      closeAllFloatingPanels();

      if(isSidebarTouchMode()){
        sidebar.classList.remove("expanded");
      }
    });
  });

  window.addEventListener("resize", () => closeAllFloatingPanels());
  window.addEventListener("scroll", event => {
    if(!isSidebarTouchMode()){
      if(event.target instanceof Element && event.target.closest(".submenu, .submenu-group, #sidebarSearchResults")){
        return;
      }

      closeAllFloatingPanels();
    }
  }, true);
}

let sidebarSearchEntries = [];

function buildSidebarSearchEntries(){
  const menu = document.querySelector("#sidebar .menu");
  if(!menu) return [];

  const entries = [];

  menu.querySelectorAll(":scope > .menu-item.has-sub").forEach(menuItem => {
    const section = getCleanSidebarText(menuItem.querySelector("span") || menuItem);
    const submenu = getTopSubmenuForItem(menuItem);
    if(!submenu) return;

    submenu.querySelectorAll(".submenu-item").forEach(item => {
      const group = item.closest(".submenu-group");
      const groupTrigger = group ? getPanelTrigger(group) : null;
      const groupName = groupTrigger ? getCleanSidebarText(groupTrigger) : "";
      const label = getCleanSidebarText(item);
      const path = [section, groupName, label].filter(Boolean).join(" / ");

      entries.push({
        label,
        path,
        element: item,
        haystack: normalizeSidebarSearchText(`${label} ${path}`)
      });
    });
  });

  return entries;
}

function positionSidebarSearchResults(){
  const sidebar = document.getElementById("sidebar");
  const searchBox = document.getElementById("sidebarSearch");
  const results = document.getElementById("sidebarSearchResults");
  if(!sidebar || !searchBox || !results) return;

  const sidebarRect = sidebar.getBoundingClientRect();
  const searchRect = searchBox.getBoundingClientRect();

  if(isSidebarTouchMode()){
    results.style.left = `${Math.round(searchRect.left)}px`;
    results.style.top = `${Math.round(searchRect.bottom + 8)}px`;
    results.style.width = `${Math.round(searchRect.width)}px`;
    return;
  }

  results.style.left = `${Math.round(sidebarRect.right + 10)}px`;
  results.style.top = `${Math.round(searchRect.top)}px`;
  results.style.width = "286px";
}

function closeSidebarSearchResults(){
  document.getElementById("sidebarSearchResults")?.classList.remove("open");
}

function renderSidebarSearchResults(query){
  const searchBox = document.getElementById("sidebarSearch");
  const results = document.getElementById("sidebarSearchResults");
  const normalizedQuery = normalizeSidebarSearchText(query);

  searchBox?.classList.toggle("has-value", Boolean(normalizedQuery));

  if(!results) return;

  results.innerHTML = "";

  if(!normalizedQuery){
    closeSidebarSearchResults();
    return;
  }

  if(!sidebarSearchEntries.length){
    sidebarSearchEntries = buildSidebarSearchEntries();
  }

  const matches = sidebarSearchEntries
    .filter(entry => entry.haystack.includes(normalizedQuery))
    .slice(0, 10);

  if(!matches.length){
    const empty = document.createElement("div");
    empty.className = "sidebar-search-empty";
    empty.textContent = "Nenhum modulo encontrado";
    results.appendChild(empty);
  }

  matches.forEach(entry => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "sidebar-search-result";
    button.setAttribute("role", "option");

    const label = document.createElement("strong");
    label.textContent = entry.label;

    const path = document.createElement("span");
    path.textContent = entry.path;

    button.append(label, path);
    button.addEventListener("click", () => {
      const input = document.getElementById("sidebarSearchInput");

      setActiveSidebarBranch(entry.element);
      entry.element.click();

      if(input){
        input.value = "";
      }

      renderSidebarSearchResults("");
    });

    results.appendChild(button);
  });

  positionSidebarSearchResults();
  results.classList.add("open");
}

function filterSidebarMenu(query){
  renderSidebarSearchResults(query);
}

function initSidebarSearch(){
  const sidebar = document.getElementById("sidebar");
  const searchBox = document.getElementById("sidebarSearch");
  const input = document.getElementById("sidebarSearchInput");
  const clearButton = document.getElementById("sidebarSearchClear");
  const results = document.getElementById("sidebarSearchResults");

  if(!sidebar || !searchBox || !input) return;

  sidebarSearchEntries = buildSidebarSearchEntries();

  input.setAttribute("autocomplete", "new-password");
  input.setAttribute("autocapitalize", "none");
  input.setAttribute("autocorrect", "off");
  input.setAttribute("spellcheck", "false");
  input.value = "";
  filterSidebarMenu("");

  const unlockSearchInput = () => {
    input.removeAttribute("readonly");
  };

  const clearAutofillLeak = () => {
    if(input.value.includes("@")){
      input.value = "";
      filterSidebarMenu("");
    }
  };

  setTimeout(clearAutofillLeak, 250);
  setTimeout(clearAutofillLeak, 1000);

  searchBox.addEventListener("pointerdown", unlockSearchInput);
  input.addEventListener("focus", () => {
    unlockSearchInput();
    renderSidebarSearchResults(input.value);
  });

  searchBox.addEventListener("click", () => {
    if(window.innerWidth <= 1200){
      sidebar.classList.add("expanded");
    }

    unlockSearchInput();
    input.focus();
    renderSidebarSearchResults(input.value);
  });

  input.addEventListener("input", () => {
    renderSidebarSearchResults(input.value);
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

  results?.addEventListener("mousedown", event => {
    event.preventDefault();
  });

  document.addEventListener("click", event => {
    if(
      !event.target.closest("#sidebarSearch") &&
      !event.target.closest("#sidebarSearchResults")
    ){
      closeSidebarSearchResults();
    }
  });
}

function initSidebar(){
  initFloatingSidebarMenus();
  initSidebarSearch();
}

if(document.readyState === "loading"){
  document.addEventListener("DOMContentLoaded", initSidebar);
}else{
  initSidebar();
}

document.addEventListener("click", event => {
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

document.addEventListener("click", () => {
  const dropdown = document.getElementById("userDropdown");

  if(dropdown){
    dropdown.style.display = "none";
  }
});
