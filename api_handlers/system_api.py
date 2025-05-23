"""
API handler per le funzioni di sistema.
"""
from microdot import Response
import ujson
import uasyncio as asyncio
import machine
import gc
import time
from log_manager import log_event

def json_response(data, status_code=200):
    """
    Helper per creare risposte JSON standardizzate.
    """
    return Response(
        body=ujson.dumps(data),
        status_code=status_code,
        headers={'Content-Type': 'application/json'}
    )

def get_system_logs(request):
    """API per ottenere i log di sistema."""
    try:
        from log_manager import get_logs
        logs = get_logs()
        return json_response(logs)
    except Exception as e:
        log_event(f"Errore get_system_logs: {e}", "ERROR")
        return json_response({'error': 'Log manager non disponibile'}, 500)

def clear_system_logs(request):
    """API per cancellare i log di sistema."""
    try:
        from log_manager import clear_logs
        success = clear_logs()
        if success:
            log_event("Log di sistema cancellati", "INFO")
            return json_response({'success': True})
        else:
            return json_response({'success': False, 'error': 'Errore cancellazione log'}, 500)
    except Exception as e:
        log_event(f"Errore clear_system_logs: {e}", "ERROR")
        return json_response({'success': False, 'error': str(e)}, 500)

def restart_system_route(request):
    """API per riavviare il sistema."""
    try:
        from zone_manager import stop_all_zones
        # Ferma tutte le zone per sicurezza
        stop_all_zones()
        
        log_event("Riavvio sistema richiesto", "INFO")
        
        # Ritardo per consentire l'invio della risposta
        asyncio.create_task(_delayed_reset(2))
        return json_response({'success': True, 'message': 'Sistema in riavvio'})
    except Exception as e:
        log_event(f"Errore restart_system: {e}", "ERROR")
        return json_response({'success': False, 'error': str(e)}, 500)

async def _delayed_reset(delay_seconds):
    """Esegue un reset del sistema dopo un ritardo specificato."""
    await asyncio.sleep(delay_seconds)
    machine.reset()

def reset_settings_route(request):
    """API per ripristinare le impostazioni predefinite."""
    try:
        from settings_manager import reset_user_settings
        success = reset_user_settings()
        
        if success:
            log_event("Impostazioni resettate", "INFO")
            return json_response({'success': True})
        else:
            return json_response({'success': False, 'error': 'Errore reset impostazioni'}, 500)
    except Exception as e:
        log_event(f"Errore reset_settings: {e}", "ERROR")
        return json_response({'success': False, 'error': str(e)}, 500)

def reset_factory_data_route(request):
    """API per ripristinare le impostazioni e i dati di fabbrica."""
    try:
        from settings_manager import reset_factory_data
        from file_cache import clear_cache
        
        success = reset_factory_data()
        
        # Invalida tutte le cache
        clear_cache()
        
        if success:
            log_event("Reset dati di fabbrica completato", "INFO")
            return json_response({'success': True})
        else:
            return json_response({'success': False, 'error': 'Errore reset dati'}, 500)
    except Exception as e:
        log_event(f"Errore reset_factory_data: {e}", "ERROR")
        return json_response({'success': False, 'error': str(e)}, 500)

def get_server_stats(request):
    """API diagnostica per statistiche server."""
    try:
        # Importiamo direttamente da web_server per avere accesso alle variabili globali
        from web_server import server_stats, server_health
        import time  # Assicuriamoci che time sia importato
        
        # Aggiorna metriche memoria
        current_time = time.time()
        uptime = current_time - server_health['start_time']
        mem_free = gc.mem_free()
        mem_alloc = gc.mem_alloc()
        
        stats = {
            'uptime': uptime,
            'uptime_human': f"{int(uptime // 3600)}h {int((uptime % 3600) // 60)}m",
            'requests_total': server_stats['requests_total'],
            'requests_error': server_stats['requests_error'],
            'cache_hits': server_stats['cache_hits'],
            'cache_misses': server_stats['cache_misses'],
            'gc_runs': server_stats['gc_runs'],
            'memory': {
                'free': mem_free,
                'allocated': mem_alloc,
                'total': mem_free + mem_alloc,
                'percent_free': (mem_free / (mem_free + mem_alloc)) * 100
            }
        }
        
        return json_response(stats)
    except Exception as e:
        log_event(f"Errore get_server_stats: {e}", "ERROR")
        # Crea statistiche semplici se quelle complete non sono disponibili
        mem_free = gc.mem_free()
        mem_alloc = gc.mem_alloc()
        
        basic_stats = {
            'memory': {
                'free': mem_free,
                'allocated': mem_alloc,
                'total': mem_free + mem_alloc,
                'percent_free': (mem_free / (mem_free + mem_alloc)) * 100
            }
        }
        
        return json_response(basic_stats)