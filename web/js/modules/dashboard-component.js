// dashboard-component.js - Modern React Dashboard Component

// Global imports
const { useState, useEffect } = React;

// Dashboard Component Registration
// This will register the ModernDashboard component globally
(function registerDashboardComponent() {
  // Check if React is available
  if (typeof React === 'undefined') {
    console.error('React non disponibile per il componente dashboard');
    return;
  }

  // Status Card Component
  function StatusCard({ title, value, icon, status = 'neutral', subtitle = null }) {
    const getStatusColor = () => {
      switch (status) {
        case 'active': return 'bg-green-100 text-green-800 border-green-300';
        case 'warning': return 'bg-yellow-100 text-yellow-800 border-yellow-300';
        case 'error': return 'bg-red-100 text-red-800 border-red-300';
        default: return 'bg-blue-100 text-blue-800 border-blue-300';
      }
    };

    return React.createElement(
      'div',
      { className: `p-4 rounded-lg border ${getStatusColor()} shadow-sm` },
      React.createElement(
        'div',
        { className: 'flex justify-between items-center mb-2' },
        React.createElement('h3', { className: 'text-sm font-medium opacity-80' }, title),
        React.createElement('div', { className: 'p-2 rounded-full bg-white bg-opacity-50' }, icon)
      ),
      React.createElement('p', { className: 'text-xl font-semibold' }, value),
      subtitle && React.createElement('p', { className: 'text-xs mt-1 opacity-75' }, subtitle)
    );
  }

  // Zone Card Component
  function ZoneCard({ zone, onActivate }) {
    const [duration, setDuration] = useState(zone.duration || 10);

    // Format time function
    const formatTime = (minutes) => {
      if (minutes === undefined || minutes === null) return '--:--';
      const mins = Math.floor(minutes);
      const secs = Math.round((minutes - mins) * 60);
      return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    return React.createElement(
      'div',
      { className: `p-4 rounded-lg border ${zone.active ? 'border-green-500 bg-green-50' : 'border-gray-200'}` },
      React.createElement(
        'div',
        { className: 'flex items-center justify-between mb-3' },
        React.createElement('h3', { className: 'font-medium' }, zone.name),
        React.createElement(
          'span',
          { className: `text-xs rounded-full px-2 py-0.5 ${zone.active ? 'bg-green-100 text-green-800' : 'bg-gray-200'}` },
          zone.active ? 'ATTIVA' : 'INATTIVA'
        )
      ),
      zone.active ?
        React.createElement(
          'div',
          { className: 'mt-2' },
          React.createElement(
            'div',
            { className: 'flex justify-between text-xs mb-1' },
            React.createElement('span', { className: 'text-gray-500' }, 'Tempo rimanente:'),
            React.createElement('span', { className: 'font-medium' }, `${formatTime(zone.remainingTime)} min`)
          ),
          React.createElement(
            'div',
            { className: 'h-2 bg-gray-200 rounded-full overflow-hidden' },
            React.createElement('div', {
              className: 'h-full bg-green-500 rounded-full transition-all',
              style: { width: `${zone.remainingTime && zone.duration ? (zone.remainingTime / zone.duration) * 100 : 0}%` }
            })
          ),
          React.createElement(
            'button',
            {
              onClick: () => onActivate(zone.id, 0),
              className: 'mt-3 w-full py-1.5 text-sm bg-red-500 text-white rounded-md hover:bg-red-600 transition-colors'
            },
            'Disattiva'
          )
        ) :
        React.createElement(
          'div',
          { className: 'mt-3' },
          React.createElement(
            'div',
            { className: 'flex items-center justify-between mb-2' },
            React.createElement('span', { className: 'text-xs text-gray-500' }, 'Durata:'),
            React.createElement(
              'div',
              { className: 'flex items-center' },
              React.createElement(
                'button',
                {
                  className: 'w-6 h-6 flex items-center justify-center rounded bg-gray-200 text-gray-700',
                  onClick: () => setDuration(Math.max(1, duration - 1))
                },
                '-'
              ),
              React.createElement('span', { className: 'mx-2 text-sm font-medium' }, `${duration} min`),
              React.createElement(
                'button',
                {
                  className: 'w-6 h-6 flex items-center justify-center rounded bg-gray-200 text-gray-700',
                  onClick: () => setDuration(Math.min(180, duration + 1))
                },
                '+'
              )
            )
          ),
          React.createElement(
            'button',
            {
              onClick: () => onActivate(zone.id, duration),
              className: 'w-full py-1.5 text-sm bg-green-500 text-white rounded-md hover:bg-green-600 transition-colors'
            },
            'Attiva'
          )
        )
    );
  }

  // Program Card Component
  function ProgramCard({ program, onStart, onEdit }) {
    const recurrenceMap = {
      'giornaliero': 'Ogni giorno',
      'giorni_alterni': 'Giorni alterni',
      'personalizzata': program.interval_days ? `Ogni ${program.interval_days} giorni` : 'Personalizzata'
    };

    const getMonthsText = (months) => {
      if (!months || !months.length) return 'Nessun mese selezionato';
      if (months.length > 3) return `${months.length} mesi attivi`;
      return months.join(', ');
    };

    const getZoneText = (steps) => {
      if (!steps || !steps.length) return 'Nessuna zona impostata';
      return `${steps.length} zone programmate`;
    };

    return React.createElement(
      'div',
      { className: 'p-4 border rounded-lg shadow-sm hover:shadow-md transition-all' },
      React.createElement(
        'div',
        { className: 'flex justify-between items-start mb-2' },
        React.createElement('h3', { className: 'font-medium text-gray-800' }, program.name),
        React.createElement(
          'span',
          { className: `text-xs px-1.5 py-0.5 rounded-full ${program.automatic_enabled !== false ? 'bg-green-100 text-green-800' : 'bg-gray-200 text-gray-700'}` },
          program.automatic_enabled !== false ? 'Auto' : 'Manual'
        )
      ),
      React.createElement(
        'div',
        { className: 'text-xs text-gray-500 space-y-1 mb-3' },
        React.createElement(
          'div',
          { className: 'flex justify-between' },
          React.createElement('span', null, 'Orario:'),
          React.createElement('span', { className: 'font-medium text-gray-700' }, program.activation_time || '--:--')
        ),
        React.createElement(
          'div',
          { className: 'flex justify-between' },
          React.createElement('span', null, 'Frequenza:'),
          React.createElement('span', { className: 'font-medium text-gray-700' }, recurrenceMap[program.recurrence] || program.recurrence)
        ),
        React.createElement(
          'div',
          { className: 'flex justify-between' },
          React.createElement('span', null, 'Mesi:'),
          React.createElement('span', { className: 'font-medium text-gray-700' }, getMonthsText(program.months))
        ),
        React.createElement(
          'div',
          { className: 'flex justify-between' },
          React.createElement('span', null, 'Zone:'),
          React.createElement('span', { className: 'font-medium text-gray-700' }, getZoneText(program.steps))
        )
      ),
      React.createElement(
        'div',
        { className: 'flex gap-2 mt-3' },
        React.createElement(
          'button',
          {
            onClick: () => onStart(program.id),
            className: 'flex-1 py-1.5 text-xs bg-green-500 text-white rounded hover:bg-green-600 transition-colors'
          },
          'Avvia'
        ),
        React.createElement(
          'button',
          {
            onClick: () => onEdit(program.id),
            className: 'flex-1 py-1.5 text-xs bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors'
          },
          'Modifica'
        )
      )
    );
  }

  // Log Item Component
  function LogItem({ time, date, message, level }) {
    const getLevelColor = () => {
      switch (level) {
        case 'ERROR': return 'text-red-600';
        case 'WARNING': return 'text-yellow-600';
        case 'INFO': return 'text-blue-600';
        default: return 'text-gray-600';
      }
    };

    return React.createElement(
      'div',
      { className: 'flex items-center py-2 border-b border-gray-100 last:border-0 text-sm' },
      React.createElement('span', { className: 'text-xs text-gray-500 w-24 flex-shrink-0' }, `${date} ${time}`),
      React.createElement('span', { className: `${getLevelColor()} mr-2 text-xs px-1.5 rounded-full bg-gray-100` }, level),
      React.createElement('span', { className: 'text-gray-800 truncate' }, message)
    );
  }

  // Main Dashboard Component
  function IrrigationDashboard() {
    // States
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    const [systemStatus, setSystemStatus] = useState({
      programRunning: false,
      activeProgram: null,
      activeZone: null
    });
    const [zones, setZones] = useState([]);
    const [programs, setPrograms] = useState([]);
    const [logs, setLogs] = useState([]);
    const [activeTab, setActiveTab] = useState('overview');

    // Fetch data
    useEffect(() => {
      const fetchData = async () => {
        try {
          setIsLoading(true);
          setError(null);
          
          // Fetch settings, program status, and logs in parallel
          const [settingsData, programState, logData, programsData] = await Promise.all([
            // User settings (for zones)
            fetch('/data/user_settings.json').then(res => res.json()),
            // Program state
            fetch('/get_program_state').then(res => res.json()),
            // System logs
            fetch('/data/system_log.json').then(res => res.json()),
            // Programs
            fetch('/data/program.json').then(res => res.json())
          ]);
          
          // Process zones from settings
          if (settingsData && settingsData.zones) {
            const zoneData = settingsData.zones
              .filter(zone => zone && zone.status === 'show')
              .map(zone => ({
                id: zone.id,
                name: zone.name || `Zona ${zone.id + 1}`,
                active: false,
                duration: 10,
                remainingTime: 0
              }));
            
            // Update active zones from program state
            if (programState && programState.active_zone) {
              zoneData.forEach(zone => {
                if (zone.id === programState.active_zone.id) {
                  zone.active = true;
                  zone.remainingTime = programState.active_zone.remaining_time 
                    ? programState.active_zone.remaining_time / 60 
                    : 0; // Convert to minutes
                }
              });
            }
            
            setZones(zoneData);
          }
          
          // Process system status
          setSystemStatus({
            programRunning: programState?.program_running || false,
            activeProgram: programState?.current_program_id,
            activeZone: programState?.active_zone
          });
          
          // Process programs
          if (programsData) {
            const programsList = Object.entries(programsData).map(([id, program]) => ({
              id,
              ...program
            }));
            setPrograms(programsList);
          }
          
          // Process logs
          if (logData && Array.isArray(logData)) {
            // Get last 5 logs
            setLogs(logData.slice(-5).reverse());
          }
          
          setIsLoading(false);
        } catch (err) {
          console.error("Error loading dashboard data:", err);
          setError("Errore nel caricamento dei dati. Riprova.");
          setIsLoading(false);
        }
      };
      
      fetchData();
      
      // Setup periodic refresh (every 5 seconds)
      const refreshInterval = setInterval(() => {
        fetchData();
      }, 5000);
      
      return () => clearInterval(refreshInterval);
    }, []);

    // Actions
    const handleActivateZone = async (zoneId, duration) => {
      try {
        if (duration > 0) {
          // Activate zone
          await fetch('/start_zone', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ zone_id: zoneId, duration: duration })
          });
        } else {
          // Deactivate zone
          await fetch('/stop_zone', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ zone_id: zoneId })
          });
        }
        
        // Immediate refresh
        fetch('/get_program_state')
          .then(res => res.json())
          .then(state => {
            setSystemStatus({
              programRunning: state?.program_running || false,
              activeProgram: state?.current_program_id,
              activeZone: state?.active_zone
            });
            
            // Update zones with active status
            setZones(prevZones => prevZones.map(zone => ({
              ...zone,
              active: state.active_zone && zone.id === state.active_zone.id,
              remainingTime: state.active_zone && zone.id === state.active_zone.id
                ? state.active_zone.remaining_time / 60 
                : 0
            })));
          });
      } catch (err) {
        console.error("Error activating/deactivating zone:", err);
        // Show error notification
        if (window.IrrigationUI?.showToast) {
          window.IrrigationUI.showToast('Errore nell\'attivazione/disattivazione della zona', 'error');
        }
      }
    };

    const handleStartProgram = async (programId) => {
      try {
        await fetch('/start_program', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ program_id: programId })
        });
        
        // Show success notification
        if (window.IrrigationUI?.showToast) {
          window.IrrigationUI.showToast('Programma avviato con successo', 'success');
        }
        
        // Immediate refresh
        fetch('/get_program_state')
          .then(res => res.json())
          .then(state => {
            setSystemStatus({
              programRunning: state?.program_running || false,
              activeProgram: state?.current_program_id,
              activeZone: state?.active_zone
            });
          });
      } catch (err) {
        console.error("Error starting program:", err);
        // Show error notification
        if (window.IrrigationUI?.showToast) {
          window.IrrigationUI.showToast('Errore nell\'avvio del programma', 'error');
        }
      }
    };

    const handleEditProgram = (programId) => {
      // Store program ID in localStorage for edit page
      try {
        localStorage.setItem('editProgramId', programId);
      } catch (e) {
        console.warn("Error storing program ID in localStorage:", e);
      }
      
      // Navigate to edit page
      if (window.IrrigationRouter?.loadPage) {
        window.IrrigationRouter.loadPage('modify_program.html');
      } else if (typeof window.loadPage === 'function') {
        window.loadPage('modify_program.html');
      }
    };

    const handleStopProgram = async () => {
      try {
        await fetch('/stop_program', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        });
        
        // Show success notification
        if (window.IrrigationUI?.showToast) {
          window.IrrigationUI.showToast('Programma arrestato con successo', 'success');
        }
        
        // Immediate refresh
        fetch('/get_program_state')
          .then(res => res.json())
          .then(state => {
            setSystemStatus({
              programRunning: state?.program_running || false,
              activeProgram: state?.current_program_id,
              activeZone: state?.active_zone
            });
            
            // Update all zones to inactive
            setZones(prevZones => prevZones.map(zone => ({
              ...zone,
              active: false,
              remainingTime: 0
            })));
          });
      } catch (err) {
        console.error("Error stopping program:", err);
        // Show error notification
        if (window.IrrigationUI?.showToast) {
          window.IrrigationUI.showToast('Errore nell\'arresto del programma', 'error');
        }
      }
    };

    // Loading state
    if (isLoading && !zones.length) {
      return React.createElement(
        'div',
        { className: 'flex items-center justify-center h-64' },
        React.createElement(
          'div',
          { className: 'text-center' },
          React.createElement('div', {
            className: 'inline-block w-8 h-8 border-4 border-t-blue-500 border-blue-200 rounded-full animate-spin mb-4'
          }),
          React.createElement('p', { className: 'text-gray-600' }, 'Caricamento dashboard...')
        )
      );
    }

    // Error state
    if (error) {
      return React.createElement(
        'div',
        { className: 'flex items-center justify-center h-64' },
        React.createElement(
          'div',
          { className: 'text-center p-6 bg-red-50 rounded-lg border border-red-200' },
          React.createElement(
            'svg',
            { className: 'w-12 h-12 text-red-500 mx-auto mb-4', viewBox: '0 0 24 24', fill: 'currentColor' },
            React.createElement('path', { d: 'M13,14H11V10H13M13,18H11V16H13M1,21H23L12,2L1,21Z' })
          ),
          React.createElement('h3', { className: 'text-lg font-medium text-red-800 mb-2' }, 'Errore di caricamento'),
          React.createElement('p', { className: 'text-red-600 mb-4' }, error),
          React.createElement(
            'button',
            {
              className: 'px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700',
              onClick: () => window.location.reload()
            },
            'Riprova'
          )
        )
      );
    }

    // Main dashboard content
    return React.createElement(
      'div',
      { className: 'space-y-6' },
      
      // Status Cards
      React.createElement(
        'div',
        { className: 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4' },
        React.createElement(StatusCard, {
          title: 'Stato Sistema',
          value: 'Operativo',
          status: systemStatus.programRunning ? 'active' : 'neutral',
          icon: React.createElement(
            'svg',
            { className: 'w-5 h-5', viewBox: '0 0 24 24', fill: 'currentColor' },
            React.createElement('path', { d: 'M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M12,4A8,8 0 0,1 20,12A8,8 0 0,1 12,20A8,8 0 0,1 4,12A8,8 0 0,1 12,4M12,9A3,3 0 0,0 9,12A3,3 0 0,0 12,15A3,3 0 0,0 15,12A3,3 0 0,0 12,9Z' })
          )
        }),
        
        React.createElement(StatusCard, {
          title: 'Programma Attivo',
          value: systemStatus.programRunning ?
            (programs.find(p => p.id === systemStatus.activeProgram)?.name || 'Programma') :
            'Nessuno',
          status: systemStatus.programRunning ? 'active' : 'neutral',
          subtitle: systemStatus.programRunning ? 'In esecuzione' : null,
          icon: React.createElement(
            'svg',
            { className: 'w-5 h-5', viewBox: '0 0 24 24', fill: 'currentColor' },
            React.createElement('path', { d: 'M19,3H5C3.89,3 3,3.89 3,5V19A2,2 0 0,0 5,21H19A2,2 0 0,0 21,19V5C21,3.89 20.1,3 19,3M19,5V19H5V5H19Z' })
          )
        }),
        
        React.createElement(StatusCard, {
          title: 'Zona Attiva',
          value: systemStatus.activeZone ?
            systemStatus.activeZone.name || `Zona ${systemStatus.activeZone.id + 1}` :
            'Nessuna',
          status: systemStatus.activeZone ? 'active' : 'neutral',
          subtitle: systemStatus.activeZone ?
            `${Math.floor((systemStatus.activeZone.remaining_time || 0) / 60)}:${String(Math.floor((systemStatus.activeZone.remaining_time || 0) % 60)).padStart(2, '0')} rimasto` :
            null,
          icon: React.createElement(
            'svg',
            { className: 'w-5 h-5', viewBox: '0 0 24 24', fill: 'currentColor' },
            React.createElement('path', { d: 'M12,20A6,6 0 0,1 6,14C6,10 12,3.25 12,3.25C12,3.25 18,10 18,14A6,6 0 0,1 12,20Z' })
          )
        }),
        
        React.createElement(StatusCard, {
          title: 'Zone Attive',
          value: `${zones.filter(z => z.active).length} di ${zones.length}`,
          status: zones.some(z => z.active) ? 'active' : 'neutral',
          icon: React.createElement(
            'svg',
            { className: 'w-5 h-5', viewBox: '0 0 24 24', fill: 'currentColor' },
            React.createElement('path', { d: 'M12,3C7.58,3 4,4.79 4,7C4,9.21 7.58,11 12,11C16.42,11 20,9.21 20,7C20,4.79 16.42,3 12,3M4,9V12C4,14.21 7.58,16 12,16C16.42,16 20,14.21 20,12V9C20,11.21 16.42,13 12,13C7.58,13 4,11.21 4,9M4,14V17C4,19.21 7.58,21 12,21C16.42,21 20,19.21 20,17V14C20,16.21 16.42,18 12,18C7.58,18 4,16.21 4,14Z' })
          )
        })
      ),
      
      // Tabs
      React.createElement(
        'div',
        { className: 'bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden' },
        React.createElement(
          'div',
          { className: 'flex border-b border-gray-200' },
          React.createElement(
            'button',
            {
              className: `flex-1 py-3 text-sm font-medium ${activeTab === 'overview' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-600 hover:text-gray-800 hover:bg-gray-50'}`,
              onClick: () => setActiveTab('overview')
            },
            'Panoramica'
          ),
          React.createElement(
            'button',
            {
              className: `flex-1 py-3 text-sm font-medium ${activeTab === 'zones' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-600 hover:text-gray-800 hover:bg-gray-50'}`,
              onClick: () => setActiveTab('zones')
            },
            'Zone'
          ),
          React.createElement(
            'button',
            {
              className: `flex-1 py-3 text-sm font-medium ${activeTab === 'programs' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-600 hover:text-gray-800 hover:bg-gray-50'}`,
              onClick: () => setActiveTab('programs')
            },
            'Programmi'
          )
        ),
        
        React.createElement(
          'div',
          { className: 'p-4' },
          // Overview Tab
          activeTab === 'overview' && React.createElement(
            'div',
            { className: 'space-y-6' },
            // System Status Summary
            systemStatus.programRunning && React.createElement(
              'div',
              { className: 'bg-green-50 border border-green-200 rounded-lg p-4 animate-pulse' },
              React.createElement(
                'div',
                { className: 'flex justify-between items-center' },
                React.createElement(
                  'div',
                  null,
                  React.createElement(
                    'h3',
                    { className: 'font-medium text-green-800' },
                    `Programma in esecuzione: ${programs.find(p => p.id === systemStatus.activeProgram)?.name || 'Programma'}`
                  ),
                  systemStatus.activeZone && React.createElement(
                    'p',
                    { className: 'text-sm text-green-700 mt-1' },
                    `Zona attiva: ${systemStatus.activeZone.name || `Zona ${systemStatus.activeZone.id + 1}`}`,
                    systemStatus.activeZone.remaining_time && React.createElement(
                      'span',
                      { className: 'ml-1' },
                      `(${Math.floor(systemStatus.activeZone.remaining_time / 60)}:${String(Math.floor(systemStatus.activeZone.remaining_time % 60)).padStart(2, '0')} rimasto)`
                    )
                  )
                ),
                React.createElement(
                  'button',
                  {
                    onClick: handleStopProgram,
                    className: 'px-3 py-1.5 bg-red-500 text-white text-sm rounded hover:bg-red-600 transition-colors'
                  },
                  'Arresta'
                )
              )
            ),
            
            // Recent Logs
            React.createElement(
              'div',
              null,
              React.createElement('h3', { className: 'font-medium text-gray-800 mb-3' }, 'Attività recenti'),
              React.createElement(
                'div',
                { className: 'bg-white border border-gray-200 rounded-lg overflow-hidden' },
                logs.length > 0 ? React.createElement(
                  'div',
                  { className: 'divide-y divide-gray-100 max-h-60 overflow-y-auto' },
                  logs.map((log, index) => React.createElement(LogItem, {
                    key: index,
                    time: log.time,
                    date: log.date,
                    message: log.message,
                    level: log.level
                  }))
                ) : React.createElement('p', { className: 'text-gray-500 text-center py-4' }, 'Nessun log recente disponibile')
              )
            ),
            
            // Quick Actions
            React.createElement(
              'div',
              null,
              React.createElement('h3', { className: 'font-medium text-gray-800 mb-3' }, 'Azioni rapide'),
              React.createElement(
                'div',
                { className: 'grid grid-cols-2 sm:grid-cols-3 gap-3' },
                React.createElement(
                  'button',
                  {
                    onClick: () => window.IrrigationRouter?.loadPage?.('manual.html'),
                    className: 'p-3 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors'
                  },
                  'Attivazione Manuale'
                ),
                React.createElement(
                  'button',
                  {
                    onClick: () => window.IrrigationRouter?.loadPage?.('create_program.html'),
                    className: 'p-3 text-sm bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors'
                  },
                  'Nuovo Programma'
                ),
                React.createElement(
                  'button',
                  {
                    onClick: () => window.IrrigationRouter?.loadPage?.('logs.html'),
                    className: 'p-3 text-sm bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors'
                  },
                  'Log Completi'
                )
              )
            )
          ),
          
          // Zones Tab
          activeTab === 'zones' && React.createElement(
            'div',
            { className: 'space-y-4' },
            React.createElement(
              'div',
              { className: 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4' },
              zones.map(zone => React.createElement(ZoneCard, {
                key: zone.id,
                zone: zone,
                onActivate: handleActivateZone
              }))
            ),
            zones.length === 0 && React.createElement('p', { className: 'text-gray-500 text-center py-4' }, 'Nessuna zona configurata')
          ),
          
          // Programs Tab
          activeTab === 'programs' && React.createElement(
            'div',
            { className: 'space-y-4' },
            React.createElement(
              'div',
              { className: 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4' },
              programs.map(program => React.createElement(ProgramCard, {
                key: program.id,
                program: program,
                onStart: handleStartProgram,
                onEdit: handleEditProgram
              }))
            ),
            programs.length === 0 && React.createElement('p', { className: 'text-gray-500 text-center py-4' }, 'Nessun programma configurato'),
            React.createElement(
              'div',
              { className: 'flex justify-center mt-4' },
              React.createElement(
                'button',
                {
                  onClick: () => window.IrrigationRouter?.loadPage?.('create_program.html'),
                  className: 'px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors'
                },
                'Crea Nuovo Programma'
              )
            )
          )
        )
      ),
      
      // Daily Schedule
      React.createElement(
        'div',
        { className: 'bg-white rounded-lg shadow-sm border border-gray-200 p-4' },
        React.createElement('h3', { className: 'font-medium text-gray-800 mb-3' }, 'Pianificazione giornaliera'),
        React.createElement(
          'div',
          { className: 'relative h-12 bg-gray-100 rounded' },
          // Timeline markers
          [...Array(24)].map((_, hour) => React.createElement(
            'div',
            {
              key: hour,
              className: 'absolute top-0 bottom-0',
              style: { left: `${(hour / 24) * 100}%` }
            },
            React.createElement('div', { className: 'h-full w-px bg-gray-300' }),
            React.createElement(
              'div',
              { className: 'absolute -bottom-6 text-xs text-gray-500', style: { transform: 'translateX(-50%)' } },
              `${hour}:00`
            )
          )),
          
          // Current time indicator
          React.createElement(
            'div',
            {
              className: 'absolute top-0 bottom-0 w-px bg-red-500 z-10',
              style: { left: `${(new Date().getHours() + new Date().getMinutes()/60) * 100/24}%` }
            },
            React.createElement(
              'div',
              { className: 'absolute -top-1 -translate-x-1/2' },
              React.createElement('div', { className: 'h-3 w-3 rounded-full bg-red-500' })
            ),
            React.createElement(
              'div',
              { className: 'absolute -bottom-6 text-xs font-semibold text-red-500', style: { transform: 'translateX(-50%)' } },
              'Ora'
            )
          ),
          
          // Program indicators
          programs.map((program, idx) => {
            // Convert time to percentage position
            if (!program.activation_time) return null;
            
            const [hours, minutes] = program.activation_time.split(':').map(Number);
            const timePosition = (hours + minutes/60) * (100/24);
            const totalDuration = program.steps?.reduce((sum, step) => sum + (step.duration || 0), 0) || 0;
            const durationWidth = Math.max(4, (totalDuration / 60) * (100/24)); // Convert minutes to % of day
            
            return React.createElement(
              'div',
              {
                key: idx,
                className: `absolute top-2 h-8 rounded ${idx % 2 === 0 ? 'bg-blue-500' : 'bg-indigo-500'} opacity-80 z-5`,
                style: { left: `${timePosition}%`, width: `${durationWidth}%` },
                title: `${program.name} - ${program.activation_time} (${totalDuration} min)`
              },
              React.createElement(
                'div',
                { className: 'px-2 text-xs text-white truncate h-full flex items-center' },
                program.name
              )
            );
          })
        )
      )
    );
  }

  // Register the component globally
  window.IrrigationDashboard = IrrigationDashboard;
  console.log("ModernDashboard component registered globally");
})();