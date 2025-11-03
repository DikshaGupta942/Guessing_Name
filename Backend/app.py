from flask import Flask, request, jsonify, render_template, session
from flask_cors import CORS
import sqlite3
import random
import os

app = Flask(__name__, template_folder='../Frontend/templates', static_folder='../Frontend/static')
app.secret_key = 'your_secret_key_here'  # Needed for sessions
CORS(app)

# Database setup
def init_db():
    conn = sqlite3.connect('game.db', check_same_thread=False)
    c = conn.cursor()
    c.execute('''
        CREATE TABLE IF NOT EXISTS game_sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            player_name TEXT NOT NULL,
            target_number INTEGER NOT NULL,
            attempts INTEGER DEFAULT 0,
            status TEXT DEFAULT 'in_progress',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    c.execute('''
        CREATE TABLE IF NOT EXISTS game_attempts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id INTEGER,
            guess_number INTEGER,
            hint TEXT,
            attempt_number INTEGER,
            FOREIGN KEY (session_id) REFERENCES game_sessions (id)
        )
    ''')
    conn.commit()
    conn.close()

init_db()

@app.route('/')
def home():
    return render_template('index.html')

@app.route('/game')
def game():
    return render_template('game.html')

@app.route('/api/start_game', methods=['POST'])
def start_game():
    data = request.json
    player_name = data.get('player_name')
    
    if not player_name:
        return jsonify({'error': 'Player name is required'}), 400
    
    target_number = random.randint(1, 100)
    
    conn = sqlite3.connect('game.db', check_same_thread=False)
    c = conn.cursor()
    c.execute('''
        INSERT INTO game_sessions (player_name, target_number) 
        VALUES (?, ?)
    ''', (player_name, target_number))
    session_id = c.lastrowid
    conn.commit()
    conn.close()
    
    # Store session ID in Flask session
    session['current_session_id'] = session_id
    session['player_name'] = player_name
    
    return jsonify({
        'session_id': session_id,
        'message': 'Game started!'
    })

@app.route('/api/guess', methods=['POST'])
def make_guess():
    data = request.json
    session_id = data.get('session_id')
    
    # If no session_id provided, try to get from Flask session
    if not session_id:
        session_id = session.get('current_session_id')
    
    if not session_id:
        return jsonify({'error': 'No active game session'}), 400
    
    guess = data.get('guess')
    
    # Check if user wants to quit
    if guess and str(guess).lower() == 'q':
        return quit_game_internal(session_id)
    
    try:
        user_choice = int(guess)
    except ValueError:
        return jsonify({'error': 'Please enter a valid number or "q" to quit'}), 400
    
    conn = sqlite3.connect('game.db', check_same_thread=False)
    c = conn.cursor()
    
    # Get game session
    c.execute('SELECT target_number, attempts, status FROM game_sessions WHERE id = ?', (session_id,))
    session_data = c.fetchone()
    
    if not session_data:
        return jsonify({'error': 'Game session not found'}), 404
    
    target_number, current_attempts, game_status = session_data
    
    # Check if game is already over
    if game_status != 'in_progress':
        return jsonify({'error': 'This game has already ended'}), 400
    
    new_attempts = current_attempts + 1
    
    # Update attempts count
    c.execute('UPDATE game_sessions SET attempts = ? WHERE id = ?', (new_attempts, session_id))
    
    # Check guess
    if user_choice == target_number:
        # Game won
        c.execute('UPDATE game_sessions SET status = "won" WHERE id = ?', (session_id,))
        hint = "Success: Correct Guess!!"
        status = "won"
    elif user_choice < target_number:
        hint = "Your number is too small. Try again!"
        status = "in_progress"
    else:
        hint = "Your number is too large. Try again!"
        status = "in_progress"
    
    # Save attempt
    c.execute('''
        INSERT INTO game_attempts (session_id, guess_number, hint, attempt_number)
        VALUES (?, ?, ?, ?)
    ''', (session_id, user_choice, hint, new_attempts))
    
    conn.commit()
    
    # Get target number for response if game is over
    target_info = target_number if status != "in_progress" else None
    
    conn.close()
    
    return jsonify({
        'hint': hint,
        'attempts': new_attempts,
        'status': status,
        'session_id': session_id,
        'target_number': target_info
    })

def quit_game_internal(session_id):
    """Internal function to handle game quitting"""
    conn = sqlite3.connect('game.db', check_same_thread=False)
    c = conn.cursor()
    
    # Get target number and attempts
    c.execute('SELECT target_number, attempts FROM game_sessions WHERE id = ?', (session_id,))
    session_data = c.fetchone()
    
    if session_data:
        target_number, attempts = session_data
        # Mark as quit
        c.execute('UPDATE game_sessions SET status = "quit" WHERE id = ?', (session_id,))
        conn.commit()
        conn.close()
        
        return jsonify({
            'message': f'You quit the game. The target number was: {target_number}',
            'attempts': attempts,
            'status': 'quit',
            'target_number': target_number
        })
    
    conn.close()
    return jsonify({'error': 'Game session not found'}), 404

@app.route('/api/quit_game', methods=['POST'])
def quit_game():
    data = request.json
    session_id = data.get('session_id')
    
    # If no session_id provided, try to get from Flask session
    if not session_id:
        session_id = session.get('current_session_id')
    
    if not session_id:
        return jsonify({'error': 'No active game session'}), 400
    
    return quit_game_internal(session_id)

@app.route('/api/current_session', methods=['GET'])
def get_current_session():
    """Get current game session info"""
    session_id = session.get('current_session_id')
    player_name = session.get('player_name')
    
    if not session_id:
        return jsonify({'error': 'No active session'}), 404
    
    conn = sqlite3.connect('game.db', check_same_thread=False)
    c = conn.cursor()
    
    c.execute('SELECT attempts, status FROM game_sessions WHERE id = ?', (session_id,))
    session_data = c.fetchone()
    conn.close()
    
    if session_data:
        attempts, status = session_data
        return jsonify({
            'session_id': session_id,
            'player_name': player_name,
            'attempts': attempts,
            'status': status
        })
    
    return jsonify({'error': 'Session not found'}), 404

@app.route('/api/game_stats', methods=['GET'])
def get_game_stats():
    conn = sqlite3.connect('game.db', check_same_thread=False)
    c = conn.cursor()
    
    c.execute('''
        SELECT player_name, target_number, attempts, status 
        FROM game_sessions 
        ORDER BY created_at DESC
    ''')
    
    games = c.fetchall()
    conn.close()
    
    game_stats = []
    for game in games:
        game_stats.append({
            'player_name': game[0],
            'target_number': game[1],
            'attempts': game[2],
            'status': game[3]
        })
    
    return jsonify(game_stats)

if __name__ == '__main__':
    app.run(debug=True, port=5000)