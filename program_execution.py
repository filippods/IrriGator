"""
Modulo per l'esecuzione dei programmi di irrigazione.
Gestisce l'esecuzione e l'interruzione dei programmi in modo sicuro.
"""
import time
import uasyncio as asyncio
from log_manager import log_event
from program_state import program_running, current_program_id, save_program_state, load_program_state
from zone_manager import start_zone, stop_zone, stop_all_zones, get_active_zones_count
from settings_manager import load_user_settings

async def execute_program(program, manual=False):
    """
    Esegue un programma di irrigazione con gestione robusta degli errori e
    protezione contro stati inconsistenti.
    
    Args:
        program: Programma da eseguire
        manual: Flag che indica se l'esecuzione è manuale
        
    Returns:
        boolean: True se l'esecuzione è completata con successo, False altrimenti
    """
    if not isinstance(program, dict):
        log_event("Tentativo di eseguire un programma non valido", "ERROR")
        return False
    
    # Ricarica lo stato per assicurarsi di avere dati aggiornati
    load_program_state()
    
    # Riferimento esplicito alle variabili globali
    global program_running, current_program_id
    
    if program_running:
        successful_execution = True
        # Importazione locale per evitare dipendenze circolari
        from program_manager import update_last_run_date
        update_last_run_date(program_id)
        log_event(f"Programma {program_name} completato con successo", "INFO")

    # Controllo migliorato delle zone attive: sempre arrestare tutte le zone manuali
    # prima di avviare un programma (automatico o manuale)
    active_count = get_active_zones_count()
    if active_count > 0:
        log_event(f"Arresto zone attive per dare priorità al programma {'manuale' if manual else 'automatico'}", "INFO")
        try:
            # Primo tentativo di arresto con logging dettagliato
            if not stop_all_zones():
                log_event("Errore durante il primo tentativo di arresto zone attive", "WARNING")
                # Secondo tentativo di arresto dopo una breve pausa
                await asyncio.sleep(1)
                if not stop_all_zones():
                    log_event("Errore critico: impossibile arrestare le zone attive", "ERROR")
                    return False
        except Exception as e:
            log_event(f"Eccezione durante l'arresto delle zone attive: {e}", "ERROR")
            # Tenta comunque di continuare, ma con cautela

    # Assicurazione finale che tutte le zone siano disattivate
    try:
        # Verifica esplicita che tutte le zone siano arrestate
        if not stop_all_zones():
            log_event("Errore durante l'arresto delle zone, tentativo di recupero", "ERROR")
            # Ultimo tentativo disperato con attesa più lunga
            await asyncio.sleep(2)
            if not stop_all_zones():
                log_event("Impossibile garantire l'arresto di tutte le zone, annullamento avvio programma", "ERROR")
                return False
    except Exception as e:
        log_event(f"Eccezione grave durante l'arresto delle zone: {e}", "ERROR")
        return False

    # Ottieni l'ID del programma
    program_id = str(program.get('id', '0'))
    program_name = program.get('name', 'Senza nome')
    
    # FASE 1: Imposta lo stato del programma
    program_running = True
    current_program_id = program_id
    
    # Salva lo stato aggiornato su file
    save_program_state()
    
    # FASE 2: Verifica che lo stato sia stato salvato correttamente
    # Effettua più tentativi per garantire che lo stato sia persistente
    state_persisted = False
    for retry in range(3):  # Massimo 3 tentativi
        # Verifica lo stato salvato
        load_program_state()
        
        if program_running and current_program_id == program_id:
            state_persisted = True
            break
        
        # Se lo stato non è corretto, lo reimpostiamo e risalviamo
        log_event(f"Stato programma non persistito, tentativo {retry + 1}/3", "WARNING")
        program_running = True
        current_program_id = program_id
        save_program_state()
        
        await asyncio.sleep(0.2)  # Breve pausa tra i tentativi
    
    if not state_persisted:
        log_event("IMPORTANTE: Impossibile persistere lo stato del programma", "ERROR")
    
    # FASE 3: Esecuzione del programma
    program_name = program.get('name', 'Senza nome')
    log_event(f"Avvio programma: {program_name} (ID: {program_id})", "INFO")

    # Carica le impostazioni utente per il ritardo di attivazione
    settings = load_user_settings()
    activation_delay = settings.get('activation_delay', 0)
    
    # Flag per tracciare il successo dell'esecuzione
    successful_execution = False
    
    try:
        # Esegui i passaggi del programma
        steps = program.get('steps', [])
        
        # Validation: verifica che gli steps siano in formato valido
        if not isinstance(steps, list):
            log_event(f"Formato steps non valido nel programma {program_id}", "ERROR")
            raise ValueError("Formato steps non valido")
        
        for i, step in enumerate(steps):
            # Verifica periodicamente se il programma è stato interrotto
            load_program_state()
            
            if not program_running:
                log_event("Programma interrotto dall'utente", "INFO")
                break

            # Verifica che lo step sia valido
            if not isinstance(step, dict):
                log_event(f"Step {i+1} non valido, ignorato", "WARNING")
                continue
                
            zone_id = step.get('zone_id')
            duration = step.get('duration', 1)
            
            if zone_id is None:
                log_event(f"Errore nel passo {i+1}: zone_id mancante", "ERROR")
                continue
                
            log_event(f"Attivazione zona {zone_id} per {duration} minuti", "INFO")
            
            # FASE 3.1: Attiva la zona
            result = start_zone(zone_id, duration)
            if not result:
                log_event(f"Errore nell'attivazione della zona {zone_id}", "ERROR")
                continue
                
            # FASE 3.2: Attendi per la durata specificata
            # Suddividi l'attesa in intervalli più brevi per verificare interruzioni
            remaining_seconds = duration * 60
            check_interval = 10  # Verifica ogni 10 secondi
            
            while remaining_seconds > 0 and program_running:
                # Determina il tempo di attesa per questo ciclo
                wait_time = min(check_interval, remaining_seconds)
                
                # Attendi
                await asyncio.sleep(wait_time)
                remaining_seconds -= wait_time
                
                # Verifica lo stato del programma
                load_program_state()
                
                if not program_running:
                    log_event("Programma interrotto durante l'esecuzione di uno step", "INFO")
                    break
            
            # Se il programma è stato interrotto, esci dal ciclo degli step
            if not program_running:
                break
                
            # FASE 3.3: Ferma la zona
            if not stop_zone(zone_id):
                log_event(f"Errore nell'arresto della zona {zone_id}", "WARNING")
                
            log_event(f"Zona {zone_id} completata", "INFO")

            # Gestione del ritardo tra zone
            if activation_delay > 0 and i < len(steps) - 1:
                # Converti il ritardo in secondi
                delay_in_seconds = activation_delay
                log_event(f"Attesa {delay_in_seconds} secondi prima della prossima zona", "INFO")

                # Suddividi il ritardo in intervalli più brevi per controllo interruzioni
                remaining_delay = delay_in_seconds
                while remaining_delay > 0 and program_running:
                    wait_time = min(check_interval, remaining_delay)
                    await asyncio.sleep(wait_time)
                    remaining_delay -= wait_time

                    # Verifica lo stato del programma (potrebbe essere stato interrotto)
                    load_program_state()

                    if not program_running:
                        log_event("Ritardo interrotto: programma fermato", "INFO")
                        break
        
        # FASE 4: Verifica se l'esecuzione è stata completata con successo
        # Se siamo arrivati qui e il programma è ancora in esecuzione, 
        # significa che tutti gli step sono stati completati
        if program_running:
            successful_execution = True
            update_last_run_date(program_id)
            log_event(f"Programma {program_name} completato con successo", "INFO")
        
        return successful_execution
    
    except Exception as e:
        log_event(f"Errore durante l'esecuzione del programma {program_name}: {e}", "ERROR")
        return False
    finally:
        # FASE 5: Pulizia finale - questi passaggi vengono eseguiti sempre
        try:
            # Aggiorna lo stato del programma
            program_running = False
            current_program_id = None
            save_program_state()
            
            # Assicurati che tutte le zone siano disattivate
            stop_all_zones()
        except Exception as final_e:
            log_event(f"Errore durante la pulizia finale: {final_e}", "ERROR")

def stop_program():
    """
    Ferma il programma attualmente in esecuzione con protezioni 
    contro stati inconsistenti.
    
    Returns:
        boolean: True se l'operazione è riuscita, False altrimenti
    """
    global program_running, current_program_id
    
    # Salva i valori originali per la verifica
    original_running = program_running
    original_id = current_program_id
    
    # Ricarica lo stato per assicurarsi di avere dati aggiornati
    load_program_state()
    
    # Verifica di coerenza: se non era in esecuzione prima ma ora lo è,
    # considera lo stato originale più attendibile
    # Questo gestisce i casi di race condition nei caricamenti da file
    if not program_running and original_running:
        log_event(f"Stato incoerente durante arresto: era {original_running}, ora {program_running}", "WARNING")
        program_running = True
        current_program_id = original_id
    
    # Se non c'è nessun programma in esecuzione, non fare nulla
    if not program_running:
        log_event("Nessun programma in esecuzione da interrompere", "INFO")
        return False
        
    # FASE 1: Log dell'operazione
    prog_id = current_program_id or "sconosciuto"
    log_event(f"Interruzione programma {prog_id} in corso", "INFO")
    
    # FASE 2: Arresta tutte le zone prima di aggiornare lo stato
    # Questo evita che il programma venga marcato come interrotto ma le zone rimangano attive
    try:
        if not stop_all_zones():
            log_event("Errore nell'arresto delle zone durante l'interruzione", "ERROR")
        else:
            log_event("Tutte le zone arrestate correttamente", "INFO")
    except Exception as e:
        log_event(f"Eccezione durante l'arresto delle zone: {e}", "ERROR")
    
    # FASE 3: Aggiorna lo stato del programma
    program_running = False
    current_program_id = None
    
    # FASE 4: Salva lo stato e verifica
    save_program_state()
    
    # Esegui più tentativi per garantire che lo stato sia persistito
    state_saved = False
    for retry in range(3):
        # Verifica lo stato salvato
        original_running = program_running
        original_id = current_program_id
        
        # Ricarica lo stato
        load_program_state()
        
        # Verifica che lo stato sia stato salvato correttamente
        if program_running == original_running and current_program_id == original_id:
            state_saved = True
            break
        
        # Se lo stato non è stato salvato correttamente, risalva
        log_event(f"Stato non persistito durante arresto, tentativo {retry + 1}/3", "WARNING")
        program_running = original_running
        current_program_id = original_id
        save_program_state()
        
        time.sleep(0.2)  # Breve pausa tra i tentativi
    
    if not state_saved:
        log_event("IMPORTANTE: Impossibile persistere stato del programma dopo arresto", "ERROR")
        
    return True

def reset_program_state():
    """
    Resetta lo stato del programma.
    """
    global program_running, current_program_id
    
    # Ferma eventuali zone attive
    try:
        stop_all_zones()
    except Exception as e:
        log_event(f"Errore durante l'arresto delle zone nel reset: {e}", "ERROR")
    
    # Resetta le variabili di stato
    program_running = False
    current_program_id = None
    
    # Salva lo stato su file
    save_program_state()
    log_event("Stato del programma resettato", "INFO")

def get_program_state():
    """
    Ottiene lo stato attuale del programma inclusa la zona attiva.
    Questo è cruciale per l'interfaccia utente.
    
    Returns:
        dict: Stato del programma con informazioni sulla zona attiva
    """
    load_program_state()
    
    state = {
        'program_running': program_running,
        'current_program_id': current_program_id,
        'active_zone': None
    }
    
    # Se c'è un programma in esecuzione, aggiungi informazioni sulla zona attiva
    if program_running:
        # Ottieni lo stato delle zone
        from zone_manager import get_zones_status
        zones_status = get_zones_status()
        # Trova la zona attiva
        active_zones_list = [zone for zone in zones_status if zone.get('active', False)]
        if active_zones_list:
            # Prendi la prima zona attiva (dovrebbe essere solo una durante un programma)
            state['active_zone'] = active_zones_list[0]
    
    return state