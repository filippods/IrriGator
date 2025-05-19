"""
API handler per la gestione delle zone di irrigazione.
"""
from microdot import Response
import ujson
from log_manager import log_event
from settings_manager import load_user_settings

def json_response(data, status_code=200):
    """
    Helper per creare risposte JSON standardizzate.
    """
    return Response(
        body=ujson.dumps(data),
        status_code=status_code,
        headers={'Content-Type': 'application/json'}
    )

def get_zones_status_endpoint(request):
    """API per ottenere lo stato delle zone."""
    try:
        from zone_manager import get_zones_status
        zones_status = get_zones_status()
        return json_response(zones_status)
    except Exception as e:
        log_event(f"Errore in get_zones_status: {e}", "ERROR")
        return json_response([], 200)  # Fallback sicuro

def get_zones(request):
    """API per ottenere la lista delle zone."""
    settings = load_user_settings()
    if not settings:
        return json_response({'error': 'Impostazioni non disponibili'}, 500)
        
    zones = settings.get('zones', [])
    return json_response(zones)

def handle_start_zone(request):
    """API per avviare una zona."""
    try:
        from zone_manager import start_zone
        from program_state import program_running, load_program_state
        
        # Estrai e valida parametri
        data = request.json
        if data is None:
            try:
                data = ujson.loads(request.body.decode('utf-8'))
            except:
                return json_response({'error': 'Dati JSON non validi', 'success': False}, 400)

        zone_id = data.get('zone_id')
        duration = data.get('duration')

        if zone_id is None or duration is None:
            return json_response({'error': 'Parametri mancanti', 'success': False}, 400)

        # Verifica se un programma è in esecuzione
        load_program_state()
        if program_running:
            return json_response({'error': 'Programma in esecuzione', 'success': False}, 400)

        # Avvia zona
        result = start_zone(zone_id, duration)
        if result:
            return json_response({"success": True})
        else:
            return json_response({'error': "Errore avvio zona", "success": False}, 500)
    except Exception as e:
        log_event(f"Errore start_zone: {e}", "ERROR")
        return json_response({'error': str(e), 'success': False}, 500)

def handle_stop_zone(request):
    """API per fermare una zona."""
    try:
        from zone_manager import stop_zone
        
        # Estrai e valida parametri
        data = request.json
        if data is None:
            try:
                data = ujson.loads(request.body.decode('utf-8'))
            except:
                return json_response({'error': 'Dati JSON non validi', 'success': False}, 400)

        zone_id = data.get('zone_id')
        if zone_id is None:
            return json_response({'error': 'Parametro zone_id mancante', 'success': False}, 400)

        # Ferma zona
        result = stop_zone(zone_id)
        if result:
            return json_response({"success": True})
        else:
            return json_response({'error': "Errore arresto zona", "success": False}, 500)
    except Exception as e:
        log_event(f"Errore stop_zone: {e}", "ERROR")
        return json_response({'error': str(e), 'success': False}, 500)