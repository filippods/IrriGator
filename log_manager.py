"""
Modulo per la gestione dei log di sistema.
Gestisce la registrazione, rotazione e recupero dei log di sistema con meccanismi di protezione
contro errori di I/O e uso efficiente della memoria.
"""
import ujson
import time
import uos as os
import gc
from utils import day_of_year, get_current_date, get_current_time, ensure_directory_exists, get_dirname

LOG_FILE = '/data/system_log.json'
MAX_LOG_DAYS = 10  # Mantiene log per 10 giorni
MAX_LOG_ENTRIES = 1000  # Limite massimo di voci di log per prevenire file troppo grandi
_log_cache = []  # Cache per ridurre le operazioni su file
_last_flush_time = 0  # Traccia l'ultimo flush su disco
_FLUSH_INTERVAL = 60  # Flush su disco ogni 60 secondi o se ci sono più di 10 log in cache
_MAX_CACHE_SIZE = 10  # Numero massimo di log in cache prima del flush automatico

def _ensure_log_file_exists():
    """
    Crea il file di log se non esiste, con gestione robusta degli errori.
    """
    try:
        try:
            os.stat(LOG_FILE)
        except OSError:
            # File non esiste, crealo
            # Assicurati che la directory data esista
            ensure_directory_exists(get_dirname(LOG_FILE))
                
            # Crea il file log vuoto
            with open(LOG_FILE, 'w') as f:
                ujson.dump([], f)
    except OSError:
        # Se c'è un errore nella creazione, stampa un avviso ma non fare crashare l'app
        print("ATTENZIONE: Impossibile creare il file di log")

def _flush_log_cache():
    """
    Scrive la cache dei log su disco.
    """
    global _log_cache, _last_flush_time
    
    if not _log_cache:
        return
        
    try:
        _ensure_log_file_exists()
        
        # Leggi i log esistenti
        try:
            with open(LOG_FILE, 'r') as f:
                logs = ujson.load(f)
                if not isinstance(logs, list):
                    logs = []
        except (OSError, ValueError):
            logs = []
        
        # Aggiungi i log dalla cache
        logs.extend(_log_cache)
        
        # Applica rotazione dei log (rimuovi log più vecchi di MAX_LOG_DAYS)
        logs = _apply_log_rotation(logs)
        
        # Limita il numero massimo di voci di log
        if len(logs) > MAX_LOG_ENTRIES:
            logs = logs[-MAX_LOG_ENTRIES:]  # Mantieni solo i log più recenti
        
        # Scrivi i log aggiornati
        with open(LOG_FILE, 'w') as f:
            ujson.dump(logs, f)
        
        # Pulisci la cache
        _log_cache = []
        _last_flush_time = time.time()
        
        # Forza garbage collection dopo operazioni su file
        gc.collect()
        
    except Exception as e:
        print(f"Errore durante il flush dei log: {e}")

def _apply_log_rotation(logs):
    """
    Filtra i log per mantenere solo quelli entro il periodo di MAX_LOG_DAYS.
    
    Args:
        logs: Lista di log da filtrare
        
    Returns:
        list: Lista filtrata di log
    """
    if not logs:
        return []
        
    now = time.time()
    current_day = time.localtime(now)[7]  # Giorno dell'anno
    current_year = time.localtime(now)[0]  # Anno corrente
    
    filtered_logs = []
    
    for log in logs:
        try:
            log_date = log.get("date", "")
            if not log_date:
                continue
                
            # Estrai anno, mese, giorno dalla data del log
            log_parts = log_date.split('-')
            if len(log_parts) != 3:
                continue
                
            log_year = int(log_parts[0])
            log_month = int(log_parts[1])
            log_day = int(log_parts[2])
            
            # Calcola il giorno dell'anno per il log
            log_day_of_year = day_of_year(log_year, log_month, log_day)
            
            # Gestione del cambio anno
            if log_year == current_year:
                # Stesso anno: confronto diretto dei giorni
                if current_day - log_day_of_year <= MAX_LOG_DAYS:
                    filtered_logs.append(log)
            elif log_year == current_year - 1 and current_day <= MAX_LOG_DAYS:
                # Anno precedente, ma siamo all'inizio del nuovo anno
                days_in_previous_year = 366 if (log_year % 4 == 0 and (log_year % 100 != 0 or log_year % 400 == 0)) else 365
                if (days_in_previous_year - log_day_of_year + current_day) <= MAX_LOG_DAYS:
                    filtered_logs.append(log)
                    
        except (ValueError, IndexError):
            # Se c'è un errore nella data, mantieni il log (meglio sicuri)
            filtered_logs.append(log)
    
    return filtered_logs

def log_event(message, level="INFO"):
    """
    Registra un evento nel log di sistema.
    Utilizza caching per ridurre le operazioni di I/O su file.
    
    Args:
        message: Messaggio da registrare
        level: Livello di log (INFO, WARNING, ERROR)
    """
    global _log_cache, _last_flush_time
    
    try:
        # Prepara il nuovo log
        current_date = get_current_date()
        current_time = get_current_time()
        
        new_log = {
            "date": current_date,
            "time": current_time,
            "level": level,
            "message": message
        }
        
        # Aggiungi alla cache
        _log_cache.append(new_log)
        
        # Stampa a console per debug immediato
        print(f"[{level}] {current_time}: {message}")
        
        # Determina se è necessario fare flush su disco
        current_time = time.time()
        needs_flush = (
            len(_log_cache) >= _MAX_CACHE_SIZE or 
            current_time - _last_flush_time >= _FLUSH_INTERVAL or
            level == "ERROR"  # Flush immediato per gli errori
        )
        
        if needs_flush:
            _flush_log_cache()
        
    except Exception as e:
        print(f"Errore durante la registrazione nel log: {e}")
        # In caso di errore nella registrazione, tenta un flush di emergenza
        try:
            _flush_log_cache()
        except:
            pass

def get_logs():
    """
    Restituisce tutti i log salvati.
    Esegue il flush della cache prima di leggere per garantire dati aggiornati.
    
    Returns:
        Lista di log ordinati dal più recente al più vecchio
    """
    try:
        # Flush della cache prima di leggere
        _flush_log_cache()
        
        _ensure_log_file_exists()
        with open(LOG_FILE, 'r') as f:
            logs = ujson.load(f)
            
            # Ordina i log per data e ora (più recenti prima)
            if logs and isinstance(logs, list):
                logs.sort(key=lambda x: (x.get('date', ''), x.get('time', '')), reverse=True)
                
            return logs
    except Exception as e:
        print(f"Errore durante la lettura dei log: {e}")
        return []

def clear_logs():
    """
    Cancella tutti i log e resetta la cache.
    
    Returns:
        boolean: True se l'operazione è riuscita, False altrimenti
    """
    global _log_cache, _last_flush_time
    
    try:
        _ensure_log_file_exists()
        with open(LOG_FILE, 'w') as f:
            ujson.dump([], f)
            
        # Resetta anche la cache
        _log_cache = []
        _last_flush_time = time.time()
        
        # Forza la garbage collection
        gc.collect()
        
        return True
    except Exception as e:
        print(f"Errore durante la cancellazione dei log: {e}")
        return False

# Inizializzazione del modulo
# Imposta il timestamp dell'ultimo flush all'avvio
_last_flush_time = time.time()