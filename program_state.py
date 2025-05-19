"""
Modulo per la gestione dello stato del programma.
Contiene variabili globali e funzioni per gestire lo stato di esecuzione dei programmi.
"""
import ujson
import uos as os
from log_manager import log_event
from utils import ensure_directory_exists, get_dirname

# Variabili globali per gestire lo stato del programma
program_running = False
current_program_id = None
PROGRAM_STATE_FILE = '/data/program_state.json'
_last_saved_state = None  # Cache per ottimizzare le verifiche

# In program_state.py, modifica la funzione save_program_state()
def save_program_state():
    global program_running, current_program_id, _last_saved_state
    
    try:
        # Prepara i dati da salvare
        state_data = {
            'program_running': program_running, 
            'current_program_id': current_program_id
        }
        
        # Salva lo stato attuale per confronti futuri
        _last_saved_state = {
            'program_running': program_running,
            'current_program_id': current_program_id
        }
        
        # Assicurati che la directory esista
        from utils import ensure_directory_exists
        ensure_directory_exists(get_dirname(PROGRAM_STATE_FILE))
            
        # Usa la modalità più sicura di scrittura: scrivi in un file temporaneo e poi rinomina
        temp_file = PROGRAM_STATE_FILE + '.tmp'
        
        with open(temp_file, 'w') as f:
            ujson.dump(state_data, f)
            # Forza il flush dei dati sul disco
            f.flush()
            
        # Rinomina il file temporaneo (operazione atomica su molti filesystem)
        os.rename(temp_file, PROGRAM_STATE_FILE)
        
        # Verifica immediatamente che i dati siano stati scritti correttamente
        verify_save()
        
    except OSError as e:
        log_event(f"Errore durante il salvataggio dello stato: {e}", "ERROR")
    except Exception as e:
        log_event(f"Errore imprevisto nel salvataggio stato: {e}", "ERROR")

def verify_save():
    """
    Verifica che lo stato del programma sia stato salvato correttamente.
    Riprova il salvataggio se la verifica fallisce.
    """
    global program_running, current_program_id, _last_saved_state
    
    try:
        with open(PROGRAM_STATE_FILE, 'r') as f:
            state = ujson.load(f)
            
            # Verifica che i dati siano validi
            if not isinstance(state, dict):
                raise ValueError("Formato stato non valido")
                
            # Verifica che lo stato salvato corrisponda allo stato che dovevamo salvare
            if (state.get('program_running') != _last_saved_state['program_running'] or 
                state.get('current_program_id') != _last_saved_state['current_program_id']):
                
                log_event("Verifica salvataggio fallita: discrepanza nello stato. Nuovo tentativo.", "WARNING")
                
                # Riscrivi il file con i dati corretti
                with open(PROGRAM_STATE_FILE, 'w') as f2:
                    ujson.dump(_last_saved_state, f2)
                    f2.flush()
                    
    except (OSError, ValueError) as e:
        log_event(f"Errore nella verifica del salvataggio: {e}", "WARNING")
        
        # Tenta di riscrivere il file
        try:
            with open(PROGRAM_STATE_FILE, 'w') as f:
                ujson.dump(_last_saved_state, f)
                f.flush()
        except Exception as write_error:
            log_event(f"Fallito tentativo di correzione stato: {write_error}", "ERROR")

def load_program_state():
    """
    Carica lo stato del programma dal file.
    Implementa meccanismi di difesa contro la corruzione dei dati e stati incoerenti.
    Aggiorna le variabili globali program_running e current_program_id.
    """
    global program_running, current_program_id
    
    # Salva i valori correnti per il debug e la gestione delle incoerenze
    previous_running = program_running
    previous_id = current_program_id
    
    try:
        with open(PROGRAM_STATE_FILE, 'r') as f:
            try:
                state = ujson.load(f)
                
                # Validazione dei dati
                if not isinstance(state, dict):
                    raise ValueError("Formato stato non valido")
                
                loaded_running = state.get('program_running')
                loaded_id = state.get('current_program_id')
                
                # Protezione contro stati incoerenti
                # Non sovrascrivere lo stato attivo con quello inattivo
                # Questa protezione evita race condition dove un programma 
                # potrebbe essere disattivato erroneamente
                if loaded_running is not None:
                    # Caso speciale: un programma risulta in esecuzione (true) in memoria 
                    # ma non sul disco (false) - mantieni lo stato attivo
                    if not loaded_running and program_running:
                        log_event("Incoerenza stato rilevata: mantenuto stato attivo", "WARNING")
                        # Salva lo stato attuale per correggere il file
                        save_program_state()
                    else:
                        # Altrimenti, usa il valore caricato
                        program_running = bool(loaded_running)
                        
                # Aggiorna l'ID solo se ce n'è uno nuovo e valido
                # o se il programma non è in esecuzione (in quel caso, l'ID deve essere None)
                if loaded_id is not None:
                    current_program_id = loaded_id
                elif not loaded_running:
                    current_program_id = None
                elif loaded_running and current_program_id is None:
                    log_event("Stato anomalo: programma in esecuzione ma ID mancante", "WARNING")
                
                # Log solo se lo stato è cambiato (per ridurre il rumore nei log)
                if previous_running != program_running or previous_id != current_program_id:
                    log_event(f"Stato programma aggiornato: running={program_running}, id={current_program_id}", "INFO")
                    
                # Aggiorna la cache dello stato salvato
                _last_saved_state = {
                    'program_running': program_running,
                    'current_program_id': current_program_id
                }
                
            except ValueError as e:
                # Errore nella decodifica JSON, reinizializza lo stato con cautela
                log_event(f"Errore decodifica JSON file stato: {e}. Reimpostazione stato.", "WARNING")
                
                # Se non c'è già un programma in esecuzione, inizializza lo stato
                # Altrimenti mantieni lo stato corrente e risalva
                if not program_running:
                    program_running = False
                    current_program_id = None
                
                save_program_state()
                
    except OSError as e:
        # File non trovato, inizializza lo stato
        log_event(f"File stato non trovato: {e}. Creazione nuovo file.", "INFO")
        
        # Preserva lo stato corrente se un programma è già in esecuzione
        if not program_running:
            program_running = False
            current_program_id = None
            
        save_program_state()
    except Exception as e:
        # Errore non previsto, logga ma mantieni lo stato attuale
        log_event(f"Errore critico caricamento stato: {e}", "ERROR")