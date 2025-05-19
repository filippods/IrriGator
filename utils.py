"""
Modulo di utilità con funzioni comuni usate in più parti del sistema.
"""
import time
import gc
import uos as os

def get_dirname(path):
    """
    Estrae la directory da un percorso file.
    """
    if not path or '/' not in path:
        return ''
    return path.rsplit('/', 1)[0]

def join_path(path1, path2):
    """
    Unisce due parti di percorso.
    """
    if not path1:
        return path2
    if not path2:
        return path1
    if path1.endswith('/'):
        if path2.startswith('/'):
            return path1 + path2[1:]
        return path1 + path2
    if path2.startswith('/'):
        return path1 + path2
    return path1 + '/' + path2
    
def day_of_year(year, month, day):
    """
    Calcola il giorno dell'anno da una data.
    
    Args:
        year: Anno
        month: Mese
        day: Giorno
        
    Returns:
        int: Giorno dell'anno (1-366)
    """
    days_in_month = [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    
    # Gestione anno bisestile
    if is_leap_year(year):
        days_in_month[2] = 29
    
    day_of_year = day
    for i in range(1, month):
        day_of_year += days_in_month[i]
    
    return day_of_year

def is_leap_year(year):
    """
    Verifica se un anno è bisestile.
    
    Args:
        year: Anno da verificare
        
    Returns:
        boolean: True se l'anno è bisestile, False altrimenti
    """
    return year % 4 == 0 and (year % 100 != 0 or year % 400 == 0)

def get_current_date():
    """
    Ottiene la data corrente nel formato YYYY-MM-DD.
    
    Returns:
        str: Data formattata
    """
    t = time.localtime()
    return f"{t[0]}-{t[1]:02d}-{t[2]:02d}"

def get_current_time():
    """
    Ottiene l'ora corrente nel formato HH:MM:SS.
    
    Returns:
        str: Ora formattata
    """
    t = time.localtime()
    return f"{t[3]:02d}:{t[4]:02d}:{t[5]:02d}"

def ensure_directory_exists(path):
    """
    Assicura che una directory esista, creandola se necessario.
    
    Args:
        path: Percorso della directory
        
    Returns:
        boolean: True se la directory esiste o è stata creata, False altrimenti
    """
    if not path or path == '/':
        return True
    
    try:
        # Rimuovi eventuali slash di terminazione
        if path.endswith('/'):
            path = path[:-1]
            
        # Verifica se la directory esiste già
        try:
            os.stat(path)
            return True
        except OSError:
            # La directory non esiste, crea le directory necessarie
            components = path.split('/')
            current_path = ''
            
            for component in components:
                if component:
                    if current_path:
                        current_path = current_path + '/' + component
                    else:
                        current_path = component
                    try:
                        os.stat(current_path)
                    except OSError:
                        try:
                            os.mkdir(current_path)
                        except OSError as e:
                            print("Errore creazione directory " + current_path + ": " + str(e))
                            return False
            return True
    except Exception as e:
        print("Errore verifica/creazione directory " + path + ": " + str(e))
        return False

def gc_collect():
    """
    Esegue la garbage collection in modo sicuro.
    
    Returns:
        int: Memoria liberata o -1 in caso di errore
    """
    try:
        mem_before = gc.mem_free()
        gc.collect()
        mem_after = gc.mem_free()
        return mem_after - mem_before
    except Exception:
        return -1