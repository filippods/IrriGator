// core.js - Bundle combinato dei moduli core - Versione Corretta
console.log("Caricamento bundle core.js");

// ==================== CONFIGURAZIONI GLOBALI ====================
// Namespace per evitare conflitti
window.IrrigationCore = window.IrrigationCore || {
    apiCache: new Map(),
    API_CACHE_TTL: 10000, // 10 secondi
    PROGRAM_STATUS_POLLING_INTERVAL: 5000, // 5 secondi
    activePollingTimers: new Set()
};

// ==================== UTILS.JS ====================
// Polyfill per crypto.randomUUID
if (typeof crypto === 'undefined') {
    window.crypto = {};
}

if (!crypto.randomUUID) {
    crypto.randomUUID = function() {
        // Fallback per browser che non supportano crypto.getRandomValues
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    };
}

// Utility functions
const IrrigationUtils = {
    formatRecurrence(recurrence, interval_days) {
        if (!recurrence) return 'Non impostata';
        
        const recurrenceMap = {
            'giornaliero': 'Ogni giorno',
            'giorni_alterni': 'Giorni alterni',
            'personalizzata': `Ogni ${interval_days || 1} giorn${interval_days === 1 ? 'o' : 'i'}`
        };
        
        return recurrenceMap[recurrence] || recurrence;
    },

    updateDateTime() {
        const dateElement = document.getElementById('date');
        const timeElement = document.getElementById('time');
        
        if (!dateElement || !timeElement) return;
        
        const now = new Date();
        const options = { day: 'numeric', month: 'long', year: 'numeric' };
        
        dateElement.textContent = now.toLocaleDateString('it-IT', options);
        timeElement.textContent = now.toLocaleTimeString('it-IT', { 
            hour: '2-digit', 
            minute: '2-digit',
            second: '2-digit'
        });
    },

    exists(path) {
        const parts = path.split('.');
        let current = window;
        
        for (const part of parts) {
            if (!current || typeof current[part] === 'undefined') {
                return false;
            }
            current = current[part];
        }
        
        return current !== undefined;
    },

    getFunction(path) {
        const parts = path.split('.');
        let current = window;
        
        for (const part of parts) {
            if (!current || typeof current[part] === 'undefined') {
                return null;
            }
            current = current[part];
        }
        
        return typeof current === 'function' ? current : null;
    },

    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    },

    throttle(func, limit) {
        let inThrottle;
        return function(...args) {
            if (!inThrottle) {
                func.apply(this, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    }
};

window.IrrigationUtils = IrrigationUtils;

// ==================== UI.JS ====================
const IrrigationUI = {
    showToast(message, type = 'info', duration = 3000) {
        const container = document.getElementById('toast-container');
        if (!container) return;
        
        // Evita toast duplicati
        const existingToasts = container.querySelectorAll('.toast span');
        if (Array.from(existingToasts).some(span => span.textContent === message)) {
            return;
        }
        
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        
        const icons = {
            'success': '<path d="M9,20.42L2.79,14.21L4.21,12.79L9,17.58L19.79,6.79L21.21,8.21L9,20.42Z"/>',
            'error': '<path d="M12,2C17.53,2 22,6.47 22,12C22,17.53 17.53,22 12,22C6.47,22 2,17.53 2,12C2,6.47 6.47,2 12,2M15.59,7L12,10.59L8.41,7L7,8.41L10.59,12L7,15.59L8.41,17L12,13.41L15.59,17L17,15.59L13.41,12L17,8.41L15.59,7Z"/>',
            'warning': '<path d="M13,14H11V10H13M13,18H11V16H13M1,21H23L12,2L1,21Z"/>',
            'info': '<path d="M13,9H11V7H13M13,17H11V11H13M12,2C6.48,2 2,6.48 2,12C2,17.52 6.48,22 12,22C17.52,22 22,17.52 22,12C22,6.48 17.52,2 12,2Z"/>'
        };
        
        toast.innerHTML = `
            <div class="toast-icon">
                <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
                    ${icons[type] || icons.info}
                </svg>
            </div>
            <span>${message}</span>
        `;
        
        container.appendChild(toast);
        
        // Animation
        requestAnimationFrame(() => {
            toast.classList.add('show');
        });
        
        const timerId = setTimeout(() => {
            toast.classList.remove('show');
            toast.addEventListener('transitionend', () => {
                if (container.contains(toast)) container.removeChild(toast);
            }, { once: true });
        }, duration);
        
        toast.addEventListener('click', () => {
            clearTimeout(timerId);
            toast.classList.remove('show');
            setTimeout(() => {
                if (container.contains(toast)) container.removeChild(toast);
            }, 300);
        });
    },

    addStyles(id, cssText) {
        if (document.getElementById(id)) return false;
        
        const style = document.createElement('style');
        style.id = id;
        style.textContent = cssText;
        document.head.appendChild(style);
        return true;
    }
};

window.IrrigationUI = IrrigationUI;

// ==================== API.JS ====================
const IrrigationAPI = {
    // Definisci apiCall come metodo dell'oggetto, non come async function separata
    apiCall: async function(endpoint, method = 'GET', data = null, retryCount = 0, maxRetries = 2) {
        const cacheKey = method === 'GET' ? endpoint : null;
        
        // Check cache for GET requests
        if (cacheKey && window.IrrigationCore.apiCache.has(cacheKey)) {
            const cached = window.IrrigationCore.apiCache.get(cacheKey);
            if (cached && cached.timestamp && (Date.now() - cached.timestamp < window.IrrigationCore.API_CACHE_TTL)) {
                console.log(`Usando cache per ${endpoint}`);
                return cached.data;
            } else {
                // Rimuovi entry scaduta
                window.IrrigationCore.apiCache.delete(cacheKey);
            }
        }
        
        const options = {
            method,
            headers: {}
        };
        
        if (data) {
            options.headers['Content-Type'] = 'application/json';
            options.body = JSON.stringify(data);
        }
        
        try {
            const response = await fetch(endpoint, options);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const result = await response.json();
            
            // Cache GET requests solo se la risposta è valida
            if (cacheKey && result !== null && result !== undefined) {
                window.IrrigationCore.apiCache.set(cacheKey, {
                    data: result,
                    timestamp: Date.now()
                });
                
                // Limita dimensione cache a 50 entries
                if (window.IrrigationCore.apiCache.size > 50) {
                    const firstKey = window.IrrigationCore.apiCache.keys().next().value;
                    window.IrrigationCore.apiCache.delete(firstKey);
                }
            }
            
            return result;
        } catch (error) {
            console.error(`Errore API (${endpoint}):`, error);
            
            // Retry with exponential backoff
            if (retryCount < maxRetries) {
                console.log(`Tentativo ${retryCount + 1}/${maxRetries} - ${endpoint}`);
                const delay = 500 * Math.pow(2, retryCount);
                await new Promise(resolve => setTimeout(resolve, delay));
                return this.apiCall(endpoint, method, data, retryCount + 1, maxRetries);
            }
            
            throw error;
        }
    },

    loadUserSettings: async function() {
        try {
            return await this.apiCall('/data/user_settings.json');
        } catch (error) {
            console.error('Errore nel caricamento delle impostazioni utente:', error);
            IrrigationUI.showToast('Errore nel caricamento delle impostazioni', 'error');
            return {};
        }
    },

    loadPrograms: async function() {
        try {
            return await this.apiCall('/data/program.json');
        } catch (error) {
            console.error('Errore nel caricamento dei programmi:', error);
            IrrigationUI.showToast('Errore nel caricamento dei programmi', 'error');
            return {};
        }
    },

    getProgramState: async function() {
        try {
            return await this.apiCall('/get_program_state');
        } catch (error) {
            console.error('Errore nel caricamento dello stato del programma:', error);
            return { program_running: false };
        }
    },

    startProgram: async function(programId) {
        try {
            const result = await this.apiCall('/start_program', 'POST', { program_id: programId });
            if (result.success) {
                IrrigationUI.showToast('Programma avviato con successo', 'success');
            } else {
                IrrigationUI.showToast(`Errore: ${result.error || 'Errore sconosciuto'}`, 'error');
            }
            return result;
        } catch (error) {
            console.error('Errore durante l\'avvio del programma:', error);
            IrrigationUI.showToast('Errore di rete durante l\'avvio del programma', 'error');
            return { success: false, error: 'Errore di rete' };
        }
    },

    stopProgram: async function() {
        IrrigationUI.showToast('Arresto del programma in corso...', 'info');
        
        const stopButtons = document.querySelectorAll('.banner-stop-btn, .global-stop-btn, .stop-program-button');
        stopButtons.forEach(btn => btn?.classList.add('loading'));
        
        try {
            const result = await this.apiCall('/stop_program', 'POST');
            
            stopButtons.forEach(btn => btn?.classList.remove('loading'));
            
            if (result.success) {
                IrrigationUI.showToast('Programma arrestato con successo', 'success');
                
                // Update status
                if (window.IrrigationStatus) {
                    window.IrrigationStatus.checkProgramStatus();
                }
                
                return result;
            } else {
                IrrigationUI.showToast(`Errore: ${result.error || 'Errore sconosciuto'}`, 'error');
                return result;
            }
        } catch (error) {
            stopButtons.forEach(btn => btn?.classList.remove('loading'));
            console.error('Errore di rete durante l\'arresto del programma:', error);
            IrrigationUI.showToast('Errore di rete durante l\'arresto del programma', 'error');
            return { success: false, error: 'Errore di rete' };
        }
    }
};

window.IrrigationAPI = IrrigationAPI;

// ==================== ROUTER.JS ====================
const IrrigationRouter = {
    isLoadingPage: false,

    async loadPage(pageName, callback, isInitialLoad = false) {
        if (this.isLoadingPage) return;
        this.isLoadingPage = true;
        
        // Close menu
        document.getElementById('menu')?.classList.remove('active');
        document.getElementById('menu-overlay')?.classList.remove('active');
        
        this.updateActiveMenuItem(pageName);
        window.IrrigationApp = window.IrrigationApp || {};
        window.IrrigationApp.currentPage = pageName;
        
        // Aggiorna URL e localStorage solo se non è il caricamento iniziale
        // per evitare di alterare l'URL quando l'utente ha già navigato direttamente a una pagina
        if (!isInitialLoad) {
            // Aggiorna URL hash senza # iniziale per evitare il salto della pagina
            const pageBase = pageName.replace('.html', '');
            window.history.pushState(null, '', '#' + pageBase);
            
            // Salva in localStorage come backup
            try {
                localStorage.setItem('currentPage', pageName);
            } catch (e) {
                console.warn("Errore salvataggio pagina in localStorage:", e);
            }
        }
        
        const contentElement = document.getElementById('content');
        if (!contentElement) {
            this.isLoadingPage = false;
            return;
        }
        
        // Show loading indicator
        contentElement.innerHTML = '<div class="loading-indicator">Caricamento...</div>';
        
        try {
            const response = await fetch(`${pageName}?_=${Date.now()}`);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            
            const html = await response.text();
            contentElement.innerHTML = html;
            
            // Stop any existing polling
            if (window.IrrigationCore) {
                window.IrrigationCore.activePollingTimers.forEach(timer => clearInterval(timer));
                window.IrrigationCore.activePollingTimers.clear();
            }
            
            // Load page-specific module
            await this.loadPageModule(pageName);
            
            // Initialize page
            this.initializePage(pageName);
            
            // Check program status
            if (window.IrrigationStatus) {
                window.IrrigationStatus.checkProgramStatus();
            }
            
            if (callback) callback();
            
        } catch (error) {
            console.error('Errore nel caricamento della pagina:', error);
            contentElement.innerHTML = `
                <div style="text-align:center;padding:30px;">
                    <h2>Errore di caricamento</h2>
                    <p>Impossibile caricare la pagina ${pageName}</p>
                    <button onclick="window.location.reload()" class="button primary">
                        Ricarica pagina
                    </button>
                </div>
            `;
            IrrigationUI.showToast(`Errore nel caricamento di ${pageName}`, 'error');
        } finally {
            this.isLoadingPage = false;
        }
    },

    async loadPageModule(pageName) {
        const moduleMap = {
            'manual.html': 'js/modules/manual.js',
            'create_program.html': 'js/modules/create_program.js',
            'modify_program.html': 'js/modules/modify_program.js',
            'view_programs.html': 'js/modules/view_programs.js',
            'logs.html': 'js/modules/logs.js',
            'settings.html': 'js/modules/settings.js'
        };
        
        const modulePath = moduleMap[pageName];
        if (!modulePath) return;
        
        try {
            const script = document.createElement('script');
            script.src = `${modulePath}?_=${Date.now()}`;
            
            await new Promise((resolve, reject) => {
                script.onload = resolve;
                script.onerror = reject;
                document.head.appendChild(script);
            });
        } catch (error) {
            console.error(`Errore caricamento modulo ${modulePath}:`, error);
        }
    },

    initializePage(pageName) {
        const initFunctions = {
            'manual.html': 'initializeManualPage',
            'create_program.html': 'initializeCreateProgramPage',
            'modify_program.html': 'initializeModifyProgramPage',
            'view_programs.html': 'initializeViewProgramsPage',
            'logs.html': 'initializeLogsPage',
            'settings.html': 'initializeSettingsPage',
            'dashboard.html': 'populateDashboardInfo'
        };
        
        const fnName = initFunctions[pageName];
        if (fnName && typeof window[fnName] === 'function') {
            window[fnName](window.IrrigationApp?.userData);
        }
    },

    updateActiveMenuItem(pageName) {
        document.querySelectorAll('.menu li').forEach(item => {
            item.classList.toggle('active', item.getAttribute('data-page') === pageName);
        });
    },

    getCurrentPage() {
        return window.IrrigationApp?.currentPage;
    }
};

window.IrrigationRouter = IrrigationRouter;

// ==================== ZONES.JS ====================
const IrrigationZones = {
    generateZonesGrid(zones, containerId, onCheckboxChange = null) {
        const zonesGrid = document.getElementById(containerId);
        if (!zonesGrid) {
            console.error(`Elemento ${containerId} non trovato`);
            return;
        }
        
        zonesGrid.innerHTML = '';
        
        const visibleZones = zones?.filter(zone => zone?.status === 'show') || [];
        
        if (visibleZones.length === 0) {
            zonesGrid.innerHTML = `
                <div style="grid-column: 1/-1; text-align:center; padding:20px;">
                    <p>Nessuna zona disponibile.</p>
                    <button onclick="IrrigationRouter.loadPage('settings.html')" class="button secondary">
                        Configura Zone
                    </button>
                </div>
            `;
            return;
        }
        
        visibleZones.forEach(zone => {
            if (!zone || zone.id === undefined) return;
            
            const zoneItem = document.createElement('div');
            zoneItem.className = 'zone-item';
            zoneItem.dataset.zoneId = zone.id;
            
            zoneItem.innerHTML = `
                <div class="zone-header">
                    <input type="checkbox" class="zone-checkbox" id="zone-${zone.id}" data-zone-id="${zone.id}">
                    <label for="zone-${zone.id}" class="zone-name">${zone.name || `Zona ${zone.id + 1}`}</label>
                </div>
                <div class="zone-duration-control">
                    <label for="duration-${zone.id}">Durata (minuti)</label>
                    <input type="number" class="zone-duration" id="duration-${zone.id}" 
                        min="1" max="180" placeholder="Durata" 
                        data-zone-id="${zone.id}" disabled value="10">
                </div>
            `;
            
            zonesGrid.appendChild(zoneItem);
            
            // Setup events
            const checkbox = zoneItem.querySelector('.zone-checkbox');
            const durationInput = zoneItem.querySelector('.zone-duration');
            
            checkbox.addEventListener('change', () => {
                durationInput.disabled = !checkbox.checked;
                zoneItem.classList.toggle('selected', checkbox.checked);
                
                if (checkbox.checked) durationInput.focus();
                
                if (onCheckboxChange) {
                    onCheckboxChange(parseInt(checkbox.dataset.zoneId), checkbox.checked, durationInput);
                }
            });
        });
    },

    generateMonthsGrid(containerId, clickHandler = null) {
        const monthsGrid = document.getElementById(containerId);
        if (!monthsGrid) {
            console.error(`Elemento ${containerId} non trovato`);
            return;
        }
        
        monthsGrid.innerHTML = '';
        
        const months = [
            'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 
            'Maggio', 'Giugno', 'Luglio', 'Agosto', 
            'Settembre', 'Ottobre', 'Novembre', 'Dicembre'
        ];
        
        months.forEach(month => {
            const monthItem = document.createElement('div');
            monthItem.className = 'month-item';
            monthItem.textContent = month;
            monthItem.dataset.month = month;
            
            if (clickHandler) {
                monthItem.addEventListener('click', () => clickHandler(month, monthItem));
            } else {
                monthItem.addEventListener('click', () => {
                    monthItem.classList.toggle('selected');
                });
            }
            
            monthsGrid.appendChild(monthItem);
        });
    },

    async fetchZonesStatus() {
        try {
            return await IrrigationAPI.apiCall('/get_zones_status');
        } catch (error) {
            console.error('Errore nel recupero dello stato delle zone:', error);
            return [];
        }
    }
};

window.IrrigationZones = IrrigationZones;

// ==================== PROGRAM-COMMON.JS ====================
const IrrigationProgram = {
    validateProgramData(data, saveButton = null) {
        const resetButton = () => {
            if (saveButton) {
                saveButton.classList.remove('loading');
                saveButton.disabled = false;
            }
        };
        
        if (!data.name?.trim()) {
            IrrigationUI.showToast('Inserisci un nome per il programma', 'error');
            resetButton();
            return false;
        }
        
        if (!data.activation_time) {
            IrrigationUI.showToast('Seleziona un orario di attivazione', 'error');
            resetButton();
            return false;
        }
        
        if (data.recurrence === 'personalizzata') {
            if (!data.interval_days || data.interval_days < 1) {
                IrrigationUI.showToast('Inserisci un intervallo di giorni valido', 'error');
                resetButton();
                return false;
            }
        }
        
        if (!data.months?.length) {
            IrrigationUI.showToast('Seleziona almeno un mese', 'error');
            resetButton();
            return false;
        }
        
        if (!data.steps?.length) {
            IrrigationUI.showToast('Seleziona almeno una zona', 'error');
            resetButton();
            return false;
        }
        
        for (const step of data.steps) {
            if (!step.duration || step.duration < 1) {
                IrrigationUI.showToast(`Durata non valida per la zona ${step.zone_id + 1}`, 'error');
                resetButton();
                return false;
            }
        }
        
        return true;
    },

    collectProgramData(programId = null) {
        const programName = document.getElementById('program-name')?.value.trim();
        const activationTime = document.getElementById('activation-time')?.value || 
                            document.getElementById('start-time')?.value;
        const recurrence = document.getElementById('recurrence')?.value;
        let intervalDays = null;
        
        if (recurrence === 'personalizzata') {
            intervalDays = parseInt(document.getElementById('interval-days')?.value || 
                                 document.getElementById('custom-days-interval')?.value);
        }
        
        const selectedMonths = Array.from(document.querySelectorAll('.month-item.selected'))
            .map(item => item.dataset.month);
        
        const steps = [];
        document.querySelectorAll('.zone-checkbox:checked').forEach(checkbox => {
            const zoneId = parseInt(checkbox.dataset.zoneId);
            const durationInput = document.getElementById(`duration-${zoneId}`);
            const duration = parseInt(durationInput?.value || 10);
            
            steps.push({ zone_id: zoneId, duration: duration });
        });
        
        const program = {
            name: programName,
            activation_time: activationTime,
            recurrence: recurrence,
            months: selectedMonths,
            steps: steps
        };
        
        if (programId) program.id = programId;
        
        if (recurrence === 'personalizzata' && !isNaN(intervalDays)) {
            program.interval_days = intervalDays;
        }
        
        return program;
    },

    async loadProgramData(programId) {
        try {
            const programs = await IrrigationAPI.loadPrograms();
            
            if (!programs || typeof programs !== 'object') {
                throw new Error('Formato programmi non valido');
            }
            
            const program = programs[programId];
            if (!program) throw new Error('Programma non trovato');
            
            return program;
        } catch (error) {
            console.error('Errore nel caricamento del programma:', error);
            IrrigationUI.showToast(`Errore: ${error.message}`, 'error');
            return null;
        }
    },

    populateProgramForm(program) {
        if (!program) return false;
        
        document.getElementById('program-name')?.setAttribute('value', program.name || '');
        
        const timeInput = document.getElementById('activation-time') || document.getElementById('start-time');
        if (timeInput) timeInput.value = program.activation_time || '';
        
        const recurrenceSelect = document.getElementById('recurrence');
        if (recurrenceSelect) recurrenceSelect.value = program.recurrence || 'giornaliero';
        
        if (program.recurrence === 'personalizzata') {
            const daysContainer = document.getElementById('days-container') || document.getElementById('custom-days');
            if (daysContainer) {
                daysContainer.style.display = 'block';
                daysContainer.classList.add('visible');
            }
            
            const intervalInput = document.getElementById('interval-days') || document.getElementById('custom-days-interval');
            if (intervalInput) intervalInput.value = program.interval_days || 3;
        }
        
        // Select months
        if (program.months?.length) {
            document.querySelectorAll('.month-item').forEach(item => {
                if (program.months.includes(item.dataset.month)) {
                    item.classList.add('selected');
                }
            });
        }
        
        // Select zones and set durations
        if (program.steps?.length) {
            program.steps.forEach(step => {
                if (!step || step.zone_id === undefined) return;
                
                const checkbox = document.getElementById(`zone-${step.zone_id}`);
                const durationInput = document.getElementById(`duration-${step.zone_id}`);
                
                if (checkbox && durationInput) {
                    checkbox.checked = true;
                    durationInput.disabled = false;
                    durationInput.value = step.duration || 10;
                    
                    const zoneItem = document.querySelector(`.zone-item[data-zone-id="${step.zone_id}"]`);
                    if (zoneItem) zoneItem.classList.add('selected');
                }
            });
        }
        
        return true;
    }
};

window.IrrigationProgram = IrrigationProgram;

// ==================== STATUS.JS ====================
const IrrigationStatus = {
    programStatusInterval: null,
    lastProgramState: null,

    checkProgramStatus() {
        console.log("Controllo stato programma...");
        
        IrrigationAPI.getProgramState()
            .then(state => {
                console.log("Stato programma ricevuto:", state);
                
                this.lastProgramState = state;
                this.updateProgramStatusBanner(state);
                
                const pageName = IrrigationRouter.getCurrentPage();
                
                if (pageName === 'manual.html' && typeof window.handleProgramState === 'function') {
                    window.handleProgramState(state);
                }
                
                if (pageName === 'view_programs.html' && typeof window.fetchProgramState === 'function') {
                    window.fetchProgramState();
                }
                
                // Dispatch event
                document.dispatchEvent(new CustomEvent('programStatusChanged', { detail: state }));
            })
            .catch(error => console.error('Errore nel controllo stato programma:', error));
    },

    updateProgramStatusBanner(state) {
        const banner = document.getElementById('program-status-banner');
        const mainContent = document.getElementById('content');
        
        if (!banner) return;
        
        if (state?.program_running && state.current_program_id) {
            banner.classList.add('visible');
            
            if (mainContent) mainContent.classList.add('with-banner');
            
            IrrigationAPI.loadPrograms()
                .then(programs => {
                    const program = programs[state.current_program_id];
                    if (program) {
                        const nameElement = document.getElementById('banner-program-name');
                        if (nameElement) nameElement.textContent = program.name || 'Programma in esecuzione';
                    }
                    
                    this.updateActiveZoneInfo(state);
                })
                .catch(err => {
                    console.error('Errore caricamento dettagli programma:', err);
                    this.updateActiveZoneInfo(state);
                });
        } else {
            banner.classList.remove('visible');
            
            if (mainContent) mainContent.classList.remove('with-banner');
        }
    },

    updateActiveZoneInfo(state) {
        if (!state) return;
        
        const zoneElement = document.getElementById('banner-active-zone');
        if (!zoneElement) return;
        
        if (state.active_zone) {
            const zoneName = state.active_zone.name || `Zona ${state.active_zone.id + 1}`;
            const remainingTime = state.active_zone.remaining_time || 0;
            const minutes = Math.floor(remainingTime / 60);
            const seconds = remainingTime % 60;
            
            zoneElement.textContent = `Zona: ${zoneName} (${minutes}:${seconds.toString().padStart(2, '0')} rim.)`;
            
            // Update progress bar
            const progressBar = document.getElementById('banner-progress-bar');
            if (progressBar && state.active_zone.total_time) {
                const progress = ((state.active_zone.total_time - remainingTime) / state.active_zone.total_time) * 100;
                progressBar.style.width = `${progress}%`;
            }
        } else {
            zoneElement.textContent = 'Inizializzazione...';
        }
    },

    startProgramStatusPolling() {
        console.log("Avvio polling stato programma");
        
        this.stopProgramStatusPolling();
        this.checkProgramStatus();
        
        this.programStatusInterval = setInterval(() => {
            this.checkProgramStatus();
        }, window.IrrigationCore.PROGRAM_STATUS_POLLING_INTERVAL);
        
        // Track timer for cleanup
        if (window.IrrigationCore) {
            window.IrrigationCore.activePollingTimers.add(this.programStatusInterval);
        }
    },

    stopProgramStatusPolling() {
        if (this.programStatusInterval) {
            clearInterval(this.programStatusInterval);
            if (window.IrrigationCore) {
                window.IrrigationCore.activePollingTimers.delete(this.programStatusInterval);
            }
            this.programStatusInterval = null;
        }
    },

    getLastState() {
        return this.lastProgramState;
    }
};

window.IrrigationStatus = IrrigationStatus;

// ==================== ESPORTAZIONE FINALE ====================
console.log("Bundle core.js caricato con successo!");