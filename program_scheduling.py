"""
Modulo per la gestione della pianificazione e verifica dei programmi di irrigazione.
"""
import time
import uasyncio as asyncio
from log_manager import log_event
from program_state import load_program_state, program_running
from zone_manager import get_active_zones_count, stop_all_zones
from utils import day_of_year, is_leap_year
from settings_manager import load_user_settings

def is_program_active_in_current_month(program):
    """
    Controlla se il programma è attivo nel mese corrente.
    
    Args:
        program: Programma da verificare
        
    Returns:
        boolean: True se il programma è attivo nel mese corrente, False altrimenti
    """
    if not isinstance(program, dict):
        return False
        
    program_months = program.get('months', [])
    if not program_months:
        return False
        
    current_month = time.localtime()[1]
    
    # Mappa dei nomi dei mesi italiani ai numeri di mese
    months_map = {
        "Gennaio": 1, "Febbraio": 2, "Marzo": 3, "Aprile": 4,
        "Maggio": 5, "Giugno": 6, "Luglio": 7, "Agosto": 8,
        "Settembre": 9, "Ottobre": 10, "Novembre": 11, "Dicembre": 12
    }
    
    # Converti i nomi dei mesi in numeri
    program_month_numbers = [months_map.get(month, 0) for month in program_months]
    
    return current_month in program_month_numbers

def is_program_due_today(program):
    """
    Verifica se il programma è previsto per oggi in base alla cadenza.
    
    Args:
        program: Programma da verificare
        
    Returns:
        boolean: True se il programma è previsto per oggi, False altrimenti
    """
    if not isinstance(program, dict):
        return False
        
    # Ottieni la data corrente
    current_time = time.localtime()
    current_year = current_time[0]
    current_month = current_time[1]
    current_day = current_time[2]
    
    # Calcola il giorno dell'anno corrente
    current_day_of_year = day_of_year(current_year, current_month, current_day)
    
    # Default: non eseguito mai (-1) o giorno diverso
    last_run_day = -1
    last_run_year = -1  # Aggiungiamo l'anno per gestire cambio anno

    # Estrai la data dell'ultima esecuzione
    if 'last_run_date' in program:
        try:
            last_run_date = program['last_run_date']
            date_parts = last_run_date.split('-')
            if len(date_parts) == 3:
                year, month, day = int(date_parts[0]), int(date_parts[1]), int(date_parts[2])
                last_run_day = day_of_year(year, month, day)
                last_run_year = year
            else:
                log_event(f"Formato data non valido: {last_run_date}", "ERROR")
        except Exception as e:
            log_event(f"Errore nella conversione della data di esecuzione: {e}", "ERROR")

    # Log per debug
    program_name = program.get('name', 'Senza nome')
    log_event(f"Verifica esecuzione per '{program_name}': ultima esecuzione {last_run_year}-{last_run_day}, oggi {current_year}-{current_day_of_year}", "DEBUG")

    # Se non è mai stato eseguito, eseguilo oggi
    if last_run_day == -1:
        return True

    # Determina la cadenza del programma
    recurrence = program.get('recurrence', 'giornaliero')
    
    # Gestisci il cambio di anno
    days_since_last_run = 0
    if last_run_year == current_year:
        days_since_last_run = current_day_of_year - last_run_day
    else:
        # Se l'anno è diverso, calcola i giorni rimanenti nell'anno precedente
        # + i giorni trascorsi nell'anno corrente
        days_in_last_year = 366 if is_leap_year(last_run_year) else 365
        days_since_last_run = (days_in_last_year - last_run_day) + current_day_of_year
    
    log_event(f"Giorni dall'ultima esecuzione di '{program_name}': {days_since_last_run}", "DEBUG")
    
    # Verifica basata sulla cadenza
    if recurrence == 'giornaliero':
        # Il programma è previsto ogni giorno, ma non più volte al giorno
        return days_since_last_run >= 1
    
    elif recurrence == 'giorni_alterni':
        # Il programma è previsto ogni 2 giorni
        return days_since_last_run >= 2
        
    elif recurrence == 'personalizzata':
        # Il programma è previsto ogni intervallo_giorni
        interval_days = program.get('interval_days', 1)
        # Assicura che l'intervallo sia almeno 1
        if interval_days <= 0:
            interval_days = 1
        return days_since_last_run >= interval_days
    
    # Per valori di recurrence sconosciuti, non eseguire
    return False
    
async def check_programs():
    """
    Verifica se ci sono programmi da eseguire con gestione degli errori migliorata.
    """
    try:
        # Verifica impostazioni
        settings = load_user_settings()
        enabled = settings.get('automatic_programs_enabled', False)
        
        # Log breve
        log_event("Controllo programmi - Attivi: " + str(enabled), "DEBUG")
        
        if not enabled:
            return
        
        # Verifica stato
        load_program_state()
        if program_running:
            return
            
        # Carica programmi
        from program_manager import load_programs
        programs = load_programs()
        if not programs:
            return
        
        # Ora corrente
        t = time.localtime()
        hour = t[3]
        minute = t[4]
        
        # Controlla programmi
        for pid in programs:
            prog = programs[pid]
            if not isinstance(prog, dict):
                continue
                
            # Verifica automatico
            auto = prog.get('automatic_enabled', True)
            if not auto:
                continue
                
            # Verifica orario
            act_time = prog.get('activation_time', '')
            if not act_time:
                continue
            
            # Analizza orario
            parts = act_time.split(':')
            if len(parts) != 2:
                continue
                
            try:
                act_hour = int(parts[0])
                act_minute = int(parts[1])
                
                # Verifica corrispondenza con tolleranza di 1 minuto
                match = False
                if hour == act_hour and minute == act_minute:
                    match = True
                elif hour == act_hour and minute == act_minute - 1:
                    match = True
                elif act_minute == 0 and minute == 59 and hour == act_hour - 1:
                    match = True
                
                # Verifica esecuzione oggi
                if match:
                    active = is_program_active_in_current_month(prog)
                    due = is_program_due_today(prog)
                    
                    if active and due:
                        # Ricarica stato per sicurezza
                        load_program_state()
                        if program_running:
                            continue
                        
                        # Esegui programma
                        try:
                            # Ferma zone attive
                            count = get_active_zones_count()
                            if count > 0:
                                stop_all_zones()
                                await asyncio.sleep(1)
                            
                            # Avvia programma
                            from program_execution import execute_program
                            await execute_program(prog)
                        except Exception as e:
                            log_event("Errore esecuzione: " + str(e), "ERROR")
            except (ValueError, TypeError) as e:
                log_event(f"Errore parsing orario per programma {pid}: {e}", "ERROR")
                continue
                
    except Exception as e:
        log_event("Errore check_programs: " + str(e), "ERROR")