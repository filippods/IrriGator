"""
Modulo per la gestione unificata delle cache nel sistema.
Fornisce una interfaccia semplice per caching di dati con TTL.
"""
import time

# Cache globale
_cache = {}  # {key: (data, timestamp, ttl)}

def get_cached(key, loader_func, ttl=60):
    """
    Ottiene un valore dalla cache o lo carica usando la funzione fornita.
    
    Args:
        key: Chiave per identificare il dato in cache
        loader_func: Funzione per caricare il dato se non in cache
        ttl: Tempo di vita della cache in secondi
        
    Returns:
        Il valore richiesto, dalla cache o caricato fresco
    """
    global _cache
    current_time = time.time()
    
    # Se il dato è in cache e non è scaduto, restituiscilo
    if key in _cache:
        data, timestamp, value_ttl = _cache[key]
        if current_time - timestamp <= value_ttl:
            return data
    
    # Altrimenti carica il dato e aggiornalo in cache
    data = loader_func()
    _cache[key] = (data, current_time, ttl)
    return data

def invalidate_cache(key=None):
    """
    Invalida uno specifico valore in cache o l'intera cache.
    
    Args:
        key: Chiave da invalidare, se None invalida tutta la cache
    """
    global _cache
    if key is None:
        _cache.clear()
    elif key in _cache:
        del _cache[key]

def cache_size():
    """
    Restituisce la dimensione attuale della cache.
    
    Returns:
        int: Numero di elementi in cache
    """
    return len(_cache)