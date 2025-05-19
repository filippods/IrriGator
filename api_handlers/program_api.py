"""
API handler per la gestione dei programmi di irrigazione.
"""
from microdot import Response
import ujson
import uasyncio as asyncio
from log_manager import log_event

def json_response(data, status_code=200):
    """
    Helper per creare risposte JSON standardizzate.
    """
    return Response(
        body=ujson.dumps(data),
        status_code=status_code,
        headers={'Content-Type': 'application/json'}
    )

def get_programs(request):
    """API per ottenere i programmi."""
    try:
        from program_manager import load_programs
        programs = load_programs()
        return json_response(programs)
    except Exception as e:
        log_event(f"Errore get_programs: {e}", "ERROR")
        return json_response({}, 200)  # Fallback sicuro

def save_program_route(request):
    """API per salvare un nuovo programma."""
    try:
        from program_manager import load_programs, save_programs, check_program_conflicts
        
        # Estrai e valida dati
        program_data = request.json
        if program_data is None:
            try:
                program_data = ujson.loads(request.body.decode('utf-8'))
            except:
                return json_response({'success': False, 'error': 'Dati JSON non validi'}, 400)

        # Validazione programma
        if len(program_data.get('name', '')) > 16:
            return json_response({'success': False, 'error': 'Nome troppo lungo (max 16 caratteri)'}, 400)

        if not program_data.get('months'):
            return json_response({'success': False, 'error': 'Seleziona almeno un mese'}, 400)
                
        if not program_data.get('steps'):
            return json_response({'success': False, 'error': 'Seleziona almeno una zona'}, 400)

        # Carica programmi esistenti
        programs = load_programs()

        # Verifica se esiste un programma con lo stesso nome
        for existing_program in programs.values():
            if existing_program['name'] == program_data['name']:
                return json_response({'success': False, 'error': 'Nome programma già esistente'}, 400)

        # Verifica conflitti
        has_conflict, conflict_message = check_program_conflicts(program_data, programs)
        if has_conflict:
            return json_response({'success': False, 'error': conflict_message}, 400)

        # Genera nuovo ID
        new_id = '1'
        if programs:
            new_id = str(max([int(pid) for pid in programs.keys()]) + 1)
        program_data['id'] = new_id

        # Salva programma
        programs[new_id] = program_data
        if save_programs(programs):
            log_event(f"Nuovo programma '{program_data['name']}' creato con ID {new_id}", "INFO")
            return json_response({'success': True, 'program_id': new_id})
        else:
            return json_response({'success': False, 'error': 'Errore salvataggio programma'}, 500)
    except Exception as e:
        log_event(f"Errore save_program: {e}", "ERROR")
        return json_response({'success': False, 'error': str(e)}, 500)

def update_program_route(request):
    """API per aggiornare un programma esistente."""
    try:
        from program_manager import update_program
        
        # Estrai e valida dati
        updated_program_data = request.json
        if updated_program_data is None:
            try:
                updated_program_data = ujson.loads(request.body.decode('utf-8'))
            except:
                return json_response({'success': False, 'error': 'Dati JSON non validi'}, 400)
                
        program_id = updated_program_data.get('id')
        if program_id is None:
            return json_response({'success': False, 'error': 'ID programma mancante'}, 400)

        # Validazione nome
        if len(updated_program_data.get('name', '')) > 16:
            return json_response({'success': False, 'error': 'Nome troppo lungo (max 16 caratteri)'}, 400)

        # Aggiorna programma
        success, error_msg = update_program(program_id, updated_program_data)
        if success:
            log_event(f"Programma {program_id} aggiornato", "INFO")
            return json_response({'success': True})
        else:
            return json_response({'success': False, 'error': error_msg}, 400)
    except Exception as e:
        log_event(f"Errore update_program: {e}", "ERROR")
        return json_response({'success': False, 'error': str(e)}, 500)

def delete_program_route(request):
    """API per eliminare un programma."""
    try:
        from program_manager import delete_program
        
        # Estrai e valida dati
        data = request.json
        if data is None:
            try:
                data = ujson.loads(request.body.decode('utf-8'))
            except:
                return json_response({'success': False, 'error': 'Dati JSON non validi'}, 400)
                
        program_id = data.get('id')
        if program_id is None:
            return json_response({'success': False, 'error': 'ID programma mancante'}, 400)

        # Elimina programma
        success = delete_program(program_id)
        if success:
            log_event(f"Programma {program_id} eliminato", "INFO")
            return json_response({'success': True})
        else:
            return json_response({'success': False, 'error': 'Programma non trovato'}, 404)
    except Exception as e:
        log_event(f"Errore delete_program: {e}", "ERROR")
        return json_response({'success': False, 'error': str(e)}, 500)

async def start_program_route(request):
    """API per avviare manualmente un programma."""
    try:
        from program_manager import load_programs
        from program_execution import execute_program
        from program_state import load_program_state, program_running
        
        # Estrai e valida dati
        data = request.json
        if data is None:
            try:
                data = ujson.loads(request.body.decode('utf-8'))
            except:
                return json_response({'success': False, 'error': 'Dati JSON non validi'}, 400)
                
        program_id = str(data.get('program_id', ''))
        if not program_id:
            return json_response({'success': False, 'error': 'ID programma mancante'}, 400)

        # Carica programma
        programs = load_programs()
        program = programs.get(program_id)
        if not program:
            return json_response({'success': False, 'error': 'Programma non trovato'}, 404)

        # Verifica se già in esecuzione
        load_program_state()
        if program_running:
            return json_response({'success': False, 'error': 'Altro programma in esecuzione'}, 400)

        # Avvia programma in un task separato
        asyncio.create_task(execute_and_respond(program))
        
        # Risposta immediata per non bloccare il client
        return json_response({'success': True, 'message': 'Avvio programma in corso'})
    except Exception as e:
        log_event(f"Errore start_program: {e}", "ERROR")
        return json_response({'success': False, 'error': str(e)}, 500)

async def execute_and_respond(program):
    """
    Esegue un programma e logga il risultato.
    Funzione helper per start_program_route.
    """
    try:
        from program_execution import execute_program
        
        success = await execute_program(program, manual=True)
        if success:
            log_event(f"Programma {program.get('name', '')} avviato manualmente e completato", "INFO")
        else:
            log_event(f"Errore nell'esecuzione del programma {program.get('name', '')}", "ERROR")
    except Exception as e:
        log_event(f"Eccezione in execute_and_respond: {e}", "ERROR")

def stop_program_route(request):
    """API per fermare il programma corrente."""
    try:
        from program_execution import stop_program
        
        log_event("Interruzione programma richiesta", "INFO")
        
        # Ferma programma
        success = stop_program()
        
        return json_response({'success': success, 'message': 'Programma interrotto'})
    except Exception as e:
        log_event(f"Errore stop_program: {e}", "ERROR")
        return json_response({'success': False, 'error': str(e)}, 500)

def get_program_state(request):
    """API per ottenere lo stato del programma corrente."""
    try:
        from program_execution import get_program_state
        
        state = get_program_state()
        return json_response(state)
    except Exception as e:
        log_event(f"Errore get_program_state: {e}", "ERROR")
        return json_response({'program_running': False, 'current_program_id': None})

def toggle_program_automatic(request):
    """API per abilitare/disabilitare l'automazione di un singolo programma."""
    try:
        from program_manager import load_programs, save_programs
        
        # Estrai e valida dati
        data = request.json
        if data is None:
            try:
                data = ujson.loads(request.body.decode('utf-8'))
            except:
                return json_response({'success': False, 'error': 'Dati JSON non validi'}, 400)
                
        program_id = data.get('program_id')
        enable = data.get('enable', True)
        
        if not program_id:
            return json_response({'success': False, 'error': 'ID programma mancante'}, 400)
                
        # Carica programmi
        programs = load_programs()
        
        if program_id not in programs:
            return json_response({'success': False, 'error': 'Programma non trovato'}, 404)
                
        # Aggiorna stato
        programs[program_id]['automatic_enabled'] = enable
        
        # Salva programmi
        if save_programs(programs):
            log_event(f"Automazione programma {program_id} {'abilitata' if enable else 'disabilitata'}", "INFO")
            return json_response({'success': True})
        else:
            return json_response({'success': False, 'error': 'Errore salvataggio'}, 500)
    except Exception as e:
        log_event(f"Errore toggle_program_automatic: {e}", "ERROR")
        return json_response({'success': False, 'error': str(e)}, 500)

def toggle_automatic_programs(request):
    """API per abilitare/disabilitare i programmi automatici."""
    try:
        from settings_manager import load_user_settings, save_user_settings
        
        # Estrai dati
        data = request.json
        if data is None:
            try:
                data = ujson.loads(request.body.decode('utf-8'))
            except:
                data = {}
                
        enable = data.get('enable', False)
        
        # Aggiorna impostazioni
        settings = load_user_settings()
        settings['automatic_programs_enabled'] = enable
        
        # Salva impostazioni
        if save_user_settings(settings):
            log_event(f"Programmi automatici {'abilitati' if enable else 'disabilitati'}", "INFO")
            return json_response({'success': True})
        else:
            return json_response({'success': False, 'error': 'Errore salvataggio impostazioni'}, 500)
    except Exception as e:
        log_event(f"Errore toggle_automatic_programs: {e}", "ERROR")
        return json_response({'success': False, 'error': str(e)}, 500)