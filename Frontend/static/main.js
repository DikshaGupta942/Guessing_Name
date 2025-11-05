let currentSessionId = null;
let currentPlayerName = '';

// Start the game
async function startGame() {
    const playerNameInput = document.getElementById('playerName');
    const errorDiv = document.getElementById('error');
    const playerName = playerNameInput.value.trim();

    if (!playerName) {
        errorDiv.textContent = 'Please enter your name to start the game.';
        return;
    }

    errorDiv.textContent = '';
    currentPlayerName = playerName;

    try {
        const response = await fetch('/api/start_game', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ player_name: playerName })
        });

        const data = await response.json();

        if (response.ok) {
            currentSessionId = data.session_id;
            // Redirect to game page
            window.location.href = '/game';
        } else {
            errorDiv.textContent = data.error || 'Failed to start game';
        }
    } catch (error) {
        errorDiv.textContent = 'Network error. Please try again.';
        console.error('Error:', error);
    }
}

// Make a guess
async function makeGuess() {
    const guessInput = document.getElementById('guessInput');
    const gameMessage = document.getElementById('gameMessage');
    const errorDiv = document.getElementById('error');
    const guess = guessInput.value.trim();

    if (!guess) {
        errorDiv.textContent = 'Please enter a guess.';
        return;
    }

    // Clear previous errors
    errorDiv.textContent = '';

    try {
        const response = await fetch('/api/guess', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                session_id: currentSessionId,
                guess: guess
            })
        });

        const data = await response.json();

        if (response.ok) {
            updateGameUI(data);
            guessInput.value = '';
            
            // If game is over, disable input
            if (data.status === 'won' || data.status === 'quit') {
                disableGameInput();
            } else {
                guessInput.focus();
            }
        } else {
            errorDiv.textContent = data.error || 'Failed to process guess';
        }
    } catch (error) {
        errorDiv.textContent = 'Network error. Please try again.';
        console.error('Error:', error);
    }
}

// Quit game
async function quitGame() {
    if (!currentSessionId) {
        alert('No active game session');
        return;
    }

    try {
        const response = await fetch('/api/quit_game', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ session_id: currentSessionId })
        });

        const data = await response.json();

        if (response.ok) {
            updateGameUI(data);
            disableGameInput();
        } else {
            alert(data.error || 'Failed to quit game');
        }
    } catch (error) {
        alert('Network error. Please try again.');
        console.error('Error quitting game:', error);
    }
}

// Update game UI with results
function updateGameUI(data) {
    const gameMessage = document.getElementById('gameMessage');
    const attemptCount = document.getElementById('attemptCount');
    const attemptsList = document.getElementById('attemptsList');

    // Update attempt count
    attemptCount.textContent = data.attempts;

    // Display message
    gameMessage.textContent = data.hint;
    gameMessage.className = 'game-message';

    if (data.status === 'won') {
        gameMessage.classList.add('Success');

        gameMessage.textContent = `🎉 ${data.hint}  ${data.target_number}! You found the correct number in ${data.attempts} attempts!`;

    } else if (data.status === 'quit') {
        gameMessage.classList.add('warning');
        gameMessage.textContent = data.message;
    } else if (data.hint.includes('too small') || data.hint.includes('too large')) {
        gameMessage.classList.add('info');
    }

    // Add to attempts history (only for in-progress guesses)
    if (data.status === 'in_progress') {
        const attemptItem = document.createElement('div');
        attemptItem.className = 'attempt-item';
        attemptItem.textContent = `Attempt ${data.attempts}: Guessed ${getLastGuess()} - ${data.hint}`;
        attemptsList.appendChild(attemptItem);
        attemptsList.scrollTop = attemptsList.scrollHeight;
    }
}

// Get the last guess from input (helper function)
function getLastGuess() {
    const guessInput = document.getElementById('guessInput');
    return guessInput.value || 'Unknown';
}

// Disable game input after game ends
function disableGameInput() {
    const guessInput = document.getElementById('guessInput');
    const guessButton = document.querySelector('button[onclick="makeGuess()"]');
    const quitButton = document.querySelector('button[onclick="quitGame()"]');
    
    if (guessInput) guessInput.disabled = true;
    if (guessButton) guessButton.disabled = true;
    if (quitButton) quitButton.disabled = true;
}

// Enable game input
function enableGameInput() {
    const guessInput = document.getElementById('guessInput');
    const guessButton = document.querySelector('button[onclick="makeGuess()"]');
    const quitButton = document.querySelector('button[onclick="quitGame()"]');
    
    if (guessInput) guessInput.disabled = false;
    if (guessButton) guessButton.disabled = false;
    if (quitButton) quitButton.disabled = false;
}

// Navigation
function goHome() {
    window.location.href = '/';
}

// Load current session when game page loads
async function loadCurrentSession() {
    try {
        const response = await fetch('/api/current_session');
        if (response.ok) {
            const data = await response.json();
            currentSessionId = data.session_id;
            currentPlayerName = data.player_name;
            
            const currentPlayerSpan = document.getElementById('currentPlayer');
            const attemptCount = document.getElementById('attemptCount');
            
            if (currentPlayerSpan) currentPlayerSpan.textContent = data.player_name;
            if (attemptCount) attemptCount.textContent = data.attempts;
            
            // If game is already over, disable input
            if (data.status !== 'in_progress') {
                disableGameInput();
                // Show appropriate message
                const gameMessage = document.getElementById('gameMessage');
                if (gameMessage) {
                    if (data.status === 'won') {
                        gameMessage.textContent = `Game already completed! You won in ${data.attempts} attempts.`;
                        gameMessage.className = 'game-message success';
                    } else if (data.status === 'quit') {
                        gameMessage.textContent = `Game already quit after ${data.attempts} attempts.`;
                        gameMessage.className = 'game-message warning';
                    }
                }
            }
        } else {
            // No active session, redirect to home
            window.location.href = '/';
        }
    } catch (error) {
        console.error('Error loading session:', error);
    }
}

// Initialize game page
function initGamePage() {
    // Load current session data
    loadCurrentSession();

    // Focus on input field
    const guessInput = document.getElementById('guessInput');
    if (guessInput) {
        guessInput.focus();
        
        // Allow pressing Enter to submit guess
        guessInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                makeGuess();
            }
        });
    }
}

// Initialize based on current page
if (window.location.pathname === '/game') {
    document.addEventListener('DOMContentLoaded', initGamePage);
}

// Allow starting game with Enter key on home page
if (window.location.pathname === '/') {
    document.addEventListener('DOMContentLoaded', function() {
        const playerNameInput = document.getElementById('playerName');
        if (playerNameInput) {
            playerNameInput.addEventListener('keypress', function(e) {
                if (e.key === 'Enter') {
                    startGame();
                }
            });
        }
    });
}