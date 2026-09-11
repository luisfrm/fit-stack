/**
 * Common UI selectors for E2E tests.
 *
 * Centralizes selectors to avoid duplication and make maintenance easier
 * when the UI changes. Prefer data-testid > role > text > CSS selector.
 */

// ─── Auth ────────────────────────────────────────────────────────────────────
export const SELECTORS = {
  // Login page
  login: {
    emailInput: "#email",
    passwordInput: "#password",
    submitButton: 'button[type="submit"]',
    rememberCheckbox: "#remember",
    errorMessage: '[role="alert"]',
  },

  // Dashboard
  dashboard: {
    kpiCards: '[data-testid="kpi-card"], .kpi-card',
    statsSection: "text=Miembros Totales",
    todayClasses: "text=Clases de Hoy",
    recentRegistrations: "text=Registros Recientes",
    chartsRow: '[data-testid="dashboard-charts-row"]',
    revenueMini: '[data-testid="dashboard-revenue-mini"]',
    reportButton: '[data-testid="dashboard-report-button"]',
  },

  // Sidebar navigation
  sidebar: {
    nav: "nav",
    membersLink: 'a[href="/members"]',
    staffLink: 'a[href="/staff"]',
    trainersLink: 'a[href="/trainers"]',
    membershipsLink: 'a[href="/memberships"]',
    paymentsLink: 'a[href="/payments"]',
    classesLink: 'a[href="/classes"]',
    contentLink: 'a[href="/content"]',
    chatLink: 'a[href="/chat"]',
    settingsLink: 'a[href="/settings"]',
    dashboardLink: 'a[href="/dashboard"]',
  },

  // Common UI patterns
  common: {
    searchInput:
      'input[placeholder*="Buscar"], input[placeholder*="buscar"], input[type="search"]',
    addButton:
      'button:has-text("Agregar"), button:has-text("Nuevo"), button:has-text("Crear")',
    modal: 'dialog, [role="dialog"]',
    modalClose:
      'dialog button[aria-label="Cerrar"], [role="dialog"] button[aria-label="Cerrar"], dialog button:has-text("Cancelar"), [role="dialog"] button:has-text("Cancelar")',
    toast: '[role="status"], .sonner-toast',
    toastSuccess: "text=éxito, text=creado, text=guardado, text=eliminado",
    table: 'table, [role="grid"]',
    tableRows: 'table tbody tr, [role="grid"] [role="row"]',
    pagination: 'nav[aria-label*="pagination"], nav[aria-label*="paginación"]',
    emptyState: "text=No hay, text=Sin resultados, text=No se encontraron",
    loadingSpinner: '[role="status"][aria-label*="loading"], .animate-spin',
    saveButton: 'button:has-text("Guardar")',
    deleteButton: 'button:has-text("Eliminar"), button:has-text("Borrar")',
    confirmButton: 'button:has-text("Confirmar"), button:has-text("Sí")',
    cancelButton: 'button:has-text("Cancelar")',
  },

  // Members page
  members: {
    pageContainer: "text=Miembros",
    createButton:
      'button:has-text("Agregar Miembro"), button:has-text("Nuevo Miembro")',
    firstNameInput: 'input[name="firstName"], #firstName',
    lastNameInput: 'input[name="lastName"], #lastName',
    emailInput: 'input[name="email"], #email',
    phoneInput: 'input[name="phone"], #phone',
    documentIdInput: 'input[name="documentId"], #documentId',
    kpiSection: '[data-testid="members-kpi-section"]',
    kpiTotal: '[data-testid="members-kpi-total"]',
    kpiActive: '[data-testid="members-kpi-active"]',
    kpiInactive: '[data-testid="members-kpi-inactive"]',
    kpiNew: '[data-testid="members-kpi-new"]',
    kpiWithoutSubscription: '[data-testid="members-kpi-without-subscription"]',
    kpiPortal: '[data-testid="members-kpi-portal"]',
    filterStatus: '[data-testid="members-filter-status"]',
    filterSubscription: '[data-testid="members-filter-subscription"]',
    growthChart: '[data-testid="members-growth-chart"]',
    birthdays: '[data-testid="members-birthdays"]',
  },

  // Plans / Memberships page
  plans: {
    pageContainer: "text=Membresías, text=Planes",
    createButton:
      'button:has-text("Crear Plan"), button:has-text("Nuevo Plan")',
    nameInput: 'input[name="name"], #name',
    priceInput: 'input[name="price"], #price',
    durationSelect: 'select[name="durationUnit"], #durationUnit',
  },

  // Subscriptions / Payments page
  subscriptions: {
    pageContainer: "text=Pagos, text=Suscripciones",
    createButton:
      'button:has-text("Nueva Suscripción"), button:has-text("Crear Suscripción")',
    memberSelect: 'select[name="memberId"], #memberId',
    planSelect: 'select[name="planId"], #planId',
    statusFilter: 'select[name="status"], [data-testid="status-filter"]',
    pendingSection: '[data-testid="pending-payments-section"]',
    pendingItem: (id: string | number) => `[data-testid="pending-payment-${id}"]`,
  },

  // Classes page
  classes: {
    pageContainer: "text=Clases",
    createButton:
      'button:has-text("Crear Clase"), button:has-text("Nueva Clase")',
    nameInput: 'input[name="name"], #name',
    daySelect: 'select[name="dayOfWeek"], #dayOfWeek',
    startTimeInput: 'input[name="startTime"], #startTime',
    endTimeInput: 'input[name="endTime"], #endTime',
    weekCalendar: '[data-testid="classes-week-calendar"]',
    weekLabel: '[data-testid="classes-week-label"]',
    weekPrev: '[data-testid="classes-week-prev"]',
    weekNext: '[data-testid="classes-week-next"]',
    nextClass: '[data-testid="classes-next-class"]',
    visibilitySummary: '[data-testid="classes-visibility-summary"]',
  },

  // Settings page
  settings: {
    pageContainer: "text=Configuración",
    generalTab: 'a[href="/settings/general"]',
    organizationTab: 'a[href="/settings/organization"]',
    currenciesTab: 'a[href="/settings/currencies"]',
    paymentMethodsTab: 'a[href="/settings/payment-methods"]',
    subscriptionTab: 'a[href="/settings/suscription"]',
    saveButton: 'button:has-text("Guardar")',
  },

  // Content / CMS page
  content: {
    pageContainer: "text=Contenido, text=Páginas",
    createButton:
      'button:has-text("Crear Página"), button:has-text("Nueva Página")',
    titleInput: 'input[name="title"], #title',
    slugInput: 'input[name="slug"], #slug',
    addBlockButton:
      'button:has-text("Agregar Bloque"), button:has-text("Nuevo Bloque")',
  },

  // Console-specific
  console: {
    organizationsLink: 'a[href="/organizations"]',
    subscriptionsLink: 'a[href="/subscriptions"]',
    plansLink: 'a[href="/plans"]',
    staffLink: 'a[href="/staff"]',
    settingsLink: 'a[href="/settings"]',
    newOrgButton:
      'button:has-text("Nueva Organización"), button:has-text("Crear Organización")',
  },

  // Console — subscriptions (unique → data-testid, repeated → class)
  consoleSubscriptions: {
    table: '[data-testid="subs-table"]',
    search: '[data-testid="subs-search"]',
    kpiMrr: '[data-testid="subs-kpi-mrr"]',
    kpiMonth: '[data-testid="subs-kpi-month"]',
    kpiPrev: '[data-testid="subs-kpi-prev"]',
    panelExpiring: '[data-testid="subs-panel-expiring"]',
    panelRevenue: '[data-testid="subs-panel-revenue"]',
    panelPlans: '[data-testid="subs-panel-plans"]',
    panelMethods: '[data-testid="subs-panel-methods"]',
    planFilter: ".subs-plan-filter",
    rowMenu: ".subs-row-menu",
    rowDetail: ".subs-row-detail",
    row: (id: string | number) => `[data-testid="subs-row-${id}"]`,
    paymentModal: ".subs-payment-modal",
    deleteModal: ".subs-delete-modal",
    cancelModal: ".subs-cancel-modal",
    extendModal: ".subs-extend-modal",
    historyModal: ".subs-history-modal",
    detailModal: ".subs-detail-modal",
  },

  // Console — organization detail profile
  consoleOrgDetail: {
    backButton: 'button:has-text("Volver")',
    planCard: '[data-testid="org-profile-plan"]',
    membersCard: '[data-testid="org-profile-members"]',
    adoptionCard: '[data-testid="org-profile-adoption"]',
    billingCard: '[data-testid="org-profile-billing"]',
    subsTable: '[data-testid="org-subs-table"]',
  },

  // Console — organizations (unique → data-testid, repeated → class)
  consoleOrganizations: {
    table: '[data-testid="orgs-table"]',
    cards: '[data-testid="orgs-cards"]',
    search: '[data-testid="orgs-search"]',
    kpiTotal: '[data-testid="orgs-kpi-total"]',
    kpiNew: '[data-testid="orgs-kpi-new"]',
    kpiActive: '[data-testid="orgs-kpi-active"]',
    kpiNone: '[data-testid="orgs-kpi-none"]',
    countryFilter: ".orgs-country-filter",
    statusFilter: ".orgs-status-filter",
    rowMenu: ".org-row-menu",
    mobileCard: ".org-mobile-card",
    row: (id: string | number) => `[data-testid="org-row-${id}"]`,
    health: (id: string | number) => `[data-testid="org-health-${id}"]`,
    aiUsage: (id: string | number) => `[data-testid="org-ai-${id}"]`,
  },
} as const;
