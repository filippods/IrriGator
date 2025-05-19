// Versione ottimizzata di logs.js
let isLoadingLogs = false;
let autoRefreshInterval = null;

function initializeLogsPage() {
    console.log("Inizializzazione pagina log");
    loadLogs();
    startAutoRefresh();
    window.addEventListener('pagehide', cleanupLogsPage);
}

function startAutoRefresh() {
    stopAutoRefresh();
    autoRefreshInterval = setInterval(loadLogs, 30000);
}

function stopAutoRefresh() {
    if (autoRefreshInterval) {
        clearInterval(autoRefreshInterval);
        autoRefreshInterval = null;
    }
}

function cleanupLogsPage() {
    stopAutoRefresh();
}

function loadLogs() {
    if (isLoadingLogs) return;
    isLoadingLogs = true;
    
    const logsBody = document.getElementById('logs-tbody');
    if (!logsBody) {
        isLoadingLogs = false;
        return;
    }
    
    logsBody.innerHTML = `<tr><td colspan="4" class="loading">Caricamento log...</td></tr>`;
    
    (typeof IrrigationAPI !== 'undefined' && IrrigationAPI.apiCall 
        ? IrrigationAPI.apiCall('/data/system_log.json')
        : fetch('/data/system_log.json').then(response => {
            if (!response.ok) throw new Error(`Errore HTTP: ${response.status}`);
            return response.json();
        })
    )
    .then(logs => displayLogs(logs))
    .catch(error => handleLogsError(error, logsBody))
    .finally(() => isLoadingLogs = false);
}

function handleLogsError(error, logsBody) {
    console.error('Errore:', error);
    const showToastFn = typeof IrrigationUI !== 'undefined' && IrrigationUI.showToast || showToast;
    if (typeof showToastFn === 'function') showToastFn('Errore nel caricamento dei log', 'error');
    
    if (logsBody) {
        logsBody.innerHTML = `
            <tr>
                <td colspan="4" class="empty-logs">
                    Errore nel caricamento dei log: ${error.message}
                </td>
            </tr>
        `;
    }
}

function displayLogs(logs) {
    const logsBody = document.getElementById('logs-tbody');
    if (!logsBody) return;
    
    if (!logs || logs.length === 0) {
        logsBody.innerHTML = `
            <tr>
                <td colspan="4" class="empty-logs">
                    Nessun log disponibile
                </td>
            </tr>
        `;
        return;
    }
    
    logs.sort((a, b) => (b.date + ' ' + b.time).localeCompare(a.date + ' ' + a.time));
    
    logsBody.innerHTML = logs.map(log => {
        const level = log.level || 'INFO';
        const levelClass = level.toLowerCase();
        
        return `
            <tr>
                <td>${log.date || 'N/A'}</td>
                <td>${log.time || 'N/A'}</td>
                <td>
                    <span class="log-level ${levelClass}">${level}</span>
                </td>
                <td>${log.message || 'Nessun messaggio'}</td>
            </tr>
        `;
    }).join('');
}

function refreshLogs() {
    const refreshButton = document.getElementById('refresh-logs-btn');
    if (refreshButton) {
        refreshButton.classList.add('loading');
        refreshButton.disabled = true;
    }
    
    loadLogs();
    
    setTimeout(() => {
        if (refreshButton) {
            refreshButton.classList.remove('loading');
            refreshButton.disabled = false;
        }
    }, 1000);
}

function confirmClearLogs() {
    const overlay = document.getElementById('confirm-overlay');
    if (overlay) overlay.classList.add('active');
}

function closeConfirmDialog() {
    const overlay = document.getElementById('confirm-overlay');
    if (overlay) overlay.classList.remove('active');
}

function clearLogs() {
    const clearButton = document.getElementById('clear-logs-btn');
    if (clearButton) {
        clearButton.classList.add('loading');
        clearButton.disabled = true;
    }
    
    closeConfirmDialog();
    
    (typeof IrrigationAPI !== 'undefined' && IrrigationAPI.apiCall 
        ? IrrigationAPI.apiCall('/clear_logs', 'POST')
        : fetch('/clear_logs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        }).then(response => {
            if (!response.ok) throw new Error(`Errore HTTP: ${response.status}`);
            return response.json();
        })
    )
    .then(handleClearLogsResponse)
    .catch(handleClearLogsError)
    .finally(() => {
        if (clearButton) {
            clearButton.classList.remove('loading');
            clearButton.disabled = false;
        }
    });
}

function handleClearLogsResponse(data) {
    const showToastFn = typeof IrrigationUI !== 'undefined' && IrrigationUI.showToast || showToast;
    if (data.success) {
        if (typeof showToastFn === 'function') showToastFn('Log cancellati con successo', 'success');
        loadLogs();
    } else {
        if (typeof showToastFn === 'function') 
            showToastFn(`Errore: ${data.error || 'Cancellazione fallita'}`, 'error');
    }
}

function handleClearLogsError(error) {
    console.error('Errore:', error);
    const showToastFn = typeof IrrigationUI !== 'undefined' && IrrigationUI.showToast || showToast;
    if (typeof showToastFn === 'function') 
        showToastFn('Errore di rete durante la cancellazione dei log', 'error');
}

// Esponi le funzioni globalmente
window.initializeLogsPage = initializeLogsPage;
window.startAutoRefresh = startAutoRefresh;
window.stopAutoRefresh = stopAutoRefresh;
window.cleanupLogsPage = cleanupLogsPage;
window.loadLogs = loadLogs;
window.displayLogs = displayLogs;
window.refreshLogs = refreshLogs;
window.confirmClearLogs = confirmClearLogs;
window.closeConfirmDialog = closeConfirmDialog;
window.clearLogs = clearLogs;

document.addEventListener('DOMContentLoaded', initializeLogsPage);