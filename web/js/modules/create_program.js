// create_program.js - Versione corretta con gestione errori migliorata
window.CreateProgramPage = window.CreateProgramPage || {
    editingProgramVar: null,
    abortControllers: new Map()
};

function initializeCreateProgramPage() {
    console.log("Inizializzazione pagina creazione programma");
    
    // Pulizia stato precedente
    cleanupCreateProgramPage();
    
    // Reset stato
    localStorage.removeItem('editProgramId');
    sessionStorage.removeItem('editing_intent');
    window.CreateProgramPage.editingProgramVar = null;

    // Carica i dati utente per ottenere le zone
    const api = window.IrrigationAPI;
    const promise = api && api.loadUserSettings 
        ? api.loadUserSettings() 
        : fetchUserSettings();
        
    promise
        .then(initializeWithSettings)
        .catch(handleSettingsError);
}

async function fetchUserSettings() {
    const controller = new AbortController();
    window.CreateProgramPage.abortControllers.set('settings', controller);
    
    try {
        const response = await fetch('/data/user_settings.json', { 
            signal: controller.signal 
        });
        
        if (!response.ok) throw new Error('Errore nel caricamento delle impostazioni utente');
        return await response.json();
    } finally {
        window.CreateProgramPage.abortControllers.delete('settings');
    }
}

function initializeWithSettings(userSettings) {
    // Genera la griglia dei mesi con handler personalizzato
    if (window.IrrigationZones && window.IrrigationZones.generateMonthsGrid) {
        window.IrrigationZones.generateMonthsGrid('months-grid', handleMonthClick);
    }
    
    // Genera la griglia delle zone
    if (userSettings && userSettings.zones) {
        if (window.IrrigationZones && window.IrrigationZones.generateZonesGrid) {
            window.IrrigationZones.generateZonesGrid(userSettings.zones, 'zones-grid', handleZoneChange);
        }
    } else {
        showToastMessage("Errore: nessuna zona configurata", "error");
    }
    
    // Event listeners
    setupEventListeners();
}

function handleMonthClick(month, element) {
    element.classList.toggle('selected');
}

function handleZoneChange(zoneId, checked, durationInput) {
    if (checked && durationInput) {
        const currentValue = parseInt(durationInput.value) || 10;
        if (currentValue < 1 || currentValue > 180) {
            durationInput.value = 10;
        }
    }
}

function setupEventListeners() {
    // Ricorrenza personalizzata
    const recurrenceSelect = document.getElementById('recurrence');
    if (recurrenceSelect) {
        recurrenceSelect.removeEventListener('change', toggleCustomDays);
        recurrenceSelect.addEventListener('change', toggleCustomDays);
    }
    
    // Input validation
    const programNameInput = document.getElementById('program-name');
    if (programNameInput) {
        programNameInput.addEventListener('input', function() {
            if (this.value.length > 16) {
                this.value = this.value.substring(0, 16);
                showToastMessage('Nome programma: massimo 16 caratteri', 'warning');
            }
        });
    }
    
    const intervalInput = document.getElementById('interval-days');
    if (intervalInput) {
        intervalInput.addEventListener('input', function() {
            const value = parseInt(this.value);
            if (value < 1) this.value = 1;
            if (value > 365) this.value = 365;
        });
    }
}

function toggleCustomDays() {
    const recurrenceSelect = document.getElementById('recurrence');
    const customDaysDiv = document.getElementById('custom-days');
    
    if (recurrenceSelect && customDaysDiv) {
        const isCustom = recurrenceSelect.value === 'personalizzata';
        customDaysDiv.classList.toggle('visible', isCustom);
        
        if (isCustom) {
            const intervalInput = document.getElementById('interval-days');
            if (intervalInput && !intervalInput.value) {
                intervalInput.value = 3; // Default
            }
        }
    }
}

async function saveProgram() {
    // Disabilita il pulsante durante il salvataggio
    const saveButton = document.getElementById('save-button');
    if (saveButton) {
        saveButton.classList.add('loading');
        saveButton.disabled = true;
    }
    
    // Raccogli e valida i dati
    let program;
    try {
        const programUtils = window.IrrigationProgram;
        if (!programUtils) {
            throw new Error('Modulo IrrigationProgram non disponibile');
        }
        
        program = programUtils.collectProgramData();
        if (!programUtils.validateProgramData(program, saveButton)) {
            return;
        }
        
        // Validazioni aggiuntive
        validateProgramTime(program.activation_time);
        validateProgramSteps(program.steps);
        
    } catch (error) {
        console.error('Errore nella validazione dei dati:', error);
        showToastMessage(error.message, 'error');
        
        if (saveButton) {
            saveButton.classList.remove('loading');
            saveButton.disabled = false;
        }
        return;
    }
    
    // Invia la richiesta al server
    const controller = new AbortController();
    window.CreateProgramPage.abortControllers.set('save', controller);
    
    try {
        const response = await fetch('/save_program', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(program),
            signal: controller.signal
        });
        
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const data = await response.json();
        
        if (data.success) {
            showToastMessage('Programma salvato con successo', 'success');
            
            // Torna alla pagina dei programmi
            setTimeout(() => {
                const router = window.IrrigationRouter;
                if (router && router.loadPage) {
                    router.loadPage('view_programs.html');
                }
            }, 1000);
        } else {
            throw new Error(data.error || 'Errore durante il salvataggio');
        }
    } catch (error) {
        if (error.name !== 'AbortError') {
            console.error('Errore:', error);
            showToastMessage(`Errore: ${error.message}`, 'error');
        }
        
        if (saveButton) {
            saveButton.classList.remove('loading');
            saveButton.disabled = false;
        }
    } finally {
        window.CreateProgramPage.abortControllers.delete('save');
    }
}

function validateProgramTime(timeStr) {
    if (!timeStr) throw new Error('Orario di attivazione richiesto');
    
    const timeParts = timeStr.split(':');
    if (timeParts.length !== 2) throw new Error('Formato orario non valido');
    
    const hours = parseInt(timeParts[0]);
    const minutes = parseInt(timeParts[1]);
    
    if (isNaN(hours) || hours < 0 || hours > 23) {
        throw new Error('Ora non valida');
    }
    
    if (isNaN(minutes) || minutes < 0 || minutes > 59) {
        throw new Error('Minuti non validi');
    }
}

function validateProgramSteps(steps) {
    if (!steps || steps.length === 0) {
        throw new Error('Seleziona almeno una zona');
    }
    
    const totalDuration = steps.reduce((sum, step) => sum + (step.duration || 0), 0);
    
    if (totalDuration > 1440) { // 24 ore
        throw new Error('La durata totale del programma non può superare 24 ore');
    }
    
    // Controlla duplicati
    const zoneIds = steps.map(s => s.zone_id);
    const uniqueZoneIds = new Set(zoneIds);
    
    if (zoneIds.length !== uniqueZoneIds.size) {
        throw new Error('Sono presenti zone duplicate nel programma');
    }
}

function handleSettingsError(error) {
    console.error('Errore nel caricamento delle impostazioni:', error);
    showToastMessage('Errore nel caricamento delle impostazioni', 'error');
    
    // Mostra messaggio di errore nell'UI
    const zonesGrid = document.getElementById('zones-grid');
    if (zonesGrid) {
        zonesGrid.innerHTML = `
            <div style="grid-column: 1/-1; text-align: center; padding: 20px;">
                <h3>Errore nel caricamento delle zone</h3>
                <p>${error.message}</p>
                <button class="button primary" onclick="initializeCreateProgramPage()">
                    Riprova
                </button>
            </div>
        `;
    }
}

function goBack() {
    // Chiedi conferma se ci sono modifiche non salvate
    if (hasUnsavedChanges()) {
        if (!confirm('Ci sono modifiche non salvate. Vuoi davvero uscire?')) {
            return;
        }
    }
    
    cleanupCreateProgramPage();
    
    const router = window.IrrigationRouter;
    if (router && router.loadPage) {
        router.loadPage('view_programs.html');
    }
}

function hasUnsavedChanges() {
    // Controlla se ci sono dati inseriti
    const programName = document.getElementById('program-name')?.value;
    const activationTime = document.getElementById('activation-time')?.value;
    const selectedMonths = document.querySelectorAll('.month-item.selected').length;
    const selectedZones = document.querySelectorAll('.zone-checkbox:checked').length;
    
    return !!(programName || activationTime || selectedMonths > 0 || selectedZones > 0);
}

function cleanupCreateProgramPage() {
    // Cancella richieste pendenti
    window.CreateProgramPage.abortControllers.forEach(controller => controller.abort());
    window.CreateProgramPage.abortControllers.clear();
    
    // Reset stato
    localStorage.removeItem('editProgramId');
    window.CreateProgramPage.editingProgramVar = null;
}

function showToastMessage(message, type) {
    const ui = window.IrrigationUI;
    if (ui && ui.showToast) {
        ui.showToast(message, type);
    }
}

// Esposizione globale delle funzioni
window.initializeCreateProgramPage = initializeCreateProgramPage;
window.toggleCustomDays = toggleCustomDays;
window.saveProgram = saveProgram;
window.goBack = goBack;

// Auto-inizializzazione se DOM pronto
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeCreateProgramPage);
} else {
    initializeCreateProgramPage();
}