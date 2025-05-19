"""
Modulo per la gestione delle zone di irrigazione.
Gestisce l'attivazione e la disattivazione delle zone, rispettando i limiti impostati dall'utente.
"""
import time
import machine
from machine import Pin
import uasyncio as asyncio
from settings_manager import load_user_settings
from log_manager import log_event
from cache_manager import get_cached, invalidate_cache

# Variabili globali
active_zones = {}      # Dizionario delle zone attive: {zone_id: {start_time, duration, task}}
zone_pins = {}         # Cache dei pin GPIO: {zone_id: Pin}
safety_relay = None    # Pin del relè master di sicurezza

def _load_settings_for_zones():
    """
    Carica le impostazioni utente per le zone.
    Funzione helper per get_cached.
    
    Returns:
        dict: Impostazioni utente
    """
    return load_user_settings()

def initialize_pins():
    """
    Inizializza i pin del sistema di irrigazione.
    
    Returns:
        boolean: True se almeno una zona è stata inizializzata, False altrimenti
    """
    global zone_pins, safety_relay
    
    settings = get_cached('zone_settings', _load_settings_for_zones, ttl=30)
    if not settings:
        log_event("Errore: Impossibile caricare le impostazioni utente", "ERROR")
        print("Errore: Impossibile caricare le impostazioni utente.")
        return False

    zones = settings.get('zones', [])
    pins = {}

    # Inizializza i pin per le zone
    initialized_zones = 0
    errors = []
    
    for zone in zones:
        if not isinstance(zone, dict):
            continue
            
        zone_id = zone.get('id')
        pin_number = zone.get('pin')
        if pin_number is None or zone_id is None:
            continue
            
        try:
            pin = Pin(pin_number, Pin.OUT)
            pin.value(1)  # Relè spento (logica attiva bassa)
            pins[zone_id] = pin
            initialized_zones += 1
        except Exception as e:
            errors.append(f"Zona {zone_id}/Pin {pin_number}: {e}")

    # Log collettivo per ridurre il numero di chiamate
    if initialized_zones > 0:
        log_event(f"Inizializzate {initialized_zones} zone", "INFO")
    
    if errors:
        log_event(f"Errori inizializzazione pin: {', '.join(errors)}", "ERROR")

    # Inizializza il pin per il relè di sicurezza
    safety_relay_pin = settings.get('safety_relay', {}).get('pin')
    
    if safety_relay_pin is not None:
        try:
            safety_relay_obj = Pin(safety_relay_pin, Pin.OUT)
            safety_relay_obj.value(1)  # Relè spento (logica attiva bassa)
            safety_relay = safety_relay_obj
            log_event(f"Relè di sicurezza inizializzato sul pin {safety_relay_pin}", "INFO")
        except Exception as e:
            log_event(f"Errore inizializzazione relè sicurezza: {e}", "ERROR")
            safety_relay = None
    
    zone_pins = pins
    return initialized_zones > 0

def get_zones_status():
    """
    Ritorna lo stato attuale di tutte le zone.
    
    Returns:
        list: Lista di dizionari con lo stato di ogni zona
    """
    global active_zones
    zones_status = []
    
    try:
        settings = get_cached('zone_settings', _load_settings_for_zones, ttl=30)
        if not settings or not isinstance(settings, dict):
            return []
            
        configured_zones = settings.get('zones', [])
        if not configured_zones or not isinstance(configured_zones, list):
            return []
            
        current_time = time.time()  # Chiamata ottimizzata
        
        for zone in configured_zones:
            if not zone or not isinstance(zone, dict) or zone.get('status') != 'show':
                continue
                
            zone_id = zone.get('id')
            if zone_id is None:
                continue
                
            is_active = zone_id in active_zones
            remaining_time = 0
            
            # Calcola il tempo rimanente se la zona è attiva
            if is_active:
                zone_data = active_zones.get(zone_id, {})
                start_time = zone_data.get('start_time', 0)
                duration = zone_data.get('duration', 0) * 60  # In secondi
                
                try:
                    elapsed = int(current_time - start_time)
                    remaining_time = max(0, duration - elapsed)
                except Exception:
                    pass
            
            # Costruisci l'oggetto zona in una sola operazione
            zones_status.append({
                'id': zone_id,
                'name': zone.get('name', f'Zona {zone_id + 1}'),
                'active': is_active,
                'remaining_time': remaining_time
            })
        
        return zones_status
    except Exception as e:
        log_event(f"Errore in get_zones_status: {e}", "ERROR")
        return []

def get_active_zones_count():
    """
    Ritorna il numero di zone attualmente attive.
    
    Returns:
        int: Numero di zone attive
    """
    return len(active_zones)

def start_zone(zone_id, duration):
    """
    Attiva una zona di irrigazione.
    
    Args:
        zone_id: ID della zona da attivare
        duration: Durata dell'attivazione in minuti
        
    Returns:
        boolean: True se l'operazione è riuscita, False altrimenti
    """
    global active_zones, zone_pins, safety_relay
    
    # Converti e valida i parametri
    try:
        zone_id = int(zone_id)
        duration = int(duration)
    except (ValueError, TypeError):
        log_event(f"Errore: parametri non validi per start_zone", "ERROR")
        return False
    
    # Verifica stato programma
    from program_state import program_running, load_program_state
    load_program_state()
    if program_running:
        log_event(f"Impossibile avviare zona {zone_id}: programma in esecuzione", "WARNING")
        return False

    # Controlla validità zona
    if zone_id not in zone_pins:
        log_event(f"Errore: zona {zone_id} non trovata", "ERROR")
        return False
    
    # Validazione durata
    settings = get_cached('zone_settings', _load_settings_for_zones, ttl=30)
    max_duration = settings.get('max_zone_duration', 180)
    if duration <= 0 or duration > max_duration:
        log_event(f"Errore: durata non valida ({duration}) per zona {zone_id}", "ERROR")
        return False
    
    # Verifica limite zone attive
    max_active_zones = settings.get('max_active_zones', 1)
    if len(active_zones) >= max_active_zones and zone_id not in active_zones:
        log_event(f"Limite massimo zone attive ({max_active_zones}) raggiunto", "WARNING")
        return False

    # Memorizza il task precedente se necessario
    old_task = None
    if zone_id in active_zones and 'task' in active_zones[zone_id]:
        old_task = active_zones[zone_id]['task']
    
    # Attiva il relè di sicurezza se necessario
    if safety_relay and not active_zones:
        try:
            safety_relay.value(0)  # Attiva il relè di sicurezza (logica attiva bassa)
            log_event("Relè di sicurezza attivato", "INFO")
        except Exception as e:
            log_event(f"Errore attivazione relè sicurezza: {e}", "ERROR")
            return False

    # Attiva la zona
    try:
        zone_pins[zone_id].value(0)  # Attiva la zona (logica attiva bassa)
        log_event(f"Zona {zone_id} avviata per {duration} minuti", "INFO")
    except Exception as e:
        log_event(f"Errore attivazione zona {zone_id}: {e}", "ERROR")
        
        # Ripristina relè sicurezza se necessario
        if safety_relay and not active_zones:
            try:
                safety_relay.value(1)
            except:
                pass
        return False

    # Cancella eventuale timer precedente
    if old_task:
        try:
            if not old_task.cancelled():
                old_task.cancel()
        except Exception:
            pass

    # Crea nuovo timer
    task = asyncio.create_task(_zone_timer(zone_id, duration))
    
    # Aggiorna stato zona
    active_zones[zone_id] = {
        'start_time': time.time(),
        'duration': duration,
        'task': task
    }
    
    return True

async def _zone_timer(zone_id, duration):
    """
    Timer asincrono per arrestare automaticamente la zona dopo la durata specificata.
    
    Args:
        zone_id: ID della zona
        duration: Durata in minuti
    """
    try:
        await asyncio.sleep(duration * 60)  # Converti minuti in secondi
        
        # Verifica stato zona prima di disattivarla
        if zone_id in active_zones:
            await _safe_stop_zone(zone_id)
    except asyncio.CancelledError:
        # Normale quando zona fermata manualmente
        pass
    except Exception as e:
        log_event(f"Errore nel timer zona {zone_id}: {e}", "ERROR")

async def _safe_stop_zone(zone_id):
    """
    Versione sicura e asincrona di stop_zone che può essere chiamata dal timer.
    
    Args:
        zone_id: ID della zona da disattivare
    """
    global active_zones, zone_pins, safety_relay
    
    try:
        zone_id = int(zone_id)
    except:
        return

    if zone_id not in zone_pins or zone_id not in active_zones:
        return

    # Disattiva la zona
    try:
        zone_pins[zone_id].value(1)  # Disattiva la zona (logica attiva bassa)
        log_event(f"Zona {zone_id} arrestata automaticamente", "INFO")
    except Exception as e:
        log_event(f"Errore arresto automatico zona {zone_id}: {e}", "ERROR")
        return
    
    # Memorizza se questa era l'ultima zona attiva
    was_last_active = len(active_zones) == 1
    
    # Rimuovi la zona dalle zone attive
    del active_zones[zone_id]
    
    # Spegni il relè di sicurezza se necessario
    if safety_relay and was_last_active:
        try:
            safety_relay.value(1)  # Disattiva il relè di sicurezza (logica attiva bassa)
            log_event("Relè di sicurezza disattivato", "INFO")
        except Exception as e:
            log_event(f"Errore spegnimento relè sicurezza: {e}", "ERROR")

def stop_zone(zone_id):
    """
    Disattiva una zona di irrigazione.
    
    Args:
        zone_id: ID della zona da disattivare
        
    Returns:
        boolean: True se l'operazione è riuscita, False altrimenti
    """
    global active_zones, zone_pins, safety_relay
    
    # Valida parametri
    try:
        zone_id = int(zone_id)
    except (ValueError, TypeError):
        log_event(f"Errore: ID zona non valido in stop_zone", "ERROR")
        return False

    # Verifica esistenza zona
    if zone_id not in zone_pins:
        log_event(f"Errore: Zona {zone_id} non trovata", "ERROR")
        return False

    # Verifica stato zona
    was_active = zone_id in active_zones
    was_last_active = was_active and len(active_zones) == 1
    zone_data = active_zones.get(zone_id)
    
    # Se la zona non è attiva, lo consideriamo un successo
    if not was_active:
        log_event(f"Zona {zone_id} già disattivata", "INFO")
        return True
    
    # Disattiva la zona
    try:
        zone_pins[zone_id].value(1)  # Disattiva la zona (logica attiva bassa)
        log_event(f"Zona {zone_id} arrestata manualmente", "INFO")
    except Exception as e:
        log_event(f"Errore arresto zona {zone_id}: {e}", "ERROR")
        return False

    # Aggiorna stato e cancella task
    if zone_id in active_zones:
        # Cancella eventuale task
        if zone_data and 'task' in zone_data and zone_data['task']:
            try:
                task = zone_data['task']
                task.cancel()
            except Exception as e:
                log_event(f"Errore cancellazione task zona {zone_id}: {e}", "WARNING")
                
        # Rimuovi zona dalla lista attive
        del active_zones[zone_id]

    # Disattiva relè sicurezza se necessario
    if safety_relay and was_last_active and not active_zones:
        try:
            safety_relay.value(1)  # Disattiva il relè di sicurezza (logica attiva bassa)
            log_event("Relè di sicurezza disattivato", "INFO")
        except Exception as e:
            log_event(f"Errore spegnimento relè sicurezza: {e}", "ERROR")
            # Continuiamo comunque, la zona è stata disattivata
    
    # Verifica che la zona sia stata effettivamente disattivata
    try:
        if zone_id in zone_pins and zone_pins[zone_id].value() != 1:
            # Tentativo aggiuntivo di disattivazione
            zone_pins[zone_id].value(1)
            log_event(f"Tentativo aggiuntivo di disattivazione zona {zone_id}", "WARNING")
    except Exception:
        pass
            
    return True

def stop_all_zones():
    """
    Disattiva tutte le zone attive in modo sicuro e resiliente.
    
    Returns:
        boolean: True se l'operazione è riuscita, False altrimenti
    """
    global active_zones, zone_pins, safety_relay
    
    # Se non ci sono zone attive, non fare nulla
    if not active_zones:
        return True
        
    success = True
    
    # Crea copia delle chiavi per evitare errori durante l'iterazione
    zone_ids = list(active_zones.keys())
    
    # Prima fase: disattiva ogni zona
    for zone_id in zone_ids:
        if not stop_zone(zone_id):
            success = False
    
    # Seconda fase: verifica e forzatura
    if active_zones:
        log_event("Forzatura disattivazione zone rimanenti", "WARNING")
        remaining_ids = list(active_zones.keys())
        
        for zone_id in remaining_ids:
            try:
                # Disattiva direttamente il pin
                if zone_id in zone_pins:
                    zone_pins[zone_id].value(1)
                
                # Cancella task se possibile
                if zone_id in active_zones and 'task' in active_zones[zone_id]:
                    try:
                        task = active_zones[zone_id]['task']
                        if task:
                            try:
                                task.cancel()
                            except Exception as e:
                                log_event(f"Errore cancellazione task zona {zoneId}: {e}", "WARNING")
                    except:
                        pass
                
                # Rimuovi dalla lista attive
                if zone_id in active_zones:
                    del active_zones[zone_id]
                
            except Exception as e:
                log_event(f"Errore disattivazione forzata zona {zone_id}: {e}", "ERROR")
                success = False
    
    # Disattiva sempre il relè di sicurezza
    if safety_relay:
        try:
            safety_relay.value(1)  # Disattiva il relè di sicurezza
            log_event("Relè di sicurezza disattivato", "INFO")
        except Exception as e:
            log_event(f"Errore disattivazione relè sicurezza: {e}", "ERROR")
            success = False
    
    # Pulizia finale forzata
    active_zones.clear()
    
    return success