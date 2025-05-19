"""
API handler per le funzioni di gestione delle impostazioni.
"""
from microdot import Response
import ujson
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

def get_user_settings(request):
    """API per ottenere le impostazioni utente."""
    try:
        from settings_manager import load_user_settings
        
        settings = load_user_settings()
        if not settings:
            return json_response({'error': 'Impossibile caricare impostazioni'}, 500)
            
        # Assicura campi essenziali
        if 'safety_relay' not in settings:
            settings['safety_relay'] = {'pin': 13}
        elif 'pin' not in settings['safety_relay']:
            settings['safety_relay']['pin'] = 13
                
        return json_response(settings)
    except Exception as e:
        log_event(f"Errore get_user_settings: {e}", "ERROR")
        return json_response({'error': str(e)}, 500)

def save_user_settings_route(request):
    """API per salvare le impostazioni utente."""
    try:
        from settings_manager import load_user_settings, save_user_settings
        import network
        
        # Estrai e valida dati
        settings_data = request.json
        if settings_data is None:
            try:
                settings_data = ujson.loads(request.body.decode('utf-8'))
            except:
                return json_response({'success': False, 'error': 'Dati JSON non validi'}, 400)

        if not isinstance(settings_data, dict):
            return json_response({'success': False, 'error': 'Formato impostazioni non valido'}, 400)

        # Carica impostazioni attuali
        existing_settings = load_user_settings()
        if not isinstance(existing_settings, dict):
            existing_settings = {}

        # Aggiorna impostazioni con merge intelligente
        for key, value in settings_data.items():
            if isinstance(value, dict) and key in existing_settings and isinstance(existing_settings[key], dict):
                existing_settings[key].update(value)
            else:
                existing_settings[key] = value

        # Salva impostazioni
        success = save_user_settings(existing_settings)
        
        # Gestione WiFi
        if 'client_enabled' in settings_data:
            client_enabled = settings_data['client_enabled']
            
            # Se client disabilitato, disattiva l'interfaccia STA
            if not client_enabled:
                try:
                    wlan_sta = network.WLAN(network.STA_IF)
                    if wlan_sta.active():
                        wlan_sta.active(False)
                        log_event("Modalità client disattivata", "INFO")
                except Exception as e:
                    log_event(f"Errore disattivazione client WiFi: {e}", "WARNING")
        
        # Pulizia memoria
        try:
            import gc
            gc.collect()
        except:
            pass
        
        return json_response({'success': success})
    except Exception as e:
        log_event(f"Errore save_user_settings: {e}", "ERROR")
        return json_response({'success': False, 'error': str(e)}, 500)