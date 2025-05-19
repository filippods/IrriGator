// Versione ottimizzata di modify-program.js
window.ModifyProgramPage = window.ModifyProgramPage || {
    programToModify: null,
    abortControllers: new Map()
};

function initializeModifyProgramPage() {
    console.log("Inizializzazione pagina modifica programma");
    
    // Cleanup precedente
    cleanupModifyProgramPage();
    
    const programId = localStorage.getItem('editProgramId');
    if (!programId) {
        const showToastFn = (window.IrrigationUI?.showToast) || window.showToast;
        if (typeof showToastFn === 'function') {
            showToastFn('Nessun programma selezionato per la modifica', 'error');
        }
        
        setTimeout(() => {
            const loadPageFn = (window.IrrigationRouter?.loadPage) || window.loadPage;
            if (typeof loadPageFn === 'function') {
                loadPageFn('view_programs.html');
            }
        }, 500);
        return;
    }
    
    window.ModifyProgramPage.programToModify = programId;
    console.log("Modifica programma con ID:", programId);
    
    // Carica i dati utente per ottenere le zone
    const controller = new AbortController();
    window.ModifyProgramPage.abortControllers.set('settings', controller);
    
    const promise = window.IrrigationAPI?.loadUserSettings
        ? window.IrrigationAPI.loadUserSettings()
        : fetch('/data/user_settings.json', { signal: controller.signal })
            .then(response => {
                if (!response.ok) throw new Error('Errore nel caricamento delle impostazioni utente');
                return response.json();
            });
    
    promise
        .then(userData => initializeWithSettings(userData, programId))
        .catch(handleSettingsError)
        .finally(() => window.ModifyProgramPage.abortControllers.delete('settings'));
}

function cleanupModifyProgramPage() {
    // Cancella richieste pendenti
    window.ModifyProgramPage.abortControllers.forEach(controller => controller.abort());
    window.ModifyProgramPage.abortControllers.clear();
    
    // Reset stato
    window.ModifyProgramPage.programToModify = null;
}

function initializeWithSettings(userData, programId) {
    // Genera la griglia dei mesi
    if (window.IrrigationZones?.generateMonthsGrid) {
        window.IrrigationZones.generateMonthsGrid('months-list');
    }
    
    // Genera la griglia delle zone
    if (userData?.zones) {
        if (window.IrrigationZones?.generateZonesGrid) {
            window.IrrigationZones.generateZonesGrid(userData.zones, 'zone-list');
        }
    } else {
        const showToastFn = (window.IrrigationUI?.showToast) || window.showToast;
        if (showToastFn) {
            showToastFn("Errore: nessuna zona configurata", "error");
        }
    }
    
    // Carica i dati del programma da modificare
    loadProgramData(programId);
}

function handleSettingsError(error) {
    if (error.name === 'AbortError') return;
    
    console.error('Errore nel caricamento delle impostazioni:', error);
    const showToastFn = (window.IrrigationUI?.showToast) || window.showToast;
    if (showToastFn) {
        showToastFn('Errore nel caricamento delle impostazioni', 'error');
    }
}

function toggleDaysSelection() {
    const recurrenceSelect = document.getElementById('recurrence');
    const daysContainer = document.getElementById('days-container');
    
    if (!recurrenceSelect || !daysContainer) return;
    
    const isCustom = recurrenceSelect.value === 'personalizzata';
    daysContainer.style.display = isCustom ? 'block' : 'none';
    
    if (isCustom) {
        const intervalInput = document.getElementById('custom-days-interval');
        if (intervalInput && !intervalInput.value) {
            intervalInput.value = '3';
        }
    }
}

function loadProgramData(programId) {
    const controller = new AbortController();
    window.ModifyProgramPage.abortControllers.set('program', controller);
    
    const promise = window.IrrigationProgram?.loadProgramData
        ? window.IrrigationProgram.loadProgramData(programId)
        : window.IrrigationAPI?.loadPrograms().then(programs => programs[programId])
        || fetch('/data/program.json', { signal: controller.signal })
            .then(response => {
                if (!response.ok) throw new Error('Errore nel caricamento dei programmi');
                return response.json();
            })
            .then(programs => programs[programId]);
    
    promise
        .then(program => {
            if (!program) throw new Error('Programma non trovato');
            
            if (window.IrrigationProgram?.populateProgramForm) {
                window.IrrigationProgram.populateProgramForm(program);
            } else {
                populateProgramFormFallback(program);
            }
        })
        .catch(error => {
            if (error.name === 'AbortError') return;
            
            console.error('Errore nel caricamento del programma:', error);
            const showToastFn = (window.IrrigationUI?.showToast) || window.showToast;
            if (showToastFn) {
                showToastFn(`Errore: ${error.message}`, 'error');
            }
        })
        .finally(() => window.ModifyProgramPage.abortControllers.delete('program'));
}

function populateProgramFormFallback(program) {
    // Fallback implementation
    const programNameInput = document.getElementById('program-name');
    if (programNameInput) programNameInput.value = program.name || '';
    
    const startTimeInput = document.getElementById('start-time') || document.getElementById('activation-time');
    if (startTimeInput) startTimeInput.value = program.activation_time || '';
    
    const recurrenceSelect = document.getElementById('recurrence');
    if (recurrenceSelect) {
        recurrenceSelect.value = program.recurrence || 'giornaliero';
        toggleDaysSelection();
    }
    
    if (program.recurrence === 'personalizzata') {
        const intervalInput = document.getElementById('custom-days-interval') || document.getElementById('interval-days');
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
            
            const checkbox = document.querySelector(`#zone-${step.zone_id}`);
            const durationInput = document.querySelector(`#duration-${step.zone_id}`);
            
            if (checkbox && durationInput) {
                checkbox.checked = true;
                durationInput.disabled = false;
                durationInput.value = step.duration || 10;
                
                const zoneItem = document.querySelector(`.zone-item[data-zone-id="${step.zone_id}"]`);
                if (zoneItem) zoneItem.classList.add('selected');
            }
        });
    }
}

async function saveProgram() {
    // Disabilita il pulsante durante il salvataggio
    const saveButton = document.querySelector('.save-btn');
    if (saveButton) {
        saveButton.classList.add('loading');
        saveButton.disabled = true;
    }
    
    const controller = new AbortController();
    window.ModifyProgramPage.abortControllers.set('save', controller);
    
    try {
        // Raccogli i dati
        let program;
        if (window.IrrigationProgram?.collectProgramData) {
            program = window.IrrigationProgram.collectProgramData(window.ModifyProgramPage.programToModify);
        } else {
            program = collectProgramDataFallback();
        }
        
        if (!program.id) {
            program.id = window.ModifyProgramPage.programToModify;
        }
        
        // Validazione
        if (!validateProgram(program)) {
            return;
        }
        
        // Salva
        const response = await fetch('/save_program', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(program),
            signal: controller.signal
        });
        
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const data = await response.json();
        
        if (data.success) {
            const showToastFn = (window.IrrigationUI?.showToast) || window.showToast;
            if (showToastFn) {
                showToastFn('Programma modificato con successo', 'success');
            }
            
            // Cleanup e torna alla lista
            cleanupModifyProgramPage();
            localStorage.removeItem('editProgramId');
            
            setTimeout(() => {
                const loadPageFn = (window.IrrigationRouter?.loadPage) || window.loadPage;
                if (loadPageFn) {
                    loadPageFn('view_programs.html');
                }
            }, 1000);
        } else {
            throw new Error(data.error || 'Errore durante il salvataggio');
        }
    } catch (error) {
        if (error.name === 'AbortError') return;
        
        console.error('Errore:', error);
        const showToastFn = (window.IrrigationUI?.showToast) || window.showToast;
        if (showToastFn) {
            showToastFn(`Errore: ${error.message}`, 'error');
        }
    } finally {
        window.ModifyProgramPage.abortControllers.delete('save');
        
        if (saveButton) {
            saveButton.classList.remove('loading');
            saveButton.disabled = false;
        }
    }
}

function collectProgramDataFallback() {
    const program = {
        id: window.ModifyProgramPage.programToModify,
        name: document.getElementById('program-name')?.value.trim(),
        activation_time: (document.getElementById('start-time') || document.getElementById('activation-time'))?.value,
        recurrence: document.getElementById('recurrence')?.value,
        months: [],
        steps: []
    };
    
    if (program.recurrence === 'personalizzata') {
        const intervalInput = document.getElementById('custom-days-interval') || document.getElementById('interval-days');
        program.interval_days = parseInt(intervalInput?.value) || 3;
    }
    
    // Collect selected months
    document.querySelectorAll('.month-item.selected').forEach(item => {
        program.months.push(item.dataset.month);
    });
    
    // Collect zones
    document.querySelectorAll('.zone-checkbox:checked').forEach(checkbox => {
        const zoneId = parseInt(checkbox.dataset.zoneId);
        const durationInput = document.getElementById(`duration-${zoneId}`);
        const duration = parseInt(durationInput?.value || 10);
        
        program.steps.push({ zone_id: zoneId, duration: duration });
    });
    
    return program;
}

function validateProgram(program) {
    const showToastFn = (window.IrrigationUI?.showToast) || window.showToast;
    
    if (!program.name?.trim()) {
        if (showToastFn) showToastFn('Inserisci un nome per il programma', 'error');
        return false;
    }
    
    if (program.name.length > 16) {
        if (showToastFn) showToastFn('Nome programma troppo lungo (max 16 caratteri)', 'error');
        return false;
    }
    
    if (!program.activation_time) {
        if (showToastFn) showToastFn('Seleziona un orario di attivazione', 'error');
        return false;
    }
    
    if (!program.months?.length) {
        if (showToastFn) showToastFn('Seleziona almeno un mese', 'error');
        return false;
    }
    
    if (!program.steps?.length) {
        if (showToastFn) showToastFn('Seleziona almeno una zona', 'error');
        return false;
    }
    
    for (const step of program.steps) {
        if (!step.duration || step.duration < 1 || step.duration > 180) {
            if (showToastFn) showToastFn(`Durata non valida per la zona ${step.zone_id + 1}`, 'error');
            return false;
        }
    }
    
    return true;
}

function cancelEdit() {
    if (confirm('Sei sicuro di voler annullare le modifiche?')) {
        cleanupModifyProgramPage();
        localStorage.removeItem('editProgramId');
        
        const loadPageFn = (window.IrrigationRouter?.loadPage) || window.loadPage;
        if (loadPageFn) {
            loadPageFn('view_programs.html');
        }
    }
}

// Esponi le funzioni globalmente
window.initializeModifyProgramPage = initializeModifyProgramPage;
window.toggleDaysSelection = toggleDaysSelection;
window.loadProgramData = loadProgramData;
window.saveProgram = saveProgram;
window.cancelEdit = cancelEdit;

// Auto-inizializzazione
document.addEventListener('DOMContentLoaded', function() {
    if (document.getElementById('page-title')?.textContent === 'Modifica Programma') {
        initializeModifyProgramPage();
    }
});