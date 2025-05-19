"""
File principale del sistema di irrigazione.
"""
from wifi_manager import initialize_network, reset_wifi_module, retry_client_connection
from web_server import start_web_server
from zone_manager import initialize_pins, stop_all_zones
from program_scheduling import check_programs
from program_execution import reset_program_state
from log_manager import log_event
from diagnostics.system_monitor import start_diagnostics, check_memory_usage
import uasyncio as asyncio
from utils import gc_collect
import machine
import time

# Configurazione watchdog hardware
try:
    from machine import WDT
    HAS_WATCHDOG = True
except (ImportError, AttributeError):
    HAS_WATCHDOG = False

# Intervallo di controllo dei programmi in secondi
PROGRAM_CHECK_INTERVAL = 30
WATCHDOG_INTERVAL = 60  # Intervallo di attività del watchdog in secondi
MAX_CONSECUTIVE_ERRORS = 5  # Numero massimo di errori consecutivi permessi
ERROR_RESET_THRESHOLD = 3600  # 1 ora in secondi

# Variabili globali per il monitoraggio
consecutive_program_errors = 0
last_error_reset_time = 0
system_start_time = time.time()

async def program_check_loop():
    """
    Task asincrono che controlla periodicamente i programmi di irrigazione.
    Implementa meccanismi di recupero da errori e tentativi ripetuti.
    """
    global consecutive_program_errors, last_error_reset_time
    
    while True:
        try:
            # Controlla se ci sono programmi da avviare
            await check_programs()
            
            # Reset contatore errori in caso di successo
            if consecutive_program_errors > 0:
                consecutive_program_errors = 0
                
            # Attendi fino al prossimo controllo
            await asyncio.sleep(PROGRAM_CHECK_INTERVAL)
            
        except asyncio.CancelledError:
            # Gestisce la cancellazione pulita del task
            log_event("Task di controllo programmi cancellato", "INFO")
            break
            
        except Exception as e:
            # Incrementa il contatore di errori consecutivi
            consecutive_program_errors += 1
            
            # Logga l'errore
            log_event(f"Errore durante il controllo dei programmi: {e}", "ERROR")
            
            # Verifica se è il momento di resettare il contatore degli errori
            current_time = time.time()
            if current_time - last_error_reset_time > ERROR_RESET_THRESHOLD:
                consecutive_program_errors = 1  # Mantieni questo errore
                last_error_reset_time = current_time
                log_event("Reset contatore errori dopo intervallo di tempo", "INFO")
            
            # Se ci sono troppi errori consecutivi, forza un reset più drastico
            if consecutive_program_errors >= MAX_CONSECUTIVE_ERRORS:
                log_event(f"Troppi errori consecutivi ({consecutive_program_errors}), reset forzato", "ERROR")
                stop_all_zones()  # Arresta tutte le zone per sicurezza
                reset_program_state()  # Resetta lo stato del programma
                consecutive_program_errors = 0  # Reset contatore
                
                # Effettua un breve ritardo prima di riprendere le verifiche
                await asyncio.sleep(10)
            else:
                # Continua anche dopo errori, ma attendi un po'
                await asyncio.sleep(PROGRAM_CHECK_INTERVAL)

async def watchdog_loop():
    """
    Task asincrono per il monitoraggio del sistema e la gestione della memoria.
    Implementa controlli di salute e recovery automatico.
    """
    gc_counter = 0
    
    while True:
        try:
            # Incrementa un contatore per eseguire GC periodicamente
            gc_counter += 1
            
            # Ogni iterazione (circa 1 minuto) controlla la memoria
            memory_ok = await check_memory_usage()
            
            if not memory_ok:
                # Situazioni critiche di memoria
                log_event("Memoria CRITICA, tentativo di ripristino del sistema", "ERROR")
                
                # Riavvia il server web (componente che consuma più memoria)
                try:
                    from web_server import app
                    if hasattr(app, 'server') and app.server:
                        app.server.close()
                        await asyncio.sleep(1)
                        asyncio.create_task(app.start_server(host='0.0.0.0', port=80))
                        log_event("Server web riavviato per recuperare memoria", "INFO")
                except Exception as e:
                    log_event(f"Errore nel riavvio del server web: {e}", "ERROR")
                
                # In caso critico, arresta tutte le zone e resetta lo stato per sicurezza
                stop_all_zones()
                reset_program_state()
            
            # Attendi prima del prossimo controllo
            await asyncio.sleep(WATCHDOG_INTERVAL)
            
        except asyncio.CancelledError:
            break
        except Exception as e:
            log_event(f"Errore nel watchdog: {e}", "ERROR")
            # Ridotto a 30 secondi in caso di errore
            await asyncio.sleep(30)

async def main():
    """
    Funzione principale che inizializza il sistema e avvia i task asincroni.
    Implementa un design resiliente con recupero da errori e retry.
    """
    global system_start_time
    system_start_time = time.time()
    
    # Task principali del sistema
    tasks = []
    
    try:
        # FASE 1: Inizializzazione del watchdog hardware
        wdt = None
        if HAS_WATCHDOG:
            try:
                wdt = WDT(timeout=90000)  # timeout di 90 secondi
                log_event("Watchdog hardware inizializzato", "INFO")
            except Exception as e:
                log_event(f"Hardware watchdog non disponibile: {e}", "WARNING")
        
        log_event("Avvio del sistema di irrigazione", "INFO")
        
        # FASE 2: Ottimizzazione delle risorse
        # Disattiva funzionalità non necessarie per risparmiare memoria
        try:
            # Disattiva Bluetooth se disponibile
            import bluetooth
            bt = bluetooth.BLE()
            bt.active(False)
            log_event("Bluetooth disattivato per risparmiare risorse", "INFO")
        except ImportError:
            pass  # Bluetooth non disponibile, nessuna azione necessaria
        
        # Pulizia iniziale della memoria
        gc_collect()
        
        # FASE 3: Inizializzazione della sicurezza
        # Resetta lo stato di tutte le zone per garantire uno stato sicuro all'avvio
        log_event("Arresto di tutte le zone attive", "INFO")
        stop_all_zones()
        
        # FASE 4: Inizializzazione hardware
        # Inizializza i pin per le zone di irrigazione
        if not initialize_pins():
            log_event("ATTENZIONE: Problemi nell'inizializzazione delle zone", "WARNING")
        else:
            log_event("Zone inizializzate correttamente", "INFO")
        
        # FASE 5: Inizializzazione della rete
        # Strategia resiliente con retry e fallback
        wifi_initialized = False
        try:
            log_event("Inizializzazione della rete WiFi", "INFO")
            initialize_network()
            wifi_initialized = True
            log_event("Rete WiFi inizializzata", "INFO")
        except Exception as e:
            log_event(f"Errore inizializzazione WiFi: {e}, tentativo con reset", "WARNING")
            
            # Primo tentativo di recovery: reset del modulo WiFi
            try:
                reset_wifi_module()
                initialize_network()
                wifi_initialized = True
                log_event("Rete WiFi inizializzata dopo reset", "INFO")
            except Exception as e2:
                log_event(f"Impossibile inizializzare WiFi anche dopo reset: {e2}", "ERROR")
                log_event("Continuazione con funzionalità limitate", "WARNING")
        
        # FASE 6: Inizializzazione del programma
        # Assicurati che non ci siano programmi sospesi dall'avvio precedente
        reset_program_state()
        log_event("Stato del programma resettato", "INFO")
        
        # FASE 7: Avvio dei servizi principali
        # Ogni servizio è avviato come task asincrono separato
        
        # Avvia il web server
        log_event("Avvio del web server", "INFO")
        web_server_task = asyncio.create_task(start_web_server())
        tasks.append(web_server_task)
        
        # Avvia il controllo dei programmi
        log_event("Avvio del controllo programmi", "INFO")
        program_check_task = asyncio.create_task(program_check_loop())
        tasks.append(program_check_task)
        
        # Avvia il task di connessione WiFi (solo se l'inizializzazione è riuscita)
        if wifi_initialized:
            log_event("Avvio task di monitoraggio connessione WiFi", "INFO")
            retry_wifi_task = asyncio.create_task(retry_client_connection())
            tasks.append(retry_wifi_task)
        
        # Avvia il task di monitoraggio del sistema
        log_event("Avvio watchdog di sistema", "INFO")
        watchdog_task = asyncio.create_task(watchdog_loop())
        tasks.append(watchdog_task)
        
        # Avvia la versione semplificata della diagnostica
        log_event("Avvio sistema di diagnostica semplificato", "INFO")
        diagnostics_task = asyncio.create_task(start_diagnostics())
        tasks.append(diagnostics_task)

        # FASE 8: Loop principale con monitoraggio del sistema
        log_event("Sistema avviato con successo", "INFO")
        print("Sistema avviato con successo. In esecuzione...")
        
        # Resetta il watchdog e monitora i task attivi
        while True:
            # Resetta il watchdog hardware se attivo
            if wdt:
                wdt.feed()
            
            # Forza garbage collection periodicamente nel loop principale
            gc_collect()
            
            # Pausa prima della prossima iterazione
            await asyncio.sleep(1)

    except asyncio.CancelledError:
        log_event("Loop principale cancellato, arresto sistema", "WARNING")
    except Exception as e:
        log_event(f"Errore critico nel main: {e}", "ERROR")
        print(f"ERRORE CRITICO: {e}")
        # Pausa breve per permettere la registrazione dell'errore
        await asyncio.sleep(1)
        
        # Tenta un riavvio sicuro
        machine.reset()

def start():
    """
    Funzione di avvio chiamata quando il sistema si accende.
    Gestisce la configurazione iniziale e avvia il loop principale.
    """
    try:
        # Ottimizzazione della CPU per prestazioni migliori
        try:
            import machine
            # Imposta frequenza CPU a 240MHz su ESP32
            machine.freq(240000000)
            print(f"CPU impostata a {machine.freq()/1000000} MHz")
        except:
            pass
        
        # Avvia il loop principale con gestione eccezioni
        asyncio.run(main())
    except KeyboardInterrupt:
        print("Interruzione da tastiera, arresto sistema")
    except Exception as e:
        print(f"Errore fatale all'avvio: {e}")
        
        # Salva l'errore nel log prima del riavvio
        try:
            from log_manager import log_event
            log_event(f"ERRORE FATALE ALL'AVVIO: {e}", "ERROR")
        except:
            pass
            
        # Attendi prima di riavviare
        time.sleep(5)
        machine.reset()

# Punto di ingresso principale
if __name__ == '__main__':
    start()