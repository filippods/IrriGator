"""
Modulo per la gestione della connettività WiFi.
Gestisce la modalità client e la modalità access point.
"""
import network
import ujson
import time
import gc
import uos as os
from settings_manager import load_user_settings, save_user_settings
from log_manager import log_event
from utils import ensure_directory_exists, get_dirname
import uasyncio as asyncio

# Costanti
WIFI_RETRY_INTERVAL = 600        # Tempo tra tentativi di riconnessione (secondi)
WIFI_RETRY_INITIAL_INTERVAL = 30 # Intervallo iniziale più breve (secondi)
AP_SSID_DEFAULT = "IrrigationSystem"
AP_PASSWORD_DEFAULT = "12345678"
WIFI_SCAN_FILE = '/data/wifi_scan.json'
MAX_MDNS_ATTEMPTS = 3            # Tentativi di configurazione mDNS

# Stato modulo
mdns_warning_shown = False     # Flag per evitare messaggi ripetuti
mdns_initialized = False       # Flag per tracciare lo stato di mDNS
_wifi_status = {
    "client_active": False,     # Stato interfaccia client
    "ap_active": False,         # Stato interfaccia AP
    "connected": False,         # Stato connessione client
    "last_attempt": 0           # Timestamp ultimo tentativo
}

def reset_wifi_module():
    """
    Disattiva e riattiva il modulo WiFi per forzare un reset completo.
    
    Returns:
        boolean: True se il reset è riuscito, False altrimenti
    """
    try:
        wlan_sta = network.WLAN(network.STA_IF)
        wlan_ap = network.WLAN(network.AP_IF)
        
        log_event("Reset del modulo WiFi in corso...", "INFO")
        
        # Disattiva entrambe le interfacce
        wlan_sta.active(False)
        wlan_ap.active(False)
        
        # Attendi che il modulo si resetti
        time.sleep(1)
        
        # Riattiva solo l'interfaccia client
        wlan_sta.active(True)
        
        log_event("Reset del modulo WiFi completato", "INFO")
        return True
    except Exception as e:
        log_event(f"Errore durante il reset del modulo WiFi: {e}", "ERROR")
        return False

def save_wifi_scan_results(network_list):
    """
    Salva i risultati della scansione Wi-Fi nel file wifi_scan.json.
    
    Args:
        network_list: Lista di reti WiFi trovate
    """
    try:
        # Crea directory se necessario
        ensure_directory_exists(get_dirname(WIFI_SCAN_FILE))
            
        with open(WIFI_SCAN_FILE, 'w') as f:
            ujson.dump(network_list, f)
    except Exception as e:
        log_event(f"Errore salvataggio risultati scansione WiFi: {e}", "ERROR")

def clear_wifi_scan_file():
    """
    Cancella il file wifi_scan.json.
    """
    try:
        ensure_directory_exists(get_dirname(WIFI_SCAN_FILE))
        with open(WIFI_SCAN_FILE, 'w') as f:
            ujson.dump([], f)
    except Exception:
        pass # Ignora errori

def connect_to_wifi(ssid, password):
    """
    Tenta di connettersi a una rete WiFi in modalità client.
    
    Args:
        ssid: SSID della rete WiFi
        password: Password della rete WiFi
        
    Returns:
        boolean: True se la connessione è riuscita, False altrimenti
    """
    global _wifi_status
    
    wlan_sta = network.WLAN(network.STA_IF)
    log_event(f"Tentativo connessione a {ssid}", "INFO")

    try:
        # Attiva client e avvia connessione
        wlan_sta.active(True)
        _wifi_status["client_active"] = True
        _wifi_status["last_attempt"] = time.time()
        
        time.sleep(0.5)  # Breve attesa per attivazione
        wlan_sta.connect(ssid, password)
        
        # Attendi massimo 10 secondi
        for i in range(10):
            if wlan_sta.isconnected():
                ip = wlan_sta.ifconfig()[0]
                log_event(f"Connesso a {ssid} con IP {ip}", "INFO")
                _wifi_status["connected"] = True
                return True
            
            time.sleep(1)
        
        # Connessione fallita
        log_event(f"Connessione a '{ssid}' fallita dopo 10 secondi", "WARNING")
        _wifi_status["connected"] = False
        return False
    except Exception as e:
        log_event(f"Errore durante connessione WiFi: {e}", "ERROR")
        _wifi_status["connected"] = False
        return False

def start_access_point(ssid=None, password=None):
    """
    Avvia l'access point.
    
    Args:
        ssid: SSID dell'access point (opzionale)
        password: Password dell'access point (opzionale)
        
    Returns:
        boolean: True se l'access point è stato avviato, False altrimenti
    """
    global _wifi_status
    
    try:
        settings = load_user_settings()

        # Usa parametri o configurazione salvata
        ap_config = settings.get('ap', {})
        ssid = ssid or ap_config.get('ssid', AP_SSID_DEFAULT)
        password = password or ap_config.get('password', AP_PASSWORD_DEFAULT)

        wlan_ap = network.WLAN(network.AP_IF)
        wlan_ap.active(True)
        _wifi_status["ap_active"] = True

        # Configura AP
        auth_mode = "WPA2" if password and len(password) >= 8 else "Aperto"
        
        if auth_mode == "WPA2":
            wlan_ap.config(essid=ssid, password=password, authmode=3)
        else:
            wlan_ap.config(essid=ssid)
            
        log_event(f"Access Point attivato: {ssid} ({auth_mode})", "INFO")
        return True
    except Exception as e:
        log_event(f"Errore attivazione Access Point: {e}", "ERROR")
        _wifi_status["ap_active"] = False
        try:
            wlan_ap.active(False)
        except:
            pass
        return False

def setup_mdns(hostname="irrigation"):
    """
    Configura mDNS per l'accesso tramite hostname.local.
    
    Args:
        hostname: Nome host da utilizzare (default: "irrigation")
        
    Returns:
        boolean: True se l'inizializzazione è riuscita, False altrimenti
    """
    global mdns_warning_shown, mdns_initialized
    
    # Se mDNS è già inizializzato, non riprovare
    if mdns_initialized:
        return True
        
    # Implementazioni mDNS in ordine di preferenza
    mdns_methods = [
        lambda: __try_esp_idf_mdns(hostname),
        lambda: __try_network_mdns(hostname),
        lambda: __try_socket_mdns(hostname),
        lambda: __try_micropython_mdns(hostname)
    ]
    
    # Prova ogni implementazione
    for method in mdns_methods:
        try:
            if method():
                mdns_initialized = True
                return True
        except:
            pass
            
    # Se nessun metodo funziona
    if not mdns_warning_shown:
        log_event("Nessun modulo mDNS disponibile, accesso tramite IP", "WARNING")
        mdns_warning_shown = True
            
    return False

# Implementazioni mDNS - semplificate e condensate
def __try_esp_idf_mdns(hostname):
    try:
        import esp
        if hasattr(esp, 'mdns_init'):
            esp.mdns_init()
            esp.mdns_add_service(hostname, "_http", "_tcp", 80)
            log_event(f"mDNS attivo: {hostname}.local (ESP-IDF)", "INFO")
            return True
    except:
        pass
    return False

def __try_network_mdns(hostname):
    try:
        import network
        if hasattr(network, 'mDNS'):
            network.mDNS.init(hostname)
            log_event(f"mDNS attivo: {hostname}.local (network)", "INFO")
            return True
    except:
        pass
    return False

def __try_socket_mdns(hostname):
    try:
        import mdns.mdns as mdns_mod
        mdns_server = mdns_mod.MDNS(hostname)
        mdns_server.start()
        log_event(f"mDNS attivo: {hostname}.local (socket)", "INFO")
        return True
    except:
        pass
    return False

def __try_micropython_mdns(hostname):
    try:
        import mdns
        mdns.start(hostname)
        log_event(f"mDNS attivo: {hostname}.local (micropython-mdns)", "INFO")
        return True
    except:
        pass
    return False

def initialize_network():
    """
    Inizializza la rete WiFi in base alle impostazioni.
    
    Returns:
        boolean: True se l'inizializzazione è riuscita, False altrimenti
    """
    global _wifi_status
    
    gc.collect()  # Libera memoria
    settings = load_user_settings()
    if not isinstance(settings, dict):
        log_event("Errore: impostazioni non disponibili", "ERROR")
        return False

    client_enabled = settings.get('client_enabled', False)
    success = False

    if client_enabled:
        # Configura modalità client
        ssid = settings.get('wifi', {}).get('ssid')
        password = settings.get('wifi', {}).get('password')

        if ssid and password:
            # Tenta connessione
            success = connect_to_wifi(ssid, password)
            if success:
                log_event("Modalità client attivata", "INFO")
                
                # Configura mDNS
                setup_mdns()
                return True
            else:
                log_event("Fallback: modalità AP", "WARNING")
                # Lascia il client attivo per futuri tentativi
        else:
            log_event("SSID o password mancanti", "WARNING")

    # Se client disabilitato o fallito, avvia AP
    ap_ssid = settings.get('ap', {}).get('ssid', AP_SSID_DEFAULT)
    ap_password = settings.get('ap', {}).get('password', AP_PASSWORD_DEFAULT)
    ap_success = start_access_point(ap_ssid, ap_password)
    
    # Imposta mDNS in modalità AP
    if ap_success:
        setup_mdns()
    
    return ap_success or success

async def retry_client_connection():
    """
    Task asincrono per riconnessione periodica WiFi.
    """
    last_attempt_time = 0
    reconnection_tries = 0
    ap_failover_activated = False
    
    while True:
        try:
            current_time = time.time()
            wlan_sta = network.WLAN(network.STA_IF)
            wlan_ap = network.WLAN(network.AP_IF)
            settings = load_user_settings()
            
            client_enabled = settings.get('client_enabled', False)

            if client_enabled:
                # Modalità client abilitata
                if not wlan_sta.isconnected():
                    # Determina intervallo di riconnessione
                    retry_interval = WIFI_RETRY_INTERVAL if ap_failover_activated else WIFI_RETRY_INITIAL_INTERVAL
                    time_since_last = current_time - last_attempt_time
                    
                    if time_since_last >= retry_interval:
                        # Tenta riconnessione
                        log_event(f"Tentativo riconnessione WiFi (#{reconnection_tries + 1})", "INFO")
                        
                        ssid = settings.get('wifi', {}).get('ssid')
                        password = settings.get('wifi', {}).get('password')
                        
                        if ssid and password:
                            last_attempt_time = current_time
                            reconnection_tries += 1
                            
                            # Assicurati che il client sia attivo
                            if not wlan_sta.active():
                                wlan_sta.active(True)
                                await asyncio.sleep(1)
                                
                            # Tenta connessione
                            wlan_sta.connect(ssid, password)
                            
                            # Attendi fino a 10 secondi
                            connected = False
                            for _ in range(10):
                                if wlan_sta.isconnected():
                                    connected = True
                                    break
                                await asyncio.sleep(1)
                                
                            if connected:
                                # Connessione riuscita
                                log_event(f"Riconnessione a '{ssid}' riuscita", "INFO")
                                reconnection_tries = 0
                                ap_failover_activated = False
                                
                                # Disattiva AP se attivo come fallback
                                if wlan_ap.active():
                                    wlan_ap.active(False)
                                    log_event("Access Point fallback disattivato", "INFO")
                                    
                                # Configura mDNS
                                setup_mdns()
                            else:
                                # Connessione fallita, attiva AP come fallback
                                if not ap_failover_activated:
                                    log_event(f"Fallback: attivazione AP", "WARNING")
                                    
                                    # Attiva AP
                                    if not wlan_ap.active():
                                        ap_ssid = settings.get('ap', {}).get('ssid', AP_SSID_DEFAULT)
                                        ap_password = settings.get('ap', {}).get('password', AP_PASSWORD_DEFAULT)
                                        start_access_point(ap_ssid, ap_password)
                                    
                                    ap_failover_activated = True
                        else:
                            log_event("SSID o password mancanti", "ERROR")
                            
                            # Attiva AP come unica opzione
                            if not wlan_ap.active():
                                ap_ssid = settings.get('ap', {}).get('ssid', AP_SSID_DEFAULT)
                                ap_password = settings.get('ap', {}).get('password', AP_PASSWORD_DEFAULT)
                                start_access_point(ap_ssid, ap_password)
                                ap_failover_activated = True
                    else:
                        # Non è ancora il momento di riprovare
                        await asyncio.sleep(1)
                else:
                    # Client connesso
                    if reconnection_tries > 0:
                        log_event("Connessione WiFi client stabile", "INFO")
                        reconnection_tries = 0
                    
                    # Disattiva AP se attivo come fallback
                    if wlan_ap.active() and ap_failover_activated:
                        wlan_ap.active(False)
                        log_event("Access Point fallback disattivato", "INFO")
                        ap_failover_activated = False
                    
                    # Configura mDNS
                    setup_mdns()
                    
                    # Controllo periodico
                    await asyncio.sleep(30)
            else:
                # Modalità client disabilitata
                if wlan_sta.active():
                    log_event("Disattivazione client come da configurazione", "INFO")
                    wlan_sta.active(False)
                    reconnection_tries = 0
                    ap_failover_activated = False
                    
                # Assicura AP attivo
                if not wlan_ap.active():
                    ap_ssid = settings.get('ap', {}).get('ssid', AP_SSID_DEFAULT)
                    ap_password = settings.get('ap', {}).get('password', AP_PASSWORD_DEFAULT)
                    start_access_point(ap_ssid, ap_password)
                
                # Configura mDNS
                setup_mdns()
                
                # Controllo periodico
                await asyncio.sleep(30)
        
        except Exception as e:
            log_event(f"Errore gestione connessione WiFi: {e}", "ERROR")
            await asyncio.sleep(5)