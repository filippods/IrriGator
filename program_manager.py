"""
Modulo per la gestione dei programmi di irrigazione.
Gestisce il caricamento, la creazione, l'aggiornamento e l'esecuzione dei programmi.
"""
import ujson
import time
import uos as os
from utils import ensure_directory_exists, get_current_date, get_dirname
from log_manager import log_event

# IMPORTANTE: Ri-esportiamo funzioni dai nuovi moduli modulari
# per mantenere la compatibilità con le importazioni esistenti
from program_execution import execute_program, stop_program, reset_program_state
from program_scheduling import check_programs, is_program_active_in_current_month, is_program_due_today

# Percorsi dei file
PROGRAM_FILE = '/data/program.json'

# Cache per i programmi - ottimizza le operazioni di lettura/scrittura
_programs_cache = None
_programs_cache_valid = False

def _ensure_programs_file_exists():
    """
    Assicura che il file dei programmi esista.
    """
    try:
        # Verifica se il file esiste
        try:
            with open(PROGRAM_FILE, 'r') as f:
                return
        except OSError:
            # Il file non esiste, crealo
            dirname = PROGRAM_FILE.rsplit('/', 1)[0] if '/' in PROGRAM_FILE else ''
            if dirname:
                ensure_directory_exists(dirname)
            with open(PROGRAM_FILE, 'w') as f:
                ujson.dump({}, f)
            log_event("File programmi creato", "INFO")
    except Exception as e:
        log_event("Errore nella verifica/creazione del file programmi: " + str(e), "ERROR")

def load_programs(force_reload=False):
    """
    Carica i programmi dal file con supporto alla cache.
    
    Args:
        force_reload: Se True, ricarica dal disco anche se la cache è valida
        
    Returns:
        dict: Dizionario dei programmi
    """
    global _programs_cache, _programs_cache_valid
    
    # Se la cache è valida e non è richiesto un ricaricamento forzato, usa la cache
    if _programs_cache_valid and not force_reload and _programs_cache is not None:
        return _programs_cache.copy()  # Ritorna una copia per sicurezza
    
    try:
        _ensure_programs_file_exists()
        
        with open(PROGRAM_FILE, 'r') as f:
            programs = ujson.load(f)
            
            # Validazione del formato
            if not isinstance(programs, dict):
                log_event("Formato file programmi non valido, inizializzazione nuovo file", "WARNING")
                programs = {}
                save_programs(programs)
            
            # Assicura che tutti gli ID siano stringhe e ogni programma abbia il suo ID
            for prog_id in list(programs.keys()):
                if not isinstance(programs[prog_id], dict):
                    # Rimuovi programmi non validi
                    del programs[prog_id]
                    continue
                    
                # Assicura che l'ID sia salvato nel programma stesso
                programs[prog_id]['id'] = str(prog_id)
            
            # Aggiorna la cache
            _programs_cache = programs.copy()
            _programs_cache_valid = True
            
            return programs
    except OSError:
        log_event("File program.json non trovato, creazione file vuoto", "WARNING")
        empty_programs = {}
        save_programs(empty_programs)
        
        # Aggiorna la cache
        _programs_cache = empty_programs.copy()
        _programs_cache_valid = True
        
        return empty_programs
    except Exception as e:
        log_event(f"Errore caricamento programmi: {e}", "ERROR")
        # In caso di errore, ritorna un dizionario vuoto
        return {}

def save_programs(programs):
    """
    Salva i programmi su file in modo atomico.
    
    Args:
        programs: Dizionario dei programmi da salvare
        
    Returns:
        boolean: True se l'operazione è riuscita, False altrimenti
    """
    global _programs_cache, _programs_cache_valid
    
    if not isinstance(programs, dict):
        log_event("Errore: tentativo di salvare programmi non validi", "ERROR")
        return False
    
    try:
        # Assicura che la directory esista
        ensure_directory_exists(get_dirname(PROGRAM_FILE))
        
        # Scrittura atomica tramite file temporaneo
        temp_file = PROGRAM_FILE + '.tmp'
        with open(temp_file, 'w') as f:
            ujson.dump(programs, f)
            f.flush()  # Flush esplicito per garantire la scrittura su disco
        
        # Rinomina il file temporaneo (operazione atomica su molti filesystem)
        os.rename(temp_file, PROGRAM_FILE)
        
        # Aggiorna la cache
        _programs_cache = programs.copy()
        _programs_cache_valid = True
        
        log_event("Programmi salvati con successo", "INFO")
        return True
    except Exception as e:
        log_event(f"Errore salvataggio programmi: {e}", "ERROR")
        # Invalida la cache in caso di errore
        _programs_cache_valid = False
        return False

def invalidate_programs_cache():
    """
    Invalida la cache dei programmi, forzando una rilettura alla prossima richiesta.
    """
    global _programs_cache_valid
    _programs_cache_valid = False

def check_program_conflicts(program, programs, exclude_id=None):
    """
    Verifica se ci sono conflitti tra programmi negli stessi mesi e con lo stesso orario.
    
    Args:
        program: Programma da verificare
        programs: Dizionario di tutti i programmi
        exclude_id: ID del programma da escludere dalla verifica (per l'aggiornamento)
        
    Returns:
        tuple: (has_conflict, conflict_message)
    """
    # Validazione degli input
    if not isinstance(program, dict) or not isinstance(programs, dict):
        return False, ""
    
    # Estrai i mesi e l'orario dal programma
    program_months = set(program.get('months', []))
    if not program_months:
        return False, ""
    
    program_time = program.get('activation_time', '')
    if not program_time:
        return False, ""  # Senza orario non ci possono essere conflitti
    
    # Converti exclude_id a stringa se non è None
    if exclude_id is not None:
        exclude_id = str(exclude_id)
    
    # Verifica i conflitti con altri programmi
    for pid, existing_program in programs.items():
        # Salta il programma stesso durante la modifica
        if exclude_id and str(pid) == exclude_id:
            continue
            
        # Salta i programmi non validi
        if not isinstance(existing_program, dict):
            continue
            
        # Estrai mesi e orario dal programma esistente
        existing_months = set(existing_program.get('months', []))
        existing_time = existing_program.get('activation_time', '')
        
        # Verifica se c'è sovrapposizione nei mesi E lo stesso orario di attivazione
        if program_months.intersection(existing_months) and program_time == existing_time:
            # C'è una sovrapposizione nei mesi e lo stesso orario
            program_name = existing_program.get('name', f'Programma {pid}')
            return True, f"Conflitto con '{program_name}' nei mesi e orario selezionati"
    
    return False, ""

def update_program(program_id, updated_program):
    """
    Aggiorna un programma esistente.
    """
    # Validazione degli input
    if not isinstance(updated_program, dict):
        return False, "Formato programma non valido"
    
    program_id = str(program_id)  # Assicura che l'ID sia una stringa
    programs = load_programs(force_reload=True)
    
    # Verifica conflitti
    has_conflict, conflict_message = check_program_conflicts(updated_program, programs, exclude_id=program_id)
    if has_conflict:
        log_event(f"Conflitto programma: {conflict_message}", "WARNING")
        return False, conflict_message
    
    if program_id in programs:
        # Se il programma è in esecuzione, fermalo prima di aggiornarlo
        from program_state import load_program_state, program_running, current_program_id
        # Importazione locale per evitare dipendenze circolari
        from program_execution import stop_program
        
        load_program_state()  # Forza il caricamento dello stato più recente
        if program_running and current_program_id == program_id:
            stop_program()
            
        # Assicurati che l'ID del programma sia preservato
        updated_program['id'] = program_id
        programs[program_id] = updated_program
        
        if save_programs(programs):
            log_event(f"Programma {program_id} aggiornato con successo", "INFO")
            return True, ""
        else:
            error_msg = f"Errore durante il salvataggio del programma {program_id}"
            log_event(error_msg, "ERROR")
            return False, error_msg
    else:
        error_msg = f"Programma con ID {program_id} non trovato"
        log_event(error_msg, "ERROR")
        return False, error_msg

def delete_program(program_id):
    """
    Elimina un programma.
    """
    program_id = str(program_id)  # Assicura che l'ID sia una stringa
    programs = load_programs(force_reload=True)
    
    if program_id in programs:
        # Se il programma è in esecuzione, fermalo prima di eliminarlo
        from program_state import load_program_state, program_running, current_program_id
        # Importazione locale per evitare dipendenze circolari
        from program_execution import stop_program
        
        load_program_state()  # Forza il caricamento dello stato più recente
        if program_running and current_program_id == program_id:
            stop_program()
            
        # Rimuovi il programma
        del programs[program_id]
        
        if save_programs(programs):
            log_event(f"Programma {program_id} eliminato con successo", "INFO")
            return True
        else:
            log_event(f"Errore durante l'eliminazione del programma {program_id}", "ERROR")
            return False
    else:
        log_event(f"Errore: programma con ID {program_id} non trovato", "ERROR")
        return False

def update_last_run_date(program_id):
    """
    Aggiorna la data dell'ultima esecuzione del programma.
    
    Args:
        program_id: ID del programma
    """
    program_id = str(program_id)  # Assicura che l'ID sia una stringa
    current_date = get_current_date()
    
    try:
        programs = load_programs(force_reload=True)
        
        if program_id in programs:
            programs[program_id]['last_run_date'] = current_date
            save_programs(programs)
            log_event(f"Data ultima esecuzione aggiornata: programma {program_id}, data {current_date}", "INFO")
        else:
            log_event(f"Impossibile aggiornare data: programma {program_id} non trovato", "WARNING")
    except Exception as e:
        log_event(f"Errore nell'aggiornamento della data di esecuzione: {e}", "ERROR")