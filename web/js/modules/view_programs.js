// view_programs.js - Versione corretta con gestione stato migliorata
// Namespace per evitare conflitti
window.ViewProgramsPage = window.ViewProgramsPage || {
    statusInterval: null,
    programsData: {},
    zoneNameMap: {},
    lastKnownState: null,
    pollingAccelerated: false,
    NORMAL_POLLING_INTERVAL: 5000,
    FAST_POLLING_INTERVAL: 1000,
    abortControllers: new Map(),
    zoneProgressData: {}
};

// Modifica alla funzione initializeViewProgramsPage in view_programs.js
function initializeViewProgramsPage() {
    console.log("Inizializzazione pagina visualizzazione programmi");
    
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
    cleanupViewProgramsPage();
    
    addViewProgramsStyles();
    loadUserSettingsAndPrograms();
    startProgramStatusPolling();
    
    // Event listeners
    window.addEventListener('pagehide', cleanupViewProgramsPage, { once: true });
    window.fetchProgramState = fetchProgramState;
    
    // Global stop button handler
    document.addEventListener('click', handleGlobalStopClick);
}

function handleGlobalStopClick(e) {
    const stopSelectors = [
        '.global-stop-btn', '.banner-stop-btn', '.stop-program-button'
    ];
    
    if (stopSelectors.some(selector => e.target.closest(selector))) {
        e.preventDefault();
        e.stopPropagation();
        
        const api = window.IrrigationAPI;
        if (api && api.stopProgram) {
            api.stopProgram();
        }
    }
}

function addViewProgramsStyles() {
    const ui = window.IrrigationUI;
    if (ui && ui.addStyles) {
        ui.addStyles('view-programs-style', `
            .program-card {
                transition: all 0.4s cubic-bezier(0.23, 1, 0.32, 1);
                position: relative;
                overflow: hidden;
                box-shadow: 0 8px 32px rgba(0,0,0,0.08);
                border: 2px solid rgba(230,235,240,0.8);
            }
            
            .program-card:hover {
                transform: translateY(-8px);
                box-shadow: 0 12px 48px rgba(0,0,0,0.12);
            }
            
            .program-card.active-program {
                border: 3px solid #00cc66 !important;
                animation: pulse-green 2s infinite !important;
            }
            
            @keyframes pulse-green {
                0% { box-shadow: 0 0 0 0 rgba(0, 204, 102, 0.4); }
                50% { box-shadow: 0 0 20px 10px rgba(0, 204, 102, 0.2); }
                100% { box-shadow: 0 0 0 0 rgba(0, 204, 102, 0.4); }
            }
            
            .btn.loading {
                position: relative;
                color: transparent !important;
                pointer-events: none;
            }
            
            .btn.loading::after {
                content: "";
                position: absolute;
                width: 20px;
                height: 20px;
                top: 50%;
                left: 50%;
                margin-top: -10px;
                margin-left: -10px;
                border-radius: 50%;
                border: 2px solid rgba(255, 255, 255, 0.3);
                border-top-color: white;
                animation: spin 1s linear infinite;
            }
            
            @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
            
            .global-stop-container {
                position: fixed !important;
                bottom: 25px !important;
                left: 50% !important;
                transform: translateX(-50%) !important;
                width: 90% !important;
                max-width: 450px !important;
                z-index: 1100 !important;
                box-shadow: 0 8px 30px rgba(0, 0, 0, 0.3) !important;
                border-radius: 15px !important;
                animation: fadeInUp 0.5s ease !important;
            }
            
            @keyframes fadeInUp {
                from {
                    opacity: 0;
                    transform: translateX(-50%) translateY(20px);
                }
                to {
                    opacity: 1;
                    transform: translateX(-50%) translateY(0);
                }
            }
            
            .running-status-section {
                padding: 16px 24px;
                font-size: 14px;
                background: linear-gradient(135deg, rgba(16, 185, 129, 0.08), rgba(16, 185, 129, 0.04));
                border-bottom: 1px solid rgba(16, 185, 129, 0.2);
                animation: fadeInStatus 0.4s ease;
            }
            
            @keyframes fadeInStatus {
                from {
                    opacity: 0;
                    transform: translateY(-10px);
                }
                to {
                    opacity: 1;
                    transform: translateY(0);
                }
            }
            
            .progress-bar-container {
                height: 6px;
                background-color: rgba(16, 185, 129, 0.2);
                border-radius: 6px;
                overflow: hidden;
                margin-top: 8px;
            }
            
            .progress-bar {
                height: 100%;
                background: linear-gradient(90deg, var(--color-success), var(--color-success-dark));
                border-radius: 6px;
                transition: width 0.5s linear;
                box-shadow: 0 0 10px rgba(16, 185, 129, 0.3);
            }
            
            .info-grid {
                display: grid;
                grid-template-columns: auto 1fr;
                gap: 8px 16px;
                margin-bottom: 20px;
                padding: 16px;
                background: linear-gradient(135deg, #F7F9FB, #FFFFFF);
                border-radius: 16px;
                border: 1px solid rgba(230,235,240,0.5);
            }
            
            .btn {
                font-size: 14px;
                padding: 14px 20px;
                font-weight: 600;
                border-radius: 16px;
                transition: all 0.3s ease;
                letter-spacing: 0.5px;
            }
            
            .btn:hover:not(:disabled) {
                transform: translateY(-2px);
                box-shadow: 0 6px 24px rgba(16,185,129,0.4);
            }
            
            /* Nuovi stili migliorati per i tag mese e zone */
            .month-tag,
            .zone-tag {
                padding: 8px 16px;
                border-radius: 30px;
                font-size: 12px;
                font-weight: 600;
                line-height: 1.3;
                white-space: nowrap;
                transition: all 0.2s ease;
                box-shadow: 0 2px 4px rgba(0,0,0,0.05);
                letter-spacing: 0.2px;
                position: relative;
                overflow: hidden;
                display: inline-flex;
                align-items: center;
                justify-content: center;
            }
            
            .month-tag::before,
            .zone-tag::before {
                content: '';
                position: absolute;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: linear-gradient(to bottom, rgba(255,255,255,0.2), rgba(255,255,255,0));
                z-index: 1;
                pointer-events: none;
            }
            
            .month-tag.active {
                background: var(--color-primary);
                color: white;
                box-shadow: 0 3px 10px rgba(var(--color-primary-rgb), 0.3);
                transform: translateY(-1px);
            }
            
            .month-tag.inactive {
                background-color: #F1F3F5;
                color: #7B8A9E;
                border: 1px solid #E2E8F0;
            }
            
            .zone-tag {
                background: var(--color-success);
                color: white;
                box-shadow: 0 3px 10px rgba(16, 185, 129, 0.25);
                border: none;
                padding: 8px 16px;
                display: inline-flex;
                align-items: center;
                gap: 8px;
            }
            
            .zone-tag .duration {
                font-weight: 700;
                background: rgba(255,255,255,0.25);
                padding: 3px 8px;
                border-radius: 20px;
                font-size: 11px;
                margin-left: 4px;
            }
            
            .months-grid,
            .zones-grid {
                display: flex;
                flex-wrap: wrap;
                gap: 8px;
                margin-bottom: 16px;
            }
        `);
    }
}

function cleanupViewProgramsPage() {
    console.log("Cleanup pagina visualizzazione programmi");
    
    stopProgramStatusPolling();
    
    // Cancella richieste pendenti
    window.ViewProgramsPage.abortControllers.forEach(controller => controller.abort());
    window.ViewProgramsPage.abortControllers.clear();
    
    document.removeEventListener('click', handleGlobalStopClick);
    window.removeEventListener('pagehide', cleanupViewProgramsPage);
}

function startProgramStatusPolling() {
    stopProgramStatusPolling();
    
    // Prima esecuzione immediata
    fetchProgramState();
    
    // Setup intervallo
    const pollingInterval = window.ViewProgramsPage.lastKnownState?.program_running 
        ? window.ViewProgramsPage.FAST_POLLING_INTERVAL 
        : window.ViewProgramsPage.NORMAL_POLLING_INTERVAL;
    
    window.ViewProgramsPage.statusInterval = setInterval(fetchProgramState, pollingInterval);
    
    // Gestione visibilità pagina
    document.addEventListener('visibilitychange', handleVisibilityChange);
}

function handleVisibilityChange() {
    if (!window.ViewProgramsPage.statusInterval) return;
    
    stopProgramStatusPolling();
    
    if (document.hidden) {
        // Polling più lento quando la pagina non è visibile
        window.ViewProgramsPage.statusInterval = setInterval(
            fetchProgramState, 
            window.ViewProgramsPage.NORMAL_POLLING_INTERVAL * 2
        );
    } else {
        // Ripristina polling normale
        const newInterval = window.ViewProgramsPage.lastKnownState?.program_running 
            ? window.ViewProgramsPage.FAST_POLLING_INTERVAL 
            : window.ViewProgramsPage.NORMAL_POLLING_INTERVAL;
        
        fetchProgramState(); // Aggiornamento immediato
        window.ViewProgramsPage.statusInterval = setInterval(fetchProgramState, newInterval);
    }
}

function stopProgramStatusPolling() {
    if (window.ViewProgramsPage.statusInterval) {
        clearInterval(window.ViewProgramsPage.statusInterval);
        window.ViewProgramsPage.statusInterval = null;
    }
    document.removeEventListener('visibilitychange', handleVisibilityChange);
}

async function fetchProgramState() {
    const controller = new AbortController();
    window.ViewProgramsPage.abortControllers.set('program-state', controller);
    
    try {
        const response = await fetch('/get_program_state', { signal: controller.signal });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const state = await response.json();
        
        if (state && typeof state === 'object') {
            const previousState = window.ViewProgramsPage.lastKnownState;
            window.ViewProgramsPage.lastKnownState = state;
            
            console.log("Stato programma ricevuto:", state);
            
            updateProgramsUI(state);
            
            // Gestione transizioni di stato
            if (state.program_running && state.current_program_id) {
                updateRunningProgramStatus(state);
                
                if (!previousState?.program_running && !window.ViewProgramsPage.pollingAccelerated) {
                    acceleratePolling();
                }
                
                showGlobalStopButton(state);
            } else {
                hideRunningStatus();
                hideGlobalStopButton();
                
                if (previousState?.program_running && window.ViewProgramsPage.pollingAccelerated) {
                    restoreNormalPolling();
                }
            }
        }
    } catch (error) {
        if (error.name !== 'AbortError') {
            console.error('Errore nel recupero dello stato del programma:', error);
        }
    } finally {
        window.ViewProgramsPage.abortControllers.delete('program-state');
    }
}

function acceleratePolling() {
    if (window.ViewProgramsPage.pollingAccelerated) return;
    
    console.log("Accelerazione polling per monitoraggio stato");
    window.ViewProgramsPage.pollingAccelerated = true;
    
    stopProgramStatusPolling();
    window.ViewProgramsPage.statusInterval = setInterval(
        fetchProgramState, 
        window.ViewProgramsPage.FAST_POLLING_INTERVAL
    );
    
    // Torna al polling normale dopo 15 secondi
    setTimeout(restoreNormalPolling, 15000);
}

function restoreNormalPolling() {
    if (!window.ViewProgramsPage.pollingAccelerated) return;
    
    console.log("Ripristino polling normale");
    window.ViewProgramsPage.pollingAccelerated = false;
    
    stopProgramStatusPolling();
    window.ViewProgramsPage.statusInterval = setInterval(
        fetchProgramState, 
        window.ViewProgramsPage.NORMAL_POLLING_INTERVAL
    );
}

async function loadUserSettingsAndPrograms() {
    const programsContainer = document.getElementById('programs-container');
    if (programsContainer) {
        programsContainer.innerHTML = '<div class="loading">Caricamento programmi...</div>';
    }
    
    const controllers = {
        settings: new AbortController(),
        programs: new AbortController(),
        state: new AbortController()
    };
    
    // Registra controllers per cleanup
    Object.entries(controllers).forEach(([key, controller]) => {
        window.ViewProgramsPage.abortControllers.set(key, controller);
    });
    
    try {
        const [settings, programs, state] = await Promise.all([
            fetch('/data/user_settings.json', { signal: controllers.settings.signal }).then(r => r.json()),
            fetch('/data/program.json', { signal: controllers.programs.signal }).then(r => r.json()),
            fetch('/get_program_state', { signal: controllers.state.signal }).then(r => r.json())
        ]);
        
        window.ViewProgramsPage.lastKnownState = state;
        
        // Crea mappa zone
        window.ViewProgramsPage.zoneNameMap = {};
        if (settings.zones && Array.isArray(settings.zones)) {
            settings.zones.forEach(zone => {
                if (zone && zone.id !== undefined) {
                    window.ViewProgramsPage.zoneNameMap[zone.id] = zone.name || `Zona ${zone.id + 1}`;
                }
            });
        }
        
        window.ViewProgramsPage.programsData = programs || {};
        
        renderProgramCards(programs || {}, state);
        
    } catch (error) {
        if (error.name !== 'AbortError') {
            console.error('Errore nel caricamento dei dati:', error);
            showToastMessage('Errore nel caricamento dei dati', 'error');
            
            if (programsContainer) {
                programsContainer.innerHTML = `
                    <div class="empty-state">
                        <h3>Errore nel caricamento dei programmi</h3>
                        <p>${error.message}</p>
                        <button class="btn primary" onclick="loadUserSettingsAndPrograms()">Riprova</button>
                    </div>
                `;
            }
        }
    } finally {
        // Cleanup controllers
        Object.keys(controllers).forEach(key => {
            window.ViewProgramsPage.abortControllers.delete(key);
        });
    }
}

function renderProgramCards(programs, state) {
    const container = document.getElementById('programs-container');
    if (!container) return;
    
    const programIds = Object.keys(programs);
    
    if (programIds.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <svg viewBox="0 0 24 24" fill="currentColor">
                    <path d="M19,13H13V19H11V13H5V11H11V5H13V11H19V13Z"/>
                </svg>
                <h3>Nessun programma configurato</h3>
                <p>Crea il tuo primo programma di irrigazione per iniziare a usare il sistema.</p>
                <button class="btn primary" onclick="IrrigationRouter.loadPage('create_program.html')">
                    Crea Programma
                </button>
            </div>
        `;
        return;
    }
    
    container.innerHTML = '';
    
    programIds.forEach(programId => {
        const program = programs[programId];
        if (!program) return;
        
        const programCard = createProgramCard(program, programId, state);
        container.appendChild(programCard);
    });
    
    // Gestione pulsante stop globale
    if (state.program_running && state.current_program_id) {
        showGlobalStopButton(state);
    } else {
        hideGlobalStopButton();
    }
}

function createProgramCard(program, programId, state) {
    // Assicura ID disponibile
    if (program.id === undefined) program.id = programId;
    
    const isActive = state.program_running && state.current_program_id === String(programId);
    const monthsHtml = buildMonthsGrid(program.months || []);
    const zonesHtml = buildZonesGrid(program.steps || []);
    const isAutomatic = program.automatic_enabled !== false;
    
    const programCard = document.createElement('div');
    programCard.className = `program-card ${isActive ? 'active-program' : ''}`;
    programCard.setAttribute('data-program-id', programId);
    
    programCard.innerHTML = `
        <div class="program-card-header">
            <div class="program-title-section">
                <h3>${program.name || 'Programma senza nome'}</h3>
            </div>
            ${isActive ? '<div class="active-indicator">IN ESECUZIONE</div>' : ''}
        </div>
        ${isActive ? '<div class="running-status-section" id="running-status-${programId}"></div>' : ''}
        <div class="program-content">
            <div class="info-grid">
                <span class="info-label">Orario:</span>
                <span class="info-value">${program.activation_time || 'Non impostato'}</span>
                
                <span class="info-label">Frequenza:</span>
                <span class="info-value">${formatRecurrence(program.recurrence, program.interval_days)}</span>
                
                <span class="info-label">Ultima esecuzione:</span>
                <span class="info-value">${program.last_run_date || 'Mai eseguito'}</span>
            </div>
            
            <div class="tags-container">
                <h4>MESI ATTIVI</h4>
                <div class="months-grid">
                    ${monthsHtml}
                </div>
            </div>
            
            <div class="tags-container">
                <h4>ZONE</h4>
                <div class="zones-grid">
                    ${zonesHtml}
                </div>
            </div>
            
            <div class="auto-execution-row">
                <span class="auto-status-label">Esecuzione automatica</span>
                <label class="toggle-switch">
                    <input type="checkbox" id="auto-switch-${programId}" 
                           class="auto-program-toggle" 
                           data-program-id="${programId}" 
                           ${isAutomatic ? 'checked' : ''}
                           onchange="toggleProgramAutomatic('${programId}', this.checked)">
                    <span class="slider"></span>
                </label>
            </div>
        </div>
        <div class="program-actions">
            <div class="action-button-group">
                ${isActive 
                    ? `<button class="btn btn-start disabled" disabled>
                        <span class="button-icon">▶</span> In Esecuzione
                       </button>`
                    : `<button class="btn btn-start" onclick="startProgram('${programId}')">
                        <span class="button-icon">▶</span> Avvia Ora
                       </button>`}
                <button class="btn btn-edit" onclick="editProgram('${programId}')">
                    <span class="button-icon">✏️</span> Modifica
                </button>
                <button class="btn btn-delete" onclick="deleteProgram('${programId}')">
                    <span class="button-icon">🗑️</span> Elimina
                </button>
            </div>
        </div>
    `;
    
    return programCard;
}

function updateProgramsUI(state) {
    const currentProgramId = state.current_program_id;
    const programRunning = state.program_running;
    
    console.log(`Aggiornamento UI programmi - In esecuzione: ${programRunning}, ID: ${currentProgramId}`);
    
    document.querySelectorAll('.program-card').forEach(card => {
        const cardProgramId = card.getAttribute('data-program-id');
        const isActive = programRunning && String(cardProgramId) === String(currentProgramId);
        
        card.classList.toggle('active-program', isActive);
        
        // Aggiorna indicatore
        let indicator = card.querySelector('.active-indicator');
        if (isActive && !indicator) {
            const header = card.querySelector('.program-card-header');
            if (header) {
                indicator = document.createElement('div');
                indicator.className = 'active-indicator';
                indicator.textContent = 'IN ESECUZIONE';
                header.appendChild(indicator);
            }
        } else if (!isActive && indicator) {
            indicator.remove();
        }
        
        // Aggiorna pulsanti
        const startBtn = card.querySelector('.btn-start');
        if (startBtn) {
            if (isActive) {
                startBtn.classList.add('disabled');
                startBtn.disabled = true;
                startBtn.innerHTML = '<span class="button-icon">▶</span> In Esecuzione';
            } else if (programRunning) {
                startBtn.classList.add('disabled');
                startBtn.disabled = true;
                startBtn.innerHTML = '<span class="button-icon">▶</span> Altro programma attivo';
            } else {
                startBtn.classList.remove('disabled');
                startBtn.disabled = false;
                startBtn.innerHTML = '<span class="button-icon">▶</span> Avvia Ora';
            }
        }
    });
    
    // Aggiorna pulsante stop globale
    if (programRunning && currentProgramId) {
        showGlobalStopButton(state);
    } else {
        hideGlobalStopButton();
    }
}

// Modifica alla funzione updateRunningProgramStatus in view_programs.js
function updateRunningProgramStatus(state) {
    const activeCard = document.querySelector(`.program-card[data-program-id="${state.current_program_id}"]`);
    if (!activeCard) return;
    
    let statusSection = activeCard.querySelector('.running-status-section');
    
    if (!statusSection) {
        statusSection = document.createElement('div');
        statusSection.className = 'running-status-section';
        statusSection.id = `running-status-${state.current_program_id}`;
        
        const contentDiv = activeCard.querySelector('.program-content');
        if (contentDiv) {
            activeCard.insertBefore(statusSection, contentDiv);
        }
    }
    
    if (state.active_zone) {
        const zoneId = state.active_zone.id;
        const remainingSeconds = state.active_zone.remaining_time || 0;
        const minutes = Math.floor(remainingSeconds / 60);
        const seconds = remainingSeconds % 60;
        const formattedTime = `${minutes}:${seconds.toString().padStart(2, '0')}`;
        
        // Calcolo preciso della percentuale di progresso
        let progressPercentage = 0;
        const program = window.ViewProgramsPage.programsData[state.current_program_id];
        
        if (program && program.steps) {
            const currentStep = program.steps.find(step => 
                parseInt(step.zone_id) === parseInt(zoneId)
            );
            
            if (currentStep && currentStep.duration) {
                // Salva la durata originale se non esiste già
                try {
                    const savedData = localStorage.getItem('zoneOriginalData');
                    const savedZones = savedData ? JSON.parse(savedData) : {};
                    
                    if (!savedZones[zoneId]) {
                        saveZoneOriginalDuration(zoneId, currentStep.duration);
                    } else {
                        // Se esiste già, aggiorna il tempo rimanente
                        updateZoneExecution(zoneId, remainingSeconds);
                    }
                } catch (e) {
                    console.warn('Errore nella gestione dati originali:', e);
                }
                
                // Ottieni la percentuale di progresso corretta
                progressPercentage = getCorrectProgressPercentage(zoneId, remainingSeconds);
                
                // Se il calcolo fallisce, usa il metodo classico
                if (progressPercentage === 0) {
                    const totalSeconds = currentStep.duration * 60;
                    const elapsedSeconds = totalSeconds - remainingSeconds;
                    progressPercentage = Math.min(100, Math.max(0, (elapsedSeconds / totalSeconds) * 100));
                }
            }
        }
        
        statusSection.innerHTML = `
            <p><strong>Zona attiva:</strong> ${state.active_zone.name || `Zona ${state.active_zone.id + 1}`}</p>
            <p style="display: flex; justify-content: space-between;">
                <span>Tempo rimanente:</span>
                <strong>${formattedTime}</strong>
            </p>
            <div class="progress-bar-container">
                <div class="progress-bar" style="width: ${progressPercentage.toFixed(1)}%;"></div>
            </div>
        `;
    }
}

function hideRunningStatus() {
    document.querySelectorAll('.running-status-section').forEach(section => section.remove());
}

function showGlobalStopButton(state) {
    let stopContainer = document.getElementById('global-stop-button');
    
    if (!stopContainer) {
        stopContainer = document.createElement('div');
        stopContainer.id = 'global-stop-button';
        stopContainer.className = 'global-stop-container';
        document.body.appendChild(stopContainer);
    }
    
    const programId = state.current_program_id;
    const program = window.ViewProgramsPage.programsData[programId];
    let programName = "Programma in esecuzione";
    
    if (program) {
        programName = program.name || "Programma";
    }
    
    let zoneInfo = '';
    if (state.active_zone) {
        zoneInfo = ` - ${state.active_zone.name || 'Zona ' + (state.active_zone.id + 1)}`;
    }
    
    stopContainer.innerHTML = `
        <button class="button danger global-stop-btn">
            <svg class="button-icon" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M12,4A8,8 0 0,1 20,12A8,8 0 0,1 12,20A8,8 0 0,1 4,12A8,8 0 0,1 12,4M9,9V15H15V9H9Z"/>
            </svg>
            ARRESTA ${programName}${zoneInfo}
        </button>
    `;
    
    stopContainer.style.display = 'block';
}

function hideGlobalStopButton() {
    const stopContainer = document.getElementById('global-stop-button');
    if (stopContainer) {
        stopContainer.style.display = 'none';
    }
}

function buildMonthsGrid(activeMonths) {
    const months = [
        'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 
        'Maggio', 'Giugno', 'Luglio', 'Agosto', 
        'Settembre', 'Ottobre', 'Novembre', 'Dicembre'
    ];
    
    const activeMonthsSet = new Set(activeMonths || []);
    
    return months.map(month => {
        const isActive = activeMonthsSet.has(month);
        return `
            <div class="month-tag ${isActive ? 'active' : 'inactive'}">
                ${month.substring(0, 3)}
            </div>
        `;
    }).join('');
}

function buildZonesGrid(steps) {
    if (!steps || steps.length === 0) {
        return '<div class="zone-tag">Nessuna zona configurata</div>';
    }
    
    return steps.map(step => {
        if (!step || step.zone_id === undefined) return '';
        
        const zoneName = window.ViewProgramsPage.zoneNameMap[step.zone_id] || `Zona ${step.zone_id + 1}`;
        return `
            <div class="zone-tag">
                ${zoneName}
                <span class="duration">${step.duration || 0} min</span>
            </div>
        `;
    }).join('');
}

function formatRecurrence(recurrence, interval_days) {
    const utils = window.IrrigationUtils;
    if (utils && utils.formatRecurrence) {
        return utils.formatRecurrence(recurrence, interval_days);
    }
    
    const recurrenceMap = {
        'giornaliero': 'Ogni giorno',
        'giorni_alterni': 'Giorni alterni',
        'personalizzata': `Ogni ${interval_days || 1} giorn${interval_days === 1 ? 'o' : 'i'}`
    };
    
    return recurrenceMap[recurrence] || recurrence || 'Non impostata';
}

async function startProgram(programId) {
    const startBtn = document.querySelector(`.program-card[data-program-id="${programId}"] .btn-start`);
    if (startBtn) {
        startBtn.classList.add('loading');
        startBtn.disabled = true;
    }
    
    showToastMessage('Avvio del programma in corso...', 'info');
    
    const controller = new AbortController();
    window.ViewProgramsPage.abortControllers.set(`start-${programId}`, controller);
    
    try {
        const response = await fetch('/start_program', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ program_id: programId }),
            signal: controller.signal
        });
        
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const data = await response.json();
        
        if (startBtn) startBtn.classList.remove('loading');
        
        if (data.success) {
            showToastMessage('Programma avviato con successo', 'success');
            fetchProgramState();
            acceleratePolling();
        } else {
            showToastMessage(`Errore: ${data.error || 'Errore sconosciuto'}`, 'error');
            if (startBtn) {
                startBtn.disabled = false;
            }
        }
    } catch (error) {
        if (error.name !== 'AbortError') {
            console.error('Errore durante l\'avvio del programma:', error);
            showToastMessage('Errore di rete durante l\'avvio del programma', 'error');
        }
        
        if (startBtn) {
            startBtn.classList.remove('loading');
            startBtn.disabled = false;
        }
    } finally {
        window.ViewProgramsPage.abortControllers.delete(`start-${programId}`);
    }
}

async function toggleProgramAutomatic(programId, enable) {
    const toggle = document.getElementById(`auto-switch-${programId}`);
    if (toggle) toggle.disabled = true;
    
    const controller = new AbortController();
    window.ViewProgramsPage.abortControllers.set(`toggle-${programId}`, controller);
    
    try {
        const response = await fetch('/toggle_program_automatic', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ program_id: programId, enable: enable }),
            signal: controller.signal
        });
        
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const data = await response.json();
        
        if (toggle) toggle.disabled = false;
        
        if (data.success) {
            showToastMessage(
                `Automazione del programma ${enable ? 'attivata' : 'disattivata'} con successo`, 
                'success'
            );
            
            // Aggiorna dati locali
            if (window.ViewProgramsPage.programsData[programId]) {
                window.ViewProgramsPage.programsData[programId].automatic_enabled = enable;
            }
        } else {
            showToastMessage(`Errore: ${data.error || 'Errore sconosciuto'}`, 'error');
            
            // Ripristina stato
            if (toggle) toggle.checked = !enable;
        }
    } catch (error) {
        if (error.name !== 'AbortError') {
            console.error('Errore di rete:', error);
            showToastMessage('Errore di rete', 'error');
        }
        
        if (toggle) {
            toggle.disabled = false;
            toggle.checked = !enable;
        }
    } finally {
        window.ViewProgramsPage.abortControllers.delete(`toggle-${programId}`);
    }
}

function editProgram(programId) {
    localStorage.setItem('editProgramId', programId);
    
    const router = window.IrrigationRouter;
    if (router && router.loadPage) {
        router.loadPage('modify_program.html');
    }
}

async function deleteProgram(programId) {
    if (!confirm('Sei sicuro di voler eliminare questo programma? Questa operazione non può essere annullata.')) {
        return;
    }
    
    const programCard = document.querySelector(`.program-card[data-program-id="${programId}"]`);
    
    showToastMessage('Eliminazione del programma in corso...', 'info');
    
    // Loading overlay
    if (programCard) {
        const loadingOverlay = document.createElement('div');
        loadingOverlay.className = 'loading-overlay';
        loadingOverlay.style.cssText = `
            position: absolute; 
            top: 0; 
            left: 0; 
            width: 100%; 
            height: 100%; 
            background-color: rgba(255,255,255,0.8); 
            display: flex; 
            justify-content: center; 
            align-items: center;
            z-index: 100;
            border-radius: inherit;
        `;
        loadingOverlay.innerHTML = '<div class="loading">Eliminazione...</div>';
        programCard.style.position = 'relative';
        programCard.appendChild(loadingOverlay);
    }
    
    const controller = new AbortController();
    window.ViewProgramsPage.abortControllers.set(`delete-${programId}`, controller);
    
    try {
        const response = await fetch('/delete_program', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: programId }),
            signal: controller.signal
        });
        
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const data = await response.json();
        
        if (data.success) {
            showToastMessage('Programma eliminato con successo', 'success');
            
            if (programCard) {
                programCard.style.transition = 'all 0.5s ease';
                programCard.style.opacity = '0';
                programCard.style.transform = 'scale(0.9)';
                
                setTimeout(() => {
                    programCard.remove();
                    
                    const container = document.getElementById('programs-container');
                    if (container && !container.querySelector('.program-card')) {
                        container.innerHTML = `
                            <div class="empty-state">
                                <svg viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M19,13H13V19H11V13H5V11H11V5H13V11H19V13Z"/>
                                </svg>
                                <h3>Nessun programma configurato</h3>
                                <p>Crea il tuo primo programma di irrigazione per iniziare a usare il sistema.</p>
                                <button class="btn primary" onclick="IrrigationRouter.loadPage('create_program.html')">
                                    Crea Programma
                                </button>
                            </div>
                        `;
                    }
                }, 500);
            } else {
                loadUserSettingsAndPrograms();
            }
        } else {
            showToastMessage(`Errore nell'eliminazione: ${data.error || 'Errore sconosciuto'}`, 'error');
            
            if (programCard) {
                programCard.querySelector('.loading-overlay')?.remove();
            }
        }
    } catch (error) {
        if (error.name !== 'AbortError') {
            console.error("Errore durante l'eliminazione del programma:", error);
            showToastMessage("Errore di rete durante l'eliminazione del programma", 'error');
        }
        
        if (programCard) {
            programCard.querySelector('.loading-overlay')?.remove();
        }
    } finally {
        window.ViewProgramsPage.abortControllers.delete(`delete-${programId}`);
    }
}

function showToastMessage(message, type) {
    const ui = window.IrrigationUI;
    if (ui && ui.showToast) {
        ui.showToast(message, type);
    }
}

// Esposizione globale delle funzioni per compatibilità
window.initializeViewProgramsPage = initializeViewProgramsPage;
window.fetchProgramState = fetchProgramState;
window.startProgram = startProgram;
window.toggleProgramAutomatic = toggleProgramAutomatic;
window.editProgram = editProgram;
window.deleteProgram = deleteProgram;

// Auto-inizializzazione se DOM pronto
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeViewProgramsPage);
} else {
    initializeViewProgramsPage();
}