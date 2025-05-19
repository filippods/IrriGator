"""
Modulo di diagnostica per il sistema di irrigazione.
Monitor leggero dello stato del sistema e dei servizi.
"""
import uasyncio as asyncio
import gc
import time
from log_manager import log_event
from utils import gc_collect

# Configurazione
CHECK_INTERVAL = 60  # Intervallo controlli (secondi)
MEMORY_THRESHOLD = 20000  # Soglia memoria libera (bytes)

# Stato del sistema
system_metrics = {
    'uptime': 0,
    'start_time': time.time(),
    'memory_free': 0,
    'memory_allocated': 0,
    'gc_runs': 0
}

async def check_memory_usage():
    """
    Controlla memoria disponibile.
    
    Returns:
        boolean: True se memoria OK, False se poca memoria
    """
    try:
        # Raccogli dati memoria
        free_mem = gc.mem_free()
        allocated_mem = gc.mem_alloc()
        total_mem = free_mem + allocated_mem
        percent_free = (free_mem / total_mem) * 100
        
        # Aggiorna metriche
        system_metrics['memory_free'] = free_mem
        system_metrics['memory_allocated'] = allocated_mem
        
        # Verifica memoria bassa
        if free_mem < MEMORY_THRESHOLD or percent_free < 10:
            log_event(f"Memoria bassa: {free_mem} bytes ({percent_free:.1f}%), GC forzato", "WARNING")
            memory_recovered = gc_collect()
            system_metrics['gc_runs'] += 1
            
            # Verifica dopo GC
            new_free_mem = gc.mem_free()
            new_percent_free = (new_free_mem / total_mem) * 100
            
            if memory_recovered > 0:
                log_event(f"Post GC: {new_free_mem} bytes ({new_percent_free:.1f}%), recuperati {memory_recovered} bytes", "INFO")
            
            if new_free_mem < MEMORY_THRESHOLD:
                return False
        
        return True
    
    except Exception as e:
        log_event(f"Errore controllo memoria: {e}", "ERROR")
        return False

async def check_web_server():
    """
    Verifica che il web server risponda correttamente.
    
    Returns:
        boolean: True se il server è attivo, False altrimenti
    """
    try:
        # Crea socket per verifica
        import socket
        s = socket.socket()
        s.settimeout(5)  # 5 secondi timeout
        
        try:
            s.connect(('127.0.0.1', 80))
            s.send(b'GET / HTTP/1.0\r\n\r\n')
            response = s.recv(100)
            s.close()
            
            if b'HTTP' in response:
                # Server OK
                return True
        except Exception:
            # Server non risponde
            pass
    except Exception as e:
        log_event(f"Errore controllo web server: {e}", "ERROR")
    
    return False

async def check_system_health():
    """
    Controllo completo stato sistema.
    """
    try:
        # Aggiorna uptime
        system_metrics['uptime'] = time.time() - system_metrics['start_time']
        
        # Esegui controlli basilari
        memory_ok = await check_memory_usage()
        web_server_ok = await check_web_server()
        
        # Logga stato completo solo periodicamente o se ci sono problemi
        all_ok = memory_ok and web_server_ok
        
        if all_ok:
            # Log stato OK ogni 10 iterazioni (circa 10 minuti)
            if int(system_metrics['uptime']) % (CHECK_INTERVAL * 10) < CHECK_INTERVAL:
                free_mem = gc.mem_free()
                allocated_mem = gc.mem_alloc()
                total_mem = free_mem + allocated_mem
                percent_free = (free_mem / total_mem) * 100
                
                uptime_hours = int(system_metrics['uptime'] // 3600)
                uptime_minutes = int((system_metrics['uptime'] % 3600) // 60)
                
                log_event(f"Sistema in salute. Uptime: {uptime_hours}h {uptime_minutes}m. "
                         f"Memoria: {free_mem} bytes liberi ({percent_free:.1f}%)", "INFO")
        else:
            # Log ogni iterazione in caso di problemi
            log_event(f"Problemi rilevati. Memoria OK: {memory_ok}, WebServer OK: {web_server_ok}", "WARNING")
    
    except Exception as e:
        log_event(f"Errore controllo salute sistema: {e}", "ERROR")

async def basic_diagnostics_loop():
    """
    Loop di diagnostica basilare.
    """
    log_event("Sistema diagnostica base avviato", "INFO")
    
    while True:
        try:
            await check_system_health()
        except Exception as e:
            log_event(f"Errore diagnostica: {e}", "ERROR")
        
        # Controllo più frequente se ci sono problemi noti
        await asyncio.sleep(CHECK_INTERVAL)

async def start_diagnostics():
    """
    Avvia il sistema di diagnostica.
    Punto di ingresso per il supervisore.
    """
    log_event("Sistema diagnostica inizializzato", "INFO")
    return basic_diagnostics_loop()