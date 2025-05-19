// dashboard-component.js - Componente React per la dashboard avanzata
(function(window, document) {
    // Aggiungi check per React
    if (typeof React === 'undefined') {
        console.error('React non disponibile per dashboard-component.js');
        return;
    }

    // Funzioni utility interne
    function formatTime(minutes) {
        const mins = Math.floor(minutes);
        const secs = Math.round((minutes - mins) * 60);
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }

    // Componente Card Stato Sistema
    function SystemStatusCard({ title, status, subtext, icon, isActive }) {
        const getStatusColor = React.useCallback(() => {
            if (isActive === undefined) return "bg-gray-100 text-gray-600";
            return isActive 
                ? "bg-green-100 text-green-800" 
                : "bg-gray-100 text-gray-600";
        }, [isActive]);
        
        return React.createElement("div", { className: "bg-white rounded-lg border p-4" },
            React.createElement("div", { className: "flex items-center justify-between mb-2" },
                React.createElement("h3", { className: "text-sm font-medium text-gray-500" }, title),
                React.createElement("div", { className: `${getStatusColor()} p-1.5 rounded-full` }, icon)
            ),
            React.createElement("div", { className: "mt-1" },
                React.createElement("p", { className: "text-lg font-semibold text-gray-800" }, status),
                subtext && React.createElement("p", { className: "text-xs text-gray-500 mt-1" }, subtext)
            )
        );
    }

    // Componente Pulsante Tab
    function TabButton({ active, onClick, icon, label }) {
        return React.createElement("button", {
            className: `flex items-center px-4 py-3 font-medium text-sm focus:outline-none transition ${
                active 
                    ? 'text-blue-600 border-b-2 border-blue-600' 
                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
            }`,
            onClick: onClick
        }, 
            icon,
            React.createElement("span", { className: "ml-2" }, label)
        );
    }

    // Componente Card Zona
    function ZoneCard({ zone }) {
        const getProgressWidth = React.useCallback(() => {
            if (!zone.active || !zone.duration || !zone.remainingTime) return "0%";
            return `${(zone.remainingTime / zone.duration) * 100}%`;
        }, [zone]);
        
        return React.createElement("div", { 
            className: `rounded-lg border p-4 transition-all ${zone.active ? 'border-green-500 bg-green-50' : 'bg-white'}`
        },
            // Header
            React.createElement("div", { className: "flex justify-between items-start" },
                React.createElement("h3", { className: "font-medium text-gray-800" }, zone.name),
                React.createElement("div", { 
                    className: `text-xs rounded-full px-2 py-1 ${zone.active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`
                }, zone.active ? 'ATTIVA' : 'INATTIVA')
            ),
            
            // Progress section (conditional render)
            zone.active && React.createElement("div", { className: "mt-4" },
                React.createElement("div", { className: "flex justify-between text-xs mb-1" },
                    React.createElement("span", { className: "text-gray-500" }, "Tempo rimanente:"),
                    React.createElement("span", { className: "font-medium" }, `${formatTime(zone.remainingTime)} min`)
                ),
                React.createElement("div", { className: "h-2 bg-gray-200 rounded-full overflow-hidden" },
                    React.createElement("div", { 
                        className: "h-full bg-green-500 rounded-full transition-all duration-1000",
                        style: { width: getProgressWidth() }
                    })
                )
            )
        );
    }

    // Componente Card Controllo Zona
    function ZoneControlCard({ zone }) {
        const [duration, setDuration] = React.useState(zone.duration || 10);
        const [isActive, setIsActive] = React.useState(zone.active || false);
        const [isLoading, setIsLoading] = React.useState(false);
        
        const handleDurationChange = React.useCallback((delta) => {
            const newValue = Math.max(1, Math.min(180, duration + delta));
            setDuration(newValue);
        }, [duration]);
        
        const handleToggleZone = React.useCallback(async () => {
            if (isLoading) return;
            
            setIsLoading(true);
            const newIsActive = !isActive;
            
            try {
                const endpoint = newIsActive ? '/start_zone' : '/stop_zone';
                const payload = newIsActive 
                    ? { zone_id: zone.id, duration: duration }
                    : { zone_id: zone.id };
                
                const response = await (window.IrrigationAPI?.apiCall
                    ? window.IrrigationAPI.apiCall(endpoint, 'POST', payload)
                    : fetch(endpoint, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload)
                    }).then(res => res.json()));
                
                if (response.success || response.ok) {
                    setIsActive(newIsActive);
                }
            } catch (error) {
                console.error('Errore toggle zona:', error);
            } finally {
                setIsLoading(false);
            }
        }, [isActive, zone.id, duration, isLoading]);
        
        return React.createElement("div", { 
            className: `rounded-lg border p-4 transition-all ${isActive ? 'border-green-500' : ''}`
        },
            React.createElement("h3", { className: "font-medium text-gray-800 mb-4" }, zone.name),
            
            React.createElement("div", { className: "mb-4" },
                React.createElement("label", { className: "block text-xs text-gray-500 mb-1" }, "Durata (1-180 min)"),
                React.createElement("div", { className: "flex border rounded-md overflow-hidden" },
                    React.createElement("button", { 
                        className: "bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1 disabled:opacity-50",
                        onClick: () => handleDurationChange(-1),
                        disabled: isActive || duration <= 1 || isLoading
                    }, "-"),
                    React.createElement("input", {
                        type: "number",
                        className: "w-full text-center border-0 focus:ring-0",
                        value: duration,
                        min: "1",
                        max: "180",
                        disabled: isActive || isLoading,
                        onChange: (e) => {
                            const val = parseInt(e.target.value) || 1;
                            setDuration(Math.max(1, Math.min(180, val)));
                        }
                    }),
                    React.createElement("button", { 
                        className: "bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1 disabled:opacity-50",
                        onClick: () => handleDurationChange(1),
                        disabled: isActive || duration >= 180 || isLoading
                    }, "+")
                )
            ),
            
            React.createElement("button", {
                className: `w-full py-2 px-4 rounded-md font-medium text-sm transition ${
                    isActive 
                        ? 'bg-red-500 hover:bg-red-600 text-white' 
                        : 'bg-green-500 hover:bg-green-600 text-white'
                } ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`,
                onClick: handleToggleZone,
                disabled: isLoading
            }, isLoading ? 'Attendere...' : (isActive ? 'Disattiva Zona' : 'Attiva Zona'))
        );
    }

    // Componente Card Programma
    function ProgramCard({ program, zones }) {
        const [isExecuting, setIsExecuting] = React.useState(false);
        
        const handleEdit = React.useCallback(() => {
            if (typeof localStorage !== 'undefined') {
                localStorage.setItem('editProgramId', program.id);
            }
            if (window.IrrigationRouter?.loadPage) {
                window.IrrigationRouter.loadPage('modify_program.html');
            } else if (typeof window.loadPage === 'function') {
                window.loadPage('modify_program.html');
            }
        }, [program.id]);
        
        const handleStartNow = React.useCallback(async () => {
            if (isExecuting) return;
            
            setIsExecuting(true);
            try {
                const response = await (window.IrrigationAPI?.startProgram
                    ? window.IrrigationAPI.startProgram(program.id)
                    : fetch('/start_program', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ program_id: program.id })
                    }).then(res => res.json()));
                
                if (response.success) {
                    if (window.IrrigationUI?.showToast) {
                        window.IrrigationUI.showToast('Programma avviato', 'success');
                    }
                }
            } catch (error) {
                console.error('Errore avvio programma:', error);
                if (window.IrrigationUI?.showToast) {
                    window.IrrigationUI.showToast('Errore avvio programma', 'error');
                }
            } finally {
                setIsExecuting(false);
            }
        }, [program.id, isExecuting]);
        
        return React.createElement("div", { className: "rounded-lg border p-4" },
            React.createElement("div", { className: "flex justify-between items-start mb-4" },
                React.createElement("div", {},
                    React.createElement("h3", { className: "font-medium text-gray-800" }, program.name),
                    React.createElement("p", { className: "text-sm text-gray-500 mt-1" },
                        `${program.frequency} • Prossima: `,
                        React.createElement("span", { className: "font-medium" }, program.nextRun)
                    )
                ),
                React.createElement("div", { className: "flex items-center" },
                    React.createElement("label", { className: "relative inline-flex items-center cursor-pointer" },
                        React.createElement("input", { 
                            type: "checkbox", 
                            className: "sr-only peer", 
                            checked: program.active, 
                            readOnly: true
                        }),
                        React.createElement("div", { 
                            className: "w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-500"
                        })
                    )
                )
            ),
            
            React.createElement("div", { className: "mb-4" },
                React.createElement("h4", { className: "text-xs uppercase text-gray-500 mb-2" }, "Mesi Attivi"),
                React.createElement("div", { className: "flex flex-wrap gap-1" },
                    ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'].map(month => 
                        React.createElement("span", { 
                            key: month, 
                            className: `text-xs px-2 py-1 rounded-md ${
                                program.activeMonths?.includes(month)
                                    ? 'bg-blue-100 text-blue-800 border border-blue-300'
                                    : 'bg-gray-100 text-gray-500 border border-gray-200'
                            }`
                        }, month)
                    )
                )
            ),
            
            React.createElement("div", {},
                React.createElement("h4", { className: "text-xs uppercase text-gray-500 mb-2" }, "Zone Programmate"),
                React.createElement("div", { className: "space-y-2" },
                    program.zones?.map(pz => {
                        const zoneInfo = zones.find(z => z.id === pz.id);
                        return React.createElement("div", { 
                            key: pz.id, 
                            className: "flex justify-between items-center p-2 bg-gray-50 rounded-md"
                        },
                            React.createElement("span", { className: "text-sm font-medium text-gray-700" }, zoneInfo?.name),
                            React.createElement("span", { className: "text-xs bg-gray-200 px-2 py-1 rounded text-gray-600" }, `${pz.duration} min`)
                        );
                    })
                )
            ),
            
            React.createElement("div", { className: "grid grid-cols-2 gap-2 mt-4" },
                React.createElement("button", { 
                    className: "py-2 px-3 text-xs font-medium rounded-md bg-white border border-blue-500 text-blue-500 hover:bg-blue-50",
                    onClick: handleEdit
                }, "Modifica"),
                React.createElement("button", { 
                    className: `py-2 px-3 text-xs font-medium rounded-md bg-white border border-green-500 text-green-500 hover:bg-green-50 ${isExecuting ? 'opacity-50 cursor-not-allowed' : ''}`,
                    onClick: handleStartNow,
                    disabled: isExecuting
                }, isExecuting ? "Avvio..." : "Avvia Ora")
            )
        );
    }

    // Componente principale Dashboard
    function IrrigationDashboard() {
        const [activeTab, setActiveTab] = React.useState('overview');
        const [systemStatus, setSystemStatus] = React.useState({
            operational: true,
            activeProgram: null,
            activeZone: null,
            nextPrograms: [],
            recentZones: [],
            programHistory: []
        });
        
        const [zones, setZones] = React.useState([
            { id: 1, name: 'Giardino Davanti', active: false, duration: 10, remainingTime: 0 },
            { id: 2, name: 'Aiuole Laterali', active: false, duration: 5, remainingTime: 0 },
            { id: 3, name: 'Prato Posteriore', active: true, duration: 15, remainingTime: 8 },
            { id: 4, name: 'Orto', active: false, duration: 20, remainingTime: 0 },
            { id: 5, name: 'Serra', active: false, duration: 7, remainingTime: 0 },
            { id: 6, name: 'Aiuola Roseto', active: false, duration: 5, remainingTime: 0 }
        ]);
        
        const [programs, setPrograms] = React.useState([
            { 
                id: 1, 
                name: 'Irrigazione Mattutina',
                active: true,
                nextRun: '06:30',
                frequency: 'Giornaliero',
                activeMonths: ['Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set'],
                zones: [
                    { id: 1, duration: 10 },
                    { id: 2, duration: 5 },
                    { id: 5, duration: 8 }
                ]
            },
            { 
                id: 2, 
                name: 'Irrigazione Serale',
                active: true,
                nextRun: '19:00',
                frequency: 'Giorni Alterni',
                activeMonths: ['Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set'],
                zones: [
                    { id: 1, duration: 8 },
                    { id: 3, duration: 15 },
                    { id: 4, duration: 10 }
                ]
            }
        ]);
        
        const [loadingError, setLoadingError] = React.useState(null);

        // Fetch data iniziale
        React.useEffect(() => {
            // Carica i dati reali dal sistema utilizzando le API esistenti
            const fetchData = async () => {
                try {
                    // Carica dati delle zone
                    const zoneData = await (window.IrrigationAPI?.loadUserSettings 
                        ? window.IrrigationAPI.loadUserSettings()
                        : fetch('/data/user_settings.json').then(res => res.json()));
                        
                    // Carica dati dei programmi
                    const programData = await (window.IrrigationAPI?.loadPrograms 
                        ? window.IrrigationAPI.loadPrograms()
                        : fetch('/data/program.json').then(res => res.json()));
                        
                    // Carica stato del sistema
                    const stateData = await (window.IrrigationAPI?.getProgramState 
                        ? window.IrrigationAPI.getProgramState()
                        : fetch('/get_program_state').then(res => res.json()));
                    
                    // Formatta i dati delle zone
                    if (zoneData && zoneData.zones) {
                        const formattedZones = zoneData.zones
                            .filter(zone => zone && zone.status === 'show')
                            .map(zone => ({
                                id: zone.id,
                                name: zone.name || `Zona ${zone.id + 1}`,
                                active: false, // Verrà aggiornato dallo stato 
                                duration: 10,
                                remainingTime: 0
                            }));
                            
                        setZones(formattedZones);
                    }
                    
                    // Formatta i dati dei programmi
                    if (programData) {
                        const formattedPrograms = Object.entries(programData)
                            .map(([id, prog]) => {
                                // Converti i mesi in formato abbreviato
                                const months = prog.months || [];
                                const monthAbbr = months.map(month => {
                                    const monthMap = {
                                        'Gennaio': 'Gen', 'Febbraio': 'Feb', 'Marzo': 'Mar',
                                        'Aprile': 'Apr', 'Maggio': 'Mag', 'Giugno': 'Giu',
                                        'Luglio': 'Lug', 'Agosto': 'Ago', 'Settembre': 'Set',
                                        'Ottobre': 'Ott', 'Novembre': 'Nov', 'Dicembre': 'Dic'
                                    };
                                    return monthMap[month] || month.substr(0, 3);
                                });
                                
                                // Formatta le zone
                                const programZones = (prog.steps || []).map(step => ({
                                    id: step.zone_id,
                                    duration: step.duration || 10
                                }));
                                
                                // Determina la frequenza in formato leggibile
                                let frequency = 'Giornaliero';
                                if (prog.recurrence === 'giorni_alterni') {
                                    frequency = 'Giorni Alterni';
                                } else if (prog.recurrence === 'personalizzata' && prog.interval_days) {
                                    frequency = `Ogni ${prog.interval_days} giorni`;
                                }
                                
                                return {
                                    id: id,
                                    name: prog.name || `Programma ${id}`,
                                    active: prog.automatic_enabled !== false,
                                    nextRun: prog.activation_time || '00:00',
                                    frequency: frequency,
                                    activeMonths: monthAbbr,
                                    zones: programZones
                                };
                            });
                            
                        setPrograms(formattedPrograms);
                    }
                    
                    // Aggiorna lo stato del sistema
                    if (stateData) {
                        setSystemStatus({
                            operational: true,
                            activeProgram: stateData.program_running ? 
                                programData[stateData.current_program_id] : null,
                            activeZone: stateData.active_zone || null,
                            nextPrograms: [],
                            recentZones: [],
                            programHistory: []
                        });
                        
                        // Aggiorna lo stato delle zone
                        if (stateData.program_running && stateData.active_zone) {
                            setZones(prevZones => 
                                prevZones.map(zone => ({
                                    ...zone,
                                    active: zone.id === stateData.active_zone.id,
                                    remainingTime: zone.id === stateData.active_zone.id ? 
                                        stateData.active_zone.remaining_time : 0
                                }))
                            );
                        }
                    }
                    
                    setLoadingError(null);
                } catch (error) {
                    console.error('Errore nel recupero dati:', error);
                    setLoadingError(error.message);
                    // Mostra errore utilizzando il sistema di toast esistente
                    if (window.IrrigationUI?.showToast) {
                        window.IrrigationUI.showToast('Errore nel caricamento dei dati', 'error');
                    } else if (typeof window.showToast === 'function') {
                        window.showToast('Errore nel caricamento dei dati', 'error');
                    }
                }
            };
            
            fetchData();
            
            // Registra listener per gli aggiornamenti di stato
            const handleStatusChange = (e) => {
                if (e && e.detail) {
                    const state = e.detail;
                    // Aggiorna lo stato con i nuovi dati
                    setSystemStatus(prevStatus => ({
                        ...prevStatus,
                        activeProgram: state.program_running ? {
                            name: state.current_program_name || 'Programma in corso'
                        } : null,
                        activeZone: state.active_zone || null
                    }));
                    
                    // Aggiorna lo stato delle zone
                    if (state.program_running && state.active_zone) {
                        setZones(prevZones => 
                            prevZones.map(zone => ({
                                ...zone,
                                active: zone.id === state.active_zone.id,
                                remainingTime: zone.id === state.active_zone.id ? 
                                    state.active_zone.remaining_time : 0
                            }))
                        );
                    } else {
                        // Azzera lo stato attivo di tutte le zone
                        setZones(prevZones => 
                            prevZones.map(zone => ({
                                ...zone,
                                active: false,
                                remainingTime: 0
                            }))
                        );
                    }
                }
            };
            
            document.addEventListener('programStatusChanged', handleStatusChange);
            
            // Timer di aggiornamento per simulare lo scorrimento del tempo
            const timer = setInterval(() => {
                setZones(prevZones => {
                    return prevZones.map(zone => {
                        if (zone.active && zone.remainingTime > 0) {
                            return { ...zone, remainingTime: Math.max(0, zone.remainingTime - (1/60)) }; // Decrementa di 1 secondo
                        }
                        return zone;
                    });
                });
            }, 1000);
            
            return () => {
                document.removeEventListener('programStatusChanged', handleStatusChange);
                clearInterval(timer);
            };
        }, []);

        // Gestione errori di caricamento
        if (loadingError) {
            return React.createElement("div", { className: "flex flex-col h-full items-center justify-center p-8" },
                React.createElement("div", { className: "text-center" },
                    React.createElement("h2", { className: "text-xl font-semibold text-red-600 mb-2" }, "Errore di caricamento"),
                    React.createElement("p", { className: "text-gray-600 mb-4" }, loadingError),
                    React.createElement("button", { 
                        className: "px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600",
                        onClick: () => window.location.reload()
                    }, "Ricarica")
                )
            );
        }

        return React.createElement("div", { className: "flex flex-col h-full" },
            // Header con statistiche generali
            React.createElement("div", { className: "bg-white shadow rounded-xl p-4 mb-6" },
                React.createElement("div", { className: "grid grid-cols-1 md:grid-cols-4 gap-4" },
                    React.createElement(SystemStatusCard, { 
                        title: "Stato Sistema", 
                        status: systemStatus.operational ? 'Operativo' : 'Non Attivo', 
                        isActive: systemStatus.operational,
                        icon: React.createElement("svg", { className: "h-5 w-5", viewBox: "0 0 24 24", fill: "currentColor" },
                            React.createElement("path", { d: "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" })
                        )
                    }),
                    React.createElement(SystemStatusCard, { 
                        title: "Zona Attiva", 
                        status: zones.find(z => z.active)?.name || 'Nessuna', 
                        isActive: zones.some(z => z.active),
                        icon: React.createElement("svg", { className: "h-5 w-5", viewBox: "0 0 24 24", fill: "currentColor" },
                            React.createElement("path", { d: "M12,20A6,6 0 0,1 6,14C6,10 12,3.25 12,3.25C12,3.25 18,10 18,14A6,6 0 0,1 12,20Z" })
                        )
                    }),
                    React.createElement(SystemStatusCard, { 
                        title: "Programma Attivo", 
                        status: systemStatus.activeProgram?.name || 'Nessuno', 
                        isActive: systemStatus.activeProgram !== null,
                        icon: React.createElement("svg", { className: "h-5 w-5", viewBox: "0 0 24 24", fill: "currentColor" },
                            React.createElement("path", { d: "M12,20A8,8 0 0,0 20,12A8,8 0 0,0 12,4A8,8 0 0,0 4,12A8,8 0 0,0 12,20M12,2A10,10 0 0,1 22,12A10,10 0 0,1 12,22C6.47,22 2,17.5 2,12A10,10 0 0,1 12,2M12.5,7V12.25L17,14.92L16.25,16.15L11,13V7H12.5Z" })
                        )
                    }),
                    React.createElement(SystemStatusCard, { 
                        title: "Prossimo Programma", 
                        status: programs[0]?.nextRun || '--:--', 
                        subtext: programs[0]?.name || 'Nessuno',
                        icon: React.createElement("svg", { className: "h-5 w-5", viewBox: "0 0 24 24", fill: "currentColor" },
                            React.createElement("path", { d: "M19,19H5V8H19M16,1V3H8V1H6V3H5C3.89,3 3,3.89 3,5V19A2,2 0 0,0 5,21H19A2,2 0 0,0 21,19V5C21,3.89 20.1,3 19,3H18V1" })
                        )
                    })
                )
            ),
            
            // Tabs 
            React.createElement("div", { className: "bg-white shadow rounded-xl overflow-hidden mb-6" },
                React.createElement("div", { className: "flex border-b" },
                    React.createElement(TabButton, { 
                        active: activeTab === 'overview', 
                        onClick: () => setActiveTab('overview'),
                        icon: React.createElement("svg", { className: "h-4 w-4", viewBox: "0 0 24 24", fill: "currentColor" },
                            React.createElement("path", { d: "M3,14L3.5,14.07L8.07,9.5C7.89,8.85 8.06,8.11 8.59,7.59C9.37,6.8 10.63,6.8 11.41,7.59C11.94,8.11 12.11,8.85 11.93,9.5L14.5,12.07L15,12C15.18,12 15.35,12 15.5,12.07L19.07,8.5C19,8.35 19,8.18 19,8A2,2 0 0,1 21,6A2,2 0 0,1 23,8A2,2 0 0,1 21,10C20.82,10 20.65,10 20.5,9.93L16.93,13.5C17,13.65 17,13.82 17,14A2,2 0 0,1 15,16A2,2 0 0,1 13,14L13.07,13.5L10.5,10.93C10.18,11 9.82,11 9.5,10.93L4.93,15.5L5,16A2,2 0 0,1 3,18A2,2 0 0,1 1,16A2,2 0 0,1 3,14Z" })
                        ),
                        label: "Panoramica"
                    }),
                    React.createElement(TabButton, { 
                        active: activeTab === 'zones', 
                        onClick: () => setActiveTab('zones'),
                        icon: React.createElement("svg", { className: "h-4 w-4", viewBox: "0 0 24 24", fill: "currentColor" },
                            React.createElement("path", { d: "M12,20A8,8 0 0,1 4,12A8,8 0 0,1 12,4A8,8 0 0,1 20,12A8,8 0 0,1 12,20M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M12,12.5A1.5,1.5 0 0,1 10.5,11A1.5,1.5 0 0,1 12,9.5A1.5,1.5 0 0,1 13.5,11A1.5,1.5 0 0,1 12,12.5M12,7.2C9.9,7.2 8.2,8.9 8.2,11C8.2,14 12,17.5 12,17.5C12,17.5 15.8,14 15.8,11C15.8,8.9 14.1,7.2 12,7.2Z" })
                        ),
                        label: "Zone"
                    }),
                    React.createElement(TabButton, { 
                        active: activeTab === 'programs', 
                        onClick: () => setActiveTab('programs'),
                        icon: React.createElement("svg", { className: "h-4 w-4", viewBox: "0 0 24 24", fill: "currentColor" },
                            React.createElement("path", { d: "M12,20A8,8 0 0,0 20,12A8,8 0 0,0 12,4A8,8 0 0,0 4,12A8,8 0 0,0 12,20M12,2A10,10 0 0,1 22,12A10,10 0 0,1 12,22C6.47,22 2,17.5 2,12A10,10 0 0,1 12,2M12.5,7V12.25L17,14.92L16.25,16.15L11,13V7H12.5Z" })
                        ),
                        label: "Programmi"
                    })
                ),
                
                React.createElement("div", { className: "p-4" },
                    activeTab === 'overview' && React.createElement("div", { className: "space-y-6" },
                        React.createElement("h3", { className: "text-lg font-semibold text-gray-800" }, "Stato Zone"),
                        React.createElement("div", { className: "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" },
                            zones.map(zone => React.createElement(ZoneCard, { key: zone.id, zone: zone }))
                        )
                    ),
                    
                    activeTab === 'zones' && React.createElement("div", { className: "space-y-6" },
                        React.createElement("h3", { className: "text-lg font-semibold text-gray-800" }, "Gestione Zone"),
                        React.createElement("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-4" },
                            zones.map(zone => React.createElement(ZoneControlCard, { key: zone.id, zone: zone }))
                        )
                    ),
                    
                    activeTab === 'programs' && React.createElement("div", { className: "space-y-6" },
                        React.createElement("h3", { className: "text-lg font-semibold text-gray-800" }, "Programmi Configurati"),
                        React.createElement("div", { className: "grid grid-cols-1 gap-4" },
                            programs.map(program => React.createElement(ProgramCard, { key: program.id, program: program, zones: zones }))
                        ),
                        React.createElement("div", { className: "text-center mt-4" },
                            React.createElement("button", {
                                className: "py-2 px-6 bg-blue-500 hover:bg-blue-600 text-white rounded-md shadow transition",
                                onClick: () => {
                                    // Integrazione con il router esistente per creare un nuovo programma
                                    if (window.IrrigationRouter?.loadPage) {
                                        window.IrrigationRouter.loadPage('create_program.html');
                                    } else if (typeof window.loadPage === 'function') {
                                        window.loadPage('create_program.html');
                                    }
                                }
                            }, "Crea Nuovo Programma")
                        )
                    )
                )
            ),
            
            // Timeline dei programmi futuri
            React.createElement("div", { className: "bg-white shadow rounded-xl p-4" },
                React.createElement("h3", { className: "text-lg font-semibold text-gray-800 mb-4" }, "Pianificazione Giornaliera"),
                React.createElement("div", { className: "relative h-16" },
                    React.createElement("div", { className: "absolute inset-0 bg-gray-100 rounded-md" }),
                    
                    // Timeline markers
                    Array.from({length: 24}).map((_, i) => 
                        React.createElement("div", { 
                            key: i, 
                            className: "absolute top-0 bottom-0", 
                            style: {left: `${i * (100/24)}%`}
                        },
                            React.createElement("div", { className: "h-full w-px bg-gray-300" }),
                            React.createElement("div", { 
                                className: "absolute -bottom-6 text-xs text-gray-500", 
                                style: {transform: 'translateX(-50%)'}
                            }, `${i}:00`)
                        )
                    ),
                    
                    // Current time indicator
                    React.createElement("div", { 
                        className: "absolute top-0 bottom-0 w-px bg-red-500 z-10", 
                        style: {left: `${(new Date().getHours() + new Date().getMinutes()/60) * (100/24)}%`}
                    },
                        React.createElement("div", { className: "absolute -top-1 -translate-x-1/2" },
                            React.createElement("div", { className: "h-3 w-3 rounded-full bg-red-500" })
                        ),
                        React.createElement("div", { 
                            className: "absolute -bottom-6 text-xs font-semibold text-red-500", 
                            style: {transform: 'translateX(-50%)'}
                        }, "Ora")
                    ),
                    
                    // Program indicators
                    programs.map((program, idx) => {
                        // Converti l'orario in percentuale
                        const [hours, minutes] = program.nextRun.split(':').map(Number);
                        const timePosition = (hours + minutes/60) * (100/24);
                        const duration = program.zones?.reduce((sum, z) => sum + z.duration, 0) || 0;
                        const durationWidth = (duration / 60) * (100/24); // Converte i minuti in percentuale della giornata
                        
                        return React.createElement("div", { 
                            key: idx,
                            className: `absolute top-2 h-12 rounded-md ${idx % 2 === 0 ? 'bg-blue-500' : 'bg-indigo-500'} opacity-80 z-5`,
                            style: {left: `${timePosition}%`, width: `${Math.max(4, durationWidth)}%`}
                        },
                            React.createElement("div", { className: "px-2 text-xs text-white truncate h-full flex items-center" },
                                program.name
                            )
                        );
                    })
                )
            )
        );
    }

    // Esporta il componente come global
    window.IrrigationDashboard = IrrigationDashboard;
})(window, document);