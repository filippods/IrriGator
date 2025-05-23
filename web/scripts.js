// scripts.js - Script principale dell'applicazione
// Versione corretta con gestione errori migliorata

// ==================== VARIABILI GLOBALI ====================
// Usa namespace per evitare conflitti globali
window.IrrigationApp = window.IrrigationApp || {
    isLoadingPage: false,
    userData: {},
    programsData: {},
    currentPage: null,
    modulesLoaded: {},
    systemLogs: [],
    abortControllers: new Map(), // Per gestire richieste cancellabili
    _menuClickHandler: null // Per event delegation del menu
};

// Mappa dei nomi di file ai percorsi dei moduli
const PAGE_CONFIG = {
    'dashboard.html': { module: null, initFn: 'populateDashboardInfo' },
    'manual.html': { module: 'js/modules/manual.js', initFn: 'initializeManualPage' },
    'create_program.html': { module: 'js/modules/create_program.js', initFn: 'initializeCreateProgramPage' },
    'modify_program.html': { module: 'js/modules/modify_program.js', initFn: 'initializeModifyProgramPage' },
    'view_programs.html': { module: 'js/modules/view_programs.js', initFn: 'initializeViewProgramsPage' },
    'logs.html': { module: 'js/modules/logs.js', initFn: 'initializeLogsPage' },
    'settings.html': { module: 'js/modules/settings.js', initFn: 'initializeSettingsPage' }
};
const DEFAULT_PAGE = 'dashboard.html';

// ==================== RILEVAMENTO PAGINA ====================
function detectCurrentPage() {
    const contentElement = document.getElementById('content');
    if (!contentElement) return window.IrrigationApp.currentPage || DEFAULT_PAGE;
    
    const pageContentWrapper = contentElement.querySelector('.page-content-wrapper');
    
    // Se non c'è wrapper o è vuoto/solo loading, ritorna la pagina corrente o default
    if (!pageContentWrapper || pageContentWrapper.childElementCount === 0 ||
        (pageContentWrapper.childElementCount === 1 && 
         pageContentWrapper.firstElementChild?.classList.contains('loading-indicator'))) {
        return window.IrrigationApp.currentPage || DEFAULT_PAGE;
    }

    // Rilevamento basato su elementi specifici
    const pageIdentifiers = {
        '.dashboard-grid': 'dashboard.html',
        '#modern-dashboard-container': 'dashboard.html', // Aggiunto per dashboard React
        '.zone-grid-container': 'manual.html',
        '.logs-card .logs-table': 'logs.html',
        '.settings-card .wifi-mode-selector': 'settings.html',
        '.programs-container': 'view_programs.html'
    };

    for (const [selector, page] of Object.entries(pageIdentifiers)) {
        if (pageContentWrapper.querySelector(selector)) return page;
    }

    // Distinzione più precisa tra create e modify
    const programNameInput = pageContentWrapper.querySelector('#program-name');
    if (programNameInput) {
        // Controlla se c'è un ID programma memorizzato per modify
        try {
            const editProgramId = localStorage.getItem('editProgramId');
            if (editProgramId) {
                return 'modify_program.html';
            }
        } catch (e) {
            // Ignora errori localStorage
        }
        
        if (pageContentWrapper.querySelector('#months-list')) return 'modify_program.html';
        if (pageContentWrapper.querySelector('#months-grid')) return 'create_program.html';
    }
    
    console.warn("Tipo di pagina non identificato. Usando default:", DEFAULT_PAGE);
    return window.IrrigationApp.currentPage || DEFAULT_PAGE;
}

// ==================== GESTIONE MODULI ====================
function loadModule(modulePath) {
    return new Promise((resolve, reject) => {
        if (!modulePath) {
            resolve();
            return;
        }
        
        if (window.IrrigationApp.modulesLoaded[modulePath]) {
            console.log(`Modulo ${modulePath} già caricato.`);
            resolve();
            return;
        }
        
        const script = document.createElement('script');
        script.src = `${modulePath}?v=${Date.now()}`;
        script.async = true;
        
        const timeout = setTimeout(() => {
            reject(new Error(`Timeout caricamento modulo: ${modulePath}`));
        }, 10000); // Timeout di 10 secondi
        
        script.onload = () => {
            clearTimeout(timeout);
            console.log(`Modulo ${modulePath} caricato con successo.`);
            window.IrrigationApp.modulesLoaded[modulePath] = true;
            resolve();
        };
        
        script.onerror = (error) => {
            clearTimeout(timeout);
            console.error(`Errore nel caricamento del modulo: ${modulePath}`, error);
            reject(error);
        };
        
        document.head.appendChild(script);
    });
}

async function loadCoreModules() {
    try {
        await loadModule('js/core.js');
        console.log("Bundle core (core.js) caricato con successo.");
        return true;
    } catch (error) {
        console.error("Errore CRITICO nel caricamento del bundle core:", error);
        showCriticalError("Errore critico di sistema. Ricaricare la pagina.");
        return false;
    }
}

function showCriticalError(message) {
    const errorBar = document.createElement('div');
    errorBar.id = "critical-error-bar";
    errorBar.textContent = message;
    errorBar.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        padding: 10px;
        background: darkred;
        color: white;
        text-align: center;
        z-index: 10000;
        font-family: sans-serif;
    `;
    
    if (!document.getElementById("critical-error-bar")) {
        document.body.prepend(errorBar);
    }
}

async function loadPageSpecificModule(pageName) {
    const pageConf = PAGE_CONFIG[pageName];
    if (!pageConf || !pageConf.module) {
        return true;
    }
    
    try {
        await loadModule(pageConf.module);
        return true;
    } catch (error) {
        const ui = window.IrrigationUI;
        if (ui && ui.showToast) {
            ui.showToast(`Errore caricamento modulo per ${pageName}.`, "error");
        }
        return false;
    }
}

// ==================== INIZIALIZZAZIONE APPLICAZIONE ====================
async function initializeApp() {
    console.log("Avvio IrrigationPRO...");
    
    // Aggiungi gestione errori globale
    setupGlobalErrorHandling();

    // Carica core modules con retry
    let coreModulesLoaded = false;
    let retryCount = 0;
    const maxRetries = 3;
    
    while (!coreModulesLoaded && retryCount < maxRetries) {
        coreModulesLoaded = await loadCoreModules();
        if (!coreModulesLoaded) {
            retryCount++;
            console.warn(`Tentativo ${retryCount}/${maxRetries} di caricamento core modules...`);
            await new Promise(resolve => setTimeout(resolve, 1000)); // Attendi 1 secondo prima di riprovare
        }
    }
    
    if (!coreModulesLoaded) {
        console.error("ERRORE CRITICO: Impossibile caricare i moduli core dopo " + maxRetries + " tentativi");
        showCriticalError("Errore critico di sistema. Ricaricare la pagina.");
        
        // Mostra comunque un messaggio di errore
        const contentElement = document.getElementById('content');
        if (contentElement) {
            contentElement.innerHTML = `
                <div class="page-content-wrapper">
                    <div style="text-align:center; padding:50px;">
                        <h2>Errore di Caricamento</h2>
                        <p>Impossibile caricare i moduli del sistema.</p>
                        <button onclick="window.location.reload()" class="button primary" style="margin-top:20px;">
                            Ricarica Pagina
                        </button>
                    </div>
                </div>
            `;
        }
        return;
    }

    // Verifica che i moduli siano stati caricati correttamente
    const utils = window.IrrigationUtils;
    const ui = window.IrrigationUI;
    const router = window.IrrigationRouter;
    const statusModule = window.IrrigationStatus;

    // Se i moduli critici non sono disponibili, usa fallback
    if (!router || !router.loadPage) {
        console.error("IrrigationRouter non disponibile anche dopo il caricamento dei moduli");
        
        // Prova a caricare direttamente la dashboard
        const contentElement = document.getElementById('content');
        if (contentElement) {
            try {
                const response = await fetch('dashboard.html');
                if (response.ok) {
                    const html = await response.text();
                    contentElement.innerHTML = html;
                    
                    // Inizializza manualmente la dashboard se possibile
                    if (typeof populateDashboardInfo === 'function') {
                        populateDashboardInfo();
                    }
                }
            } catch (error) {
                console.error("Errore nel caricamento manuale della dashboard:", error);
            }
        }
        
        // Continua con l'inizializzazione base
    }

    // Aggiorna data/ora
    const updateDateTimeFn = (utils && utils.updateDateTime) ? utils.updateDateTime : updateDateTime;
    updateDateTimeFn();
    setInterval(updateDateTimeFn, 1000);
    
    // Carica dati iniziali
    await loadUserDataAndPrograms();
    document.dispatchEvent(new CustomEvent('initialDataLoaded'));
    
    // Piccolo delay per assicurare che tutti i listener siano pronti
    await new Promise(resolve => setTimeout(resolve, 100));
    
    const contentElement = document.getElementById('content');
    
    // Usa URL hash o localStorage per determinare la pagina iniziale
    let pageToInitialize = getInitialPage();
    
    window.IrrigationApp.currentPage = pageToInitialize;
    console.log(`Pagina da inizializzare: ${pageToInitialize}`);

    if (router && router.loadPage) {
        const currentDOMPageType = detectCurrentPage();
        const contentWrapper = contentElement?.querySelector('.page-content-wrapper');
        
        if (!contentWrapper || currentDOMPageType !== pageToInitialize || 
            contentWrapper.childElementCount === 0 ||
            (contentWrapper.childElementCount === 1 && contentWrapper.firstElementChild.classList.contains('loading-indicator'))) {
            
            console.log(`Router carica ${pageToInitialize} (DOM attuale: ${currentDOMPageType})`);
            await router.loadPage(pageToInitialize, null, true);
        } else {
            console.log(`Pagina ${pageToInitialize} già nel DOM. Solo inizializzazione.`);
            const moduleLoaded = await loadPageSpecificModule(pageToInitialize);
            if (moduleLoaded) {
                initializeCurrentPage(pageToInitialize);
            }
        }
    } else {
        console.warn("IrrigationRouter non definito, tentativo di inizializzazione diretta.");
        
        // Se siamo sulla dashboard, prova a inizializzarla direttamente
        if (pageToInitialize === 'dashboard.html') {
            const moduleLoaded = await loadPageSpecificModule('dashboard.html');
            if (moduleLoaded) {
                initializeCurrentPage('dashboard.html');
            }
        }
    }
    
    // Avvia polling dello stato con gestione errori
    try {
        if (statusModule && typeof statusModule.startProgramStatusPolling === 'function') {
            statusModule.startProgramStatusPolling();
            console.log("Polling stato programma avviato con successo");
        } else if (typeof startProgramStatusPolling === 'function') {
            startProgramStatusPolling();
            console.log("Polling stato programma avviato con fallback");
        } else {
            console.warn("Funzione di polling stato non disponibile");
        }
    } catch (error) {
        console.error("Errore nell'avvio del polling dello stato:", error);
        // Non bloccare l'inizializzazione dell'app
    }
    
    setupNavigationListeners();
    console.log("IrrigationPRO Inizializzato.");
}

async function emergencyLoadPage(pageName) {
    console.warn("Caricamento di emergenza per:", pageName);
    const contentElement = document.getElementById('content');
    if (!contentElement) return;
    
    try {
        const response = await fetch(pageName);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const html = await response.text();
        contentElement.innerHTML = html;
        
        // Carica il modulo specifico se necessario
        await loadPageSpecificModule(pageName);
        
        // Inizializza la pagina
        initializeCurrentPage(pageName);
        
        // Aggiorna menu attivo
        updateActiveMenuItem(pageName);
        
    } catch (error) {
        console.error("Errore nel caricamento di emergenza:", error);
        contentElement.innerHTML = `
            <div class="page-content-wrapper">
                <div style="text-align:center; padding:50px;">
                    <h2>Errore di Caricamento</h2>
                    <p>Impossibile caricare ${pageName}</p>
                    <button onclick="window.location.reload()" class="button primary">
                        Ricarica Pagina
                    </button>
                </div>
            </div>
        `;
    }
}

// Funzione per determinare la pagina iniziale
function getInitialPage() {
    // Prima, controlla il fragment dell'URL (#pagina)
    const hashPage = window.location.hash.substring(1);
    if (hashPage && PAGE_CONFIG[hashPage + '.html']) {
        return hashPage + '.html';
    }
    
    // Poi, controlla localStorage
    try {
        const storedPage = localStorage.getItem('currentPage');
        if (storedPage && PAGE_CONFIG[storedPage]) {
            return storedPage;
        }
    } catch (e) {
        console.warn("Errore accesso a localStorage:", e);
    }
    
    // Infine, usa la pagina corrente se rilevabile o il default
    return window.IrrigationApp.currentPage || detectCurrentPage();
}

function initializeCurrentPage(pageName) {
    console.log(`Inizializzazione logica per pagina: ${pageName}`);
    
    // Cancella eventuali richieste pendenti per la pagina precedente
    cancelPendingRequests();
    
    const pageConf = PAGE_CONFIG[pageName];
    const ui = window.IrrigationUI;

    // Aggiorna menu attivo
    const updateActiveMenuFn = (window.IrrigationRouter && window.IrrigationRouter.updateActiveMenuItem) 
        ? window.IrrigationRouter.updateActiveMenuItem 
        : updateActiveMenuItem;
    updateActiveMenuFn(pageName);

    if (pageConf && pageConf.initFn && typeof window[pageConf.initFn] === 'function') {
        try {
            console.log(`Chiamo ${pageConf.initFn}`);
            window[pageConf.initFn](window.IrrigationApp.userData, window.IrrigationApp.programsData);
        } catch (e) {
            console.error(`Errore nell'inizializzazione di ${pageName}:`, e);
            if (ui && ui.showToast) {
                ui.showToast(`Errore inizializzazione ${pageName}.`, "error");
            }
        }
    } else {
        console.warn(`Funzione di inizializzazione ${pageConf ? pageConf.initFn : 'N/A'} non trovata per ${pageName}`);
    }
    
    // Controlla stato programma
    try {
        const statusModule = window.IrrigationStatus;
        if (statusModule && typeof statusModule.checkProgramStatus === 'function') {
            statusModule.checkProgramStatus();
        } else if (typeof checkProgramStatus === 'function') {
            checkProgramStatus();
        }
    } catch (error) {
        console.error("Errore nel controllo stato programma:", error);
    }

    document.dispatchEvent(new CustomEvent('pageInitialized', { detail: { pageName: pageName } }));
}

function setupNavigationListeners() {
    // Usa event delegation invece di rimuovere/riassegnare listener
    const menu = document.querySelector('.menu');
    if (!menu) return;
    
    // Rimuovi vecchio listener se esiste
    if (window.IrrigationApp._menuClickHandler) {
        menu.removeEventListener('click', window.IrrigationApp._menuClickHandler);
    }
    
    // Nuovo handler con event delegation
    window.IrrigationApp._menuClickHandler = function(event) {
        const menuItem = event.target.closest('li[data-page]');
        if (menuItem) {
            event.preventDefault();
            const targetPage = menuItem.getAttribute('data-page');
            const router = window.IrrigationRouter;
            
            if (targetPage && router && router.loadPage) {
                router.loadPage(targetPage);
            } else if (targetPage) {
                console.warn("Router non disponibile, tentativo con loadPage globale");
                if (typeof window.loadPage === 'function') {
                    window.loadPage(targetPage);
                }
            }
        }
    };
    
    menu.addEventListener('click', window.IrrigationApp._menuClickHandler);
    
    // Stop handler globale
    document.removeEventListener('click', handleGlobalStopClick);
    document.addEventListener('click', handleGlobalStopClick);
}

function handleGlobalStopClick(e) {
    const stopSelectors = [
        '.banner-stop-btn', '.global-stop-btn', '.stop-all-button',
        '#dashboard-stop-all-btn', '.stop-program-button'
    ];

    if (stopSelectors.some(selector => e.target.closest(selector))) {
        e.preventDefault();
        e.stopPropagation();
        
        const api = window.IrrigationAPI;
        const stopFn = (api && api.stopProgram) ? api.stopProgram : stopProgram;
        
        if (typeof stopFn === 'function') {
            stopFn();
        } else {
            console.error("Funzione di stop programma non trovata.");
        }
    }
}

function setupGlobalErrorHandling() {
    window.removeEventListener('error', handleGlobalError);
    window.addEventListener('error', handleGlobalError);
    
    window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);
    
    // Previeni drag delle immagini
    document.addEventListener('dragstart', (e) => {
        if (e.target.tagName === 'IMG') {
            e.preventDefault();
        }
    });
}

function handleGlobalError(event) {
    console.error('Errore JavaScript Globale:', {
        message: event.message,
        source: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        error: event.error
    });
    
    // Non mostrare toast per ogni errore per evitare spam
    if (event.message && event.message.includes('Critical')) {
        const ui = window.IrrigationUI;
        const toastFn = (ui && ui.showToast) ? ui.showToast : showToast;
        if (toastFn) {
            toastFn('Si è verificato un errore imprevisto.', 'error');
        }
    }
}

function handleUnhandledRejection(event) {
    console.error('Promise rejection non gestita:', event.reason);
}

// ==================== FUNZIONI DEL NUCLEO DELL'APPLICAZIONE ====================
async function loadUserDataAndPrograms() {
    const api = window.IrrigationAPI;
    const ui = window.IrrigationUI;
    const toastFn = (ui && ui.showToast) ? ui.showToast : showToast;

    try {
        const [settingsResponse, programsResponse] = await Promise.allSettled([
            api && api.loadUserSettings 
                ? api.loadUserSettings() 
                : fetchWithAbort('/data/user_settings.json'),
            api && api.loadPrograms 
                ? api.loadPrograms() 
                : fetchWithAbort('/data/program.json')
        ]);

        if (settingsResponse.status === 'fulfilled') {
            window.IrrigationApp.userData = settingsResponse.value || {};
            console.log("Dati utente caricati:", window.IrrigationApp.userData);
        } else {
            console.error('Errore nel caricamento dei dati utente:', settingsResponse.reason);
            window.IrrigationApp.userData = {};
            if (toastFn) toastFn('Errore caricamento impostazioni utente.', 'error');
        }

        if (programsResponse.status === 'fulfilled') {
            window.IrrigationApp.programsData = programsResponse.value || {};
            console.log("Programmi caricati:", window.IrrigationApp.programsData);
        } else {
            console.error('Errore nel caricamento dei programmi:', programsResponse.reason);
            window.IrrigationApp.programsData = {};
            if (toastFn) toastFn('Errore caricamento programmi.', 'error');
        }
        
        // Esporta per retrocompatibilità
        window.userData = window.IrrigationApp.userData;
        window.programsData = window.IrrigationApp.programsData;
        
    } catch (error) {
        console.error('Errore imprevisto in loadUserDataAndPrograms:', error);
        if (toastFn) toastFn('Errore grave nel caricamento dati.', 'error');
        window.IrrigationApp.userData = {};
        window.IrrigationApp.programsData = {};
    }
}

// ==================== UTILITY FUNCTIONS ====================
async function fetchWithAbort(url, options = {}) {
    const controller = new AbortController();
    const key = url + JSON.stringify(options);
    
    // Cancella richiesta precedente se esiste
    if (window.IrrigationApp.abortControllers.has(key)) {
        window.IrrigationApp.abortControllers.get(key).abort();
    }
    
    window.IrrigationApp.abortControllers.set(key, controller);
    
    try {
        const response = await fetch(url, {
            ...options,
            signal: controller.signal
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        return await response.json();
    } finally {
        window.IrrigationApp.abortControllers.delete(key);
    }
}

function cancelPendingRequests() {
    window.IrrigationApp.abortControllers.forEach(controller => controller.abort());
    window.IrrigationApp.abortControllers.clear();
}

// ==================== FUNZIONI DI UTILITY (FALLBACK) ====================
function updateDateTime() {
    const dateElement = document.getElementById('date');
    const timeElement = document.getElementById('time');
    if (!dateElement || !timeElement) return;
    
    const now = new Date();
    dateElement.textContent = now.toLocaleDateString('it-IT', { 
        day: 'numeric', 
        month: 'long', 
        year: 'numeric' 
    });
    timeElement.textContent = now.toLocaleTimeString('it-IT', { 
        hour: '2-digit', 
        minute: '2-digit', 
        second: '2-digit' 
    });
}

function updateActiveMenuItem(pageName) {
    document.querySelectorAll('.menu li').forEach(item => {
        item.classList.toggle('active', item.getAttribute('data-page') === pageName);
    });
}

function showToast(message, type = 'info', duration = 3500) {
    const container = document.getElementById('toast-container');
    if (!container) {
        console.warn("Toast container non trovato per il messaggio:", message);
        return;
    }
    
    // Evita toast duplicati
    const existingToasts = Array.from(container.querySelectorAll('.toast span'));
    if (existingToasts.some(span => span.textContent === message)) {
        return;
    }

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    // SVG icons per i vari tipi
    const icons = {
        'success': '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M9,20.42L2.79,14.21L4.21,12.79L9,17.58L19.79,6.79L21.21,8.21L9,20.42Z"></path></svg>',
        'error': '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M13,14H11V10H13M13,18H11V16H13M1,21H23L12,2L1,21Z"></path></svg>',
        'warning': '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M1,21H23L12,2L1,21M13,18H11V16H13V18M13,14H11V10H13V14Z"></path></svg>',
        'info': '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M13,9H11V7H13M13,17H11V11H13M12,2C6.48,2 2,6.48 2,12C2,17.52 6.48,22 12,22C17.52,22 22,17.52 22,12C22,6.48 17.52,2 12,2Z"></path></svg>'
    };

    const iconStyle = "width:18px; height:18px; margin-right:10px; vertical-align:middle;";
    const svgIcon = `<span style="${iconStyle}">${icons[type] || icons.info}</span>`;
    
    toast.innerHTML = `<span class="toast-icon">${svgIcon}</span><span>${message}</span>`;
    
    container.appendChild(toast);
    
    // Force reflow per animazione
    void toast.offsetWidth;
    
    requestAnimationFrame(() => {
        toast.classList.add('show');
    });
    
    const timerId = setTimeout(() => {
        toast.classList.remove('show');
        toast.addEventListener('transitionend', () => {
            if (container.contains(toast)) container.removeChild(toast);
        }, { once: true });
    }, duration);
    
    // Click per chiudere
    toast.addEventListener('click', () => {
        clearTimeout(timerId);
        toast.classList.remove('show');
        setTimeout(() => {
            if (container.contains(toast)) container.removeChild(toast);
        }, 300);
    }, { once: true });
}

// Default implementations per compatibilità
function checkProgramStatus() {
    const statusModule = window.IrrigationStatus;
    if (statusModule && typeof statusModule.checkProgramStatus === 'function') {
        statusModule.checkProgramStatus();
    } else {
        console.warn("checkProgramStatus: IrrigationStatus non disponibile.");
    }
}

function startProgramStatusPolling() {
    const statusModule = window.IrrigationStatus;
    if (statusModule && typeof statusModule.startProgramStatusPolling === 'function') {
        statusModule.startProgramStatusPolling();
    } else {
        console.warn("startProgramStatusPolling: IrrigationStatus non disponibile.");
    }
}

// Fallback stopProgram
async function stopProgram() {
    const api = window.IrrigationAPI;
    
    if (api && api.stopProgram) {
        return api.stopProgram();
    }
    
    console.warn("Fallback stopProgram: IrrigationAPI non definito. Uso fetch diretto.");
    
    try {
        const response = await fetch('/stop_program', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const data = await response.json();
        const toastFn = (window.IrrigationUI && window.IrrigationUI.showToast) 
            ? window.IrrigationUI.showToast 
            : showToast;
        
        if (data.success) {
            if (toastFn) toastFn('Programma arrestato.', 'success');
            checkProgramStatus();
        } else {
            if (toastFn) toastFn(`Errore arresto: ${data.error || 'Sconosciuto'}`, 'error');
        }
        
        return data;
    } catch (error) {
        console.error('Errore di rete in fallback stopProgram:', error);
        const toastFn = (window.IrrigationUI && window.IrrigationUI.showToast) 
            ? window.IrrigationUI.showToast 
            : showToast;
        if (toastFn) toastFn('Errore di rete durante l\'arresto del programma.', 'error');
        
        return { success: false, error: error.message };
    }
}

// ==================== ESPOSIZIONE FUNZIONI GLOBALI PER COMPATIBILITÀ ====================
window.loadPage = function(pageName, callback) {
    console.log("window.loadPage chiamato per:", pageName);
    
    const router = window.IrrigationRouter;
    if (router && router.loadPage) {
        router.loadPage(pageName, callback);
    } else if (typeof window.emergencyLoadPage === 'function') {
        console.warn("loadPage: Uso emergencyLoadPage per:", pageName);
        window.emergencyLoadPage(pageName).then(() => {
            if (callback) callback();
        });
    } else {
        console.error("loadPage: Nessun metodo disponibile per caricare:", pageName);
        
        // Ultimo tentativo: caricamento diretto del contenuto
        const contentElement = document.getElementById('content');
        if (contentElement) {
            contentElement.innerHTML = `
                <div class="page-content-wrapper">
                    <div class="loading-indicator">Caricamento ${pageName}...</div>
                </div>
            `;
            
            // Prova a caricare direttamente
            fetch(pageName)
                .then(response => response.text())
                .then(html => {
                    contentElement.innerHTML = html;
                    if (callback) callback();
                })
                .catch(error => {
                    console.error("Errore caricamento diretto:", error);
                    contentElement.innerHTML = `
                        <div class="page-content-wrapper">
                            <div style="text-align:center; padding:50px;">
                                <h2>Errore di Caricamento</h2>
                                <p>Impossibile caricare ${pageName}</p>
                                <button onclick="window.location.reload()" class="button primary">
                                    Ricarica Pagina
                                </button>
                            </div>
                        </div>
                    `;
                });
        }
    }
};

// Aggiungi anche emergencyLoadPage all'oggetto window
window.emergencyLoadPage = emergencyLoadPage;

window.showToast = showToast;
window.updateDateTime = updateDateTime;
window.checkProgramStatus = checkProgramStatus;
window.startProgramStatusPolling = startProgramStatusPolling;
window.stopProgram = stopProgram;
window.stopAllPrograms = window.stopProgram;

// ==================== INIZIALIZZAZIONE ====================
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeApp);
} else {
    // Se il DOM è già pronto, inizializza subito
    initializeApp();
}