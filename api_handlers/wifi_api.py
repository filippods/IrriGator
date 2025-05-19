"""
API handler per le funzioni WiFi.
"""
from microdot import Response
import ujson
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

def get_wifi_scan_results(request):
    """API per ottenere i risultati della scansione WiFi."""
    try:
        from file_cache import file_exists
        from wifi_manager import WIFI_SCAN_FILE
        
        if file_exists(WIFI_SCAN_FILE):
            with open(WIFI_SCAN_FILE, 'r') as f:
                networks = ujson.load(f)
            return json_response(networks)
        else:
            return json_response([], 200)
    except Exception as e:
        log_event(f"Errore get_wifi_scan_results: {e}", "ERROR")
        return json_response([], 200)

def scan_wifi(request):
    """API per avviare una scansione WiFi."""
    try:
        log_event("Avvio scansione Wi-Fi", "INFO")
        
        # Importazioni lazy
        import network
        from wifi_manager import clear_wifi_scan_file, save_wifi_scan_results
        
        # Cancella vecchi dati scansione
        clear_wifi_scan_file()
        
        # Avvia scansione
        wlan = network.WLAN(network.STA_IF)
        wlan.active(True)
        networks = wlan.scan()
        network_list = []

        # Elabora risultati
        seen_ssids = set()
        for net in networks:
            ssid = net[0].decode('utf-8')
            rssi = net[3]
            
            # Evita duplicati
            if ssid in seen_ssids:
                continue
                
            seen_ssids.add(ssid)
            signal_quality = "Buono" if rssi > -60 else "Sufficiente" if rssi > -80 else "Scarso"
            network_list.append({"ssid": ssid, "signal": signal_quality})

        # Salva risultati
        save_wifi_scan_results(network_list)
        log_event(f"Scansione Wi-Fi completata: {len(network_list)} reti", "INFO")

        return json_response(network_list)
    except Exception as e:
        log_event(f"Errore scan_wifi: {e}", "ERROR")
        return json_response({'error': str(e)}, 500)

def clear_wifi_scan(request):
    """API per cancellare il file di scansione WiFi."""
    try:
        from wifi_manager import clear_wifi_scan_file
        clear_wifi_scan_file()
        return json_response({'success': True})
    except Exception as e:
        log_event(f"Errore clear_wifi_scan: {e}", "ERROR")
        return json_response({'success': False, 'error': str(e)}, 500)

def get_connection_status(request):
    """API per ottenere lo stato della connessione WiFi."""
    try:
        import network
        
        wlan_sta = network.WLAN(network.STA_IF)
        wlan_ap = network.WLAN(network.AP_IF)
        response_data = {}

        if wlan_sta.isconnected():
            ip = wlan_sta.ifconfig()[0]
            response_data = {
                'mode': 'client',
                'ip': ip,
                'ssid': wlan_sta.config('essid')
            }
        elif wlan_ap.active():
            ip = wlan_ap.ifconfig()[0]
            response_data = {
                'mode': 'AP',
                'ip': ip,
                'ssid': wlan_ap.config('essid')
            }
        else:
            response_data = {
                'mode': 'none',
                'ip': 'N/A',
                'ssid': 'N/A'
            }

        return json_response(response_data)
    except Exception as e:
        log_event(f"Errore get_connection_status: {e}", "ERROR")
        return json_response({'mode': 'unknown'}, 200)

def activate_ap(request):
    """API per attivare l'access point."""
    try:
        from wifi_manager import start_access_point
        start_access_point()  # Attiva l'AP con le impostazioni salvate
        log_event("Access Point attivato", "INFO")
        return json_response({'success': True})
    except Exception as e:
        log_event(f"Errore activate_ap: {e}", "ERROR")
        return json_response({'success': False, 'error': str(e)}, 500)

def connect_wifi_route(request):
    """API per connettersi a una rete WiFi."""
    try:
        import network
        from settings_manager import load_user_settings, save_user_settings
        
        # Estrai e valida dati
        data = request.json
        if data is None:
            try:
                data = ujson.loads(request.body.decode('utf-8'))
            except:
                return json_response({'success': False, 'error': 'Dati JSON non validi'}, 400)

        ssid = data.get('ssid')
        password = data.get('password')

        if not ssid or not password:
            return json_response({'success': False, 'error': 'SSID e password richiesti'}, 400)

        log_event(f"Tentativo connessione a {ssid}", "INFO")
        
        # Connetti a WiFi
        wlan = network.WLAN(network.STA_IF)
        wlan.active(True)
        wlan.connect(ssid, password)

        # Attesa max 15 secondi
        connected = False
        for _ in range(15):
            if wlan.isconnected():
                connected = True
                break
            time.sleep(1)

        if connected:
            ip = wlan.ifconfig()[0]
            log_event(f"Connesso a {ssid} con IP: {ip}", "INFO")

            # Aggiorna impostazioni
            settings = load_user_settings()
            settings['wifi'] = {'ssid': ssid, 'password': password}
            settings['client_enabled'] = True
            save_user_settings(settings)

            return json_response({'success': True, 'ip': ip, 'mode': 'client'})
        else:
            log_event("Connessione WiFi fallita", "ERROR")
            return json_response({'success': False, 'error': 'Connessione fallita'}, 500)
    except Exception as e:
        log_event(f"Errore connect_wifi: {e}", "ERROR")
        return json_response({'success': False, 'error': str(e)}, 500)

def disconnect_wifi(request):
    """API per disconnettere il client WiFi."""
    try:
        import network
        
        wlan_sta = network.WLAN(network.STA_IF)
        if wlan_sta.isconnected():
            wlan_sta.disconnect()
            wlan_sta.active(False)
            log_event("WiFi client disconnesso", "INFO")
        
        return json_response({'success': True})
    except Exception as e:
        log_event(f"Errore disconnect_wifi: {e}", "ERROR")
        return json_response({'success': False, 'error': str(e)}, 500)