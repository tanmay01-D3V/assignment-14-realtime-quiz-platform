const fs = require('fs');
const path = require('path');

// In-Memory Games Repository: pin -> gameObject
const activeGames = new Map();

// Helper to load questions
function getQuestions() {
  const qPath = path.resolve(__dirname, '../data/questions.json');
  return JSON.parse(fs.readFileSync(qPath, 'utf-8'));
}

// Calculate score based on correctness and millisecond speed bonus
function calculateScore(isCorrect, timeTakenMs, totalTimeLimitMs = 15000) {
  if (!isCorrect) return 0;
  const timeRemaining = Math.max(0, totalTimeLimitMs - timeTakenMs);
  const speedBonus = Math.round((timeRemaining / totalTimeLimitMs) * 500); // up to 500
  const baseScore = 500;
  return baseScore + speedBonus; // max 1000
}

// Get sorted leaderboard
function getLeaderboard(game) {
  const list = [];
  for (const [socketId, p] of game.players.entries()) {
    list.push({
      socketId,
      name: p.name,
      score: p.score,
      streak: p.streak,
      lastRoundPoints: p.lastRoundPoints,
      isCorrect: p.isCorrect,
      selectedOption: p.selectedOption
    });
  }

  list.sort((a, b) => b.score - a.score);

  return list.map((item, index) => ({
    rank: index + 1,
    ...item
  }));
}

// Start a question round
function startQuestionRound(game, io) {
  if (game.currentQuestionIndex >= game.questions.length) {
    endQuiz(game, io);
    return;
  }

  const currentQ = game.questions[game.currentQuestionIndex];
  game.status = 'QUESTION_ACTIVE';
  game.timeLimitSeconds = 15;
  game.remainingSeconds = 15;
  game.questionStartTime = Date.now();

  // Reset player round answers
  for (const player of game.players.values()) {
    player.answeredThisRound = false;
    player.selectedOption = null;
    player.answerTimeMs = null;
    player.lastRoundPoints = 0;
    player.isCorrect = false;
  }

  // Broadcast question to room - ANTI-CHEAT: Omit correctOption & explanation!
  io.to(game.roomId).emit('question:start', {
    questionIndex: game.currentQuestionIndex + 1,
    totalQuestions: game.questions.length,
    question: currentQ.question,
    options: currentQ.options,
    timeLimitSeconds: game.timeLimitSeconds,
    category: currentQ.category
  });

  // Broadcast initial answer counter to host
  io.to(game.hostSocketId).emit('answer:count', {
    answered: 0,
    total: game.players.size
  });

  // Start synchronized timer
  if (game.timerInterval) clearInterval(game.timerInterval);

  game.timerInterval = setInterval(() => {
    game.remainingSeconds -= 1;

    io.to(game.roomId).emit('timer:tick', {
      remainingSeconds: game.remainingSeconds,
      percent: Math.max(0, (game.remainingSeconds / game.timeLimitSeconds) * 100)
    });

    if (game.remainingSeconds <= 0) {
      clearInterval(game.timerInterval);
      game.timerInterval = null;
      endQuestionRound(game, io);
    }
  }, 1000);
}

// Conclude a question round, reveal answer, and emit updated leaderboard
function endQuestionRound(game, io) {
  if (game.timerInterval) {
    clearInterval(game.timerInterval);
    game.timerInterval = null;
  }

  game.status = 'QUESTION_REVEAL';
  const currentQ = game.questions[game.currentQuestionIndex];

  // Calculate answer distribution for host bar chart
  const distribution = [0, 0, 0, 0];
  for (const p of game.players.values()) {
    if (p.selectedOption !== null && p.selectedOption >= 0 && p.selectedOption <= 3) {
      distribution[p.selectedOption]++;
    }
  }

  // 1. Reveal correct answer to everyone in room
  io.to(game.roomId).emit('question:time_up', {
    correctOption: currentQ.correctOption,
    explanation: currentQ.explanation,
    distribution
  });

  // 2. Broadcast updated dynamic leaderboard
  const leaderboard = getLeaderboard(game);
  io.to(game.roomId).emit('leaderboard:update', {
    leaderboard,
    currentQuestionIndex: game.currentQuestionIndex + 1,
    totalQuestions: game.questions.length
  });

  // Notify individual players of their personal score feedback
  for (const [socketId, p] of game.players.entries()) {
    const playerRank = leaderboard.find((l) => l.socketId === socketId);
    io.to(socketId).emit('player:round_result', {
      isCorrect: p.isCorrect,
      pointsEarned: p.lastRoundPoints,
      totalScore: p.score,
      rank: playerRank ? playerRank.rank : 1,
      streak: p.streak
    });
  }
}

// Conclude quiz battle & broadcast winner
function endQuiz(game, io) {
  game.status = 'GAME_ENDED';
  if (game.timerInterval) clearInterval(game.timerInterval);

  const finalRanks = getLeaderboard(game);
  const winner = finalRanks.length > 0 ? finalRanks[0] : null;

  io.to(game.roomId).emit('quiz:ended', {
    winner,
    finalRanks
  });
}

module.exports = {
  activeGames,
  getQuestions,
  calculateScore,
  getLeaderboard,
  startQuestionRound,
  endQuestionRound,
  endQuiz
};
