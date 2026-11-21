let warehouseData = null;
let materials = [];
let movements = [];
let warehouseLocations = [];
let countJustifications = [], countJustificationsError = false;
// Historico: periodo + "carregar mais" (o payload inicial traz so as ultimas 80).
let historyState = { rows: null, offset: 0, done: false, loading: false };
// Resultado da ultima contagem (divergencias aguardando justificativa).
let lastCountResult = [];
// Contagem por bipe: cada leitura soma na quantidade do material (pilha para desfazer).
let countScanLog = [];
let countResultsTab = "divergencias";
let attentionMaterials = [];
let sectors = [];
let employees = [];
let materialCategories = [];
let selectedMaterial = null;
let activeTab = "stock";
let currentPage = 1;
let pageSize = 10;
let searchTerm = "";
let filtersOpen = false;
let qrStream = null;
let qrScanFrame = null;
let lastQrRead = "";
let invoiceReceipt = createEmptyInvoiceReceipt();
let pendingDivergenceIndex = null;
let purchaseRequests = [];
let loans = [];
let countCycle = new Map();
let countCycleState = null;
let countCycleHistory = [];
let countApproval = null;
let incomingOrders = [];
let receivingChecklist = [];
let receivingParams = null;
let pendingPurchaseOrderId = null;
let blockedRncByMaterial = new Map();
let separationHistory = [];
let historyRowsCache = [];
let historySelectedType = "";
let exitServiceOrders = [], exitServiceOrdersLoading = false, exitServiceOrdersRequest = 0;
let materialAlertDays = 7;
let stockSummaryCache = new Map();
let qrModalMode = "lookup";
let pendingWithdrawReservation = null;
let nfeReceipts = [];
let incomingPurchases = [];
let activeNfeReceipt = null;
let activeReceiptStep = 1;
let pendingPurchaseRequestId = new URLSearchParams(window.location.search).get("purchase_request") || null;
let lastReceiptScan = { code: "", at: 0 };
let productionOrders = [];
let productionOrdersPromise = null;
let pendingManualExit = null;
let pendingPosExit = null;
let exitCart = [];
let exitScanBusy = false;
let warehouseMoveMode = "transfer";
let warehouseMoveVolume = null;
let activeInventoryLocation = null;
let inventoryScans = [];
let pendingReceiptBarcode = null;
let pendingLoanAuthorization = null;
let selectedSeparationOrderId = null;
let selectedSeparationPackages = [];
let separationPackagesLoading = false;
let selectedSeparationMaterialId = null;
let separationSearchTerm = "";
let separationStatusFilter = "todos";
let separationSortBy = "sequencia_pcp";
let separationPackageContext = null;
const SEPARATION_STATUS_LABELS = { aguardando: "Aguardando", em_separacao: "Em separação", parcial: "Parcial", concluido: "Concluído", atrasado: "Atrasado" };
const SEPARATION_INTEGER_UNITS = new Set(["UN", "PC", "PÇ", "KIT", "CX", "PCT", "ROL"]);
const SEPARATION_LABEL_STATUS_LABELS = { nao_impressa: "Etiqueta não impressa", impressa: "Etiqueta impressa", reimpressa: "Etiqueta reimpressa", invalidada: "Etiqueta desatualizada", cancelada: "Pacote cancelado" };
const almoxEls = {};


document.addEventListener("DOMContentLoaded", async () => {
  cacheAlmoxElements();
  bindAlmoxEvents();
  await loadWarehouse();
  // ?aba=epi (pendência "Trocar EPI" da Agenda) abre direto a aba pedida
  const abaPedida = new URLSearchParams(window.location.search).get("aba");
  const abaInicial = ({ recebimento: "receiving", recebimentos: "receipts", compras: "purchases", solicitacoes: "purchases", producao: "toseparate", separar: "toseparate", historico: "movements", contagem: "count", enderecos: "stock", vinculos: "supplier-links" })[abaPedida] || abaPedida;
  if (abaInicial === 'locations') switchTab('stock');
  else if (abaInicial === 'receipts') switchTab('receipts');
  else if (abaInicial) document.querySelector(`.almox-tabs > button[data-tab="${CSS.escape(abaInicial)}"]`)?.click();
  if (new URLSearchParams(window.location.search).get("recebimento") === "compras") switchTab("receiving");
  document.addEventListener("almox:recarregar", () => loadWarehouse());
  refreshIcons();
});

function cacheAlmoxElements() {
  [
    "globalSearch", "movementSearch", "qrBtn", "entryBtn", "exitBtn", "withdrawalBtn", "countBtn", "newMaterialBtn", "topMaterialRegistrationBtn", "almoxState", "almoxContent",
    "cardAbaixoMinimo", "cardEmprestimos", "cardMeta",
    "cardAssertividade", "cardTetoGastos", "areaCirculos",
    "referenceMaterialForm", "refMaterialName", "refMaterialTipo", "refMaterialEspecificacao", "refMaterialComprimento", "refMaterialLargura", "refMaterialEspessura", "refMaterialDiametro", "refMaterialParede", "refMaterialDiametroInterno", "refMaterialDiametroExterno", "refMaterialComplemento", "refMaterialCategory",
    "refMaterialCategoryTrigger", "refMaterialCategoryIcon", "refMaterialCategoryLabel", "refMaterialCategoryDropdown", "refMaterialCategoryOptions",
    "refMaterialUnit", "refMaterialStock", "refMaterialMinimum", "refMaterialCost",
    "refMaterialStatus", "refMaterialNotes", "saveReferenceMaterialBtn", "clearReferenceMaterialBtn",
    "referenceMovementPanel", "referenceMovementForm", "manualEntryNotice", "refMovementType", "movementEntryModeBtn", "movementExitModeBtn", "refMovementResponsible",
    "refMovementResponsibleLabel", "refMovementResponsibleAvatar", "refMovementResponsibleName",
    "referenceMovementItems", "addReferenceMovementItem", "referenceMovementTotal", "referenceExitFields", "referenceMaterialDatalist",
    "refMovementRequester", "refMovementRequesterTrigger", "refMovementRequesterAvatar", "refMovementRequesterName", "refMovementRequesterSector",
    "refMovementRequesterDropdown", "refMovementRequesterSearch", "refMovementRequesterOptions", "refMovementDestination", "refMovementDestinationName",
    "refMovementPurposeField", "refMovementPurpose", "refMovementOpField", "refMovementOp", "refMovementOpSearch", "refMovementOpOptions", "refMovementNotes",
    "refMovementDestinationLabel", "refMovementScrapDimensionsField", "refMovementScrapComprimento", "refMovementScrapLargura", "refMovementScrapEspessura", "refMovementScrapPhotoField", "refMovementScrapPhotoDrop", "refMovementScrapPhoto", "refMovementScrapPhotoPreview", "refMovementScrapPhotoHint",
    "movementPinModal", "movementPinBackdrop", "movementPinAvatar", "movementPinRequesterName", "movementPinInput", "movementPinError", "confirmMovementPinBtn", "cancelMovementPinBtn", "movementPinKicker", "movementPinTitle",
    "saveReferenceMovementBtn", "openReferenceInvoiceBtn", "referenceMovementHistory", "referenceHistorySearch",
    "usersReferenceTab", "referenceUsersBody",
    "goodsReceiptBtn", "goodsReceiptCenter", "backToWarehouseBtn", "newGoodsReceiptBtn", "goodsReceiptDashboard",
    "goodsReceiptWorkflow", "receiptMetrics", "receiptSearch", "receiptPeriod", "receiptSupplierFilter",
    "receiptStatusFilter", "receiptResponsibleFilter", "clearReceiptFilters", "receiptListBody", "receiptSteps",
    "receiptStepContent", "previousReceiptStep", "nextReceiptStep", "receiptAutosaveState",
    "stockValue", "stockUpdated", "minimumCount", "scrapCount", "borrowedCount", "divergenceCount", "groupFilter",
    "categoryFilter", "stockStatusFilter", "locationFilter", "filterBtn", "materialsBody", "materialsResultCount",
    "materialsPagination", "pageSizeSelect", "materialDetails", "recentMovements", "attentionList", "viewMinimumBtn",
    "movementsTab", "unifiedHistorySearch", "unifiedHistoryBody", "locationsTab", "historyFrom", "historyTo", "historyLoadMoreBtn", "historyTypeFilter", "historyExportBtn", "historyLoadedInfo", "countMonthInput", "countSearchInput", "almoxTabTools", "countTab", "toseparateTab",
    "toSeparateCount", "materialWorkspaceTab", "movementWorkspaceTab", "movementWorkspaceHost",
    "withdrawalsWorkspaceTab", "invoiceEntryModal",
    "loanForm", "loanResponsavelAvatar", "loanResponsavelName",
    "loanRetiradoPor", "loanRetiradoPorTrigger", "loanRetiradoPorAvatar", "loanRetiradoPorName", "loanRetiradoPorSector",
    "loanRetiradoPorDropdown", "loanRetiradoPorSearch", "loanRetiradoPorOptions",
    "loanSectorField", "loanSectorName", "loanOpField", "loanOp", "loanOpSearch", "loanOpOptions", "loanExpectedReturn", "loanItems", "addLoanItem", "loanNotes", "saveLoanBtn",
    "loanSearch", "loanItemsTableBody",
    "invoiceXmlInput", "invoiceBarcodeInput", "invoiceAccessKey", "importXmlBtn", "searchInvoiceBtn", "invoiceSupplier",
    "invoiceCnpj", "invoiceNumber", "invoiceSeries", "invoiceIssueDate", "invoiceTotal", "invoiceImportState",
    "invoiceItemsBody", "invoiceItemsCount", "invoiceCheckedCount", "invoiceDivergenceCount", "invoiceFooterTotal",
    "confirmInvoiceReceiptBtn", "invoiceDivergenceModal", "invoiceDivergenceForm", "invoiceDivergenceReason",
    "invoiceDivergenceNote", "cancelDivergenceBtn", "saveDivergenceBtn", "entryModal", "entryForm", "entryMaterialId",
    "entryMaterial", "entryMaterialList", "entryQty", "entryOp", "entryScrapFields",
    "entryScrapLength", "entryScrapWidth", "entryScrapThickness", "entryScrapPhoto", "entryScrapPhotoPreview",
    "entryNotes", "saveEntryBtn", "exitModal", "exitForm", "exitMaterial", "exitScanCode", "exitScanBtn", "exitScannedMaterial", "exitQty",
    "exitUnit", "exitPurpose", "exitOp", "exitOpField", "exitServiceOrder", "exitServiceOrderField", "exitReleaseUser", "exitNote", "exitWarning", "saveExitBtn", "exitCartBody", "exitCartEmpty", "exitCartMaterials", "exitCartUnits",
    "qrModal", "qrVideo", "qrManualInput", "openQrCodeBtn", "qrModalTitle", "qrModalSubtitle", "qrReservationResult",
    "qrResultMaterial", "qrResultOp", "confirmWithdrawBtn", "imageModal", "expandedImage",
    "labelModal", "labelPrintBody", "printLabelBtn",
    "separationPackageModal", "separationPackageId", "separationPackageOrderId", "separationPackageMaterialId",
    "separationPackageModalTitle", "separationPackageModalSubtitle", "separationPackageMaterialName",
    "separationPackageNecessario", "separationPackageSeparado", "separationPackageRestante",
    "separationPackageQty", "separationPackageTipo", "separationPackageHint",
    "saveSeparationPackageBtn", "saveAndPrintSeparationPackageBtn",
    "stockAllocationModal", "stockAllocationTitle", "stockAllocationSubtitle", "stockAllocationList"
    ,"warehouseMoveBtn", "warehouseMoveModal", "warehouseMoveVolumeCode", "warehouseMoveVolumeResult", "warehouseMoveLocationCode", "warehouseTransferFields", "warehouseSplitFields", "warehouseSplitQuantity", "warehouseSplitCount", "warehouseSplitSummary", "confirmWarehouseMoveBtn",
    "warehouseSetupBtn", "warehouseSetupModal", "barcodeSetupForm", "barcodeSetupMaterial", "barcodeSetupCode", "barcodeSetupUnits", "saveBarcodeSetupBtn", "locationSetupForm", "locationSetupCode", "locationSetupName", "locationSetupDescription", "saveLocationSetupBtn"
  ].forEach((id) => {
    almoxEls[id] = document.getElementById(id);
  });
}

function bindAlmoxEvents() {
  almoxEls.globalSearch.addEventListener("input", debounce((event) => {
    searchTerm = event.target.value;
    currentPage = 1;
    renderWarehouse();
  }, 240));
  almoxEls.movementSearch?.addEventListener("input", debounce(() => renderRecentMovements(), 180));

  [almoxEls.groupFilter, almoxEls.categoryFilter, almoxEls.stockStatusFilter, almoxEls.locationFilter].forEach((select) => {
    if (!select) return;
    select.addEventListener("change", () => {
      currentPage = 1;
      renderWarehouse();
    });
  });

  almoxEls.pageSizeSelect.addEventListener("change", () => {
    pageSize = Number(almoxEls.pageSizeSelect.value);
    currentPage = 1;
    renderMaterialsTable();
  });

  almoxEls.filterBtn?.addEventListener("click", () => {
    filtersOpen = !filtersOpen;
    almoxEls.filterBtn.closest(".almox-filters")?.classList.toggle("is-open", filtersOpen);
    almoxEls.filterBtn.innerHTML = filtersOpen
      ? `<i data-lucide="sliders-horizontal"></i> Ocultar filtros`
      : `<i data-lucide="sliders-horizontal"></i> Filtros avançados`;
    refreshIcons();
  });

  document.querySelectorAll(".almox-tabs > button[data-tab]").forEach((button) => {
    button.addEventListener("click", () => switchTab(button.dataset.tab));
  });

  document.querySelectorAll("[data-operation-mode]").forEach((button) => {
    button.addEventListener("click", () => mountMovementWorkspace(button.dataset.operationMode));
  });

  almoxEls.saveReferenceMaterialBtn?.addEventListener("click", saveReferenceMaterial);
  almoxEls.clearReferenceMaterialBtn?.addEventListener("click", clearReferenceMaterialForm);
  [almoxEls.refMaterialComprimento, almoxEls.refMaterialLargura, almoxEls.refMaterialEspessura, almoxEls.refMaterialDiametro, almoxEls.refMaterialParede, almoxEls.refMaterialDiametroInterno, almoxEls.refMaterialDiametroExterno, almoxEls.refMaterialComplemento].forEach((field) => {
    field?.addEventListener("input", updateGeneratedMaterialName);
  });
  // Tipo = lista fechada de Parametros (2026-10-02); o codigo do item sai da sigla do tipo
  document.getElementById("refMaterialEpi")?.addEventListener("change", (e) => document.getElementById("refMaterialEpiBox")?.classList.toggle("hidden", !e.target.checked));
  almoxEls.refMaterialTipo?.addEventListener("change", () => {
    updateGeneratedMaterialName();
    renderMaterialTypeHint();
  });
  almoxEls.refMaterialEspecificacao?.addEventListener("input", () => {
    enforceFieldCasing(almoxEls.refMaterialEspecificacao, (value) => value.toUpperCase());
    updateGeneratedMaterialName();
    renderMaterialTypeHint();
  });
  [almoxEls.refMaterialComprimento, almoxEls.refMaterialLargura, almoxEls.refMaterialEspessura, almoxEls.refMaterialDiametro, almoxEls.refMaterialParede, almoxEls.refMaterialDiametroInterno, almoxEls.refMaterialDiametroExterno].forEach((field) => field?.addEventListener("input", renderMaterialTypeHint));
  almoxEls.refMaterialCategoryTrigger?.addEventListener("click", toggleMaterialCategoryPicker);
  almoxEls.refMaterialCategoryOptions?.addEventListener("click", handleMaterialCategorySelection);
  almoxEls.topMaterialRegistrationBtn?.addEventListener("click", openReferenceMaterialModal);
  document.getElementById("manageAddressesBtn")?.addEventListener("click", event => {
    const panel = document.getElementById("almoxAddressManagement");
    openModal(panel);
    event.currentTarget.setAttribute("aria-expanded", "true");
  });
  document.querySelector('#almoxAddressManagement [data-location-add]')?.addEventListener('click',openLocationCreateModal);
  almoxEls.goodsReceiptBtn?.addEventListener("click", openGoodsReceiptCenter);
  // (2026-10-04) item que o cliente mandou direto ao galpao: lista + registrar (avisa o Comercial)
  window.addEventListener("tw-customer-items-changed", updateCustomerItemsBadge);
  almoxEls.backToWarehouseBtn?.addEventListener("click", closeGoodsReceiptCenter);
  almoxEls.newGoodsReceiptBtn?.addEventListener("click", startNewGoodsReceipt);
  almoxEls.previousReceiptStep?.addEventListener("click", previousGoodsReceiptStep);
  almoxEls.nextReceiptStep?.addEventListener("click", nextGoodsReceiptStep);
  [almoxEls.receiptSearch, almoxEls.receiptPeriod, almoxEls.receiptSupplierFilter, almoxEls.receiptStatusFilter, almoxEls.receiptResponsibleFilter].forEach((control) => control?.addEventListener("input", renderGoodsReceiptDashboard));
  almoxEls.clearReceiptFilters?.addEventListener("click", clearGoodsReceiptFilters);
  almoxEls.receiptListBody?.addEventListener("click", handleReceiptListClick);
  almoxEls.receiptStepContent?.addEventListener("change", handleReceiptWorkflowChange);
  almoxEls.receiptStepContent?.addEventListener("click", handleReceiptWorkflowClick);
  almoxEls.receiptStepContent?.addEventListener("keydown", handleReceiptWorkflowKeydown);
  almoxEls.receiptStepContent?.addEventListener("dragover", handleReceiptXmlDragOver);
  almoxEls.receiptStepContent?.addEventListener("dragleave", handleReceiptXmlDragLeave);
  almoxEls.receiptStepContent?.addEventListener("drop", handleReceiptXmlDrop);
  [almoxEls.movementEntryModeBtn, almoxEls.movementExitModeBtn].forEach((button) => button?.addEventListener("click", () => setReferenceMovementMode(button.dataset.movementMode)));
  almoxEls.refMovementRequesterTrigger?.addEventListener("click", toggleMovementRequesterPicker);
  almoxEls.refMovementRequesterSearch?.addEventListener("input", renderMovementRequesterOptions);
  almoxEls.refMovementRequesterOptions?.addEventListener("click", handleMovementRequesterSelection);
  almoxEls.refMovementOpSearch?.addEventListener("focus", renderMovementOpOptions);
  almoxEls.refMovementOpSearch?.addEventListener("input", () => {
    almoxEls.refMovementOp.value = "";
    renderMovementOpOptions();
  });
  almoxEls.refMovementOpOptions?.addEventListener("click", handleMovementOpSelection);
  almoxEls.refMovementScrapPhoto?.addEventListener("change", () => showReferenceScrapPhotoPreview(almoxEls.refMovementScrapPhoto.files[0]));
  ["dragover", "dragenter"].forEach((evt) => almoxEls.refMovementScrapPhotoDrop?.addEventListener(evt, (event) => {
    event.preventDefault();
    almoxEls.refMovementScrapPhotoDrop.classList.add("is-dragover");
  }));
  ["dragleave", "dragend"].forEach((evt) => almoxEls.refMovementScrapPhotoDrop?.addEventListener(evt, () => almoxEls.refMovementScrapPhotoDrop.classList.remove("is-dragover")));
  almoxEls.refMovementScrapPhotoDrop?.addEventListener("drop", (event) => {
    event.preventDefault();
    almoxEls.refMovementScrapPhotoDrop.classList.remove("is-dragover");
    const file = event.dataTransfer.files[0];
    if (!file) return;
    const transfer = new DataTransfer();
    transfer.items.add(file);
    almoxEls.refMovementScrapPhoto.files = transfer.files;
    showReferenceScrapPhotoPreview(file);
  });
  almoxEls.addReferenceMovementItem?.addEventListener("click", () => addReferenceMovementRow());
  almoxEls.referenceMovementItems?.addEventListener("input", (event) => {
    if (event.target.matches(".ref-item-material-input")) resolveReferenceItemMaterial(event.target.closest("tr"));
    updateReferenceMovementTotal();
  });
  almoxEls.referenceMovementItems?.addEventListener("focusin", (event) => {
    if (event.target.matches(".ref-item-material-input")) renderReferenceItemMaterialOptions(event.target.closest("tr"));
  });
  almoxEls.referenceMovementItems?.addEventListener("click", (event) => {
    if (event.target.closest("[data-remove-reference-item]")) {
      event.target.closest("tr")?.remove();
      updateReferenceMovementTotal();
    }
  });
  document.addEventListener("click", (event) => {
    if (!event.target.closest(".ref-item-material-field") && !event.target.closest(".ref-item-material-menu-portal")) closeReferenceItemMaterialMenus();
  });
  window.addEventListener("scroll", closeReferenceItemMaterialMenus, true);
  window.addEventListener("resize", closeReferenceItemMaterialMenus);
  almoxEls.saveReferenceMovementBtn?.addEventListener("click", saveReferenceMovement);
  almoxEls.referenceHistorySearch?.addEventListener("input", debounce(() => renderReferenceMovementHistory(), 180));
  almoxEls.unifiedHistorySearch?.addEventListener("input", debounce(() => renderUnifiedHistory(), 180));
  almoxEls.movementsTab?.addEventListener('click', event => {
    const button = event.target.closest('[data-history-type]');
    if (!button) return;
    historySelectedType = button.dataset.historyType;
    renderUnifiedHistory();
    document.querySelector(`#historyTypes [data-history-type="${CSS.escape(historySelectedType)}"]`)?.focus({preventScroll:true});
  });
  almoxEls.historyLoadMoreBtn?.addEventListener("click", () => loadMoreHistory(false));
  [almoxEls.historyFrom, almoxEls.historyTo].forEach((input) => input?.addEventListener("change", () => loadMoreHistory(true)));
  if (almoxEls.historyTypeFilter) {
    almoxEls.historyTypeFilter.innerHTML = `<option value="">Todos os movimentos</option>${Object.entries(HISTORY_KINDS).map(([key, kind]) => `<option value="${key}">${kind.label}</option>`).join("")}`;
    almoxEls.historyTypeFilter.addEventListener("change", () => renderUnifiedHistory());
  }
  almoxEls.historyExportBtn?.addEventListener("click", exportHistoryCsv);
  ["change", "click"].forEach((type) => almoxEls.locationsTab?.addEventListener(type, handleLocationsTabEvent));
  almoxEls.materialsBody?.addEventListener("change",handleLocationsTabEvent);
  document.getElementById("locationCreateForm")?.addEventListener("submit", submitLocationCreate);
  almoxEls.countTab?.addEventListener("click", handleCountAdjustmentClick);
  almoxEls.countTab?.addEventListener("keydown", (event) => {
    const tab = event.target.closest('[data-count-result-tab]');
    if (tab && ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
      const tabs = [...almoxEls.countTab.querySelectorAll('[data-count-result-tab]')];
      const index = tabs.indexOf(tab);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
      event.preventDefault(); selectCountResultsTab(tabs[next].dataset.countResultTab); tabs[next].focus(); return;
    }

    if (event.target.id === "countScanInput" && event.key === "Enter") {
      event.preventDefault();
      handleCountScan(event.target);
    }
  });
  almoxEls.countSearchInput?.addEventListener("input", filterCountBlindList);
  almoxEls.confirmMovementPinBtn?.addEventListener("click", authorizePendingManualExit);
  almoxEls.cancelMovementPinBtn?.addEventListener("click", closeMovementPinModal);
  almoxEls.movementPinBackdrop?.addEventListener("click", closeMovementPinModal);
  almoxEls.movementPinInput?.addEventListener("input", () => {
    almoxEls.movementPinInput.value = almoxEls.movementPinInput.value.replace(/\D/g, "").slice(0, 4);
    almoxEls.movementPinError.textContent = "";
  });
  almoxEls.movementPinInput?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      authorizePendingManualExit();
    }
  });
  almoxEls.openReferenceInvoiceBtn?.addEventListener("click", () => {
    openInvoiceReceipt();
    dockModalCard(almoxEls.invoiceEntryModal, almoxEls.movementWorkspaceTab);
  });

  almoxEls.loanRetiradoPorTrigger?.addEventListener("click", () => togglePersonPicker("retiradoPor"));
  almoxEls.loanRetiradoPorSearch?.addEventListener("input", () => renderPersonPickerOptions("retiradoPor"));
  almoxEls.loanRetiradoPorOptions?.addEventListener("click", (event) => selectPersonPickerOption("retiradoPor", event));
  almoxEls.addLoanItem?.addEventListener("click", () => addLoanItemRow());
  almoxEls.loanItems?.addEventListener("input", (event) => {
    if (event.target.matches(".loan-item-material-input")) resolveLoanItemMaterial(event.target.closest("tr"));
    validateLoanStock();
  });
  almoxEls.loanItems?.addEventListener("change", (event) => {
    if (event.target.matches(".loan-item-material-input")) resolveLoanItemMaterial(event.target.closest("tr"));
    validateLoanStock();
  });
  almoxEls.loanItems?.addEventListener("click", (event) => {
    if (event.target.closest("[data-remove-loan-item]")) { event.target.closest("tr")?.remove(); validateLoanStock(); }
  });
  almoxEls.saveLoanBtn?.addEventListener("click", saveLoan);
  almoxEls.loanSearch?.addEventListener("input", debounce(() => renderLoanItemsTable(), 180));
  almoxEls.loanOpSearch?.addEventListener("focus", renderLoanOpOptions);
  almoxEls.loanOpSearch?.addEventListener("input", () => { almoxEls.loanOp.value = ""; renderLoanOpOptions(); });
  almoxEls.loanOpOptions?.addEventListener("click", (event) => {
    const option = event.target.closest("[data-op-number]");
    if (!option) return;
    almoxEls.loanOp.value = option.dataset.opNumber;
    almoxEls.loanOpSearch.value = option.dataset.opNumber;
    almoxEls.loanOpOptions.classList.add("hidden");
  });
  almoxEls.loanItemsTableBody?.addEventListener("click", handleLoanReturn);

  document.querySelectorAll("[data-filter-action]").forEach((card) => {
    card.addEventListener("click", () => applyIndicatorFilter(card.dataset.filterAction));
  });

  document.querySelectorAll("[data-tab-action]").forEach((card) => {
    card.addEventListener("click", () => switchTab(card.dataset.tabAction));
  });

  almoxEls.entryBtn.addEventListener("click", () => openEntryModal());
  almoxEls.newMaterialBtn.addEventListener("click", openReferenceMaterialModal);
  almoxEls.exitBtn.addEventListener("click", () => openExitModal(selectedMaterial?.id));
  almoxEls.withdrawalBtn?.addEventListener("click", () => {
    renderWithdrawalsWorkspace();
    openModal(almoxEls.withdrawalsWorkspaceTab);
  });
  document.addEventListener("keydown", handleWarehouseActionShortcut);
  almoxEls.countBtn?.addEventListener("click", () => switchTab("count"));
  almoxEls.qrBtn?.addEventListener("click", () => openQrModal("lookup"));
  almoxEls.viewMinimumBtn?.addEventListener("click", () => applyIndicatorFilter("minimum"));

  almoxEls.importXmlBtn.addEventListener("click", () => almoxEls.invoiceXmlInput.click());
  almoxEls.invoiceXmlInput.addEventListener("change", importarNotaFiscal);
  almoxEls.searchInvoiceBtn.addEventListener("click", buscarNotaFiscal);
  almoxEls.confirmInvoiceReceiptBtn.addEventListener("click", confirmarEntrada);
  almoxEls.invoiceItemsBody.addEventListener("change", handleInvoiceItemInput);
  almoxEls.invoiceItemsBody.addEventListener("click", handleInvoiceItemClick);
  almoxEls.cancelDivergenceBtn.addEventListener("click", closeDivergenceModal);
  almoxEls.saveDivergenceBtn.addEventListener("click", registrarDivergencia);
  almoxEls.exitScanBtn?.addEventListener("click", resolveExitScannedMaterial);
  almoxEls.exitScanCode?.addEventListener("keydown", (event) => { if (event.key === "Enter") { event.preventDefault(); resolveExitScannedMaterial(); } });
  almoxEls.exitCartBody?.addEventListener("input", handleExitCartInput);
  almoxEls.exitCartBody?.addEventListener("click", handleExitCartClick);
  almoxEls.exitQty.addEventListener("input", validateExitRules);
  almoxEls.exitPurpose.addEventListener("change", () => {
    validateExitRules();
    if (almoxEls.exitPurpose.value === 'os') loadExitServiceOrders();
  });
  almoxEls.exitOp?.addEventListener("change", validateExitRules);

  almoxEls.entryScrapPhoto?.addEventListener("change", renderEntryPhotoPreview);
  almoxEls.entryMaterial.addEventListener("change", () => {
    const material = resolveEntryMaterial();
    almoxEls.entryMaterialId.value = material?.id || "";
  });
  // Clicar numa aba fecha a tela de trabalho aberta.
  document.querySelectorAll(".almox-tabs > button[data-tab]").forEach((button) => button.addEventListener("click", () => {
    if (almoxEls.almoxContent.classList.contains("has-tab-screen")) closeAllModals();
  }));
  almoxEls.saveEntryBtn.addEventListener("click", saveEntry);
  almoxEls.saveExitBtn.addEventListener("click", saveExit);
  almoxEls.warehouseMoveBtn?.addEventListener("click", openWarehouseMoveModal);
  almoxEls.warehouseSetupBtn?.addEventListener("click", openWarehouseSetupModal);
  almoxEls.saveBarcodeSetupBtn?.addEventListener("click", saveWarehouseBarcodeSetup);
  almoxEls.saveLocationSetupBtn?.addEventListener("click", saveWarehouseLocationSetup);
  document.querySelectorAll("[data-move-mode]").forEach(button=>button.addEventListener("click",()=>setWarehouseMoveMode(button.dataset.moveMode)));
  almoxEls.warehouseMoveVolumeCode?.addEventListener("keydown",event=>{if(event.key==="Enter"){event.preventDefault();resolveWarehouseMoveVolume();}});
  almoxEls.warehouseMoveLocationCode?.addEventListener("keydown",event=>{if(event.key==="Enter"){event.preventDefault();confirmWarehouseMove();}});
  almoxEls.confirmWarehouseMoveBtn?.addEventListener("click",confirmWarehouseMove);
  [almoxEls.warehouseSplitQuantity,almoxEls.warehouseSplitCount].forEach(input=>input?.addEventListener("input",updateWarehouseSplitSummary));
  almoxEls.openQrCodeBtn.addEventListener("click", handleQrScan);
  almoxEls.confirmWithdrawBtn.addEventListener("click", confirmWithdraw);
  almoxEls.qrManualInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      handleQrScan();
    }
  });
  almoxEls.printLabelBtn.addEventListener("click", () => window.print());
  almoxEls.countTab?.addEventListener("input", (event) => {
    if (event.target.id === "countSearchInput") filterCountBlindList();
    if (event.target.matches(".count-qty-input")) updateCountRowResult(event.target.closest(".blind-count-row"));
  });
  almoxEls.countTab?.addEventListener("click", (event) => {
    if (event.target.id === "saveCountBtn") saveMonthlyCount();
    if (event.target.id === "startLocationCountBtn") startBarcodeInventoryLocation();
    if (event.target.id === "undoInventoryScanBtn") undoBarcodeInventoryScan();
    if (event.target.id === "finishInventoryLocationBtn") finishBarcodeInventoryLocation();
    const approve=event.target.closest("[data-approve-adjustment]"); if(approve) approveBarcodeInventoryAdjustment(approve);
    if(event.target.closest("[data-new-inventory]")){activeInventoryLocation=null;inventoryScans=[];almoxEls.countTab.innerHTML=renderCountTab();setTimeout(()=>document.getElementById("inventoryLocationScanner")?.focus(),30);}
  });
  almoxEls.countTab?.addEventListener("keydown",event=>{if(event.key!=="Enter")return;if(event.target.id==="inventoryLocationScanner"){event.preventDefault();startBarcodeInventoryLocation();}if(event.target.id==="inventoryItemScanner"){event.preventDefault();processBarcodeInventoryScan();}});
  almoxEls.toseparateTab.addEventListener("click", (event) => {
    const queueTab = event.target.closest("[data-sep-queue-tab]");
    if (queueTab) { separationQueueTab = queueTab.dataset.sepQueueTab; renderSeparationTabDOM(); return; }
    const orderCard = event.target.closest("[data-select-separation-order]");
    if (orderCard) {
      selectSeparationOrder(orderCard.dataset.selectSeparationOrder);
      return;
    }
    const filterBtn = event.target.closest("[data-separation-filter]");
    if (filterBtn) {
      separationStatusFilter = filterBtn.dataset.separationFilter;
      renderSeparationTabDOM();
      return;
    }
    if (event.target.closest("#separationViewAllBtn")) {
      separationSearchTerm = "";
      separationStatusFilter = "todos";
      renderSeparationTabDOM();
      return;
    }
    const concludeBtn = event.target.closest("#separationConcludeBtn");
    if (concludeBtn) {
      handleConcludeSeparationClick(concludeBtn);
      return;
    }
    const materialPill = event.target.closest("[data-select-separation-material]");
    if (materialPill) {
      selectSeparationMaterial(materialPill.dataset.selectSeparationMaterial);
      return;
    }
    const sheetSep = event.target.closest("[data-sheet-separate]");
    if (sheetSep && !sheetSep.disabled) { separateWholeSheet(sheetSep); return; }
    const sheetUnsep = event.target.closest("[data-sheet-unseparate]");
    if (sheetUnsep) { unseparateSheet(sheetUnsep); return; }
    const quickAddBtn = event.target.closest("#separationQuickAddBtn");
    if (quickAddBtn && !quickAddBtn.disabled) {
      handleQuickAddVolume(quickAddBtn);
      return;
    }
    const printBtn = event.target.closest("[data-print-separation-package]");
    if (printBtn) {
      printSeparationPackage(printBtn.dataset.printSeparationPackage);
      return;
    }
    const editBtn = event.target.closest("[data-edit-separation-package]");
    if (editBtn) {
      const pkg = (selectedSeparationPackages || []).find((item) => item.id === editBtn.dataset.editSeparationPackage);
      if (pkg) openSeparationPackageModal({ productionOrderId: pkg.production_order_id, materialId: pkg.material_id, packageId: pkg.id });
      return;
    }
    const cancelBtn = event.target.closest("[data-cancel-separation-package]");
    if (cancelBtn) {
      cancelSeparationPackageFlow(cancelBtn.dataset.cancelSeparationPackage);
    }
  });
  almoxEls.toseparateTab.addEventListener("input", debounce((event) => {
    if (event.target.id !== "separationSearchInput") return;
    separationSearchTerm = event.target.value;
    const listEl = almoxEls.toseparateTab.querySelector(".separation-queue-list");
    if (listEl) listEl.innerHTML = renderSeparationQueueList();
    refreshIcons();
  }, 220));
  almoxEls.toseparateTab.addEventListener("input", (event) => {
    if (event.target.id === "separationQuickQty") renderSeparationQuickAddHint();
  });
  almoxEls.toseparateTab.addEventListener("change", (event) => {
    if (event.target.id === "separationSortSelect") {
      separationSortBy = event.target.value;
      renderSeparationTabDOM();
    }
  });
  almoxEls.separationPackageQty?.addEventListener("input", renderSeparationPackageHint);
  almoxEls.saveSeparationPackageBtn?.addEventListener("click", () => saveSeparationPackage({ print: false }));
  almoxEls.saveAndPrintSeparationPackageBtn?.addEventListener("click", () => saveSeparationPackage({ print: true }));


  document.querySelectorAll("[data-close-modal]").forEach((element) => {
    element.addEventListener("click", () => closeAllModals());
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeMovementPickers();
      closeAllModals();
    }
  });
  document.addEventListener("click", (event) => {
    if (!event.target.closest(".movement-picker-field")) closeAllPersonPickers();
    if (!event.target.closest(".movement-op-field")) { almoxEls.refMovementOpOptions?.classList.add("hidden"); almoxEls.loanOpOptions?.classList.add("hidden"); }
  });
}

async function loadWarehouse() {
  renderLoading();
  try {
    [warehouseData, sectors, employees, purchaseRequests, loans] = await Promise.all([
      TecnoweldAPI.listWarehouseData(),
      TecnoweldAPI.listSectors(),
      TecnoweldAPI.listEmployees(),
      TecnoweldAPI.listPurchaseRequests(),
      TecnoweldAPI.listWarehouseLoans()
    ]);
    materials = warehouseData.materiais || [];
    movements = warehouseData.movimentacoesRecentes || [];
    // (2026-10-04) chapas numeradas (plano de corte) para mostrar debaixo do material na lista
    warehouseSheets = []; // Acervo: sem chapas/plano de corte
    historyState = { rows: null, offset: 0, done: false, loading: false };
    warehouseLocations = await TecnoweldAPI.listAllWarehouseLocations().catch(() => []);
    separationHistory = await TecnoweldAPI.listRecentSeparationPackages().catch(() => []);
    countCycle = new Map(((await TecnoweldAPI.listWarehouseCountCycle().catch(() => [])) || []).map((row) => [row.material_id, row]));
    countCycleState = await TecnoweldAPI.getWarehouseCountCycleState().catch(() => null);
    countCycleHistory = (await TecnoweldAPI.listWarehouseCountCycles().catch(() => [])) || [];
    countApproval = await TecnoweldAPI.getCountApprovalRights().catch(() => null);
    blockedRncByMaterial = new Map();
    ((await TecnoweldAPI.listBlockedRncStock().catch(() => [])) || []).forEach((row) => blockedRncByMaterial.set(row.material_id, (blockedRncByMaterial.get(row.material_id) || 0) + Number(row.quantidade_bloqueada || 0)));
    const params = await TecnoweldAPI.getSystemParameters().catch(() => null);
    countJustificationsError=!params;
    countJustifications=Array.isArray(params?.contagem_justificativas)?params.contagem_justificativas:[];
    materialAlertDays = Number(params?.dias_alerta_material_almoxarifado ?? 7);
    attentionMaterials = warehouseData.materiaisAtencao || [];
    selectedMaterial = selectedMaterial ? materials.find((item) => item.id === selectedMaterial.id) || null : null;
    if (selectedSeparationOrderId && !separationOrderGroups().some((group) => group.id === selectedSeparationOrderId)) {
      selectedSeparationOrderId = null;
      selectedSeparationPackages = [];
      selectedSeparationMaterialId = null;
    }
    hydrateWarehouseFilters();
    hydrateFormOptions();
    renderWarehouse();
    almoxEls.almoxState.classList.add("hidden");
    almoxEls.almoxContent.classList.remove("hidden");
    window.TecnoweldPermissions?.apply(document);
    await window.AlmoxEpi?.load?.();
  } catch (error) {
    console.error(error);
    renderError(error);
  }
}

function renderLoading() {
  almoxEls.almoxContent.classList.add("hidden");
  almoxEls.almoxState.classList.remove("hidden");
  almoxEls.almoxState.innerHTML = `<i data-lucide="loader-circle"></i><strong>Carregando almoxarifado...</strong>`;
  refreshIcons();
}

function renderError(error) {
  almoxEls.almoxContent.classList.add("hidden");
  almoxEls.almoxState.classList.remove("hidden");
  almoxEls.almoxState.innerHTML = `
    <i data-lucide="circle-alert"></i>
    <strong>Não foi possível carregar o almoxarifado.</strong>
    <span>${escapeHtml(error?.message || "Verifique as tabelas do Supabase.")}</span>
    <button class="btn btn-secondary" type="button" id="retryWarehouseBtn"><i data-lucide="refresh-cw"></i> Tentar novamente</button>
  `;
  document.getElementById("retryWarehouseBtn")?.addEventListener("click", loadWarehouse);
  refreshIcons();
}

function hydrateWarehouseFilters() {
  if (almoxEls.categoryFilter) {
    const current = almoxEls.categoryFilter.value;
    const categories = [...new Set((warehouseData.materiais || []).map((item) => item.categoria).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR"));
    fillSelect(almoxEls.categoryFilter, ["", ...categories], "Todas as categorias");
    if (categories.includes(current)) almoxEls.categoryFilter.value = current;
  }
  if (!almoxEls.groupFilter) return;
  fillSelect(almoxEls.groupFilter, ["Todos os grupos", ...(warehouseData.filtros?.grupos || [])]);
  fillSelect(almoxEls.categoryFilter, ["Todas as categorias", ...(warehouseData.filtros?.categorias || [])]);
  fillSelect(almoxEls.stockStatusFilter, ["Todos os status", ...(warehouseData.filtros?.status || [])]);
  fillSelect(almoxEls.locationFilter, ["Todas as localizações", ...(warehouseData.filtros?.localizacoes || [])]);
}

function hydrateFormOptions() {
  // Na saída rápida, material e pessoas são identificados por bipagem e PIN.
  const options=document.getElementById("exitMaterialOptions"); if(options) options.innerHTML=materials.map(item=>`<option data-material-id="${escapeAttr(item.id)}" value="${escapeAttr(item.nome)}" label="${escapeAttr([item.codigo,item.nome].filter(Boolean).join(" \u00b7 "))}"></option>`).join("");
}

function renderWarehouse() {
  renderIndicators();
  renderMaterialsTable();
  renderRecentMovements();
  renderSecondaryTabs();
  refreshIcons();
}

function renderIndicators() {
  const indicators = warehouseData.indicadores || {};
  if (almoxEls.stockValue) almoxEls.stockValue.textContent = formatCurrency(indicators.valorEstoque || 0);
  if (almoxEls.stockUpdated) almoxEls.stockUpdated.textContent = `Atualizado em ${formatDateTime(indicators.atualizadoEm)}`;
  if (almoxEls.minimumCount) almoxEls.minimumCount.textContent = indicators.abaixoMinimo || 0;
  if (almoxEls.scrapCount) almoxEls.scrapCount.textContent = indicators.retalhosDisponiveis || 0;
  if (almoxEls.borrowedCount) almoxEls.borrowedCount.textContent = indicators.ferramentasEmprestadas || 0;
  if (almoxEls.divergenceCount) almoxEls.divergenceCount.textContent = indicators.divergenciasContagem || 0;
  if (almoxEls.toSeparateCount) almoxEls.toSeparateCount.textContent = indicators.pedidosASeparar || 0;
  if (almoxEls.cardAbaixoMinimo) almoxEls.cardAbaixoMinimo.textContent = indicators.abaixoMinimo || attentionMaterials.length || 0;
  if (almoxEls.cardEmprestimos) almoxEls.cardEmprestimos.textContent = indicators.ferramentasEmprestadas || 0;
  if (almoxEls.cardMeta) almoxEls.cardMeta.textContent = `${Number(indicators.metaContagem || 0)}%`;
  if (almoxEls.cardAssertividade) almoxEls.cardAssertividade.textContent = `${Number(indicators.assertividadeContagem || 0)}%`;
  if (almoxEls.cardTetoGastos) almoxEls.cardTetoGastos.textContent = `${Number(indicators.percentualTetoGastos || 0)}%`;
}

function renderMaterialsTable() {
  stockSummaryCache = buildStockSummaryCache();
  const filtered = filteredMaterials();
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  if (currentPage > totalPages) currentPage = totalPages;
  const pageItems = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  almoxEls.materialsBody.innerHTML = pageItems.length
    ? pageItems.map((item) => renderMaterialRow(item) + renderMaterialSheetsRow(item)).join("")
    : `<tr><td colspan="10" class="empty-state">Nenhum material encontrado.</td></tr>`;

  almoxEls.materialsResultCount.textContent = filtered.length
    ? `Mostrando ${pageItems.length} de ${filtered.length} materiais`
    : "Nenhum material encontrado";

  const titulosEstoque=[...almoxEls.materialsBody.closest('table').tHead.rows[0].cells].map(th=>(th.querySelector('.almox-th-search>span')||th).textContent.trim());
  [...almoxEls.materialsBody.rows].forEach(tr=>[...tr.cells].forEach((td,i)=>td.dataset.colLabel=titulosEstoque[i]));
  almoxEls.materialsBody.querySelectorAll("[data-open-sheet]").forEach((card) => card.addEventListener("click", (event) => {
    event.stopPropagation();
    switchTab("sheets");
    window.AlmoxSheets?.open?.(card.dataset.openSheet);
  }));
  almoxEls.materialsBody.querySelectorAll("tr[data-id]").forEach((row) => {
    row.addEventListener("click", (event) => {
      if(event.target.closest("[data-material-location]"))return;
      const allocationButton = event.target.closest("[data-stock-allocation]");
      if (allocationButton) {
        event.stopPropagation();
        openStockAllocationModal(row.dataset.id, allocationButton.dataset.stockAllocation);
        return;
      }
      const editName = event.target.closest("[data-edit-material]");
      if (editName) {
        event.stopPropagation();
        openMaterialRegistrationEditor(editName.dataset.editMaterial);
        return;
      }
      const action = event.target.closest("button")?.dataset.action;
      if (action === "more") {
        event.stopPropagation();
        window.TecnoAlert?.info?.("Ações como editar, QR Code e histórico serão conectadas nesta estrutura.", "Mais opções");
        return;
      }
      selectMaterial(row.dataset.id);
    });
  });

  document.querySelectorAll("[data-stock-summary-all]").forEach((button) => {
    button.onclick = () => openAllStockSummary(button.dataset.stockSummaryAll);
  });

  renderPagination(totalPages);
}

let warehouseSheets = [];
const SHEET_ROW_STATUS = { disponivel: "No estoque", separada: "Na Caldeiraria", corte_informado: "Conferir corte" };
function sheetSplitLabel(item) {
  const all = warehouseSheets.filter((sh) => sh.material_id === item.id);
  if (!all.length) return "";
  const whole = all.filter((sh) => sh.origem !== "sobra").length, scraps = all.filter((sh) => sh.origem === "sobra");
  const fullArea = Number(item.comprimento_maximo || 0) * Number(item.largura_maxima || 0);
  const frac = fullArea > 0 ? scraps.reduce((sum, sh) => sum + Number(sh.area_mm2 || 0), 0) / fullArea : 0;
  return `<span class="stock-sheet-split">${whole} chapa(s) inteira(s)${scraps.length ? ` · ${scraps.length} sobra(s) (${formatNumber(Math.round(frac * 1000) / 1000)} chapa) nas linhas abaixo` : ""}</span>`;
}
function renderMaterialSheetsRow(item) {
  const all = warehouseSheets.filter((sh) => sh.material_id === item.id);
  if (!all.length) return "";
  const SP = window.TwSheetPlan;
  const freePct = (sh) => (SP?.usedPct ? Math.max(0, 100 - SP.usedPct(sh)) : null);
  const tone = (free) => (free == null ? "" : free >= 60 ? "is-high" : free >= 25 ? "is-mid" : "is-low");
  const bar = (sh) => { const free = freePct(sh); return free == null ? "" : `<span class="stock-sheet-free ${tone(free)}"><i style="width:${free}%"></i></span><small class="stock-sheet-pct"><strong>${free}%</strong> livre · ${(sh.pecas || []).length} peça(s)</small>`; };
  const fullArea = Number(item.comprimento_maximo || 0) * Number(item.largura_maxima || 0);
  const whole = all.filter((sh) => sh.origem !== "sobra"), scraps = all.filter((sh) => sh.origem === "sobra");
  let html = "";
  if (whole.length) {
    html += `<tr class="stock-sheets-row"><td></td><td colspan="10"><div class="stock-sheets">${whole.map((sh) => `<button type="button" class="stock-sheet-card ${tone(freePct(sh))}" data-open-sheet="${escapeAttr(sh.id)}" title="Abrir a chapa ${escapeAttr(sh.codigo)}">
      <span class="stock-sheet-draw">${SP?.sheetSvg ? SP.sheetSvg(sh) : ""}</span>
      <span class="stock-sheet-info"><b>${escapeHtml(sh.codigo)} · chapa inteira</b><small>${formatNumber(sh.comprimento_mm)} × ${formatNumber(sh.largura_mm)} mm · ${escapeHtml(SHEET_ROW_STATUS[sh.status] || sh.status)}</small>${bar(sh)}</span></button>`).join("")}</div></td></tr>`;
  }
  // cada sobra: linha propria, com medidas e area (o saldo dela continua contado no item original)
  html += scraps.map((sh) => {
    const area = Number(sh.area_mm2 || 0);
    const frac = fullArea > 0 ? area / fullArea : 0;
    const rect = area > 0 && Math.abs(area - Number(sh.comprimento_mm) * Number(sh.largura_mm)) < 1;
    return `<tr class="stock-scrap-row" data-open-sheet="${escapeAttr(sh.id)}" title="Abrir a sobra ${escapeAttr(sh.codigo)}">
      <td><span class="material-code">${escapeHtml(sh.codigo)}</span></td>
      <td><span class="material-name-wrap"><span class="stock-scrap-draw">${SP?.sheetSvg ? SP.sheetSvg(sh) : ""}</span><span class="material-name"><strong>Sobra ${formatNumber(sh.comprimento_mm)} × ${formatNumber(sh.largura_mm)}${sh.espessura_mm ? ` × ${formatNumber(sh.espessura_mm)}` : ""} mm${rect ? "" : ' <span class="stock-min-flag is-shape">recortada</span>'} <span class="stock-min-flag is-scrap">Sobra</span></strong>
        <span>de ${escapeHtml(item.codigo || "")} ${escapeHtml(item.nome || "")}${sh.parent_codigo ? ` · cortada da ${escapeHtml(sh.parent_codigo)}` : ""}</span>
        <span class="stock-scrap-meta">Área ${formatNumber(area / 1e6)} m²${frac ? ` (${formatNumber(Math.round(frac * 1000) / 1000)} chapa)` : ""} · ${escapeHtml(SHEET_ROW_STATUS[sh.status] || sh.status)}</span>${bar(sh)}</span></span></td>
      <td>${escapeHtml(item.categoria || "-")}</td>
      <td>${item.localizacao ? `<span class="material-code">${escapeHtml(item.localizacao)}</span>` : '<span class="muted-line">Sem endereço</span>'}</td>
      <td><span class="stock-scrap-qty">1 sobra</span></td>
      <td colspan="6" class="stock-scrap-note">Saldo contado em ${escapeHtml(item.codigo || "o item original")}</td></tr>`;
  }).join("");
  return html;
}

function renderMaterialAddress(item) {
  const locais=warehouseLocations.filter(loc=>loc.ativo||loc.id===item.location_id);
  const legado=!item.location_id&&item.localizacao;
  return `<select class="tw-field almox-address-select" data-material-location="${escapeAttr(item.id)}" aria-label="Endereço de ${escapeAttr(item.nome)}">
    ${legado?`<option value="__legacy" selected disabled>${escapeHtml(item.localizacao)}</option>`:''}
    <option value=""${!item.location_id&&!legado?' selected':''}>Sem endereço</option>
    ${locais.map(loc=>`<option value="${escapeAttr(loc.id)}"${loc.id===item.location_id?' selected':''}>${escapeHtml(loc.codigo)}${loc.nome&&loc.nome!==loc.codigo?` — ${escapeHtml(loc.nome)}`:''}${loc.ativo?'':' (inativo)'}</option>`).join('')}
  </select>`;
}

function renderMaterialRow(item) {
  const selected = selectedMaterial?.id === item.id ? "selected" : "";
  const summary = materialStockSummary(item);
  return `
    <tr data-id="${escapeAttr(item.id)}" class="${selected}">
      <td><span class="material-code">${escapeHtml(item.codigo)}</span></td>
      <td><span class="material-name-wrap">${item.foto_url || item.desenho_url ? `<img class="material-thumb" src="${escapeAttr(item.foto_url || item.desenho_url)}" alt="" loading="lazy">` : ""}<span class="material-name"><strong class="material-name-link" data-edit-material="${escapeAttr(item.id)}" title="Abrir o cadastro">${summary.soonNeed ? `<i class="arrival-dot" data-arrival-tip="${escapeAttr(summary.soonNeed)}"></i> ` : ""}${escapeHtml(item.nome)}${item.status === "inativo" ? ' <span class="stock-min-flag is-inactive">Inativo</span>' : ""}${blockedRncByMaterial.get(item.id) ? ` <span class="stock-min-flag" title="Material recebido com não conformidade: fora do saldo até Compras decidir">Em RNC: ${escapeHtml(formatNumber(blockedRncByMaterial.get(item.id)))} ${escapeHtml(item.unidade || "")}</span>` : ""}${Number(item.estoque_minimo || 0) > 0 && summary.available <= Number(item.estoque_minimo) ? ` <span class="stock-min-flag" title="Estoque livre no mínimo ou abaixo (mínimo: ${escapeAttr(formatNumber(item.estoque_minimo))} ${escapeAttr(item.unidade || "")})">Abaixo do mínimo</span>` : ""}</strong><span>${escapeHtml([item.especificacao, stockFormatLabel(item) && `Estoque: ${stockFormatLabel(item)}`].filter(Boolean).join(" • ") || "-")}</span>${sheetSplitLabel(item)}</span></span></td>
      <td>${escapeHtml(item.categoria || "-")}</td>
      <td>${renderMaterialAddress(item)}</td>
      <td>${stockSummaryValue(summary.available, item.unidade, "available")}</td>
      <td>${stockAllocationValue(summary.preReserved, item.unidade, summary.preReserved ? "warning" : "neutral", "pre")}</td>
      <td>${stockAllocationValue(summary.reserved, item.unidade, summary.reserved ? "reserved" : "neutral", "reserved")}</td>
      <td>${stockAllocationValue(summary.consumed, item.unidade, "neutral", "consumed")}</td>
      <td>${stockAllocationValue(summary.incoming, item.unidade, summary.incoming ? "warning" : "neutral", "incoming")}</td>
      <td>${stockAllocationValue(summary.loaned, item.unidade, summary.loaned ? "warning" : "neutral", "loaned")}</td>
    </tr>
  `;
}

function materialStockSummary(item) {
  const summary = { reusable: 0, preReserved: 0, awaitingPurchase: 0, reserved: 0, consumed: 0, incoming: 0, loaned: 0, soonNeed: "", ...(stockSummaryCache.get(item.id) || {}) };
  summary.available = Math.max(Number(item.quantidade_disponivel || 0) - summary.preReserved - summary.reserved, 0);
  return summary;
}

function buildStockSummaryCache() {
  const cache = new Map();
  const ensure = (id) => {
    if (!cache.has(id)) cache.set(id, { reusable: 0, preReserved: 0, awaitingPurchase: 0, reserved: 0, consumed: 0, incoming: 0, loaned: 0, soonNeed: "" });
    return cache.get(id);
  };
  for (const row of warehouseData?.reservas || []) {
    if (!row.material_id) continue;
    const total = Number(row.quantidade_reservada || 0), summary = ensure(row.material_id);
    if (row.status === "pre_reserva") summary.preReserved += total;
    if (["aprovada", "reservada", "separada"].includes(row.status)) summary.reserved += total;
  }
  for (const row of purchaseRequests || []) {
    if (!row.material_id || !["pendente", "cotacao"].includes(row.status)) continue;
    ensure(row.material_id).awaitingPurchase += Number(row.quantidade || 0);
  }
  for (const row of warehouseData?.consumos || []) {
    if (row.material_id) ensure(row.material_id).consumed += Number(row.quantidade || 0);
  }
  for (const row of warehouseData?.aguardandoChegada || []) {
    if (row.material_id) ensure(row.material_id).incoming += Number(row.pendente || 0);
  }
  for (const row of openLoanItems()) ensure(row.material_id).loaned += row.pendente;
  // Materia-prima que um pedido vai usar nos proximos N dias (parametro) e ainda nao chegou.
  const limit = Date.now() + Math.max(0, materialAlertDays) * 86400000;
  for (const row of purchaseRequests || []) {
    if (!row.material_id || !row.production_order_id || ["recebida", "cancelada", "cancelado", "rejeitada", "reprovada", "concluida"].includes(row.status)) continue;
    const start = warehouseData?.pcpStartByOrder?.[row.production_order_id];
    if (!start || new Date(start).getTime() > limit) continue;
    const summary = ensure(row.material_id);
    const note = `Pedido ${row.production_order?.numero || "-"}|${new Date(start).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}`;
    if (!summary.soonNeed.includes(note)) summary.soonNeed = summary.soonNeed ? `${summary.soonNeed}\n${note}` : note;
  }
  const regularMaterials = materials.filter((item) => !isScrap(item));
  materials.filter(isReusableRemainder).forEach((remainder) => {
    const reference = findRemainderReferenceMaterial(remainder, regularMaterials);
    if (reference) ensure(reference.id).reusable += Number(remainder.quantidade_disponivel || 0);
  });
  return cache;
}

function isReusableRemainder(item) {
  if (item.tipo_material) return item.tipo_material === "retalho";
  const classification = normalizeText(`${item.categoria} ${item.grupo} ${item.classificacao}`);
  return /retalho|sobra/.test(classification) && !classification.includes("sucata");
}

function findRemainderReferenceMaterial(remainder, candidates) {
  const reference = normalizeText(remainder.material_referencia || "");
  if (!reference) return null;
  return candidates.find((item) => {
    const code = normalizeText(item.codigo);
    const name = normalizeText(item.nome);
    const description = normalizeText(`${item.nome || ""} ${item.especificacao || ""}`);
    return reference === code || reference === name || reference === description || description.includes(reference) || reference.includes(description);
  }) || null;
}

function findExistingRemainderMaterial(referenceMaterial, dimensions) {
  const name = normalizeText(referenceMaterial?.nome || "");
  if (!name) return null;
  return materials.find((item) => {
    if (item.tipo_material !== "retalho" || normalizeText(item.material_referencia || "") !== name) return false;
    if (!dimensions) return true;
    return (
      Number(item.comprimento_maximo || 0) === Number(dimensions.comprimento_maximo || 0) &&
      Number(item.largura_maxima || 0) === Number(dimensions.largura_maxima || 0) &&
      Number(item.espessura || 0) === Number(dimensions.espessura || 0)
    );
  }) || null;
}

function stockSummaryValue(value, unit, tone) {
  return `<span class="stock-summary-value ${tone}"><strong>${formatNumber(value)}</strong><small>${escapeHtml(unit || "un")}</small></span>`;
}

function stockAllocationValue(value, unit, tone, type) {
  const label = { pre: "pré-reservas", consumed: "consumo na produção", incoming: "compras aguardando chegada", loaned: "retiradas aguardando devolução" }[type] || "reservas";
  return `<button class="stock-summary-value stock-summary-button ${tone}" type="button" data-stock-allocation="${type}" aria-label="Ver ${label}"><strong>${formatNumber(value)}</strong><small>${escapeHtml(unit || "un")}</small></button>`;
}

// Consumo bipado na producao (rastro com horario, pedido e operador).
function renderConsumptionRows(rows, withMaterial) {
  return rows.length ? rows.map((item) => {
    const material = withMaterial ? materials.find((entry) => entry.id === item.material_id) : null;
    const who = [item.responsavel?.nome, item.setor?.nome, item.documento].filter(Boolean).join(" · ");
    return `<article class="stock-allocation-row"><div><strong>Pedido ${escapeHtml(item.op_numero || "-")}${material ? ` · ${escapeHtml(material.nome)}` : ""}</strong><span>${escapeHtml(formatDateTime(item.created_at))}${who ? ` · ${escapeHtml(who)}` : ""}</span></div><span class="stock-allocation-quantity">${formatNumber(item.quantidade)} ${escapeHtml(item.unidade || material?.unidade || "")}</span>${renderBadge("Consumido", "neutral")}</article>`;
  }).join("") : `<div class="empty-state">Nenhum consumo bipado na produção ainda.</div>`;
}

// Itens de retiradas (ferramentas) ainda nao devolvidos.
function openLoanItems() {
  return (loans || []).filter((loan) => loan.status !== "devolvido" && loan.status !== "cancelado").flatMap((loan) =>
    (loan.itens || []).map((item) => ({ ...item, loan, pendente: Number(item.quantidade_retirada || 0) - Number(item.quantidade_devolvida || 0) }))
  ).filter((item) => item.material_id && item.pendente > 0);
}

function renderLoanedRows(rows, withMaterial) {
  return rows.length ? rows.map((item) => {
    const loan = item.loan || {};
    const who = [loan.retirado_por?.nome || loan.retirado_por_nome, loan.setor?.nome].filter(Boolean).join(" · ") || "Responsável não informado";
    const forecast = loan.previsao_devolucao ? `Devolver até ${formatDateOnly(loan.previsao_devolucao)}` : "Sem previsão de devolução";
    const late = loan.previsao_devolucao && new Date(`${String(loan.previsao_devolucao).slice(0, 10)}T23:59:59`) < new Date();
    const name = withMaterial ? ` · ${escapeHtml(item.material?.nome || "Material")}` : "";
    return `<article class="stock-allocation-row"><div><strong>${escapeHtml(who)}${name}</strong><span>Retirado em ${escapeHtml(formatDateTime(loan.created_at))} · ${escapeHtml(forecast)}</span></div><span class="stock-allocation-quantity">${formatNumber(item.pendente)} ${escapeHtml(item.material?.unidade || "")}</span>${renderBadge(late ? "Atrasado" : "Aguardando devolução", late ? "danger" : "warning")}</article>`;
  }).join("") : `<div class="empty-state">Nenhuma retirada aguardando devolução.</div>`;
}

// Compras emitidas cujo material ainda nao chegou.
function renderIncomingRows(rows, withMaterial) {
  return rows.length ? rows.map((item) => {
    const order = item.purchase_order || {};
    const supplier = order.fornecedor?.trade_name || order.fornecedor?.legal_name || "Fornecedor não informado";
    const material = withMaterial ? materials.find((entry) => entry.id === item.material_id) : null;
    const forecast = order.prazo_acordado ? `Previsão: ${formatDateOnly(order.prazo_acordado)}` : "Sem previsão de entrega";
    const late = order.prazo_acordado && new Date(`${String(order.prazo_acordado).slice(0, 10)}T23:59:59`) < new Date();
    return `<article class="stock-allocation-row"><div><strong>Pedido #${escapeHtml(order.numero || "-")}${material ? ` · ${escapeHtml(material.nome)}` : ` · ${escapeHtml(item.nome || "")}`}</strong><span>${escapeHtml(supplier)} · ${escapeHtml(forecast)}</span></div><span class="stock-allocation-quantity">${formatNumber(item.pendente)} ${escapeHtml(item.unidade || material?.unidade || "")}</span>${renderBadge(late ? "Atrasado" : "Aguardando", late ? "danger" : "warning")}</article>`;
  }).join("") : `<div class="empty-state">Nenhuma compra aguardando chegada.</div>`;
}

function openStockAllocationModal(materialId, type) {
  const material = materials.find((item) => item.id === materialId);
  if (type === "loaned") {
    almoxEls.stockAllocationTitle.textContent = "Retirado — aguardando devolução";
    almoxEls.stockAllocationSubtitle.textContent = `${material?.codigo || ""} · ${material?.nome || "Material"}`;
    almoxEls.stockAllocationList.innerHTML = renderLoanedRows(openLoanItems().filter((item) => item.material_id === materialId), false);
    openModal(almoxEls.stockAllocationModal);
    return;
  }
  if (type === "consumed" || type === "incoming") {
    const consumed = type === "consumed";
    const rows = ((consumed ? warehouseData.consumos : warehouseData.aguardandoChegada) || []).filter((item) => item.material_id === materialId);
    almoxEls.stockAllocationTitle.textContent = consumed ? "Consumido na produção" : "Aguardando chegada";
    almoxEls.stockAllocationSubtitle.textContent = `${material?.codigo || ""} · ${material?.nome || "Material"}`;
    almoxEls.stockAllocationList.innerHTML = consumed ? renderConsumptionRows(rows, false) : renderIncomingRows(rows, false);
    openModal(almoxEls.stockAllocationModal);
    return;
  }
  const statuses = type === "pre" ? ["pre_reserva"] : ["aprovada", "reservada", "separada"];
  const rows = (warehouseData.reservas || []).filter((item) => item.material_id === materialId && statuses.includes(item.status));
  const isPreReserve = type === "pre";
  almoxEls.stockAllocationTitle.textContent = isPreReserve ? "Pré-reservas" : "Reservas";
  almoxEls.stockAllocationSubtitle.textContent = `${material?.codigo || ""} · ${material?.nome || "Material"}`;
  almoxEls.stockAllocationList.innerHTML = rows.length ? rows.map((item) => {
    const reference = item.op_numero || item.production_order?.numero || item.budget_quote?.codigo || (item.budget_quote?.numero ? `Orçamento #${item.budget_quote.numero}` : "Sem vínculo informado");
    const project = item.budget_quote_material?.mini_order?.nome || item.budget_quote_material?.project?.nome || item.setor?.nome || "-";
    return `<article class="stock-allocation-row"><div><strong>${escapeHtml(reference)}</strong><span>${escapeHtml(project)}</span></div><span class="stock-allocation-quantity">${formatNumber(item.quantidade_reservada)} ${escapeHtml(item.material?.unidade || material?.unidade || "")}</span>${renderBadge(labelReservationStatus(item.status), reservationStatusBadgeType(item.status))}</article>`;
  }).join("") : `<div class="empty-state">Nenhum registro encontrado para este material.</div>`;
  openModal(almoxEls.stockAllocationModal);
}

function openAllStockSummary(type) {
  if (type === "loaned") {
    almoxEls.stockAllocationTitle.textContent = "Retiradas aguardando devolução";
    almoxEls.stockAllocationSubtitle.textContent = "Ferramentas e materiais retirados que ainda não voltaram";
    almoxEls.stockAllocationList.innerHTML = renderLoanedRows(openLoanItems(), true);
    openModal(almoxEls.stockAllocationModal);
    return;
  }
  if (type === "remainders") {
    const rows = (warehouseData.materiais || []).filter(isReusableRemainder);
    almoxEls.stockAllocationTitle.textContent = "Todas as sobras";
    almoxEls.stockAllocationSubtitle.textContent = "Materiais disponíveis para reaproveitamento";
    almoxEls.stockAllocationList.innerHTML = rows.length ? rows.map((item) => `
      <article class="stock-allocation-row stock-allocation-row-scrap">
        ${item.foto_url ? `<img class="stock-allocation-photo" src="${escapeAttr(item.foto_url)}" alt="Foto da sobra">` : `<span class="stock-allocation-photo-placeholder"><i data-lucide="image"></i></span>`}
        <div><strong>${escapeHtml(item.codigo || "Sem código")} · ${escapeHtml(item.nome || "Material")}</strong><span>${escapeHtml(item.material_referencia || item.especificacao || "Origem não informada")}</span></div>
        <span class="stock-allocation-quantity">${formatNumber(item.quantidade_disponivel)} ${escapeHtml(item.unidade || "")}</span>
        ${renderBadge("Disponível", "success")}
      </article>`).join("") : `<div class="empty-state">Nenhuma sobra disponível no momento.</div>`;
    openModal(almoxEls.stockAllocationModal);
    refreshIcons();
    return;
  }
  if (type === "consumed" || type === "incoming") {
    const consumed = type === "consumed";
    almoxEls.stockAllocationTitle.textContent = consumed ? "Consumo na produção" : "Compras aguardando chegada";
    almoxEls.stockAllocationSubtitle.textContent = consumed ? "Matérias-primas bipadas e baixadas ao iniciar os pedidos" : "Itens de pedidos de compra emitidos que ainda não foram recebidos";
    almoxEls.stockAllocationList.innerHTML = consumed ? renderConsumptionRows(warehouseData.consumos || [], true) : renderIncomingRows(warehouseData.aguardandoChegada || [], true);
    openModal(almoxEls.stockAllocationModal);
    return;
  }
  const statuses = type === "pre" ? ["pre_reserva"] : ["aprovada", "reservada", "separada"];
  const rows = (warehouseData.reservas || []).filter((item) => statuses.includes(item.status));
  almoxEls.stockAllocationTitle.textContent = type === "pre" ? "Todas as pré-reservas" : "Todas as reservas";
  almoxEls.stockAllocationSubtitle.textContent = type === "pre" ? "Materiais comprometidos antes da geração do pedido" : "Materiais reservados para ordens de produção";
  almoxEls.stockAllocationList.innerHTML = rows.length ? rows.map((item) => {
    const reference = item.op_numero || item.production_order?.numero || item.budget_quote?.codigo || (item.budget_quote?.numero ? `Orçamento #${item.budget_quote.numero}` : "Sem vínculo informado");
    const materialName = item.material?.nome || item.budget_quote_material?.nome || "Material";
    return `<article class="stock-allocation-row"><div><strong>${escapeHtml(reference)} · ${escapeHtml(materialName)}</strong><span>${escapeHtml(item.setor?.nome || item.budget_quote?.cliente_nome || "-")}</span></div><span class="stock-allocation-quantity">${formatNumber(item.quantidade_reservada)} ${escapeHtml(item.material?.unidade || "")}</span>${renderBadge(labelReservationStatus(item.status), reservationStatusBadgeType(item.status))}</article>`;
  }).join("") : `<div class="empty-state">Nenhum registro encontrado.</div>`;
  openModal(almoxEls.stockAllocationModal);
}

function renderPagination(totalPages) {
  const pages = Array.from({ length: totalPages }, (_, index) => index + 1).slice(0, 7);
  almoxEls.materialsPagination.innerHTML = `
    <button type="button" ${currentPage === 1 ? "disabled" : ""} data-page="${currentPage - 1}"><i data-lucide="chevron-left"></i></button>
    ${pages.map((page) => `<button type="button" class="${page === currentPage ? "active" : ""}" data-page="${page}">${page}</button>`).join("")}
    <button type="button" ${currentPage === totalPages ? "disabled" : ""} data-page="${currentPage + 1}"><i data-lucide="chevron-right"></i></button>
  `;
  almoxEls.materialsPagination.querySelectorAll("button[data-page]").forEach((button) => {
    button.addEventListener("click", () => {
      currentPage = Number(button.dataset.page);
      renderMaterialsTable();
      refreshIcons();
    });
  });
}

function renderMaterialDetails() {
  if (!almoxEls.materialDetails) return;
  if (!selectedMaterial) {
    almoxEls.materialDetails.innerHTML = `<div class="empty-state">Selecione um material para visualizar os detalhes.</div>`;
    return;
  }

  const item = selectedMaterial;
  const materialMovements = movements.filter((movement) => movement.material_id === item.id).slice(0, 5);
  const technicalRows = technicalFields(item).map(([label, value]) => `
    <div class="technical-row"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>
  `).join("");

  almoxEls.materialDetails.innerHTML = `
    <header class="material-detail-head">
      <div>
        ${renderStatusBadge(item)}
        <h2>${escapeHtml(item.nome)}</h2>
        <span class="muted-line">${escapeHtml(item.codigo)} • ${escapeHtml(item.especificacao || "Sem especificação")}</span>
      </div>
      <div class="qr-box" id="materialQrCanvas"></div>
    </header>
    <button class="btn btn-secondary" type="button" data-copy-code><i data-lucide="copy"></i> Ver código</button>
    ${isScrap(item) ? `<div class="detail-images">${renderDetailImage(item.foto_url, "Foto principal")}${renderDetailImage(item.desenho_url, "Desenho / corte")}</div>` : ""}
    <section class="technical-list">${technicalRows || `<div class="empty-state">Sem dados técnicos preenchidos.</div>`}</section>
    <div class="almox-section-head"><h2>Últimas movimentações</h2></div>
    <section class="movement-list">
      ${materialMovements.map(renderMovementItem).join("") || `<div class="empty-state">Nenhuma movimentação registrada.</div>`}
    </section>
    <button class="link-action" type="button" data-history>Ver histórico completo</button>
  `;

  renderMaterialQrCode(item.qr_code || item.codigo || "");

  almoxEls.materialDetails.querySelectorAll(".detail-image[data-src]").forEach((image) => {
    image.addEventListener("click", () => openImageModal(image.dataset.src));
  });
  almoxEls.materialDetails.querySelector("[data-copy-code]")?.addEventListener("click", () => {
    navigator.clipboard?.writeText(item.codigo || "");
    window.TecnoAlert?.success?.("Código copiado.", "Material");
  });
}

function renderMaterialQrCode(code) {
  const container = document.getElementById("materialQrCanvas");
  if (!container || !code || !window.QRCode) return;
  new QRCode(container, { text: code, width: 84, height: 84, correctLevel: QRCode.CorrectLevel.M });
}

function renderRecentMovements() {
  if (!almoxEls.recentMovements) return;
  const movementTerm = normalizeText(almoxEls.movementSearch?.value || "");
  const recent = movements.filter((movement) => !movementTerm || normalizeText([
    movement.tipo,
    labelMovementType(movement.tipo),
    movement.material?.nome,
    movement.material?.codigo,
    movement.responsavel?.nome,
    movement.documento,
    movement.op_numero,
  ].join(" ")).includes(movementTerm)).slice(0, 10);
  almoxEls.recentMovements.innerHTML = recent.length
    ? recent.map((movement) => `<tr>
        <td>${formatDateTime(movement.created_at)}</td>
        <td>${escapeHtml(movement.op_numero || "-")}</td>
        <td>${renderBadge(labelMovementType(movement.tipo), movementTypeClass(movement.tipo))}</td>
        <td>${escapeHtml(movement.material?.nome || "Material removido")}</td>
        <td>${formatNumber(movement.quantidade)} ${escapeHtml(movement.unidade || movement.material?.unidade || "")}</td>
      </tr>`).join("")
    : `<tr><td colspan="5" class="empty-state">Nenhuma movimentação registrada.</td></tr>`;
}

function renderAttentionMaterials() {
  if (!almoxEls.attentionList) return;
  almoxEls.attentionList.innerHTML = attentionMaterials.length
    ? attentionMaterials.slice(0, 8).map((item) => `
      <div class="attention-item">
        <div><strong>${escapeHtml(item.nome)}</strong><span class="muted-line">${formatNumber(item.quantidade_disponivel)} ${escapeHtml(item.unidade || "")}</span></div>
        ${renderStatusBadge(item)}
      </div>
    `).join("")
    : `<div class="empty-state">Nenhum item crítico no momento.</div>`;
}

function renderSecondaryTabs() {
  renderUnifiedHistory();
  almoxEls.countTab.innerHTML = renderCountTab();
  if (almoxEls.locationsTab) almoxEls.locationsTab.innerHTML = renderLocationsTab();
}

function labelReservationStatus(status) {
  const labels = {
    pre_reserva: "Pré-reserva",
    aprovada: "Aprovada",
    reservada: "Reservada",
    separada: "Separada",
    retirada: "Retirada",
    cancelada: "Cancelada",
  };
  return labels[status] || status || "-";
}

function reservationStatusBadgeType(status) {
  if (status === "separada" || status === "retirada") return "success";
  if (status === "reservada") return "warning";
  if (status === "cancelada") return "danger";
  return "neutral";
}

function renderPreReserveTab() {
  const reservas = (warehouseData.reservas || []).filter((item) => item.status === "pre_reserva" || item.status === "aprovada");
  if (!reservas.length) {
    return renderTabEmptyState("clipboard-list", "Pré-reserva", "Materiais reservados na composição técnica antes de virar pedido.", "Nenhuma pré-reserva no momento.");
  }
  const groups = new Map();
  reservas.forEach((item) => {
    const key = item.budget_quote_id || item.id;
    if (!groups.has(key)) groups.set(key, { quote: item.budget_quote, items: [] });
    groups.get(key).items.push(item);
  });
  const cards = [...groups.values()].map((group) => {
    const quote = group.quote;
    const title = quote ? (quote.codigo || `Orçamento #${quote.numero}`) : "Orçamento";
    const rows = group.items.map((item) => {
      const projeto = item.budget_quote_material?.mini_order?.nome || item.budget_quote_material?.project?.nome || "-";
      return `
        <div class="prereserve-item">
          <div class="material-name"><strong>${escapeHtml(item.material?.nome || item.budget_quote_material?.nome || "-")}</strong><span>${escapeHtml(projeto)}</span></div>
          <span>${formatNumber(item.quantidade_reservada)} ${escapeHtml(item.material?.unidade || "")}</span>
          ${renderBadge(labelReservationStatus(item.status), reservationStatusBadgeType(item.status))}
        </div>
      `;
    }).join("");
    return `
      <article class="prereserve-card">
        <header>
          <h3>${escapeHtml(title)}</h3>
          <span class="muted-line">${escapeHtml(quote?.cliente_nome || "-")}</span>
        </header>
        <div class="prereserve-items">${rows}</div>
      </article>
    `;
  }).join("");
  return `<section class="prereserve-grid">${cards}</section>`;
}

/* ===================== Pedidos a separar (central de separacao) ===================== */

function separationOrderGroups() {
  const groups = new Map();
  (warehouseData.reservas || []).forEach((item) => {
    if (!item.production_order_id) return;
    if (!["reservada", "separada", "retirada"].includes(item.status)) return;
    if (!groups.has(item.production_order_id)) {
      groups.set(item.production_order_id, {
        id: item.production_order_id,
        op: item.production_order || null,
        opNumero: item.production_order?.numero || item.op_numero || "pedido",
        items: [],
      });
    }
    groups.get(item.production_order_id).items.push(item);
  });
  return [...groups.values()];
}

function computeSeparationOrderStatus({ itensTotal, itensConcluidos, separadoTotal, prazo }) {
  let baseStatus;
  if (itensTotal > 0 && itensConcluidos >= itensTotal) baseStatus = "concluido";
  else if (itensConcluidos > 0) baseStatus = "parcial";
  else if (separadoTotal > 0) baseStatus = "em_separacao";
  else baseStatus = "aguardando";
  const isAtrasado = baseStatus !== "concluido" && Boolean(prazo) && new Date(prazo).getTime() < Date.now();
  return { baseStatus, isAtrasado, displayStatus: isAtrasado ? "atrasado" : baseStatus };
}

function buildSeparationOrderSummary(group, progressRow) {
  const op = group.op || {};
  const itensTotal = progressRow ? Number(progressRow.itens_total || 0) : new Set(group.items.map((item) => item.material_id)).size;
  const itensConcluidos = progressRow ? Number(progressRow.itens_concluidos || 0) : 0;
  const necessarioTotal = progressRow ? Number(progressRow.quantidade_necessaria_total || 0) : group.items.reduce((sum, item) => sum + Number(item.quantidade_reservada || 0), 0);
  const separadoTotal = progressRow ? Number(progressRow.quantidade_separada_total || 0) : 0;
  const percentual = necessarioTotal > 0 ? Math.min(100, Math.round((separadoTotal / necessarioTotal) * 100)) : 0;
  const { baseStatus, isAtrasado, displayStatus } = computeSeparationOrderStatus({ itensTotal, itensConcluidos, separadoTotal, prazo: op.prazo });
  return { id: group.id, opNumero: group.opNumero, op, items: group.items, itensTotal, itensConcluidos, necessarioTotal, separadoTotal, percentual, baseStatus, isAtrasado, displayStatus, prazo: op.prazo };
}

function separationStatusBadgeType(status) {
  if (status === "concluido") return "success";
  if (status === "em_separacao") return "warning";
  if (status === "parcial") return "purple";
  if (status === "atrasado") return "danger";
  return "neutral";
}

function labelStatusBadgeType(status) {
  if (status === "impressa" || status === "reimpressa") return "success";
  if (status === "invalidada") return "warning";
  if (status === "cancelada") return "danger";
  return "neutral";
}

function materialSeparationState(necessario, separado) {
  if (necessario > 0 && separado >= necessario) return "concluido";
  if (separado > 0) return "em_separacao";
  return "aguardando";
}

function separationMaterialProgress(orderId, materialId) {
  return (warehouseData.separacaoMateriaisProgresso || []).find((row) =>
    row.production_order_id === orderId && row.material_id === materialId
  ) || null;
}

function separationMaterialQuantities(group, materialId) {
  const progress = separationMaterialProgress(group.id, materialId);
  const reservedFallback = group.items.filter((item) => item.material_id === materialId)
    .reduce((sum, item) => sum + Number(item.quantidade_reservada || 0), 0);
  return {
    necessario: Number(progress?.quantidade_necessaria ?? reservedFallback),
    reservado: Number(progress?.quantidade_reservada ?? reservedFallback),
    aguardandoCompra: Number(progress?.quantidade_aguardando_compra || 0),
    statusCompra: progress?.status_compra || null,
  };
}

function separationMaterialStep(orderId, materialId) {
  return (warehouseData.materiaisEtapas || []).find((row) =>
    row.production_order_id === orderId && row.material_id === materialId
  ) || null;
}

// (2026-10-10) material que ja chegou mas esta retido: RNC de recebimento aguardando Compras / lote aguardando certificado
let warehouseRetained = new Map();
async function loadWarehouseRetained() {
  try {
    const { data, error } = await TecnoweldAPI.getClient().rpc("warehouse_retained_materials");
    if (error) throw error;
    warehouseRetained = new Map((data || []).map((r) => [r.material_id, r]));
  } catch (_) { /* sem a informacao: a tela segue como antes */ }
}
function retainedBadgeHtml(materialId, unidade) {
  const r = warehouseRetained.get(materialId);
  if (!r) return "";
  const un = escapeHtml(unidade || "");
  return (Number(r.rnc) > 0 ? `<span class="separation-purchase-badge is-rnc"><i data-lucide="triangle-alert"></i>${formatNumber(r.rnc)} ${un} em RNC · aguardando Compras</span>` : "")
    + (Number(r.certificado) > 0 ? `<span class="separation-purchase-badge is-cert"><i data-lucide="file-badge"></i>${formatNumber(r.certificado)} ${un} aguardando certificado</span>` : "");
}
function retainedNoteHtml(materialId, unidade) {
  const r = warehouseRetained.get(materialId);
  if (!r) return "";
  const un = escapeHtml(unidade || "");
  return (Number(r.rnc) > 0 ? `<small class="separation-retained-note is-rnc">Chegou, mas ${formatNumber(r.rnc)} ${un} estão em RNC${r.rnc_nf ? ` (NF ${escapeHtml(r.rnc_nf)})` : ""}, aguardando a decisão de Compras. Não use essas peças até a decisão.</small>` : "")
    + (Number(r.certificado) > 0 ? `<small class="separation-retained-note">${formatNumber(r.certificado)} ${un} já chegaram, mas só entram no estoque quando o certificado do fornecedor for anexado ao lote.</small>` : "");
}

// (2026-10-10) prévia da etiqueta: escala para caber inteira numa janela discreta (a impressão usa o tamanho real)
function fitLabelPreview(el) {
  if (!el) return;
  requestAnimationFrame(() => {
    el.style.setProperty("--label-preview-zoom", "1");
    const w = el.offsetWidth || 1, h = el.offsetHeight || 1;
    el.style.setProperty("--label-preview-zoom", String(Math.min(1.5, 440 / w, Math.max(300, window.innerHeight - 300) / h)));
  });
}

function purchaseSeparationLabel(status) {
  return ({ pendente: "Aguardando Compras", cotacao: "Em cotação", comprada: "Compra realizada", recebida: "Recebido no almoxarifado" })[status]
    || "Aguardando compra";
}

function unitAllowsDecimal(unidade) {
  return !SEPARATION_INTEGER_UNITS.has(String(unidade || "").trim().toUpperCase());
}

function formatDateOnly(value) {
  if (!value) return "-";
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : "-";
}

function matchesSeparationSearch(order, term) {
  if (!term) return true;
  const haystack = normalizeText([
    order.opNumero,
    order.op?.peca_nome,
    order.op?.cliente,
    ...order.items.map((item) => item.material?.nome),
  ].join(" "));
  return haystack.includes(term);
}

function sortSeparationOrders(orders) {
  const list = [...orders];
  const byDate = (value) => (value ? new Date(value).getTime() : Number.POSITIVE_INFINITY);
  switch (separationSortBy) {
    case "sequencia_pcp": {
      // Ordem de producao do PCP; pedidos ja separados vao para o fim; sem programacao, pelo prazo.
      const starts = warehouseData?.pcpStartByOrder || {};
      list.sort((a, b) =>
        Number(a.percentual >= 100) - Number(b.percentual >= 100)
        || byDate(starts[a.id]) - byDate(starts[b.id])
        || byDate(a.prazo) - byDate(b.prazo));
      break;
    }
    case "prazo_distante":
      list.sort((a, b) => (b.prazo ? new Date(b.prazo).getTime() : -Infinity) - (a.prazo ? new Date(a.prazo).getTime() : -Infinity));
      break;
    case "numero_op":
      list.sort((a, b) => String(a.opNumero || "").localeCompare(String(b.opNumero || "")));
      break;
    case "maior_progresso":
      list.sort((a, b) => b.percentual - a.percentual);
      break;
    case "menor_progresso":
      list.sort((a, b) => a.percentual - b.percentual);
      break;
    case "atrasados_primeiro":
      list.sort((a, b) => Number(b.isAtrasado) - Number(a.isAtrasado) || byDate(a.prazo) - byDate(b.prazo));
      break;
    case "prazo_proximo":
    default:
      list.sort((a, b) => byDate(a.prazo) - byDate(b.prazo));
      break;
  }
  return list;
}

function separationOrdersSnapshot() {
  const progressByOrder = new Map((warehouseData.separacaoProgresso || []).map((row) => [row.production_order_id, row]));
  return separationOrderGroups().map((group) => buildSeparationOrderSummary(group, progressByOrder.get(group.id)));
}

function renderToSeparateTab() {
  const sortOptions = [
    ["sequencia_pcp", "Sequência do PCP"],
    ["prazo_proximo", "Prazo mais próximo"],
    ["prazo_distante", "Prazo mais distante"],
    ["numero_op", "Número do pedido"],
    ["maior_progresso", "Maior progresso"],
    ["menor_progresso", "Menor progresso"],
    ["atrasados_primeiro", "Pedidos atrasados primeiro"],
  ].map(([value, label]) => `<option value="${value}"${separationSortBy === value ? " selected" : ""}>${escapeHtml(label)}</option>`).join("");

  return `
    <div class="reference-operation-grid separation-layout">
      <article class="reference-form-panel separation-queue-panel">
        ${renderSeparationQueueTabs()}
        <div class="separation-queue-toolbar">
          <label class="separation-sort-compact" title="Ordenar por">
            <i data-lucide="arrow-up-down"></i>
            <select id="separationSortSelect">${sortOptions}</select>
          </label>
        </div>
        <div class="separation-queue-list">${renderSeparationQueueList()}</div>
        <footer class="separation-queue-footer">
          <button class="btn btn-secondary" type="button" id="separationViewAllBtn">Ver todos os pedidos</button>
        </footer>
      </article>
      <article class="reference-form-panel separation-material-list-panel">${renderSeparationMaterialListPanel()}</article>
      <div class="separation-detail-stack">
        <article class="reference-form-panel separation-input-panel">${renderSeparationInputPanel()}</article>
        <article class="reference-form-panel separation-volumes-panel">${renderSeparationVolumesPanel()}</article>
      </div>
    </div>
  `;
}

function renderSeparationMaterialListPanel() {
  if (!selectedSeparationOrderId) return `<div class="separation-detail-empty"><i data-lucide="boxes"></i><p>Os insumos do pedido aparecerão aqui.</p></div>`;
  const group = separationOrderGroups().find((item) => item.id === selectedSeparationOrderId);
  if (!group || separationPackagesLoading) return `<div class="separation-detail-skeleton"><div class="skeleton-block"></div></div>`;
  const materialIds = [...new Set(group.items.map((item) => item.material_id))];
  const activeMaterialId = materialIds.includes(selectedSeparationMaterialId) ? selectedSeparationMaterialId : materialIds[0];
  const rows = materialIds.map((materialId) => {
    const item = group.items.find((row) => row.material_id === materialId);
    const qty = separationMaterialQuantities(group, materialId);
    const step = separationMaterialStep(group.id, materialId);
    const separado = (selectedSeparationPackages || []).filter((pkg) => pkg.material_id === materialId && pkg.status === "ativo").reduce((sum, pkg) => sum + Number(pkg.quantidade || 0), 0);
    const state = materialSeparationState(qty.necessario, separado);
    const pcpNeed = separationPcpNeed(group.id, step?.required_step_id);
    return `<button type="button" class="separation-material-row state-${state}${materialId === activeMaterialId ? " is-selected" : ""}${qty.aguardandoCompra > 0 ? " has-pending-arrival" : ""}" data-select-separation-material="${escapeAttr(materialId)}">
      <span class="separation-material-row-head"><strong>${qty.aguardandoCompra > 0 ? '<i class="arrival-dot" data-arrival-tip=""></i>' : ""}${escapeHtml(item?.material?.nome || "-")}</strong>${item?.material?.tipo_material === "retalho" ? `<span class="separation-scrap-badge" title="Sobra escolhida na composição técnica">Sobra ${escapeHtml(item.material.codigo || "")}</span>` : ""}${state === "concluido" ? '<i data-lucide="circle-check"></i>' : ""}</span>
      <span class="muted-line">${formatNumber(separado)} de ${formatNumber(qty.necessario)} ${escapeHtml(item?.material?.unidade || "")} · ${item?.material?.localizacao ? `End. <strong>${escapeHtml(item.material.localizacao)}</strong>` : "Sem endereço"}</span>
      ${step ? `<span class="separation-step-badge"><i data-lucide="route"></i>Etapa ${escapeHtml(String(step.etapa_ordem || ""))} · ${escapeHtml(step.setor_nome || step.etapa_nome || "")}</span>` : ""}
      <span class="separation-pcp-need${pcpNeed ? "" : " is-empty"}">Necessidade do PCP: <strong>${pcpNeed ? escapeHtml(formatDateTime(pcpNeed)) : "sem programação"}</strong></span>
      ${qty.aguardandoCompra > 0 ? `<span class="separation-purchase-badge"><i data-lucide="shopping-cart"></i>${formatNumber(qty.aguardandoCompra)} ${escapeHtml(item?.material?.unidade || "")} · ${escapeHtml(purchaseSeparationLabel(qty.statusCompra))}</span>${retainedBadgeHtml(materialId, item?.material?.unidade)}` : ""}
    </button>`;
  }).join("");
  return `<header class="separation-column-head"><span>Insumos do pedido</span><strong>${materialIds.length}</strong></header><div class="separation-material-list">${rows}</div>`;
}

// Necessidade do PCP: inicio programado da etapa que usa o material (sem etapa, o inicio do pedido).
function separationPcpNeed(orderId, stepId) {
  return (stepId && warehouseData?.pcpStartByStep?.[stepId]) || warehouseData?.pcpStartByOrder?.[orderId] || null;
}

// Pedido com material que ainda nao chegou (aguardando compra/recebimento).
function separationOrderHasPendingArrival(group) {
  if (!group) return false;
  return [...new Set(group.items.map((item) => item.material_id))]
    .some((materialId) => separationMaterialQuantities(group, materialId).aguardandoCompra > 0);
}

let separationQueueTab = "abertos";
const separationIsDone = (order) => order.baseStatus === "concluido";
function renderSeparationQueueList() {
  const orders = separationOrdersSnapshot();
  const filtered = sortSeparationOrders(orders).filter((order) => (separationQueueTab === "concluidos") === separationIsDone(order));
  if (!filtered.length) {
    return separationQueueTab === "concluidos"
      ? `<div class="empty-state separation-queue-empty"><i data-lucide="circle-check"></i><p>Nenhum pedido concluído.</p></div>`
      : `<div class="empty-state separation-queue-empty"><i data-lucide="package-search"></i><p>Não existem pedidos aguardando separação.</p></div>`;
  }
  return filtered.map((order) => renderSeparationQueueCard(order)).join("");
}
function renderSeparationQueueTabs() {
  const orders = separationOrdersSnapshot();
  const done = orders.filter(separationIsDone).length;
  return `<nav class="separation-queue-tabs"><button type="button" data-sep-queue-tab="abertos" class="${separationQueueTab === "abertos" ? "is-on" : ""}">A separar <b>${orders.length - done}</b></button><button type="button" data-sep-queue-tab="concluidos" class="${separationQueueTab === "concluidos" ? "is-on" : ""}">Concluídos <b>${done}</b></button></nav>`;
}

function renderSeparationQueueCard(order) {
  const isSelected = order.id === selectedSeparationOrderId;
  const itemLabel = order.itensTotal === 1 ? "item" : "itens";
  const statusType = separationStatusBadgeType(order.displayStatus);
  const group = separationOrderGroups().find((item) => item.id === order.id);
  const pendingArrival = separationOrderHasPendingArrival(group);
  const pcpNeed = separationPcpNeed(order.id, null);
  return `
    <button type="button" class="separation-queue-card status-${statusType}${isSelected ? " is-selected" : ""}${pendingArrival ? " has-pending-arrival" : ""}" data-select-separation-order="${escapeAttr(order.id)}">
      <div class="separation-queue-card-top">
        <strong>${pendingArrival ? '<i class="arrival-dot" data-arrival-tip=""></i>' : ""}${escapeHtml(order.opNumero)}</strong>
        ${renderBadge(SEPARATION_STATUS_LABELS[order.displayStatus] || order.displayStatus, statusType)}
      </div>
      <span class="separation-queue-card-product">${escapeHtml(order.op?.peca_nome || "-")}</span>
      <div class="separation-queue-card-meta">
        <span><i data-lucide="box"></i>${order.itensTotal} ${itemLabel}</span>
        <span><i data-lucide="calendar"></i>${order.prazo ? formatDateOnly(order.prazo) : "-"}</span>
      </div>
      <div class="separation-pcp-need${pcpNeed ? "" : " is-empty"}">Necessidade do PCP: <strong>${pcpNeed ? escapeHtml(formatDateTime(pcpNeed)) : "sem programação"}</strong></div>
      <div class="separation-queue-card-progress">
        <div class="separation-queue-progress"><i style="--value:${order.percentual}%"></i></div>
        <span>${order.percentual}%</span>
      </div>
    </button>
  `;
}

function separationDetailContext() {
  if (!selectedSeparationOrderId) return { state: "empty" };
  const group = separationOrderGroups().find((item) => item.id === selectedSeparationOrderId);
  if (!group) return { state: "empty" };
  if (separationPackagesLoading) return { state: "loading" };

  const progressByOrder = new Map((warehouseData.separacaoProgresso || []).map((row) => [row.production_order_id, row]));
  const order = buildSeparationOrderSummary(group, progressByOrder.get(group.id));
  const materialIds = [...new Set(group.items.map((item) => item.material_id))];
  const activeMaterialId = materialIds.includes(selectedSeparationMaterialId) ? selectedSeparationMaterialId : materialIds[0];

  const pills = materialIds.length > 1 ? materialIds.map((materialId) => {
    const items = group.items.filter((item) => item.material_id === materialId);
    const necessario = separationMaterialQuantities(group, materialId).necessario;
    const separado = (selectedSeparationPackages || []).filter((pkg) => pkg.material_id === materialId && pkg.status === "ativo").reduce((sum, pkg) => sum + Number(pkg.quantidade || 0), 0);
    const state = materialSeparationState(necessario, separado);
    return `
      <button type="button" class="separation-material-pill state-${state}${materialId === activeMaterialId ? " is-selected" : ""}" data-select-separation-material="${escapeAttr(materialId)}">
        ${state === "concluido" ? '<i data-lucide="check"></i>' : ""}<span>${escapeHtml(abbreviateForLabel(items[0]?.material?.nome || "-", 22))}</span>
      </button>
    `;
  }).join("") : "";

  const currentItems = group.items.filter((item) => item.material_id === activeMaterialId);
  const material = currentItems[0]?.material || {};
  const quantities = separationMaterialQuantities(group, activeMaterialId);
  const currentStep = separationMaterialStep(group.id, activeMaterialId);
  const currentNecessario = quantities.necessario;
  const currentSeparado = (selectedSeparationPackages || []).filter((pkg) => pkg.material_id === activeMaterialId && pkg.status === "ativo").reduce((sum, pkg) => sum + Number(pkg.quantidade || 0), 0);
  const currentComplete = currentNecessario > 0 && currentSeparado >= currentNecessario;
  const allComplete = order.itensTotal > 0 && order.itensConcluidos >= order.itensTotal;
  const responsavel = mostRecentSeparationResponsible();
  const concludeDisabled = allComplete ? false : !currentComplete;

  return {
    state: "ready", order, materialIds, activeMaterialId, pills, material, currentItems,
    currentNecessario, currentSeparado, currentReservado: quantities.reservado,
    currentAguardandoCompra: quantities.aguardandoCompra, currentPurchaseStatus: quantities.statusCompra, currentStep,
    allComplete, responsavel, concludeDisabled,
  };
}

function renderSeparationInputPanel() {
  const ctx = separationDetailContext();
  if (ctx.state === "empty") {
    return `<div class="separation-detail-empty"><i data-lucide="clipboard-list"></i><p>Selecione uma ordem de produção para iniciar a separação.</p></div>`;
  }
  if (ctx.state === "loading") {
    return `
      <div class="separation-detail-skeleton">
        <div class="skeleton-line" style="width:40%"></div>
        <div class="skeleton-line" style="width:60%"></div>
        <div class="skeleton-block"></div>
      </div>
    `;
  }

  const { order, material, currentNecessario, currentSeparado, currentReservado, currentAguardandoCompra, currentPurchaseStatus, currentStep } = ctx;
  const unidade = material.unidade || "";
  const falta = Math.max(currentNecessario - currentSeparado, 0);
  const complete = currentNecessario > 0 && falta <= 0;
  const availableComplete = currentSeparado >= currentReservado && currentReservado < currentNecessario;
  const disableVolume = complete || availableComplete;
  // Pedaco de barra/chapa (2026-10-01): a composicao calcula pela medida (ex.: 0,004 da barra). Nesse caso o almoxarife corta o
  // pedaco: o campo aceita fracao mesmo em UN, ja vem com o que falta e mostra a medida da peca para cortar.
  const fractional = !Number.isInteger(Math.round(currentNecessario * 10000) / 10000);
  const decimal = unitAllowsDecimal(unidade) || fractional;
  const restanteVolume = Math.max(Math.min(currentNecessario, currentReservado) - currentSeparado, 0);
  const qtyDefault = !disableVolume && restanteVolume > 0 ? Math.round(restanteVolume * 10000) / 10000 : "";
  const bqm = ctx.currentItems?.[0]?.budget_quote_material || {};
  const cutC = Number(bqm.comprimento_necessario || 0), cutL = Number(bqm.largura_necessaria || 0);
  const pieces = Number(order?.production_order?.quantidade || order?.op?.quantidade || 0);
  const sheetsBlock = renderSeparationSheetsBlock(order.id, ctx.activeMaterialId, complete);
  // (2026-10-05) o almoxarifado nao corta (quem corta e a Caldeiraria): sem o aviso "Cortar N peca(s)"
  // (2026-11-10) pedido que usa so um pedaco de uma peca inteira (fracao de chapa/barra): explica o que fazer na separacao
  const fractionOfWhole = !sheetsBlock && /^(un|und|unid|p[cç]|ch|chapa|br|barra)$/i.test(String(unidade || "").trim()) && currentNecessario > 0 && currentNecessario % 1 !== 0;
  const cutHint = fractionOfWhole
    ? `<div class="separation-purchase-alert"><i data-lucide="scissors"></i><span><strong>Esta pedido usa só um pedaço (${formatNumber(currentNecessario)} ${escapeHtml(unidade)}) de uma peça inteira.</strong><small>Separe o pedaço (ou entregue a peça inteira para o corte) e gere o volume com a fração mostrada em "Falta separar"; o resto continua no estoque. Para chapas, o Plano de corte do orçamento reserva o pedaço exato na chapa (aba Chapas).</small></span></div>`
    : "";

  return `
    <div class="separation-material-head">
      ${material.tipo_material === "retalho" && (material.foto_url || material.desenho_url) ? `<img class="separation-scrap-photo" src="${escapeAttr(material.foto_url || material.desenho_url)}" alt="Foto da sobra">` : ""}
      <div class="separation-material-info">
        <strong>${escapeHtml(material.nome || "-")}</strong>${material.tipo_material === "retalho" ? `<span class="separation-scrap-badge">Sobra ${escapeHtml(material.codigo || "")} · ${escapeHtml([material.comprimento_maximo, material.largura_maxima, material.espessura].filter((v) => Number(v) > 0).map((v) => formatNumber(v)).join(" x "))} mm</span>` : ""}
      </div>
      <div class="separation-material-metrics">
        <div><span>Necessário</span><strong>${formatNumber(currentNecessario)} ${escapeHtml(unidade)}</strong></div>
        <div><span>Já separado</span><strong class="metric-success">${formatNumber(currentSeparado)} ${escapeHtml(unidade)}</strong></div>
        <div><span>Falta separar</span><strong class="${complete ? "metric-success" : "metric-danger"}">${formatNumber(falta)} ${escapeHtml(unidade)}</strong></div>
      </div>
    </div>
    ${cutHint}${sheetsBlock}
    ${currentAguardandoCompra > 0 ? `<div class="separation-purchase-alert"><i data-lucide="shopping-cart"></i><span><strong>${formatNumber(currentAguardandoCompra)} ${escapeHtml(unidade)} ${escapeHtml(purchaseSeparationLabel(currentPurchaseStatus).toLowerCase())}</strong><small>Há ${formatNumber(currentReservado)} ${escapeHtml(unidade)} reservados de ${formatNumber(currentNecessario)} ${escapeHtml(unidade)} necessários. Este item só será concluído quando todo o saldo estiver separado.</small>${retainedNoteHtml(ctx.activeMaterialId, unidade)}</span></div>` : ""}
    <div class="separation-quick-add${sheetsBlock ? " hidden" : ""}" data-necessario="${Math.min(currentNecessario, currentReservado)}" data-separado="${currentSeparado}" data-decimal="${decimal ? "1" : "0"}" data-unidade="${escapeAttr(unidade)}">
      <label class="separation-quick-add-qty">Quantidade deste volume
        <input id="separationQuickQty" class="tw-field" type="number" min="0" max="${Math.max(currentReservado - currentSeparado, 0)}" step="${decimal ? "any" : "1"}" placeholder="0" value="${qtyDefault}" autocomplete="off" ${disableVolume ? "disabled" : ""}>
      </label>
      <label class="separation-quick-add-tipo">Tipo
        <select id="separationQuickTipo" class="tw-field" ${disableVolume ? "disabled" : ""}>
          <option value="Pacote">Pacote</option>
          <option value="Volume">Volume</option>
          <option value="Caixa">Caixa</option>
          <option value="Saco">Saco</option>
        </select>
      </label>
      <button class="btn btn-primary" type="button" id="separationQuickAddBtn" data-order-id="${escapeAttr(order.id)}" data-material-id="${escapeAttr(ctx.activeMaterialId || "")}" data-step-id="${escapeAttr(currentStep?.required_step_id || "")}" data-permission="Separar material" ${disableVolume || !currentStep ? "disabled" : ""}><i data-lucide="package-plus"></i> Gerar volume</button>
    </div>
    <p id="separationQuickAddHint" class="separation-package-hint">${complete ? "Separação completa para este material." : availableComplete ? "Todo o saldo reservado já foi separado. Aguardando a entrada da compra." : ""}</p>
  `;
}

function renderSeparationVolumesPanel() {
  const ctx = separationDetailContext();
  if (ctx.state === "empty") {
    return `<div class="separation-detail-empty"><i data-lucide="package-search"></i><p>Os volumes separados vão aparecer aqui.</p></div>`;
  }
  if (ctx.state === "loading") {
    return `
      <div class="separation-detail-skeleton">
        <div class="skeleton-block"></div>
        <div class="skeleton-block"></div>
      </div>
    `;
  }

  const { activeMaterialId, allComplete, concludeDisabled } = ctx;
  const packages = (selectedSeparationPackages || []).filter((pkg) => pkg.material_id === activeMaterialId);
  const packageCards = packages.length
    ? packages.map((pkg) => renderSeparationPackageCard(pkg)).join("")
    : `<div class="separation-packages-empty">Nenhum volume gerado ainda para este material.</div>`;

  return `
    <div class="separation-packages-head">
      <h4>Volumes preparados</h4>
      <span class="muted-line">${packages.length} ${packages.length === 1 ? "volume" : "volumes"}</span>
    </div>
    <div class="separation-packages-list">${packageCards}</div>
    <footer class="separation-detail-footer">
      <button class="btn btn-primary" type="button" id="separationConcludeBtn" data-material-id="${escapeAttr(activeMaterialId || "")}" data-permission="Separar material" ${concludeDisabled ? "disabled" : ""}>${allComplete ? "Concluir separação do pedido" : "Concluir separação do item"}</button>
    </footer>
  `;
}

function renderSeparationPackageCard(pkg) {
  const cancelled = pkg.status === "cancelado";
  const reprints = (pkg.prints || []).filter((item) => item.tipo === "reimpressao").length;
  return `
    <article class="separation-package-card${cancelled ? " is-cancelled" : ""}">
      <div class="separation-package-icon"><i data-lucide="package"></i></div>
      <div class="separation-package-body">
        <div class="separation-package-head">
          <strong>${escapeHtml(pkg.tipo_embalagem || "Pacote")} ${String(pkg.sequencia).padStart(2, "0")}</strong>
          ${renderBadge(SEPARATION_LABEL_STATUS_LABELS[pkg.etiqueta_status] || pkg.etiqueta_status, labelStatusBadgeType(pkg.etiqueta_status))}
        </div>
        <span class="separation-package-qty">${formatNumber(pkg.quantidade)} ${escapeHtml(pkg.unidade || "")}</span>
        <span class="muted-line">Separado por: ${escapeHtml(pkg.criado_por?.nome || "-")}</span>
        <span class="muted-line">${formatDateTime(pkg.created_at)}${reprints ? ` • ${reprints} reimpressão(ões)` : ""}</span>
        ${cancelled && pkg.motivo_cancelamento ? `<span class="separation-package-cancel-reason">Cancelado: ${escapeHtml(pkg.motivo_cancelamento)}</span>` : ""}
      </div>
      ${cancelled ? "" : `
      <div class="separation-package-actions">
        <button class="icon-btn" type="button" data-print-separation-package="${escapeAttr(pkg.id)}" data-permission="Separar material" title="${pkg.etiqueta_status === "nao_impressa" ? "Imprimir etiqueta" : "Reimprimir etiqueta"}"><i data-lucide="printer"></i></button>
        <button class="icon-btn" type="button" data-edit-separation-package="${escapeAttr(pkg.id)}" data-permission="Separar material" title="Editar quantidade"><i data-lucide="pencil"></i></button>
        <button class="icon-btn" type="button" data-cancel-separation-package="${escapeAttr(pkg.id)}" data-permission="Separar material" title="Cancelar pacote"><i data-lucide="x-circle"></i></button>
      </div>`}
    </article>
  `;
}

function mostRecentSeparationResponsible() {
  const packages = [...(selectedSeparationPackages || [])].filter((pkg) => pkg.status === "ativo");
  if (!packages.length) return currentWarehouseUser()?.nome || null;
  packages.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  return packages[0]?.criado_por?.nome || currentWarehouseUser()?.nome || null;
}

function renderSeparationTabDOM() {
  if (!almoxEls.toseparateTab) return;
  almoxEls.toseparateTab.innerHTML = renderToSeparateTab();
  window.TecnoweldPermissions?.apply(almoxEls.toseparateTab);
  refreshIcons();
}

async function selectSeparationOrder(orderId) {
  if (!orderId) return;
  selectedSeparationOrderId = orderId;
  selectedSeparationMaterialId = null;
  separationPackagesLoading = true;
  renderSeparationTabDOM();
  try {
    selectedSeparationPackages = await TecnoweldAPI.listWarehouseSeparationPackages(orderId);
    await loadSeparationSheets(orderId);
  } catch (error) {
    console.error(error);
    selectedSeparationPackages = [];
    window.TecnoAlert?.error?.("Não foi possível carregar os detalhes desta pedido.", "Pedidos a separar");
  } finally {
    separationPackagesLoading = false;
  }
  const group = separationOrderGroups().find((item) => item.id === orderId);
  if (group) {
    const materialIds = [...new Set(group.items.map((item) => item.material_id))];
    const firstPending = materialIds.find((materialId) => {
      const necessario = group.items.filter((item) => item.material_id === materialId).reduce((sum, item) => sum + Number(item.quantidade_reservada || 0), 0);
      const separado = selectedSeparationPackages.filter((pkg) => pkg.material_id === materialId && pkg.status === "ativo").reduce((sum, pkg) => sum + Number(pkg.quantidade || 0), 0);
      return separado < necessario;
    });
    selectedSeparationMaterialId = firstPending || materialIds[0] || null;
  }
  renderSeparationTabDOM();
}

async function refreshSeparationOrder(orderId) {
  try {
    warehouseData = await TecnoweldAPI.listWarehouseData();
    materials = warehouseData.materiais || [];
  } catch (error) {
    console.error(error);
  }
  if (orderId) {
    try {
      selectedSeparationPackages = await TecnoweldAPI.listWarehouseSeparationPackages(orderId);
      await loadSeparationSheets(orderId);
    } catch (error) {
      console.error(error);
    }
  }
  renderSeparationTabDOM();
}

// (2026-10-04) chapas do plano de corte do pedido: o almoxarifado separa a chapa inteira; quem corta e a Caldeiraria
let separationSheets = { orderId: null, list: [] };
async function loadSeparationSheets(orderId) {
  try {
    const { data, error } = await TecnoweldAPI.getClient().rpc("sheet_order_sheets", { p_order: orderId });
    if (error) throw error;
    separationSheets = { orderId, list: data || [] };
  } catch (error) { console.error(error); separationSheets = { orderId, list: [] }; }
}
const SHEET_STATUS_LABEL = { disponivel: "No estoque", separada: "Separada para a Caldeiraria", corte_informado: "Corte informado · conferir", cortada: "Cortada" };
function renderSeparationSheetsBlock(orderId, materialId, complete = false) {
  if (separationSheets.orderId !== orderId) return "";
  const list = separationSheets.list.filter((sh) => sh.material_id === materialId || (sh.pecas || []).some((p) => p.op));
  if (!list.length) return "";
  const cards = list.map((sh) => {
    const others = (sh.outras_ops || []).filter(Boolean);
    const action = complete && sh.status === "disponivel" ? "" : sh.status === "disponivel"
      ? `<button class="btn btn-primary" type="button" data-sheet-separate="${escapeAttr(sh.id)}" data-sheet-code="${escapeAttr(sh.codigo)}" data-permission="Separar material"><i data-lucide="package-plus"></i> Separar chapa inteira</button>`
      : sh.status === "separada" ? `<button class="btn btn-secondary" type="button" data-sheet-unseparate="${escapeAttr(sh.id)}" data-sheet-code="${escapeAttr(sh.codigo)}" data-permission="Separar material">Devolver ao estoque</button>` : "";
    return `<article class="sep-sheet"><div class="sep-sheet-draw">${window.TwSheetPlan?.sheetSvg ? window.TwSheetPlan.sheetSvg(sh) : ""}</div><div class="sep-sheet-info">
      <strong>${escapeHtml(sh.codigo)} · ${escapeHtml(sh.material || "")}</strong>
      <span>${formatNumber(sh.comprimento_mm)} × ${formatNumber(sh.largura_mm)} mm · ${(sh.pecas || []).length} peça(s)</span>
      <span class="sep-sheet-status is-${escapeAttr(sh.status)}">${escapeHtml(SHEET_STATUS_LABEL[sh.status] || sh.status)}${sh.separada_em ? ` em ${new Date(sh.separada_em).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}` : ""}</span>
      ${others.length ? `<small>Também atende: ${escapeHtml(others.map((n) => `Pedido ${n}`).join(", "))} — o volume delas é gerado junto.</small>` : ""}
      ${Number(sh.pre_reservas) ? `<small class="sep-sheet-warn">${sh.pre_reservas} peça(s) de orçamento ainda não aprovado nesta chapa: não são cortadas.</small>` : ""}
      ${action}</div></article>`;
  }).join("");
  return `<section class="sep-sheets"><header><i data-lucide="layers"></i><div><strong>Plano de corte: separe a chapa inteira</strong><small>O almoxarifado não corta. A chapa vai inteira para a Caldeiraria, que bipa o código da chapa ao iniciar, corta e informa as sobras.</small></div></header>${cards}</section>`;
}
async function separateWholeSheet(button) {
  if (!requirePermission("Separar material")) return;
  const code = button.dataset.sheetCode;
  const ok = await (window.TecnoAlert?.confirm?.({ title: `Separar ${code}`, message: `A chapa ${code} sai inteira para a Caldeiraria e gera o volume de todas os pedidos do plano de corte dela. Identifique a chapa com o código ${code}.`, confirmText: "Separar chapa", cancelText: "Cancelar" }) ?? Promise.resolve(window.confirm(`Separar ${code}?`)));
  if (!ok) return;
  button.disabled = true;
  try {
    const { data, error } = await TecnoweldAPI.getClient().rpc("sheet_separate", { p_sheet: button.dataset.sheetSeparate });
    if (error) throw error;
    window.TecnoAlert?.success?.(`${code} separada. Volume gerado para: ${(data?.ops || []).map((n) => `Pedido ${n}`).join(", ")}.`, "Separação");
    await refreshSeparationOrder(selectedSeparationOrderId);
  } catch (error) {
    button.disabled = false;
    window.TecnoAlert?.error?.(error?.message || "Não foi possível separar a chapa.", "Separação");
  }
}
async function unseparateSheet(button) {
  const code = button.dataset.sheetCode;
  const motivo = await (window.TecnoAlert?.prompt?.({ title: `Devolver ${code} ao estoque`, message: "Os volumes da chapa são cancelados. Motivo:", confirmText: "Devolver" }) ?? Promise.resolve(window.prompt(`Motivo para devolver ${code}:`)));
  if (!motivo) return;
  try {
    const { error } = await TecnoweldAPI.getClient().rpc("sheet_unseparate", { p_sheet: button.dataset.sheetUnseparate, p_motivo: motivo });
    if (error) throw error;
    window.TecnoAlert?.success?.(`${code} voltou para o estoque.`, "Separação");
    await refreshSeparationOrder(selectedSeparationOrderId);
  } catch (error) { window.TecnoAlert?.error?.(error?.message || "Não foi possível devolver a chapa.", "Separação"); }
}

function selectSeparationMaterial(materialId) {
  selectedSeparationMaterialId = materialId;
  renderSeparationTabDOM();
}

function openSeparationPackageModal({ productionOrderId, materialId, packageId = null }) {
  if (!requirePermission("Separar material")) return;
  const group = separationOrderGroups().find((item) => item.id === productionOrderId);
  if (!group) return;
  const items = group.items.filter((item) => item.material_id === materialId);
  const material = items[0]?.material || {};
  const necessario = items.reduce((sum, item) => sum + Number(item.quantidade_reservada || 0), 0);
  const activePackages = (selectedSeparationPackages || []).filter((pkg) => pkg.material_id === materialId && pkg.status === "ativo");
  const editingPackage = packageId ? activePackages.find((pkg) => pkg.id === packageId) || null : null;
  const otherSeparado = activePackages.filter((pkg) => pkg.id !== packageId).reduce((sum, pkg) => sum + Number(pkg.quantidade || 0), 0);
  const restante = Math.max(necessario - otherSeparado, 0);
  const decimal = unitAllowsDecimal(material.unidade);

  const step = separationMaterialStep(productionOrderId, materialId);
  separationPackageContext = { productionOrderId, materialId, stepId: editingPackage?.required_step_id || step?.required_step_id || null, packageId: editingPackage?.id || null, necessario, otherSeparado, restante, unidade: material.unidade || "", decimal };

  almoxEls.separationPackageId.value = editingPackage?.id || "";
  almoxEls.separationPackageOrderId.value = productionOrderId;
  almoxEls.separationPackageMaterialId.value = materialId;
  almoxEls.separationPackageModalTitle.textContent = editingPackage ? `Editar ${(editingPackage.tipo_embalagem || "Pacote").toLowerCase()} ${String(editingPackage.sequencia).padStart(2, "0")}` : "Novo volume";
  almoxEls.separationPackageModalSubtitle.textContent = material.nome ? `Material: ${material.nome}` : "Informe a quantidade separada neste pacote.";
  almoxEls.separationPackageMaterialName.textContent = material.nome || "-";
  almoxEls.separationPackageNecessario.textContent = `${formatNumber(necessario)} ${material.unidade || ""}`.trim();
  almoxEls.separationPackageSeparado.textContent = `${formatNumber(otherSeparado)} ${material.unidade || ""}`.trim();
  almoxEls.separationPackageRestante.textContent = `${formatNumber(restante)} ${material.unidade || ""}`.trim();
  almoxEls.separationPackageRestante.classList.toggle("metric-danger", restante > 0);
  almoxEls.separationPackageQty.value = editingPackage ? editingPackage.quantidade : "";
  almoxEls.separationPackageQty.step = decimal ? "0.001" : "1";
  almoxEls.separationPackageQty.min = decimal ? "0.001" : "1";
  almoxEls.separationPackageTipo.value = editingPackage?.tipo_embalagem || "Pacote";
  renderSeparationPackageHint();
  openModal(almoxEls.separationPackageModal);
  window.setTimeout(() => almoxEls.separationPackageQty.focus(), 50);
}

function packageQuantityHint({ raw, restante, unidade, decimal }) {
  const qty = Number(raw);
  if (raw === "" || raw === null || raw === undefined) return { message: "", isError: false, isSuccess: false };
  if (!Number.isFinite(qty) || qty <= 0) return { message: "Informe uma quantidade válida, maior que zero.", isError: true, isSuccess: false };
  if (!decimal && !Number.isInteger(qty)) return { message: `A unidade "${unidade}" não aceita valores decimais.`, isError: true, isSuccess: false };
  const r4 = (v) => Math.round(Number(v || 0) * 10000) / 10000;
  // (2026-11-10) a tela mostra o restante com 3 casas (0,018) e o real pode ter 4 (0,0178): diferenca de arredondamento vale como "tudo"
  if (qty > restante && qty - restante < 0.001) return { message: "Este volume concluirá a separação deste material.", isError: false, isSuccess: true };
  if (r4(qty) > r4(restante)) return { message: `Quantidade maior que o saldo restante (${formatNumber(restante)} ${unidade}).`, isError: true, isSuccess: false };
  if (r4(qty) === r4(restante)) return { message: "Este volume concluirá a separação deste material.", isError: false, isSuccess: true };
  return { message: `Após este volume, faltarão ${formatNumber(restante - qty)} ${unidade}.`, isError: false, isSuccess: false };
}

function renderSeparationPackageHint() {
  if (!separationPackageContext || !almoxEls.separationPackageHint) return true;
  const raw = almoxEls.separationPackageQty.value;
  const { restante, unidade, decimal } = separationPackageContext;
  const { message, isError, isSuccess } = packageQuantityHint({ raw, restante, unidade, decimal });
  almoxEls.separationPackageHint.textContent = message;
  almoxEls.separationPackageHint.classList.toggle("is-error", isError);
  almoxEls.separationPackageHint.classList.toggle("is-success", isSuccess);
  return raw !== "" && !isError;
}

function renderSeparationQuickAddHint() {
  const qtyInput = document.getElementById("separationQuickQty");
  const wrap = qtyInput?.closest(".separation-quick-add");
  const hintEl = document.getElementById("separationQuickAddHint");
  if (!wrap || !hintEl || !qtyInput) return true;
  const necessario = Number(wrap.dataset.necessario || 0);
  const separado = Number(wrap.dataset.separado || 0);
  const restante = Math.max(necessario - separado, 0);
  const decimal = wrap.dataset.decimal === "1";
  const unidade = wrap.dataset.unidade || "";
  const raw = qtyInput.value;
  const { message, isError, isSuccess } = packageQuantityHint({ raw, restante, unidade, decimal });
  hintEl.textContent = message;
  hintEl.classList.toggle("is-error", isError);
  hintEl.classList.toggle("is-success", isSuccess);
  return raw !== "" && !isError;
}

async function handleQuickAddVolume(button) {
  if (!requirePermission("Separar material")) return;
  if (!renderSeparationQuickAddHint()) {
    const hint = document.getElementById("separationQuickAddHint")?.textContent || "Informe a quantidade deste volume.";
    window.TecnoAlert?.warning?.(hint, "Separação");
    document.getElementById("separationQuickQty")?.focus();
    return;
  }
  let qty = Number(document.getElementById("separationQuickQty")?.value);
  if (!qty) return;
  { // arredondamento da tela: nao manda mais do que falta
    const wrap = document.getElementById("separationQuickQty")?.closest(".separation-quick-add");
    const restante = Math.max(Number(wrap?.dataset.necessario || 0) - Number(wrap?.dataset.separado || 0), 0);
    if (restante > 0 && qty > restante && qty - restante < 0.001) qty = restante;
  }
  const tipo = document.getElementById("separationQuickTipo")?.value || "Pacote";
  const { orderId: productionOrderId, materialId, stepId } = button.dataset;
  if (!productionOrderId || !materialId) {
    window.TecnoAlert?.error?.("Não foi possível identificar o pedido ou o material selecionado.", "Separação");
    return;
  }
  button.disabled = true;
  try {
    const newPackageId = await TecnoweldAPI.createWarehouseSeparationPackage({ productionOrderId, materialId, stepId: stepId || null, tipoEmbalagem: tipo, quantidade: qty });
    await refreshSeparationOrder(productionOrderId);
    // Gerar volume ja imprime a etiqueta do volume criado.
    if (newPackageId) await printSeparationPackage(newPackageId, { autoPrint: true });
    else window.TecnoAlert?.success?.("Volume gerado.", "Separação");
  } catch (error) {
    console.error(error);
    window.TecnoAlert?.error?.(error?.message || "Não foi possível gerar o volume.", "Separação");
  } finally {
    button.disabled = false;
  }
}

async function saveSeparationPackage({ print }) {
  if (!separationPackageContext) return;
  if (!renderSeparationPackageHint()) {
    almoxEls.separationPackageQty.focus();
    return;
  }
  let qty = Number(almoxEls.separationPackageQty.value);
  if (separationPackageContext.restante > 0 && qty > separationPackageContext.restante && qty - separationPackageContext.restante < 0.001) qty = separationPackageContext.restante;
  const tipo = almoxEls.separationPackageTipo.value;
  const { productionOrderId, materialId, stepId, packageId } = separationPackageContext;
  almoxEls.saveSeparationPackageBtn.disabled = true;
  almoxEls.saveAndPrintSeparationPackageBtn.disabled = true;
  try {
    let newPackageId = packageId;
    if (packageId) {
      await TecnoweldAPI.updateWarehouseSeparationPackageQuantity(packageId, qty);
    } else {
      newPackageId = await TecnoweldAPI.createWarehouseSeparationPackage({ productionOrderId, materialId, stepId, tipoEmbalagem: tipo, quantidade: qty });
    }
    closeAllModals();
    await refreshSeparationOrder(productionOrderId);
    window.TecnoAlert?.success?.(packageId ? "Pacote atualizado." : "Pacote criado.", "Separação");
    if (print && newPackageId) await printSeparationPackage(newPackageId);
  } catch (error) {
    console.error(error);
    window.TecnoAlert?.error?.(error?.message || "Não foi possível salvar o pacote.", "Separação");
  } finally {
    almoxEls.saveSeparationPackageBtn.disabled = false;
    almoxEls.saveAndPrintSeparationPackageBtn.disabled = false;
  }
}

async function printSeparationPackage(packageId, { autoPrint = false } = {}) {
  if (!requirePermission("Separar material")) return;
  let pkg = (selectedSeparationPackages || []).find((item) => item.id === packageId);
  if (!pkg) return;
  try {
    const etiquetaId = await TecnoweldAPI.registerWarehouseSeparationPackagePrint(packageId);
    await refreshSeparationOrder(pkg.production_order_id);
    pkg = (selectedSeparationPackages || []).find((item) => item.id === packageId) || pkg;
    await openPackageLabelModal(pkg, etiquetaId);
    if (autoPrint) setTimeout(() => window.print(), 400);
  } catch (error) {
    console.error(error);
    window.TecnoAlert?.error?.(error?.message || "Não foi possível registrar a impressão.", "Etiqueta");
  }
}

async function openPackageLabelModal(pkg, etiquetaId) {
  const group = separationOrderGroups().find((item) => item.id === pkg.production_order_id);
  const material = group?.items.find((item) => item.material_id === pkg.material_id)?.material;
  const qrValue = etiquetaId || pkg.etiqueta_id || `PKG-${pkg.id}`;
  const [template, company] = await Promise.all([
    TecnoweldAPI.getLabelTemplate("almoxarifado"),
    TecnoweldAPI.getCompanyProfile().catch(() => null),
  ]);
  const data = {
    // (2026-11-10) nome compacto (sem "(mm)" e com "x" colado) para a medida/espessura caber; pacote leva a quantidade
    material_nome: abbreviateForLabel(String(material?.nome || pkg.material_codigo || "").replace(/\s*\(mm\)/gi, "").replace(/(\d)\s*x\s*(\d)/gi, "$1x$2").replace(/\s+/g, " "), 40),
    numero_op: pkg.op_numero || group?.opNumero || "-",
    quantidade: `${formatNumber(pkg.quantidade)} ${pkg.unidade || ""}`.trim(),
    pacote_numero: `${pkg.tipo_embalagem || "Pacote"} ${String(pkg.sequencia).padStart(2, "0")} · ${formatNumber(pkg.quantidade)} ${pkg.unidade || ""}`.trim(),
    setor_origem: "Almoxarifado",
    setor_destino: pkg.required_step?.setor?.nome || separationMaterialStep(pkg.production_order_id, pkg.material_id)?.setor_nome || "A definir",
    separado_por: pkg.criado_por?.nome || "-",
    data_hora: formatDateTime(pkg.created_at),
    codigo_manual: qrValue ? qrValue.slice(-8).toUpperCase() : "-",
    logo_url: company?.logo_url || null,
  };
  almoxEls.labelPrintBody.innerHTML = TecnoweldAPI.buildLabelBodyHtml(template, data);
  TecnoweldAPI.mountLabelDynamicCodes(almoxEls.labelPrintBody, qrValue);
  TecnoweldAPI.applyLabelPrintSize(almoxEls.labelPrintBody, template);
  fitLabelPreview(almoxEls.labelPrintBody);
  openModal(almoxEls.labelModal);
}

async function cancelSeparationPackageFlow(packageId) {
  if (!requirePermission("Separar material")) return;
  const pkg = (selectedSeparationPackages || []).find((item) => item.id === packageId);
  const confirmed = await window.TecnoAlert?.confirm?.({
    title: "Cancelar pacote",
    message: `Cancelar ${pkg ? `${pkg.tipo_embalagem || "Pacote"} ${String(pkg.sequencia).padStart(2, "0")}` : "este pacote"}? A quantidade voltará a ficar pendente para separação. Esta ação fica registrada no histórico.`,
    confirmText: "Cancelar pacote",
    cancelText: "Voltar",
    type: "warning",
  });
  if (!confirmed) return;
  try {
    await TecnoweldAPI.cancelWarehouseSeparationPackage(packageId, "Cancelado pelo usuário");
    window.TecnoAlert?.success?.("Pacote cancelado.", "Separação");
    await refreshSeparationOrder(pkg?.production_order_id || selectedSeparationOrderId);
  } catch (error) {
    console.error(error);
    window.TecnoAlert?.error?.(error?.message || "Não foi possível cancelar o pacote.", "Separação");
  }
}

async function handleConcludeSeparationClick(button) {
  if (!requirePermission("Separar material")) return;
  const materialId = button.dataset.materialId;
  const group = separationOrderGroups().find((item) => item.id === selectedSeparationOrderId);
  if (!group) return;
  const progressByOrder = new Map((warehouseData.separacaoProgresso || []).map((row) => [row.production_order_id, row]));
  const order = buildSeparationOrderSummary(group, progressByOrder.get(group.id));
  const allComplete = order.itensTotal > 0 && order.itensConcluidos >= order.itensTotal;

  if (allComplete) {
    button.disabled = true;
    try {
      const pending = group.items.filter((item) => item.status === "reservada");
      for (const item of pending) {
        await TecnoweldAPI.updateWarehouseReservationStatus(item.id, "separada");
      }
      window.TecnoAlert?.success?.(`Separação do pedido ${order.opNumero} concluída.`, "Pedidos a separar");
      await refreshSeparationOrder(selectedSeparationOrderId);
    } catch (error) {
      console.error(error);
      window.TecnoAlert?.error?.(error?.message || "Não foi possível concluir a separação do pedido.", "Pedidos a separar");
      button.disabled = false;
    }
    return;
  }

  const materialIds = [...new Set(group.items.map((item) => item.material_id))];
  const idx = materialIds.indexOf(materialId);
  const next = materialIds.slice(idx + 1).find((id) => {
    const necessario = separationMaterialQuantities(group, id).necessario;
    const separado = (selectedSeparationPackages || []).filter((pkg) => pkg.material_id === id && pkg.status === "ativo").reduce((sum, pkg) => sum + Number(pkg.quantidade || 0), 0);
    return separado < necessario;
  });
  window.TecnoAlert?.success?.("Material separado com sucesso.", "Pedidos a separar");
  selectedSeparationMaterialId = next || materialId;
  renderSeparationTabDOM();
}

function labelPurchaseStatus(status) {
  const labels = { pendente: "Pendente", cotacao: "Em cotação", comprada: "Comprada", recebida: "Recebida", cancelada: "Cancelada" };
  return labels[status] || status || "-";
}

function purchaseStatusBadgeType(status) {
  if (status === "comprada") return "success";
  if (status === "cotacao") return "warning";
  if (status === "cancelada") return "danger";
  return "neutral";
}

function renderPurchasingTab() {
  const pedidos = (purchaseRequests || []).filter((item) => ["pendente", "cotacao", "comprada"].includes(item.status));
  const link = `<a class="link-action" href="compras.html" target="_blank" rel="noopener">Abrir Central de Compras <i data-lucide="arrow-up-right"></i></a>`;
  if (!pedidos.length) {
    return renderTabEmptyState("shopping-cart", "Aguardando compra", "Itens em falta enviados para compras, aguardando cotação ou recebimento.", "Nenhum pedido de compra em aberto.") + link;
  }
  const rows = pedidos.map((item) => `
    <div class="purchasing-row">
      <div class="material-name"><strong>${escapeHtml(item.material?.nome || item.descricao_item || "-")}</strong><span>${escapeHtml(item.material?.codigo || "-")}</span></div>
      <span>${formatNumber(item.quantidade)} ${escapeHtml(item.unidade || "")}</span>
      ${renderBadge(labelPurchaseStatus(item.status), purchaseStatusBadgeType(item.status))}
    </div>
  `).join("");
  return `<section class="purchasing-grid">${rows}</section>${link}`;
}

function renderScrapsTab() {
  const scraps = materials.filter(isScrap);
  if (!scraps.length) {
    return `
      <section class="tw-card almox-placeholder-card">
        <i data-lucide="recycle"></i>
        <h2>Materiais reaproveitáveis</h2>
        <p>Nenhuma sobra reaproveitável cadastrada no momento.</p>
      </section>
    `;
  }
  return `<section class="scrap-cards-grid">${scraps.map(renderScrapCard).join("")}</section>`;
}

// Formato em que o insumo e estocado (C × L × E), exibido fora do nome.
function stockFormatLabel(item) {
  const parts = [
    ["C", item?.comprimento_maximo],
    ["L", item?.largura_maxima],
    ["E", item?.espessura],
    ["Ø", item?.diametro],
    ["Parede", item?.parede],
    ["Øint", item?.diametro_interno],
    ["Øext", item?.diametro_externo],
  ].filter(([, value]) => Number(value) > 0);
  return parts.length ? `${parts.map(([tag, value]) => `${tag} ${formatNumber(value)}`).join(" × ")} mm` : "";
}

function renderScrapCard(item) {
  const dimensionParts = [item.largura_maxima, item.comprimento_maximo, item.espessura]
    .map((value) => Number(value || 0))
    .filter((value) => value > 0);
  const dimensions = dimensionParts.length
    ? dimensionParts.map((value) => formatNumber(value)).join(" x ") + " mm"
    : "-";
  const tipoLabel = item.tipo_material === "sucata" ? "Sucata" : "Reaproveitável";
  return `
    <article class="scrap-card">
      ${renderThumb(item.foto_url, item.nome)}
      <div class="scrap-card-body">
        <header>
          <strong class="material-code">${escapeHtml(item.codigo)}</strong>
          ${renderBadge(tipoLabel, item.tipo_material === "sucata" ? "warning" : "neutral")}
        </header>
        <h3>${escapeHtml(item.nome)}</h3>
        ${item.material_referencia ? `<span class="subtext">${escapeHtml(item.material_referencia)}</span>` : ""}
        <div class="scrap-card-meta">
          <span>${formatNumber(item.quantidade_disponivel || 0)} ${escapeHtml(item.unidade || "")}</span>
          <span>${escapeHtml(dimensions)}</span>
          <span>${escapeHtml(item.localizacao || "-")}</span>
        </div>
      </div>
    </article>
  `;
}

function renderMovementsTab() {
  if (!movements.length) {
    return renderTabEmptyState("arrow-right-left", "Movimentações", "Histórico consolidado de entradas, saídas, reservas, devoluções e contagens.", "Nenhuma movimentação registrada.");
  }
  const rows = movements.map((item) => `${labelMovementType(item.tipo)} • ${item.material?.nome || "Material"} • ${formatNumber(item.quantidade)}`);
  return `<section class="recent-movements-grid">${rows.map((row) => `<article class="recent-movement-card"><h3>${escapeHtml(row)}</h3></article>`).join("")}</section>`;
}

// Tipos de movimento do historico (rotulo + cor do selo).
const HISTORY_KINDS = {
  recebimento: { label: "Recebimento NF", tone: "success" },
  retorno_sobra: { label: "Retorno de sobra", tone: "success" },
  entrada_manual: { label: "Entrada manual", tone: "success" },
  consumo: { label: "Consumo na produção", tone: "neutral" },
  saida_op: { label: "Saída não planejada", tone: "warning" },
  saida_manual: { label: "Saída manual", tone: "warning" },
  retirada: { label: "Retirada", tone: "purple" },
  devolucao_retirada: { label: "Devolução de retirada", tone: "success" },
  devolucao_producao: { label: "Devolução da produção", tone: "success" },
  ajuste: { label: "Ajuste de contagem", tone: "warning" },
  contagem: { label: "Contagem", tone: "neutral" },
  separacao: { label: "Separação", tone: "purple" },
  reserva: { label: "Reserva (PCP)", tone: "neutral" },
  rnc_bloqueio: { label: "Bloqueado em RNC", tone: "danger" },
  rnc_liberada: { label: "Liberado da RNC", tone: "success" },
  rnc_devolvida: { label: "Devolvido ao fornecedor", tone: "warning" },
  pre_reserva: { label: "Pré-reserva", tone: "neutral" },
  pre_reserva_ajuste: { label: "Pré-reserva ajustada", tone: "neutral" },
  pre_reserva_aprovada: { label: "Pré-reserva aprovada", tone: "success" },
  pre_reserva_recusa: { label: "Liberada: não aprovado", tone: "warning" },
  pre_reserva_vencida: { label: "Liberada: proposta vencida", tone: "warning" },
  pre_reserva_cancelada: { label: "Pré-reserva cancelada", tone: "neutral" },
};

function movementHistoryKind(item) {
  const origem = String(item.origem || "");
  // registro de pre-reserva (nao mexe no saldo)
  if (item.tipo === "reserva") return HISTORY_KINDS[origem] ? origem : "pre_reserva";
  if (item.tipo === "rnc") return origem === "rnc_devolvida" ? "rnc_devolvida" : "rnc_bloqueio";
  if (origem === "rnc_liberada") return "rnc_liberada";
  if (item.tipo === "entrada") {
    if (item.recebimento_nfe_id || /^(recebimento|compra)/i.test(origem)) return "recebimento";
    if (origem === "producao") return "devolucao_producao";
    if (origem === "devolucao_ferramenta") return "devolucao_retirada";
    if (origem === "retorno_sobra" || item.material?.tipo_material === "retalho") return "retorno_sobra";
    return "entrada_manual";
  }
  if (item.tipo === "saida") {
    if (origem === "consumo_op" || origem === "producao") return "consumo";
    if (origem === "retirada_ferramenta") return "retirada";
    if (origem === "saida_nao_planejada") return "saida_op";
    return "saida_manual";
  }
  if (item.tipo === "ajuste" || origem === "contagem_aprovada") return "ajuste";
  if (item.tipo === "devolucao") return "devolucao_retirada";
  return item.tipo === "contagem" ? "contagem" : "entrada_manual";
}

function historyEmployee(person) {
  if (!person?.id && !person?.nome) return null;
  return employees.find((item) => item.id === person.id) || person;
}

function unifiedWarehouseHistory() {
  const rows = [];
  const materialById = (id) => materials.find((item) => item.id === id);
  movements.forEach((item) => {
    const kind = movementHistoryKind(item);
    const material = materialById(item.material_id) || item.material || {};
    const isIn = item.tipo === "entrada" || item.tipo === "devolucao";
    if (item.tipo === "reserva" || item.tipo === "rnc") {
      rows.push({
        date: item.created_at, kind, material: item.material?.nome || material.nome || "Material removido",
        quantity: Number(item.quantidade || 0), sign: "", unit: item.unidade || material.unidade || "", before: null, after: null,
        address: material.localizacao || "", reference: item.op_numero ? `Pedido ${item.op_numero}` : item.documento || "",
        responsible: historyEmployee(item.responsavel), systemLabel: "Sistema",
        details: [[item.tipo === "rnc" ? "Nota fiscal" : "Orçamento", item.documento], ["Detalhe", item.observacao]],
      });
      return;
    }
    const isOut = item.tipo === "saida";
    const nf = kind === "recebimento" ? [item.documento, item.fornecedor].filter(Boolean).join(" · ") : "";
    rows.push({
      date: item.created_at, kind, material: item.material?.nome || material.nome || "Material removido",
      quantity: Number(item.quantidade || 0), sign: isIn ? "+" : isOut ? "−" : "", unit: item.unidade || material.unidade || "",
      before: item.estoque_anterior, after: item.estoque_atual,
      address: item.localizacao || material.localizacao || "",
      reference: item.op_numero ? `Pedido ${item.op_numero}${item.setor?.nome ? ` · ${item.setor.nome}` : ""}` : nf || item.documento || "",
      responsible: historyEmployee(item.responsavel) || historyEmployee(item.solicitante),
      photo: kind === "retorno_sobra" ? material.foto_url || item.material?.foto_url : null,
      details: [
        ["Documento", item.documento], ["Fornecedor", item.fornecedor], ["Chave NF-e", item.chave_nfe],
        ["Retirado por", kind === "retirada" ? item.solicitante?.nome : null], ["Setor", item.setor?.nome],
        ["Valor", item.valor_total ? formatCurrency(item.valor_total) : null], ["Observação", item.observacao],
      ],
    });
  });
  // Separacao: cada volume gerado (quem separou e quando)
  separationHistory.forEach((pkg) => {
    const cancelled = pkg.status === "cancelado";
    rows.push({
      date: pkg.created_at, kind: "separacao", material: pkg.warehouse_materials?.nome || pkg.material_codigo || "Material",
      quantity: Number(pkg.quantidade || 0), sign: "", unit: pkg.unidade || "", before: null, after: null,
      address: pkg.warehouse_materials?.localizacao || "",
      reference: `Pedido ${pkg.op_numero || "-"}${pkg.required_step?.setor?.nome ? ` · ${pkg.required_step.setor.nome}` : ""}`,
      responsible: historyEmployee(pkg.criado_por), cancelled,
      details: [
        ["Volume", `${pkg.tipo_embalagem || "Pacote"} ${String(pkg.sequencia || "").padStart(2, "0")}`], ["Etiqueta", pkg.etiqueta_id],
        ["Etapa", pkg.required_step?.nome], ["Bipado na produção", pkg.confirmado_em ? formatDateTime(pkg.confirmado_em) : "Ainda não"],
        ["Cancelado", cancelled ? [formatDateTime(pkg.cancelado_em), pkg.cancelado_por?.nome, pkg.motivo_cancelamento].filter(Boolean).join(" · ") : null],
      ],
    });
  });
  (warehouseData.reservas || []).filter((item) => ["aprovada", "reservada"].includes(item.status)).forEach((item) => rows.push({
    date: item.updated_at || item.created_at, kind: "reserva", material: item.material?.nome || "Material removido",
    quantity: Number(item.quantidade_reservada || 0), sign: "", unit: item.material?.unidade || "", before: null, after: null,
    address: materialById(item.material_id)?.localizacao || "",
    reference: item.op_numero || item.production_order?.numero ? `Pedido ${item.op_numero || item.production_order.numero}` : item.budget_quote?.numero ? `Orçamento #${item.budget_quote.numero}` : "",
    responsible: null, systemLabel: "Sistema (PCP)",
    details: [["Situação", labelReservationStatus(item.status)], ["Uso previsto", item.data_prevista_uso ? formatDateOnly(item.data_prevista_uso) : null]],
  }));
  // Retiradas antigas (antes da baixa automatica gerar movimento proprio)
  const loanMovements = movements.filter((item) => item.origem === "retirada_ferramenta");
  loans.forEach((loan) => (loan.itens || []).forEach((item) => {
    const loanTime = new Date(loan.created_at).getTime();
    if (loanMovements.some((mov) => mov.material_id === item.material_id && Math.abs(new Date(mov.created_at).getTime() - loanTime) < 60000)) return;
    rows.push({
      date: loan.created_at, kind: "retirada", material: item.material?.nome || "Material removido",
      quantity: Number(item.quantidade_retirada || 0), sign: "−", unit: item.unidade || item.material?.unidade || "", before: null, after: null,
      address: materialById(item.material_id)?.localizacao || "", reference: loan.numero ? `Retirada ${loan.numero}` : "",
      responsible: historyEmployee(loan.responsavel_entrega) || historyEmployee(loan.retirado_por),
      details: [["Retirado por", loan.retirado_por?.nome], ["Situação", item.status === "devolvido" ? "Devolvida" : "Em uso"], ["Devolver até", loan.previsao_devolucao ? formatDateOnly(loan.previsao_devolucao) : null], ["Observação", loan.observacoes]],
    });
  }));
  (warehouseData.contagens || []).forEach((item) => rows.push({
    date: item.created_at, kind: "contagem", material: item.material?.nome || "Material removido",
    quantity: Number(item.quantidade_contada || 0), sign: "", unit: item.material?.unidade || "",
    before: item.quantidade_sistema ?? null, after: null, address: materialById(item.material_id)?.localizacao || "",
    reference: Number(item.divergencia || 0) === 0 ? "Sem divergência" : `Divergência ${formatNumber(item.divergencia)}`,
    responsible: historyEmployee(item.responsavel),
    details: [["Justificativa", item.justificativa], ["Ajuste", item.ajuste_status]],
  }));
  return rows.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
}

function filteredHistoryRows() {
  const term = normalizeText(almoxEls.unifiedHistorySearch?.value || "");
  const type = historySelectedType;
  const from = almoxEls.historyFrom?.value ? new Date(`${almoxEls.historyFrom.value}T00:00:00`).getTime() : null;
  const to = almoxEls.historyTo?.value ? new Date(`${almoxEls.historyTo.value}T23:59:59`).getTime() : null;
  return unifiedWarehouseHistory().filter((item) => {
    const time = new Date(item.date || 0).getTime();
    if (type && item.kind !== type) return false;
    if ((from && time < from) || (to && time > to)) return false;
    return !term || normalizeText([HISTORY_KINDS[item.kind]?.label, item.material, item.reference, item.address, item.responsible?.nome, ...item.details.map((d) => d[1])].join(" ")).includes(term);
  });
}

function historyDayLabel(value) {
  const day = new Date(value);
  const key = (d) => d.toLocaleDateString("pt-BR");
  const today = new Date();
  const yesterday = new Date(Date.now() - 86400000);
  const date = key(day);
  if (date === key(today)) return `Hoje · ${date}`;
  if (date === key(yesterday)) return `Ontem · ${date}`;
  return `${day.toLocaleDateString("pt-BR", { weekday: "long" })} · ${date}`;
}

function historyResponsibleHtml(item) {
  if (!item.responsible) return `<span class="history-owner muted-line">${escapeHtml(item.systemLabel || "Sistema")}</span>`;
  return `<span class="history-owner">${employeeAvatarMarkup(item.responsible, "history-avatar")}<span>${escapeHtml(item.responsible.nome || "-")}</span></span>`;
}

function renderHistoryTypes() {
  const list = document.getElementById('historyTypes'); if (!list) return;
  const rows = unifiedWarehouseHistory();
  const totals = new Map(); rows.forEach(row => totals.set(row.kind, (totals.get(row.kind) || 0) + 1));
  const kinds = new Map(Object.entries(HISTORY_KINDS).map(([key,kind]) => [key,kind.label]));
  totals.forEach((_,key) => { if (!kinds.has(key)) kinds.set(key,key); });
  const option = (key,label,total) => `<button type="button" class="history-type-option${historySelectedType === key ? ' is-selected' : ''}" data-history-type="${escapeAttr(key)}" aria-pressed="${historySelectedType === key}"><span>${escapeHtml(label)}</span><small>${total}</small></button>`;
  list.innerHTML = option('', 'Todos os movimentos', rows.length) + [...kinds].map(([key,label]) => option(key,label,totals.get(key) || 0)).join('');
}

function renderUnifiedHistory() {
  renderHistoryTypes();
  if (almoxEls.historyLoadedInfo) almoxEls.historyLoadedInfo.textContent = `${movements.length} movimentação(ões) carregada(s)${historyState.done ? " · fim do histórico" : ""}`;
  if (!almoxEls.unifiedHistoryBody) return;
  historyRowsCache = filteredHistoryRows();
  let lastDay = "";
  almoxEls.unifiedHistoryBody.innerHTML = historyRowsCache.map((item) => {
    const day = historyDayLabel(item.date);
    const dayRow = day !== lastDay ? `<tr class="history-day-row"><td colspan="8">${escapeHtml(day)}</td></tr>` : "";
    lastDay = day;
    const kind = HISTORY_KINDS[item.kind] || { label: item.kind, tone: "neutral" };
    const balance = item.before != null && item.after != null ? `${formatNumber(item.before)} → <strong>${formatNumber(item.after)}</strong>` : '<span class="muted-line">—</span>';
    return `${dayRow}<tr class="history-row${item.cancelled ? " is-cancelled" : ""}">
      <td>${escapeHtml(new Date(item.date).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }))}</td>
      <td>${renderBadge(item.cancelled ? `${kind.label} (cancelada)` : kind.label, item.cancelled ? "neutral" : kind.tone)}</td>
      <td title="${escapeAttr(item.material)}">${escapeHtml(item.material)}</td>
      <td class="history-qty ${item.sign === "+" ? "is-in" : item.sign ? "is-out" : ""}">${item.sign}${formatNumber(item.quantity)} ${escapeHtml(item.unit)}</td>
      <td>${balance}</td>
      <td>${item.address ? `<span class="material-code">${escapeHtml(item.address)}</span>` : '<span class="muted-line">—</span>'}</td>
      <td title="${escapeAttr(item.reference)}">${escapeHtml(item.reference || "—")}</td>
      <td>${historyResponsibleHtml(item)}</td>
    </tr>`;
  }).join("") || `<tr><td colspan="8" class="empty-state">Nenhum registro encontrado no histórico.</td></tr>`;
  const labels=['Hora','Movimento','Material','Quantidade','Saldo','Endereço','Pedido / referência','Responsável'];
  almoxEls.unifiedHistoryBody.querySelectorAll('.history-row').forEach(row=>[...row.cells].forEach((cell,i)=>cell.dataset.colLabel=labels[i]));
  refreshIcons();
}

// Detalhe de uma linha do historico (observacao, documento, foto, justificativa...).
function openHistoryDetail(item) {
  if (!item) return;
  const kind = HISTORY_KINDS[item.kind] || { label: item.kind };
  const facts = [
    ["Data", formatDateTime(item.date)],
    ["Quantidade", `${item.sign}${formatNumber(item.quantity)} ${item.unit}`],
    ["Saldo", item.before != null && item.after != null ? `${formatNumber(item.before)} → ${formatNumber(item.after)} ${item.unit}` : null],
    ["Endereço", item.address], ["Pedido / referência", item.reference],
    ["Responsável", item.responsible?.nome || item.systemLabel || "Sistema"],
    ...item.details,
  ].filter(([, value]) => value !== null && value !== undefined && value !== "");
  almoxEls.stockAllocationTitle.textContent = kind.label;
  almoxEls.stockAllocationSubtitle.textContent = item.material;
  almoxEls.stockAllocationList.innerHTML = `<dl class="history-detail">${facts.map(([label, value]) => `<dt>${escapeHtml(label)}</dt><dd>${escapeHtml(String(value))}</dd>`).join("")}</dl>${item.photo ? `<img class="history-detail-photo" src="${escapeAttr(item.photo)}" alt="Foto">` : ""}`;
  openModal(almoxEls.stockAllocationModal);
}

function exportHistoryCsv() {
  const rows = filteredHistoryRows();
  if (!rows.length) return window.TecnoAlert?.info?.("Nada para exportar com esses filtros.", "Histórico");
  const cell = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;
  const lines = [["Data", "Movimento", "Material", "Quantidade", "Unidade", "Saldo antes", "Saldo depois", "Endereço", "Pedido / referência", "Responsável", "Observação"].map(cell).join(";")];
  rows.forEach((item) => lines.push([
    formatDateTime(item.date), HISTORY_KINDS[item.kind]?.label || item.kind, item.material,
    `${item.sign === "−" ? "-" : ""}${String(item.quantity).replace(".", ",")}`, item.unit,
    item.before ?? "", item.after ?? "", item.address, item.reference, item.responsible?.nome || item.systemLabel || "Sistema",
    item.details.find(([label]) => label === "Observação")?.[1] || "",
  ].map(cell).join(";")));
  const blob = new Blob([`\ufeff${lines.join("\r\n")}`], { type: "text/csv;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `historico-almoxarifado-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

// ------------------------------------------------------------ Enderecos
function renderLocationsTab() {
  const rows=warehouseLocations.map(loc=>{
    const setor=sectors.find(s=>s.id===loc.setor_id)?.nome||loc.setor_nome||'Sem setor';
    return `<tr><td><strong>${escapeHtml(loc.codigo)}</strong></td><td>${escapeHtml(setor)}</td><td><button type="button" class="address-status ${loc.ativo?'is-active':'is-inactive'}" data-location-toggle="${escapeAttr(loc.id)}" aria-label="${loc.ativo?'Desativar':'Reativar'} ${escapeAttr(loc.codigo)}">${loc.ativo?'Ativo':'Inativo'}</button></td></tr>`;
  }).join('');
  return `<table class="address-manager-table"><thead><tr><th>Código</th><th>Setor</th><th>Situação</th></tr></thead><tbody>${rows||'<tr><td colspan="3">Nenhum endereço cadastrado.</td></tr>'}</tbody></table>`;
}

function openLocationCreateModal() {
  closeAllModals();
  const form = document.getElementById("locationCreateForm");
  form?.reset();
  document.getElementById('locationCreateSector').innerHTML='<option value="">Sem setor</option>'+sectors.map(s=>`<option value="${escapeAttr(s.id)}">${escapeHtml(s.nome)}</option>`).join('');
  openModal(document.getElementById("locationCreateModal"));
  setTimeout(() => document.getElementById("locationCreateCode")?.focus(), 30);
}

async function submitLocationCreate(event) {
  event.preventDefault();
  const code = document.getElementById("locationCreateCode").value.trim();
  if (!code) return;
  const button = document.querySelector('#locationCreateModal [type="submit"]');
  if (button) button.disabled = true;
  try {
    const criado=await TecnoweldAPI.createWarehouseLocation(code, code, '', document.getElementById('locationCreateSector').value||null);
    if(document.getElementById('locationCreateStatus').value==='inativo')await TecnoweldAPI.updateWarehouseLocation(criado.id,criado.nome,criado.descricao,false);
    closeAllModals();
    await loadWarehouse();
    switchTab("stock");
    openModal(document.getElementById('almoxAddressManagement'));
    window.TecnoAlert?.success?.(`Endereço ${code.toUpperCase()} cadastrado.`, "Endereços");
  } catch (error) {
    window.TecnoAlert?.error?.(error?.message || "Não foi possível cadastrar o endereço.", "Endereços");
  } finally {
    if (button) button.disabled = false;
  }
}

async function handleLocationsTabEvent(event) {
  try {
    if (event.type === "click" && event.target.closest("[data-location-add]")) {
      openLocationCreateModal();
      return;
    } else if (event.type === "change" && event.target.matches("[data-material-location]")) {
      event.target.disabled=true;
      await TecnoweldAPI.setMaterialLocation(event.target.dataset.materialLocation, event.target.value || null);
      window.TecnoAlert?.success?.("Endereço do material atualizado.", "Endereços");
    } else if (event.type === "click" && event.target.closest("[data-location-toggle]")) {
      const loc = warehouseLocations.find((item) => item.id === event.target.closest("[data-location-toggle]").dataset.locationToggle);
      if (!loc) return;
      await TecnoweldAPI.updateWarehouseLocation(loc.id, loc.nome, loc.descricao, !loc.ativo);
    } else if (event.type === "click" && event.target.closest("[data-location-edit]")) {
      const loc = warehouseLocations.find((item) => item.id === event.target.closest("[data-location-edit]").dataset.locationEdit);
      if (!loc) return;
      const name = window.prompt(`Nome do endereço ${loc.codigo}:`, loc.nome || "");
      if (name === null) return;
      const description = window.prompt(`Descrição do endereço ${loc.codigo}:`, loc.descricao || "");
      if (description === null) return;
      await TecnoweldAPI.updateWarehouseLocation(loc.id, name, description, loc.ativo);
    } else {
      return;
    }
    await loadWarehouse();
    switchTab("stock");
  } catch (error) {
    if(event.target.matches("[data-material-location]"))renderMaterialsTable();
    window.TecnoAlert?.error?.(error?.message || "Não foi possível salvar.", "Endereços");
  }
}

// ------------------------------------------------------------ Historico com periodo e "carregar mais"
async function loadMoreHistory(reset = false) {
  if (historyState.loading) return;
  const from = almoxEls.historyFrom?.value || null;
  const to = almoxEls.historyTo?.value || null;
  if (reset) historyState = { rows: [], offset: 0, done: false, loading: false };
  if (!historyState.rows) historyState = { rows: [...movements], offset: movements.length, done: false, loading: false };
  historyState.loading = true;
  if (almoxEls.historyLoadMoreBtn) almoxEls.historyLoadMoreBtn.disabled = true;
  try {
    const page = await TecnoweldAPI.listWarehouseMovementsPage({ from, to, offset: historyState.offset, limit: 50 });
    historyState.rows.push(...page);
    historyState.offset += page.length;
    historyState.done = page.length < 50;
    movements = historyState.rows;
    renderUnifiedHistory();
  } catch (error) {
    window.TecnoAlert?.error?.(error?.message || "Não foi possível carregar o histórico.", "Histórico");
  } finally {
    historyState.loading = false;
    if (almoxEls.historyLoadMoreBtn) almoxEls.historyLoadMoreBtn.disabled = historyState.done;
  }
}

function renderCountTab() {
  if (!materials.length) {
    return renderTabEmptyState("clipboard-check", "Contagem mensal às cegas", "O saldo do sistema só é comparado depois de salvar.", "Nenhum material para contagem.");
  }
  const latestByMaterial = new Map();
  (warehouseData.contagens || []).forEach((count) => {
    const materialId = count.material_id || count.material?.id;
    if (!materialId || latestByMaterial.has(materialId)) return;
    latestByMaterial.set(materialId, count);
  });
  // Tres cards: Para contar | Divergencias | Bateu
  const inCycle = materials.filter((item) => !isScrap(item) || Number(item.quantidade_disponivel || 0) > 0);
  const toCount = inCycle.filter((item) => countCycle.get(item.id)?.liberado !== false);
  const counted = inCycle.filter((item) => countCycle.get(item.id)?.liberado === false);
  const groups = new Map();
  toCount.forEach((item) => {
    const key = item.localizacao || "";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  });
  const keys = [...groups.keys()].sort((a, b) => (a ? 0 : 1) - (b ? 0 : 1) || a.localeCompare(b, "pt-BR", { numeric: true }));
  const rows = keys.map((key) => groups.get(key).map((item) => {
    const latest = latestByMaterial.get(item.id);
    return `
    <tr class="blind-count-row" data-material-id="${escapeAttr(item.id)}" data-material-search="${escapeAttr(normalizeText(`${item.codigo} ${item.nome} ${item.localizacao || ""}`))}">
      <td><strong>${escapeHtml(item.codigo)} - ${escapeHtml(item.nome)}</strong><span class="muted-line">${escapeHtml(item.unidade || "-")} · ${item.localizacao ? `<span class="count-row-address">${escapeHtml(item.localizacao)}</span>` : "Sem endereço"}</span></td>
      <td data-count-label="Contado"><input class="tw-field count-qty-input" type="number" placeholder="Qtd." min="0" step="0.001"></td>
      <td data-count-label="Observação"><input class="tw-field count-obs-input" placeholder="Observação"></td>
      <td class="count-last-value" data-count-label="Última contagem">${latest ? `<strong>${formatMonthLabel(latest.created_at)}</strong><span class="muted-line">${escapeHtml(latest.responsavel?.nome || "-")}</span>` : '<span class="muted-line">Nunca contado</span>'}</td>
    </tr>`;
  }).join("")).join("");

  const statusOf = (count) => {
    if (!count) return ["-", "neutral"];
    if (Number(count.divergencia || 0) === 0) return ["Bateu", "success"];
    return ({ aguardando_justificativa: ["Justificar", "danger"], pendente: ["Aguardando aprovação", "warning"], aprovado: ["Ajuste aprovado", "success"], recusado: ["Ajuste recusado", "neutral"] })[count.ajuste_status] || ["Divergência", "warning"];
  };
  const doneRow = ({ item, count }) => {
    const unit = escapeHtml(item.unidade || "");
    const diff = Number(count?.divergencia || 0);
    const [label, tone] = statusOf(count);
    return `<div class="count-div-row count-done-row">
      <span class="count-div-material"><strong>${escapeHtml(item.nome)}</strong><small>${escapeHtml([item.codigo, count?.created_at && formatDateOnly(count.created_at), count?.responsavel?.nome].filter(Boolean).join(" · "))}</small></span>
      <span class="count-div-num is-system"><strong>${formatNumber(count?.quantidade_sistema ?? 0)}</strong><small>${unit}</small></span>
      <span class="count-div-num is-counted"><strong>${formatNumber(count?.quantidade_contada ?? 0)}</strong><small>${unit}</small></span>
      <span class="count-div-num ${diff === 0 ? "is-match" : diff < 0 ? "is-missing" : "is-surplus"}"><strong>${diff > 0 ? "+" : ""}${formatNumber(diff)}</strong><small>${diff === 0 ? "ok" : diff < 0 ? "falta" : "sobra"}</small></span>
      <span>${renderBadge(label, tone)}</span>
    </div>`;
  };
  const doneHead = `<div class="count-div-row count-div-head count-done-row"><span>Material</span><span>Sistema</span><span>Contado</span><span>Diferença</span><span>Situação</span></div>`;
  const countedData = counted.map((item) => ({ item, count: latestByMaterial.get(item.id) })).sort((a, b) => String(a.item.nome).localeCompare(String(b.item.nome), "pt-BR"));
  const matchedData = countedData.filter((row) => Number(row.count?.divergencia || 0) === 0);
  // divergencias ja decididas (aprovadas/recusadas); as abertas ficam no painel de justificar/aprovar
  const decidedDiff = countedData.filter((row) => Number(row.count?.divergencia || 0) !== 0 && !["aguardando_justificativa", "pendente"].includes(row.count?.ajuste_status));
  const card = (tone, title, total, hint, body) => `<section class="count-card is-${tone}">${tone==='history'?`<header class="count-card-head"><h3>${title}</h3></header>`:''}${body}</section>`;
  const cycleTotal = toCount.length + counted.length;
  const cycleStart = countCycleState?.iniciado_em ? new Date(countCycleState.iniciado_em).getTime() : 0;
  const toJustifyInCycle = (warehouseData.contagens || []).filter((c) => c.ajuste_status === "aguardando_justificativa" && new Date(c.created_at).getTime() >= cycleStart).length;
  const concludeBlock = !cycleTotal ? "Nenhum material para contar."
    : toCount.length ? `Libera quando todos os materiais tiverem contagem neste ciclo (faltam ${toCount.length}).`
    : toJustifyInCycle ? `Justifique as ${toJustifyInCycle} divergência(s) antes de concluir.` : "";
  const todoBody = `
        ${toCount.length ? `<div class="almox-table-wrap reference-recent-table" id="countBlindListWrap">
          <table class="almox-table count-single-table">
            <thead><tr><th><label class="count-material-search"><span>Material</span><input id="countScanInput" class="tw-field" placeholder="Bipe o material" autocomplete="off" aria-label="Bipe os materiais"></label><span id="countScanFeedback" class="count-scan-feedback" role="status"></span></th><th>Contado</th><th>Observação</th><th>Última contagem</th></tr></thead>
            <tbody id="countBlindList">${rows}</tbody>
          </table>
        </div>
` : `<p class="count-card-empty">Nada a contar agora. O próximo ciclo libera primeiro os materiais de contagem mais antiga.</p>`}<footer class="reference-form-actions count-todo-foot">
          ${toCount.length?'<button id="countUndoScanBtn" class="btn btn-secondary" type="button" title="Desfazer ultima leitura">Desfazer</button><button id="saveCountBtn" class="btn btn-primary" type="button">Salvar contagem</button>':''}
          <button class="btn btn-primary" type="button" data-count-conclude ${concludeBlock?`disabled title="${escapeAttr(concludeBlock)}"`:''}>Concluir contagem</button>
        </footer>`;
  const justifyCount = (warehouseData.contagens || []).filter(c => c.ajuste_status === "aguardando_justificativa").length;
  const pendingCount = (warehouseData.contagens || []).filter(c => c.ajuste_status === "pendente").length;
  const diffBody = `${renderCountAdjustmentsPanel('justify') || '<p class="count-card-empty">Nenhuma divergência para justificar.</p>'}${decidedDiff.length ? `<div class="count-done-block"><h4>Já decididas</h4><div class="count-div-table">${doneHead}${decidedDiff.map(doneRow).join("")}</div></div>` : ''}`;
  const pendingBody = renderCountAdjustmentsPanel('pending') || '<p class="count-card-empty">Nenhum ajuste aguardando aprovação.</p>';
  const okBody = matchedData.length ? `<div class="count-done-block"><div class="count-div-table">${doneHead}${matchedData.map(doneRow).join("")}</div></div>` : `<p class="count-card-empty">Nenhum material conferido sem diferença ainda.</p>`;
  return `
    <div class="count-cards">
      <section class="count-card is-todo">${todoBody}</section>
      <section class="count-cards-pair count-card is-diff count-results">
        <nav class="count-result-tabs" role="tablist" aria-label="Resultados da contagem">
          ${[['divergencias','Divergências',justifyCount],['aprovacao','Aguardando aprovação',pendingCount],['bateu','Bateu',matchedData.length]].map(([key,label,total]) => `<button type="button" id="count-result-tab-${key}" role="tab" aria-controls="count-result-${key}" aria-selected="${countResultsTab === key}" tabindex="${countResultsTab === key ? 0 : -1}" data-count-result-tab="${key}">${label}<span>${total}</span></button>`).join('')}
        </nav>
        <div class="count-result-panels">
          ${[['divergencias',diffBody],['aprovacao',pendingBody],['bateu',okBody]].map(([key,body]) => `<div class="count-result-panel" id="count-result-${key}" role="tabpanel" aria-labelledby="count-result-tab-${key}" tabindex="0" data-count-result-panel="${key}" ${countResultsTab === key ? '' : 'hidden'}>${body}</div>`).join('')}
        </div>
      </section>
      ${card("history", "Contagens realizadas", countCycleHistory.length, "Cada ciclo concluído fica salvo com o relatório para consulta e reimpressão.", countCycleHistory.length ? `<div class="almox-table-wrap"><table class="almox-table count-history-table"><thead><tr><th>Contagem</th><th>Período</th><th>Concluída por</th><th>Data de conclusão</th><th>Materiais</th><th>Divergências</th><th>Resultado</th><th></th></tr></thead><tbody>${countCycleHistory.map(renderCountCycleHistoryRow).join("")}</tbody></table></div>` : `<p class="count-card-empty">Nenhuma contagem concluída ainda.</p>`)}
    </div>
  `;
}

function renderCountCycleHistoryRow(cycle) {
  const matches = employees.filter(person => person.nome && normalizeText(person.nome) === normalizeText(cycle.concluido_por || ''));
  const person = employees.find(person => cycle.concluido_por_id && person.id === cycle.concluido_por_id)
    || (matches.length === 1 ? matches[0] : null)
    || { nome: cycle.concluido_por || '-' };
  const date = new Date(cycle.concluido_em);
  const time = Number.isNaN(date.getTime()) ? '' : date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  return `<tr>
    <td data-col-label="Contagem"><strong>Nº ${escapeHtml(String(cycle.numero))}</strong></td>
    <td data-col-label="Período">${escapeHtml(formatDateOnly(cycle.iniciado_em))} a ${escapeHtml(formatDateOnly(cycle.concluido_em))}</td>
    <td data-col-label="Concluída por">${historyResponsibleHtml({ responsible: person })}</td>
    <td data-col-label="Data de conclusão">${escapeHtml(formatDateOnly(cycle.concluido_em))}<span class="muted-line">${escapeHtml(time)}</span></td>
    <td data-col-label="Materiais">${escapeHtml(String(cycle.materiais))}</td>
    <td data-col-label="Divergências">${Number(cycle.divergencias) ? renderBadge(`${cycle.divergencias} divergência(s)`, 'warning') : renderBadge('Tudo bateu', 'success')}</td>
    <td data-col-label="Resultado">${formatCurrency(Number(cycle.resultado || 0))}</td>
    <td data-col-label="Relatório"><button class="btn btn-secondary" type="button" data-count-last-report="${escapeAttr(cycle.id)}">Relatório</button></td>
  </tr>`;
}

// Ciclo de contagem: cada material so volta a ser contado depois que todo o estoque foi contado.
function renderCountCycleBar() {
  const rows = [...countCycle.values()];
  if (!rows.length) return "";
  const done = rows.filter((row) => !row.liberado).length;
  const pending = rows.length - done;
  const pct = Math.round(done / rows.length * 100);
  return `<div class="count-cycle-bar"><div><strong>Ciclo de contagem: ${done} de ${rows.length} materiais contados</strong><span>${pending ? `Faltam ${pending} material(is). Os já contados só liberam para nova contagem quando o ciclo fechar.` : "Todos contados: o próximo ciclo começa pelos de contagem mais antiga."}</span></div><i><b style="width:${pct}%"></b></i></div>`;
}

// Divergencias: quem contou justifica; outra pessoa (permissao "Ajustar saldo") aprova ou recusa.
function renderCountAdjustmentsPanel(mode) {
  const all = warehouseData.contagens || [];
  const toJustify = all.filter((item) => mode !== "pending" && item.ajuste_status === "aguardando_justificativa");
  const pending = all.filter((item) => mode !== "justify" && item.ajuste_status === "pendente");
  if (!toJustify.length && !pending.length) return "";
  // Uma linha por material: Sistema | Contado | Diferenca em colunas proprias, cada uma com sua cor.
  const numbers = (item) => {
    const unit = escapeHtml(item.material?.unidade || "");
    const diff = Number(item.divergencia || 0);
    return `<span class="count-div-num is-system"><strong>${formatNumber(item.quantidade_sistema)}</strong><small>${unit}</small></span>
      <span class="count-div-num is-counted"><strong>${formatNumber(item.quantidade_contada)}</strong><small>${unit}</small></span>
      <span class="count-div-num ${diff < 0 ? "is-missing" : "is-surplus"}"><strong>${diff > 0 ? "+" : ""}${formatNumber(diff)}</strong><small>${diff < 0 ? "falta" : "sobra"}</small></span>`;
  };
  const material = (item, extra = "") => `<span class="count-div-material"><strong>${escapeHtml(item.material?.nome || "Material")}</strong><small>${escapeHtml([item.material?.codigo, extra].filter(Boolean).join(" · "))}</small></span>`;
  const head = (last) => `<div class="count-div-row count-div-head"><span>Material</span><span>Sistema</span><span>Contado</span><span>Diferença</span><span>${last}</span><span></span></div>`;
  return `
    <section class="count-adjustments-panel">
      ${toJustify.length ? `<div class="count-div-table">${head("Justificativa")}${toJustify.map((item) => `
        <div class="count-div-row" data-count-item="${escapeAttr(item.id)}">
          ${material(item)}${numbers(item)}
          <select class="tw-field" data-count-justification aria-label="Justificativa de ${escapeAttr(item.material?.nome||'material')}" ${!countJustifications.length?'disabled':''}>
            <option value="">${countJustificationsError?'Falha ao carregar justificativas':countJustifications.length?'Selecione a justificativa':'Cadastre em Parâmetros → Almoxarifado'}</option>
            ${countJustifications.map(texto=>`<option value="${escapeAttr(texto)}">${escapeHtml(texto)}</option>`).join('')}
          </select>
          <button class="btn btn-secondary" type="button" data-count-justify="${escapeAttr(item.id)}" ${!countJustifications.length?'disabled':''}>Enviar para aprovação</button>
        </div>`).join("")}</div>` : ""}
      ${pending.length ? `<div class="count-div-table">${head("Justificativa · observação")}${pending.map((item) => `
        <div class="count-div-row" data-count-item="${escapeAttr(item.id)}">
          ${material(item, item.responsavel?.nome ? `contado por ${item.responsavel.nome}` : "")}${numbers(item)}
          <span class="count-div-review"><em title="${escapeAttr(item.justificativa || "")}">${escapeHtml(item.justificativa || "Sem justificativa")}</em><input class="tw-field" data-count-review-note placeholder="Observação (obrigatória para recusar)"></span>
          ${countApproval?.almoxarifado === false ? `<span class="count-approval-wait">Aguardando aprovação${(countApproval.aprovadores_almoxarifado || []).length ? ` de ${escapeHtml(countApproval.aprovadores_almoxarifado.join(", "))}` : ""}</span>` : `<span class="count-adjustment-actions"><button class="btn btn-secondary" type="button" data-count-review="reject" data-id="${escapeAttr(item.id)}">Recusar</button><button class="btn btn-primary" type="button" data-count-review="approve" data-id="${escapeAttr(item.id)}">Aprovar</button></span>`}
        </div>`).join("")}</div>` : ""}
    </section>
  `;
}

// Resolve o codigo bipado: primeiro pelo codigo/QR do material (rapido), depois pelo banco (codigos de barras vinculados).
async function resolveCountScan(code) {
  const upper = code.trim().toUpperCase();
  const alnum = (value) => String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const local = materials.find((item) => String(item.codigo || "").toUpperCase() === upper || String(item.qr_code || "").toUpperCase() === upper)
    || materials.find((item) => alnum(code) && (alnum(item.codigo) === alnum(code) || alnum(item.qr_code) === alnum(code)));
  if (local) return { material: local, units: 1 };
  const scan = await TecnoweldAPI.resolveWarehouseScan(code);
  const material = scan?.material_id ? materials.find((item) => item.id === scan.material_id) : null;
  if (!material) return null;
  return { material, units: Number(scan.units_per_scan || 1) || 1 };
}

function applyCountScan(materialId, delta) {
  const row = document.querySelector(`#countBlindList .blind-count-row[data-material-id="${CSS.escape(materialId)}"]`);
  if (!row || row.dataset.countLocked) return null;
  const input = row.querySelector(".count-qty-input");
  const next = Math.max(0, Number(input.value || 0) + delta);
  input.value = next ? String(Number(next.toFixed(3))) : "";
  row.classList.add("count-scanned-row");
  row.classList.remove("count-scan-flash");
  void row.offsetWidth;
  if (delta > 0) row.classList.add("count-scan-flash");
  row.scrollIntoView({ block: "nearest" });
  return next;
}

async function handleCountScan(input) {
  const code = input.value.trim();
  input.value = "";
  if (!code) return;
  const feedback = document.getElementById("countScanFeedback");
  try {
    const found = await resolveCountScan(code);
    if (!found) {
      if (feedback) feedback.textContent = `Código "${code}" não encontrado.`;
      window.TecnoAlert?.info?.(`O código "${code}" não corresponde a nenhum material.`, "Contagem");
      return;
    }
    if (countCycle.get(found.material.id)?.liberado === false) {
      if (feedback) feedback.textContent = `${found.material.nome}: já contado neste ciclo.`;
      window.TecnoAlert?.info?.(`"${found.material.nome}" já foi contado neste ciclo. Ele só pode ser contado de novo depois que todo o estoque for contado.`, "Contagem");
      return;
    }
    const total = applyCountScan(found.material.id, found.units);
    if (total === null) return;
    countScanLog.push({ materialId: found.material.id, units: found.units });
    if (feedback) feedback.textContent = `${found.material.codigo || ""} · ${found.material.nome}: ${formatNumber(total)} ${found.material.unidade || ""} contado(s) · ${countScanLog.length} leitura(s)`;
  } catch (error) {
    if (feedback) feedback.textContent = error?.message || "Leitura não registrada.";
  } finally {
    input.focus();
  }
}

function undoCountScan() {
  const last = countScanLog.pop();
  const feedback = document.getElementById("countScanFeedback");
  if (!last) { if (feedback) feedback.textContent = "Nenhuma leitura para desfazer."; return; }
  const material = materials.find((item) => item.id === last.materialId);
  const total = applyCountScan(last.materialId, -last.units);
  if (feedback) feedback.textContent = `Leitura desfeita · ${material?.nome || "Material"}: ${formatNumber(total || 0)} ${material?.unidade || ""}`;
  document.getElementById("countScanInput")?.focus();
}

function selectCountResultsTab(key) {
  if (!["divergencias", "aprovacao", "bateu"].includes(key)) return;
  countResultsTab = key;
  almoxEls.countTab.querySelectorAll('[data-count-result-tab]').forEach(button => {
    const selected = button.dataset.countResultTab === key;
    button.setAttribute('aria-selected', String(selected)); button.tabIndex = selected ? 0 : -1;
  });
  almoxEls.countTab.querySelectorAll('[data-count-result-panel]').forEach(panel => { panel.hidden = panel.dataset.countResultPanel !== key; });
}

async function handleCountAdjustmentClick(event) {
  const tab = event.target.closest('[data-count-result-tab]');
  if (tab) { selectCountResultsTab(tab.dataset.countResultTab); return; }

  if (event.target.id === "countUndoScanBtn") return undoCountScan();
  const justify = event.target.closest("[data-count-justify]");
  const review = event.target.closest("[data-count-review]");
  if (!justify && !review) return;
  const row = event.target.closest("[data-count-item]");
  const button = justify || review;
  button.disabled = true;
  try {
    const me = currentWarehouseUser();
    if (justify) {
      const text = row.querySelector("[data-count-justification]")?.value || "";
      if(!countJustifications.includes(text))throw new Error('Selecione uma justificativa cadastrada em Parâmetros → Almoxarifado.');
      await TecnoweldAPI.justifyWarehouseCountItem(justify.dataset.countJustify, text);
      const count = (warehouseData.contagens || []).find((c) => c.id === justify.dataset.countJustify);
      if (count) { count.ajuste_status = "pendente"; count.justificativa = text.trim(); }
      window.TecnoAlert?.success?.("Justificativa enviada. Outra pessoa precisa aprovar o ajuste.", "Contagem");
    } else {
      const approve = review.dataset.countReview === "approve";
      const note = row.querySelector("[data-count-review-note]")?.value || "";
      await TecnoweldAPI.reviewWarehouseCountAdjustment(review.dataset.id, approve, note);
      const count = (warehouseData.contagens || []).find((c) => c.id === review.dataset.id);
      if (count) {
        count.ajuste_status = approve ? "aprovado" : "recusado";
        count.analise_observacao = note.trim() || null;
        count.analisado_por = me?.id || null;
        const material = materials.find((m) => m.id === (count.material_id || count.material?.id));
        if (approve && material) material.quantidade_disponivel = Number(material.quantidade_disponivel || 0) + Number(count.divergencia || 0);
      }
      window.TecnoAlert?.success?.(approve ? "Ajuste aprovado. O estoque foi corrigido." : "Ajuste recusado. O estoque não mudou.", "Contagem");
    }
    rerenderCountTab();
  } catch (error) {
    window.TecnoAlert?.error?.(error?.message || "Não foi possível concluir.", "Contagem");
    button.disabled = false;
  }
}

function updateCountRowResult(row) {
  if (!row) return;
  const input = row.querySelector(".count-qty-input");
  const differenceCell = row.querySelector(".count-difference-value");
  const statusCell = row.querySelector(".count-status-value");
  if (!input || !differenceCell || !statusCell) return;
  if (input.value === "") {
    differenceCell.textContent = "—";
    statusCell.innerHTML = renderBadge("A contar", "neutral");
    row.classList.remove("count-divergent-row", "count-match-row");
    return;
  }
  const difference = Number(input.value) - Number(row.dataset.systemQuantity || 0);
  const matches = Math.abs(difference) < 0.000001;
  differenceCell.textContent = `${difference > 0 ? "+" : ""}${formatNumber(difference)}`;
  statusCell.innerHTML = renderBadge(matches ? "Conferido" : "Divergência", matches ? "success" : "warning");
  row.classList.toggle("count-match-row", matches);
  row.classList.toggle("count-divergent-row", !matches);
}

// Redesenha so a aba Contagem (sem recarregar o almoxarifado inteiro).
function rerenderCountTab() {
  almoxEls.countTab.innerHTML = renderCountTab();
  refreshIcons();
  setTimeout(() => document.getElementById("countScanInput")?.focus(), 30);
}

function formatMonthLabel(dateValue) {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("pt-BR", { month: "short", year: "numeric" });
}

function filterCountBlindList() {
  const term = normalizeText(document.getElementById("countSearchInput")?.value || "");
  document.querySelectorAll("#countBlindList .blind-count-row").forEach((row) => {
    row.classList.toggle("hidden", Boolean(term) && !row.dataset.materialSearch.includes(term));
  });
}

async function saveMonthlyCount() {
  const rows = [...document.querySelectorAll("#countBlindList .blind-count-row")].filter((row) => {
    const qty = row.querySelector(".count-qty-input")?.value;
    return qty !== "" && qty !== null && qty !== undefined;
  });
  if (!rows.length) return window.TecnoAlert?.info?.("Informe a quantidade encontrada em pelo menos um item.", "Contagem mensal");
  const saveBtn = document.getElementById("saveCountBtn");
  if (saveBtn) saveBtn.disabled = true;
  try {
    const result = await TecnoweldAPI.registerWarehouseCount(rows.map((row) => ({
      material_id: row.dataset.materialId,
      quantidade_contada: row.querySelector(".count-qty-input")?.value,
      observacao: row.querySelector(".count-obs-input")?.value?.trim() || null,
    })));
    const divergent = (result || []).filter((item) => Number(item.divergencia) !== 0).length;
    countScanLog = [];
    const me = currentWarehouseUser();
    const now = new Date().toISOString();
    warehouseData.contagens = [
      ...(result || []).map((r) => ({
        id: r.id, material_id: r.material_id, material: { id: r.material_id, codigo: r.codigo, nome: r.material_nome, unidade: r.unidade },
        quantidade_sistema: r.quantidade_sistema, quantidade_contada: r.quantidade_contada, divergencia: r.divergencia,
        ajuste_status: r.ajuste_status, justificativa: null, created_at: now, responsavel: me ? { id: me.id, nome: me.nome } : null,
      })),
      ...(warehouseData.contagens || []),
    ];
    (result || []).forEach((r) => countCycle.set(r.material_id, { material_id: r.material_id, ultima_contagem: now, liberado: false }));
    rerenderCountTab();
    window.TecnoAlert?.success?.(divergent
      ? `Contagem registrada. ${divergent} item(ns) com divergência: justifique para enviar à aprovação.`
      : "Contagem registrada. Tudo conferido com o sistema.", "Contagem mensal");
  } catch (error) {
    window.TecnoAlert?.error?.(error?.message || "Não foi possível salvar a contagem.", "Almoxarifado");
  } finally {
    if (saveBtn) saveBtn.disabled = false;
  }
}

function renderReservationsTab() {
  const reservas = warehouseData.reservas || [];
  if (!reservas.length) {
    return renderTabEmptyState("package-check", "Reservas", "Estrutura pronta para bloquear saldo simultâneo por pedido.", "Nenhuma reserva registrada.");
  }
  const rows = reservas.map((item) => `
    <div class="reservation-row">
      <strong>${escapeHtml(item.op_numero)}</strong>
      <span>${escapeHtml(item.material?.nome || "-")}</span>
      <span>${formatNumber(item.quantidade_reservada)} ${escapeHtml(item.material?.unidade || "")}</span>
      <span>${escapeHtml(item.setor?.nome || "-")}</span>
      ${renderBadge(item.status || "Reservada", "neutral")}
    </div>
  `).join("");
  return `<section class="reservations-grid">${rows}</section>`;
}

function renderTabEmptyState(icon, title, text, emptyMessage) {
  return `
    <section class="tw-card almox-placeholder-card">
      <i data-lucide="${icon}"></i>
      <h2>${escapeHtml(title)}</h2>
      <p>${escapeHtml(text)}</p>
    </section>
    <div class="empty-state">${escapeHtml(emptyMessage)}</div>
  `;
}

function filteredMaterials() {
  const term = normalizeText(searchTerm);
  const category = almoxEls.categoryFilter?.value || "";

  return materials.filter((item) => {
    if (category && item.categoria !== category) return false;
    const searchable = normalizeText(`${item.codigo} ${item.nome} ${item.especificacao} ${item.categoria} ${item.localizacao} ${item.lote} ${item.fornecedor} ${item.op_origem}`);
    return !term || searchable.includes(term);
  });
}

function applyIndicatorFilter(action) {
  if (action === "minimum") {
    searchTerm = "";
    almoxEls.globalSearch.value = "";
    if (almoxEls.stockStatusFilter) almoxEls.stockStatusFilter.value = "Todos os status";
    if (almoxEls.categoryFilter) almoxEls.categoryFilter.value = "";
    materials = warehouseData.materiais.filter((item) => Number(item.estoque_minimo || 0) > 0 && Number(item.quantidade_disponivel || 0) <= Number(item.estoque_minimo || 0));
  } else if (action === "borrowed") {
    materials = warehouseData.materiais.filter((item) => normalizeText(`${item.categoria} ${item.status}`).includes("emprest"));
  } else {
    materials = warehouseData.materiais || [];
  }
  currentPage = 1;
  selectedMaterial = materials[0] || null;
  renderWarehouse();
}

function switchTab(tab) {
  if(tab==="locations")tab="stock";
  const recebidos = tab === "receipts";
  if(recebidos) tab = "receiving";
  if(tab!=='toseparate')window.AlmoxMateriaisProducao?.suspender?.();
  activeTab = tab;
  document.querySelectorAll(".almox-tabs > button[data-tab]").forEach((button) => button.classList.toggle("active", button.dataset.tab === tab));
  document.querySelectorAll(".almox-tab-panel").forEach((panel) => panel.classList.add("hidden"));
  if (tab !== "receiving" && almoxEls.goodsReceiptCenter && !almoxEls.goodsReceiptCenter.classList.contains("hidden")) {
    almoxEls.goodsReceiptCenter.classList.add("hidden");
    activeNfeReceipt = null;
  }
  const panelMap = {
    stock: "stockTab",
    "material-workspace": "materialWorkspaceTab",
    "movement-workspace": "movementWorkspaceTab",
    "withdrawals-workspace": "withdrawalsWorkspaceTab",
    "users-reference": "usersReferenceTab",
    movements: "movementsTab",
    count: "countTab",
    toseparate: "toseparateTab",
    locations: "locationsTab",
    purchases: "purchasesTab",
    receiving: "receivingTab",
    receipts: "receivingTab",
    epi: "epiTab",
    "supplier-links": "supplierLinksTab",
    "customer-items": "customerItemsTab"
  };
  document.getElementById(panelMap[tab])?.classList.remove("hidden");
  document.querySelectorAll("[data-tab-tools]").forEach((tools) => tools.classList.toggle("hidden", tools.dataset.tabTools !== tab));
  if (tab === "material-workspace") mountMaterialWorkspace();
  if (tab === "movement-workspace") mountMovementWorkspace("entry");
  if (tab === "withdrawals-workspace") renderWithdrawalsWorkspace();
  if (tab === "count") setTimeout(() => document.getElementById("countScanInput")?.focus(), 30);
  if (tab === "users-reference") renderReferenceUsers();
  if (tab === "sheets") window.AlmoxSheets?.load();
  if (tab === "epi") window.AlmoxEpi?.load();
  if (tab === "supplier-links") window.AlmoxSupplierLinks?.load();
  if (tab === "customer-items") { window.TwCustomerItems?.mountList(document.getElementById("customerItemsTab"), "almox"); updateCustomerItemsBadge(); }
  // Acervo: Recebimento, Solicitações de compra e Pedidos a separar usam os módulos daqui (almox-acervo.js / almox-producao.mjs).
  if (tab === "receiving" || tab === "receipts") window.AlmoxAcervo?.abrirRecebimento(recebidos?'recebimentos':'pedidos');
  if (tab === "purchases") window.AlmoxAcervo?.abrirSolicitacoes();
  if (tab === "toseparate") window.AlmoxAcervo?.abrirSeparacao();
  refreshIcons();
}

function handleWarehouseActionShortcut(event) {
  if (!["F2", "F3", "F4"].includes(event.key)) return;
  if (event.target.closest('input, textarea, select, [contenteditable="true"]')) return;
  if (document.querySelector(".almox-modal:not(.hidden), dialog[open]")) return;
  const button = event.key === "F2" ? almoxEls.entryBtn : event.key === "F3" ? almoxEls.exitBtn : almoxEls.withdrawalBtn;
  if (!button || button.disabled || button.hidden || button.offsetParent === null) return;
  event.preventDefault();
  button.click();
}

function dockModalCard(modal, host) {
  if (!modal || !host) return;
  const card = modal.querySelector(".almox-modal-card") || document.querySelector(`.almox-inline-card[data-origin-modal="${modal.id}"]`);
  if (!card) return;
  modal.classList.add("hidden");
  modal.setAttribute("aria-hidden", "true");
  card.classList.add("almox-inline-card");
  card.dataset.originModal = modal.id;
  host.replaceChildren(card);
  document.body.classList.remove("modal-open");
  refreshIcons();
}

async function mountMaterialWorkspace() {
  await Promise.all([populateMaterialCategoryOptions(), loadMaterialTypes()]);
}

async function populateMaterialCategoryOptions() {
  if (!almoxEls.refMaterialCategory) return;
  try {
    materialCategories = await TecnoweldAPI.listMaterialCategories();
  } catch (error) {
    console.error("[Tecnoweld] Falha ao carregar categorias de insumos.", error);
    materialCategories = [];
  }
  renderMaterialCategoryOptions();
  renderMaterialCategorySelection();
}

function capitalizeWords(value) {
  return value.replace(/(^|\s)(\p{L})/gu, (match, prefix, letter) => prefix + letter.toUpperCase());
}

function enforceFieldCasing(input, transformFn) {
  if (!input) return;
  const cursor = input.selectionStart;
  const transformed = transformFn(input.value);
  if (transformed === input.value) return;
  input.value = transformed;
  if (cursor != null) input.setSelectionRange(cursor, cursor);
}

const CATEGORY_VISUALS = [
  [/mat[eé]ria.?prima/i, { icon: "layers", color: "#6d28d9" }],
  [/consum[ií]vel/i, { icon: "droplets", color: "#2563eb" }],
  [/ferramenta/i, { icon: "wrench", color: "var(--tw-orange, #d97706)" }],
  [/epi/i, { icon: "shield", color: "var(--tw-red, #e30613)" }],
  [/limpeza/i, { icon: "sparkles", color: "#0e7490" }],
  [/escrit[oó]rio/i, { icon: "briefcase", color: "#475569" }],
  [/manuten[cç][aã]o/i, { icon: "settings", color: "#b45309" }],
  [/el[eé]trica/i, { icon: "zap", color: "#ca8a04" }],
  [/pintura/i, { icon: "paintbrush", color: "#be185d" }],
  [/embalagem/i, { icon: "package", color: "var(--tw-green, #15803d)" }],
];

function categoryVisual(name) {
  const match = CATEGORY_VISUALS.find(([pattern]) => pattern.test(name || ""));
  return match ? match[1] : { icon: "shapes", color: "#64748b" };
}

function renderMaterialCategoryOptions() {
  if (!almoxEls.refMaterialCategoryOptions) return;
  const selected = almoxEls.refMaterialCategory.value;
  almoxEls.refMaterialCategoryOptions.innerHTML = materialCategories
    .map((category) => {
      const visual = categoryVisual(category.nome);
      return `<button type="button" role="option" class="category-picker-option" style="--option-color:${escapeAttr(visual.color)}" data-category="${escapeAttr(category.nome)}" aria-selected="${category.nome === selected}"><span class="category-picker-icon"><i data-lucide="${visual.icon}"></i></span><strong>${escapeHtml(category.nome)}</strong></button>`;
    })
    .join("") || `<p>Nenhuma categoria cadastrada.</p>`;
  refreshIcons();
}

function renderMaterialCategorySelection() {
  const value = almoxEls.refMaterialCategory?.value || "";
  const visual = categoryVisual(value);
  if (almoxEls.refMaterialCategoryLabel) almoxEls.refMaterialCategoryLabel.textContent = value || "Selecione";
  if (almoxEls.refMaterialCategoryIcon) {
    almoxEls.refMaterialCategoryIcon.style.setProperty("--option-color", visual.color);
    almoxEls.refMaterialCategoryIcon.innerHTML = `<i data-lucide="${visual.icon}"></i>`;
  }
  refreshIcons();
}

function toggleMaterialCategoryPicker() {
  if (!almoxEls.refMaterialCategoryDropdown) return;
  const willOpen = almoxEls.refMaterialCategoryDropdown.classList.contains("hidden");
  closeAllPersonPickers();
  almoxEls.refMaterialCategoryDropdown.classList.toggle("hidden", !willOpen);
  almoxEls.refMaterialCategoryTrigger?.setAttribute("aria-expanded", String(willOpen));
  if (willOpen) renderMaterialCategoryOptions();
}

function closeMaterialCategoryPicker() {
  almoxEls.refMaterialCategoryDropdown?.classList.add("hidden");
  almoxEls.refMaterialCategoryTrigger?.setAttribute("aria-expanded", "false");
}

function handleMaterialCategorySelection(event) {
  const option = event.target.closest("[data-category]");
  if (!option) return;
  almoxEls.refMaterialCategory.value = option.dataset.category;
  renderMaterialCategorySelection();
  closeMaterialCategoryPicker();
}

function updateGeneratedMaterialName() {
  if (!almoxEls.refMaterialName) return;
  // (2026-10-02) as medidas do tipo entram no nome no formato 3000(mm) x 2000(mm): cada medida diferente e um codigo (BRR-001-02)
  const complemento = almoxEls.refMaterialComplemento?.value.trim();
  // diametro sai como Ø50(mm), parede como parede 3(mm), interno/externo como Øint 40(mm) / Øext 50(mm)
  const medidas = [[almoxEls.refMaterialComprimento, ""], [almoxEls.refMaterialLargura, ""], [almoxEls.refMaterialEspessura, ""], [almoxEls.refMaterialDiametro, "Ø"], [almoxEls.refMaterialParede, "parede "], [almoxEls.refMaterialDiametroInterno, "Øint "], [almoxEls.refMaterialDiametroExterno, "Øext "]]
    .filter(([el]) => el && !el.closest("label")?.hidden && Number(el.value) > 0).map(([el, pre]) => pre + String(Number(el.value)).replace(".", ","));
  const parts = [
    selectedMaterialType()?.nome || "",
    almoxEls.refMaterialEspecificacao?.value.trim(),
    medidas.length ? medidas.map((m) => `${m}(mm)`).join(" x ") : "",
    complemento,
  ].filter(Boolean);
  almoxEls.refMaterialName.value = parts.join(" ");
}

// Tipos de item (Parametros -> Almoxarifado): lista fechada, codigo = SIGLA-001 por tipo
let materialTypes = [];
const selectedMaterialType = () => materialTypes.find((t) => t.id === almoxEls.refMaterialTipo?.value) || null;
async function loadMaterialTypes() {
  try {
    const { data, error } = await TecnoweldAPI.getClient().from("warehouse_material_types").select("id,nome,sigla,ativo,requer_comprimento,requer_largura,requer_espessura,requer_diametro,requer_parede,requer_diametro_interno,requer_diametro_externo,unidade").eq("ativo", true).order("nome");
    if (error) throw error;
    materialTypes = data || [];
  } catch (error) {
    console.warn("[Almoxarifado] tipos de item", error);
    materialTypes = [];
  }
  renderMaterialTypeOptions();
}
function renderMaterialTypeOptions() {
  const select = almoxEls.refMaterialTipo;
  if (!select) return;
  const current = select.value;
  select.innerHTML = materialTypes.length
    ? `<option value="">Selecione o tipo</option>${materialTypes.map((t) => `<option value="${escapeAttr(t.id)}">${escapeHtml(t.nome)} (${escapeHtml(t.sigla)})</option>`).join("")}`
    : '<option value="">Nenhum tipo cadastrado — cadastre em Parâmetros → Almoxarifado</option>';
  if (materialTypes.some((t) => t.id === current)) select.value = current;
  renderMaterialTypeHint();
}
// o tipo diz quais medidas o item tem e a unidade: mostra so essas medidas (obrigatorias) e trava a unidade do tipo
function applyMaterialTypeFields() {
  const type = selectedMaterialType();
  [["refMaterialComprimento", "requer_comprimento"], ["refMaterialLargura", "requer_largura"], ["refMaterialEspessura", "requer_espessura"], ["refMaterialDiametro", "requer_diametro"], ["refMaterialParede", "requer_parede"], ["refMaterialDiametroInterno", "requer_diametro_interno"], ["refMaterialDiametroExterno", "requer_diametro_externo"]].forEach(([id, flag]) => {
    const input = almoxEls[id];
    const label = input?.closest("label");
    if (!input || !label) return;
    const show = Boolean(type?.[flag]);
    label.hidden = !show;
    input.required = show;
    input.placeholder = show ? "Medida do item em estoque" : "Opcional";
    if (!show) input.value = "";
  });
  const unit = almoxEls.refMaterialUnit;
  if (unit) {
    if (type?.unidade) {
      if (![...unit.options].some((o) => o.value === type.unidade)) unit.add(new Option(type.unidade, type.unidade));
      unit.value = type.unidade;
      unit.disabled = true;
      unit.title = "Unidade definida pelo tipo (Parâmetros → Almoxarifado)";
    } else {
      unit.disabled = false;
      unit.title = "";
    }
  }
  updateGeneratedMaterialName();
}
// previa do codigo SIGLA-ITEM-MEDIDA (ex.: BRR-001-02) e aviso de item repetido (mesmo tipo + especificacao + medidas)
let codePreviewTimer = null;
let codePreviewDuplicate = null;
function renderMaterialTypeHint() {
  applyMaterialTypeFields();
  const hint = document.getElementById("refMaterialCodeHint");
  if (!hint) return;
  const type = selectedMaterialType();
  codePreviewDuplicate = null;
  hint.classList.remove("is-duplicate");
  if (!type) { hint.textContent = "O código sai do tipo (ex.: BRR-001-01). Tipos em Parâmetros → Almoxarifado."; return; }
  hint.textContent = `Código: ${type.sigla}-…`;
  clearTimeout(codePreviewTimer);
  codePreviewTimer = setTimeout(async () => {
    const num = (el) => (el && !el.closest("label")?.hidden && Number(el.value) > 0 ? Number(el.value) : null);
    const { data, error } = await TecnoweldAPI.getClient().rpc("warehouse_material_code_preview", {
      p_type_id: type.id, p_especificacao: almoxEls.refMaterialEspecificacao?.value.trim() || null,
      p_comprimento: num(almoxEls.refMaterialComprimento), p_largura: num(almoxEls.refMaterialLargura), p_espessura: num(almoxEls.refMaterialEspessura), p_diametro: num(almoxEls.refMaterialDiametro), p_parede: num(almoxEls.refMaterialParede), p_diametro_interno: num(almoxEls.refMaterialDiametroInterno), p_diametro_externo: num(almoxEls.refMaterialDiametroExterno),
    });
    if (error || !data || selectedMaterialType()?.id !== type.id) return;
    if (data.existente) {
      codePreviewDuplicate = data.existente;
      hint.classList.add("is-duplicate");
      hint.textContent = `Já existe com essas medidas: ${data.existente}. Para mais estoque use a Entrada.`;
    } else {
      hint.textContent = data.novo_item ? `Código: ${data.codigo} (item novo)` : `Código: ${data.codigo} (medida nova deste item; já tem ${data.medidas})`;
    }
  }, 300);
}

// (2026-10-04) cadastro do item: nome, tipo, especificacao, medidas e unidade ficam travados (o item pode estar em pedidos).
// Muda: categoria, estoque minimo, valor de custo, exige lote, observacoes, foto e ativo/inativo (inativar barra reserva em aberto).
async function openMaterialRegistrationEditor(id) {
  const item = (materials || []).find((m) => m.id === id);
  if (!item) return;
  if (!materialCategories.length) { try { materialCategories = await TecnoweldAPI.listMaterialCategories(); } catch (_) { /* segue sem a lista */ } }
  const canEdit = window.TecnoweldPermissions?.has?.("Editar material") !== false;
  const medidas = [[item.comprimento_maximo, ""], [item.largura_maxima, ""], [item.espessura, ""], [item.diametro, "Ø "], [item.parede, "parede "], [item.diametro_interno, "Øint "], [item.diametro_externo, "Øext "]].filter(([v]) => Number(v) > 0).map(([v, pre]) => `${pre}${formatNumber(v)} mm`).join(" × ");
  const lock = (label, value) => `<label>${escapeHtml(label)}<input class="tw-field" value="${escapeAttr(value || "-")}" disabled></label>`;
  const cats = (item.categoria && !(materialCategories || []).some((c) => c.nome === item.categoria) ? [{ nome: item.categoria }] : []).concat(materialCategories || []).map((c) => `<option value="${escapeAttr(c.nome)}" ${c.nome === item.categoria ? "selected" : ""}>${escapeHtml(c.nome)}</option>`).join("");
  let epi = { is_epi: false };
  try {
    const r = await TecnoweldAPI.getClient().rpc("almox_material_epi_get", { p_material_id: item.id });
    if (r.error) throw r.error;
    if (!r.data) throw new Error("Dados de EPI indisponíveis.");
    epi = r.data;
  } catch (error) {
    window.TecnoAlert?.error?.(error?.message || "Não foi possível consultar o EPI deste item. Tente novamente.", "Almoxarifado");
    return;
  }
  const d = document.createElement("dialog");
  d.className = "almox-inline-dialog";
  d.innerHTML = `<form class="almox-modal-card mat-edit"><header class="almox-modal-header"><div><h2>${escapeHtml(item.codigo || "")} · Cadastro do item</h2><p>Nome, tipo, especificação, medidas e unidade não mudam: o item pode estar em orçamentos e pedidos.</p></div></header>
    <div class="mat-edit-grid">
      <div class="mat-edit-photo">${item.foto_url || item.desenho_url ? `<img src="${escapeAttr(item.foto_url || item.desenho_url)}" alt="">` : '<span>Sem foto</span>'}${canEdit ? '<label class="btn btn-secondary">Trocar foto<input type="file" name="foto" accept="image/*" hidden></label>' : ""}</div>
      <div class="mat-edit-fields">
        <label class="full">Nome<input class="tw-field" value="${escapeAttr(item.nome || "")}" disabled></label>
        ${lock("Especificação", item.especificacao)}${lock("Medidas", medidas)}${lock("Unidade", item.unidade)}${lock("Saldo (muda só por Entrada/Saída)", `${formatNumber(item.quantidade_disponivel || 0)} ${item.unidade || ""}`)}
        <label>Categoria<select class="tw-field" name="categoria" ${canEdit ? "" : "disabled"}>${cats}</select></label>
        <label>Situação<select class="tw-field" name="status" ${canEdit ? "" : "disabled"}><option value="disponivel" ${item.status !== "inativo" ? "selected" : ""}>Ativo</option><option value="inativo" ${item.status === "inativo" ? "selected" : ""}>Inativo</option></select></label>
        <label>Estoque mínimo<input class="tw-field" name="estoque_minimo" type="number" min="0" step="0.01" value="${escapeAttr(item.estoque_minimo ?? 0)}" ${canEdit ? "" : "disabled"}></label>
        <label>Estoque ideal<input class="tw-field" name="estoque_ideal" type="number" min="0" step="0.01" value="${escapeAttr(item.estoque_ideal ?? 0)}" ${canEdit ? "" : "disabled"}></label>
        <label>Valor de custo<input class="tw-field" name="valor_unitario" type="number" min="0" step="0.01" value="${escapeAttr(item.valor_unitario ?? 0)}" ${canEdit ? "" : "disabled"}></label>
        <label class="full mat-edit-check"><input type="checkbox" name="exige_lote" ${item.exige_lote ? "checked" : ""} ${canEdit ? "" : "disabled"}> Exige lote no recebimento</label>
        <label class="full mat-edit-check"><input type="checkbox" name="is_epi" ${epi.is_epi ? "checked" : ""} ${canEdit ? "" : "disabled"}> É EPI (a saída para uma pessoa vira entrega de EPI na ficha dela)</label>
        <div class="full mat-edit-epi ${epi.is_epi ? "" : "hidden"}"><label>Número do CA *<input class="tw-field" id="matEditEpiCa" value="${escapeAttr(epi.ca || "")}" ${canEdit ? "" : "disabled"}></label><label>Validade do CA<input class="tw-field" id="matEditEpiCaVal" type="date" value="${escapeAttr(epi.ca_validade || "")}" ${canEdit ? "" : "disabled"}></label><label>Troca a cada (dias)<input class="tw-field" id="matEditEpiTroca" type="number" min="0" step="1" value="${escapeAttr(epi.troca_dias ?? "")}" placeholder="vazio = sem troca" ${canEdit ? "" : "disabled"}></label></div>
        <label class="full">Observações<textarea class="tw-field" name="observacoes" rows="3" ${canEdit ? "" : "disabled"}>${escapeHtml(item.observacoes || "")}</textarea></label>
      </div>
    </div>
    <footer class="almox-modal-actions"><button type="button" class="btn btn-secondary" data-close>Fechar</button>${canEdit ? '<button type="submit" class="btn btn-primary">Salvar</button>' : ""}</footer></form>`;
  document.body.append(d);
  d.querySelectorAll("[data-close]").forEach((b) => { b.onclick = () => d.close(); });
  d.addEventListener("close", () => d.remove());
  d.querySelector("[name=is_epi]")?.addEventListener("change", (e) => d.querySelector(".mat-edit-epi")?.classList.toggle("hidden", !e.target.checked));
  let newPhoto = null;
  d.querySelector("[name=foto]")?.addEventListener("change", (e) => {
    newPhoto = e.target.files?.[0] || null;
    if (newPhoto) d.querySelector(".mat-edit-photo img, .mat-edit-photo span")?.replaceWith(Object.assign(document.createElement("img"), { src: URL.createObjectURL(newPhoto), alt: "" }));
  });
  d.querySelector("form").onsubmit = async (event) => {
    event.preventDefault();
    const f = event.target, btn = f.querySelector("[type=submit]");
    if (f.status.value === "inativo" && item.status !== "inativo") {
      const ok = await (window.TecnoAlert?.confirm?.({ title: "Inativar item?", message: `${item.codigo} deixa de ser usado. O saldo e o histórico ficam guardados.`, confirmText: "Inativar", cancelText: "Cancelar" }) ?? Promise.resolve(window.confirm("Inativar item?")));
      if (!ok) return;
    }
    if (f.is_epi.checked && !document.getElementById("matEditEpiCa").value.trim()) { window.TecnoAlert?.warning?.("Informe o número do CA do EPI.", "Almoxarifado"); document.getElementById("matEditEpiCa").focus(); return; }
    btn.disabled = true;
    try {
      const data = { categoria: f.categoria.value, status: f.status.value, estoque_minimo: f.estoque_minimo.value, estoque_ideal: f.estoque_ideal.value, valor_unitario: f.valor_unitario.value, exige_lote: f.exige_lote.checked, observacoes: f.observacoes.value };
      if (newPhoto) data.foto_url = (await TecnoweldAPI.uploadFile(newPhoto, "almoxarifado/fotos"))?.url || "";
      const { error } = await TecnoweldAPI.getClient().rpc("warehouse_material_update_registration", { p_id: item.id, p_data: data });
      if (error) throw error;
      if (f.is_epi.checked || epi.is_epi) await saveMaterialEpi(item.id, f.is_epi.checked, "matEdit");
      d.close();
      window.TecnoAlert?.success?.(`Cadastro de ${item.codigo} atualizado.`, "Almoxarifado");
      await loadWarehouse();
    } catch (error) {
      btn.disabled = false;
      window.TecnoAlert?.error?.(error?.message || "Não foi possível salvar.", "Almoxarifado");
    }
  };
  d.showModal();
}

// (2026-10-14) EPI no proprio cadastro do item (rh_epis 1 para 1 com o item); a aba EPI so acompanha trocas e entregas
async function saveMaterialEpi(materialId, isEpi, prefix) {
  const v = (s) => document.getElementById(prefix + s)?.value.trim() || null;
  const { error } = await TecnoweldAPI.getClient().rpc("almox_material_epi_set", { p_material_id: materialId, p_is_epi: isEpi, p_ca: v("EpiCa"), p_ca_validade: v("EpiCaVal"), p_troca_dias: v("EpiTroca") ? Number(v("EpiTroca")) : null });
  if (error) throw error;
  try { await window.AlmoxEpi?.load?.(); } catch (_) { /* a aba EPI recarrega depois */ }
}
window.openMaterialRegistrationEditor = openMaterialRegistrationEditor;

function openReferenceMaterialModal() {
  if (!requirePermission("Editar material")) return;
  clearReferenceMaterialForm();
  openModal(almoxEls.materialWorkspaceTab);
  mountMaterialWorkspace();
}

function clearReferenceMaterialForm() {
  almoxEls.referenceMaterialForm?.reset();
  if (almoxEls.refMaterialStock) almoxEls.refMaterialStock.value = "0";
  if (almoxEls.refMaterialMinimum) almoxEls.refMaterialMinimum.value = "0";
  if (almoxEls.refMaterialCost) almoxEls.refMaterialCost.value = "0";
  document.getElementById("refMaterialEpiBox")?.classList.add("hidden");
  updateGeneratedMaterialName();
  renderMaterialCategorySelection();
  renderMaterialTypeHint();
}

async function saveReferenceMaterial() {
  enforceFieldCasing(almoxEls.refMaterialEspecificacao, (value) => value.toUpperCase());
  updateGeneratedMaterialName();
  if (!window.TecnoValidate.form(almoxEls.referenceMaterialForm)) return;
  if (!almoxEls.refMaterialCategory.value) {
    almoxEls.refMaterialCategoryTrigger?.classList.add("tw-field-invalid");
    window.TecnoAlert?.warning?.("Selecione a categoria do insumo para continuar.", "Almoxarifado");
    return;
  }
  almoxEls.refMaterialCategoryTrigger?.classList.remove("tw-field-invalid");
  const isEpi = Boolean(document.getElementById("refMaterialEpi")?.checked);
  if (isEpi && !document.getElementById("refMaterialEpiCa")?.value.trim()) {
    window.TecnoAlert?.warning?.("Informe o número do CA do EPI.", "Almoxarifado");
    document.getElementById("refMaterialEpiCa")?.focus();
    return;
  }
  if (codePreviewDuplicate) {
    window.TecnoAlert?.warning?.(`Já existe este item com as mesmas medidas: ${codePreviewDuplicate}. Para colocar mais estoque use a Entrada.`, "Almoxarifado");
    return;
  }
  almoxEls.saveReferenceMaterialBtn.disabled = true;
  try {
    const saved = await TecnoweldAPI.saveWarehouseEntry({
      nome: almoxEls.refMaterialName.value.trim(),
      type_id: almoxEls.refMaterialTipo.value,
      exige_lote: Boolean(document.getElementById("refMaterialExigeLote")?.checked),
      especificacao: almoxEls.refMaterialEspecificacao.value.trim(),
      categoria: almoxEls.refMaterialCategory.value,
      quantidade: almoxEls.refMaterialStock.value,
      estoque_minimo: almoxEls.refMaterialMinimum.value,
      estoque_ideal: document.getElementById("refMaterialIdeal")?.value || 0,
      unidade: almoxEls.refMaterialUnit.value,
      valor_unitario: almoxEls.refMaterialCost.value,
      status: almoxEls.refMaterialStatus.value,
      observacoes: almoxEls.refMaterialNotes.value.trim(),
      comprimento_maximo: almoxEls.refMaterialComprimento.value || null,
      largura_maxima: almoxEls.refMaterialLargura.value || null,
      espessura: almoxEls.refMaterialEspessura.value || null,
      diametro: almoxEls.refMaterialDiametro?.value || null,
      parede: almoxEls.refMaterialParede?.value || null,
      diametro_interno: almoxEls.refMaterialDiametroInterno?.value || null,
      diametro_externo: almoxEls.refMaterialDiametroExterno?.value || null,
    });
    if (isEpi && saved?.id) await saveMaterialEpi(saved.id, true, "refMaterial");
    clearReferenceMaterialForm();
    await loadWarehouse();
    window.TecnoAlert?.success?.("Insumo cadastrado com sucesso.", "Almoxarifado");
    closeAllModals();
  } catch (error) {
    window.TecnoAlert?.error?.(error?.message || "Não foi possível cadastrar o insumo.", "Almoxarifado");
  } finally {
    almoxEls.saveReferenceMaterialBtn.disabled = false;
  }
}

function mountMovementWorkspace(mode = "entry") {
  setReferenceMovementMode(mode === "exit" || mode === "saida" ? "saida" : "entrada");
  renderReferenceMovementOptions();
  if (!almoxEls.referenceMovementItems.children.length) addReferenceMovementRow();
  syncReferenceMovementType();
  renderReferenceMovementHistory();
}

function setReferenceMovementMode(mode) {
  if (!almoxEls.refMovementType) return;
  almoxEls.refMovementType.value = mode === "saida" ? "saida" : "entrada";
  syncReferenceMovementType();
}

function renderReferenceMovementOptions() {
  renderReferenceMaterialDatalist();
  renderMovementOperator();
  renderMovementRequesterSelection();
  renderMovementRequesterOptions();
  syncMovementRequesterDestination();
}

function employeeAvatarMarkup(employee, className = "movement-picker-avatar") {
  const name = employee?.nome || "Usuário";
  if (employee?.foto_url) return `<span class="${className}"><img src="${escapeAttr(employee.foto_url)}" alt=""></span>`;
  const initials = name.trim().split(/\s+/).slice(0, 2).map((part) => part[0] || "").join("").toUpperCase() || "--";
  return `<span class="${className}">${escapeHtml(initials)}</span>`;
}

function renderMovementRequesterSelection() {
  const employee = employees.find((item) => item.id === almoxEls.refMovementRequester?.value);
  const sector = employee?.setor || sectors.find((item) => item.id === employee?.setor_id);
  if (almoxEls.refMovementRequesterName) almoxEls.refMovementRequesterName.textContent = employee?.nome || "Selecione";
  if (almoxEls.refMovementRequesterSector) almoxEls.refMovementRequesterSector.textContent = sector?.nome || (employee ? "Sem setor cadastrado" : "Escolha quem solicitou");
  if (almoxEls.refMovementRequesterAvatar) {
    const initials = (employee?.nome || "").trim().split(/\s+/).slice(0, 2).map((part) => part[0] || "").join("").toUpperCase();
    almoxEls.refMovementRequesterAvatar.innerHTML = employee?.foto_url
      ? `<img src="${escapeAttr(employee.foto_url)}" alt="">`
      : initials ? escapeHtml(initials) : '<i data-lucide="user"></i>';
  }
  refreshIcons();
}

function renderMovementRequesterOptions() {
  if (!almoxEls.refMovementRequesterOptions) return;
  const term = TecnoweldAPI.normalize(almoxEls.refMovementRequesterSearch?.value || "");
  const activeEmployees = employees.filter((item) => item.ativo !== false && (!term || TecnoweldAPI.normalize(`${item.nome} ${item.setor?.nome || ""}`).includes(term)));
  almoxEls.refMovementRequesterOptions.innerHTML = activeEmployees.map((employee) => `<button type="button" role="option" data-requester-id="${escapeAttr(employee.id)}" aria-selected="${employee.id === almoxEls.refMovementRequester.value}">${employeeAvatarMarkup(employee)}<span><strong>${escapeHtml(employee.nome)}</strong><small>${escapeHtml(employee.setor?.nome || "Sem setor")}</small></span>${employee.id === almoxEls.refMovementRequester.value ? '<i data-lucide="check"></i>' : ""}</button>`).join("") || `<p>Nenhuma pessoa encontrada.</p>`;
  refreshIcons();
}

function toggleMovementRequesterPicker() {
  const willOpen = almoxEls.refMovementRequesterDropdown.classList.contains("hidden");
  closeMovementPickers();
  almoxEls.refMovementRequesterDropdown.classList.toggle("hidden", !willOpen);
  almoxEls.refMovementRequesterTrigger.setAttribute("aria-expanded", String(willOpen));
  if (willOpen) {
    almoxEls.refMovementRequesterSearch.value = "";
    renderMovementRequesterOptions();
    setTimeout(() => almoxEls.refMovementRequesterSearch.focus(), 0);
  }
}

function closeMovementRequesterPicker() {
  almoxEls.refMovementRequesterDropdown?.classList.add("hidden");
  almoxEls.refMovementRequesterTrigger?.setAttribute("aria-expanded", "false");
}

function closeMovementPickers() {
  closeAllPersonPickers();
  almoxEls.refMovementOpOptions?.classList.add("hidden");
}

function handleMovementRequesterSelection(event) {
  const option = event.target.closest("[data-requester-id]");
  if (!option) return;
  almoxEls.refMovementRequester.value = option.dataset.requesterId;
  renderMovementRequesterSelection();
  closeMovementRequesterPicker();
  syncMovementRequesterDestination();
}

async function ensureProductionOrders() {
  if (productionOrdersPromise) return productionOrdersPromise;
  productionOrdersPromise = TecnoweldAPI.listOrders()
    .then((orders) => {
      const closedStatuses = new Set(["concluida", "concluída", "concluido", "concluído", "cancelada", "cancelado", "encerrada", "encerrado"]);
      productionOrders = orders.filter((order) => !closedStatuses.has(String(order.status || "").trim().toLowerCase()));
      return productionOrders;
    })
    .catch((error) => {
      productionOrdersPromise = null;
      throw error;
    });
  return productionOrdersPromise;
}

async function renderMovementOpOptions() {
  if (!almoxEls.refMovementOpOptions || almoxEls.refMovementOpField?.classList.contains("hidden")) return;
  almoxEls.refMovementOpOptions.classList.remove("hidden");
  almoxEls.refMovementOpOptions.innerHTML = `<p class="movement-picker-loading">Carregando pedidos em produção...</p>`;
  try {
    await ensureProductionOrders();
    const term = TecnoweldAPI.normalize(almoxEls.refMovementOpSearch.value);
    const options = productionOrders.filter((order) => !term || TecnoweldAPI.normalize(`${order.numero} ${order.peca_nome || ""} ${order.cliente || ""}`).includes(term)).slice(0, 30);
    almoxEls.refMovementOpOptions.innerHTML = options.map((order) => `<button type="button" role="option" data-op-number="${escapeAttr(order.numero)}"><span class="movement-op-icon"><i data-lucide="factory"></i></span><span><strong>${escapeHtml(order.numero)}</strong><small>${escapeHtml(order.peca_nome || order.nome_projeto || "Ordem de produção")}</small></span><em>${escapeHtml(movementOrderStatusLabel(order.status))}</em></button>`).join("") || `<p>Nenhum pedido aberta encontrada.</p>`;
    refreshIcons();
  } catch (error) {
    almoxEls.refMovementOpOptions.innerHTML = `<p>Não foi possível carregar os pedidos.</p>`;
  }
}

function movementOrderStatusLabel(status) {
  const value = String(status || "").trim().toLowerCase();
  if (value === "pausada") return "Pausada";
  if (value === "aguardando") return "Aguardando";
  if (value === "liberada") return "Liberada";
  return "Em produção";
}

function handleMovementOpSelection(event) {
  const option = event.target.closest("[data-op-number]");
  if (!option) return;
  almoxEls.refMovementOp.value = option.dataset.opNumber;
  almoxEls.refMovementOpSearch.value = option.dataset.opNumber;
  almoxEls.refMovementOpOptions.classList.add("hidden");
}

function selectedMovementRequesterContext() {
  const employee = employees.find((item) => item.id === almoxEls.refMovementRequester?.value);
  const sector = employee?.setor || sectors.find((item) => item.id === employee?.setor_id) || null;
  const isProduction = TecnoweldAPI.normalize(sector?.tipo || "").startsWith("produ");
  return { employee, sector, isProduction };
}

async function syncMovementRequesterDestination() {
  const { employee, sector, isProduction } = selectedMovementRequesterContext();
  const isExit = almoxEls.refMovementType?.value === "saida";
  if (almoxEls.refMovementDestination) almoxEls.refMovementDestination.dataset.sectorId = sector?.id || "";
  if (almoxEls.refMovementDestinationName) {
    almoxEls.refMovementDestinationName.textContent = !employee
      ? "Selecione o solicitante"
      : sector?.nome || "Solicitante sem setor cadastrado";
  }
  almoxEls.refMovementPurposeField?.classList.toggle("hidden", isProduction);
  almoxEls.refMovementOpField?.classList.toggle("hidden", !isProduction);
  const showScrapPhoto = isProduction && !isExit;
  almoxEls.refMovementScrapPhotoField?.classList.toggle("hidden", !showScrapPhoto);
  almoxEls.refMovementScrapDimensionsField?.classList.toggle("hidden", !showScrapPhoto);
  if (!showScrapPhoto) {
    clearReferenceScrapPhoto();
    clearReferenceScrapDimensions();
  }
  if (isProduction) almoxEls.refMovementPurpose.value = "";
  else if (almoxEls.refMovementOp) {
    almoxEls.refMovementOp.value = "";
    almoxEls.refMovementOpSearch.value = "";
    almoxEls.refMovementOpOptions.classList.add("hidden");
  }
  if (isProduction) await renderMovementOpOptions();
  refreshIcons();
}

function clearReferenceScrapPhoto() {
  if (almoxEls.refMovementScrapPhoto) almoxEls.refMovementScrapPhoto.value = "";
  almoxEls.refMovementScrapPhotoPreview?.classList.add("hidden");
  almoxEls.refMovementScrapPhotoHint?.classList.remove("hidden");
}

function clearReferenceScrapDimensions() {
  if (almoxEls.refMovementScrapComprimento) almoxEls.refMovementScrapComprimento.value = "";
  if (almoxEls.refMovementScrapLargura) almoxEls.refMovementScrapLargura.value = "";
  if (almoxEls.refMovementScrapEspessura) almoxEls.refMovementScrapEspessura.value = "";
}

function showReferenceScrapPhotoPreview(file) {
  if (!file || !almoxEls.refMovementScrapPhotoPreview) return;
  almoxEls.refMovementScrapPhotoPreview.src = URL.createObjectURL(file);
  almoxEls.refMovementScrapPhotoPreview.classList.remove("hidden");
  almoxEls.refMovementScrapPhotoHint?.classList.add("hidden");
}

function renderMovementOperator() {
  const storedUser = currentWarehouseUser();
  const employee = employees.find((item) => item.id === storedUser?.id) || storedUser;
  const name = employee?.nome || "Usuário conectado";
  if (almoxEls.refMovementResponsibleName) almoxEls.refMovementResponsibleName.textContent = name;
  if (!almoxEls.refMovementResponsibleAvatar) return;
  if (employee?.foto_url) {
    almoxEls.refMovementResponsibleAvatar.innerHTML = `<img src="${escapeAttr(employee.foto_url)}" alt="Foto de ${escapeAttr(name)}">`;
  } else {
    almoxEls.refMovementResponsibleAvatar.textContent = name.trim().split(/\s+/).slice(0, 2).map((part) => part[0] || "").join("").toUpperCase() || "--";
  }
}

function renderLoanOperator() {
  const storedUser = currentWarehouseUser();
  const employee = employees.find((item) => item.id === storedUser?.id) || storedUser;
  const name = employee?.nome || "Usuário conectado";
  if (almoxEls.loanResponsavelName) almoxEls.loanResponsavelName.textContent = name;
  if (!almoxEls.loanResponsavelAvatar) return;
  if (employee?.foto_url) {
    almoxEls.loanResponsavelAvatar.innerHTML = `<img src="${escapeAttr(employee.foto_url)}" alt="Foto de ${escapeAttr(name)}">`;
  } else {
    almoxEls.loanResponsavelAvatar.textContent = name.trim().split(/\s+/).slice(0, 2).map((part) => part[0] || "").join("").toUpperCase() || "--";
  }
}

function materialDisplayLabel(item) {
  return item.nome || "-";
}

function renderReferenceMaterialDatalist() {
  if (!almoxEls.referenceMaterialDatalist) return;
  almoxEls.referenceMaterialDatalist.innerHTML = materials.map((item) => `<option value="${escapeAttr(materialDisplayLabel(item))}" label="${escapeAttr([item.codigo, item.nome].filter(Boolean).join(" · "))}"></option>`).join("");
}

function resolveReferenceItemMaterial(row) {
  const searchInput = row?.querySelector(".ref-item-material-input");
  const hiddenInput = row?.querySelector(".ref-item-material");
  if (!searchInput || !hiddenInput) return;
  const selected = materials.find((item) => item.id === hiddenInput.value);
  if (selected && materialDisplayLabel(selected) !== searchInput.value) hiddenInput.value = "";
  searchInput.classList.toggle("ref-item-material-invalid", Boolean(searchInput.value) && !hiddenInput.value);
  renderReferenceItemMaterialOptions(row);
}

let refItemMaterialMenuEl = null;
let refItemMaterialMenuRow = null;

function ensureRefItemMaterialMenu() {
  if (refItemMaterialMenuEl) return refItemMaterialMenuEl;
  refItemMaterialMenuEl = document.createElement("div");
  refItemMaterialMenuEl.className = "ref-item-material-menu ref-item-material-menu-portal hidden";
  refItemMaterialMenuEl.setAttribute("role", "listbox");
  document.body.appendChild(refItemMaterialMenuEl);
  refItemMaterialMenuEl.addEventListener("mousedown", (event) => {
    const option = event.target.closest("[data-material-id]");
    if (option && refItemMaterialMenuRow) selectReferenceItemMaterial(refItemMaterialMenuRow, option.dataset.materialId);
  });
  return refItemMaterialMenuEl;
}

function renderReferenceItemMaterialOptions(row) {
  const searchInput = row?.querySelector(".ref-item-material-input");
  if (!searchInput) return;
  const menu = ensureRefItemMaterialMenu();
  refItemMaterialMenuRow = row;
  const term = TecnoweldAPI.normalize(searchInput.value || "");
  const matches = materials
    .filter((item) => !term || TecnoweldAPI.normalize(materialDisplayLabel(item)).includes(term))
    .slice(0, 30);
  menu.innerHTML = matches.length
    ? matches.map((item) => `<button type="button" role="option" data-material-id="${escapeAttr(item.id)}">${escapeHtml(materialDisplayLabel(item))}</button>`).join("")
    : `<p>Nenhum produto encontrado.</p>`;
  const rect = searchInput.getBoundingClientRect();
  menu.style.top = `${rect.bottom + 4}px`;
  menu.style.left = `${rect.left}px`;
  menu.style.width = `${rect.width}px`;
  menu.classList.remove("hidden");
}

function closeReferenceItemMaterialMenus() {
  refItemMaterialMenuEl?.classList.add("hidden");
  refItemMaterialMenuRow = null;
}

function selectReferenceItemMaterial(row, materialId) {
  const searchInput = row?.querySelector(".ref-item-material-input");
  const hiddenInput = row?.querySelector(".ref-item-material");
  const valueInput = row?.querySelector(".ref-item-value");
  const material = materials.find((item) => item.id === materialId);
  if (!searchInput || !hiddenInput || !material) return;
  searchInput.value = materialDisplayLabel(material);
  hiddenInput.value = material.id;
  if (valueInput) valueInput.value = material.valor_unitario || 0;
  searchInput.classList.remove("ref-item-material-invalid");
  closeReferenceItemMaterialMenus();
  updateReferenceMovementTotal();
}

function addReferenceMovementRow() {
  if (!almoxEls.referenceMovementItems) return;
  const row = document.createElement("tr");
  row.innerHTML = `<td><input class="tw-field ref-item-qty" type="number" min="0.001" step="0.001" value="1"></td><td><div class="ref-item-material-field"><input class="tw-field ref-item-material-input" autocomplete="off" placeholder="Digite o nome do produto"><input type="hidden" class="ref-item-material"></div></td><td><input class="tw-field ref-item-value" type="number" min="0" step="0.01" value="0"></td><td class="ref-item-total">R$ 0,00</td><td><button class="reference-remove-item" type="button" data-remove-reference-item aria-label="Remover item">×</button></td>`;
  almoxEls.referenceMovementItems.appendChild(row);
}

function syncReferenceMovementType() {
  const isExit = almoxEls.refMovementType?.value === "saida";
  almoxEls.referenceMovementPanel?.classList.toggle("is-entry", !isExit);
  almoxEls.referenceMovementPanel?.classList.toggle("is-exit", isExit);
  if (almoxEls.openReferenceInvoiceBtn) almoxEls.openReferenceInvoiceBtn.classList.toggle("hidden", isExit);
  almoxEls.manualEntryNotice?.classList.toggle("hidden", isExit);
  almoxEls.movementEntryModeBtn?.classList.toggle("active", !isExit);
  almoxEls.movementExitModeBtn?.classList.toggle("active", isExit);
  almoxEls.movementEntryModeBtn?.setAttribute("aria-pressed", String(!isExit));
  almoxEls.movementExitModeBtn?.setAttribute("aria-pressed", String(isExit));
  if (almoxEls.refMovementResponsibleLabel) almoxEls.refMovementResponsibleLabel.textContent = isExit ? "Liberado por" : "Registrado por";
  if (almoxEls.refMovementDestinationLabel) almoxEls.refMovementDestinationLabel.textContent = isExit ? "Destino" : "Origem";
  syncMovementRequesterDestination();
}

function updateReferenceMovementTotal() {
  let total = 0;
  almoxEls.referenceMovementItems?.querySelectorAll("tr").forEach((row) => {
    const valueInput = row.querySelector(".ref-item-value");
    const lineTotal = Number(row.querySelector(".ref-item-qty")?.value || 0) * Number(valueInput?.value || 0);
    row.querySelector(".ref-item-total").textContent = formatCurrency(lineTotal);
    total += lineTotal;
  });
  if (almoxEls.referenceMovementTotal) almoxEls.referenceMovementTotal.textContent = total.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function referenceMovementItemsPayload() {
  return [...(almoxEls.referenceMovementItems?.querySelectorAll("tr") || [])].map((row) => ({
    material: materials.find((item) => item.id === row.querySelector(".ref-item-material")?.value),
    quantidade: Number(row.querySelector(".ref-item-qty")?.value || 0),
    valor: Number(row.querySelector(".ref-item-value")?.value || 0),
  })).filter((item) => item.material && item.quantidade > 0);
}

async function saveReferenceMovement() {
  const items = referenceMovementItemsPayload();
  if (!items.length) return window.TecnoAlert?.info?.("Adicione pelo menos um produto.", "Movimentação");
  const isExit = almoxEls.refMovementType.value === "saida";
  const loggedEmployeeId = currentWarehouseUser()?.id || null;
  if (!loggedEmployeeId) return window.TecnoAlert?.error?.("Não foi possível identificar o usuário conectado. Entre novamente no sistema.", "Sessão inválida");
  const requesterContext = selectedMovementRequesterContext();
  if (!requesterContext.employee) return window.TecnoAlert?.info?.("Selecione quem solicitou o material.", "Solicitante obrigatório");
  if (!requesterContext.sector) return window.TecnoAlert?.error?.("O solicitante selecionado não possui setor cadastrado.", "Destino não identificado");
  if (requesterContext.isProduction && !almoxEls.refMovementOp.value.trim()) return window.TecnoAlert?.info?.("Informe o número do pedido para a equipe de Produção.", "Pedido obrigatório");
  if (!requesterContext.isProduction && !almoxEls.refMovementPurpose.value) return window.TecnoAlert?.info?.("Informe se a retirada é para manutenção interna ou uso interno.", "Finalidade obrigatória");
  if (!isExit && requesterContext.isProduction && (!almoxEls.refMovementScrapComprimento.value || !almoxEls.refMovementScrapLargura.value || !almoxEls.refMovementScrapEspessura.value)) return window.TecnoAlert?.info?.("Informe comprimento, largura e espessura da sobra.", "Medida obrigatória");
  if (!isExit && requesterContext.isProduction && !almoxEls.refMovementScrapPhoto.files[0]) return window.TecnoAlert?.info?.("Anexe uma foto do desenho com as medidas.", "Foto obrigatória");
  pendingManualExit = { items, requesterContext, loggedEmployeeId, isExit };
  openMovementPinModal(requesterContext.employee, isExit);
}

function openMovementPinModal(requester, isExit) {
  const initials = String(requester?.nome || "").trim().split(/\s+/).slice(0, 2).map((part) => part[0] || "").join("").toUpperCase() || "--";
  almoxEls.movementPinRequesterName.textContent = requester?.nome || "o solicitante";
  almoxEls.movementPinAvatar.innerHTML = requester?.foto_url ? `<img src="${escapeAttr(requester.foto_url)}" alt="">` : escapeHtml(initials);
  almoxEls.movementPinInput.value = "";
  almoxEls.movementPinError.textContent = "";
  if (almoxEls.movementPinKicker) almoxEls.movementPinKicker.textContent = isExit ? "AUTORIZAÇÃO DE SAÍDA" : "AUTORIZAÇÃO DE ENTRADA";
  if (almoxEls.confirmMovementPinBtn) almoxEls.confirmMovementPinBtn.textContent = isExit ? "Autorizar saída" : "Autorizar entrada";
  openModal(almoxEls.movementPinModal);
  setTimeout(() => almoxEls.movementPinInput.focus(), 50);
}

function openLoanPinModal(requester) {
  const initials = String(requester?.nome || "").trim().split(/\s+/).slice(0, 2).map((part) => part[0] || "").join("").toUpperCase() || "--";
  almoxEls.movementPinRequesterName.textContent = requester?.nome || "quem está retirando";
  almoxEls.movementPinAvatar.innerHTML = requester?.foto_url ? `<img src="${escapeAttr(requester.foto_url)}" alt="">` : escapeHtml(initials);
  almoxEls.movementPinInput.value = "";
  almoxEls.movementPinError.textContent = "";
  if (almoxEls.movementPinKicker) almoxEls.movementPinKicker.textContent = "AUTORIZAÇÃO DE RETIRADA";
  if (almoxEls.confirmMovementPinBtn) almoxEls.confirmMovementPinBtn.textContent = "Autorizar retirada";
  openModal(almoxEls.movementPinModal);
  setTimeout(() => almoxEls.movementPinInput.focus(), 50);
}

function closeMovementPinModal() {
  almoxEls.movementPinModal.classList.add("hidden");
  almoxEls.movementPinModal.setAttribute("aria-hidden", "true");
  almoxEls.movementPinInput.value = "";
  almoxEls.movementPinError.textContent = "";
  pendingManualExit = null;
  pendingPosExit = null;
  pendingLoanAuthorization = null;
  if (!document.querySelector(".almox-modal:not(.hidden)")) document.body.classList.remove("modal-open");
}

async function authorizePendingManualExit() {
  if (pendingLoanAuthorization) return authorizePendingLoan();
  if (pendingPosExit) return authorizePendingPosExit();
  if (!pendingManualExit || almoxEls.confirmMovementPinBtn.disabled) return;
  const pin = almoxEls.movementPinInput.value;
  if (!/^\d{4}$/.test(pin)) {
    almoxEls.movementPinError.textContent = "Informe os quatro dígitos da senha.";
    almoxEls.movementPinInput.focus();
    return;
  }
  almoxEls.confirmMovementPinBtn.disabled = true;
  almoxEls.movementPinInput.disabled = true;
  try {
    await TecnoweldAPI.verifyEmployeeWarehousePin(pendingManualExit.requesterContext.employee.id, pin);
    const operation = pendingManualExit;
    almoxEls.movementPinModal.classList.add("hidden");
    almoxEls.movementPinModal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("modal-open");
    pendingManualExit = null;
    await persistReferenceMovement(operation);
  } catch (error) {
    almoxEls.movementPinError.textContent = error?.message || "Senha incorreta. Tente novamente.";
    almoxEls.movementPinInput.value = "";
    setTimeout(() => almoxEls.movementPinInput.focus(), 0);
  } finally {
    almoxEls.confirmMovementPinBtn.disabled = false;
    almoxEls.movementPinInput.disabled = false;
  }
}

async function authorizePendingLoan() {
  if (!pendingLoanAuthorization || almoxEls.confirmMovementPinBtn.disabled) return;
  const pin = almoxEls.movementPinInput.value;
  if (!/^\d{4}$/.test(pin)) {
    almoxEls.movementPinError.textContent = "Informe os quatro dígitos da senha.";
    almoxEls.movementPinInput.focus();
    return;
  }
  almoxEls.confirmMovementPinBtn.disabled = true;
  almoxEls.movementPinInput.disabled = true;
  try {
    await TecnoweldAPI.verifyEmployeeWarehousePin(pendingLoanAuthorization.retiradoPorId, pin);
    const payload = pendingLoanAuthorization.payload;
    almoxEls.movementPinModal.classList.add("hidden");
    almoxEls.movementPinModal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("modal-open");
    pendingLoanAuthorization = null;
    await persistLoan(payload);
  } catch (error) {
    almoxEls.movementPinError.textContent = error?.message || "Senha incorreta. Tente novamente.";
    almoxEls.movementPinInput.value = "";
    setTimeout(() => almoxEls.movementPinInput.focus(), 0);
  } finally {
    almoxEls.confirmMovementPinBtn.disabled = false;
    almoxEls.movementPinInput.disabled = false;
  }
}

async function persistReferenceMovement({ items, requesterContext, loggedEmployeeId, isExit }) {
  almoxEls.saveReferenceMovementBtn.disabled = true;
  try {
    const isScrapEntry = !isExit && requesterContext.isProduction;
    const scrapPhotoUrl = isScrapEntry ? await fileToDataUrl(almoxEls.refMovementScrapPhoto.files[0]) : "";
    const scrapDimensions = isScrapEntry
      ? {
          comprimento_maximo: almoxEls.refMovementScrapComprimento.value,
          largura_maxima: almoxEls.refMovementScrapLargura.value,
          espessura: almoxEls.refMovementScrapEspessura.value,
        }
      : null;
    for (const item of items) {
      const finalidade = requesterContext.isProduction ? null : almoxEls.refMovementPurpose.value;
      const opNumero = requesterContext.isProduction ? almoxEls.refMovementOp.value.trim() : null;
      if (isExit) {
        await TecnoweldAPI.saveWarehouseExit({ material_id: item.material.id, setor_id: requesterContext.sector.id, solicitante_id: requesterContext.employee.id, responsavel_id: loggedEmployeeId, quantidade: item.quantidade, unidade: item.material.unidade, finalidade, op_numero: opNumero, origem: "saida_manual", observacao: almoxEls.refMovementNotes.value.trim() });
      } else {
        const existingRemainder = isScrapEntry ? findExistingRemainderMaterial(item.material, scrapDimensions) : null;
        await TecnoweldAPI.saveWarehouseEntry({ material_id: isScrapEntry ? existingRemainder?.id : item.material.id, nome: item.material.nome, especificacao: item.material.especificacao || null, categoria: item.material.categoria || null, material_referencia: isScrapEntry ? item.material.nome : item.material.material_referencia, quantidade: item.quantidade, unidade: item.material.unidade, tipo_material: isScrapEntry ? "retalho" : item.material.tipo_material, foto_url: scrapPhotoUrl, desenho_url: scrapPhotoUrl, ...scrapDimensions, op_origem: opNumero, setor_id: requesterContext.sector.id, solicitante_id: requesterContext.employee.id, finalidade, op_numero: opNumero, valor_unitario: item.valor, responsavel_id: loggedEmployeeId, observacoes: almoxEls.refMovementNotes.value.trim() });
      }
    }
    almoxEls.referenceMovementForm.reset();
    clearReferenceScrapPhoto();
    clearReferenceScrapDimensions();
    almoxEls.referenceMovementItems.innerHTML = "";
    addReferenceMovementRow();
    syncMovementRequesterDestination();
    await loadWarehouse();
    mountMovementWorkspace();
    window.TecnoAlert?.success?.("Movimentação registrada com sucesso.", "Almoxarifado");
  } catch (error) {
    window.TecnoAlert?.error?.(error?.message || "Não foi possível salvar a movimentação.", "Almoxarifado");
  } finally {
    almoxEls.saveReferenceMovementBtn.disabled = false;
  }
}

function renderReferenceMovementHistory() {
  if (!almoxEls.referenceMovementHistory) return;
  const term = normalizeText(almoxEls.referenceHistorySearch?.value || "");
  const filtered = movements.filter((item) => !term || normalizeText([
    item.material?.nome,
    labelMovementType(item.tipo),
    item.op_numero,
    item.solicitante?.nome,
    item.responsavel?.nome,
  ].join(" ")).includes(term));
  almoxEls.referenceMovementHistory.innerHTML = filtered.slice(0, 12).map((item) => `<tr><td>${formatDateTime(item.created_at)}</td><td>${renderBadge(labelMovementType(item.tipo), movementTypeClass(item.tipo))}</td><td>${escapeHtml(item.material?.nome || "-")}</td><td>${formatNumber(item.quantidade)}</td><td>${escapeHtml(item.op_numero || "-")}</td><td>${escapeHtml(item.solicitante?.nome || item.responsavel?.nome || "-")}</td></tr>`).join("") || `<tr><td colspan="6" class="empty-state">Nenhuma movimentação registrada.</td></tr>`;
}

const personPickers = {
  retiradoPor: {
    hiddenId: "loanRetiradoPor", triggerId: "loanRetiradoPorTrigger", dropdownId: "loanRetiradoPorDropdown",
    searchId: "loanRetiradoPorSearch", optionsId: "loanRetiradoPorOptions", nameId: "loanRetiradoPorName", avatarId: "loanRetiradoPorAvatar",
    subId: "loanRetiradoPorSector", subFallback: "Quem ficou com o item", onSelect: syncLoanSector,
  },
};

function togglePersonPicker(key) {
  const cfg = personPickers[key];
  const dropdown = document.getElementById(cfg.dropdownId);
  const trigger = document.getElementById(cfg.triggerId);
  if (!dropdown || !trigger) return;
  const willOpen = dropdown.classList.contains("hidden");
  closeAllPersonPickers();
  dropdown.classList.toggle("hidden", !willOpen);
  trigger.setAttribute("aria-expanded", String(willOpen));
  if (willOpen) {
    const search = document.getElementById(cfg.searchId);
    if (search) search.value = "";
    renderPersonPickerOptions(key);
    setTimeout(() => search?.focus(), 0);
  }
}

function closeAllPersonPickers() {
  closeMovementRequesterPicker();
  closeMaterialCategoryPicker();
  Object.values(personPickers).forEach((cfg) => {
    document.getElementById(cfg.dropdownId)?.classList.add("hidden");
    document.getElementById(cfg.triggerId)?.setAttribute("aria-expanded", "false");
  });
}

function renderPersonPickerOptions(key) {
  const cfg = personPickers[key];
  const optionsEl = document.getElementById(cfg.optionsId);
  const searchEl = document.getElementById(cfg.searchId);
  const hiddenEl = document.getElementById(cfg.hiddenId);
  if (!optionsEl || !hiddenEl) return;
  const term = TecnoweldAPI.normalize(searchEl?.value || "");
  const activeEmployees = employees.filter((item) => item.ativo !== false && (!term || TecnoweldAPI.normalize(`${item.nome} ${item.setor?.nome || ""}`).includes(term)));
  optionsEl.innerHTML = activeEmployees.map((employee) => `<button type="button" role="option" data-person-id="${escapeAttr(employee.id)}" aria-selected="${employee.id === hiddenEl.value}">${employeeAvatarMarkup(employee)}<span><strong>${escapeHtml(employee.nome)}</strong><small>${escapeHtml(employee.setor?.nome || "Sem setor")}</small></span>${employee.id === hiddenEl.value ? '<i data-lucide="check"></i>' : ""}</button>`).join("") || `<p>Nenhuma pessoa encontrada.</p>`;
  refreshIcons();
}

function renderPersonPickerSelection(key) {
  const cfg = personPickers[key];
  const hiddenEl = document.getElementById(cfg.hiddenId);
  const nameEl = document.getElementById(cfg.nameId);
  const avatarEl = document.getElementById(cfg.avatarId);
  if (!hiddenEl) return;
  const employee = employees.find((item) => item.id === hiddenEl.value);
  if (nameEl) nameEl.textContent = employee?.nome || "Selecione";
  if (cfg.subId) {
    const subEl = document.getElementById(cfg.subId);
    if (subEl) subEl.textContent = employee ? (employee.setor?.nome || "Sem setor cadastrado") : cfg.subFallback;
  }
  if (avatarEl) {
    const initials = (employee?.nome || "").trim().split(/\s+/).slice(0, 2).map((part) => part[0] || "").join("").toUpperCase();
    avatarEl.innerHTML = employee?.foto_url ? `<img src="${escapeAttr(employee.foto_url)}" alt="">` : initials ? escapeHtml(initials) : '<i data-lucide="user"></i>';
  }
  refreshIcons();
}

function selectPersonPickerOption(key, event) {
  const option = event.target.closest("[data-person-id]");
  if (!option) return;
  const cfg = personPickers[key];
  document.getElementById(cfg.hiddenId).value = option.dataset.personId;
  renderPersonPickerSelection(key);
  document.getElementById(cfg.dropdownId)?.classList.add("hidden");
  document.getElementById(cfg.triggerId)?.setAttribute("aria-expanded", "false");
  cfg.onSelect?.();
}

function syncLoanSector() {
  const employee = employees.find((item) => item.id === almoxEls.loanRetiradoPor?.value);
  const sector = employee?.setor || sectors.find((item) => item.id === employee?.setor_id) || null;
  if (almoxEls.loanSectorName) almoxEls.loanSectorName.textContent = !employee ? "Selecione quem retirou" : (sector?.nome || "Sem setor cadastrado");
  if (almoxEls.loanSectorField) almoxEls.loanSectorField.dataset.sectorId = sector?.id || "";
  // Producao e Qualidade informam o pedido (o gasto entra no teto do pedido); escritorio nao precisa.
  almoxEls.loanOpField?.classList.toggle("hidden", !loanNeedsOp(sector));
}

function loanNeedsOp(sector) {
  const tipo = TecnoweldAPI.normalize(sector?.tipo || "");
  return tipo.startsWith("produ") || tipo.startsWith("qualidade");
}

async function renderLoanOpOptions() {
  if (!almoxEls.loanOpOptions || almoxEls.loanOpField?.classList.contains("hidden")) return;
  almoxEls.loanOpOptions.classList.remove("hidden");
  almoxEls.loanOpOptions.innerHTML = `<p class="movement-picker-loading">Carregando pedidos em produção...</p>`;
  try {
    await ensureProductionOrders();
    const term = TecnoweldAPI.normalize(almoxEls.loanOpSearch.value);
    const options = productionOrders.filter((order) => !term || TecnoweldAPI.normalize(`${order.numero} ${order.peca_nome || ""} ${order.cliente || ""}`).includes(term)).slice(0, 30);
    almoxEls.loanOpOptions.innerHTML = options.map((order) => `<button type="button" role="option" data-op-number="${escapeAttr(order.numero)}"><span class="movement-op-icon"><i data-lucide="factory"></i></span><span><strong>${escapeHtml(order.numero)}</strong><small>${escapeHtml(order.peca_nome || order.nome_projeto || "Ordem de produção")}</small></span><em>${escapeHtml(movementOrderStatusLabel(order.status))}</em></button>`).join("") || `<p>Nenhum pedido aberta encontrada.</p>`;
    refreshIcons();
  } catch (error) {
    almoxEls.loanOpOptions.innerHTML = `<p>Não foi possível carregar os pedidos.</p>`;
  }
}

function addLoanItemRow() {
  if (!almoxEls.loanItems) return;
  const row = document.createElement("tr");
  row.innerHTML = `<td><input class="tw-field loan-item-qty" type="number" min="0.001" step="0.001" value="1"></td><td><input class="tw-field loan-item-material-input" list="referenceMaterialDatalist" autocomplete="off" placeholder="Digite o nome do produto"><input type="hidden" class="loan-item-material"></td><td><button class="reference-remove-item" type="button" data-remove-loan-item aria-label="Remover item">×</button></td>`;
  almoxEls.loanItems.appendChild(row);
  validateLoanStock();
}

function resolveLoanItemMaterial(row) {
  const searchInput = row?.querySelector(".loan-item-material-input");
  const hiddenInput = row?.querySelector(".loan-item-material");
  if (!searchInput || !hiddenInput) return;
  const term = TecnoweldAPI.normalize(searchInput.value || "");
  const material = materials.find((item) => TecnoweldAPI.normalize(materialDisplayLabel(item)) === term);
  hiddenInput.value = material?.id || "";
  searchInput.classList.toggle("ref-item-material-invalid", Boolean(searchInput.value) && !material);
}

const stockAlertStates = new Map();
function showStockAlert(operation, warnings) {
  let state = stockAlertStates.get(operation);
  if (!state) { state = {message:'',timer:null}; stockAlertStates.set(operation,state); }
  const message = warnings.join('\n');
  if (state.message === message) return;
  clearTimeout(state.timer); state.message = message;
  if (!message) return;
  // Aguarda apenas a sequencia da digitacao, evitando um alerta para cada algarismo.
  state.timer = setTimeout(() => {
    const screen = document.getElementById(operation === 'exit' ? 'exitModal' : 'withdrawalsWorkspaceTab');
    if (!screen || screen.classList.contains('hidden')) { state.message = ''; return; }
    window.TecnoAlert?.warning?.(message,'Estoque insuficiente');
  },180);
}

function stockExceededMessage(name, available, quantity, unit) {
  return `Quantidade maior que o estoque de ${name}. Dispon\u00edvel: ${formatNumber(available)} ${unit}. Informado: ${formatNumber(quantity)} ${unit}.`;
}

function validateLoanStock() {
  const rows = [...(almoxEls.loanItems?.querySelectorAll('tr') || [])];
  const totals = new Map(), warnings = [];
  rows.forEach(row => {
    const id = row.querySelector('.loan-item-material')?.value;
    const quantity = Number(row.querySelector('.loan-item-qty')?.value || 0);
    if (id && Number.isFinite(quantity) && quantity > 0) totals.set(id,(totals.get(id)||0)+quantity);
  });
  rows.forEach(row => {
    const material = materials.find(item => item.id === row.querySelector('.loan-item-material')?.value);
    const input = row.querySelector('.loan-item-qty'); if (!input) return;
    const available = Number(material?.quantidade_disponivel || 0);
    const total = totals.get(material?.id) || 0;
    const message = material && total > available + 0.000000001 ? stockExceededMessage(material.nome,available,total,material.unidade||'UN') : '';
    if (material) input.max = String(available); else input.removeAttribute('max');
    input.setCustomValidity(message);
    input.setAttribute('aria-invalid',String(Boolean(message)));
    if (message) { input.setAttribute('aria-errormessage','twAlertMessage'); if (!warnings.includes(message)) warnings.push(message); }
    else input.removeAttribute('aria-errormessage');
  });
  showStockAlert('loan',warnings);
  if (almoxEls.saveLoanBtn) almoxEls.saveLoanBtn.disabled = warnings.length > 0;
  return !warnings.length;
}

function loanItemsPayload() {
  return [...(almoxEls.loanItems?.querySelectorAll("tr") || [])].map((row) => ({
    material: materials.find((item) => item.id === row.querySelector(".loan-item-material")?.value),
    quantidade: Number(row.querySelector(".loan-item-qty")?.value || 0),
  })).filter((item) => item.material && item.quantidade > 0);
}

function resetLoanForm() {
  almoxEls.loanForm?.reset();
  if (almoxEls.loanRetiradoPor) almoxEls.loanRetiradoPor.value = "";
  if (almoxEls.loanOp) almoxEls.loanOp.value = "";
  renderPersonPickerSelection("retiradoPor");
  syncLoanSector();
  almoxEls.loanItems.innerHTML = "";
  addLoanItemRow();
}

function saveLoan() {
  if (!validateLoanStock()) return;
  const items = loanItemsPayload();
  if (!items.length) return window.TecnoAlert?.info?.("Adicione pelo menos um item para a retirada.", "Retirada");
  const responsavelId = currentWarehouseUser()?.id || null;
  const retiradoPorId = almoxEls.loanRetiradoPor?.value;
  if (!retiradoPorId) return window.TecnoAlert?.info?.("Selecione quem retirou o item.", "Retirada");
  const retiradoPor = employees.find((item) => item.id === retiradoPorId);
  const sector = retiradoPor?.setor || sectors.find((item) => item.id === retiradoPor?.setor_id) || null;
  const opNumero = almoxEls.loanOp?.value || "";
  if (loanNeedsOp(sector) && !opNumero) return window.TecnoAlert?.info?.("Informe o pedido: quem é da produção ou da qualidade precisa dizer para qual pedido é a retirada.", "Retirada");
  pendingLoanAuthorization = {
    retiradoPorId,
    payload: {
      responsavel_entrega_id: responsavelId,
      retirado_por_id: retiradoPorId,
      setor_id: sector?.id || null,
      previsao_devolucao: almoxEls.loanExpectedReturn.value || null,
      observacoes: almoxEls.loanNotes.value.trim(),
      op_numero: loanNeedsOp(sector) ? opNumero : null,
      items: items.map((item) => ({ material_id: item.material.id, quantidade: item.quantidade, unidade: item.material.unidade })),
    },
  };
  openLoanPinModal(retiradoPor);
}

async function persistLoan(payload) {
  almoxEls.saveLoanBtn.disabled = true;
  try {
    await TecnoweldAPI.saveWarehouseLoan(payload);
    await loadWarehouse();
    resetLoanForm();
    renderLoanItemsTable();
    window.TecnoAlert?.success?.("Retirada registrada com sucesso.", "Almoxarifado");
  } catch (error) {
    window.TecnoAlert?.error?.(error?.message || "Não foi possível registrar a retirada.", "Almoxarifado");
  } finally {
    almoxEls.saveLoanBtn.disabled = false;
  }
}

function renderLoanItemsTable() {
  if (!almoxEls.loanItemsTableBody) return;
  const term = normalizeText(almoxEls.loanSearch?.value || "");
  const rows = [];
  loans.forEach((loan) => (loan.itens || []).forEach((item) => rows.push({ loan, item })));
  const filtered = rows.filter(({ loan, item }) => !term || normalizeText([
    item.material?.nome, item.material?.codigo, loan.retirado_por?.nome, loan.responsavel_entrega?.nome, loan.observacoes,
  ].join(" ")).includes(term));
  filtered.sort((a, b) => new Date(b.loan.created_at) - new Date(a.loan.created_at));
  almoxEls.loanItemsTableBody.innerHTML = filtered.map(({ loan, item }) => {
    const unit = item.unidade || item.material?.unidade || "";
    const pendente = Number(item.quantidade_retirada || 0) - Number(item.quantidade_devolvida || 0);
    const isOpen = item.status !== "devolvido";
    return `<tr>
      <td>${escapeHtml(item.material?.nome || "Material removido")}</td>
      <td>${formatNumber(item.quantidade_retirada)} ${escapeHtml(unit)}</td>
      <td>${formatNumber(item.quantidade_devolvida)} ${escapeHtml(unit)}</td>
      <td>${formatNumber(pendente)} ${escapeHtml(unit)}</td>
      <td>${escapeHtml(loan.retirado_por?.nome || "-")}</td>
      <td>${escapeHtml(loan.observacoes || "-")}</td>
      <td>${renderBadge(isOpen ? "Aberto" : "Devolvido", isOpen ? "warning" : "success")}</td>
      <td>${isOpen ? `<button class="btn btn-secondary" type="button" data-return-loan-item="${escapeAttr(item.id)}" data-pending="${escapeAttr(pendente)}">Devolver</button>` : ""}</td>
    </tr>`;
  }).join("") || `<tr><td colspan="8" class="empty-state">Nenhuma retirada registrada.</td></tr>`;
  refreshIcons();
}

async function handleLoanReturn(event) {
  const button = event.target.closest("[data-return-loan-item]");
  if (!button) return;
  const itemId = button.dataset.returnLoanItem;
  const pending = Number(button.dataset.pending || 0);
  if (pending <= 0) return;
  button.disabled = true;
  try {
    await TecnoweldAPI.returnWarehouseLoanItem(itemId, pending);
    loans = await TecnoweldAPI.listWarehouseLoans();
    renderLoanItemsTable();
    window.TecnoAlert?.success?.("Devolução registrada.", "Almoxarifado");
  } catch (error) {
    window.TecnoAlert?.error?.(error?.message || "Não foi possível registrar a devolução.", "Almoxarifado");
    button.disabled = false;
  }
}

function renderWithdrawalsWorkspace() {
  renderReferenceMaterialDatalist();
  if (!almoxEls.loanItems) return;
  if (!almoxEls.loanItems.children.length) addLoanItemRow();
  renderLoanOperator();
  renderPersonPickerSelection("retiradoPor");
  syncLoanSector();
  renderLoanItemsTable();
  validateLoanStock();
}

function renderReferenceUsers() {
  if (!almoxEls.referenceUsersBody) return;
  almoxEls.referenceUsersBody.innerHTML = employees.map((item) => `<tr><td>${escapeHtml(item.nome || "-")}</td><td>${escapeHtml(item.setor?.nome || item.setor_nome || "-")}</td><td>${escapeHtml(item.funcao || item.cargo || "-")}</td><td>${renderBadge(item.ativo === false ? "Inativo" : "Ativo", item.ativo === false ? "neutral" : "success")}</td></tr>`).join("") || `<tr><td colspan="4" class="empty-state">Nenhum usuário encontrado.</td></tr>`;
}

const receiptStepDefinitions = [
  [1, "Identificar nota"], [2, "Vincular produtos"], [3, "Conferir mercadorias"], [4, "Resolver divergências"], [5, "Revisar e concluir"]
];

// (2026-10-10) Recebimento virou uma aba do Almoxarifado (ao lado de Chapas): abrir/fechar = trocar de aba
let receivingLoad = null;
async function openGoodsReceiptCenter() {
  if (activeTab !== "receiving") { switchTab("receiving"); await receivingLoad; return; }
  await showGoodsReceiptCenter();
}

async function showGoodsReceiptCenter() {
  almoxEls.backToWarehouseBtn?.classList.add("hidden");
  almoxEls.goodsReceiptCenter.classList.remove("hidden");
  almoxEls.goodsReceiptDashboard.classList.remove("hidden");
  almoxEls.goodsReceiptWorkflow.classList.add("hidden");
  activeNfeReceipt = null;
  await loadNfeReceipts();
  refreshIcons();
}

function closeGoodsReceiptCenter() {
  switchTab("stock");
}

async function loadNfeReceipts() {
  try {
    [nfeReceipts, incomingPurchases, incomingOrders, receivingChecklist, receivingParams] = await Promise.all([
      TecnoweldAPI.listNfeReceipts(),
      TecnoweldAPI.listIncomingPurchases(),
      TecnoweldAPI.listIncomingPurchaseOrders().catch(() => []),
      TecnoweldAPI.listReceivingChecklistQuestions().catch(() => []),
      TecnoweldAPI.getSystemParameters().catch(() => null),
    ]);
    renderGoodsReceiptFilters();
    renderGoodsReceiptDashboard();
  } catch (error) {
    nfeReceipts = [];
    incomingPurchases = [];
    almoxEls.receiptListBody.innerHTML = `<tr><td colspan="10" class="empty-state">${escapeHtml(error?.message || "Não foi possível carregar os recebimentos. Aplique a migration 20260802150000.")}</td></tr>`;
  }
}

function receiptStatusLabel(status) {
  if (status === "compra_prevista") return "Previsto para chegar";
  if (status === "recebida_parcial") return "Recebido parcialmente";
  if (status === "recebida") return "Compra recebida";
  return ({ rascunho: "Rascunho", aguardando_vinculacao: "Aguardando vinculação", aguardando_conferencia: "Aguardando conferência", em_conferencia: "Em conferência", com_divergencia: "Com divergência", recebido: "Recebido", cancelado: "Cancelado" })[status] || status || "-";
}

function receiptStatusType(status) {
  if (status === "recebida") return "success";
  if (status === "recebida_parcial") return "warning";
  if (status === "recebido") return "success";
  if (status === "com_divergencia" || status === "cancelado") return "danger";
  if (status === "em_conferencia" || status === "aguardando_conferencia") return "warning";
  return "neutral";
}

function renderGoodsReceiptFilters() {
  const suppliers = [...new Set([...nfeReceipts, ...incomingPurchases].map((item) => item.fornecedor).filter(Boolean))].sort();
  const responsible = [...new Map(nfeReceipts.map((item) => [item.responsavel?.id, item.responsavel]).filter(([id]) => id)).values()];
  almoxEls.receiptSupplierFilter.innerHTML = `<option value="">Todos os fornecedores</option>${suppliers.map((name) => `<option>${escapeHtml(name)}</option>`).join("")}`;
  almoxEls.receiptStatusFilter.innerHTML = `<option value="">Todos os status</option>${["compra_prevista","recebida_parcial","recebida","rascunho","aguardando_vinculacao","aguardando_conferencia","em_conferencia","com_divergencia","recebido","cancelado"].map((status) => `<option value="${status}">${receiptStatusLabel(status)}</option>`).join("")}`;
  almoxEls.receiptResponsibleFilter.innerHTML = `<option value="">Todos os responsáveis</option>${responsible.map((item) => `<option value="${escapeAttr(item.id)}">${escapeHtml(item.nome)}</option>`).join("")}`;
}

function renderGoodsReceiptDashboardLegacy() {
  const term = normalizeText(almoxEls.receiptSearch?.value || "");
  const period = almoxEls.receiptPeriod?.value || "";
  const filtered = nfeReceipts.filter((item) => {
    const matchesTerm = !term || normalizeText(`${item.fornecedor} ${item.numero_nfe} ${item.chave_nfe}`).includes(term);
    const matchesPeriod = !period || String(item.data_emissao || item.criado_em || "").startsWith(period);
    return matchesTerm && matchesPeriod && (!almoxEls.receiptSupplierFilter.value || item.fornecedor === almoxEls.receiptSupplierFilter.value) && (!almoxEls.receiptStatusFilter.value || item.status === almoxEls.receiptStatusFilter.value) && (!almoxEls.receiptResponsibleFilter.value || item.criado_por === almoxEls.receiptResponsibleFilter.value);
  });
  const monthKey = new Date().toISOString().slice(0, 7);
  const receivedMonth = nfeReceipts.filter((item) => item.concluido_em?.startsWith(monthKey));
  const metrics = [
    ["Aguardando conferência", nfeReceipts.filter((item) => ["aguardando_vinculacao","aguardando_conferencia"].includes(item.status)).length],
    ["Em conferência", nfeReceipts.filter((item) => item.status === "em_conferencia").length],
    ["Com divergência", nfeReceipts.filter((item) => item.status === "com_divergencia").length],
    ["Recebidos no mês", receivedMonth.length],
    ["Valor recebido no mês", formatCurrency(receivedMonth.reduce((sum, item) => sum + Number(item.valor_total || 0), 0))],
  ];
  almoxEls.receiptMetrics.innerHTML = metrics.map(([label, value]) => `<article><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></article>`).join("");
  almoxEls.receiptListBody.innerHTML = filtered.map((item) => `<tr><td><strong>${escapeHtml(item.numero_nfe)}</strong><small>Série ${escapeHtml(item.serie || "-")}</small></td><td>${escapeHtml(item.fornecedor)}</td><td>${escapeHtml(formatDocument(item.cnpj_fornecedor))}</td><td>${formatInvoiceDate(item.data_emissao)}</td><td>${item.concluido_em ? formatDateTime(item.concluido_em) : "-"}</td><td>${item.itens?.length || 0}</td><td>${formatCurrency(item.valor_total)}</td><td>${escapeHtml(item.responsavel?.nome || "-")}</td><td>${renderBadge(receiptStatusLabel(item.status), receiptStatusType(item.status))}</td><td><button class="row-icon-btn" type="button" data-open-receipt="${escapeAttr(item.id)}" aria-label="${item.concluido_em ? "Visualizar" : "Continuar"}"><i data-lucide="${item.concluido_em ? "eye" : "arrow-right"}"></i></button></td></tr>`).join("") || `<tr><td colspan="10" class="empty-state">Nenhum recebimento encontrado.</td></tr>`;
  refreshIcons();
}

function renderGoodsReceiptDashboard() {
  const term = normalizeText(almoxEls.receiptSearch?.value || "");
  const period = almoxEls.receiptPeriod?.value || "";
  const supplier = almoxEls.receiptSupplierFilter.value;
  const status = almoxEls.receiptStatusFilter.value;
  const responsible = almoxEls.receiptResponsibleFilter.value;
  const activeReceiptByRequest = new Map();
  nfeReceipts.filter(receipt => !["recebido","cancelado"].includes(receipt.status)).forEach(receipt => (receipt.itens || []).forEach(item => {
    if (item.purchase_request_id) activeReceiptByRequest.set(String(item.purchase_request_id), receipt.id);
  }));
  const expected = incomingPurchases.map(item => ({
    ...item,
    row_type: "purchase",
    display_status: item.status === "recebida" ? "recebida" : item.status === "recebida_parcial" ? "recebida_parcial" : "compra_prevista",
  }));
  const orderReceiptIds = new Set((incomingOrders || []).map((po) => po.recebimento?.id).filter(Boolean));
  const orders = (incomingOrders || []).map((po) => ({ ...po, row_type: "order", fornecedor: po.fornecedor, display_status: po.recebimento ? "em_conferencia" : "compra_prevista" }));
  const receipts = nfeReceipts.filter((item) => !orderReceiptIds.has(item.id)).map(item => ({ ...item, row_type: "receipt", display_status: item.status }));
  const matched = [...orders, ...expected, ...receipts].filter(item => {
    if (item.row_type === "order") {
      const text = `PC-${String(item.numero).padStart(6, "0")} ${item.fornecedor || ""} ${(item.ops || []).join(" ")} ${(item.itens || []).map((it) => it.nome).join(" ")}`;
      return (!term || normalizeText(text).includes(term)) && (!period || String(item.prazo_acordado || item.emitido_em || "").startsWith(period))
        && (!supplier || item.fornecedor === supplier) && (!status || item.display_status === status) && !responsible;
    }
    const searchable = item.row_type === "purchase"
      ? `${item.fornecedor} ${item.pedido_numero} ${item.descricao_item} ${item.op_numero}`
      : `${item.fornecedor} ${item.numero_nfe} ${item.chave_nfe}`;
    const referenceDate = item.row_type === "purchase" ? item.prazo_entrega || item.comprado_em : item.data_emissao || item.criado_em;
    return (!term || normalizeText(searchable).includes(term))
      && (!period || String(referenceDate || "").startsWith(period))
      && (!supplier || item.fornecedor === supplier)
      && (!status || item.display_status === status)
      && (!responsible || (item.row_type === "receipt" && item.criado_por === responsible));
  });
  // (2026-10-02) duas abas: A receber (pedidos previstos e recebimentos em andamento) e Recebidas (concluidos e cancelados)
  const isDone = (item) => item.row_type === "purchase" ? item.status === "recebida" : item.row_type === "receipt" ? (["recebido", "cancelado"].includes(item.status) || Boolean(item.concluido_em)) : false; // (2026-10-10) concluida com divergencia/RNC tambem sai das pendencias
  const doneCount = matched.filter(isDone).length;
  const countPend = document.getElementById("receiptTabCountPendentes"), countDone = document.getElementById("receiptTabCountRecebidas");
  if (countPend) countPend.textContent = String(matched.length - doneCount);
  setReceivingBadge(matched.length - doneCount);
  if (countDone) countDone.textContent = String(doneCount);
  const filtered = matched.filter((item) => (receiptListTab === "recebidas") === isDone(item))
    .sort((a, b) => receiptListTab === "recebidas" ? String(b.concluido_em || b.criado_em || "").localeCompare(String(a.concluido_em || a.criado_em || "")) : 0);
  const monthKey = new Date().toISOString().slice(0, 7);
  const receivedMonth = nfeReceipts.filter(item => item.concluido_em?.startsWith(monthKey));
  const awaiting = incomingPurchases.filter(item => !["recebida","recebida_parcial"].includes(item.status)).length + (incomingOrders || []).length;
  const partial = incomingPurchases.filter(item => item.status === "recebida_parcial").length;
  const metrics = [
    ["Previstos para chegar", awaiting],
    ["Recebimentos parciais", partial],
    ["Em conferência", nfeReceipts.filter(item => ["aguardando_vinculacao","aguardando_conferencia","em_conferencia"].includes(item.status)).length],
    ["Recebidos no mês", receivedMonth.length],
    ["Valor recebido no mês", formatCurrency(receivedMonth.reduce((sum, item) => sum + Number(item.valor_total || 0), 0))],
  ];
  almoxEls.receiptMetrics.innerHTML = metrics.map(([label, value]) => `<article><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></article>`).join("");
  almoxEls.receiptListBody.innerHTML = filtered.map(item => {
    if (item.row_type === "order") return renderIncomingOrderRow(item);
    if (item.row_type === "purchase") {
      const activeReceiptId = activeReceiptByRequest.get(String(item.id));
      const canReceive = item.status !== "recebida";
      const action = canReceive ? `<button class="row-icon-btn" type="button" ${activeReceiptId ? `data-open-receipt="${escapeAttr(activeReceiptId)}"` : `data-open-purchase-receipt="${escapeAttr(item.id)}"`} aria-label="${activeReceiptId ? "Continuar recebimento" : "Iniciar recebimento"}"><i data-lucide="${activeReceiptId ? "arrow-right" : "package-plus"}"></i></button>` : "";
      return `<tr class="receipt-expected-row"><td><strong>Compra prevista</strong><small>${escapeHtml(item.pedido_numero || `Pedido ${item.op_numero || "-"}`)}</small></td><td>${escapeHtml(item.fornecedor || "Fornecedor não informado")}</td><td>${escapeHtml(formatDocument(item.cnpj_fornecedor))}</td><td>${formatInvoiceDate(item.comprado_em)}</td><td>${formatInvoiceDate(item.prazo_entrega)}</td><td><strong>${formatNumber(item.recebido_quantidade || 0)}/${formatNumber(item.quantidade)}</strong><small>${escapeHtml(item.unidade || "")} · ${escapeHtml(item.descricao_item || "Item")}</small></td><td>${formatCurrency(item.valor_total)}</td><td>-</td><td>${renderBadge(activeReceiptId ? "Recebimento em andamento" : receiptStatusLabel(item.display_status), item.status === "recebida" ? "success" : item.status === "recebida_parcial" ? "warning" : "neutral")}</td><td>${action}</td></tr>`;
    }
    return `<tr><td><strong>${escapeHtml(item.numero_nfe)}</strong><small>Série ${escapeHtml(item.serie || "-")}</small></td><td>${escapeHtml(item.fornecedor)}</td><td>${escapeHtml(formatDocument(item.cnpj_fornecedor))}</td><td>${formatInvoiceDate(item.data_emissao)}</td><td>${item.concluido_em ? formatDateTime(item.concluido_em) : "-"}</td><td>${item.itens?.length || 0}</td><td>${formatCurrency(item.valor_total)}</td><td>${escapeHtml(item.responsavel?.nome || "-")}</td><td>${renderBadge(receiptStatusLabel(item.status), receiptStatusType(item.status))}</td><td><button class="row-icon-btn" type="button" data-open-receipt="${escapeAttr(item.id)}" aria-label="${item.concluido_em ? "Visualizar" : "Continuar"}"><i data-lucide="${item.concluido_em ? "eye" : "arrow-right"}"></i></button></td></tr>`;
  }).join("") || `<tr><td colspan="10" class="empty-state">${receiptListTab === "recebidas" ? "Nenhum recebimento concluído encontrado." : "Nada a receber no momento."}</td></tr>`;
  refreshIcons();
}

function clearGoodsReceiptFilters() {
  [almoxEls.receiptSearch, almoxEls.receiptPeriod, almoxEls.receiptSupplierFilter, almoxEls.receiptStatusFilter, almoxEls.receiptResponsibleFilter].forEach((item) => { if (item) item.value = ""; });
  renderGoodsReceiptDashboard();
}

// Pedido de compra previsto: com XML (bipa/importa) ou sem XML (digita a partir do pedido).
function renderIncomingOrderRow(po) {
  const items = po.itens || [];
  const open = items.filter((it) => Number(it.quantidade) > Number(it.recebido || 0));
  const late = po.prazo_acordado && new Date(`${String(po.prazo_acordado).slice(0, 10)}T23:59:59`) < new Date();
  const receipt = po.recebimento;
  const badge = receipt
    ? renderBadge(receipt.tem_xml ? "XML anexado · em andamento" : "Sem XML · em andamento", "warning")
    : renderBadge(late ? "Atrasado" : "Previsto para chegar", late ? "danger" : "neutral");
  const action = po.servico && !receipt
    ? `<span class="receipt-row-actions">${renderBadge("Serviço de manutenção", "neutral")}</span>`
    : receipt
    ? `<button class="btn btn-primary receipt-row-btn" type="button" data-open-receipt="${escapeAttr(receipt.id)}">${receipt.tem_xml ? "Receber (XML)" : "Continuar"}</button>`
    : `<span class="receipt-row-actions"><button class="btn btn-secondary receipt-row-btn" type="button" data-po-xml="${escapeAttr(po.id)}">Importar XML</button><button class="btn btn-secondary receipt-row-btn" type="button" data-po-manual="${escapeAttr(po.id)}">Sem XML</button></span>`;
  return `<tr class="receipt-expected-row"><td><button type="button" class="receipt-po-link" data-po-edit="${escapeAttr(po.id)}" title="Abrir o pedido de compra">PC-${escapeHtml(String(po.numero).padStart(6, "0"))}</button><small>${(po.ops || []).length ? escapeHtml((po.ops || []).map((op) => `Pedido ${op}`).join(", ")) : "Pedido de compra"}</small></td><td>${escapeHtml(po.fornecedor || "Fornecedor não informado")}</td><td>${escapeHtml(formatDocument(po.cnpj_fornecedor))}</td><td>${formatInvoiceDate(po.emitido_em)}</td><td>${formatInvoiceDate(po.prazo_acordado)}</td><td><strong>${open.length} de ${items.length}</strong><small>${escapeHtml(open.map((it) => `${it.nome}: ${formatNumber(Number(it.quantidade) - Number(it.recebido || 0))} ${it.unidade || ""}`).join(" · "))}</small></td><td>${formatCurrency(po.valor_total)}</td><td>-</td><td>${badge}</td><td>${action}</td></tr>`;
}

// (2026-10-04) pedido de compra no recebimento: o almoxarifado ve e corrige tudo (itens, valores, pagamento e parcelas
// do contas a pagar). Cada alteracao fica no historico do pedido.
async function openPurchaseOrderEditor(orderId) {
  let po, payables;
  try {
    [po, payables] = await Promise.all([
      TecnoweldAPI.getPurchaseOrderV2Detail(orderId),
      TecnoweldAPI.getClient().rpc("purchase_order_payables", { p_order: orderId }).then((r) => { if (r.error) throw r.error; return r.data || []; }),
    ]);
  } catch (error) { window.TecnoAlert?.error?.(error?.message || "Não foi possível abrir o pedido.", "Pedido de compra"); return; }
  const code = `PC-${String(po.numero).padStart(6, "0")}`;
  const locked = po.status === "cancelado";
  const paid = payables.some((p) => Number(p.pago || 0) > 0);
  const startParc = Array.isArray(po.parcelas) && po.parcelas.length ? po.parcelas : payables.map((p) => ({ due_date: p.vencimento, amount: p.valor }));
  const d = document.createElement("dialog");
  d.className = "almox-inline-dialog";
  const itemRow = (it) => `<tr data-po-item="${escapeAttr(it.id)}"><td><input class="tw-field" name="nome" value="${escapeAttr(it.nome || "")}" required><input class="tw-field po-ed-spec" name="especificacao" value="${escapeAttr(it.especificacao || "")}" placeholder="Especificação"></td>
    <td><input class="tw-field po-ed-num" name="quantidade" type="number" min="${escapeAttr(Number(it.quantidade_recebida || 0) || 0.0001)}" step="any" value="${escapeAttr(it.quantidade)}" required></td>
    <td><input class="tw-field po-ed-unit" name="unidade" value="${escapeAttr(it.unidade || "")}"></td>
    <td><input class="tw-field po-ed-num" name="valor_unitario" type="number" min="0" step="0.0001" value="${escapeAttr(it.valor_unitario ?? 0)}" required></td>
    <td class="po-ed-sub" data-sub>${formatCurrency(Number(it.valor_total || 0))}</td><td><small>${formatNumber(Number(it.quantidade_recebida || 0))} recebido</small></td></tr>`;
  const parcRow = (p, i) => `<div class="po-ed-parc" data-parc><b>${i + 1}</b><input class="tw-field" type="date" name="due" value="${escapeAttr(String(p.due_date || "").slice(0, 10))}" ${paid ? "disabled" : ""}><input class="tw-field po-ed-num" type="number" min="0" step="0.01" name="amount" value="${escapeAttr(Number(p.amount || 0).toFixed(2))}" ${paid ? "disabled" : ""}></div>`;
  const formas = ["", "boleto", "pix", "transferencia", "cartao", "dinheiro", "cheque"];
  d.innerHTML = `<form class="almox-modal-card po-editor"><header class="almox-modal-header"><div><h2>Pedido de compra ${escapeHtml(code)}</h2><p>${escapeHtml(po.fornecedor?.nome || "Fornecedor não informado")} · ${escapeHtml(String(po.status || "").replaceAll("_", " "))}${po.comprador_nome ? ` · comprador ${escapeHtml(po.comprador_nome)}` : ""}</p></div></header>
    <div class="tw-table-scroll"><table class="po-ed-table"><thead><tr><th>Item</th><th>Qtd.</th><th>Un.</th><th>Valor unit.</th><th>Subtotal</th><th></th></tr></thead><tbody>${(po.items || []).map(itemRow).join("")}</tbody></table></div>
    <div class="po-ed-grid">
      <label>Condição de pagamento<input class="tw-field" name="condicao_pagamento" value="${escapeAttr(po.condicao_pagamento || "")}" placeholder="Ex.: 30/60/90"></label>
      <label>Forma de pagamento<select class="tw-field" name="forma_pagamento">${formas.map((v) => `<option value="${v}" ${(po.forma_pagamento || "") === v ? "selected" : ""}>${v ? v[0].toUpperCase() + v.slice(1) : "—"}</option>`).join("")}</select></label>
      <label>Prazo de entrega<input class="tw-field" type="date" name="prazo_acordado" value="${escapeAttr(String(po.prazo_acordado || "").slice(0, 10))}"></label>
      <label class="po-ed-wide">Observações<input class="tw-field" name="observacoes" value="${escapeAttr(po.observacoes || "")}"></label>
    </div>
    <section class="po-ed-pay"><header><strong>Contas a pagar</strong><span>Total do pedido <b data-po-total>${formatCurrency(Number(po.valor_total || 0))}</b> · parcelas <b data-po-parc-sum></b></span></header>
      ${paid ? '<p class="muted-line">Este pedido já tem parcela paga: as parcelas só podem ser ajustadas pelo Financeiro.</p>' : '<p class="muted-line">Sem parcelas, o sistema calcula pela condição de pagamento. Com parcelas, elas vão para o contas a pagar e precisam somar o total.</p>'}
      <div data-parc-list>${startParc.map(parcRow).join("")}</div>
      ${paid ? "" : '<div class="po-ed-parc-actions"><button type="button" class="btn btn-secondary" data-parc-add>+ Parcela</button><button type="button" class="btn btn-secondary" data-parc-split>Dividir o total igualmente</button><button type="button" class="btn btn-secondary" data-parc-clear>Usar a condição</button></div>'}
    </section>
    <label class="po-ed-wide">Motivo da alteração<input class="tw-field" name="motivo" placeholder="Ex.: a nota veio com outro preço"></label>
    <footer class="almox-modal-actions"><button type="button" class="btn btn-secondary" data-close>Fechar</button>${locked ? "" : '<button type="submit" class="btn btn-primary">Salvar alterações</button>'}</footer></form>`;
  document.body.append(d);
  d.querySelectorAll("[data-close]").forEach((b) => { b.onclick = () => d.close(); });
  d.addEventListener("close", () => d.remove());
  const lineTotal = (tr) => Math.round(Number(tr.querySelector("[name=quantidade]").value || 0) * Number(tr.querySelector("[name=valor_unitario]").value || 0) * 100) / 100;
  const totalNow = () => [...d.querySelectorAll("[data-po-item]")].reduce((sum, tr) => sum + lineTotal(tr), 0);
  const paint = () => {
    d.querySelectorAll("[data-po-item]").forEach((tr) => { tr.querySelector("[data-sub]").textContent = formatCurrency(lineTotal(tr)); });
    const total = totalNow();
    const amounts = [...d.querySelectorAll("[data-parc] [name=amount]")];
    const sum = amounts.reduce((acc, i) => acc + Number(i.value || 0), 0);
    d.querySelector("[data-po-total]").textContent = formatCurrency(total);
    const el = d.querySelector("[data-po-parc-sum]");
    el.textContent = amounts.length ? formatCurrency(sum) : "pela condição";
    el.classList.toggle("is-diff", amounts.length > 0 && Math.abs(sum - total) > 0.05);
  };
  const renumber = () => d.querySelectorAll("[data-parc] b").forEach((b, i) => { b.textContent = i + 1; });
  d.addEventListener("input", paint);
  d.querySelector("[data-parc-add]")?.addEventListener("click", () => {
    const list = d.querySelector("[data-parc-list]");
    const last = list.querySelector("[data-parc]:last-child [name=due]")?.value;
    const next = last ? new Date(`${last}T12:00:00`) : new Date();
    next.setDate(next.getDate() + 30);
    list.insertAdjacentHTML("beforeend", parcRow({ due_date: next.toISOString().slice(0, 10), amount: 0 }, list.children.length));
    renumber(); paint();
  });
  d.querySelector("[data-parc-split]")?.addEventListener("click", () => {
    const rows = [...d.querySelectorAll("[data-parc] [name=amount]")];
    if (!rows.length) return;
    const total = totalNow(), part = Math.floor((total / rows.length) * 100) / 100;
    rows.forEach((i, k) => { i.value = (k === rows.length - 1 ? total - part * (rows.length - 1) : part).toFixed(2); });
    paint();
  });
  d.querySelector("[data-parc-clear]")?.addEventListener("click", () => { d.querySelector("[data-parc-list]").innerHTML = ""; paint(); });
  paint();
  d.querySelector("form").onsubmit = async (event) => {
    event.preventDefault();
    const form = event.target, button = form.querySelector("[type=submit]");
    const itens = [...d.querySelectorAll("[data-po-item]")].map((tr) => ({ id: tr.dataset.poItem, nome: tr.querySelector("[name=nome]").value, especificacao: tr.querySelector("[name=especificacao]").value, unidade: tr.querySelector("[name=unidade]").value, quantidade: Number(tr.querySelector("[name=quantidade]").value), valor_unitario: Number(tr.querySelector("[name=valor_unitario]").value) }));
    const parcRows = [...d.querySelectorAll("[data-parc]")];
    const data = { itens, condicao_pagamento: form.condicao_pagamento.value, forma_pagamento: form.forma_pagamento.value, prazo_acordado: form.prazo_acordado.value, observacoes: form.observacoes.value, motivo: form.motivo.value };
    if (!paid) data.parcelas = parcRows.length ? parcRows.map((r) => ({ due_date: r.querySelector("[name=due]").value, amount: Number(r.querySelector("[name=amount]").value) })) : null;
    button.disabled = true;
    try {
      const { data: res, error } = await TecnoweldAPI.getClient().rpc("receiving_update_purchase_order", { p_order: po.id, p_data: data });
      if (error) throw error;
      d.close();
      window.TecnoAlert?.success?.(res?.alteracoes ? `${code} atualizado (${res.alteracoes} alteração(ões)). Fica registrado no histórico do pedido.` : "Nada mudou no pedido.", "Pedido de compra");
    } catch (error) {
      button.disabled = false;
      window.TecnoAlert?.error?.(error?.message || "Não foi possível salvar o pedido.", "Pedido de compra");
    }
  };
  d.showModal();
  refreshIcons();
}

function openManualReceiptDialog(orderId) {
  const po = (incomingOrders || []).find((row) => row.id === orderId);
  if (!po) return;
  const required = receivingParams?.recebimento_exige_numero_nf !== false;
  const d = document.createElement("dialog");
  d.className = "almox-inline-dialog";
  d.innerHTML = `<form class="almox-modal-card compact"><header class="almox-modal-header"><div><h2>Receber sem XML</h2><p>PC-${escapeHtml(String(po.numero).padStart(6, "0"))} · ${escapeHtml(po.fornecedor || "")}</p></div></header>
    <div class="manual-receipt-grid">
      ${po.fechamento_mensal ? `<p class="manual-receipt-wide muted-line">Fornecedor com <b>fechamento mensal</b>: entrega sem nota. A nota vem no fechamento do mês; anexe o recibo, se tiver.</p>` : ""}
      <label>Número da NF${required && !po.sem_nota ? "" : " (opcional)"}<input class="tw-field" name="numero" ${required && !po.sem_nota ? "required" : ""} inputmode="numeric" autocomplete="off"></label>
      <label>Série<input class="tw-field" name="serie" autocomplete="off"></label>
      <label>Emissão<input class="tw-field" name="data" type="date" value="${new Date().toISOString().slice(0, 10)}"></label>
      <label class="manual-receipt-wide">Observação<input class="tw-field" name="obs" placeholder="${required ? "" : "Ex.: remessa sem nota, amostra..."}"></label>
      ${po.fechamento_mensal ? `<label class="manual-receipt-wide">Recibo do fornecedor (opcional, PDF ou foto)<input class="tw-field" name="arquivo" type="file" accept="application/pdf,image/*"></label>` : ""}
      ${po.sem_nota ? "" : `<label class="manual-receipt-wide">Arquivo da nota fiscal (PDF ou foto)${po.nf_arquivo_url ? " · Compras já anexou; envie outro só para trocar" : " *"}<input class="tw-field" name="arquivo" type="file" accept="application/pdf,image/*"></label>`}
    </div>
    <p class="muted-line">Os itens do pedido já vêm preenchidos com o saldo a receber. Você só confere as quantidades, responde o checklist e conclui.</p>
    <footer class="almox-modal-actions"><button type="button" class="btn btn-secondary" data-close>Cancelar</button><button type="submit" class="btn btn-primary">Iniciar conferência</button></footer></form>`;
  document.body.append(d);
  d.querySelector("[data-close]").onclick = () => d.close();
  d.addEventListener("close", () => d.remove());
  d.querySelector("form").onsubmit = async (event) => {
    event.preventDefault();
    const form = new FormData(event.target);
    const button = d.querySelector("[type=submit]");
    const arquivo = form.get("arquivo");
    const temArquivo = arquivo && arquivo.size > 0;
    if (String(form.get("numero") || "").trim() && !po.sem_nota && !po.nf_arquivo_url && !temArquivo) {
      window.TecnoAlert?.error?.("Anexe o arquivo da nota fiscal (PDF ou foto). Sem o arquivo, receba bipando o XML.", "Recebimento");
      return;
    }
    button.disabled = true;
    try {
      if (temArquivo) await TecnoweldAPI.setPurchaseOrderNfFile(po.id, arquivo);
      const receiptId = await TecnoweldAPI.createManualReceiptForPurchaseOrder(po.id, { numero: form.get("numero"), serie: form.get("serie"), dataEmissao: form.get("data"), observacao: form.get("obs") });
      d.close();
      activeNfeReceipt = await TecnoweldAPI.getNfeReceipt(receiptId);
      activeReceiptStep = 3;
      openReceiptWorkflow();
    } catch (error) {
      button.disabled = false;
      window.TecnoAlert?.error?.(error?.message || "Não foi possível iniciar o recebimento.", "Recebimento");
    }
  };
  d.showModal();
  d.querySelector("input")?.focus();
}

async function handleReceiptListClick(event) {
  const poEdit = event.target.closest("[data-po-edit]");
  if (poEdit) { openPurchaseOrderEditor(poEdit.dataset.poEdit); return; }
  const poXml = event.target.closest("[data-po-xml]");
  if (poXml) { pendingPurchaseOrderId = poXml.dataset.poXml; pendingPurchaseRequestId = null; startNewGoodsReceipt(); return; }
  const poManual = event.target.closest("[data-po-manual]");
  if (poManual) { openManualReceiptDialog(poManual.dataset.poManual); return; }
  const purchaseButton = event.target.closest("[data-open-purchase-receipt]");
  if (purchaseButton) {
    pendingPurchaseOrderId = null;
    pendingPurchaseRequestId = purchaseButton.dataset.openPurchaseReceipt;
    startNewGoodsReceipt();
    return;
  }
  const button = event.target.closest("[data-open-receipt]");
  if (!button) return;
  activeNfeReceipt = await TecnoweldAPI.getNfeReceipt(button.dataset.openReceipt);
  activeReceiptStep = activeNfeReceipt.concluido_em ? 5 : Number(activeNfeReceipt.etapa || 1);
  openReceiptWorkflow();
}

function startNewGoodsReceipt() {
  activeNfeReceipt = { etapa: 1, status: "rascunho", itens: [], leituras: [], purchase_request_id: pendingPurchaseRequestId };
  activeReceiptStep = 1;
  openReceiptWorkflow();
}

function openReceiptWorkflow() {
  almoxEls.goodsReceiptDashboard.classList.add("hidden");
  almoxEls.goodsReceiptWorkflow.classList.remove("hidden");
  renderReceiptWorkflow();
}

function renderReceiptWorkflow() {
  almoxEls.receiptSteps.innerHTML = receiptStepDefinitions.map(([number, label]) => `<button type="button" data-receipt-step="${number}" class="${number === activeReceiptStep ? "active" : ""} ${number < activeReceiptStep ? "done" : ""}" ${number > Number(activeNfeReceipt?.etapa || 1) || activeNfeReceipt?.concluido_em ? "disabled" : ""}><span>${String(number).padStart(2,"0")}</span><strong>${label}</strong></button>`).join("");
  const renderers = [null, renderReceiptIdentifyStep, renderReceiptLinkStep, renderReceiptCheckStep, renderReceiptDivergenceStep, renderReceiptReviewStep];
  almoxEls.receiptStepContent.innerHTML = (activeNfeReceipt?.purchase_order_id && activeReceiptStep === 1 ? `<div class="receipt-po-bar"><button type="button" class="btn btn-secondary receipt-po-open" data-po-edit="${escapeAttr(activeNfeReceipt.purchase_order_id)}"><i data-lucide="file-text"></i> Ver / alterar o pedido de compra</button></div>` : "") + renderers[activeReceiptStep]();
  // (2026-10-10) "Ver / alterar o pedido de compra" só na etapa 1 (Identificar nota), à direita do título
  const poBar = almoxEls.receiptStepContent.querySelector(".receipt-po-bar");
  const stepHead = almoxEls.receiptStepContent.querySelector(".receipt-guided-panel > header");
  if (poBar && stepHead) { stepHead.classList.add("has-po-action"); stepHead.append(poBar.querySelector(".receipt-po-open")); poBar.remove(); }
  // (2026-10-10) leitor (bipe) da etapa 3 na mesma linha do título da etapa
  const scanArea = almoxEls.receiptStepContent.querySelector(".receipt-guided-panel > .receipt-scan-area");
  if (scanArea && stepHead) { stepHead.classList.add("has-scan-area"); stepHead.append(scanArea); }
  almoxEls.previousReceiptStep.classList.toggle("hidden", activeReceiptStep === 1 || Boolean(activeNfeReceipt?.concluido_em));
  almoxEls.nextReceiptStep.classList.toggle("hidden", Boolean(activeNfeReceipt?.concluido_em));
  almoxEls.nextReceiptStep.textContent = ["", "Continuar para vinculação", "Continuar para conferência", "Continuar para divergências", "Continuar para revisão", "Concluir recebimento e dar entrada"][activeReceiptStep];
  refreshIcons();
  if (activeReceiptStep === 3) setTimeout(() => document.getElementById("receiptScanner")?.focus(), 0);
}

function renderReceiptIdentifyStep() {
  const note = activeNfeReceipt || {};
  if (!note.id) return `<section class="receipt-guided-panel"><header><span>ETAPA 01</span><h2>Identificar nota</h2><p>Importe o XML da NF-e para começar.</p></header><label class="receipt-xml-drop"><i data-lucide="file-up"></i><strong>Arraste ou selecione o XML da NF-e</strong><small>Apenas arquivos XML válidos, até 5 MB</small><input id="receiptXmlFile" type="file" accept=".xml,text/xml,application/xml"></label><label class="receipt-access-key">Ou informe a chave de acesso de uma NF-e já importada antes<span class="receipt-access-key-row"><input id="receiptAccessKey" class="tw-field" inputmode="numeric" maxlength="44" placeholder="44 dígitos"><button type="button" id="receiptAccessKeySearchBtn" class="btn btn-secondary" data-search-access-key>Buscar</button></span><small>A busca só localiza notas cujo XML já foi importado antes. Para uma nota nova, importe o XML acima.</small></label></section>`;
  return `<section class="receipt-guided-panel"><header><span>ETAPA 01</span><h2>Nota identificada</h2></header><div class="receipt-note-summary"><div><span>Fornecedor</span><strong>${escapeHtml(note.fornecedor)}</strong></div><div><span>CNPJ</span><strong>${escapeHtml(formatDocument(note.cnpj_fornecedor))}</strong></div><div><span>NF-e</span><strong>${escapeHtml(note.numero_nfe)} · Série ${escapeHtml(note.serie || "-")}</strong></div><div><span>Emissão</span><strong>${formatDateTime(note.data_emissao)}</strong></div><div><span>Itens</span><strong>${note.itens?.length || 0}</strong></div><div><span>Valor total</span><strong>${formatCurrency(note.valor_total)}</strong></div></div><div class="receipt-key-line"><span>Chave de acesso</span><code>${escapeHtml(note.chave_nfe)}</code></div></section>`;
}

function renderReceiptLinkStep() {
  const receivable=(purchaseRequests||[]).filter(request=>["comprada","aguardando_recebimento","recebida_parcial"].includes(request.status));
  return `<section class="receipt-guided-panel"><header><span>ETAPA 02</span><h2>Vincular produtos</h2><p>O nome interno permanece no cadastro. A descrição e o código da nota ficam vinculados ao CNPJ ${escapeHtml(activeNfeReceipt.cnpj_fornecedor || "")} deste fornecedor, com a unidade de compra e o fator de conversão, para reconhecer as próximas notas.</p></header><div class="receipt-link-list">${(activeNfeReceipt.itens || []).map((item) => `<article class="receipt-link-item ${item.material_id || !item.controlado_estoque ? "linked" : "pending"}"><div><small>${escapeHtml(item.codigo_fornecedor || "Sem código")} ${item.gtin ? `· ${escapeHtml(item.gtin)}` : ""}</small><strong>${escapeHtml(item.descricao_xml)}</strong><small>Descrição na nota do fornecedor</small><span>${formatNumber(item.quantidade_xml)} ${escapeHtml(item.unidade_xml || "")}</span></div><label>Produto interno<select class="tw-field" data-link-material="${item.id}"><option value="">Selecione um insumo</option>${materials.filter((material) => material.status !== "inativo" || material.id === item.material_id).map((material) => `<option value="${material.id}" ${material.id === item.material_id ? "selected" : ""}>${escapeHtml(material.codigo)} · ${escapeHtml(material.nome)}</option>`).join("")}</select></label><label>Item comprado<select class="tw-field" data-link-purchase="${item.id}"><option value="">Sem vínculo de compra</option>${receivable.filter(request=>!item.material_id||request.material_id===item.material_id).map(request=>`<option value="${request.id}" ${request.id===item.purchase_request_id?"selected":""}>${request.production_order?`Pedido ${escapeHtml(request.production_order.numero)} · `:""}${escapeHtml(request.material?.nome||request.descricao_item||"Item")} · ${formatNumber(request.recebido_quantidade||0)}/${formatNumber(request.quantidade)}</option>`).join("")}</select></label><label>Fator de conversão<input class="tw-field" data-link-factor="${item.id}" type="number" min="0.000001" step="0.001" value="${escapeAttr(item.fator_conversao ?? 1)}"></label><div class="receipt-conversion">${formatNumber(item.quantidade_xml)} ${escapeHtml(item.unidade_xml || "")} × ${formatNumber(item.fator_conversao ?? 1)} = <strong>${formatNumber(Number(item.quantidade_xml || 0) * Number(item.fator_conversao ?? 1))} ${escapeHtml(item.unidade_interna || "")}</strong></div><label class="receipt-uncontrolled"><input type="checkbox" data-uncontrolled-item="${item.id}" ${item.controlado_estoque === false ? "checked" : ""}> Não controlar no estoque</label></article>`).join("")}</div></section>`;
}

function renderReceiptCheckStep() {
  const items = activeNfeReceipt.itens || [];
  const done = items.filter((item) => Number(item.quantidade_recebida) > 0).length;
  return `<section class="receipt-guided-panel"><header><span>ETAPA 03</span><h2>Conferir mercadorias</h2><p>Leia o código de barras ou informe as quantidades manualmente.</p></header><div class="receipt-scan-area"><label>Leia o código de barras do produto<div><i data-lucide="scan-barcode"></i><input id="receiptScanner" autocomplete="off" placeholder="Aguardando leitura..."></div></label><button type="button" class="btn btn-secondary" data-undo-scan>Desfazer última leitura</button></div><div class="receipt-progress"><span><strong>${done}</strong> de ${items.length} itens iniciados</span><i><b style="width:${items.length ? done/items.length*100 : 0}%"></b></i></div><div class="receipt-check-list">${items.filter((item) => item.controlado_estoque !== false).map((item) => { const diff=Number(item.quantidade_recebida||0)-Number(item.quantidade_xml||0); return `<article class="receipt-check-item ${diff===0&&Number(item.quantidade_recebida)>0?"ok":diff!==0&&Number(item.quantidade_recebida)>0?"different":"pending"}" data-check-item="${item.id}"><div><small>${escapeHtml(item.codigo_fornecedor || item.gtin || "-")}</small><strong>${escapeHtml(item.descricao_xml)}</strong><small>Descrição na nota do fornecedor</small><span>Esperado: ${formatNumber(item.quantidade_xml)} ${escapeHtml(item.unidade_xml || "")}</span></div><label>Recebido<input class="tw-field" data-received-item="${item.id}" type="number" min="0" step="0.001" value="${escapeAttr(item.quantidade_recebida || 0)}"></label><label>Avariado<input class="tw-field" data-damaged-item="${item.id}" type="number" min="0" step="0.001" value="${escapeAttr(item.quantidade_avariada || 0)}"></label><div class="receipt-difference"><span>Diferença</span><strong>${formatNumber(diff)}</strong></div></article>`; }).join("")}</div></section>`;
}

// (2026-10-10) Resolver divergências reescrita em linguagem simples: números do que chegou, "O que aconteceu?"
// (sugerido) e "O que fazer?" em cartões com a consequência. As decisões gravadas são as mesmas de antes:
// dar entrada = aceitar_quantidade/receber_parcialmente (entra recebido - avariado); segurar = deixar_pendente;
// devolver = devolver_fornecedor (nada entra). O que faltou continua em aberto no pedido de compra.
const RECEIPT_DIVERGENCE_REASONS = [
  ["quantidade_menor", "Faltou material (chegou menos que a nota)"],
  ["quantidade_maior", "Veio material a mais"],
  ["material_avariado", "Material avariado"],
  ["embalagem_danificada", "Embalagem danificada"],
  ["produto_diferente", "Produto diferente do pedido"],
  ["produto_nao_solicitado", "Produto não solicitado"],
  ["lote_divergente", "Lote diferente"],
  ["validade_divergente", "Validade diferente"],
  ["outro", "Outro motivo"]
];
function renderReceiptDivergenceStep() {
  const divergent = (activeNfeReceipt.itens || []).filter((item) => Number(item.quantidade_recebida) !== Number(item.quantidade_xml) || Number(item.quantidade_avariada) > 0);
  if (!divergent.length) return `<section class="receipt-guided-panel receipt-no-divergence"><i data-lucide="circle-check"></i><h2>Todos os produtos foram conferidos corretamente.</h2><p>Nenhuma divergência encontrada.</p></section>`;
  const cards = divergent.map((item) => {
    const div = item.divergencias?.find((d) => d.tipo !== "rnc") || {};
    const unit = escapeHtml(item.unidade_interna || item.unidade_xml || "");
    const nota = Number(item.quantidade_xml || 0), chegou = Number(item.quantidade_recebida || 0), avariado = Number(item.quantidade_avariada || 0);
    const bom = Math.max(0, chegou - avariado), falta = Math.max(0, nota - chegou), sobra = Math.max(0, chegou - nota);
    const fatos = [
      falta ? `faltaram <b>${formatNumber(falta)} ${unit}</b>` : "",
      sobra ? `vieram <b>${formatNumber(sobra)} ${unit}</b> a mais` : "",
      avariado ? `<b>${formatNumber(avariado)} ${unit}</b> chegaram avariadas` : ""
    ].filter(Boolean);
    const suggested = div.tipo || (avariado && !falta && !sobra ? "material_avariado" : falta ? "quantidade_menor" : sobra ? "quantidade_maior" : avariado ? "material_avariado" : "outro");
    const enterValue = falta || avariado ? "receber_parcialmente" : "aceitar_quantidade";
    const chosen = div.decisao === "aceitar_quantidade" || div.decisao === "receber_parcialmente" ? enterValue : (div.decisao === "recusar_item" ? "devolver_fornecedor" : div.decisao || "");
    const option = (value, title, desc) => `<label class="div-choice${chosen === value ? " is-selected" : ""}"><input type="radio" name="div-dec-${item.id}" data-divergence-decision="${item.id}" value="${value}"${chosen === value ? " checked" : ""}><span><strong>${title}</strong><small>${desc}</small></span></label>`;
    const enterDesc = (bom ? `Entram no estoque as <b>${formatNumber(bom)} ${unit}</b> em bom estado.` : "Nada entra no estoque (não há peça em bom estado).")
      + (falta ? ` O que faltou (${formatNumber(falta)} ${unit}) continua em aberto no pedido de compra, aguardando o fornecedor.` : "")
      + (avariado ? ((item.divergencias || []).some((d) => d.tipo === "rnc" && d.status === "aberta") ? " O avariado entra bloqueado pela RNC até Compras decidir." : " O avariado não entra (use Gerar RNC abaixo se Compras precisar decidir sobre ele).") : "");
    const fact = fatos.length ? fatos.join(" e ").replace(/^./, (c) => c.toUpperCase()) + "." : "Divergência no item.";
    return `<article class="div-card">
      <header class="div-card-head"><div><small>${escapeHtml(item.codigo_interno || item.codigo_fornecedor || "")}</small><strong title="${escapeAttr(item.descricao_xml || "")}">${escapeHtml(item.descricao_xml)}</strong></div>
        <div class="div-numbers"><span><small>Na nota</small><b>${formatNumber(nota)}</b></span><span><small>Chegou</small><b>${formatNumber(chegou)}</b></span><span class="${avariado ? "is-bad" : ""}"><small>Avariado</small><b>${formatNumber(avariado)}</b></span><span class="is-good"><small>Bom para estoque</small><b>${formatNumber(bom)} ${unit}</b></span></div></header>
      <p class="div-fact">${fact}</p>
      <div class="div-grid">
        <section><h4>1. O que aconteceu?</h4><select class="tw-field" data-divergence-type="${item.id}">${RECEIPT_DIVERGENCE_REASONS.map(([v, t]) => `<option value="${v}"${v === suggested ? " selected" : ""}>${t}</option>`).join("")}</select><small class="div-hint">Já vem preenchido conforme o que foi conferido; troque se o motivo for outro.</small></section>
        <section class="div-actions"><h4>2. O que fazer?</h4>
          ${option(enterValue, bom ? `Dar entrada no que chegou bom (${formatNumber(bom)} ${unit})` : "Registrar sem entrada", enterDesc)}
          ${option("deixar_pendente", "Segurar a entrada por enquanto", "Nada entra no estoque agora. O recebimento fica marcado com divergência até alguém resolver.")}
          ${option("devolver_fornecedor", "Devolver ao fornecedor", "Nada entra no estoque. O material volta ao fornecedor e o pedido de compra continua em aberto.")}
        </section>
      </div>
      <div class="div-extra"><label>Observação (opcional)<textarea class="tw-field" data-divergence-note="${item.id}" placeholder="Ex.: transportadora entregou 2 caixas amassadas">${escapeHtml(div.descricao || "")}</textarea></label>
        <label>Fotos ou comprovantes<input type="file" data-divergence-files="${item.id}" accept="image/*,.pdf" multiple><span class="div-previews" data-div-previews="${item.id}"></span></label></div>
      ${avariado ? `<p class="div-rnc-hint"><i data-lucide="info"></i><span>Para Compras negociar troca ou abatimento do avariado, use <b>Gerar RNC</b> no bloco <b>Não conformidade</b> logo abaixo.</span></p>` : ""}
    </article>`;
  }).join("");
  return `<section class="receipt-guided-panel"><header><span>ETAPA 04</span><h2>Resolver divergências</h2><p>Para cada item que não bateu com a nota, diga o que aconteceu e o que fazer com ele.</p></header><div class="receipt-divergence-list div-list">${cards}</div></section>`;
}

function renderReceiptReviewStep() {
  const items = activeNfeReceipt.itens || [];
  const divergent = items.filter((item) => Number(item.quantidade_recebida) !== Number(item.quantidade_xml) || Number(item.quantidade_avariada) > 0);
  const entryQty = items.reduce((sum,item)=>sum+Number(item.quantidade_entrada||0),0);
  if (activeNfeReceipt.concluido_em) return `<section class="receipt-guided-panel receipt-complete"><i data-lucide="badge-check"></i><h2>Recebimento concluído</h2><p>A entrada foi registrada no estoque em ${formatDateTime(activeNfeReceipt.concluido_em)}.</p><button class="btn btn-secondary" type="button" data-print-receipt-report><i data-lucide="printer"></i> Imprimir comprovante</button></section>`;
  return `<section class="receipt-guided-panel"><header><span>ETAPA 05</span><h2>Revisar e concluir</h2><p>Confira o resumo antes de autorizar a entrada no estoque.</p></header><div class="receipt-review-strip"><span><small>NF</small><b>${escapeHtml(activeNfeReceipt.numero_nfe)}</b></span><span class="is-wide"><small>Fornecedor</small><b>${escapeHtml(activeNfeReceipt.fornecedor)}</b></span><span><small>Produtos</small><b>${items.length}</b></span><span><small>Valor da nota</small><b>${formatCurrency(activeNfeReceipt.valor_total)}</b></span><span class="is-ok"><small>Corretos</small><b>${items.length-divergent.length}</b></span><span class="${divergent.length ? "is-warn" : ""}"><small>Com divergência</small><b>${divergent.length}</b></span><span><small>Entra no estoque</small><b>${formatNumber(entryQty)}${(() => { const bl = items.reduce((s2, it) => s2 + (it.divergencias || []).filter((d) => d.tipo === "rnc" && d.status === "aberta").reduce((x, d) => x + Number(d.quantidade || 0), 0), 0); return bl ? ` <em>(${formatNumber(bl)} bloq. RNC)</em>` : ""; })()}</b></span><span><small>Responsável</small><b>${escapeHtml(currentWarehouseUser()?.nome || "Usuário autenticado")}</b></span></div><label class="receipt-confirmation"><input id="receiptFinalConfirmation" type="checkbox"> Confirmo que conferi os materiais e autorizo a entrada das quantidades aceitas no estoque.</label><p class="receipt-final-warning">Ao concluir, as quantidades aceitas serão adicionadas ao estoque e o recebimento não poderá ser editado normalmente.</p></section>`;
}

function currentWarehouseUser() {
  try { return JSON.parse(localStorage.getItem("tecnoweld_usuario_logado") || "null"); } catch { return null; }
}

async function handleReceiptWorkflowChange(event) {
  if (event.target.id === "receiptXmlFile") return importReceiptXml(event.target.files?.[0]);
  const item = (activeNfeReceipt?.itens || []).find((row) => row.id === (event.target.dataset.linkMaterial || event.target.dataset.linkPurchase || event.target.dataset.linkFactor || event.target.dataset.uncontrolledItem || event.target.dataset.receivedItem || event.target.dataset.damagedItem));
  if (!item) return;
  if (event.target.dataset.linkMaterial) {
    const material = materials.find((row) => row.id === event.target.value);
    item.material_id = material?.id || null; item.codigo_interno = material?.codigo || null; item.unidade_interna = material?.unidade || null;
    item.purchase_request_id = null;
    item.fator_conversao = 1;
    item.tool_type_id = null;
    item.controlado_estoque = true;
  }
  if (event.target.dataset.linkPurchase) {
    item.purchase_request_id = event.target.value || null;
    const linked = (purchaseRequests || []).find((request) => request.id === item.purchase_request_id);
    if (linked?.tool_type_id) { item.tool_type_id = linked.tool_type_id; item.controlado_estoque = false; item.material_id = null; }
    else if (item.tool_type_id) { item.tool_type_id = null; item.controlado_estoque = true; }
  }
  if (event.target.dataset.linkFactor) item.fator_conversao = Number(event.target.value);
  if (event.target.dataset.uncontrolledItem) item.controlado_estoque = !event.target.checked;
  if (event.target.dataset.receivedItem) item.quantidade_recebida = Number(event.target.value || 0);
  if (event.target.dataset.damagedItem) item.quantidade_avariada = Number(event.target.value || 0);
  calculateReceiptItem(item);
  scheduleReceiptAutosave();
  if (activeReceiptStep === 2 || activeReceiptStep === 3) renderReceiptWorkflow();
}

function handleReceiptXmlDragOver(event) {
  const drop = event.target.closest(".receipt-xml-drop");
  if (!drop) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = "copy";
  drop.classList.add("is-dragging");
}

function handleReceiptXmlDragLeave(event) {
  const drop = event.target.closest(".receipt-xml-drop");
  if (drop && !drop.contains(event.relatedTarget)) drop.classList.remove("is-dragging");
}

function handleReceiptXmlDrop(event) {
  const drop = event.target.closest(".receipt-xml-drop");
  if (!drop) return;
  event.preventDefault();
  drop.classList.remove("is-dragging");
  importReceiptXml(event.dataTransfer?.files?.[0]);
}

function handleReceiptWorkflowClick(event) {
  const poEdit = event.target.closest("[data-po-edit]");
  if (poEdit) { openPurchaseOrderEditor(poEdit.dataset.poEdit); return; }
  const stepButton = event.target.closest("[data-receipt-step]");
  if (stepButton && !stepButton.disabled) { activeReceiptStep = Number(stepButton.dataset.receiptStep); renderReceiptWorkflow(); return; }
  if (event.target.closest("[data-undo-scan]")) return undoLastReceiptScan();
  if (event.target.closest("[data-search-access-key]")) lookupNfeReceiptByAccessKey();
  const unknownItem=event.target.closest("[data-link-receipt-barcode]"); if(unknownItem) linkUnknownReceiptBarcode(unknownItem.dataset.linkReceiptBarcode);
}

function handleReceiptWorkflowKeydown(event) {
  if (event.target.dataset.receiptLocation && event.key === "Enter") { event.preventDefault(); saveReceiptItemLocation(event.target); return; }
  if (event.target.id === "receiptAccessKey" && event.key === "Enter") {
    event.preventDefault();
    lookupNfeReceiptByAccessKey();
    return;
  }
  if (event.target.id !== "receiptScanner" || event.key !== "Enter") return;
  event.preventDefault();
  const code = event.target.value.replace(/\s+/g, "");
  event.target.value = "";
  processReceiptScan(code);
}

async function saveReceiptItemLocation(input){try{const location=await TecnoweldAPI.resolveWarehouseScan(input.value);if(location?.kind!=="location")throw new Error("Localização não reconhecida.");const item=(activeNfeReceipt.itens||[]).find(i=>i.id===input.dataset.receiptLocation);item.warehouse_location_id=location.entity_id;item.warehouse_location_code=location.code;await TecnoweldAPI.updateNfeReceiptItem(item.id,receiptItemUpdatePayload(item));input.value=location.code;input.classList.add("is-valid");setTimeout(()=>document.getElementById("receiptScanner")?.focus(),20);}catch(e){window.TecnoAlert?.info?.(e.message,"Localização inválida");input.select();}}

async function lookupNfeReceiptByAccessKey() {
  const input = document.getElementById("receiptAccessKey");
  const key = (input?.value || "").replace(/\D/g, "");
  if (key.length !== 44) {
    window.TecnoAlert?.info?.("A chave de acesso da NF-e deve ter 44 dígitos.", "Nota Fiscal");
    return;
  }
  const btn = document.getElementById("receiptAccessKeySearchBtn");
  if (btn) btn.disabled = true;
  try {
    const found = await TecnoweldAPI.findNfeReceiptByKey(key);
    if (!found) {
      window.TecnoAlert?.info?.("Nenhum recebimento encontrado com esta chave. Importe o XML da NF-e para começar um novo recebimento.", "Nota Fiscal");
      return;
    }
    activeNfeReceipt = await TecnoweldAPI.getNfeReceipt(found.id);
    activeReceiptStep = activeNfeReceipt.concluido_em ? 5 : Number(activeNfeReceipt.etapa || 1);
    renderReceiptWorkflow();
    window.TecnoAlert?.success?.(`NF-e localizada (${receiptStatusLabel(found.status)}). Recebimento reaberto.`, "Nota Fiscal");
  } catch (error) {
    console.error(error);
    window.TecnoAlert?.error?.(error?.message || "Não foi possível buscar esta chave de acesso.", "Nota Fiscal");
  } finally {
    if (btn) btn.disabled = false;
  }
}

let receiptAutosaveTimer = null;
function scheduleReceiptAutosave() {
  clearTimeout(receiptAutosaveTimer);
  almoxEls.receiptAutosaveState.textContent = "Salvando rascunho...";
  receiptAutosaveTimer = setTimeout(async () => {
    try {
      if (activeNfeReceipt?.id) {
        await Promise.all((activeNfeReceipt.itens || []).map((item) => TecnoweldAPI.updateNfeReceiptItem(item.id, receiptItemUpdatePayload(item))));
        almoxEls.receiptAutosaveState.textContent = "Rascunho salvo automaticamente";
      }
    } catch { almoxEls.receiptAutosaveState.textContent = "Não foi possível salvar o rascunho"; }
  }, 500);
}

function receiptItemUpdatePayload(item) {
  return { purchase_request_id:item.purchase_request_id||null,material_id:item.material_id||null,codigo_interno:item.codigo_interno||null,unidade_interna:item.unidade_interna||null,fator_conversao:Number(item.fator_conversao??1),controlado_estoque:item.controlado_estoque!==false,tool_type_id:item.tool_type_id||null,lote:item.lote?String(item.lote).trim()||null:null,justificativa_nao_controlado:item.justificativa_nao_controlado||null,quantidade_recebida:Number(item.quantidade_recebida||0),quantidade_avariada:Number(item.quantidade_avariada||0),quantidade_aceita:Number(item.quantidade_aceita||0),quantidade_entrada:Number(item.quantidade_entrada||0),diferenca:Number(item.diferenca||0),status:item.status||"nao_iniciado",observacao:item.observacao||null,warehouse_location_id:item.warehouse_location_id||null };
}

function calculateReceiptItem(item) {
  item.diferenca = Number(item.quantidade_recebida || 0) - Number(item.quantidade_xml || 0);
  item.quantidade_aceita = Math.max(0, Number(item.quantidade_recebida || 0) - Number(item.quantidade_avariada || 0));
  item.quantidade_entrada = item.quantidade_aceita * Number(item.fator_conversao ?? 1);
  item.status = item.quantidade_recebida <= 0 ? "nao_iniciado" : item.diferenca === 0 && Number(item.quantidade_avariada || 0) === 0 ? "correto" : "divergencia";
}

async function importReceiptXml(file) {
  if (!file) return;
  if (!/\.xml$/i.test(file.name) || file.size > 5 * 1024 * 1024) return window.TecnoAlert?.error?.("Selecione um XML de NF-e com até 5 MB.", "Arquivo inválido");
  try {
    const xmlText = await file.text();
    const parsed = parseInvoiceXml(xmlText);
    if (!parsed.nota.chave || parsed.nota.chave.length !== 44) throw new Error("A chave de acesso da NF-e não foi encontrada.");
    if (!parsed.produtos.length) throw new Error("A NF-e não possui produtos.");
    const duplicated = await TecnoweldAPI.findNfeReceiptByKey(parsed.nota.chave);
    if (duplicated) {
      activeNfeReceipt = await TecnoweldAPI.getNfeReceipt(duplicated.id);
      if (pendingPurchaseRequestId && !activeNfeReceipt.purchase_request_id) {
        await TecnoweldAPI.updateNfeReceipt(activeNfeReceipt.id,{purchase_request_id:pendingPurchaseRequestId});
        activeNfeReceipt.purchase_request_id = pendingPurchaseRequestId;
      }
      if (!(activeNfeReceipt.itens || []).length) {
        const recoveredItems = await buildNfeReceiptItems(parsed);
        if (!recoveredItems.length) throw new Error("A NF-e foi localizada, mas seus produtos não puderam ser recuperados do XML.");
        activeNfeReceipt = await TecnoweldAPI.saveNfeReceiptDraft(activeNfeReceipt, recoveredItems);
      }
      activeReceiptStep = activeNfeReceipt.concluido_em ? 5 : Number(activeNfeReceipt.etapa || 1);
      renderReceiptWorkflow();
      window.TecnoAlert?.info?.(`Esta NF-e já foi importada (${receiptStatusLabel(duplicated.status)}). O recebimento existente foi aberto.`, "NF-e já cadastrada");
      return;
    }
    const company = await TecnoweldAPI.getCompanyProfile().catch(() => null);
    const companyDocument = String(company?.cnpj || company?.documento || "").replace(/\D/g, "");
    if (companyDocument && parsed.nota.cnpjDestinatario && companyDocument !== parsed.nota.cnpjDestinatario) throw new Error("O CNPJ do destinatário não corresponde à empresa configurada.");
    if (pendingPurchaseOrderId) {
      const po = (incomingOrders || []).find((row) => row.id === pendingPurchaseOrderId);
      const poDoc = String(po?.cnpj_fornecedor || "").replace(/\D/g, "");
      if (poDoc && parsed.nota.cnpj && poDoc !== String(parsed.nota.cnpj).replace(/\D/g, "")) {
        const ok = await window.TecnoAlert?.confirm?.({ title: "CNPJ diferente do pedido", message: `A nota é de ${parsed.nota.fornecedor} (${formatDocument(parsed.nota.cnpj)}), mas o PC-${String(po.numero).padStart(6, "0")} é de ${po.fornecedor} (${formatDocument(po.cnpj_fornecedor)}). Continuar mesmo assim?`, confirmText: "Continuar", cancelText: "Cancelar" });
        if (!ok) return;
      }
    }
    const hash = await hashReceiptXml(xmlText);
    const items = await buildNfeReceiptItems(parsed);
    activeNfeReceipt = await TecnoweldAPI.saveNfeReceiptDraft({ chave_nfe:parsed.nota.chave,numero_nfe:parsed.nota.numero,serie:parsed.nota.serie,data_emissao:parsed.nota.dataEmissaoRaw,natureza_operacao:parsed.nota.naturezaOperacao,cnpj_fornecedor:parsed.nota.cnpj,fornecedor:parsed.nota.fornecedor,nome_fantasia_fornecedor:parsed.nota.nomeFantasiaFornecedor,inscricao_estadual_fornecedor:parsed.nota.inscricaoEstadualFornecedor,endereco_fornecedor:parsed.nota.enderecoFornecedor,cnpj_destinatario:parsed.nota.cnpjDestinatario,destinatario:parsed.nota.destinatario,endereco_destinatario:parsed.nota.enderecoDestinatario,valor_produtos:parsed.nota.valorProdutos,valor_frete:parsed.nota.valorFrete,valor_desconto:parsed.nota.valorDesconto,outras_despesas:parsed.nota.outrasDespesas,valor_impostos:parsed.nota.valorImpostos,valor_total:parsed.nota.valorTotal,status:items.every((item)=>item.material_id)?"aguardando_conferencia":"aguardando_vinculacao",etapa:1,nome_arquivo_xml:file.name,hash_xml:hash,xml_text:xmlText,purchase_request_id:pendingPurchaseRequestId,purchase_order_id:pendingPurchaseOrderId }, items);
    renderReceiptWorkflow();
    window.TecnoAlert?.success?.("NF-e importada e salva como rascunho.", "Recebimento");
  } catch (error) { window.TecnoAlert?.error?.(error?.message || "Não foi possível importar o XML.", "NF-e não importada"); }
}

async function buildNfeReceiptItems(parsed) {
  const links = await TecnoweldAPI.listSupplierProductLinks(parsed.nota.cnpj);
  return parsed.produtos.map((product) => {
    const link = findReceiptSupplierLink(product, links);
    const material = materials.find((row) => row.id === link?.material_id && row.status !== "inativo");
    const factor = Number(link?.fator_conversao || 1);
    return { numero_item:product.indice,codigo_fornecedor:product.codigoFornecedor||null,gtin:product.gtin||null,gtin_tributavel:product.gtinTributavel||null,descricao_xml:product.descricaoFornecedor,ncm:product.ncm||null,cfop:product.cfop||null,cest:product.cest||null,unidade_xml:product.unidade||null,quantidade_xml:product.quantidade,valor_unitario:product.valorUnitario,valor_total:product.valorTotal,unidade_tributavel:product.unidadeTributavel||null,quantidade_tributavel:product.quantidadeTributavel||null,lote:product.lote||null,validade:product.validade||null,material_id:material?.id||null,codigo_interno:material?.codigo||null,unidade_interna:material?.unidade||null,fator_conversao:factor,quantidade_recebida:0,quantidade_avariada:0,quantidade_aceita:0,quantidade_entrada:0,diferenca:-product.quantidade,status:"nao_iniciado",controlado_estoque:true };
  });
}

function findReceiptSupplierLink(product, links) {
  const unit = (value) => String(value || "").trim().toUpperCase();
  const code = String(product.codigoFornecedor || "").trim();
  const byCode = code ? links.filter((row) => row.codigo_fornecedor === code) : [];
  const candidates = byCode.length ? byCode : links.filter((row) => product.gtin && row.gtin === product.gtin);
  if (!candidates.length) return null;
  // Mudança de embalagem/unidade exige nova conferência do fator, mesmo com o mesmo código.
  if (candidates.some((row) => row.unidade_fornecedor && unit(row.unidade_fornecedor) !== unit(product.unidade))) return null;
  const first = candidates[0];
  if (candidates.some((row) => row.material_id !== first.material_id || Number(row.fator_conversao) !== Number(first.fator_conversao))) return null;
  if (!byCode.length && !first.unidade_fornecedor) return null;
  return Number.isFinite(Number(first.fator_conversao)) && Number(first.fator_conversao) > 0 ? first : null;
}

function validateReceiptSupplierMappings(items) {
  const seen = new Map();
  for (const item of items) {
    if (item.controlado_estoque === false || !item.material_id) continue;
    const identity = item.codigo_fornecedor ? `code:${item.codigo_fornecedor}` : item.gtin ? `gtin:${item.gtin}` : null;
    if (!identity) continue;
    const signature = JSON.stringify([item.material_id, Number(item.fator_conversao), String(item.unidade_xml || "").trim().toUpperCase()]);
    if (seen.has(identity) && seen.get(identity) !== signature) throw new Error(`O produto ${item.codigo_fornecedor || item.gtin} do fornecedor está associado a materiais ou conversões diferentes nesta nota. Revise os vínculos.`);
    seen.set(identity, signature);
  }
}

async function hashReceiptXml(text) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(bytes)].map((value)=>value.toString(16).padStart(2,"0")).join("");
}

async function nextGoodsReceiptStep() {
  try {
    if (activeReceiptStep === 1 && !activeNfeReceipt?.id) throw new Error("Importe o XML válido da NF-e antes de continuar.");
    if (activeReceiptStep === 1 && !(activeNfeReceipt.itens || []).length) await recoverStoredReceiptItems();
    if (activeReceiptStep === 2) {
      const pending = activeNfeReceipt.itens.filter((item)=>item.controlado_estoque!==false&&!item.material_id);
      if (pending.length) throw new Error(`Vincule ${pending.length} produto(s) ao estoque antes de continuar.`);
      if (activeNfeReceipt.itens.some((item) => item.controlado_estoque !== false && (!Number.isFinite(Number(item.fator_conversao)) || Number(item.fator_conversao) <= 0))) throw new Error("Informe um fator de conversão maior que zero para cada material.");
      validateReceiptSupplierMappings(activeNfeReceipt.itens);
      await Promise.all(activeNfeReceipt.itens.map(async (item) => {
        await TecnoweldAPI.updateNfeReceiptItem(item.id, receiptItemUpdatePayload(item));
        if (item.controlado_estoque !== false && item.material_id && (item.codigo_fornecedor || item.gtin)) await TecnoweldAPI.saveSupplierProductLink({cnpj_fornecedor:activeNfeReceipt.cnpj_fornecedor,codigo_fornecedor:item.codigo_fornecedor||null,gtin:item.gtin||null,descricao_fornecedor:item.descricao_xml,unidade_fornecedor:item.unidade_xml,unidade_interna:item.unidade_interna,material_id:item.material_id,fator_conversao:item.fator_conversao});
      }));
    }
    if (activeReceiptStep === 3) {
      if (activeNfeReceipt.itens.some((item)=>(item.controlado_estoque!==false||item.tool_type_id)&&Number(item.quantidade_recebida)<=0)) throw new Error("Informe a quantidade recebida de todos os produtos (materiais e ferramentas).");
      await Promise.all(activeNfeReceipt.itens.map((item)=>TecnoweldAPI.updateNfeReceiptItem(item.id,receiptItemUpdatePayload(item))));
    }
    if (activeReceiptStep === 4) await persistReceiptDivergences();
    if (activeReceiptStep === 5) {
      if (!document.getElementById("receiptFinalConfirmation")?.checked) throw new Error("Marque a confirmação de conferência antes de concluir.");
      almoxEls.nextReceiptStep.disabled = true;
      await TecnoweldAPI.completeNfeReceipt(activeNfeReceipt.id, true);
      activeNfeReceipt = await TecnoweldAPI.getNfeReceipt(activeNfeReceipt.id);
      await loadWarehouse();
      renderReceiptWorkflow();
      window.TecnoAlert?.success?.("Recebimento concluído e estoque atualizado.", "Recebimento");
      return;
    }
    activeReceiptStep += 1;
    await TecnoweldAPI.updateNfeReceipt(activeNfeReceipt.id,{etapa:activeReceiptStep,status:activeReceiptStep===2?"aguardando_vinculacao":activeReceiptStep===3?"em_conferencia":activeNfeReceipt.status});
    activeNfeReceipt.etapa = activeReceiptStep;
    renderReceiptWorkflow();
  } catch (error) { window.TecnoAlert?.error?.(error?.message || "Não foi possível avançar.", "Verifique esta etapa"); }
  finally { almoxEls.nextReceiptStep.disabled = false; }
}

async function recoverStoredReceiptItems() {
  if (!activeNfeReceipt?.xml_text) throw new Error("Esta NF-e foi salva sem produtos e não possui o XML armazenado. Importe o arquivo XML novamente para recuperar os itens.");
  const parsed = parseInvoiceXml(activeNfeReceipt.xml_text);
  const recoveredItems = await buildNfeReceiptItems(parsed);
  if (!recoveredItems.length) throw new Error("Não foi possível encontrar produtos no XML armazenado desta NF-e.");
  activeNfeReceipt = await TecnoweldAPI.saveNfeReceiptDraft(activeNfeReceipt, recoveredItems);
  window.TecnoAlert?.success?.(`${recoveredItems.length} produto(s) recuperado(s) do XML da NF-e.`, "Produtos recuperados");
}

function previousGoodsReceiptStep() { if (activeReceiptStep > 1) { activeReceiptStep -= 1; renderReceiptWorkflow(); } }

async function processReceiptScan(code) {
  if (!code) return;
  const now = Date.now(); if (lastReceiptScan.code === code && now-lastReceiptScan.at < 450) return;
  lastReceiptScan = {code,at:now};
  const matches = activeNfeReceipt.itens.filter((item)=>[item.gtin,item.gtin_tributavel,item.codigo_fornecedor].filter(Boolean).includes(code));
  if (!matches.length) return window.TecnoAlert?.warning?.("Este produto não pertence à nota fiscal atual.", "Código não encontrado");
  if (matches.length > 1) return window.TecnoAlert?.info?.("Mais de um item possui este código. Informe a quantidade manualmente na linha correta.", "Selecione o produto");
  const item=matches[0]; const previousQuantity=item.quantidade_recebida;
  item.quantidade_recebida=Number(item.quantidade_recebida||0)+1; calculateReceiptItem(item);
  try {
    const scan=await TecnoweldAPI.saveNfeScan({recebimento_id:activeNfeReceipt.id,item_id:item.id,codigo_lido:code,quantidade:1});
    activeNfeReceipt.leituras=[scan,...(activeNfeReceipt.leituras||[])];
    renderReceiptWorkflow(); scheduleReceiptAutosave();
    try { const audio=new AudioContext(); const osc=audio.createOscillator(); osc.connect(audio.destination); osc.frequency.value=720; osc.start(); osc.stop(audio.currentTime+.06); } catch {}
  } catch (error) {
    item.quantidade_recebida=previousQuantity; calculateReceiptItem(item); renderReceiptWorkflow();
    window.TecnoAlert?.error?.(error?.message || "Não foi possível registrar a leitura. Bipe novamente.", "Falha ao bipar");
  }
}

async function undoLastReceiptScan() {
  const scan=(activeNfeReceipt.leituras||[]).find((item)=>!item.desfeita); if(!scan)return;
  try {
    await TecnoweldAPI.undoNfeScan(scan.id); scan.desfeita=true;
    const item=activeNfeReceipt.itens.find((row)=>row.id===scan.item_id); if(item){item.quantidade_recebida=Math.max(0,Number(item.quantidade_recebida||0)-Number(scan.quantidade||1));calculateReceiptItem(item);await TecnoweldAPI.updateNfeReceiptItem(item.id,receiptItemUpdatePayload(item));}
    renderReceiptWorkflow();
  } catch (error) {
    window.TecnoAlert?.error?.(error?.message || "Não foi possível desfazer a leitura.", "Falha ao desfazer");
  }
}

async function persistReceiptDivergences() {
  const divergent=activeNfeReceipt.itens.filter((item)=>Number(item.quantidade_recebida)!==Number(item.quantidade_xml)||Number(item.quantidade_avariada)>0);
  for(const item of divergent){const type=document.querySelector(`[data-divergence-type="${item.id}"]`)?.value;const decision=document.querySelector(`input[data-divergence-decision="${item.id}"]:checked, select[data-divergence-decision="${item.id}"]`)?.value;const description=document.querySelector(`[data-divergence-note="${item.id}"]`)?.value||"";if(!type||!decision)throw new Error(`Escolha o que aconteceu e o que fazer com ${item.descricao_xml}.`);if(["recusar_item","devolver_fornecedor","deixar_pendente"].includes(decision)){item.quantidade_aceita=0;item.quantidade_entrada=0;}else if((item.divergencias||[]).some(d=>d.tipo==="rnc"&&d.status==="aberta")){item.quantidade_aceita=Number(item.quantidade_recebida||0);item.quantidade_entrada=item.quantidade_aceita*Number(item.fator_conversao??1);}const anexos=await receiptEvidenceFiles(document.querySelector(`[data-divergence-files="${item.id}"]`)?.files);await TecnoweldAPI.updateNfeReceiptItem(item.id,receiptItemUpdatePayload(item));await TecnoweldAPI.saveNfeDivergence({id:item.divergencias?.find(d=>d.tipo!=="rnc")?.id,recebimento_id:activeNfeReceipt.id,item_id:item.id,tipo:type,quantidade:Math.abs(Number(item.diferenca||0))+Number(item.quantidade_avariada||0),descricao:description,anexos:anexos.length?anexos:(item.divergencias?.find(d=>d.tipo!=="rnc")?.anexos||[]),decisao:decision,status:decision==="deixar_pendente"?"aberta":"resolvida",resolvido_em:decision==="deixar_pendente"?null:new Date().toISOString()});}
  activeNfeReceipt=await TecnoweldAPI.getNfeReceipt(activeNfeReceipt.id);
}

async function receiptEvidenceFiles(fileList) {
  const files=[...(fileList||[])];
  if(files.some((file)=>file.size>5*1024*1024))throw new Error("Cada evidência deve ter no máximo 5 MB.");
  return Promise.all(files.map((file)=>new Promise((resolve,reject)=>{const reader=new FileReader();reader.onerror=()=>reject(new Error("Não foi possível ler uma evidência."));reader.onload=()=>resolve({nome:file.name,tipo:file.type,tamanho:file.size,conteudo:reader.result});reader.readAsDataURL(file);})));
}

function formatDocument(value) {
  const digits=String(value||"").replace(/\D/g,"");
  return digits.length===14?digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5"):value||"-";
}

function selectMaterial(id) {
  selectedMaterial = materials.find((item) => item.id === id) || null;
  renderMaterialsTable();
  refreshIcons();
}

function openInvoiceReceipt() {
  invoiceReceipt = createEmptyInvoiceReceipt();
  pendingDivergenceIndex = null;
  clearInvoiceFields();
  renderInvoiceReceipt();
  openModal(almoxEls.invoiceEntryModal);
}

// Entrada manual so para sobra que volta da producao (devolucao de peca retirada e feita na Retirada).
function entryMaterialLabel(material) {
  return material.codigo ? `${material.codigo} · ${material.nome}` : material.nome;
}

function resolveEntryMaterial() {
  const value = almoxEls.entryMaterial.value.trim();
  if (!value) return null;
  return materials.find((item) => !isScrap(item) && (entryMaterialLabel(item) === value || item.codigo === value || normalizeText(item.nome) === normalizeText(value))) || null;
}

// Pedido de origem da sobra: lista dos pedidos em producao.
async function fillEntryOpOptions() {
  return fillOpSelect(almoxEls.entryOp);
}

// Lista dos pedidos em producao para selecao (retorno de sobra e saida para pedido).
async function fillOpSelect(select) {
  if (!select) return;
  try {
    const orders = (await ensureProductionOrders()).filter((order) => String(order.status || "").toLowerCase() === "em_andamento");
    select.innerHTML = orders.length
      ? `<option value="">Selecione o pedido</option>${orders.map((order) => `<option value="${escapeAttr(order.numero)}">Pedido ${escapeHtml(order.numero)} · ${escapeHtml(order.peca_nome || order.codigo_projeto || "")}</option>`).join("")}`
      : '<option value="">Nenhum pedido em produção</option>';
  } catch (error) {
    select.innerHTML = '<option value="">Não foi possível carregar os pedidos</option>';
  }
}

// Previa da foto da sobra.
function renderEntryPhotoPreview() {
  const box = almoxEls.entryScrapPhotoPreview;
  if (!box) return;
  const file = almoxEls.entryScrapPhoto?.files?.[0];
  if (box.dataset.url) URL.revokeObjectURL(box.dataset.url);
  if (!file) {
    delete box.dataset.url;
    box.innerHTML = "<span>Sem foto</span>";
    return;
  }
  const url = URL.createObjectURL(file);
  box.dataset.url = url;
  box.innerHTML = `<img src="${url}" alt="Prévia da foto da sobra">`;
}

function openEntryModal() {
  if (!requirePermission("Registrar entrada")) return;
  almoxEls.entryForm.reset();
  almoxEls.entryMaterialList.innerHTML = materials
    .filter((item) => !isScrap(item))
    .map((item) => `<option data-material-id="${escapeAttr(item.id)}" value="${escapeAttr(entryMaterialLabel(item))}"></option>`)
    .join("");
  const preset = selectedMaterial && !isScrap(selectedMaterial) ? selectedMaterial : null;
  almoxEls.entryMaterialId.value = preset?.id || "";
  almoxEls.entryMaterial.value = preset ? entryMaterialLabel(preset) : "";
  renderEntryPhotoPreview();
  fillEntryOpOptions();
  window.AlmoxEntryExit?.resetEntry();
  openModal(almoxEls.entryModal);
  window.AlmoxEntryExit?.renderHistory("entry");
}

function openExitModal(materialId) {
  if (!requirePermission("Registrar saida")) return;
  almoxEls.exitForm.reset();
  exitServiceOrdersRequest++; exitServiceOrders = []; exitServiceOrdersLoading = false;
  almoxEls.exitServiceOrder.innerHTML = '<option value="">Selecione a O.S.</option>'; almoxEls.exitServiceOrder.disabled = false;
  almoxEls.exitMaterial.value = "";
  exitCart = [];
  renderExitCart();
  almoxEls.exitScannedMaterial.classList.add("hidden");
  almoxEls.exitScannedMaterial.innerHTML = "";
  window.AlmoxEntryExit?.renderOperator("exit");
  fillOpSelect(almoxEls.exitOp);
  const material = materialId ? materials.find((item) => item.id === materialId) : null;
  if (material) addExitCartItem({kind:"material",material_id:material.id,entity_id:material.id,label:material.nome,code:material.codigo,units_per_scan:1,current_quantity:material.quantidade_disponivel,location_id:null,batch:null});
  syncExitMaterial();
  openModal(almoxEls.exitModal);
  window.AlmoxEntryExit?.renderHistory("exit");
  setTimeout(() => almoxEls.exitScanCode.focus(), 60);
}

function openQrModal(mode = "lookup") {
  if (mode === "separar") {
    if (!requirePermission("Separar material")) return;
  } else if (!requirePermission("Visualizar estoque")) {
    return;
  }
  qrModalMode = mode;
  almoxEls.qrManualInput.value = "";
  lastQrRead = "";
  hideQrReservationResult();
  if (qrModalMode === "separar") {
    almoxEls.qrModalTitle.textContent = "Bipar material";
    almoxEls.qrModalSubtitle.textContent = "Aponte a câmera ou digite o código do material/etiqueta para localizá-lo nesta pedido.";
  } else {
    almoxEls.qrModalTitle.textContent = "Ler QR Code";
    almoxEls.qrModalSubtitle.textContent = "Aponte a câmera ou digite o código manualmente.";
  }
  openModal(almoxEls.qrModal);
  startQrCamera();
}

function openModal(modal) {
  // Telas de trabalho (data-tab-screen) abrem como aba, dentro da pagina.
  if (modal.hasAttribute("data-tab-screen")) {
    const host = document.getElementById("almoxTabScreenHost");
    if (host && modal.parentElement !== host) host.appendChild(modal);
    host?.querySelectorAll(".almox-modal[data-tab-screen]").forEach((other) => {
      if (other !== modal) { other.classList.add("hidden"); other.setAttribute("aria-hidden", "true"); }
    });
    almoxEls.almoxContent.classList.add("has-tab-screen");
    modal.classList.remove("hidden");
    modal.setAttribute("aria-hidden", "false");
    window.scrollTo({ top: 0 });
    refreshIcons();
    return;
  }
  modal.classList.remove("hidden");
  modal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
  refreshIcons();
}

function closeAllModals() {
  document.getElementById('manageAddressesBtn')?.setAttribute('aria-expanded','false');
  document.querySelectorAll(".almox-modal").forEach((modal) => {
    modal.classList.add("hidden");
    modal.setAttribute("aria-hidden", "true");
  });
  document.body.classList.remove("modal-open");
  almoxEls.almoxContent?.classList.remove("has-tab-screen");
  pendingManualExit = null;
  pendingPosExit = null;
  pendingLoanAuthorization = null;
  if (almoxEls.movementPinInput) almoxEls.movementPinInput.value = "";
  stopQrCamera();
}

function createEmptyInvoiceReceipt() {
  return {
    nota: null,
    itens: []
  };
}

function clearInvoiceFields() {
  [
    almoxEls.invoiceBarcodeInput,
    almoxEls.invoiceAccessKey,
    almoxEls.invoiceSupplier,
    almoxEls.invoiceCnpj,
    almoxEls.invoiceNumber,
    almoxEls.invoiceSeries,
    almoxEls.invoiceIssueDate,
    almoxEls.invoiceTotal
  ].forEach((input) => {
    if (input) input.value = "";
  });
  if (almoxEls.invoiceXmlInput) almoxEls.invoiceXmlInput.value = "";
}

async function importarNotaFiscal() {
  const file = almoxEls.invoiceXmlInput.files?.[0];
  if (!file) return;
  try {
    const xmlText = await file.text();
    const parsed = parseInvoiceXml(xmlText);
    invoiceReceipt = {
      nota: parsed.nota,
      itens: conciliarProdutos(parsed.produtos)
    };
    fillInvoiceNoteFields();
    renderInvoiceReceipt();
    window.TecnoAlert?.success?.("XML importado para conferência.", "Nota Fiscal");
  } catch (error) {
    console.error(error);
    window.TecnoAlert?.error?.("Não foi possível ler este XML. Verifique o arquivo da nota.", "XML não importado");
  }
}

function buscarNotaFiscal() {
  const accessKey = (almoxEls.invoiceAccessKey.value || almoxEls.invoiceBarcodeInput.value || "").trim();
  if (!accessKey) {
    window.TecnoAlert?.info?.("Informe a chave de acesso ou importe o XML da nota.", "Nota Fiscal");
    return;
  }
  window.TecnoAlert?.info?.("Consulta automática da NF preparada para integração futura com SEFAZ. Nesta versão, use Importar XML.", "Nota Fiscal");
}

function parseInvoiceXml(xmlText) {
  const xml = new DOMParser().parseFromString(xmlText, "application/xml");
  if (xml.querySelector("parsererror")) throw new Error("XML invalido.");
  const infNFe = xml.querySelector("infNFe");
  if (!infNFe || !xml.querySelector("NFe")) {
    if (xml.querySelector("infNFSe") || xml.documentElement?.localName === "NFSe") {
      throw new Error("Este arquivo é uma NFS-e (nota fiscal de serviço), não uma NF-e de produtos (modelo 55). O recebimento de mercadorias só importa notas de produtos com itens de estoque.");
    }
    throw new Error("O arquivo não contém uma NF-e válida.");
  }
  const emit = xml.querySelector("emit");
  const dest = xml.querySelector("dest");
  const ide = xml.querySelector("ide");
  const total = xml.querySelector("ICMSTot");
  const produtos = [...xml.querySelectorAll("det")].map((det, index) => {
    const prod = det.querySelector("prod");
    return {
      indice: index + 1,
      codigoFornecedor: xmlTextValue(prod, "cProd"),
      gtin: normalizeInvoiceGtin(xmlTextValue(prod, "cEAN")),
      gtinTributavel: normalizeInvoiceGtin(xmlTextValue(prod, "cEANTrib")),
      descricaoFornecedor: xmlTextValue(prod, "xProd"),
      ncm: xmlTextValue(prod, "NCM"),
      cfop: xmlTextValue(prod, "CFOP"),
      cest: xmlTextValue(prod, "CEST"),
      unidade: xmlTextValue(prod, "uCom") || xmlTextValue(prod, "uTrib"),
      quantidade: parseXmlNumber(xmlTextValue(prod, "qCom") || xmlTextValue(prod, "qTrib")),
      valorUnitario: parseXmlNumber(xmlTextValue(prod, "vUnCom") || xmlTextValue(prod, "vUnTrib")),
      valorTotal: parseXmlNumber(xmlTextValue(prod, "vProd")),
      unidadeTributavel: xmlTextValue(prod, "uTrib"),
      quantidadeTributavel: parseXmlNumber(xmlTextValue(prod, "qTrib")),
      lote: xmlTextValue(prod, "nLote"),
      validade: xmlTextValue(prod, "dVal"),
      observacoes: xmlTextValue(det, "infAdProd")
    };
  });

  return {
    nota: {
      chave: String(infNFe.getAttribute("Id") || "").replace(/^NFe/i, "").replace(/\D/g, ""),
      fornecedor: xmlTextValue(emit, "xNome"),
      nomeFantasiaFornecedor: xmlTextValue(emit, "xFant"),
      cnpj: xmlTextValue(emit, "CNPJ"),
      inscricaoEstadualFornecedor: xmlTextValue(emit, "IE"),
      enderecoFornecedor: parseInvoiceAddress(emit?.querySelector("enderEmit")),
      destinatario: xmlTextValue(dest, "xNome"),
      cnpjDestinatario: xmlTextValue(dest, "CNPJ") || xmlTextValue(dest, "CPF"),
      enderecoDestinatario: parseInvoiceAddress(dest?.querySelector("enderDest")),
      numero: xmlTextValue(ide, "nNF"),
      serie: xmlTextValue(ide, "serie"),
      dataEmissaoRaw: xmlTextValue(ide, "dhEmi") || xmlTextValue(ide, "dEmi"),
      dataEmissao: formatInvoiceDate(xmlTextValue(ide, "dhEmi") || xmlTextValue(ide, "dEmi")),
      naturezaOperacao: xmlTextValue(ide, "natOp"),
      valorProdutos: parseXmlNumber(xmlTextValue(total, "vProd")),
      valorFrete: parseXmlNumber(xmlTextValue(total, "vFrete")),
      valorDesconto: parseXmlNumber(xmlTextValue(total, "vDesc")),
      outrasDespesas: parseXmlNumber(xmlTextValue(total, "vOutro")),
      valorImpostos: parseXmlNumber(xmlTextValue(total, "vTotTrib")),
      valorTotal: parseXmlNumber(xmlTextValue(total, "vNF"))
    },
    produtos
  };
}

function normalizeInvoiceGtin(value) {
  const normalized = String(value || "").trim();
  return /^(SEM GTIN|NAO INFORMADO)$/i.test(normalized) ? "" : normalized.replace(/\s+/g, "");
}

function parseInvoiceAddress(node) {
  if (!node) return {};
  return { logradouro:xmlTextValue(node,"xLgr"),numero:xmlTextValue(node,"nro"),complemento:xmlTextValue(node,"xCpl"),bairro:xmlTextValue(node,"xBairro"),codigo_municipio:xmlTextValue(node,"cMun"),cidade:xmlTextValue(node,"xMun"),uf:xmlTextValue(node,"UF"),cep:xmlTextValue(node,"CEP"),pais:xmlTextValue(node,"xPais") };
}

function conciliarProdutos(produtos) {
  return produtos.map((produto) => {
    const material = buscarMaterialCorrespondente(produto);
    const item = {
      ...produto,
      quantidadeRecebida: produto.quantidade || 0,
      materialId: material?.id || null,
      materialNome: material?.nome || "",
      codigoInterno: material?.codigo || "",
      localizacao: material?.localizacao || "",
      divergencia: null,
      criarNovoMaterial: !material
    };
    item.status = calcularStatusRecebimento(item);
    return item;
  });
}

function buscarMaterialCorrespondente(produto) {
  const supplierCode = normalizeText(produto.codigoFornecedor);
  const description = normalizeText(produto.descricaoFornecedor);
  const descriptionTokens = description.split(/\s+/).filter((token) => token.length > 3);
  return materials.find((material) => {
    const materialCode = normalizeText(material.codigo);
    const materialName = normalizeText(`${material.nome} ${material.especificacao || ""}`);
    return (supplierCode && materialCode === supplierCode)
      || (descriptionTokens.length && descriptionTokens.every((token) => materialName.includes(token)));
  }) || null;
}

function fillInvoiceNoteFields() {
  const nota = invoiceReceipt.nota || {};
  almoxEls.invoiceSupplier.value = nota.fornecedor || "";
  almoxEls.invoiceCnpj.value = nota.cnpj || "";
  almoxEls.invoiceNumber.value = nota.numero || "";
  almoxEls.invoiceSeries.value = nota.serie || "";
  almoxEls.invoiceIssueDate.value = nota.dataEmissao || "";
  almoxEls.invoiceTotal.value = nota.valorTotal ? formatCurrency(nota.valorTotal) : "";
}

function renderInvoiceReceipt() {
  almoxEls.invoiceImportState.textContent = invoiceReceipt.itens.length ? "Itens importados para conferência." : "Nenhuma nota importada.";
  almoxEls.invoiceItemsBody.innerHTML = invoiceReceipt.itens.length
    ? invoiceReceipt.itens.map(renderInvoiceItemRow).join("")
    : `<tr><td colspan="7">Importe um XML ou busque a nota para iniciar a conferência.</td></tr>`;
  updateInvoiceFooter();
  refreshIcons();
}

function renderInvoiceItemRow(item, index) {
  const materialOptions = [
    `<option value="">Selecione existente</option>`,
    ...materials.map((material) => `<option value="${escapeAttr(material.id)}" ${material.id === item.materialId ? "selected" : ""}>${escapeHtml(material.codigo)} - ${escapeHtml(material.nome)}</option>`)
  ].join("");
  const materialControl = item.materialId || !item.criarNovoMaterial
    ? `<select class="tw-field compact-field" data-invoice-material="${index}">${materialOptions}</select>`
    : `<div class="invoice-match-actions"><button class="btn btn-secondary" type="button" data-invoice-action="create" data-index="${index}">Criar novo material</button><button class="btn btn-secondary" type="button" data-invoice-action="select" data-index="${index}">Selecionar existente</button></div>`;

  return `
    <tr>
      <td><strong>${escapeHtml(item.descricaoFornecedor || "Produto sem descrição")}</strong><span class="muted-line">${escapeHtml(item.codigoFornecedor || "-")}</span></td>
      <td>${formatNumber(item.quantidade)} ${escapeHtml(item.unidade || "")}</td>
      <td><input class="tw-field compact-field" type="number" min="0" step="0.001" value="${escapeAttr(item.quantidadeRecebida)}" data-invoice-received="${index}"></td>
      <td>${materialControl}</td>
      <td><input class="tw-field compact-field" value="${escapeAttr(item.localizacao || "")}" placeholder="Local obrigatório" data-invoice-location="${index}"></td>
      <td>${renderBadge(item.status, invoiceStatusBadge(item.status))}</td>
      <td class="row-actions"><button type="button" data-invoice-action="details" data-index="${index}" aria-label="Detalhes"><i data-lucide="eye"></i></button></td>
    </tr>
  `;
}

function handleInvoiceItemInput(event) {
  const receivedIndex = event.target.dataset.invoiceReceived;
  const locationIndex = event.target.dataset.invoiceLocation;
  const materialIndex = event.target.dataset.invoiceMaterial;
  const index = receivedIndex ?? locationIndex ?? materialIndex;
  if (index === undefined) return;

  const item = invoiceReceipt.itens[Number(index)];
  if (!item) return;

  if (receivedIndex !== undefined) {
    item.quantidadeRecebida = Number(event.target.value || 0);
    if (Number(item.quantidadeRecebida) !== Number(item.quantidade)) openDivergenceModal(Number(index));
  }

  if (locationIndex !== undefined) item.localizacao = event.target.value.trim();

  if (materialIndex !== undefined) {
    const material = materials.find((mat) => mat.id === event.target.value);
    item.materialId = material?.id || null;
    item.materialNome = material?.nome || "";
    item.codigoInterno = material?.codigo || "";
    item.criarNovoMaterial = !material;
  }

  item.status = calcularStatusRecebimento(item);
  renderInvoiceReceipt();
}

function handleInvoiceItemClick(event) {
  const button = event.target.closest("[data-invoice-action]");
  if (!button) return;
  const index = Number(button.dataset.index);
  const action = button.dataset.invoiceAction;
  if (action === "create") prepararNovoMaterialDaNota(index);
  if (action === "select") selecionarMaterialExistente(index);
  if (action === "details") mostrarDetalhesItemNota(index);
}

function prepararNovoMaterialDaNota(index) {
  const item = invoiceReceipt.itens[index];
  if (!item) return;
  item.criarNovoMaterial = true;
  item.materialId = null;
  item.materialNome = item.descricaoFornecedor || "Novo material";
  item.codigoInterno = item.codigoFornecedor || "";
  item.status = calcularStatusRecebimento(item);
  renderInvoiceReceipt();
}

function selecionarMaterialExistente(index) {
  const item = invoiceReceipt.itens[index];
  if (!item) return;
  item.criarNovoMaterial = false;
  renderInvoiceReceipt();
}

function mostrarDetalhesItemNota(index) {
  const item = invoiceReceipt.itens[index];
  if (!item) return;
  const message = [
    `Descrição: ${item.descricaoFornecedor || "-"}`,
    `NCM: ${item.ncm || "-"}`,
    `CFOP: ${item.cfop || "-"}`,
    `Unidade: ${item.unidade || "-"}`,
    `Código fornecedor: ${item.codigoFornecedor || "-"}`,
    `Código interno: ${item.codigoInterno || "-"}`,
    `Observações: ${item.observacoes || "-"}`
  ].join("\n");
  window.TecnoAlert?.info?.(message, "Detalhes do item");
}

function calcularStatusRecebimento(item) {
  const nf = Number(item.quantidade || 0);
  const received = Number(item.quantidadeRecebida || 0);
  if (!item.materialId && !item.criarNovoMaterial) return "Material Divergente";
  if (!item.localizacao) return "Aguardando Conferência";
  if (received === nf) return "Conferido";
  if (received <= 0) return "Faltando Material";
  if (received < nf) return "Entrega Parcial";
  if (received > nf) return "Recebido a Mais";
  return "Aguardando Conferência";
}

function invoiceStatusBadge(status) {
  const key = normalizeText(status);
  if (key.includes("conferido")) return "success";
  if (key.includes("diverg") || key.includes("faltando")) return "danger";
  if (key.includes("parcial") || key.includes("mais") || key.includes("aguardando")) return "warning";
  return "neutral";
}

function updateInvoiceFooter() {
  const items = invoiceReceipt.itens;
  const checked = items.filter((item) => item.status === "Conferido").length;
  const divergences = items.filter((item) => item.status !== "Conferido").length;
  const total = invoiceReceipt.nota?.valorTotal || items.reduce((sum, item) => sum + Number(item.valorTotal || 0), 0);
  almoxEls.invoiceItemsCount.textContent = String(items.length);
  almoxEls.invoiceCheckedCount.textContent = String(checked);
  almoxEls.invoiceDivergenceCount.textContent = String(divergences);
  almoxEls.invoiceFooterTotal.textContent = formatCurrency(total);
}

function openDivergenceModal(index) {
  pendingDivergenceIndex = index;
  almoxEls.invoiceDivergenceForm.reset();
  openModal(almoxEls.invoiceDivergenceModal);
}

function closeDivergenceModal() {
  pendingDivergenceIndex = null;
  almoxEls.invoiceDivergenceModal.classList.add("hidden");
  almoxEls.invoiceDivergenceModal.setAttribute("aria-hidden", "true");
  document.body.classList.add("modal-open");
}

function registrarDivergencia() {
  if (!window.TecnoValidate.form(almoxEls.invoiceDivergenceForm)) return;
  const item = invoiceReceipt.itens[pendingDivergenceIndex];
  if (!item) return;
  item.divergencia = {
    motivo: almoxEls.invoiceDivergenceReason.value,
    observacao: almoxEls.invoiceDivergenceNote.value.trim()
  };
  closeDivergenceModal();
  renderInvoiceReceipt();
}

async function confirmarEntrada() {
  if (!invoiceReceipt.itens.length) {
    window.TecnoAlert?.info?.("Importe uma nota antes de confirmar o recebimento.", "Recebimento");
    return;
  }
  const missingLocation = invoiceReceipt.itens.some((item) => Number(item.quantidadeRecebida || 0) > 0 && !item.localizacao);
  if (missingLocation) {
    window.TecnoAlert?.error?.("Informe a localização de todos os itens recebidos.", "Recebimento incompleto");
    return;
  }
  almoxEls.confirmInvoiceReceiptBtn.disabled = true;
  try {
    await registrarRecebimento(invoiceReceipt);
    closeAllModals();
    await loadWarehouse();
    window.TecnoAlert?.success?.("Recebimento registrado no almoxarifado.", "Nota Fiscal");
  } catch (error) {
    console.error(error);
    window.TecnoAlert?.error?.(error.message || "Não foi possível confirmar o recebimento.", "Recebimento não salvo");
  } finally {
    almoxEls.confirmInvoiceReceiptBtn.disabled = false;
  }
}

async function registrarRecebimento(receipt) {
  for (const item of receipt.itens) {
    const received = Number(item.quantidadeRecebida || 0);
    if (received <= 0) {
      await registrarDivergenciaHistorico(item, receipt.nota);
      continue;
    }
    await TecnoweldAPI.saveWarehouseEntry({
      material_id: item.materialId || null,
      nome: item.materialNome || item.descricaoFornecedor,
      codigo: item.codigoInterno || item.codigoFornecedor,
      quantidade: received,
      unidade: item.unidade,
      categoria: "Recebido por NF",
      fornecedor: receipt.nota?.fornecedor || "",
      nota_fiscal: receipt.nota?.numero || "",
      valor_unitario: item.valorUnitario,
      localizacao: item.localizacao,
      observacoes: buildInvoiceObservation(item, receipt.nota)
    });
    if (item.status !== "Conferido") await registrarDivergenciaHistorico(item, receipt.nota);
  }
}

async function registrarDivergenciaHistorico(item, nota) {
  await TecnoweldAPI.saveWarehouseMovement({
    tipo: "ajuste",
    quantidade: 0,
    unidade: item.unidade,
    documento: nota?.numero ? `NF ${nota.numero}` : "Recebimento NF",
    localizacao: item.localizacao || null,
    observacao: buildInvoiceObservation(item, nota, true)
  });
}

function buildInvoiceObservation(item, nota, divergenceOnly = false) {
  const parts = [
    nota?.numero ? `NF ${nota.numero}` : "Recebimento por nota fiscal",
    `Produto: ${item.descricaoFornecedor || "-"}`,
    `Qtd NF: ${formatNumber(item.quantidade)} ${item.unidade || ""}`,
    `Qtd recebida: ${formatNumber(item.quantidadeRecebida)} ${item.unidade || ""}`,
    `Status: ${item.status}`
  ];
  if (item.divergencia) parts.push(`Divergência: ${item.divergencia.motivo}${item.divergencia.observacao ? ` - ${item.divergencia.observacao}` : ""}`);
  if (divergenceOnly && !item.divergencia) parts.push("Divergência sem motivo informado.");
  return parts.join(" | ");
}

async function saveEntry() {
  return window.AlmoxEntryExit.saveEntry();
}

async function saveExit() {
  if (!window.TecnoValidate.form(almoxEls.exitForm)) return;
  if (!validateExitRules()) return;
  const material = exitSelectedMaterial();
  const loggedEmployeeId = currentWarehouseUser()?.id || null;
  if (!material) return window.TecnoAlert?.info?.("Bipe um material válido.", "Material não identificado");
  if (!loggedEmployeeId) return window.TecnoAlert?.error?.("Entre novamente para identificar quem está liberando.", "Sessão inválida");
  pendingPosExit = { material, loggedEmployeeId, quantidade: almoxEls.exitQty.value, unidade: material.unidade, finalidade: almoxEls.exitPurpose.value, op_numero: almoxEls.exitPurpose.value === "Consumo em pedido" ? almoxEls.exitOp.value.trim() : null, observacao: almoxEls.exitNote.value.trim() };
  almoxEls.movementPinAvatar.textContent = "••";
  almoxEls.movementPinRequesterName.textContent = "quem está retirando";
  almoxEls.movementPinInput.value = "";
  almoxEls.movementPinError.textContent = "";
  almoxEls.movementPinKicker.textContent = "IDENTIFICAÇÃO DO SOLICITANTE";
  almoxEls.confirmMovementPinBtn.textContent = "Confirmar saída";
  openModal(almoxEls.movementPinModal);
  setTimeout(() => almoxEls.movementPinInput.focus(), 50);
}

async function authorizePendingPosExit() {
  const pin = almoxEls.movementPinInput.value;
  if (!/^\d{4}$/.test(pin)) { almoxEls.movementPinError.textContent = "Informe os quatro dígitos da senha."; return almoxEls.movementPinInput.focus(); }
  almoxEls.confirmMovementPinBtn.disabled = true;
  almoxEls.movementPinInput.disabled = true;
  try {
    const requester = await TecnoweldAPI.identifyEmployeeByWarehousePin(pin);
    const operation = pendingPosExit;
    await TecnoweldAPI.saveWarehouseExit({ ...operation, material_id: operation.material.id, solicitante_id: requester.employee_id, setor_id: requester.sector_id, responsavel_id: operation.loggedEmployeeId, origem: "saida_manual" });
    closeAllModals();
    await loadWarehouse();
    window.TecnoAlert?.success?.(`Saída liberada para ${requester.employee_name}.`, "Saída registrada");
  } catch (error) {
    almoxEls.movementPinError.textContent = error?.message || "Senha não reconhecida.";
    almoxEls.movementPinInput.value = "";
    setTimeout(() => almoxEls.movementPinInput.focus(), 0);
  } finally { almoxEls.confirmMovementPinBtn.disabled = false; almoxEls.movementPinInput.disabled = false; }
}

function validateExitRules() {
  const material = exitSelectedMaterial();
  const quantity = Number(almoxEls.exitQty.value || 0);
  const warnings = [];
  if (!material) return true;
  const summary = materialStockSummary(material);
  if (quantity > Number(material.quantidade_disponivel || 0)) warnings.push("Saldo disponível insuficiente.");
  if (quantity > summary.available) warnings.push("Quantidade reservada para outras pedidos pode ser comprometida.");
  if (Number(material.quantidade_disponivel || 0) - quantity <= Number(material.estoque_minimo || 0)) warnings.push("A saída deixará o item abaixo do estoque mínimo.");
  if (almoxEls.exitPurpose.value === "Consumo em pedido" && !almoxEls.exitOp.value.trim()) warnings.push("Informe o pedido relacionada para consumo em produção.");
  almoxEls.exitOpField?.classList.toggle("hidden", almoxEls.exitPurpose.value !== "Consumo em pedido");
  almoxEls.exitWarning.classList.toggle("hidden", !warnings.length);
  almoxEls.exitWarning.innerHTML = warnings.join("<br>");
  return !warnings.some((item) => item.includes("insuficiente") || item.includes("Informe o pedido"));
}

function syncExitMaterial() {
  const material = exitSelectedMaterial();
  almoxEls.exitUnit.value = material?.unidade || "";
  validateExitRules();
}

function exitSelectedMaterial() { return materials.find((item) => item.id === almoxEls.exitMaterial.value) || null; }

function selectExitMaterial(material) {
  almoxEls.exitMaterial.value = material.id;
  almoxEls.exitScanCode.value = material.codigo || material.qr_code || "";
  almoxEls.exitScannedMaterial.innerHTML = `<i data-lucide="circle-check"></i><div><small>${escapeHtml(material.codigo || "Sem código")}</small><strong>${escapeHtml(material.nome)}</strong><span>Disponível: ${formatNumber(material.quantidade_disponivel || 0)} ${escapeHtml(material.unidade || "")}</span></div>`;
  almoxEls.exitScannedMaterial.classList.remove("hidden");
  syncExitMaterial();
  refreshIcons();
  setTimeout(() => { almoxEls.exitQty.focus(); almoxEls.exitQty.select(); }, 30);
}

function resolveExitScannedMaterial() {
  const code = normalizeText(almoxEls.exitScanCode.value).replace(/\s+/g, "");
  const material = materials.find((item) => [item.codigo, item.qr_code, item.id].some((value) => normalizeText(value).replace(/\s+/g, "") === code));
  if (!material) {
    almoxEls.exitMaterial.value = "";
    almoxEls.exitScannedMaterial.classList.add("hidden");
    syncExitMaterial();
    return window.TecnoAlert?.info?.("Código não encontrado no estoque.", "Material não identificado");
  }
  selectExitMaterial(material);
}

async function startQrCamera() {
  if (!navigator.mediaDevices?.getUserMedia) return;
  try {
    qrStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
    almoxEls.qrVideo.srcObject = qrStream;
    await almoxEls.qrVideo.play();
    startQrScanLoop();
  } catch (error) {
    console.warn("[Tecnoweld] Camera indisponivel para QR Code.", error);
  }
}

function stopQrCamera() {
  if (qrScanFrame) {
    window.cancelAnimationFrame(qrScanFrame);
    qrScanFrame = null;
  }
  qrStream?.getTracks().forEach((track) => track.stop());
  qrStream = null;
  if (almoxEls.qrVideo) almoxEls.qrVideo.srcObject = null;
}

async function startQrScanLoop() {
  if (!("BarcodeDetector" in window) || !almoxEls.qrVideo) return;
  let detector;
  try {
    detector = new BarcodeDetector({ formats: ["qr_code"] });
  } catch (error) {
    console.warn("[Tecnoweld] Leitor nativo de QR indisponivel.", error);
    return;
  }

  const scan = async () => {
    if (!qrStream || almoxEls.qrVideo.readyState < 2) {
      qrScanFrame = window.requestAnimationFrame(scan);
      return;
    }

    try {
      const codes = await detector.detect(almoxEls.qrVideo);
      const value = codes?.[0]?.rawValue?.trim();
      if (value && value !== lastQrRead) {
        lastQrRead = value;
        almoxEls.qrManualInput.value = value;
        handleQrScan();
        return;
      }
    } catch (error) {
      console.warn("[Tecnoweld] Nao foi possivel ler o QR Code.", error);
    }

    qrScanFrame = window.requestAnimationFrame(scan);
  };

  qrScanFrame = window.requestAnimationFrame(scan);
}

function extractReservationId(code) {
  const match = /^RES-(.+)$/i.exec(String(code || "").trim());
  return match ? match[1] : null;
}

function resetQrInput() {
  almoxEls.qrManualInput.value = "";
  lastQrRead = "";
}

function hideQrReservationResult() {
  pendingWithdrawReservation = null;
  almoxEls.qrReservationResult.classList.add("hidden");
}

function showQrReservationResult(reserva) {
  pendingWithdrawReservation = reserva;
  almoxEls.qrResultMaterial.textContent = reserva.material?.nome || "Material";
  almoxEls.qrResultOp.textContent = reserva.op_numero || reserva.production_order?.numero || "pedido";
  almoxEls.qrReservationResult.classList.remove("hidden");
}

function playScanSuccessSound() {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = 880;
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.2);
    oscillator.connect(gain).connect(ctx.destination);
    oscillator.start();
    oscillator.stop(ctx.currentTime + 0.2);
  } catch (error) {
    console.warn("[Tecnoweld] Não foi possível tocar o som de confirmação.", error);
  }
}

function handleQrScan() {
  const code = almoxEls.qrManualInput.value.trim();
  if (!code) return;

  if (qrModalMode === "separar") {
    processSepararScan(code);
    return;
  }

  const reservationId = extractReservationId(code);
  if (reservationId) {
    processRetirarLookup(reservationId);
    return;
  }

  const material = materials.find((item) => item.codigo === code || item.qr_code === code);
  if (!material) {
    window.TecnoAlert?.warning?.("Nenhum material encontrado para este código.", "QR Code");
    return;
  }
  closeAllModals();
  switchTab("stock");
  selectMaterial(material.id);
}

function processSepararScan(code) {
  if (!selectedSeparationOrderId) {
    window.TecnoAlert?.warning?.("Selecione uma ordem de produção antes de bipar.", "Bipagem");
    resetQrInput();
    return;
  }
  const group = separationOrderGroups().find((item) => item.id === selectedSeparationOrderId);
  if (!group) {
    resetQrInput();
    return;
  }
  const reservationId = extractReservationId(code);
  let match = reservationId ? group.items.find((item) => item.id === reservationId) : null;
  if (!match) {
    match = group.items.find((item) => item.material?.codigo === code || item.material?.qr_code === code);
  }
  if (!match) {
    window.TecnoAlert?.error?.("Este material não pertence a esta pedido ou não foi encontrado.", "Bipagem");
    resetQrInput();
    return;
  }
  const necessario = group.items.filter((item) => item.material_id === match.material_id).reduce((sum, item) => sum + Number(item.quantidade_reservada || 0), 0);
  const separado = (selectedSeparationPackages || []).filter((pkg) => pkg.material_id === match.material_id && pkg.status === "ativo").reduce((sum, pkg) => sum + Number(pkg.quantidade || 0), 0);
  if (necessario > 0 && separado >= necessario) {
    window.TecnoAlert?.info?.(`"${match.material?.nome || "Material"}" já está completamente separado.`, "Bipagem");
    resetQrInput();
    closeAllModals();
    return;
  }
  selectedSeparationMaterialId = match.material_id;
  closeAllModals();
  playScanSuccessSound();
  renderSeparationTabDOM();
  document.getElementById(`separationMaterial-${match.material_id}`)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  resetQrInput();
  openSeparationPackageModal({ productionOrderId: selectedSeparationOrderId, materialId: match.material_id });
}

function processRetirarLookup(reservationId) {
  const reserva = (warehouseData.reservas || []).find((item) => item.id === reservationId);
  if (!reserva) {
    window.TecnoAlert?.error?.("Reserva não encontrada para este código.", "QR Code");
    resetQrInput();
    return;
  }
  if (reserva.status !== "separada") {
    window.TecnoAlert?.warning?.(`Esta reserva está "${labelReservationStatus(reserva.status)}" — só é possível confirmar retirada de reservas separadas.`, "QR Code");
    resetQrInput();
    return;
  }
  showQrReservationResult(reserva);
  resetQrInput();
}

async function confirmWithdraw() {
  if (!pendingWithdrawReservation) return;
  const reserva = pendingWithdrawReservation;
  try {
    await TecnoweldAPI.updateWarehouseReservationStatus(reserva.id, "retirada");
    playScanSuccessSound();
    window.TecnoAlert?.success?.(`Retirada confirmada: ${reserva.material?.nome || "Material"} — ${reserva.op_numero || reserva.production_order?.numero || "pedido"}`, "QR Code");
    hideQrReservationResult();
    await loadWarehouse();
  } catch (error) {
    console.error(error);
    window.TecnoAlert?.error?.(error?.message || "Não foi possível confirmar a retirada.", "QR Code");
  }
}

function abbreviateForLabel(text, maxLength = 26) {
  const value = String(text || "").trim();
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 1).trimEnd()}…`;
}

function openImageModal(src) {
  almoxEls.expandedImage.src = src;
  openModal(almoxEls.imageModal);
}

function technicalFields(item) {
  const rows = [
    ["Espessura", item.espessura],
    ["Largura", item.largura_maxima],
    ["Comprimento", item.comprimento_maximo],
    ["Peso aproximado", item.peso_aproximado],
    ["Material", item.nome],
    ["Qtd. disponível", `${formatNumber(item.quantidade_disponivel)} ${item.unidade || ""}`],
    ["Localização", item.localizacao],
    ["Categoria", item.categoria],
    ["Fornecedor", item.fornecedor],
    ["Lote", item.lote],
    ["Heat", item.heat],
    ["Estoque mínimo", item.estoque_minimo],
    ["Valor unitário", item.valor_unitario ? formatCurrency(item.valor_unitario) : ""],
    ["Valor total", formatCurrency(Number(item.quantidade_disponivel || 0) * Number(item.valor_unitario || 0))],
    ["Observações", item.observacoes]
  ];
  return rows.filter(([, value]) => value !== null && value !== undefined && value !== "");
}

function renderThumb(src, alt) {
  return `<span class="material-thumb">${src ? `<img src="${escapeAttr(src)}" alt="${escapeAttr(alt)}">` : `<i data-lucide="package"></i>`}</span>`;
}

function renderDetailImage(src, label) {
  return `<button class="detail-image" type="button" ${src ? `data-src="${escapeAttr(src)}"` : ""}>${src ? `<img src="${escapeAttr(src)}" alt="${escapeAttr(label)}">` : escapeHtml(label)}</button>`;
}

function renderMovementItem(movement) {
  return `<div class="movement-item"><strong>${escapeHtml(labelMovementType(movement.tipo))} • ${formatNumber(movement.quantidade)} ${escapeHtml(movement.unidade || "")}</strong><span>${formatDateTime(movement.created_at)} • ${escapeHtml(movement.op_numero || movement.documento || "-")}</span><span>${escapeHtml(movement.setor?.nome || "-")} • ${escapeHtml(movement.responsavel?.nome || "Sem responsável")}</span></div>`;
}

function renderStatusBadge(item) {
  const status = normalizeText(item.status);
  const type = status.includes("minimo") || status.includes("aten") ? "warning" : status.includes("sem saldo") || status.includes("bloque") ? "danger" : status.includes("dispon") ? "success" : "neutral";
  return renderBadge(item.status || "Disponível", type);
}

function renderBadge(text, type = "neutral") {
  return `<span class="almox-badge ${type}">${escapeHtml(text)}</span>`;
}

function materialFromSelect(value) {
  const code = String(value || "").split(" - ")[0];
  return materials.find((item) => item.codigo === code);
}

function sectorIdByName(name) {
  return sectors.find((item) => item.nome === name)?.id || null;
}

function employeeIdByName(name) {
  return employees.find((item) => item.nome === name)?.id || null;
}

function isScrap(item) {
  if (item.tipo_material) return item.tipo_material === "retalho" || item.tipo_material === "sucata";
  return Boolean(normalizeText(`${item.categoria} ${item.grupo} ${item.classificacao}`).match(/retalho|sobra|sucata/));
}

async function loadExitServiceOrders() {
  const select = almoxEls.exitServiceOrder, request = ++exitServiceOrdersRequest;
  exitServiceOrdersLoading = true; select.disabled = true;
  select.innerHTML = '<option value="">Carregando O.S. abertas...</option>';
  try {
    const orders = (await TecnoweldAPI.listWarehouseServiceOrders()) || [];
    if (request !== exitServiceOrdersRequest) return;
    exitServiceOrders = orders || [];
    select.innerHTML = `<option value="">${orders.length ? 'Selecione a O.S.' : 'Nenhuma O.S. aberta'}</option>` + orders.map(order => `<option value="${escapeAttr(order.fonte + ':' + order.id)}">O.S. ${escapeHtml(order.numero)} · ${order.fonte === 'acervo' ? 'Item danificado' : 'Manutenção interna'} · ${escapeHtml(order.descricao)}</option>`).join('');
  } catch (error) {
    if (request !== exitServiceOrdersRequest) return;
    exitServiceOrders = []; select.innerHTML = '<option value="">Não foi possível carregar as O.S.</option>';
    window.TecnoAlert?.error?.(error.message || 'Tente selecionar O.S. novamente.', 'Ordens de serviço');
  } finally { if (request === exitServiceOrdersRequest) { exitServiceOrdersLoading = false; select.disabled = false; } }
}

// Fluxo PDV dirigido por bipagem. Substitui a implementação unitária legada.
saveExit = async function () {
  const destination = almoxEls.exitPurpose.value;
  if (!['op','os'].includes(destination)) return window.TecnoAlert?.info?.('Selecione Pedido ou O.S.', 'Destino obrigatório');
  if (destination === 'op' && !almoxEls.exitOp.value) { almoxEls.exitOp.focus(); return window.TecnoAlert?.info?.('Selecione o pedido que vai usar o material.', 'Pedido obrigatório'); }
  const serviceOrder = destination === 'os' ? exitServiceOrders.find(order => `${order.fonte}:${order.id}` === almoxEls.exitServiceOrder.value) : null;
  if (destination === 'os' && (exitServiceOrdersLoading || !serviceOrder)) { almoxEls.exitServiceOrder.focus(); return window.TecnoAlert?.info?.('Selecione uma O.S. aberta para vincular o custo.', 'O.S. obrigatória'); }
  if (!validateExitRules()) return;
  if (!exitCart.length) return window.TecnoAlert?.info?.("Bipe pelo menos um material.", "Carrinho vazio");
  const loggedEmployeeId = currentWarehouseUser()?.id || null;
  if (!loggedEmployeeId) return window.TecnoAlert?.error?.("Entre novamente no sistema.", "Sessão inválida");
  pendingPosExit = { loggedEmployeeId, items: exitCart.map(i => ({ material_id:i.materialId, volume_id:i.kind === "volume" ? i.entityId : null, quantity:i.quantity })), destination:almoxEls.exitPurpose.value, opNumber:destination === "op" ? almoxEls.exitOp.value.trim() : null, serviceOrderId:serviceOrder?.id || null, serviceOrderSource:serviceOrder?.fonte || null, note:almoxEls.exitNote.value.trim(), idempotencyKey:crypto.randomUUID() };
  almoxEls.movementPinAvatar.textContent="••"; almoxEls.movementPinRequesterName.textContent="quem está retirando"; almoxEls.movementPinInput.value=""; almoxEls.movementPinError.textContent=""; almoxEls.movementPinKicker.textContent="IDENTIFICAÇÃO DO SOLICITANTE"; almoxEls.confirmMovementPinBtn.textContent="Confirmar saída";
  openModal(almoxEls.movementPinModal); setTimeout(()=>almoxEls.movementPinInput.focus(),50);
};

authorizePendingPosExit = async function () {
  const pin=almoxEls.movementPinInput.value;
  if(!/^\d{4}$/.test(pin)){almoxEls.movementPinError.textContent="Informe os quatro dígitos da senha.";return;}
  almoxEls.confirmMovementPinBtn.disabled=true; almoxEls.movementPinInput.disabled=true;
  try { const op=pendingPosExit; await TecnoweldAPI.processWarehouseExitCart({pin,items:op.items,destination:op.destination,op_number:op.opNumber,service_order_id:op.serviceOrderId,service_order_source:op.serviceOrderSource,note:op.note,idempotency_key:op.idempotencyKey}); closeAllModals(); await loadWarehouse(); openExitModal(); window.TecnoAlert?.success?.("Carrinho baixado com rastreabilidade.","Saída registrada"); }
  catch(error){almoxEls.movementPinError.textContent=error?.message||"PIN não reconhecido.";almoxEls.movementPinInput.value="";setTimeout(()=>almoxEls.movementPinInput.focus(),0);}
  finally{almoxEls.confirmMovementPinBtn.disabled=false;almoxEls.movementPinInput.disabled=false;}
};

validateExitRules = function () {
  const warnings = [], totals = new Map();
  exitCart.forEach(item => totals.set(item.materialId,(totals.get(item.materialId)||0)+(Number.isFinite(item.quantity)?item.quantity:0)));
  exitCart.forEach(item => {
    const material = materials.find(material => material.id === item.materialId);
    const available = Number(material?.quantidade_disponivel ?? item.available);
    const total = totals.get(item.materialId) || 0;
    let message = '';
    if (!Number.isFinite(item.quantity) || item.quantity <= 0) message = `Informe uma quantidade maior que zero para ${item.label}.`;
    else if (total > available + 0.000000001) message = stockExceededMessage(item.label,available,total,material?.unidade||'UN');
    else if (item.quantity > item.available + 0.000000001) message = stockExceededMessage(item.label,item.available,item.quantity,material?.unidade||'UN');
    if (message && !warnings.includes(message)) warnings.push(message);
    const row = [...(almoxEls.exitCartBody?.rows || [])].find(row => row.dataset.exitKey === item.key);
    const input = row?.querySelector('.exit-cart-qty');
    if (input) {
      input.setCustomValidity(message); input.setAttribute('aria-invalid',String(Boolean(message)));
      if (message) input.setAttribute('aria-errormessage','twAlertMessage'); else input.removeAttribute('aria-errormessage');
    }
  });
  const isOrder = almoxEls.exitPurpose.value === 'op';
  almoxEls.exitOpField?.classList.toggle('hidden', !isOrder); almoxEls.exitOp.required = isOrder;
  almoxEls.exitServiceOrderField?.classList.toggle('hidden', isOrder); almoxEls.exitServiceOrder.required = !isOrder;
  almoxEls.exitWarning.classList.add('hidden'); almoxEls.exitWarning.textContent = '';
  showStockAlert('exit',warnings);
  almoxEls.saveExitBtn.disabled = warnings.length > 0;
  return warnings.length === 0;
};

resolveExitScannedMaterial = async function () {
  if(exitScanBusy)return; const code=almoxEls.exitScanCode.value.trim(); if(!code)return; exitScanBusy=true;
  try{const byName=materials.filter(item=>normalizeText(item.nome)===normalizeText(code));
    if(byName.length===1){const m=byName[0];addExitCartItem({kind:"material",entity_id:m.id,material_id:m.id,code:m.codigo,label:m.nome,units_per_scan:1,current_quantity:m.quantidade_disponivel,location_id:m.location_id||null,location_code:m.localizacao||null,batch:m.lote||null});almoxEls.exitScanCode.value="";return;}
    const scan=await TecnoweldAPI.resolveWarehouseScan(code);if(!scan||scan.kind==="location")throw new Error("Código de material não reconhecido.");addExitCartItem(scan);almoxEls.exitScanCode.value="";}
  catch(error){window.TecnoAlert?.info?.(error.message||"Código não encontrado.","Leitura recusada");}
  finally{exitScanBusy=false;setTimeout(()=>almoxEls.exitScanCode.focus(),20);}
};

function addExitCartItem(scan){const materialId=scan.material_id||scan.entity_id,key=scan.kind==="volume"?`v:${scan.entity_id}`:`m:${materialId}`,found=exitCart.find(i=>i.key===key),increment=Number(scan.units_per_scan||1);if(found){if(scan.kind==="volume")return window.TecnoAlert?.info?.("Este volume já está no carrinho.","Volume já bipado");found.quantity+=increment;}else exitCart.push({key,kind:scan.kind,entityId:scan.entity_id,materialId,label:scan.label||materials.find(m=>m.id===materialId)?.nome||"Material",code:scan.code||materials.find(m=>m.id===materialId)?.codigo,batch:scan.batch||"-",location:scan.location_code||materials.find(m=>m.id===materialId)?.localizacao||"-",quantity:scan.kind==="volume"?Number(scan.current_quantity):increment,available:Number(scan.current_quantity??materials.find(m=>m.id===materialId)?.quantidade_disponivel??999999)});renderExitCart();}
function exitCartUnitValue(item) {
  return Number(materials.find(material => material.id === item.materialId)?.valor_unitario || 0);
}
function renderExitCart() {
  if (!almoxEls.exitCartBody) return;
  almoxEls.exitCartBody.innerHTML = exitCart.map(item => {
    const material = materials.find(material => material.id === item.materialId);
    const unit = material?.unidade || '';
    const detail = [item.label, item.code, `Lote: ${item.batch}`, `Endereço: ${item.location}`].filter(Boolean).join('\n');
    const unitValue = exitCartUnitValue(item);
    return `<tr data-exit-key="${escapeAttr(item.key)}">
      <td data-label="Qtd."><input class="tw-field exit-cart-qty" type="number" min="0.001" step="0.001" max="${item.available}" value="${item.quantity}" aria-label="Quantidade de ${escapeAttr(item.label)}" title="Quantidade em ${escapeAttr(unit)}"></td>
      <td data-label="Item">${window.AlmoxDetails.text(item.label,detail,'exit-item-name')}</td>
      <td data-label="Valor"><div class="exit-item-value"><span data-exit-total title="Valor unit\u00e1rio: ${escapeAttr(formatCurrency(unitValue))}">${formatCurrency(unitValue * item.quantity)}</span><button type="button" class="icon-btn" data-remove-exit aria-label="Remover ${escapeAttr(item.label)}" title="Remover item">\u00d7</button></div></td>
    </tr>`;
  }).join('');
  almoxEls.exitCartEmpty.classList.toggle('hidden', !!exitCart.length);
  almoxEls.exitCartMaterials.textContent = `${exitCart.length} ${exitCart.length === 1 ? 'material' : 'materiais'}`;
  almoxEls.exitCartUnits.textContent = `${formatNumber(exitCart.reduce((sum,item) => sum + item.quantity,0))} unidades`;
  validateExitRules(); refreshIcons();
}
function handleExitCartInput(event) {
  if (!event.target.matches('.exit-cart-qty')) return;
  const row = event.target.closest('tr');
  const item = exitCart.find(item => item.key === row.dataset.exitKey);
  if (!item) return;
  item.quantity = Number(event.target.value || 0);
  row.querySelector('[data-exit-total]').textContent = formatCurrency(exitCartUnitValue(item) * item.quantity);
  almoxEls.exitCartUnits.textContent = `${formatNumber(exitCart.reduce((sum,item) => sum + item.quantity,0))} unidades`;
  validateExitRules();
}

function handleExitCartClick(e){const b=e.target.closest("[data-remove-exit]");if(!b)return;exitCart=exitCart.filter(i=>i.key!==b.closest("tr").dataset.exitKey);renderExitCart();setTimeout(()=>almoxEls.exitScanCode.focus(),20);}

function openWarehouseMoveModal(){warehouseMoveVolume=null;warehouseMoveMode="transfer";almoxEls.warehouseMoveVolumeCode.value="";almoxEls.warehouseMoveLocationCode.value="";almoxEls.warehouseMoveVolumeResult.classList.add("hidden");setWarehouseMoveMode("transfer");openModal(almoxEls.warehouseMoveModal);setTimeout(()=>almoxEls.warehouseMoveVolumeCode.focus(),40);}
function setWarehouseMoveMode(mode){warehouseMoveMode=mode;document.querySelectorAll("[data-move-mode]").forEach(b=>b.classList.toggle("active",b.dataset.moveMode===mode));almoxEls.warehouseTransferFields.classList.toggle("hidden",mode!=="transfer");almoxEls.warehouseSplitFields.classList.toggle("hidden",mode!=="split");almoxEls.confirmWarehouseMoveBtn.textContent=mode==="transfer"?"Confirmar transferência":"Fracionar e gerar etiquetas";}
async function resolveWarehouseMoveVolume(){try{const scan=await TecnoweldAPI.resolveWarehouseScan(almoxEls.warehouseMoveVolumeCode.value);if(scan?.kind!=="volume")throw new Error("Bipe uma etiqueta de volume interno.");warehouseMoveVolume=scan;almoxEls.warehouseMoveVolumeResult.innerHTML=`<strong>${escapeHtml(scan.label)}</strong><span>${formatNumber(scan.current_quantity)} disponíveis · Lote ${escapeHtml(scan.batch||"-")}</span>`;almoxEls.warehouseMoveVolumeResult.classList.remove("hidden");setTimeout(()=>warehouseMoveMode==="transfer"?almoxEls.warehouseMoveLocationCode.focus():almoxEls.warehouseSplitQuantity.focus(),30);}catch(e){window.TecnoAlert?.info?.(e.message,"Volume não identificado");}}
function updateWarehouseSplitSummary(){const total=Number(almoxEls.warehouseSplitQuantity.value||0)*Number(almoxEls.warehouseSplitCount.value||0);almoxEls.warehouseSplitSummary.textContent=`Serão gerados ${almoxEls.warehouseSplitCount.value||0} volumes, totalizando ${formatNumber(total)} unidades.`;}
async function confirmWarehouseMove(){if(!warehouseMoveVolume)return window.TecnoAlert?.info?.("Bipe o volume primeiro.","Volume obrigatório");almoxEls.confirmWarehouseMoveBtn.disabled=true;try{if(warehouseMoveMode==="transfer"){const loc=await TecnoweldAPI.resolveWarehouseScan(almoxEls.warehouseMoveLocationCode.value);if(loc?.kind!=="location")throw new Error("Nova localização não reconhecida.");await TecnoweldAPI.transferWarehouseVolume(warehouseMoveVolume.entity_id,loc.entity_id,crypto.randomUUID());window.TecnoAlert?.success?.("Volume transferido e histórico registrado.","Transferência concluída");}else{const qty=Number(almoxEls.warehouseSplitQuantity.value),count=Number(almoxEls.warehouseSplitCount.value);if(!qty||!Number.isInteger(count)||count<1||qty*count>Number(warehouseMoveVolume.current_quantity))throw new Error("Divisão inválida ou superior ao saldo do volume.");const result=await TecnoweldAPI.splitWarehouseVolume(warehouseMoveVolume.entity_id,Array(count).fill(qty),crypto.randomUUID());showSplitLabels(result.codes||[]);}closeAllModals();await loadWarehouse();}catch(e){window.TecnoAlert?.error?.(e.message,"Operação não concluída");}finally{almoxEls.confirmWarehouseMoveBtn.disabled=false;}}
function showSplitLabels(codes){const printable=codes.map(code=>`<div class="split-label"><strong>${escapeHtml(warehouseMoveVolume.label)}</strong><span>${escapeHtml(code)}</span><small>Lote ${escapeHtml(warehouseMoveVolume.batch||"-")}</small></div>`).join("");const w=window.open("","_blank","width=720,height=700");if(w){w.document.write(`<title>Etiquetas de volumes</title><style>body{font-family:Arial;display:grid;grid-template-columns:1fr 1fr;gap:12px;padding:20px}.split-label{border:2px solid #111;padding:18px;display:grid;gap:8px}.split-label span{font-size:22px;font-weight:700}</style>${printable}<script>print()<\/script>`);w.document.close();}}

function openWarehouseSetupModal(){
  almoxEls.barcodeSetupMaterial.innerHTML=`<option value="">Selecione...</option>${materials.map(item=>`<option value="${escapeAttr(item.id)}">${escapeHtml(item.codigo)} - ${escapeHtml(item.nome)}</option>`).join("")}`;
  openModal(almoxEls.warehouseSetupModal);
  setTimeout(()=>almoxEls.barcodeSetupCode?.focus(),40);
}
async function saveWarehouseBarcodeSetup(){
  const materialId=almoxEls.barcodeSetupMaterial.value,code=almoxEls.barcodeSetupCode.value.trim(),units=Number(almoxEls.barcodeSetupUnits.value);
  if(!materialId||!code||!Number.isFinite(units)||units<=0)return window.TecnoAlert?.info?.("Informe o material, o código e as unidades por bip.","Dados incompletos");
  almoxEls.saveBarcodeSetupBtn.disabled=true;
  try{await TecnoweldAPI.linkMaterialBarcode(materialId,code,units);almoxEls.barcodeSetupCode.value="";almoxEls.barcodeSetupUnits.value="1";window.TecnoAlert?.success?.(`Código ${code} vinculado com ${formatNumber(units)} unidade(s) por leitura.`,"Etiqueta cadastrada");setTimeout(()=>almoxEls.barcodeSetupCode.focus(),20);}
  catch(error){window.TecnoAlert?.error?.(error.message,"Código não cadastrado");}
  finally{almoxEls.saveBarcodeSetupBtn.disabled=false;}
}
async function saveWarehouseLocationSetup(){
  const code=almoxEls.locationSetupCode.value.trim().toUpperCase(),name=almoxEls.locationSetupName.value.trim(),description=almoxEls.locationSetupDescription.value.trim();
  if(!code)return window.TecnoAlert?.info?.("Informe o código físico da localização.","Código obrigatório");
  almoxEls.saveLocationSetupBtn.disabled=true;
  try{await TecnoweldAPI.createWarehouseLocation(code,name,description);almoxEls.locationSetupForm.reset();window.TecnoAlert?.success?.(`Localização ${code} pronta para bipagem.`,"Localização cadastrada");setTimeout(()=>almoxEls.locationSetupCode.focus(),20);}
  catch(error){window.TecnoAlert?.error?.(error.message,"Localização não cadastrada");}
  finally{almoxEls.saveLocationSetupBtn.disabled=false;}
}


async function startBarcodeInventoryLocation(){const input=document.getElementById("inventoryLocationScanner");if(!input?.value.trim())return;try{activeInventoryLocation=await TecnoweldAPI.startInventoryLocation(input.value.trim());inventoryScans=[];almoxEls.countTab.innerHTML=renderCountTab();setTimeout(()=>document.getElementById("inventoryItemScanner")?.focus(),30);}catch(e){window.TecnoAlert?.error?.(e.message,"Localização não iniciada");}}
async function processBarcodeInventoryScan(){const input=document.getElementById("inventoryItemScanner"),code=input?.value.trim();if(!code||!activeInventoryLocation)return;input.value="";input.disabled=true;try{const scan=await TecnoweldAPI.scanInventoryItem(activeInventoryLocation.count_location_id,code,crypto.randomUUID());if(!scan?.duplicate){inventoryScans.unshift(scan);almoxEls.countTab.innerHTML=renderCountTab();}}catch(e){window.TecnoAlert?.info?.(e.message,"Leitura não registrada");}finally{setTimeout(()=>{const next=document.getElementById("inventoryItemScanner");if(next){next.disabled=false;next.focus();}},30);}}
async function undoBarcodeInventoryScan(){if(!activeInventoryLocation)return;try{await TecnoweldAPI.undoInventoryScan(activeInventoryLocation.count_location_id);inventoryScans.shift();almoxEls.countTab.innerHTML=renderCountTab();setTimeout(()=>document.getElementById("inventoryItemScanner")?.focus(),30);}catch(e){window.TecnoAlert?.error?.(e.message,"Não foi possível desfazer");}}
async function finishBarcodeInventoryLocation(){if(!activeInventoryLocation)return;try{const result=await TecnoweldAPI.finishInventoryLocation(activeInventoryLocation.count_location_id);activeInventoryLocation=null;inventoryScans=[];almoxEls.countTab.innerHTML=renderInventoryResult(result.items||[]);window.TecnoAlert?.success?.("Contagem encerrada. Nenhum saldo foi ajustado automaticamente.","Comparação liberada");}catch(e){window.TecnoAlert?.error?.(e.message,"Contagem não finalizada");}}
function renderInventoryResult(items){return `<section class="barcode-inventory-panel"><header><div><h2>Resultado da contagem</h2><p>As divergências aguardam análise e aprovação; o estoque ainda não foi alterado.</p></div><button class="btn btn-secondary" type="button" onclick="activeInventoryLocation=null;inventoryScans=[];almoxEls.countTab.innerHTML=renderCountTab()">Nova localização</button></header><div class="almox-table-wrap"><table class="almox-table"><thead><tr><th>Material</th><th>Sistema</th><th>Contado</th><th>Diferença</th><th>Status</th></tr></thead><tbody>${items.map(i=>`<tr><td>${escapeHtml(i.material_name)}</td><td>${formatNumber(i.system_quantity)}</td><td>${formatNumber(i.counted_quantity)}</td><td>${Number(i.difference)>0?"+":""}${formatNumber(i.difference)}</td><td>${renderBadge(i.status==="ok"?"OK":"Divergência",i.status==="ok"?"success":"warning")}</td></tr>`).join("")}</tbody></table></div></section>`;}
renderInventoryResult = function(items){const reasons=["Perda","Consumo não registrado","Movimentação incorreta","Erro de contagem","Quebra","Sucata","Outro"];return `<section class="barcode-inventory-panel"><header><div><h2>Resultado da contagem</h2><p>Divergências não alteram o saldo sem justificativa e aprovação.</p></div><button class="btn btn-secondary" type="button" data-new-inventory>Nova localização</button></header><div class="almox-table-wrap"><table class="almox-table inventory-result-table"><thead><tr><th>Material</th><th>Sistema</th><th>Contado</th><th>Diferença</th><th>Status</th><th>Análise</th></tr></thead><tbody>${items.map(i=>`<tr><td>${escapeHtml(i.material_name)}</td><td>${formatNumber(i.system_quantity)}</td><td>${formatNumber(i.counted_quantity)}</td><td>${Number(i.difference)>0?"+":""}${formatNumber(i.difference)}</td><td>${renderBadge(i.status==="ok"?"OK":"Divergência",i.status==="ok"?"success":"warning")}</td><td>${i.adjustment_id?`<div class="inventory-adjustment-action"><select class="tw-field" data-adjustment-reason><option value="">Motivo...</option>${reasons.map(r=>`<option>${r}</option>`).join("")}</select><button class="btn btn-secondary" type="button" data-approve-adjustment="${i.adjustment_id}">Aprovar ajuste</button></div>`:"—"}</td></tr>`).join("")}</tbody></table></div></section>`;};
async function approveBarcodeInventoryAdjustment(button){const reason=button.closest("tr").querySelector("[data-adjustment-reason]")?.value;if(!reason)return window.TecnoAlert?.info?.("Selecione o motivo da divergência.","Justificativa obrigatória");button.disabled=true;try{await TecnoweldAPI.approveInventoryAdjustment(button.dataset.approveAdjustment,reason);button.closest("td").innerHTML=renderBadge("Ajuste aprovado","success");window.TecnoAlert?.success?.("Ajuste auditável aplicado ao estoque.","Saldo atualizado");}catch(e){button.disabled=false;window.TecnoAlert?.error?.(e.message,"Ajuste não aprovado");}}

// Ferramenta no recebimento (2026-10-01): conta recebido/avariado na mao (nao tem codigo de barras do estoque); ao concluir
// cada unidade aceita vira uma ferramenta no Ferramental com codigo automatico.
function receiptToolCheckItem(i, accepted, expected, diff) {
  return `<article class="receipt-check-item receipt-check-tool ${diff===0&&accepted>0?"ok":accepted>0?"different":"pending"}"><div><small>Ferramenta · vai para o Ferramental</small><strong title="${escapeAttr(i.descricao_xml||"")}">${escapeHtml(i.descricao_xml)}</strong><span>${formatNumber(accepted)}/${formatNumber(expected)} ${escapeHtml(i.unidade_xml||"un")}</span></div><label>Recebido<input class="tw-field" data-received-item="${i.id}" type="number" min="0" step="1" value="${escapeAttr(i.quantidade_recebida||0)}"></label><label>Avariado<input class="tw-field" data-damaged-item="${i.id}" type="number" min="0" step="1" value="${escapeAttr(i.quantidade_avariada||0)}"></label></article>`;
}
renderReceiptCheckStep = function(){const items=activeNfeReceipt.itens||[],done=items.filter(i=>Number(i.quantidade_recebida)>0).length,unknown=pendingReceiptBarcode?`<section class="unknown-receipt-code"><div><strong>Código não cadastrado</strong><code>${escapeHtml(pendingReceiptBarcode)}</code><span>A qual item desta nota este código pertence?</span></div><div>${items.filter(i=>i.controlado_estoque!==false&&i.material_id).map(i=>`<button type="button" data-link-receipt-barcode="${i.id}"><strong>${escapeHtml(i.descricao_xml)}</strong><small>${escapeHtml(i.codigo_interno||"")}</small></button>`).join("")}</div></section>`:"";return `<section class="receipt-guided-panel"><header><span>ETAPA 03</span><h2>Conferir os materiais recebidos</h2><p>Bipe (cada leitura soma a quantidade da embalagem) ou digite a quantidade recebida em cada item.</p></header><div class="receipt-scan-area"><label>Bipe um material<div><i data-lucide="scan-barcode"></i><input id="receiptScanner" autocomplete="off" placeholder="Aguardando leitura..."></div></label><button type="button" class="btn btn-secondary" data-undo-scan>Desfazer última leitura</button></div>${unknown}<div class="receipt-progress"><span><strong>${done}</strong> de ${items.length} itens iniciados</span><i><b style="width:${items.length?done/items.length*100:0}%"></b></i></div><div class="receipt-check-list">${items.filter(i=>i.controlado_estoque!==false||i.tool_type_id).map(i=>{const accepted=Number(i.quantidade_entrada||0),expected=Number(i.quantidade_xml||0)*Number(i.fator_conversao||1),diff=accepted-expected;if(i.tool_type_id)return receiptToolCheckItem(i,accepted,expected,diff);return `<article class="receipt-check-item ${diff===0&&accepted>0?"ok":accepted>0?"different":"pending"}"><div><small>${escapeHtml(i.codigo_fornecedor||i.gtin||i.codigo_interno||"Sem código")}</small><strong>${escapeHtml(i.descricao_xml)}</strong><span>${formatNumber(accepted)}/${formatNumber(expected)} ${escapeHtml(i.unidade_interna||i.unidade_xml||"")}</span></div><div class="receipt-difference"><span>Status</span><strong>${accepted===0?"Pendente":diff===0?"Conferido":diff>0?"Excedente":"Parcial"}</strong></div><label class="receipt-qty-manual" title="Digite a quantidade ou bipe: cada leitura soma aqui">Recebido (${escapeHtml(i.unidade_xml||"NF")})<input class="tw-field" data-received-item="${i.id}" type="number" min="0" step="0.001" inputmode="decimal" value="${escapeAttr(i.quantidade_recebida||0)}"></label><label class="receipt-qty-manual">Avariado<input class="tw-field" data-damaged-item="${i.id}" type="number" min="0" step="0.001" inputmode="decimal" value="${escapeAttr(i.quantidade_avariada||0)}"></label><label class="receipt-lote${receiptItemNeedsLote(i)?" is-required":""}">Lote${receiptItemNeedsLote(i)?" *":""}<input class="tw-field" data-receipt-lote="${i.id}" value="${escapeAttr(i.lote||"")}" placeholder="${receiptItemNeedsLote(i)?"Obrigatório":"Opcional"}" autocomplete="off"></label>${i.material_id?`<div class="receipt-cert${i.certificado_url?" is-ok":""}"><span>Certificado</span>${i.certificado_url?`<button type="button" class="btn btn-secondary btn-sm" data-receipt-cert-open="${escapeAttr(i.certificado_url)}"><i data-lucide="file-check-2"></i> ${escapeHtml(i.certificado_nome||"Anexado")}</button>`:""}<label class="btn btn-secondary btn-sm" title="Quando o fornecedor entregou o certificado em papel: tire foto ou escaneie e anexe aqui"><i data-lucide="paperclip"></i> ${i.certificado_url?"Trocar":"Anexar"}<input type="file" hidden accept=".pdf,.jpg,.jpeg,.png" data-receipt-cert="${i.id}"></label></div>`:""}<span class="receipt-rnc-slot" data-receipt-rnc-slot="${i.id}"></span></article>`;}).join("")}</div></section>`;};

processReceiptScan = async function(code){if(!code)return;const now=Date.now();if(lastReceiptScan.code===code&&now-lastReceiptScan.at<450)return;lastReceiptScan={code,at:now};try{const resolved=await TecnoweldAPI.resolveWarehouseScan(code);let item=resolved?.material_id?(activeNfeReceipt.itens||[]).find(i=>i.material_id===resolved.material_id):null;if(!item){pendingReceiptBarcode=code;renderReceiptWorkflow();return;}const baseQty=resolved.kind==="volume"?Number(resolved.current_quantity):Number(resolved.units_per_scan||1),xmlQty=baseQty/Number(item.fator_conversao??1),previous=item.quantidade_recebida;item.quantidade_recebida=Number(item.quantidade_recebida||0)+xmlQty;calculateReceiptItem(item);const scan=await TecnoweldAPI.saveNfeScan({recebimento_id:activeNfeReceipt.id,item_id:item.id,codigo_lido:code,quantidade:xmlQty});activeNfeReceipt.leituras=[scan,...(activeNfeReceipt.leituras||[])];pendingReceiptBarcode=null;renderReceiptWorkflow();scheduleReceiptAutosave();}catch(error){if(String(error.message).toLowerCase().includes("not")||String(error.message).toLowerCase().includes("encontr")){pendingReceiptBarcode=code;renderReceiptWorkflow();}else window.TecnoAlert?.error?.(error.message,"Falha ao bipar");}finally{setTimeout(()=>document.getElementById("receiptScanner")?.focus(),30);}};

async function linkUnknownReceiptBarcode(itemId){const item=(activeNfeReceipt.itens||[]).find(i=>i.id===itemId);if(!item||!pendingReceiptBarcode)return;try{await TecnoweldAPI.linkMaterialBarcode(item.material_id,pendingReceiptBarcode,Number(item.fator_conversao??1),null,"fornecedor");await TecnoweldAPI.saveSupplierProductLink({cnpj_fornecedor:activeNfeReceipt.cnpj_fornecedor,codigo_fornecedor:pendingReceiptBarcode,gtin:null,material_id:item.material_id,fator_conversao:item.fator_conversao||1});const code=pendingReceiptBarcode;pendingReceiptBarcode=null;await processReceiptScan(code);}catch(e){window.TecnoAlert?.error?.(e.message,"Código não vinculado");}}

function labelMovementType(type) {
  const labels = { entrada: "Entrada", saida: "Saída", reserva: "Reserva", devolucao: "Devolução", ajuste: "Ajuste", contagem: "Contagem", transferencia: "Transferência", retorno_sobra: "Retorno de sobra" };
  return labels[type] || type || "-";
}

function movementTypeClass(type) {
  if (type === "entrada" || type === "devolucao") return "success";
  if (type === "saida") return "danger";
  if (type === "reserva" || type === "contagem") return "warning";
  return "neutral";
}

function requirePermission(permission) {
  return window.TecnoweldPermissions?.require?.(permission, "Você não tem permissão para executar esta ação.") ?? true;
}

function fillSelect(select, values, placeholder) {
  if (!select) return;
  select.innerHTML = values.map((value, index) => {
    const label = index === 0 && placeholder ? placeholder : value;
    return `<option value="${escapeAttr(value)}">${escapeHtml(label)}</option>`;
  }).join("");
}

function debounce(fn, delay) {
  let timeout;
  return (...args) => {
    window.clearTimeout(timeout);
    timeout = window.setTimeout(() => fn(...args), delay);
  };
}

async function fileToDataUrl(file) {
  if (!file) return "";
  const uploaded = await TecnoweldAPI.uploadFile(file, "almoxarifado/anexos");
  return uploaded.url;
}

function xmlTextValue(parent, selector) {
  return parent?.querySelector(selector)?.textContent?.trim() || "";
}

function parseXmlNumber(value) {
  const parsed = Number(String(value || "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatInvoiceDate(value) {
  if (!value) return "";
  // so data (AAAA-MM-DD): sem passar por Date, que le como meia-noite UTC e mostrava o dia anterior no Brasil
  const onlyDate = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (onlyDate) return `${onlyDate[3]}/${onlyDate[2]}/${onlyDate[1]}`;
  const date = new Date(value);
  if (!Number.isNaN(date.getTime())) return date.toLocaleDateString("pt-BR");
  const normalized = String(value).slice(0, 10).split("-").reverse().join("/");
  return normalized.length === 10 ? normalized : value;
}

function formatCurrency(value) {
  return Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString("pt-BR", { maximumFractionDigits: 3 });
}

function formatDateTime(value) {
  if (!value) return "-";
  return new Date(value).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function formatTime(value) {
  if (!value) return "-";
  return new Date(value).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function normalizeText(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]));
}

function escapeAttr(value) {
  return escapeHtml(value);
}

function refreshIcons() {
  if (window.lucide) window.lucide.createIcons({ attrs: { "stroke-width": 2.15 } });
}

const renderReceiptReviewStepBeforeVolumeLabels = renderReceiptReviewStep;
renderReceiptReviewStep = function(){const html=renderReceiptReviewStepBeforeVolumeLabels();if(!activeNfeReceipt?.concluido_em)return html;return html.replace("</section>",`<button class="btn btn-primary" type="button" data-print-receipt-volumes><i data-lucide="printer"></i> Imprimir etiquetas dos volumes</button></section>`);};

document.addEventListener("click",event=>{if(event.target.closest("[data-print-receipt-volumes]"))printReceiptVolumeLabels();});
async function printReceiptVolumeLabels(){try{const volumes=(await TecnoweldAPI.listWarehouseVolumes()).filter(v=>v.nfe_receipt_id===activeNfeReceipt.id);if(!volumes.length)throw new Error("Nenhum volume foi gerado para este recebimento.");const w=window.open("","_blank","width=760,height=720");const cards=volumes.map(v=>`<article><strong>${escapeHtml(v.material?.nome||"")}</strong><b>${escapeHtml(v.internal_code)}</b><span>Quantidade: ${formatNumber(v.current_quantity)} ${escapeHtml(v.material?.unidade||"")}</span><span>Lote: ${escapeHtml(v.batch?.lote||"-")}</span><span>NF-e: ${escapeHtml(activeNfeReceipt.numero_nfe||"")}</span><span>Local: ${escapeHtml(v.location?.codigo||"A definir")}</span></article>`).join("");w.document.write(`<title>Etiquetas do recebimento</title><style>body{font-family:Arial;display:grid;grid-template-columns:1fr 1fr;gap:12px;padding:18px}article{border:2px solid #111;padding:16px;display:grid;gap:7px}b{font-size:22px}</style>${cards}<script>print()<\/script>`);w.document.close();}catch(e){window.TecnoAlert?.error?.(e.message,"Etiquetas indisponíveis");}}


// Balao do aviso "material ainda nao chegou" (bolinha piscando): fica por cima de tudo.
(function setupArrivalTip() {
  let tip = null;
  const hide = () => { tip?.remove(); tip = null; };
  document.addEventListener("mouseover", (event) => {
    const dot = event.target.closest?.("[data-arrival-tip]");
    if (!dot) return hide();
    if (tip?.dataset.for === dot.dataset.arrivalTip) return;
    hide();
    const rows = String(dot.dataset.arrivalTip || "").split("\n").filter(Boolean).map((line) => {
      const [op, date] = line.split("|");
      return `<li><strong>${escapeHtml(op)}</strong><span>precisa em ${escapeHtml(date || "-")}</span></li>`;
    }).join("");
    tip = document.createElement("div");
    tip.className = "arrival-tip";
    tip.dataset.for = dot.dataset.arrivalTip;
    tip.innerHTML = `<div class="arrival-tip-head"><i class="arrival-dot"></i>Material ainda não chegou</div>${rows ? `<ul>${rows}</ul>` : ""}`;
    document.body.appendChild(tip);
    const box = dot.getBoundingClientRect();
    const width = tip.offsetWidth, height = tip.offsetHeight;
    const left = Math.min(Math.max(8, box.left + box.width / 2 - width / 2), window.innerWidth - width - 8);
    const top = box.top - height - 10 < 8 ? box.bottom + 10 : box.top - height - 10;
    tip.style.left = `${left}px`;
    tip.style.top = `${top}px`;
  });
  window.addEventListener("scroll", hide, true);
})();


// ============================================================ Recebimento: bipar a DANFE na lista + checklist por categoria
document.addEventListener("keydown", async (event) => {
  if (event.target?.id !== "receiptSearch" || event.key !== "Enter") return;
  const key = String(event.target.value || "").replace(/\D/g, "");
  if (key.length !== 44) return;
  event.preventDefault();
  try {
    const found = await TecnoweldAPI.findNfeReceiptByKey(key);
    if (!found) return window.TecnoAlert?.info?.("Esta nota ainda não foi importada. Abra o pedido de compra e use \"Importar XML\" ou \"Sem XML\".", "Nota não encontrada");
    event.target.value = "";
    activeNfeReceipt = await TecnoweldAPI.getNfeReceipt(found.id);
    activeReceiptStep = activeNfeReceipt.concluido_em ? 5 : Math.max(Number(activeNfeReceipt.etapa || 1), 1);
    openReceiptWorkflow();
  } catch (error) { window.TecnoAlert?.error?.(error?.message || "Não foi possível abrir a nota.", "Recebimento"); }
});

function receiptItemCategory(item) {
  return materials.find((row) => row.id === item.material_id)?.categoria || item.material?.categoria || "";
}

function checklistQuestionsFor(item) {
  const category = normalizeText(receiptItemCategory(item));
  return (receivingChecklist || []).filter((q) => q.categoria === "Todas" || normalizeText(q.categoria) === category);
}

function checklistAnswer(item, question) {
  return (activeNfeReceipt?.checklist || []).find((a) => a.item_id === item.id && a.question_id === question.id);
}

function renderItemChecklist(item) {
  const questions = checklistQuestionsFor(item);
  if (!questions.length) return `<div class="receipt-checklist is-empty"><span>Sem checklist para a categoria "${escapeHtml(receiptItemCategory(item) || "sem categoria")}". Cadastre em Parâmetros → Almoxarifado.</span></div>`;
  const answered = questions.filter((q) => checklistAnswer(item, q)).length;
  const nc = questions.filter((q) => checklistAnswer(item, q)?.resposta === "nao_conforme").length;
  return `<details class="receipt-checklist${nc ? " has-nc" : ""}" ${answered < questions.length || nc ? "open" : ""}><summary>Checklist de recebimento · ${answered}/${questions.length}${nc ? ` · <b>${nc} não conforme — gera RNC e bloqueia o material</b>` : ""}</summary>${questions.map((q) => {
    const ans = checklistAnswer(item, q);
    const name = `chk-${item.id}-${q.id}`;
    const opt = (value, label) => `<label class="receipt-chk-opt ${value}"><input type="radio" name="${name}" value="${value}" data-chk-item="${item.id}" data-chk-question="${q.id}" ${ans?.resposta === value ? "checked" : ""}> ${label}</label>`;
    const photos = (ans?.anexos || []).length;
    return `<div class="receipt-chk-row${ans?.resposta === "nao_conforme" ? " is-nc" : ""}"><span class="receipt-chk-question">${escapeHtml(q.pergunta)}</span><span class="receipt-chk-opts">${opt("conforme", "Conforme")}${opt("nao_conforme", "Não conforme")}${opt("nao_se_aplica", "N/A")}</span>${ans?.resposta === "nao_conforme" ? `<span class="receipt-chk-nc"><input class="tw-field" placeholder="O que está errado? (obrigatório)" data-chk-note-item="${item.id}" data-chk-note-question="${q.id}" value="${escapeAttr(ans.observacao || "")}"><label class="btn btn-secondary receipt-chk-photo">${photos ? `${photos} foto(s)` : "Foto (obrigatória)"}<input type="file" accept="image/*" capture="environment" multiple hidden data-chk-photo-item="${item.id}" data-chk-photo-question="${q.id}"></label><label>Qtd. afetada<input class="tw-field receipt-chk-qty" type="number" min="0" step="any" data-chk-qty-item="${item.id}" value="${escapeAttr(item._rncQty ?? item.quantidade_recebida ?? "")}"></label>${rncOccTypeSelect(`data-chk-occ-item="${item.id}"`, item._rncTipo)}</span>` : ""}</div>`;
  }).join("")}</details>`;
}

const renderReceiptCheckStepBeforeChecklist = renderReceiptCheckStep;
renderReceiptCheckStep = function () {
  const html = renderReceiptCheckStepBeforeChecklist();
  return html.replace(/(<span class="receipt-rnc-slot" data-receipt-rnc-slot="([^"]+)"><\/span>)(<\/article>)/g, (match, label, itemId, close) => {
    const item = (activeNfeReceipt?.itens || []).find((row) => row.id === itemId);
    return item && item.controlado_estoque !== false ? `${label}${renderItemChecklist(item)}${close}` : match;
  });
};

async function saveChecklistAnswer(itemId, questionId, patch) {
  const item = (activeNfeReceipt?.itens || []).find((row) => row.id === itemId);
  const question = (receivingChecklist || []).find((q) => q.id === questionId);
  if (!item || !question) return;
  const current = checklistAnswer(item, question) || {};
  const saved = await TecnoweldAPI.saveReceivingChecklistAnswer({ recebimento_id: activeNfeReceipt.id, item_id: item.id, question_id: question.id, pergunta: question.pergunta, resposta: patch.resposta || current.resposta, observacao: patch.observacao ?? current.observacao, anexos: patch.anexos ?? current.anexos ?? [] });
  activeNfeReceipt.checklist = [...(activeNfeReceipt.checklist || []).filter((a) => !(a.item_id === item.id && a.question_id === question.id)), saved];
}

document.addEventListener("change", async (event) => {
  const t = event.target;
  try {
    if (t.dataset?.chkQuestion) { await saveChecklistAnswer(t.dataset.chkItem, t.dataset.chkQuestion, { resposta: t.value }); renderReceiptWorkflow(); return; }
    if (t.dataset?.chkNoteQuestion) { await saveChecklistAnswer(t.dataset.chkNoteItem, t.dataset.chkNoteQuestion, { observacao: t.value.trim() }); return; }
    if (t.dataset?.chkPhotoQuestion) {
      const item = (activeNfeReceipt?.itens || []).find((row) => row.id === t.dataset.chkPhotoItem);
      const question = (receivingChecklist || []).find((q) => q.id === t.dataset.chkPhotoQuestion);
      const files = await receiptEvidenceFiles(t.files);
      await saveChecklistAnswer(item.id, question.id, { anexos: [...(checklistAnswer(item, question)?.anexos || []), ...files] });
      renderReceiptWorkflow();
      return;
    }
    if (t.dataset?.chkQtyItem) { const item = (activeNfeReceipt?.itens || []).find((row) => row.id === t.dataset.chkQtyItem); if (item) item._rncQty = Number(t.value || 0); }
    if (t.dataset?.chkOccItem) { (activeNfeReceipt?.itens || []).filter((row) => row.id === t.dataset.chkOccItem).forEach((row) => { row._rncTipo = t.value; }); document.querySelectorAll(`[data-chk-occ-item="${t.dataset.chkOccItem}"]`).forEach((sel) => { sel.value = t.value; }); }
  } catch (error) { window.TecnoAlert?.error?.(error?.message || "Não foi possível salvar o checklist.", "Checklist"); }
});

// Ao sair da conferencia: checklist completo; nao conforme exige descricao + foto e vira RNC para Compras.
async function validateAndSyncReceivingChecklist() {
  const items = (activeNfeReceipt?.itens || []).filter((item) => item.controlado_estoque !== false && item.material_id);
  for (const item of items) {
    const questions = checklistQuestionsFor(item);
    const missing = questions.filter((q) => !checklistAnswer(item, q));
    if (missing.length) throw new Error(`Responda o checklist de "${item.descricao_xml}" (${missing.length} pergunta(s) em aberto).`);
    const ncs = questions.map((q) => checklistAnswer(item, q)).filter((a) => a?.resposta === "nao_conforme");
    for (const a of ncs) {
      if (!String(a.observacao || "").trim()) throw new Error(`Descreva a não conformidade "${a.pergunta}" de "${item.descricao_xml}".`);
      if (!(a.anexos || []).length) throw new Error(`Anexe a foto da não conformidade "${a.pergunta}" de "${item.descricao_xml}".`);
    }
    const qty = ncs.length ? Math.min(Number(item._rncQty ?? item.quantidade_recebida ?? 0), Number(item.quantidade_recebida || 0)) : 0;
    if (ncs.length && qty <= 0) throw new Error(`Informe a quantidade afetada de "${item.descricao_xml}".`);
    if (ncs.length && (window.__twOccTypes || []).length && !item._rncTipo) throw new Error(`Escolha o tipo de ocorrência da não conformidade de "${item.descricao_xml}".`);
    await TecnoweldAPI.syncChecklistRnc(activeNfeReceipt.id, item.id, ncs.length ? {
      quantidade: qty,
      descricao: ncs.map((a) => `${a.pergunta}: ${a.observacao}`).join(" | "),
      anexos: ncs.flatMap((a) => a.anexos || []),
      tipo_ocorrencia_id: item._rncTipo || null,
    } : null);
  }
}

const nextGoodsReceiptStepBeforeChecklist = nextGoodsReceiptStep;
nextGoodsReceiptStep = async function () {
  if (activeReceiptStep === 3 && activeNfeReceipt?.id && !activeNfeReceipt.concluido_em) {
    try { await validateAndSyncReceivingChecklist(); }
    catch (error) { return window.TecnoAlert?.error?.(error?.message || "Checklist incompleto.", "Checklist de recebimento"); }
  }
  return nextGoodsReceiptStepBeforeChecklist();
};


// ============================================================ Nota sem pedido de compra: vincular o PC ou justificar
function receiptHasPurchaseLink(receipt) {
  return Boolean(receipt?.purchase_order_id || receipt?.purchase_request_id || (receipt?.itens || []).some((item) => item.purchase_request_id || item.purchase_order_item_id));
}

const renderReceiptReviewStepBeforeNoOrder = renderReceiptReviewStep;
renderReceiptReviewStep = function () {
  const html = renderReceiptReviewStepBeforeNoOrder();
  if (!activeNfeReceipt || activeNfeReceipt.concluido_em || receiptHasPurchaseLink(activeNfeReceipt)) return html;
  const doc = String(activeNfeReceipt.cnpj_fornecedor || "").replace(/\D/g, "");
  const orders = [...(incomingOrders || [])].sort((a, b) => Number(String(b.cnpj_fornecedor || "").replace(/\D/g, "") === doc) - Number(String(a.cnpj_fornecedor || "").replace(/\D/g, "") === doc));
  const block = `<section class="receipt-no-order"><strong>Esta nota não está ligada a nenhum pedido de compra.</strong><p>Vincule o pedido (o saldo dele é baixado) ou justifique por que o material chegou sem pedido.</p>
    <label>Pedido de compra<select class="tw-field" data-receipt-link-order><option value="">Sem pedido</option>${orders.map((po) => `<option value="${escapeAttr(po.id)}">PC-${escapeHtml(String(po.numero).padStart(6, "0"))} · ${escapeHtml(po.fornecedor || "")}${String(po.cnpj_fornecedor || "").replace(/\D/g, "") === doc ? " (mesmo CNPJ)" : ""}</option>`).join("")}</select></label>
    <label>Justificativa<textarea class="tw-field" data-receipt-no-order-reason placeholder="Ex.: compra emergencial autorizada por..., bonificação do fornecedor, amostra...">${escapeHtml(activeNfeReceipt.justificativa_sem_pedido || "")}</textarea></label></section>`;
  return html.replace('<label class="receipt-confirmation">', `${block}<label class="receipt-confirmation">`);
};

document.addEventListener("change", async (event) => {
  const t = event.target;
  if (!activeNfeReceipt?.id) return;
  try {
    if (t.matches?.("[data-receipt-link-order]") && t.value) {
      await TecnoweldAPI.updateNfeReceipt(activeNfeReceipt.id, { purchase_order_id: t.value });
      activeNfeReceipt.purchase_order_id = t.value;
      window.TecnoAlert?.success?.("Nota vinculada ao pedido de compra. Os itens são ligados pelo material ao concluir.", "Recebimento");
      renderReceiptWorkflow();
    } else if (t.matches?.("[data-receipt-no-order-reason]")) {
      const reason = t.value.trim();
      await TecnoweldAPI.updateNfeReceipt(activeNfeReceipt.id, { justificativa_sem_pedido: reason || null });
      activeNfeReceipt.justificativa_sem_pedido = reason || null;
    }
  } catch (error) { window.TecnoAlert?.error?.(error?.message || "Não foi possível salvar.", "Recebimento"); }
});


// ============================================================ Comprovante de recebimento (A4, com logo)
const RECEIPT_REPORT_STYLE = window.TecnoReport?.style || "";

function receiptReportAddress(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  return [[value.logradouro || value.rua, value.numero].filter(Boolean).join(", "), value.bairro, [value.cidade || value.municipio, value.uf || value.estado].filter(Boolean).join("/"), value.cep].filter(Boolean).join(" · ");
}

async function printReceiptReport() {
  const r = activeNfeReceipt;
  if (!r?.id) return;
  try {
    const [company, po] = await Promise.all([
      TecnoweldAPI.getCompanyProfile().catch(() => null),
      r.purchase_order_id ? TecnoweldAPI.getClient().from("purchase_orders_v2").select("numero").eq("id", r.purchase_order_id).maybeSingle().then((res) => res.data).catch(() => null) : null,
    ]);
    const items = r.itens || [];
    const checklist = r.checklist || [];
    const person = (id) => employees.find((e) => e.id === id)?.nome || "";
    const responsible = person(r.responsavel_id) || person(r.criado_por) || currentWarehouseUser()?.nome || "";
    const withXml = Boolean(r.xml_text) && !String(r.chave_nfe || "").startsWith("SEM-XML-");
    const divergences = items.flatMap((it) => (it.divergencias || []).map((d) => ({ ...d, item: it })));
    const rncs = divergences.filter((d) => d.tipo === "rnc");
    const otherDiv = divergences.filter((d) => d.tipo !== "rnc");
    const openRnc = rncs.some((d) => d.status === "aberta");
    const ncCount = checklist.filter((a) => a.resposta === "nao_conforme").length;
    const status = openRnc ? ["Com RNC aberta", "bad"] : rncs.length || otherDiv.length || r.status === "com_divergencia" ? ["Recebido com ocorrências", "warn"] : ["Recebido conforme", "ok"];
    const money = (v) => formatCurrency(Number(v || 0));
    const qty = (v, u) => `${formatNumber(Number(v || 0))} ${escapeHtml(u || "")}`.trim();
    const field = (label, value, cls = "") => `<div${cls ? ` class="${cls}"` : ""}><small>${escapeHtml(label)}</small><p>${value || "-"}</p></div>`;
    const itemState = (it) => {
      const rnc = (it.divergencias || []).find((d) => d.tipo === "rnc");
      if (rnc) return rnc.status === "aberta" ? `<span class="rr-pill bad">RNC · bloqueado</span>` : `<span class="rr-pill warn">RNC · ${escapeHtml(rnc.decisao || "decidida")}</span>`;
      if (it.controlado_estoque === false) return `<span class="rr-pill na">Não controlado</span>`;
      if (Number(it.quantidade_recebida) !== Number(it.quantidade_xml) || Number(it.quantidade_avariada) > 0) return `<span class="rr-pill warn">Divergência</span>`;
      return `<span class="rr-pill ok">Conforme</span>`;
    };
    const answerPill = (a) => a.resposta === "conforme" ? '<span class="rr-pill ok">Conforme</span>' : a.resposta === "nao_conforme" ? '<span class="rr-pill bad">Não conforme</span>' : '<span class="rr-pill na">N/A</span>';
    const photos = [
      ...checklist.filter((a) => a.resposta === "nao_conforme").flatMap((a) => (a.anexos || []).map((f) => ({ src: f.conteudo, cap: `${items.find((it) => it.id === a.item_id)?.material?.nome || ""} · ${a.pergunta}` }))),
      ...divergences.flatMap((d) => (d.anexos || []).map((f) => ({ src: f.conteudo, cap: `${d.item.material?.nome || d.item.descricao_xml} · ${d.tipo === "rnc" ? "RNC" : String(d.tipo || "").replaceAll("_", " ")}` }))),
    ].filter((p, i, all) => /^data:image\//i.test(p.src || "") && all.findIndex((x) => x.src === p.src) === i).slice(0, 9);
    const totalReceived = items.reduce((s, it) => s + Number(it.quantidade_recebida || 0), 0);
    const totalValue = items.reduce((s, it) => s + Number(it.valor_total || 0), 0);
    const byItem = new Map();
    checklist.forEach((a) => { if (!byItem.has(a.item_id)) byItem.set(a.item_id, []); byItem.get(a.item_id).push(a); });
    const reference = withXml ? `NF-e ${r.numero_nfe}${r.serie ? `/${r.serie}` : ""}` : `NF ${r.numero_nfe}`;
    const issuedAt = formatDateTime(new Date().toISOString());
    let n = 0;
    const html = `<article class="rr-doc">
  <header class="rr-head">
    <div>${company?.logo_url ? `<img src="${escapeAttr(company.logo_url)}" alt="Logo">` : ""}<div class="rr-head-company">${escapeHtml([company?.razao_social || company?.nome_fantasia, company?.documento && formatDocument(company.documento), receiptReportAddress(company?.endereco)].filter(Boolean).join(" · "))}</div></div>
    <div class="rr-head-id">Comprovante de recebimento<strong>${escapeHtml(reference)}</strong>Emitido em ${escapeHtml(issuedAt)}</div>
  </header>
  <div class="rr-title"><div><span>Almoxarifado · Recebimento de mercadorias</span><h1>${escapeHtml(r.fornecedor || "Fornecedor")}</h1></div><span class="rr-status ${status[1]}">${status[0]}</span></div>
  <section class="rr-grid">
    ${field("Fornecedor", escapeHtml(r.nome_fantasia_fornecedor || r.fornecedor), "w2")}
    ${field("CNPJ", escapeHtml(formatDocument(r.cnpj_fornecedor)))}
    ${field("Pedido de compra", po?.numero ? `PC-${escapeHtml(String(po.numero).padStart(6, "0"))}` : r.justificativa_sem_pedido ? "Sem pedido" : "-")}
    ${field("Nota fiscal", escapeHtml(`${r.numero_nfe}${r.serie ? ` · Série ${r.serie}` : ""}`))}
    ${field("Emissão da nota", escapeHtml(r.data_emissao ? formatDateOnly(r.data_emissao) : "-"))}
    ${field("Recebido em", escapeHtml(r.concluido_em ? formatDateTime(r.concluido_em) : "Em andamento"))}
    ${field("Recebido por", escapeHtml(responsible || "-"))}
    ${field("Origem dos dados", withXml ? "XML da NF-e" : "Digitado (sem XML)", withXml ? "" : "")}
    ${field("Natureza da operação", escapeHtml(r.natureza_operacao || "-"), "w2")}
    ${field("Valor da nota", money(r.valor_total))}
    ${withXml ? field("Chave de acesso", `<code>${escapeHtml(String(r.chave_nfe).replace(/(\d{4})(?=\d)/g, "$1 "))}</code>`, "w4") : ""}
  </section>
  <section class="rr-kpis">
    <div><small>Itens na nota</small><strong>${items.length}</strong></div>
    <div><small>Quantidade recebida</small><strong>${formatNumber(totalReceived)}</strong></div>
    <div><small>Checklist</small><strong>${checklist.length ? `${checklist.length - ncCount}/${checklist.length} conformes` : "Não aplicado"}</strong></div>
    <div><small>RNC</small><strong>${rncs.length ? `${rncs.length} ${openRnc ? "aberta(s)" : "decidida(s)"}` : "Nenhuma"}</strong></div>
  </section>

  <section class="rr-section"><h2><b>${++n}.</b>Materiais recebidos</h2>
    <table><colgroup><col style="width:5%"><col style="width:29%"><col style="width:11%"><col style="width:10%"><col style="width:10%"><col style="width:10%"><col style="width:12%"><col style="width:13%"></colgroup>
      <thead><tr><th>#</th><th>Material</th><th>Lote / end.</th><th class="num">Qtd. nota</th><th class="num">Recebido</th><th class="num">Vl. unit.</th><th class="num">Total</th><th>Situação</th></tr></thead>
      <tbody>${items.map((it, i) => `<tr><td>${i + 1}</td><td><strong>${escapeHtml(it.material?.nome || it.descricao_xml)}</strong>${it.material?.nome && it.material.nome !== it.descricao_xml ? `<small>NF: ${escapeHtml(it.descricao_xml)}</small>` : ""}${it.codigo_interno ? `<small>${escapeHtml(it.codigo_interno)}</small>` : ""}</td><td>${escapeHtml(it.lote || "-")}<small>${escapeHtml(it.location?.codigo || it.warehouse_location_code || it.material?.localizacao || "")}</small></td><td class="num">${qty(it.quantidade_xml, it.unidade_xml)}</td><td class="num">${qty(it.quantidade_recebida, it.unidade_xml)}${Number(it.quantidade_avariada) > 0 ? `<small>avariado ${formatNumber(it.quantidade_avariada)}</small>` : ""}${Number(it.fator_conversao || 1) !== 1 ? `<small>entrada ${qty(it.quantidade_entrada, it.unidade_interna)}</small>` : ""}</td><td class="num">${money(it.valor_unitario)}</td><td class="num">${money(it.valor_total)}</td><td>${itemState(it)}</td></tr>`).join("")}</tbody>
    </table>
    <div class="rr-totals">
      <div><small>Produtos</small><strong>${money(r.valor_produtos || totalValue)}</strong></div>
      <div><small>Frete</small><strong>${money(r.valor_frete)}</strong></div>
      <div><small>Desconto</small><strong>${money(r.valor_desconto)}</strong></div>
      <div><small>Impostos</small><strong>${money(r.valor_impostos)}</strong></div>
      <div><small>Total da nota</small><strong>${money(r.valor_total || totalValue)}</strong></div>
    </div>
  </section>

  <section class="rr-section"><h2><b>${++n}.</b>Checklist de recebimento</h2>
    ${byItem.size ? items.filter((it) => byItem.has(it.id)).map((it) => {
      const answers = byItem.get(it.id);
      const nc = answers.filter((a) => a.resposta === "nao_conforme").length;
      return `<div class="rr-check"><header><span>${escapeHtml(it.material?.nome || it.descricao_xml)}</span><small>${nc ? `${nc} não conforme(s)` : "Todos conformes"}</small></header><table><colgroup><col style="width:52%"><col style="width:16%"><col style="width:32%"></colgroup><tbody>${answers.map((a) => `<tr><td>${escapeHtml(a.pergunta)}</td><td>${answerPill(a)}</td><td>${escapeHtml(a.observacao || "")}</td></tr>`).join("")}</tbody></table></div>`;
    }).join("") : `<div class="rr-note">Nenhum checklist aplicado neste recebimento.</div>`}
  </section>

  <section class="rr-section"><h2><b>${++n}.</b>Divergências e RNC</h2>
    ${rncs.length || otherDiv.length ? [
      ...rncs.map((d) => `<div class="rr-rnc"><header><span>RNC · ${escapeHtml(d.item.material?.nome || d.item.descricao_xml)}</span><span class="rr-pill ${d.status === "aberta" ? "bad" : "warn"}">${d.status === "aberta" ? "Aguardando decisão de Compras" : escapeHtml(d.decisao || "Decidida")}</span></header><p><strong>Quantidade:</strong> ${qty(d.quantidade_bloqueada ?? d.quantidade, d.quantidade_bloqueada != null ? d.item.unidade_interna : d.item.unidade_xml)}${d.status === "aberta" ? " bloqueada fora do saldo" : ""}</p><p><strong>Não conformidade:</strong> ${escapeHtml(d.descricao || "-")}</p>${d.status !== "aberta" && d.observacao_decisao ? `<p><strong>Decisão de Compras:</strong> ${escapeHtml(d.observacao_decisao)}${d.valor_abatimento ? ` · abatimento de ${money(d.valor_abatimento)}` : ""}</p>` : ""}</div>`),
      ...(otherDiv.length ? [`<table><colgroup><col style="width:28%"><col style="width:18%"><col style="width:12%"><col style="width:20%"><col style="width:22%"></colgroup><thead><tr><th>Material</th><th>Tipo</th><th class="num">Qtd.</th><th>Decisão</th><th>Descrição</th></tr></thead><tbody>${otherDiv.map((d) => `<tr><td>${escapeHtml(d.item.material?.nome || d.item.descricao_xml)}</td><td>${escapeHtml(String(d.tipo || "").replaceAll("_", " "))}</td><td class="num">${formatNumber(d.quantidade)}</td><td>${escapeHtml(String(d.decisao || "-").replaceAll("_", " "))}</td><td>${escapeHtml(d.descricao || "")}</td></tr>`).join("")}</tbody></table>`] : []),
    ].join("") : `<div class="rr-note ok">Nenhuma divergência ou RNC neste recebimento: todos os materiais conferem com a nota.</div>`}
  </section>

  ${photos.length ? `<section class="rr-section"><h2><b>${++n}.</b>Evidências fotográficas</h2><div class="rr-photos">${photos.map((p, i) => `<figure><img src="${escapeAttr(p.src)}" alt="Evidência ${i + 1}"><figcaption>${i + 1}. ${escapeHtml(p.cap)}</figcaption></figure>`).join("")}</div></section>` : ""}

  ${r.observacoes || r.justificativa_sem_pedido ? `<section class="rr-section"><h2><b>${++n}.</b>Observações</h2><div class="rr-note">${escapeHtml([r.justificativa_sem_pedido && `Recebido sem pedido de compra: ${r.justificativa_sem_pedido}`, r.observacoes].filter(Boolean).join("\n"))}</div></section>` : ""}

  <section class="rr-signs">
    <div><strong>${escapeHtml(responsible || "")}</strong>Recebido por (Almoxarifado)</div>
    <div><strong>&nbsp;</strong>Conferido por</div>
    <div><strong>&nbsp;</strong>Compras</div>
  </section>
  <footer class="rr-foot"><span>${escapeHtml(company?.nome_fantasia || company?.razao_social || "Tecnoweld")} · Documento gerado pelo sistema</span><span>${escapeHtml(reference)} · ${escapeHtml(issuedAt)}</span></footer>
</article>`;
    const topDoc = window.top.document;
    if (!topDoc.getElementById("receiptReportFont")) {
      const link = topDoc.createElement("link");
      link.id = "receiptReportFont";
      link.rel = "stylesheet";
      link.href = "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap";
      topDoc.head.appendChild(link);
    }
    if (!topDoc.getElementById("receiptReportStyle")) {
      const style = topDoc.createElement("style");
      style.id = "receiptReportStyle";
      style.textContent = RECEIPT_REPORT_STYLE;
      topDoc.head.appendChild(style);
    }
    let area = topDoc.getElementById("receiptReportPrintArea");
    if (!area) { area = topDoc.createElement("div"); area.id = "receiptReportPrintArea"; topDoc.body.appendChild(area); }
    area.innerHTML = html;
    await Promise.all([...area.querySelectorAll("img")].map((img) => (img.complete ? img.decode?.().catch(() => {}) : new Promise((resolve) => { img.onload = resolve; img.onerror = resolve; }))));
    topDoc.body.classList.add("printing-receipt-report");
    window.top.onafterprint = () => { topDoc.body.classList.remove("printing-receipt-report"); area.innerHTML = ""; };
    window.top.print();
  } catch (error) {
    console.error(error);
    window.TecnoAlert?.error?.(error?.message || "Não foi possível gerar o comprovante.", "Comprovante");
  }
}

document.addEventListener("click", (event) => {
  if (event.target.closest("[data-print-receipt-report]")) printReceiptReport();
});


// ============================================================ Contagem: leitor pega o bipe em qualquer campo da aba
// O leitor "digita" muito rapido e termina com Enter. Se o foco estiver em outro campo (ex.: quantidade),
// a leitura e desviada para a contagem e o campo volta ao valor anterior.
const countScanCapture = { chars: "", last: 0, target: null, original: "" };
document.addEventListener("keydown", (event) => {
  if (almoxEls.countTab?.classList.contains("hidden") || !almoxEls.countTab?.contains(event.target)) return;
  if (event.target.id === "countScanInput") return;
  const now = Date.now();
  const fast = now - countScanCapture.last < 45;
  if (event.key === "Enter") {
    if (countScanCapture.chars.length >= 3 && fast) {
      event.preventDefault();
      const target = countScanCapture.target;
      if (target && "value" in target) { target.value = countScanCapture.original; target.dispatchEvent(new Event("input", { bubbles: true })); }
      const code = countScanCapture.chars;
      countScanCapture.chars = "";
      handleCountScan({ value: code, focus: () => document.getElementById("countScanInput")?.focus() });
    }
    countScanCapture.chars = "";
    return;
  }
  if (event.key.length !== 1 || event.ctrlKey || event.metaKey || event.altKey) return;
  if (!fast) {
    countScanCapture.chars = event.key;
    countScanCapture.target = event.target;
    countScanCapture.original = "value" in event.target ? event.target.value : "";
  } else {
    countScanCapture.chars += event.key;
    if (countScanCapture.chars.length >= 2) event.preventDefault();
  }
  countScanCapture.last = now;
}, true);


// ============================================================ Concluir ciclo de contagem + relatorio A4
async function mountRrReport(html) {
  return window.TecnoReport.mount(html);
}

const COUNT_STATUS = {
  sem_divergencia: ["Bateu", "ok"],
  aguardando_justificativa: ["Justificativa pendente", "bad"],
  pendente: ["Aguardando aprovação", "warn"],
  aprovado: ["Ajuste aprovado", "ok"],
  recusado: ["Ajuste recusado", "na"],
};

async function printCountCycleReport(cycleId) {
  try {
    const [data, company] = await Promise.all([
      TecnoweldAPI.getWarehouseCountCycleReport(cycleId),
      TecnoweldAPI.getCompanyProfile().catch(() => null),
    ]);
    const items = data?.itens || [];
    const diffItems = items.filter((it) => Number(it.divergencia || 0) !== 0);
    const matched = items.length - diffItems.length;
    const pct = items.length ? Math.round(matched / items.length * 100) : 0;
    const missingValue = diffItems.filter((it) => Number(it.divergencia) < 0).reduce((s, it) => s + Number(it.valor_divergencia || 0), 0);
    const surplusValue = diffItems.filter((it) => Number(it.divergencia) > 0).reduce((s, it) => s + Number(it.valor_divergencia || 0), 0);
    const people = [...new Set(items.map((it) => it.contado_por).filter(Boolean))];
    const openAdj = diffItems.filter((it) => ["aguardando_justificativa", "pendente"].includes(it.ajuste_status)).length;
    const status = openAdj ? [`${openAdj} ajuste(s) em aberto`, "warn"] : diffItems.length ? ["Concluída com ajustes", "warn"] : ["Estoque conferido", "ok"];
    const money = (v) => formatCurrency(Number(v || 0));
    const num = (v) => formatNumber(Number(v || 0));
    const signed = (v) => `${Number(v) > 0 ? "+" : ""}${num(v)}`;
    const pill = (it) => { const [label, tone] = COUNT_STATUS[it.ajuste_status] || (Number(it.divergencia || 0) === 0 ? COUNT_STATUS.sem_divergencia : ["Divergência", "warn"]); return `<span class="rr-pill ${tone}">${label}</span>`; };
    const field = (label, value, cls = "") => `<div${cls ? ` class="${cls}"` : ""}><small>${escapeHtml(label)}</small><p>${value || "-"}</p></div>`;
    const period = `${formatDateOnly(data.iniciado_em)} a ${data.concluido_em ? formatDateOnly(data.concluido_em) : "em andamento"}`;
    const reference = `Contagem nº ${data.numero}`;
    const issuedAt = formatDateTime(new Date().toISOString());
    let n = 0;
    const html = `<article class="rr-doc">
  <header class="rr-head">
    <div>${company?.logo_url ? `<img src="${escapeAttr(company.logo_url)}" alt="Logo">` : ""}<div class="rr-head-company">${escapeHtml([company?.razao_social || company?.nome_fantasia, company?.documento && formatDocument(company.documento)].filter(Boolean).join(" · "))}</div></div>
    <div class="rr-head-id">Relatório de inventário<strong>${escapeHtml(reference)}</strong>Emitido em ${escapeHtml(issuedAt)}</div>
  </header>
  <div class="rr-title"><div><span>Almoxarifado · Contagem de estoque às cegas</span><h1>Inventário completo do estoque</h1></div><span class="rr-status ${status[1]}">${status[0]}</span></div>
  <section class="rr-grid">
    ${field("Período da contagem", escapeHtml(period), "w2")}
    ${field("Concluída em", escapeHtml(data.concluido_em ? formatDateTime(data.concluido_em) : "-"))}
    ${field("Concluída por", escapeHtml(data.concluido_por || "-"))}
    ${field("Contado por", escapeHtml(people.join(", ") || "-"), "w4")}
  </section>
  <section class="rr-kpis">
    <div><small>Materiais contados</small><strong>${items.length}</strong></div>
    <div><small>Bateram com o sistema</small><strong>${matched} · ${pct}%</strong></div>
    <div><small>Com divergência</small><strong>${diffItems.length}</strong></div>
    <div><small>Resultado financeiro</small><strong>${money(missingValue + surplusValue)}</strong></div>
  </section>

  <section class="rr-section"><h2><b>${++n}.</b>Divergências encontradas</h2>
    ${diffItems.length ? `<table><colgroup><col style="width:21%"><col style="width:10%"><col style="width:9%"><col style="width:10%"><col style="width:12%"><col style="width:15%"><col style="width:23%"></colgroup>
      <thead><tr><th>Material</th><th class="num">Sistema</th><th class="num">Contado</th><th class="num">Diferença</th><th class="num">Valor</th><th>Situação</th><th>Justificativa / aprovação</th></tr></thead>
      <tbody>${diffItems.map((it) => `<tr><td><strong>${escapeHtml(it.nome)}</strong><small>${escapeHtml([it.codigo, it.localizacao || "Sem endereço"].join(" · "))}</small></td><td class="num">${num(it.quantidade_sistema)} ${escapeHtml(it.unidade || "")}</td><td class="num">${num(it.quantidade_contada)}</td><td class="num"><strong style="color:${Number(it.divergencia) < 0 ? "#b91c1c" : "#047857"}">${signed(it.divergencia)}</strong></td><td class="num">${money(it.valor_divergencia)}</td><td>${pill(it)}</td><td>${escapeHtml(it.justificativa || "-")}${it.analisado_por ? `<small>${escapeHtml(it.analisado_por)}${it.analise_observacao ? ` · ${escapeHtml(it.analise_observacao)}` : ""}</small>` : ""}</td></tr>`).join("")}</tbody>
    </table>
    <div class="rr-totals" style="grid-template-columns:repeat(3,1fr)">
      <div><small>Faltas</small><strong>${money(missingValue)}</strong></div>
      <div><small>Sobras</small><strong>${money(surplusValue)}</strong></div>
      <div><small>Resultado</small><strong>${money(missingValue + surplusValue)}</strong></div>
    </div>` : `<div class="rr-note ok">Nenhuma divergência: todos os materiais contados bateram com o sistema.</div>`}
  </section>

  <section class="rr-section"><h2><b>${++n}.</b>Contagem completa</h2>
    <table><colgroup><col style="width:24%"><col style="width:11%"><col style="width:11%"><col style="width:9%"><col style="width:10%"><col style="width:17%"><col style="width:18%"></colgroup>
      <thead><tr><th>Material</th><th>Endereço</th><th class="num">Sistema</th><th class="num">Contado</th><th class="num">Diferença</th><th>Contado por</th><th>Situação</th></tr></thead>
      <tbody>${items.map((it) => `<tr><td><strong>${escapeHtml(it.nome)}</strong><small>${escapeHtml([it.codigo, it.categoria].filter(Boolean).join(" · "))}</small></td><td>${escapeHtml(it.localizacao || "Sem endereço")}</td><td class="num">${num(it.quantidade_sistema)} ${escapeHtml(it.unidade || "")}</td><td class="num">${num(it.quantidade_contada)}</td><td class="num">${signed(it.divergencia)}</td><td>${escapeHtml(it.contado_por || "-")}<small>${escapeHtml(it.contado_em ? formatDateTime(it.contado_em) : "")}</small></td><td>${pill(it)}</td></tr>`).join("")}</tbody>
    </table>
  </section>

  <section class="rr-signs">
    <div><strong>${escapeHtml(data.concluido_por || "")}</strong>Responsável pelo almoxarifado</div>
    <div><strong>&nbsp;</strong>Aprovação dos ajustes</div>
    <div><strong>&nbsp;</strong>Gestão</div>
  </section>
  <footer class="rr-foot"><span>${escapeHtml(company?.nome_fantasia || company?.razao_social || "Tecnoweld")} · Documento gerado pelo sistema</span><span>${escapeHtml(reference)} · ${escapeHtml(issuedAt)}</span></footer>
</article>`;
    await mountRrReport(html);
  } catch (error) {
    console.error(error);
    window.TecnoAlert?.error?.(error?.message || "Não foi possível gerar o relatório da contagem.", "Contagem");
  }
}

document.addEventListener("click", async (event) => {
  const last = event.target.closest("[data-count-last-report]");
  if (last) return printCountCycleReport(last.dataset.countLastReport);
  const conclude = event.target.closest("[data-count-conclude]");
  if (!conclude || conclude.disabled) return;
  const ok = await window.TecnoAlert?.confirm?.({ title: "Concluir contagem", message: "Todo o estoque foi contado neste ciclo. Ao concluir, o relatório é gerado e um novo ciclo começa com todos os materiais liberados.", confirmText: "Concluir e gerar relatório", cancelText: "Voltar" });
  if (!ok) return;
  conclude.disabled = true;
  try {
    const cycleId = await TecnoweldAPI.concludeWarehouseCountCycle();
    const [cycle, state, history] = await Promise.all([TecnoweldAPI.listWarehouseCountCycle().catch(() => []), TecnoweldAPI.getWarehouseCountCycleState().catch(() => null), TecnoweldAPI.listWarehouseCountCycles().catch(() => [])]);
    countCycle = new Map((cycle || []).map((row) => [row.material_id, row]));
    countCycleState = state;
    countCycleHistory = history || [];
    rerenderCountTab();
    await printCountCycleReport(cycleId);
  } catch (error) {
    conclude.disabled = false;
    window.TecnoAlert?.error?.(error?.message || "Não foi possível concluir a contagem.", "Contagem");
  }
});

// ============================================================ Valores e pagamento conferidos no recebimento (2026-10-02)
// O almoxarifado corrige o valor de cada item (quando a NF vem diferente do pedido) e o pagamento (forma + parcelas).
// O Contas a Pagar segue esses valores (save_nfe_receipt_values / finance_sync_payable_from_nfe). Salva ao concluir; depois
// de concluido, o botao "Salvar valores" refaz os titulos ainda nao pagos.
let receiptValues = null;
const RV_FORMAS = [["boleto", "Boleto"], ["pix", "PIX"], ["transferencia", "Transferência"], ["cartao", "Cartão"], ["dinheiro", "Dinheiro"]];
async function loadReceiptValues() {
  const id = activeNfeReceipt?.id;
  if (!id || receiptValues?.loading === id) return;
  receiptValues = { receiptId: id, loading: id };
  try {
    const { data, error } = await TecnoweldAPI.getClient().rpc("nfe_receipt_values", { p_receipt_id: id });
    if (error) throw error;
    if (activeNfeReceipt?.id !== id) return;
    receiptValues = { receiptId: id, data, unit: Object.fromEntries((data?.itens || []).map((i) => [i.id, Number(i.valor_unitario || 0)])),
      forma: data?.forma || "boleto", parcelas: (data?.parcelas || []).map((p) => ({ due_date: String(p.due_date || "").slice(0, 10), amount: Number(p.amount || 0) })) };
  } catch (error) {
    receiptValues = { receiptId: id, error: error?.message || "Não foi possível carregar os valores." };
  }
  if (activeReceiptStep === 5) renderReceiptWorkflow();
}
function rvTotals() {
  const d = receiptValues?.data || {};
  const prod = (d.itens || []).reduce((sum, i) => sum + Math.round(Number(receiptValues.unit[i.id] || 0) * Number(i.quantidade || 0) * 100) / 100, 0);
  const total = Math.round((prod + Number(d.outros || 0)) * 100) / 100;
  const parcelas = Math.round((receiptValues.parcelas || []).reduce((s, p) => s + Number(p.amount || 0), 0) * 100) / 100;
  return { prod, total, parcelas, diff: Math.round((total - parcelas) * 100) / 100 };
}
function rvSumHtml() {
  const t = rvTotals();
  return `Soma das parcelas <b>${formatCurrency(t.parcelas)}</b> de <b>${formatCurrency(t.total)}</b>${Math.abs(t.diff) > 0.05 ? ` · <span class="rv-bad">${t.diff > 0 ? "faltam" : "sobram"} ${formatCurrency(Math.abs(t.diff))}</span>` : ' · <span class="rv-ok">confere</span>'}`;
}
function renderReceiptValuesBlock() {
  if (!receiptValues || receiptValues.receiptId !== activeNfeReceipt?.id || receiptValues.loading) {
    loadReceiptValues();
    return `<section class="receipt-values"><p class="muted-line">Carregando valores e pagamento…</p></section>`;
  }
  if (receiptValues.error) return `<section class="receipt-values"><p class="muted-line">${escapeHtml(receiptValues.error)}</p></section>`;
  const d = receiptValues.data || {}, t = rvTotals();
  const origem = { recebimento: "conferidas no recebimento", xml: "do XML da nota", pedido: "confirmadas por Compras no pedido", condicao: `pela condição do pedido${d.condicao_pedido ? ` (${escapeHtml(d.condicao_pedido)})` : ""}` }[d.origem] || "";
  const itemRow = (i) => {
    const unit = Number(receiptValues.unit[i.id] || 0), ped = i.valor_pedido == null ? null : Number(i.valor_pedido);
    const diff = ped == null ? 0 : Math.round((unit - ped) * 100) / 100;
    return `<tr><td><strong>${escapeHtml(i.descricao || "")}</strong></td><td class="num">${formatNumber(i.quantidade)} ${escapeHtml(i.unidade || "")}</td>
      <td class="num">${ped == null ? "—" : formatCurrency(ped)}</td>
      <td><input class="tw-field rv-unit" type="number" min="0" step="0.01" inputmode="decimal" data-rv-unit="${escapeAttr(i.id)}" value="${escapeAttr(unit)}"></td>
      <td class="num" data-rv-line="${escapeAttr(i.id)}">${formatCurrency(Math.round(unit * Number(i.quantidade || 0) * 100) / 100)}</td>
      <td>${ped != null && Math.abs(diff) > 0.004 ? `<span class="rv-diff ${diff > 0 ? "is-up" : "is-down"}">${diff > 0 ? "+" : "−"}${formatCurrency(Math.abs(diff))} vs pedido</span>` : ""}</td></tr>`;
  };
  return `<section class="receipt-values rv-v2">
    <header><h3>Valores e pagamento</h3><p>Confira com a nota. Se algo vier diferente do pedido, corrija aqui: o Financeiro passa a seguir estes valores.</p></header>
    <div class="rv-step"><h4><b>1</b> Valor dos itens</h4><p class="rv-step-hint">Valor unitário que veio na nota. A diferença para o pedido aparece ao lado.</p>
      <div class="almox-table-wrap"><table class="rv-table"><thead><tr><th>Item</th><th class="num">Qtd NF</th><th class="num">Valor no pedido</th><th>Valor na nota (un.)</th><th class="num">Total</th><th></th></tr></thead>
      <tbody>${(d.itens || []).map(itemRow).join("")}</tbody></table></div>
      <div class="rv-totals"><span>Produtos <b data-rv-prod>${formatCurrency(t.prod)}</b></span>${Number(d.outros || 0) ? `<span>Frete/impostos/outros <b>${formatCurrency(d.outros)}</b></span>` : ""}<span>Total da nota <b data-rv-total>${formatCurrency(t.total)}</b></span>${d.pedido_total != null ? `<span>Pedido PC-${escapeHtml(String(d.pedido_numero || "").padStart(6, "0"))} <b>${formatCurrency(d.pedido_total)}</b></span>` : ""}</div>
    </div>
    <div class="rv-step"><h4><b>2</b> Forma de pagamento</h4>
      <label class="rv-forma">Como será pago<select class="tw-field" data-rv-forma>${RV_FORMAS.map(([v, l]) => `<option value="${v}"${receiptValues.forma === v ? " selected" : ""}>${l}</option>`).join("")}</select></label>
    </div>
    <div class="rv-step"><h4><b>3</b> Parcelas a pagar</h4><p class="rv-step-hint">${origem ? `Sugeridas ${origem}. ` : ""}A soma das parcelas precisa bater com o total da nota.</p>
      <div class="rv-parcelas-v2">
        ${(receiptValues.parcelas || []).length ? `<div class="rv-parcela-head"><span>Parcela</span><span>Vencimento</span><span>Valor a pagar</span><span></span></div>` : `<p class="muted-line">Nenhuma parcela. Use "Parcela" para adicionar ou "Dividir o total igualmente".</p>`}
        ${(receiptValues.parcelas || []).map((p, n) => `<div class="rv-parcela"><b>${n + 1}ª</b><input class="tw-field" type="date" data-rv-due="${n}" value="${escapeAttr(p.due_date)}"><input class="tw-field" type="number" min="0" step="0.01" inputmode="decimal" data-rv-amount="${n}" value="${escapeAttr(p.amount)}"><button type="button" class="icon-btn" data-rv-del="${n}" title="Remover parcela"><i data-lucide="x"></i></button></div>`).join("")}
      </div>
      <div class="rv-actions"><button type="button" class="btn btn-secondary" data-rv-add><i data-lucide="plus"></i> Parcela</button><button type="button" class="btn btn-secondary" data-rv-split>Dividir o total igualmente</button><span class="rv-sum" data-rv-sum>${rvSumHtml()}</span></div>
    </div>
    ${activeNfeReceipt?.concluido_em ? `<div class="rv-save-row">${d.ajustado_em ? `<small>Ajustado por ${escapeHtml(d.ajustado_por || "-")} em ${formatDateTime(d.ajustado_em)}</small>` : ""}<button type="button" class="btn btn-primary" data-rv-save>Salvar valores</button></div>` : `<p class="muted-line">Os valores e as parcelas são salvos ao concluir o recebimento.</p>`}
  </section>`;
}
async function saveReceiptValues() {
  if (!receiptValues?.data) return;
  const t = rvTotals();
  if (Math.abs(t.diff) > 0.05) throw new Error(`A soma das parcelas (${formatCurrency(t.parcelas)}) é diferente do total da nota (${formatCurrency(t.total)}).`);
  const { data, error } = await TecnoweldAPI.getClient().rpc("save_nfe_receipt_values", {
    p_receipt_id: activeNfeReceipt.id,
    p_itens: (receiptValues.data.itens || []).map((i) => ({ id: i.id, valor_unitario: Number(receiptValues.unit[i.id] || 0) })),
    p_forma: receiptValues.forma, p_parcelas: receiptValues.parcelas,
  });
  if (error) throw error;
  activeNfeReceipt.valor_total = Number(data?.valor_total ?? activeNfeReceipt.valor_total);
  receiptValues = null;
}
const renderReceiptReviewStepBeforeValues = renderReceiptReviewStep;
renderReceiptReviewStep = function () {
  const html = renderReceiptReviewStepBeforeValues();
  if (!activeNfeReceipt?.id || activeNfeReceipt.concluido_em) return html;   // concluído: valores não aparecem nem podem ser editados de novo
  const block = renderReceiptValuesBlock();
  return html.includes('<label class="receipt-confirmation">') ? html.replace('<label class="receipt-confirmation">', `${block}<label class="receipt-confirmation">`) : html + block;
};
const nextGoodsReceiptStepBeforeValues = nextGoodsReceiptStep;
nextGoodsReceiptStep = async function () {
  if (activeReceiptStep === 5 && activeNfeReceipt?.id && !activeNfeReceipt.concluido_em && receiptValues?.data) {
    if (!document.getElementById("receiptFinalConfirmation")?.checked) return nextGoodsReceiptStepBeforeValues();
    try { await saveReceiptValues(); }
    catch (error) { return window.TecnoAlert?.error?.(error?.message || "Não foi possível salvar os valores.", "Valores e pagamento"); }
  }
  return nextGoodsReceiptStepBeforeValues();
};
document.addEventListener("input", (event) => {
  const t = event.target;
  if (!receiptValues?.data || !t.closest?.(".receipt-values")) return;
  if (t.dataset.rvUnit) {
    receiptValues.unit[t.dataset.rvUnit] = Number(t.value || 0);
    const item = (receiptValues.data.itens || []).find((i) => i.id === t.dataset.rvUnit);
    const line = document.querySelector(`[data-rv-line="${CSS.escape(t.dataset.rvUnit)}"]`);
    if (line && item) line.textContent = formatCurrency(Math.round(Number(t.value || 0) * Number(item.quantidade || 0) * 100) / 100);
  }
  if (t.dataset.rvAmount !== undefined) receiptValues.parcelas[Number(t.dataset.rvAmount)].amount = Number(t.value || 0);
  if (t.dataset.rvDue !== undefined) receiptValues.parcelas[Number(t.dataset.rvDue)].due_date = t.value;
  const tt = rvTotals();
  const prod = document.querySelector("[data-rv-prod]"), total = document.querySelector("[data-rv-total]"), sum = document.querySelector("[data-rv-sum]");
  if (prod) prod.textContent = formatCurrency(tt.prod);
  if (total) total.textContent = formatCurrency(tt.total);
  if (sum) sum.innerHTML = rvSumHtml();
});
document.addEventListener("change", (event) => {
  if (event.target.matches?.("[data-rv-forma]") && receiptValues) receiptValues.forma = event.target.value;
});
document.addEventListener("click", async (event) => {
  const b = event.target.closest?.("[data-rv-add],[data-rv-del],[data-rv-split],[data-rv-save]");
  if (!b || !receiptValues?.data) return;
  const list = receiptValues.parcelas;
  if (b.dataset.rvAdd !== undefined) {
    const last = list[list.length - 1]?.due_date;
    const next = last ? new Date(`${last}T12:00:00`) : new Date();
    if (last) next.setMonth(next.getMonth() + 1);
    list.push({ due_date: next.toISOString().slice(0, 10), amount: Math.max(0, rvTotals().diff) });
  } else if (b.dataset.rvDel !== undefined) {
    list.splice(Number(b.dataset.rvDel), 1);
  } else if (b.dataset.rvSplit !== undefined) {
    if (!list.length) list.push({ due_date: new Date().toISOString().slice(0, 10), amount: 0 });
    const total = rvTotals().total, n = list.length, each = Math.floor((total / n) * 100) / 100;
    list.forEach((p, i) => { p.amount = i === n - 1 ? Math.round((total - each * (n - 1)) * 100) / 100 : each; });
  } else if (b.dataset.rvSave !== undefined) {
    b.disabled = true;
    try { await saveReceiptValues(); window.TecnoAlert?.success?.("Valores e parcelas salvos. O Contas a Pagar foi atualizado.", "Recebimento"); }
    catch (error) { window.TecnoAlert?.error?.(error?.message || "Não foi possível salvar.", "Valores e pagamento"); }
    finally { b.disabled = false; }
  }
  renderReceiptWorkflow();
});

// ============================================================ Lote na conferencia do recebimento (2026-10-02)
// Material com "Exige lote" no cadastro precisa do lote para sair da conferencia (o banco tambem barra ao concluir).
function receiptItemNeedsLote(item) {
  // (2026-11-10) o pedido de compra tambem pode exigir lote (o banco barra a conclusao): antes a tela dizia "Opcional"
  if (item?.po_item?.requer_lote) return true;
  const material = (typeof materials !== "undefined" ? materials : []).find((m) => m.id === item.material_id);
  return Boolean(material?.exige_lote);
}
// (2026-11-10) "input" tambem: o lote digitado e clicado direto em Continuar/fechar a tela nao se perde
["change", "input"].forEach((type) => document.addEventListener(type, (event) => {
  const id = event.target?.dataset?.receiptLote;
  if (!id) return;
  const item = (activeNfeReceipt?.itens || []).find((row) => row.id === id);
  if (!item) return;
  item.lote = event.target.value.trim() || null;
  scheduleReceiptAutosave();
}));
const nextGoodsReceiptStepBeforeLote = nextGoodsReceiptStep;
nextGoodsReceiptStep = async function () {
  if (activeReceiptStep === 3 && activeNfeReceipt?.id && !activeNfeReceipt.concluido_em) {
    const missing = (activeNfeReceipt.itens || []).filter((item) => item.controlado_estoque !== false && Number(item.quantidade_recebida || 0) > 0 && receiptItemNeedsLote(item) && !String(item.lote || "").trim());
    if (missing.length) return window.TecnoAlert?.error?.(`Informe o lote de: ${missing.map((item) => item.descricao_xml).join(", ")}.`, "Lote obrigatório");
  }
  return nextGoodsReceiptStepBeforeLote();
};

// ============================================================ Recebimento: topo mostra a nota aberta (2026-10-02)
// Com um recebimento aberto o topo vira "NF 9998 · Chiavari" + resumo (sem o botao Novo recebimento); no painel volta ao titulo.
function receiptHeaderContext() {
  const center = document.getElementById("goodsReceiptCenter");
  const workflow = document.getElementById("goodsReceiptWorkflow");
  const header = center?.querySelector(".goods-receipt-header > div");
  if (!center || !workflow || !header) return;
  const title = header.querySelector("h1"), sub = header.querySelector("p");
  const base = { title: title?.textContent || "", sub: sub?.textContent || "" };
  let chips = header.querySelector(".receipt-header-chips");
  if (!chips) { chips = document.createElement("div"); chips.className = "receipt-header-chips"; header.appendChild(chips); }
  // (2026-10-10) etapas do recebimento na mesma linha do título (NF · fornecedor) durante a conferência
  const steps = document.getElementById("receiptSteps");
  const headerRow = center.querySelector(".goods-receipt-header");
  // as etapas saem do quadro da conferência (que tratava o clique): tratam o próprio clique aqui
  steps?.addEventListener("click", (event) => { event.stopPropagation(); handleReceiptWorkflowClick(event); });
  const update = () => {
    const open = !workflow.classList.contains("hidden") && Boolean(activeNfeReceipt);
    center.classList.toggle("is-workflow", open);
    if (steps && headerRow) {
      if (open && steps.parentElement !== headerRow) headerRow.insertBefore(steps, headerRow.querySelector("#newGoodsReceiptBtn"));
      if (!open && steps.parentElement !== workflow) workflow.insertBefore(steps, workflow.firstChild);
    }
    if (!open) { if (title) title.textContent = base.title; if (sub) sub.textContent = base.sub; chips.innerHTML = ""; return; }
    const r = activeNfeReceipt;
    if (title) title.textContent = r.numero_nfe ? `NF ${r.numero_nfe}${r.fornecedor ? ` · ${r.fornecedor}` : ""}` : "Novo recebimento";
    if (sub) sub.textContent = r.concluido_em ? "Recebimento concluído" : "Recebimento em andamento";
    const itens = (r.itens || []).length;
    chips.innerHTML = r.numero_nfe ? [r.serie ? `Série ${escapeHtml(r.serie)}` : "", itens ? `${itens} ${itens === 1 ? "item" : "itens"}` : "", r.valor_total ? formatCurrency(r.valor_total) : ""].filter(Boolean).map((t) => `<span>${t}</span>`).join("") : "";
  };
  new MutationObserver(update).observe(workflow, { attributes: true, attributeFilter: ["class"] });
  const before = renderReceiptWorkflow;
  renderReceiptWorkflow = function () { const out = before.apply(this, arguments); update(); return out; };
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", receiptHeaderContext); else receiptHeaderContext();

// ============================================================ Recebimento: abas A receber / Recebidas (2026-10-02)
let receiptListTab = "pendentes";
document.addEventListener("click", (event) => {
  const tab = event.target.closest?.("[data-receipt-tab]");
  if (!tab) return;
  receiptListTab = tab.dataset.receiptTab;
  document.querySelectorAll("[data-receipt-tab]").forEach((b) => b.classList.toggle("is-active", b === tab));
  renderGoodsReceiptDashboard();
});

// ============================================================ Bolinha em "Pedidos a separar" (2026-10-02)
// Quantidade de pedidos que ainda tem material para separar (status diferente de concluido).
function updateSeparationBadge() {
  const badge = document.getElementById("toSeparateBadge");
  if (!badge) return;
  let n = 0;
  try { n = separationOrdersSnapshot().filter((order) => order.baseStatus !== "concluido").length; } catch (_) { n = 0; }
  badge.textContent = String(n);
  badge.hidden = n === 0;
}
// (2026-10-10) bolinha em "Recebimento": pedidos de compra a receber (inclui os em conferência)
function setReceivingBadge(n) {
  const badge = document.getElementById("receivingBadge");
  if (!badge) return;
  badge.textContent = String(n || 0);
  badge.hidden = !n;
}
async function updateReceivingBadge() {
  try { setReceivingBadge(((await TecnoweldAPI.listIncomingPurchaseOrders()) || []).length); } catch (_) { /* sem a contagem: a bolinha fica como está */ }
}
const loadWarehouseBeforeBadge = loadWarehouse;
loadWarehouse = async function () { await loadWarehouseRetained(); const out = await loadWarehouseBeforeBadge.apply(this, arguments); return out; };
// (2026-10-10) Aba Item do cliente: bolinha piscando com os itens ainda aguardando resposta do Comercial
async function updateCustomerItemsBadge() {
  const badge = document.getElementById("customerItemsBadge");
  if (!badge || !window.TwCustomerItems?.countWaiting) return;
  try { const n = await window.TwCustomerItems.countWaiting(); badge.textContent = String(n); badge.hidden = !n; } catch (_) { /* fica como está */ }
}

const renderToSeparateTabBeforeBadge = renderToSeparateTab;
renderToSeparateTab = function () { const html = renderToSeparateTabBeforeBadge.apply(this, arguments); setTimeout(updateSeparationBadge, 0); return html; };


// (2026-10-10) Resolver divergências: realça a opção escolhida e mostra a prévia das fotos
document.addEventListener("change", (event) => {
  const radio = event.target.closest?.("input[data-divergence-decision]");
  if (radio) radio.closest(".div-actions")?.querySelectorAll(".div-choice").forEach((c) => c.classList.toggle("is-selected", c.contains(radio)));
  const files = event.target.closest?.("input[data-divergence-files]");
  if (files) {
    const box = document.querySelector(`[data-div-previews="${files.dataset.divergenceFiles}"]`);
    if (box) box.innerHTML = [...files.files].map((f) => f.type.startsWith("image/") ? `<img src="${URL.createObjectURL(f)}" alt="" title="${escapeAttr(f.name)}">` : `<em title="${escapeAttr(f.name)}">${escapeHtml(f.name)}</em>`).join("");
  }
});


// (2026-11-09) tipo de ocorrencia do fornecedor na RNC (Parametros -> Almoxarifado; pontos na nota do fornecedor)
window.__twOccTypes = [];
TecnoweldAPI.supplierOccurrenceConfig?.().then((c) => { window.__twOccTypes = c.ocorrencias || []; if (activeNfeReceipt) renderReceiptWorkflow(); }).catch(() => {});
function rncOccTypeSelect(attr, selected) {
  const types = window.__twOccTypes || [];
  if (!types.length) return "";
  return `<select class="tw-field" ${attr} required><option value="">Tipo de ocorrência…</option>${types.map((t) => `<option value="${escapeAttr(t.id)}"${t.id === selected ? " selected" : ""}>${escapeHtml(t.nome)} (${Number(t.pontos) > 0 ? "+" : ""}${Number(t.pontos)} pts)</option>`).join("")}</select>`;
}
window.rncOccTypeSelect = rncOccTypeSelect;

// ============================================================ RNC do recebimento (2026-10-10)
// Na etapa 04 o bloco "Não conformidade" tem um botão só: "Gerar RNC". Ele registra a RNC de TODOS os itens com
// divergência usando o que já foi respondido nos cartões (o que aconteceu, o que fazer, observação e fotos), grava as
// divergências e abre o relatório A4 (imprimir ou salvar em PDF). Quantidade da RNC = avariado (o que fica bloqueado).
const RECEIPT_DECISION_LABELS = {
  aceitar_quantidade: "Dar entrada no que chegou",
  receber_parcialmente: "Dar entrada no que chegou bom",
  deixar_pendente: "Segurar a entrada por enquanto",
  devolver_fornecedor: "Devolver ao fornecedor",
  recusar_item: "Devolver ao fornecedor"
};
function receiptDivergentItems() {
  return (activeNfeReceipt?.itens || []).filter((item) => Number(item.quantidade_recebida) !== Number(item.quantidade_xml) || Number(item.quantidade_avariada) > 0);
}
function receiptReasonLabel(value) {
  return (RECEIPT_DIVERGENCE_REASONS.find(([v]) => v === value) || [null, String(value || "").replaceAll("_", " ")])[1];
}

async function generateReceiptRnc(button) {
  const items = receiptDivergentItems();
  if (!items.length) return;
  const answers = items.map((item) => ({
    item,
    tipo: document.querySelector(`select[data-divergence-type="${item.id}"]`)?.value || "",
    decisao: document.querySelector(`input[data-divergence-decision="${item.id}"]:checked`)?.value || "",
    nota: (document.querySelector(`textarea[data-divergence-note="${item.id}"]`)?.value || "").trim(),
    files: document.querySelector(`input[data-divergence-files="${item.id}"]`)?.files,
    ocorrencia: document.querySelector(`select[data-rnc-occ="${item.id}"]`)?.value || ""
  }));
  const missing = answers.find((a) => !a.tipo || !a.decisao);
  const noType = (window.__twOccTypes || []).length && answers.find((a) => !a.ocorrencia && !(a.item.divergencias || []).some((d) => d.tipo === "rnc" && d.status === "aberta"));
  if (!missing && noType) { window.TecnoAlert?.warning?.(`Escolha o tipo de ocorrência de ${noType.item.descricao_xml} antes de gerar a RNC.`, "RNC"); return; }
  if (missing) { window.TecnoAlert?.warning?.(`Responda "O que aconteceu?" e "O que fazer?" em ${missing.item.descricao_xml} antes de gerar a RNC.`, "RNC"); return; }
  if (button) { button.disabled = true; button.textContent = "Gerando RNC..."; }
  try {
    for (const a of answers) {
      if ((a.item.divergencias || []).some((d) => d.tipo === "rnc" && d.status === "aberta")) continue;
      const anexos = await receiptEvidenceFiles(a.files);
      const descricao = [receiptReasonLabel(a.tipo), a.nota].filter(Boolean).join(" — ");
      const saved = await TecnoweldAPI.saveNfeDivergence({ recebimento_id: activeNfeReceipt.id, item_id: a.item.id, tipo: "rnc", origem: "manual", quantidade: Number(a.item.quantidade_avariada || 0), descricao, anexos, decisao: "aguardando_compras", status: "aberta", tipo_ocorrencia_id: a.ocorrencia || null });
      (a.item.divergencias = a.item.divergencias || []).push(saved?.id ? saved : { tipo: "rnc", status: "aberta" });
    }
    await persistReceiptDivergences();   // grava o que aconteceu / o que fazer (item com RNC aberta dá entrada com o avariado bloqueado)
    renderReceiptWorkflow();
    window.TecnoAlert?.success?.("RNC registrada para Compras. O relatório vai abrir para imprimir ou salvar em PDF.", "RNC");
    await printReceiptRncReport();
  } catch (error) {
    window.TecnoAlert?.error?.(error?.message || "Não foi possível gerar a RNC.", "RNC");
    if (button) { button.disabled = false; button.textContent = "Gerar RNC"; }
  }
}

async function printReceiptRncReport() {
  const r = activeNfeReceipt;
  if (!r?.id) return;
  const items = receiptDivergentItems();
  const [company, po] = await Promise.all([
    TecnoweldAPI.getCompanyProfile().catch(() => null),
    r.purchase_order_id ? TecnoweldAPI.getClient().from("purchase_orders_v2").select("numero").eq("id", r.purchase_order_id).maybeSingle().then((res) => res.data).catch(() => null) : null
  ]);
  const person = (id) => employees.find((e) => e.id === id)?.nome || "";
  const responsible = person(r.responsavel_id) || person(r.criado_por) || currentWarehouseUser()?.nome || "";
  const field = (label, value, cls = "") => `<div${cls ? ` class="${cls}"` : ""}><small>${escapeHtml(label)}</small><p>${value || "-"}</p></div>`;
  const rows = items.map((it) => {
    const rnc = (it.divergencias || []).find((d) => d.tipo === "rnc");
    const saved = (it.divergencias || []).find((d) => d.tipo !== "rnc") || {};
    // respostas ainda não gravadas: usa o que está marcado nos cartões da etapa 04
    const div = { ...saved, tipo: saved.tipo || document.querySelector(`select[data-divergence-type="${it.id}"]`)?.value || "", decisao: saved.decisao || document.querySelector(`input[data-divergence-decision="${it.id}"]:checked`)?.value || "", descricao: saved.descricao || (document.querySelector(`textarea[data-divergence-note="${it.id}"]`)?.value || "").trim() };
    const nota = Number(it.quantidade_xml || 0), chegou = Number(it.quantidade_recebida || 0), avariado = Number(it.quantidade_avariada || 0);
    return { it, rnc, div, nota, chegou, avariado, bom: Math.max(0, chegou - avariado), unit: it.unidade_interna || it.unidade_xml || "" };
  });
  const totalAvariado = rows.reduce((s, x) => s + x.avariado, 0);
  const totalFalta = rows.reduce((s, x) => s + Math.max(0, x.nota - x.chegou), 0);
  const photos = rows.flatMap((x) => [...(x.rnc?.anexos || []), ...(x.div?.anexos || [])].map((f) => ({ src: f.conteudo, cap: x.it.descricao_xml })))
    .filter((p, i, all) => /^data:image\//i.test(p.src || "") && all.findIndex((y) => y.src === p.src) === i).slice(0, 9);
  const reference = `NF ${r.numero_nfe}${r.serie ? `/${r.serie}` : ""}`;
  const html = `<article class="rr-doc">
  <header class="rr-head">
    <div>${company?.logo_url ? `<img src="${escapeAttr(company.logo_url)}" alt="Logo">` : ""}<div class="rr-head-company">${escapeHtml([company?.razao_social || company?.nome_fantasia, company?.documento && formatDocument(company.documento), receiptReportAddress(company?.endereco)].filter(Boolean).join(" · "))}</div></div>
    <div class="rr-head-id">Relatório de não conformidade<strong>RNC · ${escapeHtml(reference)}</strong>Emitido em ${escapeHtml(formatDateTime(new Date().toISOString()))}</div>
  </header>
  <div class="rr-title"><div><span>Almoxarifado · Recebimento de mercadorias</span><h1>${escapeHtml(r.fornecedor || "Fornecedor")}</h1></div><span class="rr-status bad">Aguardando decisão de Compras</span></div>
  <section class="rr-grid">
    ${field("Fornecedor", escapeHtml(r.nome_fantasia_fornecedor || r.fornecedor), "w2")}
    ${field("CNPJ", escapeHtml(formatDocument(r.cnpj_fornecedor)))}
    ${field("Pedido de compra", po?.numero ? `PC-${escapeHtml(String(po.numero).padStart(6, "0"))}` : "-")}
    ${field("Nota fiscal", escapeHtml(`${r.numero_nfe}${r.serie ? ` · Série ${r.serie}` : ""}`))}
    ${field("Emissão da nota", escapeHtml(r.data_emissao ? formatDateOnly(r.data_emissao) : "-"))}
    ${field("Conferido por", escapeHtml(responsible || "-"))}
    ${field("Data da conferência", escapeHtml(formatDateTime(r.atualizado_em || new Date().toISOString())))}
  </section>
  <section class="rr-kpis">
    <div><small>Itens com divergência</small><strong>${rows.length}</strong></div>
    <div><small>Peças avariadas</small><strong>${formatNumber(totalAvariado)}</strong></div>
    <div><small>Peças faltando</small><strong>${formatNumber(totalFalta)}</strong></div>
    <div><small>Situação</small><strong>Bloqueado até Compras decidir</strong></div>
  </section>
  <section class="rr-section"><h2><b>1.</b>Itens com divergência</h2>
    <table><colgroup><col style="width:4%"><col style="width:28%"><col style="width:8%"><col style="width:8%"><col style="width:8%"><col style="width:9%"><col style="width:17%"><col style="width:18%"></colgroup>
      <thead><tr><th>#</th><th>Material</th><th class="num">Na nota</th><th class="num">Chegou</th><th class="num">Avariado</th><th class="num">Bom</th><th>O que aconteceu</th><th>O que fazer</th></tr></thead>
      <tbody>${rows.map((x, i) => `<tr><td>${i + 1}</td><td><strong>${escapeHtml(x.it.descricao_xml)}</strong>${x.it.codigo_interno ? `<small>${escapeHtml(x.it.codigo_interno)}</small>` : ""}</td><td class="num">${formatNumber(x.nota)} ${escapeHtml(x.unit)}</td><td class="num">${formatNumber(x.chegou)}</td><td class="num">${formatNumber(x.avariado)}</td><td class="num">${formatNumber(x.bom)}</td><td>${escapeHtml(receiptReasonLabel(x.div.tipo || ""))}</td><td>${escapeHtml(RECEIPT_DECISION_LABELS[x.div.decisao] || "-")}${x.avariado && x.rnc ? `<small>${formatNumber(x.avariado)} ${escapeHtml(x.unit)} bloqueada(s) pela RNC</small>` : ""}</td></tr>`).join("")}</tbody>
    </table>
  </section>
  <section class="rr-section"><h2><b>2.</b>Descrição da ocorrência</h2>
    ${rows.map((x) => `<div class="rr-rnc"><header><span>${escapeHtml(x.it.descricao_xml)}</span><span class="rr-pill bad">Aguardando Compras</span></header><p>${escapeHtml(x.rnc?.descricao || x.div.descricao || receiptReasonLabel(x.div.tipo || "")) || "-"}</p></div>`).join("")}
  </section>
  ${photos.length ? `<section class="rr-section"><h2><b>3.</b>Evidências fotográficas</h2><div class="rr-photos">${photos.map((p, i) => `<figure><img src="${escapeAttr(p.src)}" alt="Evidência ${i + 1}"><figcaption>${i + 1}. ${escapeHtml(p.cap)}</figcaption></figure>`).join("")}</div></section>` : ""}
  <section class="rr-section"><h2><b>${photos.length ? 4 : 3}.</b>Decisão de Compras</h2>
    <div class="rr-note">Compras decide cada item em Compras → RNC: aceitar como está, aceitar com abatimento, devolver para o fornecedor repor ou devolver e cancelar. Até a decisão, a quantidade avariada fica bloqueada no estoque.</div>
  </section>
  <section class="rr-signs">
    <div><strong>${escapeHtml(responsible || "")}</strong>Conferido por (Almoxarifado)</div>
    <div><strong>&nbsp;</strong>Compras</div>
    <div><strong>&nbsp;</strong>Fornecedor (ciência)</div>
  </section>
  <footer class="rr-foot"><span>${escapeHtml(company?.nome_fantasia || company?.razao_social || "")} · Documento gerado pelo sistema</span><span>RNC · ${escapeHtml(reference)}</span></footer>
</article>`;
  if (!window.TecnoReport?.mount) throw new Error("Impressão indisponível nesta tela.");
  await window.TecnoReport.mount(html);
}

document.addEventListener("click", (event) => {
  const gen = event.target.closest?.("[data-generate-receipt-rnc]");
  if (gen) { event.preventDefault(); generateReceiptRnc(gen); return; }
  if (event.target.closest?.("[data-print-receipt-rnc]")) { event.preventDefault(); printReceiptRncReport().catch((e) => window.TecnoAlert?.error?.(e.message, "RNC")); }
});

// ============================================================ Certificado na conferencia do recebimento (2026-11-04)
// Fornecedor entregou o certificado em papel: o almoxarifado anexa a foto/PDF no item; ao concluir, o lote recebido ja nasce com ele.
document.addEventListener("change", async (event) => {
  const id = event.target?.dataset?.receiptCert;
  if (!id) return;
  const file = event.target.files?.[0];
  if (!file) return;
  const item = (activeNfeReceipt?.itens || []).find((row) => row.id === id);
  try {
    const up = await TecnoweldAPI.setReceivingItemCertificate(id, file);
    if (item) { item.certificado_url = up?.url || null; item.certificado_nome = up?.nome || null; }
    renderReceiptWorkflow();
    window.TecnoAlert?.success?.("Certificado anexado ao item.");
  } catch (e) { window.TecnoAlert?.error?.(e.message || "Não foi possível anexar o certificado."); }
});
document.addEventListener("click", async (event) => {
  const btn = event.target.closest?.("[data-receipt-cert-open]");
  if (!btn) return;
  event.preventDefault();
  const w = window.open("", "_blank");
  try { const url = await TecnoweldAPI.purchaseDocumentUrl(btn.dataset.receiptCertOpen); if (w) w.location = url; }
  catch (e) { if (w) w.close(); window.TecnoAlert?.error?.(e.message || "Não foi possível abrir o certificado."); }
});
