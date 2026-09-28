const {
  activeGames,
  getQuestions,
  calculateScore,
  startQuestionRound,
  endQuestionRound,
  endQuiz
} = require('./gameEngine');

// Generate 4-digit numeric PIN
function generatePin() {
  let pin;
  do {
    pin = Math.floor(1000 + Math.random() * 9000).toString();
  } while (activeGames.has(pin));
  return pin;
}

module.exports = (io, socket) => {
  // 1. Host creates a new quiz lobby
  socket.on('quiz:create', (payload) => {
    try {
      const hostName = (payload && payload.hostName) || 'Quiz Host';
      const category = (payload && payload.category) || 'General Tech';
      const pin = generatePin();
      const roomId = `quiz_${pin}`;

      const game = {
        pin,
        roomId,
        hostSocketId: socket.id,
        hostName,
        category,
        status: 'LOBBY',
        players: new Map(),
        questions: getQuestions(),
        currentQuestionIndex: 0,
        questionStartTime: 0,
        timeLimitSeconds: 15,
        remainingSeconds: 15,
        timerInterval: null
      };

      activeGames.set(pin, game);
      socket.join(roomId);

      console.log(`🎮 Quiz created: PIN ${pin} by ${hostName} (${socket.id})`);

      socket.emit('quiz:created', {
        pin,
        roomId,
        totalQuestions: game.questions.length,
        hostName
      });
    } catch (err) {
      console.error('Error in quiz:create:', err.message);
      socket.emit('quiz:error', { message: 'Failed to create quiz lobby.' });
    }
  });

  // 2. Player joins lobby using 4-digit PIN
  socket.on('quiz:join', (payload) => {
    try {
      const pin = (payload && payload.pin ? payload.pin.toString().trim() : '');
      const playerName = (payload && payload.playerName ? payload.playerName.trim() : 'Player');

      const game = activeGames.get(pin);

      if (!game) {
        return socket.emit('quiz:join_error', { message: `Game PIN '${pin}' not found. Please verify the 4-digit PIN.` });
      }

      if (game.status !== 'LOBBY') {
        return socket.emit('quiz:join_error', { message: 'Cannot join. Game is already in progress or completed.' });
      }

      // Check name uniqueness in lobby
      for (const p of game.players.values()) {
        if (p.name.toLowerCase() === playerName.toLowerCase()) {
          return socket.emit('quiz:join_error', { message: `Nickname '${playerName}' is already taken in this lobby.` });
        }
      }

      const player = {
        id: socket.id,
        name: playerName,
        score: 0,
        streak: 0,
        answeredThisRound: false,
        selectedOption: null,
        answerTimeMs: null,
        lastRoundPoints: 0,
        isCorrect: false
      };

      game.players.set(socket.id, player);
      socket.join(game.roomId);

      console.log(`🙋 Player ${playerName} joined Quiz ${pin}`);

      socket.emit('quiz:joined', {
        pin,
        playerName,
        hostName: game.hostName,
        totalQuestions: game.questions.length
      });

      // Broadcast updated lobby roster to everyone in room
      const playersList = Array.from(game.players.values()).map((p) => ({
        id: p.id,
        name: p.name,
        score: p.score
      }));

      io.to(game.roomId).emit('lobby:update', {
        pin,
        hostName: game.hostName,
        players: playersList
      });
    } catch (err) {
      console.error('Error in quiz:join:', err.message);
      socket.emit('quiz:join_error', { message: 'Failed to join game lobby.' });
    }
  });

  // 3. Host triggers start of quiz
  socket.on('quiz:start', (payload) => {
    try {
      const pin = payload && payload.pin ? payload.pin.toString().trim() : '';
      const game = activeGames.get(pin);

      if (!game) return socket.emit('quiz:error', { message: 'Game not found.' });
      if (game.hostSocketId !== socket.id) {
        return socket.emit('quiz:error', { message: 'Only the Host can start the quiz.' });
      }

      if (game.players.size === 0) {
        return socket.emit('quiz:error', { message: 'Cannot start game without any players.' });
      }

      console.log(`🚀 Quiz ${pin} starting with ${game.players.size} players...`);
      game.currentQuestionIndex = 0;
      startQuestionRound(game, io);
    } catch (err) {
      console.error('Error in quiz:start:', err.message);
    }
  });

  // 4. Player submits answer
  socket.on('answer:submit', (payload) => {
    try {
      const pin = payload && payload.pin ? payload.pin.toString().trim() : '';
      const selectedOption = parseInt(payload.selectedOption, 10);
      const game = activeGames.get(pin);

      if (!game || game.status !== 'QUESTION_ACTIVE') {
        return socket.emit('answer:rejected', { message: 'Round is not active or time has expired.' });
      }

      const player = game.players.get(socket.id);
      if (!player) {
        return socket.emit('answer:rejected', { message: 'Player not recognized in this game.' });
      }

      if (player.answeredThisRound) {
        return socket.emit('answer:rejected', { message: 'You have already submitted an answer for this question.' });
      }

      // Anti-Cheat: Validate submission speed & verify against expiry
      const timeTakenMs = Date.now() - game.questionStartTime;
      const maxAllowedMs = game.timeLimitSeconds * 1000 + 500; // 500ms network tolerance

      if (timeTakenMs > maxAllowedMs) {
        return socket.emit('answer:rejected', { message: 'Answer rejected: submitted after time expired.' });
      }

      const currentQ = game.questions[game.currentQuestionIndex];
      const isCorrect = selectedOption === currentQ.correctOption;
      const points = calculateScore(isCorrect, timeTakenMs, game.timeLimitSeconds * 1000);

      // Record player submission
      player.answeredThisRound = true;
      player.selectedOption = selectedOption;
      player.answerTimeMs = timeTakenMs;
      player.lastRoundPoints = points;
      player.isCorrect = isCorrect;
      player.score += points;

      if (isCorrect) {
        player.streak += 1;
      } else {
        player.streak = 0;
      }

      socket.emit('answer:acknowledged', {
        submitted: true,
        timeTakenMs
      });

      // Update answer counter for host
      let answeredCount = 0;
      for (const p of game.players.values()) {
        if (p.answeredThisRound) answeredCount++;
      }

      io.to(game.hostSocketId).emit('answer:count', {
        answered: answeredCount,
        total: game.players.size
      });

      // If all connected players have answered, immediately end question round
      if (answeredCount >= game.players.size) {
        endQuestionRound(game, io);
      }
    } catch (err) {
      console.error('Error in answer:submit:', err.message);
    }
  });

  // 5. Host advances to next question round
  socket.on('quiz:next', (payload) => {
    try {
      const pin = payload && payload.pin ? payload.pin.toString().trim() : '';
      const game = activeGames.get(pin);

      if (!game || game.hostSocketId !== socket.id) return;

      game.currentQuestionIndex += 1;
      if (game.currentQuestionIndex < game.questions.length) {
        startQuestionRound(game, io);
      } else {
        endQuiz(game, io);
      }
    } catch (err) {
      console.error('Error in quiz:next:', err.message);
    }
  });

  // 6. Handle Disconnections
  socket.on('disconnect', () => {
    try {
      for (const [pin, game] of activeGames.entries()) {
        // If Host disconnects, close room
        if (game.hostSocketId === socket.id) {
          if (game.timerInterval) clearInterval(game.timerInterval);
          io.to(game.roomId).emit('quiz:cancelled', {
            message: 'Quiz Host has disconnected. The battle has concluded.'
          });
          activeGames.delete(pin);
          console.log(`❌ Quiz ${pin} cancelled (Host disconnected)`);
          break;
        }

        // If Player disconnects
        if (game.players.has(socket.id)) {
          const p = game.players.get(socket.id);
          game.players.delete(socket.id);
          console.log(`🏃 Player ${p.name} left Quiz ${pin}`);

          if (game.status === 'LOBBY') {
            const playersList = Array.from(game.players.values()).map((pl) => ({
              id: pl.id,
              name: pl.name,
              score: pl.score
            }));
            io.to(game.roomId).emit('lobby:update', {
              pin,
              hostName: game.hostName,
              players: playersList
            });
          }
          break;
        }
      }
    } catch (err) {
      console.error('Error in quiz disconnect:', err.message);
    }
  });
};
