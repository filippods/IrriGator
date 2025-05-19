// manual.js - Versione corretta con migliore gestione stato e memory leaks
// Namespace per evitare conflitti globali
window.ManualPage = window.ManualPage || {
    userSettings: {},
    maxZoneDuration: 180,
    maxActiveZones: 3,
    zoneStatusInterval: null,
    activeZones: new Map(),
    disabledManualMode: false,
    POLL_INTERVAL: 1000,
    abortControllers: new Map()
};

// Funzione per salvare lo stato originale delle zone quando vengono attivate
function saveZoneOriginalDuration(zoneId, duration) {
    try {
        // Ottieni lo stato esistente o crea uno nuovo
        let savedZones = {};
        const savedData = localStorage.getItem('zoneOriginalData');
        if (savedData) {
            savedZones = JSON.parse(savedData);
        }
        
        // Salva i dati originali della zona
        savedZones[zoneId] = {
            originalDuration: duration * 60, // converti in secondi
            startTimestamp: Date.now(),
            totalSeconds: duration * 60
        };
        
        // Salva nel localStorage
        localStorage.setItem('zoneOriginalData', JSON.stringify(savedZones));
        console.log(`Dati originali salvati per zona ${zoneId}: durata=${duration} min`);
    } catch (e) {
        console.warn('Impossibile salvare dati originali zona:', e);
    }
}

// Funzione per aggiornare lo stato della zona durante l'esecuzione
function updateZoneExecution(zoneId, remainingSeconds) {
    try {
        // Ottieni lo stato esistente
        const savedData = localStorage.getItem('zoneOriginalData');
        if (!savedData) return;
        
        const savedZones = JSON.parse(savedData);
        if (!savedZones[zoneId]) return;
        
        // Aggiorna il tempo rimanente senza modificare gli altri valori
        savedZones[zoneId].lastRemainingSeconds = remainingSeconds;
        savedZones[zoneId].lastUpdateTime = Date.now();
        
        // Salva nel localStorage
        localStorage.setItem('zoneOriginalData', JSON.stringify(savedZones));
    } catch (e) {
        console.warn('Impossibile aggiornare stato zona:', e);
    }
}

// Funzione per ripristinare la percentuale di progresso corretta dopo un refresh
function getCorrectProgressPercentage(zoneId, currentRemainingSeconds) {
    try {
        const savedData = localStorage.getItem('zoneOriginalData');
        if (!savedData) return 0;
        
        const savedZones = JSON.parse(savedData);
        if (!savedZones[zoneId]) return 0;
        
        const originalData = savedZones[zoneId];
        const originalDuration = originalData.originalDuration;
        
        // Calcola il tempo trascorso rispetto all'inizio
        const elapsedSeconds = originalDuration - currentRemainingSeconds;
        
        // Calcola la percentuale: (tempo trascorso / durata totale originale) * 100
        const progressPercentage = Math.min(100, Math.max(0, (elapsedSeconds / originalDuration) * 100));
        
        console.log(`Zona ${zoneId}: durata originale=${originalDuration}s, trascorso=${elapsedSeconds}s, rimasto=${currentRemainingSeconds}s, percentuale=${progressPercentage.toFixed(1)}%`);
        
        return progressPercentage;
    } catch (e) {
        console.warn('Impossibile calcolare percentuale progresso:', e);
        return 0;
    }
}

// Funzione per eliminare i dati della zona quando l'irrigazione termina
function clearZoneData(zoneId) {
    try {
        const savedData = localStorage.getItem('zoneOriginalData');
        if (!savedData) return;
        
        const savedZones = JSON.parse(savedData);
        if (savedZones[zoneId]) {
            delete savedZones[zoneId];
            localStorage.setItem('zoneOriginalData', JSON.stringify(savedZones));
            console.log(`Dati originali eliminati per zona ${zoneId}`);
        }
    } catch (e) {
        console.warn('Impossibile eliminare dati zona:', e);
    }
}

// Inizializzazione modificata per manual.js
function initializeManualPage(userData) {
    console.log("Inizializzazione pagina controllo manuale");
    
    // Assicurati che le funzioni di gestione progresso siano disponibili
    if (typeof saveZoneOriginalDuration !== 'function') {
        console.log("Aggiungendo funzioni di gestione progresso...");
        // Aggiungi qui il codice delle funzioni di supporto per il progresso
        // In produzione, è meglio includerle come modulo separato o in core.js
        
        window.saveZoneOriginalDuration = function(zoneId, duration) {
            try {
                // Ottieni lo stato esistente o crea uno nuovo
                let savedZones = {};
                const savedData = localStorage.getItem('zoneOriginalData');
                if (savedData) {
                    savedZones = JSON.parse(savedData);
                }
                
                // Salva i dati originali della zona
                savedZones[zoneId] = {
                    originalDuration: duration * 60, // converti in secondi
                    startTimestamp: Date.now(),
                    totalSeconds: duration * 60
                };
                
                // Salva nel localStorage
                localStorage.setItem('zoneOriginalData', JSON.stringify(savedZones));
                console.log(`Dati originali salvati per zona ${zoneId}: durata=${duration} min`);
            } catch (e) {
                console.warn('Impossibile salvare dati originali zona:', e);
            }
        };

        window.updateZoneExecution = function(zoneId, remainingSeconds) {
            try {
                // Ottieni lo stato esistente
                const savedData = localStorage.getItem('zoneOriginalData');
                if (!savedData) return;
                
                const savedZones = JSON.parse(savedData);
                if (!savedZones[zoneId]) return;
                
                // Aggiorna il tempo rimanente senza modificare gli altri valori
                savedZones[zoneId].lastRemainingSeconds = remainingSeconds;
                savedZones[zoneId].lastUpdateTime = Date.now();
                
                // Salva nel localStorage
                localStorage.setItem('zoneOriginalData', JSON.stringify(savedZones));
            } catch (e) {
                console.warn('Impossibile aggiornare stato zona:', e);
            }
        };

        window.getCorrectProgressPercentage = function(zoneId, currentRemainingSeconds) {
            try {
                const savedData = localStorage.getItem('zoneOriginalData');
                if (!savedData) return 0;
                
                const savedZones = JSON.parse(savedData);
                if (!savedZones[zoneId]) return 0;
                
                const originalData = savedZones[zoneId];
                const originalDuration = originalData.originalDuration;
                
                // Calcola il tempo trascorso rispetto all'inizio
                const elapsedSeconds = originalDuration - currentRemainingSeconds;
                
                // Calcola la percentuale: (tempo trascorso / durata totale originale) * 100
                const progressPercentage = Math.min(100, Math.max(0, (elapsedSeconds / originalDuration) * 100));
                
                console.log(`Zona ${zoneId}: durata originale=${originalDuration}s, trascorso=${elapsedSeconds}s, rimasto=${currentRemainingSeconds}s, percentuale=${progressPercentage.toFixed(1)}%`);
                
                return progressPercentage;
            } catch (e) {
                console.warn('Impossibile calcolare percentuale progresso:', e);
                return 0;
            }
        };

        window.clearZoneData = function(zoneId) {
            try {
                const savedData = localStorage.getItem('zoneOriginalData');
                if (!savedData) return;
                
                const savedZones = JSON.parse(savedData);
                if (savedZones[zoneId]) {
                    delete savedZones[zoneId];
                    localStorage.setItem('zoneOriginalData', JSON.stringify(savedZones));
                    console.log(`Dati originali eliminati per zona ${zoneId}`);
                }
            } catch (e) {
                console.warn('Impossibile eliminare dati zona:', e);
            }
        };
    }
    
    // Cleanup precedente
    cleanupManualPage();
    
    // Reset stato
    window.ManualPage.activeZones.clear();
    window.ManualPage.disabledManualMode = false;
    
    // Carica impostazioni utente
    if (userData && Object.keys(userData).length > 0) {
        setupUserData(userData);
    } else {
        loadUserSettings();
    }
    
    addManualStyles();
    startStatusPolling();
    fetchProgramState();
    
    // Registra cleanup
    window.addEventListener('pagehide', cleanupManualPage, { once: true });
}

function loadUserSettings() {
    const api = window.IrrigationAPI;
    const promise = api && api.loadUserSettings 
        ? api.loadUserSettings()
        : fetch('/data/user_settings.json').then(response => response.json());
        
    promise
        .then(setupUserData)
        .catch(error => {
            console.error('Errore nel caricamento delle impostazioni utente:', error);
            showToastMessage('Errore nel caricamento delle impostazioni', 'error');
        });
}

function setupUserData(data) {
    window.ManualPage.userSettings = data;
    window.ManualPage.maxActiveZones = data.max_active_zones || 3;
    window.ManualPage.maxZoneDuration = data.max_zone_duration || 180;
    renderZones(data.zones || []);
}

function addManualStyles() {
    const ui = window.IrrigationUI;
    if (ui && ui.addStyles) {
        ui.addStyles('manual-styles', `
            .zone-card {
                transition: all 0.3s ease;
                border: 2px solid transparent;
            }
            
            .zone-card.active {
                border-color: var(--color-success);
                background: #F0FDF4;
            }
            
            .zone-card.disabled-mode {
                opacity: 0.6;
                pointer-events: none;
                filter: grayscale(70%);
            }
            
            .zone-card.loading-indicator::after {
                content: "";
                position: absolute;
                top: 50%;
                left: 50%;
                width: 30px;
                height: 30px;
                margin-left: -15px;
                margin-top: -15px;
                border: 3px solid #f3f3f3;
                border-top: 3px solid var(--color-primary);
                border-radius: 50%;
                animation: spin 1s linear infinite;
                z-index: 10;
                background: rgba(255, 255, 255, 0.9);
            }
            
            @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
            
            .manual-page-overlay {
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background-color: rgba(0, 0, 0, 0.8);
                display: flex;
                justify-content: center;
                align-items: center;
                z-index: 9999;
                animation: fadeIn 0.3s ease;
            }
            
            .overlay-message {
                background-color: #fff;
                border-radius: 12px;
                padding: 25px;
                width: 90%;
                max-width: 500px;
                text-align: center;
                box-shadow: 0 6px 24px rgba(0, 0, 0, 0.5);
                border-left: 5px solid #ff3333;
            }
            
            .stop-program-button {
                position: fixed;
                bottom: 20px;
                left: 50%;
                transform: translateX(-50%);
                background-color: #ff3333;
                color: white;
                padding: 12px 24px;
                border-radius: 8px;
                cursor: pointer;
                z-index: 999;
                display: none;
                text-align: center;
                font-size: 16px;
                font-weight: bold;
                border: none;
                box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
            }
            
            .stop-program-button.visible {
                display: block;
            }
            
            .progress-ring {
                transform: rotate(-90deg);
            }
            
            .progress-ring-fill {
                transition: stroke-dashoffset 0.5s linear;
            }
            
            .duration-input {
                background: #FFFFFF;
                border: 2px solid #E5E7EB;
                border-radius: 8px;
                padding: 8px 12px;
                font-size: 16px;
                font-weight: 600;
                text-align: center;
                color: var(--color-text-headings);
                transition: all 0.2s ease;
                width: 80px;
            }
            
            .duration-input:focus {
                outline: none;
                border-color: var(--color-primary);
                box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
            }
            
            .duration-input::-webkit-inner-spin-button,
            .duration-input::-webkit-outer-spin-button {
                -webkit-appearance: none;
                margin: 0;
            }
            
            .duration-input[type=number] {
                -moz-appearance: textfield;
            }
        `);
    }
}

function startStatusPolling() {
    stopStatusPolling();
    fetchZonesStatus();
    window.ManualPage.zoneStatusInterval = setInterval(fetchZonesStatus, window.ManualPage.POLL_INTERVAL);
}

function stopStatusPolling() {
    if (window.ManualPage.zoneStatusInterval) {
        clearInterval(window.ManualPage.zoneStatusInterval);
        window.ManualPage.zoneStatusInterval = null;
    }
}

function cleanupManualPage() {
    console.log("Cleanup pagina manuale");
    
    stopStatusPolling();
    
    // Cancella tutte le richieste pendenti
    window.ManualPage.abortControllers.forEach(controller => controller.abort());
    window.ManualPage.abortControllers.clear();
    
    // Pulisci tutti i timer
    window.ManualPage.activeZones.forEach(zone => {
        if (zone.timer) clearInterval(zone.timer);
    });
    window.ManualPage.activeZones.clear();
    
    // Rimuovi elementi DOM
    document.getElementById('manual-page-overlay')?.remove();
    document.getElementById('manual-stop-button')?.remove();
    
    // Rimuovi event listener
    window.removeEventListener('pagehide', cleanupManualPage);
}

function renderZones(zones) {
    const container = document.getElementById('zone-container');
    if (!container) return;
    
    // Filtra solo le zone visibili
    const visibleZones = Array.isArray(zones) ? zones.filter(zone => zone && zone.status === "show") : [];
    
    if (visibleZones.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">
                    <svg viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12,20A6,6 0 0,1 6,14C6,10 12,3.25 12,3.25C12,3.25 18,10 18,14A6,6 0 0,1 12,20Z"/>
                    </svg>
                </div>
                <h3>Nessuna zona configurata</h3>
                <p>Configura le zone nelle impostazioni per poterle controllare manualmente.</p>
                <button class="button primary" onclick="IrrigationRouter.loadPage('settings.html')">
                    Vai alle impostazioni
                </button>
            </div>
        `;
        return;
    }
    
    container.innerHTML = '';
    
    visibleZones.forEach(zone => {
        if (!zone || zone.id === undefined) return;
        
        const zoneCard = createZoneCard(zone);
        container.appendChild(zoneCard);
    });
    
    addZoneEventListeners();
    addStopProgramButton();
}

function createZoneCard(zone) {
    const zoneCard = document.createElement('div');
    zoneCard.className = 'zone-card';
    zoneCard.id = `zone-${zone.id}`;
    zoneCard.dataset.zoneId = zone.id;
    zoneCard.dataset.zoneName = zone.name || `Zona ${zone.id + 1}`;
    
    zoneCard.innerHTML = `
        <div class="zone-header">
            <h3 class="zone-title">${zone.name || `Zona ${zone.id + 1}`}</h3>
            <span class="zone-id">Zone ${zone.id + 1}</span>
        </div>
        
        <div class="duration-control">
            <span class="duration-label">DURATA IRRIGAZIONE</span>
            <div class="duration-input-group">
                <div class="duration-stepper">
                    <button class="stepper-btn" data-action="decrease">−</button>
                    <input type="number" 
                           class="duration-input" 
                           id="duration-value-${zone.id}"
                           min="1" 
                           max="${window.ManualPage.maxZoneDuration}"
                           step="1"
                           value="10">
                    <span class="duration-unit">min</span>
                    <button class="stepper-btn" data-action="increase">+</button>
                </div>
            </div>
        </div>
        
        <div class="progress-container">
            <svg class="progress-ring" viewBox="0 0 180 180" width="180" height="180">
                <defs>
                    <linearGradient id="progressGradient${zone.id}" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" style="stop-color:#10B981;stop-opacity:1" />
                        <stop offset="100%" style="stop-color:#059669;stop-opacity:1" />
                    </linearGradient>
                </defs>
                <circle class="progress-ring-bg" 
                        cx="90" cy="90" r="80" 
                        fill="none" 
                        stroke="#E5E7EB" 
                        stroke-width="8"></circle>
                <circle class="progress-ring-fill" 
                        id="progress-${zone.id}"
                        cx="90" cy="90" r="80" 
                        fill="none" 
                        stroke="url(#progressGradient${zone.id})" 
                        stroke-width="8"
                        stroke-linecap="round" 
                        stroke-dasharray="502.655" 
                        stroke-dashoffset="502.655"
                        transform="rotate(-90 90 90)"></circle>
            </svg>
            <div class="progress-text">
                <span class="progress-time" id="timer-${zone.id}">00:00</span>
                <span class="progress-label">RIMANENTI</span>
            </div>
        </div>
        
        <button class="activation-button activate" data-zone-id="${zone.id}">
            <svg class="button-icon" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8,5.14V19.14L19,12.14L8,5.14Z" />
            </svg>
            AVVIA IRRIGAZIONE
        </button>
    `;
    
    return zoneCard;
}

function addZoneEventListeners() {
    // Stepper buttons
    document.querySelectorAll('.stepper-btn').forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.preventDefault();
            
            if (window.ManualPage.disabledManualMode) return;
            
            const zoneCard = this.closest('.zone-card');
            const zoneId = zoneCard.dataset.zoneId;
            const action = this.dataset.action;
            const durationInput = document.getElementById(`duration-value-${zoneId}`);
            
            if (!durationInput) return;
            
            let currentValue = parseInt(durationInput.value) || 10;
            
            if (action === 'increase' && currentValue < window.ManualPage.maxZoneDuration) {
                currentValue = Math.min(currentValue + 5, window.ManualPage.maxZoneDuration);
            } else if (action === 'decrease' && currentValue > 1) {
                currentValue = Math.max(currentValue - 5, 1);
            }
            
            durationInput.value = currentValue;
        });
    });
    
    // Input change event
    document.querySelectorAll('.duration-input').forEach(input => {
        input.addEventListener('change', function() {
            let value = parseInt(this.value) || 10;
            
            // Ensure value is within valid range without rounding to multiples of 5
            value = Math.max(1, Math.min(value, window.ManualPage.maxZoneDuration));
            
            this.value = value;
        });
    });
    
    // Activation buttons
    document.querySelectorAll('.activation-button').forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.preventDefault();
            
            if (window.ManualPage.disabledManualMode) return;
            
            const zoneId = parseInt(this.dataset.zoneId);
            const isActive = this.classList.contains('deactivate');
            
            if (isActive) {
                deactivateZone(zoneId);
            } else {
                const durationInput = document.getElementById(`duration-value-${zoneId}`);
                const duration = parseInt(durationInput?.value) || 10;
                
                if (duration >= 1 && duration <= window.ManualPage.maxZoneDuration) {
                    activateZone(zoneId, duration);
                } else {
                    showToastMessage(`Durata non valida. Inserisci un valore tra 1 e ${window.ManualPage.maxZoneDuration} minuti`, 'warning');
                }
            }
        });
    });
}

// Modifica alla funzione activateZone in manual.js
async function activateZone(zoneId, duration) {
    console.log(`Attivazione zona ${zoneId} per ${duration} minuti`);
    
    const zoneCard = document.getElementById(`zone-${zoneId}`);
    const activateBtn = zoneCard?.querySelector('.activation-button');
    const zoneName = zoneCard?.dataset.zoneName || `Zona ${zoneId + 1}`;
    
    if (zoneCard) zoneCard.classList.add('loading-indicator');
    if (activateBtn) activateBtn.disabled = true;
    
    const controller = new AbortController();
    window.ManualPage.abortControllers.set(`activate-${zoneId}`, controller);
    
    try {
        const response = await fetch('/start_zone', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ zone_id: zoneId, duration: duration }),
            signal: controller.signal
        });
        
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const data = await response.json();
        
        if (zoneCard) zoneCard.classList.remove('loading-indicator');
        
        if (data.success) {
            showToastMessage(`${zoneName} attivata per ${duration} minuti`, 'success');
            
            // Salva la durata originale nel localStorage - NUOVA FUNZIONALITÀ
            saveZoneOriginalDuration(zoneId, duration);
            
            startZoneTimer(zoneId, duration * 60);
            
            if (zoneCard) zoneCard.classList.add('active');
            if (activateBtn) {
                activateBtn.disabled = false;
                activateBtn.classList.remove('activate');
                activateBtn.classList.add('deactivate');
                activateBtn.innerHTML = `
                    <svg class="button-icon" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M18,18H6V6H18V18Z" />
                    </svg>
                    DISATTIVA ZONA
                `;
            }
            
            fetchZonesStatus();
        } else {
            showToastMessage(`Errore: ${data.error || 'Attivazione zona fallita'}`, 'error');
            
            if (activateBtn) {
                activateBtn.disabled = false;
            }
        }
    } catch (error) {
        if (error.name !== 'AbortError') {
            console.error('Errore durante l\'attivazione della zona:', error);
            showToastMessage('Errore di rete durante l\'attivazione della zona', 'error');
        }
        
        if (zoneCard) zoneCard.classList.remove('loading-indicator');
        if (activateBtn) activateBtn.disabled = false;
    } finally {
        window.ManualPage.abortControllers.delete(`activate-${zoneId}`);
    }
}

// Modifica alla funzione deactivateZone in manual.js
async function deactivateZone(zoneId) {
    console.log(`Disattivazione zona ${zoneId}`);
    
    const zoneCard = document.getElementById(`zone-${zoneId}`);
    const activateBtn = zoneCard?.querySelector('.activation-button');
    const zoneName = zoneCard?.dataset.zoneName || `Zona ${zoneId + 1}`;
    
    if (zoneCard) zoneCard.classList.add('loading-indicator');
    if (activateBtn) activateBtn.disabled = true;
    
    const controller = new AbortController();
    window.ManualPage.abortControllers.set(`deactivate-${zoneId}`, controller);
    
    try {
        const response = await fetch('/stop_zone', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ zone_id: zoneId }),
            signal: controller.signal
        });
        
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const data = await response.json();
        
        if (zoneCard) zoneCard.classList.remove('loading-indicator');
        
        if (data.success) {
            showToastMessage(`${zoneName} disattivata`, 'info');
            stopZoneTimer(zoneId);
            
            // Elimina i dati salvati - NUOVA FUNZIONALITÀ
            clearZoneData(zoneId);
            
            if (zoneCard) zoneCard.classList.remove('active');
            if (activateBtn) {
                activateBtn.disabled = false;
                activateBtn.classList.add('activate');
                activateBtn.classList.remove('deactivate');
                activateBtn.innerHTML = `
                    <svg class="button-icon" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M8,5.14V19.14L19,12.14L8,5.14Z" />
                    </svg>
                    AVVIA IRRIGAZIONE
                `;
            }
            
            resetProgressBar(zoneId);
            fetchZonesStatus();
        } else {
            showToastMessage(`Errore: ${data.error || 'Disattivazione zona fallita'}`, 'error');
            
            if (activateBtn) {
                activateBtn.disabled = false;
            }
        }
    } catch (error) {
        if (error.name !== 'AbortError') {
            console.error('Errore durante la disattivazione della zona:', error);
            showToastMessage('Errore di rete durante la disattivazione della zona', 'error');
        }
        
        if (zoneCard) zoneCard.classList.remove('loading-indicator');
        if (activateBtn) activateBtn.disabled = false;
    } finally {
        window.ManualPage.abortControllers.delete(`deactivate-${zoneId}`);
    }
}

function startZoneTimer(zoneId, totalSeconds) {
    const existingZone = window.ManualPage.activeZones.get(zoneId);
    if (existingZone?.timer) {
        clearInterval(existingZone.timer);
    }
    
    const zoneData = {
        totalDuration: totalSeconds,
        remainingTime: totalSeconds,
        startTime: Date.now(),
        timer: null
    };
    
    window.ManualPage.activeZones.set(zoneId, zoneData);
    
    updateProgressBar(zoneId, 0, totalSeconds);
    
    zoneData.timer = setInterval(() => {
        const now = Date.now();
        const elapsed = Math.floor((now - zoneData.startTime) / 1000);
        const remaining = Math.max(0, totalSeconds - elapsed);
        
        zoneData.remainingTime = remaining;
        updateProgressBar(zoneId, elapsed, totalSeconds);
        
        if (remaining <= 0) {
            stopZoneTimer(zoneId);
            
            const zoneCard = document.getElementById(`zone-${zoneId}`);
            const activateBtn = zoneCard?.querySelector('.activation-button');
            
            if (zoneCard) zoneCard.classList.remove('active');
            if (activateBtn) {
                activateBtn.classList.add('activate');
                activateBtn.classList.remove('deactivate');
                activateBtn.innerHTML = `
                    <svg class="button-icon" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M8,5.14V19.14L19,12.14L8,5.14Z" />
                    </svg>
                    AVVIA IRRIGAZIONE
                `;
                activateBtn.disabled = false;
            }
        }
    }, 1000);
}

function stopZoneTimer(zoneId) {
    const zoneData = window.ManualPage.activeZones.get(zoneId);
    
    if (zoneData?.timer) {
        clearInterval(zoneData.timer);
        window.ManualPage.activeZones.delete(zoneId);
    }
    
    resetProgressBar(zoneId);
}

function updateProgressBar(zoneId, elapsed, total) {
    const timerDisplay = document.getElementById(`timer-${zoneId}`);
    const progressCircle = document.getElementById(`progress-${zoneId}`);
    
    if (!timerDisplay || !progressCircle) return;
    
    const remaining = Math.max(0, total - elapsed);
    const minutes = Math.floor(remaining / 60);
    const seconds = remaining % 60;
    
    timerDisplay.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    
    // Update circular progress
    const radius = 80;
    const circumference = 2 * Math.PI * radius;
    const progress = elapsed / total;
    const offset = circumference * (1 - progress);
    
    progressCircle.style.strokeDashoffset = offset;
}

function resetProgressBar(zoneId) {
    const timerDisplay = document.getElementById(`timer-${zoneId}`);
    const progressCircle = document.getElementById(`progress-${zoneId}`);
    
    if (timerDisplay) timerDisplay.textContent = '00:00';
    if (progressCircle) {
        const radius = 80;
        const circumference = 2 * Math.PI * radius;
        progressCircle.style.strokeDashoffset = circumference;
    }
}

async function fetchZonesStatus() {
    try {
        const controller = new AbortController();
        window.ManualPage.abortControllers.set('zones-status', controller);
        
        const response = await fetch('/get_zones_status', { signal: controller.signal });
        if (!response.ok) throw new Error('Errore nel caricamento dello stato delle zone');
        
        const zonesStatus = await response.json();
        updateZonesUI(zonesStatus);
    } catch (error) {
        if (error.name !== 'AbortError') {
            console.error('Errore nel recupero dello stato delle zone:', error);
        }
    } finally {
        window.ManualPage.abortControllers.delete('zones-status');
    }
}

async function fetchProgramState() {
    try {
        const controller = new AbortController();
        window.ManualPage.abortControllers.set('program-state', controller);
        
        const response = await fetch('/get_program_state', { signal: controller.signal });
        if (!response.ok) throw new Error('Errore nel caricamento dello stato del programma');
        
        const programState = await response.json();
        handleProgramState(programState);
    } catch (error) {
        if (error.name !== 'AbortError') {
            console.error('Errore nel recupero dello stato del programma:', error);
        }
    } finally {
        window.ManualPage.abortControllers.delete('program-state');
    }
}

function handleProgramState(programState) {
    console.log("Gestione stato programma:", programState);
    const programRunning = programState && programState.program_running;
    
    if (programRunning) {
        disableManualPage(programState);
        
        const stopButton = document.getElementById('manual-stop-button');
        if (stopButton) {
            stopButton.classList.add('visible');
            
            if (programState.current_program_id) {
                updateStopButtonText(programState.current_program_id);
            }
        }
    } else {
        enableManualPage();
        
        const stopButton = document.getElementById('manual-stop-button');
        if (stopButton) {
            stopButton.classList.remove('visible');
        }
    }
}

async function updateStopButtonText(programId) {
    try {
        const response = await fetch('/data/program.json');
        const programs = await response.json();
        
        const stopButton = document.getElementById('manual-stop-button');
        if (stopButton && programs && programs[programId]) {
            const programName = programs[programId].name || 'Programma';
            stopButton.innerHTML = `<i>■</i> ARRESTA "${programName}"`;
        }
    } catch (error) {
        console.error('Errore caricamento dettagli programma:', error);
    }
}

function disableManualPage(programState) {
    console.log("Disabilitazione controllo manuale - Programma in esecuzione", programState);
    
    window.ManualPage.disabledManualMode = true;
    
    document.querySelectorAll('.zone-card').forEach(card => {
        card.classList.add('disabled-mode');
    });
    
    document.querySelectorAll('.activation-button, .stepper-btn').forEach(el => {
        el.disabled = true;
    });
    
    document.getElementById('manual-page-overlay')?.remove();
    
    let programName = "Programma in esecuzione";
    if (programState && programState.current_program_id) {
        createOverlay(programName, programState);
        updateStopButtonText(programState.current_program_id);
    } else {
        createOverlay(programName, programState);
    }
}

function createOverlay(programName, programState) {
    const overlay = document.createElement('div');
    overlay.id = 'manual-page-overlay';
    overlay.className = 'manual-page-overlay';
    
    let zoneInfo = '';
    if (programState && programState.active_zone) {
        zoneInfo = `<p>Zona attualmente attiva: <strong>${programState.active_zone.name || 'Zona ' + (programState.active_zone.id + 1)}</strong></p>`;
    }
    
    overlay.innerHTML = `
        <div class="overlay-message">
            <h3>Controllo Manuale Disabilitato</h3>
            <p>"${programName}" è attualmente in esecuzione.</p>
            ${zoneInfo}
            <p>Il controllo manuale sarà disponibile al termine del programma.</p>
            <button onclick="window.IrrigationAPI?.stopProgram()" style="margin-top: 20px; background-color: #ff3333; color: white; border: none; padding: 12px 25px; border-radius: 6px; cursor: pointer; font-weight: bold;">
                ARRESTA PROGRAMMA
            </button>
        </div>
    `;
    
    document.body.appendChild(overlay);
}

function enableManualPage() {
    console.log("Riabilitazione controllo manuale - Nessun programma in esecuzione");
    
    window.ManualPage.disabledManualMode = false;
    
    document.querySelectorAll('.zone-card').forEach(card => {
        card.classList.remove('disabled-mode');
    });
    
    document.querySelectorAll('.activation-button, .stepper-btn').forEach(el => {
        el.disabled = false;
    });
    
    document.getElementById('manual-page-overlay')?.remove();
}

// Modifica della funzione updateZonesUI in manual.js
function updateZonesUI(zonesStatus) {
    if (!Array.isArray(zonesStatus)) return;
    
    zonesStatus.forEach(zone => {
        if (!zone || zone.id === undefined) return;
        
        const zoneId = zone.id;
        const zoneCard = document.getElementById(`zone-${zoneId}`);
        const activateBtn = zoneCard?.querySelector('.activation-button');
        
        if (!zoneCard) return;
        
        if (zone.active) {
            zoneCard.classList.add('active');
            
            if (activateBtn) {
                activateBtn.classList.remove('activate');
                activateBtn.classList.add('deactivate');
                activateBtn.innerHTML = `
                    <svg class="button-icon" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M18,18H6V6H18V18Z" />
                    </svg>
                    DISATTIVA ZONA
                `;
            }
            
            if (!window.ManualPage.activeZones.has(zoneId)) {
                // Usa il tempo rimanente riportato dal backend
                const remainingTime = zone.remaining_time || 0;
                const totalSeconds = Math.round(remainingTime);
                
                if (totalSeconds > 0) {
                    // Prima di tutto verifica se ci sono dati di durata originale salvati
                    let originalDuration = null;
                    let originalStartTime = null;
                    
                    try {
                        const savedData = localStorage.getItem('zoneOriginalData');
                        if (savedData) {
                            const zoneData = JSON.parse(savedData)[zoneId];
                            if (zoneData) {
                                originalDuration = zoneData.originalDuration;
                                originalStartTime = zoneData.startTimestamp;
                                console.log(`Trovati dati originali per zona ${zoneId}: durata=${originalDuration}s`);
                            }
                        }
                    } catch (e) {
                        console.warn('Errore nel recupero dati originali:', e);
                    }
                    
                    // Aggiorna i dati di esecuzione
                    if (originalDuration) {
                        updateZoneExecution(zoneId, remainingTime);
                    } else if (zone.duration) {
                        // Se non ci sono dati salvati ma abbiamo la durata dal backend, salviamola
                        saveZoneOriginalDuration(zoneId, zone.duration);
                        originalDuration = zone.duration * 60;
                    }
                    
                    // Crea oggetto dati zona
                    const zoneData = {
                        totalDuration: originalDuration || totalSeconds,
                        remainingTime: totalSeconds,
                        startTime: Date.now(),
                        timer: null
                    };
                    
                    window.ManualPage.activeZones.set(zoneId, zoneData);
                    
                    // Usa un timestamp di inizio appropriato
                    if (originalDuration) {
                        // Se abbiamo la durata originale, calcoliamo il tempo trascorso correttamente
                        const elapsed = originalDuration - totalSeconds;
                        zoneData.totalDuration = originalDuration;
                        zoneData.startTime = Date.now() - (elapsed * 1000);
                        updateProgressBar(zoneId, elapsed, originalDuration);
                        console.log(`Zona ${zoneId}: usando durata originale=${originalDuration}s, rimasti=${totalSeconds}s`);
                    } else if (zone.duration) {
                        // Altrimenti se abbiamo la durata dal backend
                        const durationSeconds = zone.duration * 60;
                        const elapsed = Math.max(0, durationSeconds - totalSeconds);
                        zoneData.totalDuration = durationSeconds;
                        zoneData.startTime = Date.now() - (elapsed * 1000);
                        updateProgressBar(zoneId, elapsed, durationSeconds);
                        console.log(`Zona ${zoneId}: usando durata da backend=${durationSeconds}s, rimasti=${totalSeconds}s`);
                    } else {
                        // Fallback - usa solo il tempo rimanente
                        updateProgressBar(zoneId, 0, totalSeconds);
                        console.log(`Zona ${zoneId}: usando solo tempo rimanente=${totalSeconds}s`);
                    }
                    
                    // Avvia il timer
                    zoneData.timer = setInterval(() => {
                        const now = Date.now();
                        const elapsed = Math.floor((now - zoneData.startTime) / 1000);
                        const remaining = Math.max(0, zoneData.totalDuration - elapsed);
                        
                        zoneData.remainingTime = remaining;
                        updateProgressBar(zoneId, elapsed, zoneData.totalDuration);
                        
                        if (remaining <= 0) {
                            stopZoneTimer(zoneId);
                            clearZoneData(zoneId); // Rimuovi dati al termine
                            
                            const card = document.getElementById(`zone-${zoneId}`);
                            const btn = card?.querySelector('.activation-button');
                            
                            if (card) card.classList.remove('active');
                            if (btn) {
                                btn.classList.add('activate');
                                btn.classList.remove('deactivate');
                                btn.innerHTML = `
                                    <svg class="button-icon" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                                        <path d="M8,5.14V19.14L19,12.14L8,5.14Z" />
                                    </svg>
                                    AVVIA IRRIGAZIONE
                                `;
                                btn.disabled = false;
                            }
                        }
                    }, 1000);
                }
            }
        } else {
            zoneCard.classList.remove('active');
            
            if (activateBtn) {
                activateBtn.classList.add('activate');
                activateBtn.classList.remove('deactivate');
                activateBtn.innerHTML = `
                    <svg class="button-icon" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M8,5.14V19.14L19,12.14L8,5.14Z" />
                    </svg>
                    AVVIA IRRIGAZIONE
                `;
            }
            
            stopZoneTimer(zoneId);
            clearZoneData(zoneId); // Rimuovi dati quando la zona è disattivata
        }
    });
}

function addStopProgramButton() {
    if (document.getElementById('manual-stop-button')) return;
    
    const stopButton = document.createElement('button');
    stopButton.id = 'manual-stop-button';
    stopButton.className = 'stop-program-button';
    stopButton.innerHTML = '<i>■</i> ARRESTA PROGRAMMA IN ESECUZIONE';
    stopButton.onclick = function() {
        const api = window.IrrigationAPI;
        if (api && api.stopProgram) {
            api.stopProgram();
        }
    };
    
    document.body.appendChild(stopButton);
}

function showToastMessage(message, type) {
    const ui = window.IrrigationUI;
    if (ui && ui.showToast) {
        ui.showToast(message, type);
    } else if (typeof showToast === 'function') {
        showToast(message, type);
    }
}

// Esposizione globale delle funzioni per compatibilità
window.initializeManualPage = initializeManualPage;
window.handleProgramState = handleProgramState;
window.enableManualPage = enableManualPage;
window.disableManualPage = disableManualPage;
window.fetchZonesStatus = fetchZonesStatus;
window.fetchProgramState = fetchProgramState;

// Inizializzazione automatica se DOM pronto
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        const userData = window.IrrigationApp?.userData || window.userData;
        if (userData && Object.keys(userData).length > 0) {
            initializeManualPage(userData);
        }
    });
} else {
    const userData = window.IrrigationApp?.userData || window.userData;
    if (userData && Object.keys(userData).length > 0) {
        initializeManualPage(userData);
    }
}