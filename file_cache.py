"""
Modulo specifico per la gestione della cache di file.
Implementa un sistema LRU (Least Recently Used) per la cache dei file.
"""
import time
import uos as os

# Cache e parametri
_file_cache = {}  # {path: (content, content_type, timestamp)}
_cache_usage = [] # Lista di path ordinati per ultimo accesso
FILE_CACHE_SIZE = 10  # Massimo numero file da cachecare
CACHE_TTL = 300       # Tempo di vita cache in secondi

def get_cached_file(path, content_type=None):
    """
    Ottiene un file dalla cache o dal filesystem.
    
    Args:
        path: Percorso del file
        content_type: Tipo di contenuto opzionale
        
    Returns:
        tuple or None: (content, content_type) o None se non esiste
    """
    global _file_cache, _cache_usage
    current_time = time.time()
    
    # Verifica se il file è in cache
    if path in _file_cache:
        content, cached_content_type, timestamp = _file_cache[path]
        
        # Verifica validità cache
        if current_time - timestamp <= CACHE_TTL:
            # Aggiorna posizione in LRU cache
            _cache_usage.remove(path)
            _cache_usage.append(path)
            
            return (content, cached_content_type or content_type)
    
    # File non in cache o cache scaduta
    if not file_exists(path):
        return None
        
    try:
        # Determina tipo di contenuto
        if content_type is None:
            content_type = determine_content_type(path)
        
        # Leggi file (solo per file di dimensioni ragionevoli)
        try:
            stat_info = os.stat(path)
            file_size = stat_info[6]  # indice 6 è la dimensione file
            
            # Cache solo file under 32K per evitare problemi memoria
            if file_size < 32 * 1024:
                with open(path, 'rb') as f:
                    content = f.read()
                    
                # Gestisci cache LRU - rimuovi file meno recente se necessario
                if len(_file_cache) >= FILE_CACHE_SIZE and _cache_usage:
                    oldest = _cache_usage.pop(0)
                    if oldest in _file_cache:
                        del _file_cache[oldest]
                
                # Aggiungi file a cache
                _file_cache[path] = (content, content_type, current_time)
                _cache_usage.append(path)
                
                return (content, content_type)
            else:
                # File troppo grande per cache, leggilo direttamente
                with open(path, 'rb') as f:
                    content = f.read()
                return (content, content_type)
        except Exception as e:
            print(f"Errore nel caricamento file {path}: {e}")
            return None
    except Exception as e:
        print(f"Errore nel determinare il tipo di {path}: {e}")
        return None

def file_exists(path):
    """
    Verifica se un file esiste.
    
    Args:
        path: Percorso del file
        
    Returns:
        boolean: True se il file esiste, False altrimenti
    """
    try:
        os.stat(path)
        return True
    except OSError:
        return False

def determine_content_type(path):
    """
    Determina il tipo di contenuto in base all'estensione del file.
    
    Args:
        path: Percorso del file
        
    Returns:
        str: Tipo di contenuto MIME
    """
    if path.endswith('.html'):
        return 'text/html'
    elif path.endswith('.css'):
        return 'text/css'
    elif path.endswith('.js'):
        return 'application/javascript'
    elif path.endswith('.json'):
        return 'application/json'
    elif path.endswith('.png'):
        return 'image/png'
    elif path.endswith('.jpg') or path.endswith('.jpeg'):
        return 'image/jpeg'
    elif path.endswith('.ico'):
        return 'image/x-icon'
    elif path.endswith('.webp'):
        return 'image/webp'
    else:
        return 'text/plain'

def clear_cache():
    """
    Svuota la cache dei file.
    """
    global _file_cache, _cache_usage
    _file_cache = {}
    _cache_usage = []
    
    # Forza GC dopo pulizia cache
    try:
        import gc
        gc.collect()
    except:
        pass