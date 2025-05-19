// Versione ottimizzata di settings.js
window.SettingsPage = window.SettingsPage || {
    isLoading: false,
    settingsStatusInterval: null,
    wifiNetworks: [],
    settingsModified: {
        wifi: false,
        zones: false,
        advanced: false
    },
    abortControllers: new Map()
};

function initializeSettingsPage(userData) {
    console.log("Inizializzazione pagina impostazioni");
    
    // Cleanup precedente
    cleanupSettingsPage();
    
    if (userData && Object.keys(userData).length > 0) {
        loadSettingsWithData(userData);
    } else {
        // Carica le impostazioni dal server
        const controller = new AbortController();
        window.SettingsPage.abortControllers.set('settings', controller);
        
        const promise = window.IrrigationAPI?.loadUserSettings
            ? window.IrrigationAPI.loadUserSettings()
            : fetch('/data/user_settings.json', { signal: controller.signal })
                .then(response => response.json());
        
        promise
            .then(data => {
                console.log("Dati impostazioni caricati dal server:", data);
                loadSettingsWithData(data);
            })
            .catch(error => {
                if (error.name === 'AbortError') return;
                console.error('Errore nel caricamento delle impostazioni:', error);
                showToastMessage('Errore nel caricamento delle impostazioni', 'error');
            })
            .finally(() => window.SettingsPage.abortControllers.delete('settings'));
    }
    
    startConnectionStatusPolling();
    window.addEventListener('pagehide', cleanupSettingsPage, { once: true });
    addChangeListeners();
}

function cleanupSettingsPage() {
    stopConnectionStatusPolling();
    
    // Cancella richieste pendenti
    window.SettingsPage.abortControllers.forEach(controller => controller.abort());
    window.SettingsPage.abortControllers.clear();
    
    // Reset stato
    window.SettingsPage.settingsModified = {
        wifi: false,
        zones: false,
        advanced: false
    };
    
    window.removeEventListener('pagehide', cleanupSettingsPage);
}

function loadSettingsWithData(data) {
    console.log("Caricamento impostazioni con dati:", data);
    window.userData = data || {};
    
    // Impostazioni WiFi
    const clientEnabled = data.client_enabled || false;
    
    const clientEnabledInput = document.getElementById('client-enabled');
    if (clientEnabledInput) {
        clientEnabledInput.value = clientEnabled ? 'true' : 'false';
    }
    
    // Inizializza il selettore della modalità WiFi
    selectWifiMode(clientEnabled ? 'client' : 'ap');
    
    if (data.wifi) {
        const wifiSsid = data.wifi.ssid || '';
        if (wifiSsid) {
            const wifiListSelect = document.getElementById('wifi-list');
            if (wifiListSelect) {
                wifiListSelect.innerHTML = `<option value="${wifiSsid}">${wifiSsid}</option>`;
            }
        }
        const wifiPasswordInput = document.getElementById('wifi-password');
        if (wifiPasswordInput) {
            wifiPasswordInput.value = data.wifi.password || '';
        }
    }
    
    if (data.ap) {
        const apSsidInput = document.getElementById('ap-ssid');
        if (apSsidInput) apSsidInput.value = data.ap.ssid || 'IrrigationSystem';
        
        const apPasswordInput = document.getElementById('ap-password');
        if (apPasswordInput) apPasswordInput.value = data.ap.password || '12345678';
    }
    
    // Impostazioni zone
    renderZonesSettings(data.zones || []);
    
    // Impostazioni avanzate
    const maxActiveZonesInput = document.getElementById('max-active-zones');
    if (maxActiveZonesInput) maxActiveZonesInput.value = data.max_active_zones || 3;
    
    const activationDelayInput = document.getElementById('activation-delay');
    if (activationDelayInput) activationDelayInput.value = data.activation_delay || 0;
    
    const maxZoneDurationInput = document.getElementById('max-zone-duration');
    if (maxZoneDurationInput) maxZoneDurationInput.value = data.max_zone_duration || 180;
    
    // Imposta il valore del pin del relè di sicurezza
    const safetyRelayPin = data.safety_relay?.pin !== undefined ? data.safety_relay.pin : 13;
    const safetyRelayPinInput = document.getElementById('safety-relay-pin');
    if (safetyRelayPinInput) safetyRelayPinInput.value = safetyRelayPin;
    
    // Resetta i flag delle modifiche
    window.SettingsPage.settingsModified = { wifi: false, zones: false, advanced: false };
}

function addChangeListeners() {
    // WiFi settings
    ['client-enabled', 'wifi-list', 'wifi-password', 'ap-ssid', 'ap-password'].forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.addEventListener('change', () => window.SettingsPage.settingsModified.wifi = true);
            
            if (element.type === 'text' || element.type === 'password') {
                element.addEventListener('input', () => window.SettingsPage.settingsModified.wifi = true);
            }
        }
    });
    
    // Advanced settings
    ['max-active-zones', 'activation-delay', 'max-zone-duration', 'safety-relay-pin'].forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.addEventListener('change', () => window.SettingsPage.settingsModified.advanced = true);
            
            if (element.type === 'number') {
                element.addEventListener('input', () => window.SettingsPage.settingsModified.advanced = true);
            }
        }
    });
}

function renderZonesSettings(zones) {
    const zonesGrid = document.getElementById('zones-grid');
    if (!zonesGrid) return;
    
    zonesGrid.innerHTML = '';
    
    if (!zones || !Array.isArray(zones) || zones.length === 0) {
        zonesGrid.innerHTML = '<p style="text-align:center; grid-column: 1/-1;">Nessuna zona configurata</p>';
        return;
    }
    
    // Assicurati che tutte le zone abbiano i campi necessari
    const defaultZones = Array.from({length: 8}, (_, i) => ({
        id: i,
        status: 'show',
        pin: 14 + i,
        name: `Zona ${i + 1}`
    }));
    
    // Combina le zone esistenti con quelle di default
    let combinedZones = [...defaultZones];
    zones.forEach(zone => {
        if (zone && zone.id !== undefined) {
            const index = combinedZones.findIndex(z => z.id === zone.id);
            if (index !== -1) {
                combinedZones[index] = {...combinedZones[index], ...zone};
            }
        }
    });
    
    combinedZones.forEach(zone => {
        if (!zone || zone.id === undefined) return;
        
        const zoneCard = document.createElement('div');
        zoneCard.className = 'zone-card';
        zoneCard.dataset.zoneId = zone.id;
        
        zoneCard.innerHTML = `
            <h4>Zona ${zone.id + 1}</h4>
            <div class="input-group">
                <label for="zone-name-${zone.id}">Nome:</label>
                <input type="text" id="zone-name-${zone.id}" class="input-control zone-name-input" 
                       value="${zone.name || `Zona ${zone.id + 1}`}" maxlength="16" 
                       placeholder="Nome zona" data-zone-id="${zone.id}">
            </div>
            <div class="input-group">
                <div class="input-row" style="justify-content: space-between;">
                    <label for="zone-status-${zone.id}">Visibile:</label>
                    <label class="toggle-switch">
                        <input type="checkbox" id="zone-status-${zone.id}" class="zone-status-toggle" 
                               ${zone.status === 'show' ? 'checked' : ''} data-zone-id="${zone.id}">
                        <span class="toggle-slider"></span>
                    </label>
                </div>
            </div>
        `;
        
        zonesGrid.appendChild(zoneCard);
        
        // Aggiungi listener
        const nameInput = zoneCard.querySelector('.zone-name-input');
        const statusToggle = zoneCard.querySelector('.zone-status-toggle');
        
        if (nameInput) {
            nameInput.addEventListener('input', () => window.SettingsPage.settingsModified.zones = true);
        }
        if (statusToggle) {
            statusToggle.addEventListener('change', () => window.SettingsPage.settingsModified.zones = true);
        }
    });
}

function selectWifiMode(mode) {
    console.log("Selezione modalità WiFi:", mode);
    
    // Update the mode descriptions
    const clientDesc = document.getElementById('client-mode-desc');
    const apDesc = document.getElementById('ap-mode-desc');
    
    if (clientDesc && apDesc) {
        clientDesc.classList.toggle('active', mode === 'client');
        apDesc.classList.toggle('active', mode === 'ap');
    }
    
    // Show/hide appropriate settings sections
    const clientSettings = document.getElementById('wifi-client-settings');
    const apSettings = document.getElementById('wifi-ap-settings');
    
    if (clientSettings && apSettings) {
        clientSettings.style.display = (mode === 'client') ? 'block' : 'none';
        apSettings.style.display = (mode === 'ap') ? 'block' : 'none';
    }
    
    // Update the hidden client_enabled input
    const clientEnabledInput = document.getElementById('client-enabled');
    if (clientEnabledInput) {
        clientEnabledInput.value = (mode === 'client') ? 'true' : 'false';
    }
    
    window.SettingsPage.settingsModified.wifi = true;
}

async function scanWifiNetworks() {
    const scanButton = document.getElementById('scan-wifi-button');
    if (scanButton) {
        scanButton.classList.add('loading');
        scanButton.disabled = true;
    }
    
    const controller = new AbortController();
    window.SettingsPage.abortControllers.set('scan', controller);
    
    try {
        const response = await (window.IrrigationAPI?.apiCall
            ? window.IrrigationAPI.apiCall('/scan_wifi')
            : fetch('/scan_wifi', { signal: controller.signal }).then(res => res.json()));
        
        console.log('Reti WiFi trovate:', response);
        window.SettingsPage.wifiNetworks = response;
        displayWifiNetworks(response);
    } catch (error) {
        if (error.name === 'AbortError') return;
        console.error('Errore durante la scansione WiFi:', error);
        showToastMessage('Errore durante la scansione delle reti WiFi', 'error');
    } finally {
        window.SettingsPage.abortControllers.delete('scan');
        if (scanButton) {
            scanButton.classList.remove('loading');
            scanButton.disabled = false;
        }
    }
}

function displayWifiNetworks(networks) {
    const wifiList = document.getElementById('wifi-list');
    const networksContainer = document.getElementById('wifi-networks-container');
    
    if (!wifiList || !networksContainer) return;
    
    // Aggiorna la select
    wifiList.innerHTML = '';
    
    if (!networks || !Array.isArray(networks) || networks.length === 0) {
        wifiList.innerHTML = '<option value="">Nessuna rete trovata</option>';
        networksContainer.style.display = 'none';
        return;
    }
    
    // Popola la select
    networks.forEach(network => {
        if (!network || !network.ssid) return;
        
        const option = document.createElement('option');
        option.value = network.ssid;
        option.textContent = `${network.ssid} (${network.signal || 'Segnale sconosciuto'})`;
        wifiList.appendChild(option);
    });
    
    // Popola il container con le reti come lista cliccabile
    networksContainer.innerHTML = networks
        .filter(network => network && network.ssid)
        .map(network => `
            <div class="wifi-network">
                <span class="wifi-name">${network.ssid}</span>
                <span class="wifi-signal">${network.signal || 'Segnale sconosciuto'}</span>
            </div>
        `).join('');
    
    // Aggiungi event listeners
    document.querySelectorAll('.wifi-network').forEach(el => {
        el.addEventListener('click', () => {
            const ssid = el.querySelector('.wifi-name').textContent;
            wifiList.value = ssid;
            
            document.querySelectorAll('.wifi-network').forEach(n => n.classList.remove('selected'));
            el.classList.add('selected');
            
            const wifiPassword = document.getElementById('wifi-password');
            if (wifiPassword) wifiPassword.focus();
            window.SettingsPage.settingsModified.wifi = true;
        });
    });
    
    networksContainer.style.display = 'block';
}

async function saveWifiSettings() {
    if (!window.SettingsPage.settingsModified.wifi) {
        showToastMessage('Nessuna modifica da salvare', 'info');
        return;
    }
    
    const saveButton = document.getElementById('save-wifi-button');
    if (saveButton) {
        saveButton.classList.add('loading');
        saveButton.disabled = true;
    }
    
    try {
        // Ottieni la modalità WiFi selezionata
        const clientEnabledInput = document.getElementById('client-enabled');
        const isClientMode = clientEnabledInput?.value === 'true';
        
        // Raccogli i dati
        const wifiSsid = document.getElementById('wifi-list')?.value || '';
        const wifiPassword = document.getElementById('wifi-password')?.value || '';
        const apSsid = document.getElementById('ap-ssid')?.value || '';
        const apPassword = document.getElementById('ap-password')?.value || '';
        
        // Validazione
        if (!apSsid) {
            showToastMessage('Il nome (SSID) dell\'access point non può essere vuoto', 'error');
            return;
        }
        
        if (apPassword && apPassword.length < 8) {
            showToastMessage('La password dell\'access point deve essere di almeno 8 caratteri', 'error');
            return;
        }
        
        // Se client è abilitato, verifica che ci siano SSID e password
        if (isClientMode && (!wifiSsid || !wifiPassword)) {
            showToastMessage('Inserisci SSID e password per la modalità client', 'error');
            return;
        }
        
        // Prepara i dati da inviare
        const wifiSettings = {
            client_enabled: isClientMode,
            wifi: { ssid: wifiSsid, password: wifiPassword },
            ap: { ssid: apSsid, password: apPassword }
        };
        
        // Invia la richiesta
        await saveSettings(wifiSettings);
        
        window.SettingsPage.settingsModified.wifi = false;
        showToastMessage('Impostazioni WiFi salvate con successo', 'success');
        setTimeout(fetchConnectionStatus, 2000);
        
    } catch (error) {
        console.error('Errore salvataggio WiFi:', error);
        showToastMessage('Errore durante il salvataggio', 'error');
    } finally {
        if (saveButton) {
            saveButton.classList.remove('loading');
            saveButton.disabled = false;
        }
    }
}

async function saveZonesSettings() {
    if (!window.SettingsPage.settingsModified.zones) {
        showToastMessage('Nessuna modifica da salvare', 'info');
        return;
    }
    
    const saveButton = document.getElementById('save-zones-button');
    if (saveButton) {
        saveButton.classList.add('loading');
        saveButton.disabled = true;
    }
    
    try {
        // Raccogli i dati dalle zone
        const zones = [];
        const zoneCards = document.querySelectorAll('.zone-card');
        
        zoneCards.forEach(card => {
            const zoneId = parseInt(card.dataset.zoneId);
            const nameInput = card.querySelector('.zone-name-input');
            const statusToggle = card.querySelector('.zone-status-toggle');
            
            if (nameInput && statusToggle) {
                const name = nameInput.value.trim();
                const status = statusToggle.checked ? 'show' : 'hide';
                
                // Ottieni il pin dalla configurazione attuale
                const currentZone = window.userData?.zones?.find(z => z.id === zoneId);
                const pin = currentZone?.pin !== undefined ? currentZone.pin : 14 + zoneId;
                
                zones.push({ id: zoneId, name, pin, status });
            }
        });
        
        if (zones.length === 0) {
            showToastMessage('Errore nel salvataggio delle zone', 'error');
            return;
        }
        
        // Invia la richiesta
        await saveSettings({ zones });
        
        window.SettingsPage.settingsModified.zones = false;
        showToastMessage('Impostazioni zone salvate con successo', 'success');
        
    } catch (error) {
        console.error('Errore salvataggio zone:', error);
        showToastMessage('Errore durante il salvataggio', 'error');
    } finally {
        if (saveButton) {
            saveButton.classList.remove('loading');
            saveButton.disabled = false;
        }
    }
}

async function saveAdvancedSettings() {
    if (!window.SettingsPage.settingsModified.advanced) {
        showToastMessage('Nessuna modifica da salvare', 'info');
        return;
    }
    
    const saveButton = document.getElementById('save-advanced-button');
    if (saveButton) {
        saveButton.classList.add('loading');
        saveButton.disabled = true;
    }
    
    try {
        // Raccogli i dati
        const maxActiveZones = parseInt(document.getElementById('max-active-zones')?.value) || 3;
        const activationDelay = parseInt(document.getElementById('activation-delay')?.value) || 0;
        const maxZoneDuration = parseInt(document.getElementById('max-zone-duration')?.value) || 180;
        const safetyRelayPin = parseInt(document.getElementById('safety-relay-pin')?.value) || 13;
        
        // Validazione
        if (maxActiveZones < 1 || maxActiveZones > 8) {
            showToastMessage('Il numero massimo di zone deve essere tra 1 e 8', 'error');
            return;
        }
        
        if (activationDelay < 0 || activationDelay > 60) {
            showToastMessage('L\'anticipo o ritardo zona deve essere tra 0 e 60 secondi', 'error');
            return;
        }
        
        if (maxZoneDuration < 1) {
            showToastMessage('La durata massima deve essere almeno 1 minuto', 'error');
            return;
        }
        
        // Prepara i dati
        const advancedSettings = {
            max_active_zones: maxActiveZones,
            activation_delay: activationDelay,
            max_zone_duration: maxZoneDuration,
            safety_relay: { pin: safetyRelayPin },
            automatic_programs_enabled: true // Mantenuto per compatibilità
        };
        
        // Invia la richiesta
        await saveSettings(advancedSettings);
        
        window.SettingsPage.settingsModified.advanced = false;
        showToastMessage('Impostazioni avanzate salvate con successo', 'success');
        
    } catch (error) {
        console.error('Errore salvataggio avanzate:', error);
        showToastMessage('Errore durante il salvataggio', 'error');
    } finally {
        if (saveButton) {
            saveButton.classList.remove('loading');
            saveButton.disabled = false;
        }
    }
}

async function saveSettings(settings) {
    const controller = new AbortController();
    window.SettingsPage.abortControllers.set('save', controller);
    
    try {
        const response = await (window.IrrigationAPI?.apiCall
            ? window.IrrigationAPI.apiCall('/save_user_settings', 'POST', settings)
            : fetch('/save_user_settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(settings),
                signal: controller.signal
            }).then(res => res.json()));
        
        if (response.success || response.ok) {
            // Aggiorna le impostazioni locali
            Object.assign(window.userData, settings);
        } else {
            throw new Error(response.error || 'Salvataggio fallito');
        }
    } finally {
        window.SettingsPage.abortControllers.delete('save');
    }
}

function startConnectionStatusPolling() {
    stopConnectionStatusPolling();
    fetchConnectionStatus();
    window.SettingsPage.settingsStatusInterval = setInterval(fetchConnectionStatus, 10000);
}

function stopConnectionStatusPolling() {
    if (window.SettingsPage.settingsStatusInterval) {
        clearInterval(window.SettingsPage.settingsStatusInterval);
        window.SettingsPage.settingsStatusInterval = null;
    }
}

async function fetchConnectionStatus() {
    const controller = new AbortController();
    window.SettingsPage.abortControllers.set('status', controller);
    
    try {
        const response = await (window.IrrigationAPI?.apiCall
            ? window.IrrigationAPI.apiCall('/get_connection_status')
            : fetch('/get_connection_status', { signal: controller.signal }).then(res => res.json()));
        
        updateConnectionStatus(response);
    } catch (error) {
        if (error.name === 'AbortError') return;
        console.error('Errore:', error);
        
        const statusElement = document.getElementById('connection-status');
        if (statusElement) {
            statusElement.innerHTML = `
                <div style="padding:10px;background-color:#ffebee;border-radius:6px;text-align:center;">
                    <p style="color:#c62828;margin:0;">Errore nel recupero dello stato della connessione</p>
                </div>
            `;
        }
    } finally {
        window.SettingsPage.abortControllers.delete('status');
    }
}

function updateConnectionStatus(data) {
    const statusElement = document.getElementById('connection-status');
    if (!statusElement) return;
    
    let statusHTML = '';
    
    if (data.mode === 'client') {
        statusHTML = `
            <div style="padding:15px;background-color:#e8f5e9;border-radius:8px;border:1px solid #c8e6c9;">
                <h4 style="margin:0 0 10px 0;color:#2e7d32;font-size:16px;">Connesso come Client Wi-Fi</h4>
                <p style="margin:5px 0;"><strong>SSID:</strong> ${data.ssid}</p>
                <p style="margin:5px 0;"><strong>Indirizzo IP:</strong> ${data.ip}</p>
            </div>
        `;
    } else if (data.mode === 'AP') {
        statusHTML = `
            <div style="padding:15px;background-color:#fff8e1;border-radius:8px;border:1px solid #ffecb3;">
                <h4 style="margin:0 0 10px 0;color:#ff8f00;font-size:16px;">Modalità Access Point attiva</h4>
                <p style="margin:5px 0;"><strong>SSID:</strong> ${data.ssid}</p>
                <p style="margin:5px 0;"><strong>Indirizzo IP:</strong> ${data.ip}</p>
                <p style="margin:5px 0;font-size:13px;color:#666;">I dispositivi possono connettersi a questa rete per accedere al sistema.</p>
            </div>
        `;
    } else {
        statusHTML = `
            <div style="padding:15px;background-color:#ffebee;border-radius:8px;border:1px solid #ffcdd2;">
                <h4 style="margin:0 0 10px 0;color:#c62828;font-size:16px;">Nessuna connessione attiva</h4>
                <p style="margin:5px 0;font-size:13px;">Configura le impostazioni Wi-Fi per connettere il dispositivo.</p>
            </div>
        `;
    }
    
    statusElement.innerHTML = statusHTML;
}

// Gestione dialoghi di conferma
function confirmRestartSystem() {
    const overlay = document.getElementById('restart-overlay');
    if (overlay) overlay.classList.add('active');
}

function closeRestartDialog() {
    const overlay = document.getElementById('restart-overlay');
    if (overlay) overlay.classList.remove('active');
}

function confirmFactoryReset() {
    const overlay = document.getElementById('factory-reset-overlay');
    if (overlay) overlay.classList.add('active');
}

function closeFactoryResetDialog() {
    const overlay = document.getElementById('factory-reset-overlay');
    if (overlay) overlay.classList.remove('active');
}

function confirmFactoryResetFinal() {
    closeFactoryResetDialog();
    const overlay = document.getElementById('factory-reset-final-overlay');
    if (overlay) overlay.classList.add('active');
}

function closeFactoryResetFinalDialog() {
    const overlay = document.getElementById('factory-reset-final-overlay');
    if (overlay) overlay.classList.remove('active');
}

// Azioni di sistema
async function restartSystem() {
    const restartButton = document.getElementById('restart-button');
    if (restartButton) {
        restartButton.classList.add('loading');
        restartButton.disabled = true;
    }
    
    closeRestartDialog();
    
    const controller = new AbortController();
    window.SettingsPage.abortControllers.set('restart', controller);
    
    try {
        const response = await (window.IrrigationAPI?.apiCall
            ? window.IrrigationAPI.apiCall('/restart_system', 'POST')
            : fetch('/restart_system', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                signal: controller.signal
            }).then(res => res.json()));
        
        if (response.success || response.ok) {
            showToastMessage('Sistema in riavvio. La pagina si ricaricherà automaticamente tra 30 secondi.', 'info');
            
            let countDown = 30;
            const countdownInterval = setInterval(() => {
                if (--countDown <= 0) {
                    clearInterval(countdownInterval);
                    window.location.reload();
                } else {
                    showToastMessage(`Sistema in riavvio. Ricaricamento in ${countDown} secondi...`, 'info');
                }
            }, 1000);
        } else {
            throw new Error(response.error || 'Riavvio fallito');
        }
    } catch (error) {
        if (error.name === 'AbortError') return;
        console.error('Errore:', error);
        showToastMessage('Errore di rete durante il riavvio', 'error');
        
        if (restartButton) {
            restartButton.classList.remove('loading');
            restartButton.disabled = false;
        }
    } finally {
        window.SettingsPage.abortControllers.delete('restart');
    }
}

async function executeFactoryReset() {
    const factoryResetButton = document.getElementById('factory-reset-button');
    if (factoryResetButton) {
        factoryResetButton.classList.add('loading');
        factoryResetButton.disabled = true;
    }
    
    closeFactoryResetFinalDialog();
    
    const controller = new AbortController();
    window.SettingsPage.abortControllers.set('reset', controller);
    
    try {
        const response = await (window.IrrigationAPI?.apiCall
            ? window.IrrigationAPI.apiCall('/reset_factory_data', 'POST')
            : fetch('/reset_factory_data', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                signal: controller.signal
            }).then(res => res.json()));
        
        if (response.success || response.ok) {
            showToastMessage('Reset di fabbrica completato. La pagina si ricaricherà.', 'success');
            setTimeout(() => window.location.reload(), 2000);
        } else {
            throw new Error(response.error || 'Reset fallito');
        }
    } catch (error) {
        if (error.name === 'AbortError') return;
        console.error('Errore:', error);
        showToastMessage('Errore di rete durante il reset', 'error');
        
        if (factoryResetButton) {
            factoryResetButton.classList.remove('loading');
            factoryResetButton.disabled = false;
        }
    } finally {
        window.SettingsPage.abortControllers.delete('reset');
    }
}

// Utility toast
function showToastMessage(message, type) {
    const showToastFn = (window.IrrigationUI?.showToast) || window.showToast;
    if (showToastFn) {
        showToastFn(message, type);
    }
}

// Funzioni per dialog generici
function closeConfirmDialog(overlayId) {
    const overlay = document.getElementById(overlayId);
    if (overlay) overlay.classList.remove('active');
}

function proceedToFinalReset() {
    confirmFactoryResetFinal();
}

function performFactoryReset() {
    executeFactoryReset();
}

// Esponi funzioni globalmente
window.initializeSettingsPage = initializeSettingsPage;
window.selectWifiMode = selectWifiMode;
window.scanWifiNetworks = scanWifiNetworks;
window.saveWifiSettings = saveWifiSettings;
window.saveZonesSettings = saveZonesSettings;
window.saveAdvancedSettings = saveAdvancedSettings;
window.startConnectionStatusPolling = startConnectionStatusPolling;
window.stopConnectionStatusPolling = stopConnectionStatusPolling;
window.fetchConnectionStatus = fetchConnectionStatus;
window.confirmRestartSystem = confirmRestartSystem;
window.closeRestartDialog = closeRestartDialog;
window.confirmFactoryReset = confirmFactoryReset;
window.closeFactoryResetDialog = closeFactoryResetDialog;
window.confirmFactoryResetFinal = confirmFactoryResetFinal;
window.closeFactoryResetFinalDialog = closeFactoryResetFinalDialog;
window.restartSystem = restartSystem;
window.executeFactoryReset = executeFactoryReset;
window.closeConfirmDialog = closeConfirmDialog;
window.proceedToFinalReset = proceedToFinalReset;
window.performFactoryReset = performFactoryReset;

document.addEventListener('DOMContentLoaded', () => {
    if (window.userData && Object.keys(window.userData).length > 0) {
        initializeSettingsPage(window.userData);
    }
});