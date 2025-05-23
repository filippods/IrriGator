"""
Modulo principale per il server web.
Gestisce l'inizializzazione del server e il routing delle richieste.
"""
from microdot import Request, Microdot, Response, send_file
import uasyncio as asyncio
from log_manager import log_event
import gc
import time

# Importazioni da moduli API
from api_handlers.zone_api import (
    get_zones_status_endpoint, get_zones, handle_start_zone, handle_stop_zone
)
from api_handlers.program_api import (
    get_programs, save_program_route, update_program_route, delete_program_route,
    start_program_route, stop_program_route, get_program_state,
    toggle_program_automatic, toggle_automatic_programs
)
from api_handlers.system_api import (
    get_system_logs, clear_system_logs, restart_system_route,
    reset_settings_route, reset_factory_data_route, get_server_stats
)
from api_handlers.wifi_api import (
    get_wifi_scan_results, scan_wifi, clear_wifi_scan,
    get_connection_status, activate_ap, connect_wifi_route, disconnect_wifi
)
from api_handlers.settings_api import (
    get_user_settings, save_user_settings_route
)

# Importazioni da moduli di utilità
from file_cache import get_cached_file, file_exists, clear_cache

# Configurazione
HTML_BASE_PATH = '/web'

# Migliore gestione delle richieste
Request.max_content_length = 32 * 1024  # 32KB per le richieste
Request.max_body_length = 16 * 1024     # 16KB per il corpo
Request.max_readline = 1024             # 1KB per riga di richiesta

# Inizializzazione app
app = Microdot()

# Metriche server
server_stats = {
    'requests_total': 0,
    'requests_error': 0,
    'last_request_time': 0,
    'cache_hits': 0,
    'cache_misses': 0,
    'gc_runs': 0
}

# Monitoraggio salute server
server_health = {
    'start_time': time.time(),
    'timeout_counter': 0,
    'last_restart': 0,
    'memory_warning': False
}

def api_handler(f):
    """
    Decorator unificato per la gestione delle API con:
    - Ottimizzazione memoria
    - Gestione errori centralizzata
    - Monitoraggio metriche
    - Rate limiting leggero
    
    Args:
        f: Funzione da decorare
        
    Returns:
        function: Funzione decorata
    """
    async def wrapper(*args, **kwargs):
        global server_stats

        # Aggiorna metriche
        server_stats['requests_total'] += 1
        current_time = time.time()
        elapsed = current_time - server_stats['last_request_time'] if server_stats['last_request_time'] > 0 else 0
        server_stats['last_request_time'] = current_time
        
        # Rate limiting leggero
        if elapsed < 0.05:  # Più di 20 richieste/secondo potrebbe essere un problema
            server_health['timeout_counter'] += 1
            await asyncio.sleep(0.05)
        
        # Esegui GC preventivo se memoria bassa o periodicamente
        free_mem = gc.mem_free()
        if free_mem < 20000 or server_stats['requests_total'] % 50 == 0:
            gc.collect()
            server_stats['gc_runs'] += 1
        
        # Controlla salute memoria
        mem_percent = free_mem / (free_mem + gc.mem_alloc()) * 100
        if mem_percent < 15 and not server_health['memory_warning']:
            log_event(f"AVVISO: Memoria server bassa ({mem_percent:.1f}%)", "WARNING")
            server_health['memory_warning'] = True
        elif mem_percent > 30 and server_health['memory_warning']:
            server_health['memory_warning'] = False
        
        try:
            # Esecuzione handler effettivo
            result = f(*args, **kwargs)
            if hasattr(result, 'send') and hasattr(result, 'throw'):
                result = await result
                
            # GC dopo richieste onerose
            gc.collect()
            return result
        except Exception as e:
            # Gestione centralizzata errori
            server_stats['requests_error'] += 1
            func_name = getattr(f, '__name__', 'unknown')
            log_event(f"Errore in API '{func_name}': {e}", "ERROR")
            gc.collect()
            
            # Risposta generica ma utile
            error_message = str(e)
            if len(error_message) > 100:  # Limita lunghezza messaggi per risparmiare memoria
                error_message = error_message[:97] + "..."
                
            return Response(
                body='{"success": false, "error": "' + error_message + '"}',
                status_code=200,  # Usa 200 anche per errori per compatibilità client
                headers={'Content-Type': 'application/json'}
            )
    
    # Preserva metadati funzione originale in modo sicuro
    try:
        wrapper.__name__ = getattr(f, '__name__', 'api_handler')
    except (AttributeError, TypeError):
        # Se c'è un errore nell'assegnazione, ignora silenziosamente
        pass
        
    return wrapper

# -------- Registrazione delle route API --------

# API gestione zone
app.route('/get_zones_status', methods=['GET'])(api_handler(get_zones_status_endpoint))
app.route('/get_zones', methods=['GET'])(api_handler(get_zones))
app.route('/start_zone', methods=['POST'])(api_handler(handle_start_zone))
app.route('/stop_zone', methods=['POST'])(api_handler(handle_stop_zone))

# API gestione programmi
app.route('/data/program.json', methods=['GET'])(api_handler(get_programs))
app.route('/save_program', methods=['POST'])(api_handler(save_program_route))
app.route('/update_program', methods=['PUT'])(api_handler(update_program_route))
app.route('/delete_program', methods=['POST'])(api_handler(delete_program_route))
app.route('/start_program', methods=['POST'])(api_handler(start_program_route))
app.route('/stop_program', methods=['POST'])(api_handler(stop_program_route))
app.route('/get_program_state', methods=['GET'])(api_handler(get_program_state))
app.route('/toggle_program_automatic', methods=['POST'])(api_handler(toggle_program_automatic))
app.route('/toggle_automatic_programs', methods=['POST'])(api_handler(toggle_automatic_programs))

# API gestione sistema
app.route('/data/system_log.json', methods=['GET'])(api_handler(get_system_logs))
app.route('/clear_logs', methods=['POST'])(api_handler(clear_system_logs))
app.route('/restart_system', methods=['POST'])(api_handler(restart_system_route))
app.route('/reset_settings', methods=['POST'])(api_handler(reset_settings_route))
app.route('/reset_factory_data', methods=['POST'])(api_handler(reset_factory_data_route))
app.route('/server_stats', methods=['GET'])(api_handler(get_server_stats))

# API WiFi
app.route('/data/wifi_scan.json', methods=['GET'])(api_handler(get_wifi_scan_results))
app.route('/scan_wifi', methods=['GET'])(api_handler(scan_wifi))
app.route('/clear_wifi_scan_file', methods=['POST'])(api_handler(clear_wifi_scan))
app.route('/get_connection_status', methods=['GET'])(api_handler(get_connection_status))
app.route('/activate_ap', methods=['POST'])(api_handler(activate_ap))
app.route('/connect_wifi', methods=['POST'])(api_handler(connect_wifi_route))
app.route('/disconnect_wifi', methods=['POST'])(api_handler(disconnect_wifi))

# API impostazioni
app.route('/data/user_settings.json', methods=['GET'])(api_handler(get_user_settings))
app.route('/save_user_settings', methods=['POST'])(api_handler(save_user_settings_route))

# -------- Route per file statici --------

@app.route('/', methods=['GET'])
@api_handler
async def index(request):
    """Route per servire la pagina principale."""
    response_data = get_cached_file('/web/main.html')
    if response_data:
        content, content_type = response_data
        return Response(content, headers={'Content-Type': content_type})
    else:
        return Response('Errore caricamento pagina', status_code=500)

@app.route('/<path:path>', methods=['GET'])
@api_handler
async def static_files(request, path):
    """Route per servire i file statici."""
    # Evita accesso a directory data
    if path.startswith('data/'):
        return Response('Not Found', status_code=404)

    file_path = f'/web/{path}'
    response_data = get_cached_file(file_path)
    
    if response_data:
        content, content_type = response_data
        return Response(content, headers={'Content-Type': content_type})
    elif file_exists(file_path):
        return send_file(file_path)
    else:
        return Response('File non trovato', status_code=404)

async def start_web_server():
    """
    Avvia il server web con inizializzazione robusta.
    """
    global server_health
    
    try:
        log_event("Avvio server web", "INFO")
        
        # Crea directory data se non esiste
        try:
            if not file_exists('/data'):
                import uos
                uos.mkdir('/data')
        except Exception as e:
            log_event(f"Errore creazione directory data: {e}", "WARNING")
        
        # Libera memoria prima di avviare
        gc.collect()
        
        # Reset stato server
        server_health['start_time'] = time.time()
        server_health['timeout_counter'] = 0
        server_health['last_restart'] = 0
        server_health['memory_warning'] = False
        
        # Avvia server
        await app.start_server(host='0.0.0.0', port=80)
    except Exception as e:
        log_event(f"Errore avvio server web: {e}", "ERROR")
        
        # Ritenta dopo breve pausa
        await asyncio.sleep(5)
        asyncio.create_task(start_web_server())