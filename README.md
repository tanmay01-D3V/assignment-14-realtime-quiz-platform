# 🧠 Assignment 14: Real-Time Multiplayer Live Quiz Battle (Socket.io)

> **Track:** Backend & Real-Time Web | **Level:** Advanced | **Student:** Tanmay Sherkar  
> **Tech Stack:** Node.js, Express.js, Socket.io, In-Memory Game State Engine, CORS, dotenv, nodemon

---

## 📌 1. Objective & Architecture Overview

An interactive, synchronized **Real-Time Multiplayer Live Quiz Battle Arena** (similar to Kahoot & Quizizz) built with **Node.js, Express.js, and Socket.io**. Features asymmetric role management (**Quiz Host** vs **Connected Players**), authoritative server countdown clocks, anti-cheat answer verification, millisecond speed-based dynamic scoring bonuses, and live animated leaderboards broadcast across all participants.

### Key Architectural Highlights:
- **PIN-Based Lobby Management**: Secure, non-colliding 4-digit PIN generation with live roster updates as players join the lobby.
- **Asymmetric Role Architecture**:
  - **Host View (`host.html`)**: Projects live questions, synchronized circular countdown timer, player answer counters, question reveals with answer distributions, dynamic leaderboard, and winner podium with fanfare.
  - **Player View (`player.html`)**: Mobile-first responsive gamepad with Kahoot-style vibrant 4-color shape tiles (▲ Red, ◆ Blue, ● Yellow, ■ Green), haptic lock-in confirmation, and personal streak/score metrics.
- **Authoritative Server Timer**: Server-controlled 15-second interval ticks broadcast every second without client-side clock drift.
- **Anti-Cheat Validation**:
  - Question options sent to players omit the correct answer and explanation to prevent inspect-element cheating.
  - Submissions after the 15-second timer runs out or duplicate submissions in the same round are strictly rejected.
- **Dynamic Speed Scoring Algorithm**:
  $$\text{Score} = \text{Base Score } (500) + \left(\frac{\text{Time Remaining}}{\text{Total Time Limit}} \times 500\right)$$
  Yields up to 1,000 points per question for fast, accurate submissions.
- **Web Audio API Sound Engine**: Zero-asset audio synthesis providing timer ticks, correct chimes, wrong buzzers, and victory fanfare.

---

## 🏗️ 2. Project Directory Structure

```text
Tanmay-Sherkar-139-Assignment-14/
├── public/
│   ├── index.html           # Landing portal (Choose Host or Player)
│   ├── host.html            # Host command screen & TV projector display
│   ├── player.html          # Mobile-friendly 4-color button answer gamepad
│   └── app.js               # Web Audio API sound synthesizer
├── data/
│   └── questions.json       # Question bank with explanations & categories
├── sockets/
│   ├── gameEngine.js        # Server timers, transitions & dynamic scoring
│   └── lobbyHandler.js      # PIN generation, room events & cheat validation
├── server.js                # Express & Socket.io server bootstrap
├── package.json
├── .env.example
├── .env
├── .gitignore
└── README.md
```

---

## 🎮 3. Game Flow & State Machine

```text
[Host Creates Room (4-Digit PIN)] 
              ⬇
[Players Join Lobby via PIN & Nickname] 
              ⬇
[Host Clicks "Start Game"] 
              ⬇
[Server Broadcasts Question & Synchronizes 15s Timer] 
              ⬇
[Players Submit Answers on Gamepad (Speed Bonus Calculated)] 
              ⬇
[Timer Expires / All Answered ➔ Server Reveals Answer & Broadcasts Live Leaderboard] 
              ⬇
[Next Question or Final Winner Screen & Podium]
```

---

## 📡 4. Real-Time Socket Event Protocol

### 🎪 Lobby & Game Control

| Event Name | Direction | Payload Schema | Description |
|---|:---:|---|---|
| `quiz:create` | `Host -> Server` | `{ "hostName": "Professor X", "category": "Tech" }` | Host initializes a quiz room, receives a 4-digit PIN |
| `quiz:created` | `Server -> Host` | `{ "pin": "8421", "roomId": "quiz_8421" }` | Sends PIN to the host |
| `quiz:join` | `Player -> Server` | `{ "pin": "8421", "playerName": "Karan" }` | Player enters lobby with PIN |
| `quiz:joined` | `Server -> Player` | `{ "pin": "8421", "playerName": "Karan" }` | Confirms lobby entry |
| `lobby:update` | `Server -> Room` | `{ "players": [{ "name": "Karan", "score": 0 }] }` | Broadcasts lobby roster as players join |
| `quiz:start` | `Host -> Server` | `{ "pin": "8421" }` | Host triggers the start of the quiz |

### ⏱️ Question Round & Live Gameplay

| Event Name | Direction | Payload Schema | Description |
|---|:---:|---|---|
| `question:start` | `Server -> Room` | `{ "questionIndex": 1, "totalQuestions": 5, "question": "...", "options": [...] }` | Broadcasted by server. Omits correct answer to prevent cheating |
| `timer:tick` | `Server -> Room` | `{ "remainingSeconds": 12, "percent": 80 }` | Synchronized countdown clock tick |
| `answer:submit` | `Player -> Server` | `{ "pin": "8421", "selectedOption": 0 }` | Player submits chosen option |
| `answer:count` | `Server -> Host` | `{ "answered": 2, "total": 3 }` | Updates host live response counter |
| `question:time_up` | `Server -> Room` | `{ "correctOption": 0, "explanation": "...", "distribution": [...] }` | Server reveals correct answer |
| `player:round_result` | `Server -> Player`| `{ "isCorrect": true, "pointsEarned": 890, "totalScore": 890, "rank": 1 }` | Personal score and streak feedback |
| `leaderboard:update`| `Server -> Room` | `{ "leaderboard": [{ "rank": 1, "name": "Karan", "score": 1420 }] }` | Broadcasts dynamic sorted rankings |
| `quiz:next` | `Host -> Server` | `{ "pin": "8421" }` | Host advances to next round |
| `quiz:ended` | `Server -> Room` | `{ "winner": { "name": "Karan", "score": 4850 }, "finalRanks": [...] }` | Crown winner on podium |

---

## 🧮 5. Server-Side Scoring Algorithm

```javascript
// sockets/gameEngine.js
function calculateScore(isCorrect, timeTakenMs, totalTimeLimitMs = 15000) {
  if (!isCorrect) return 0;
  
  const timeRemaining = Math.max(0, totalTimeLimitMs - timeTakenMs);
  const speedBonus = Math.round((timeRemaining / totalTimeLimitMs) * 500); // Up to 500 bonus points
  const baseScore = 500;
  
  return baseScore + speedBonus; // Total max 1000 points per question
}
```

---

## 🚀 6. Setup & Running Instructions

### 1. Install Dependencies
```bash
cd Tanmay-Sherkar-139-Assignment-14
npm install
```

### 2. Configure Environment
```bash
PORT=5000
NODE_ENV=development
```

### 3. Start Server
```bash
# Development with auto-reload
npm run dev

# Or production
npm start
```

### 4. Open in Browser
- **Portal Landing Page**: `http://localhost:5000`
- **Host Dashboard**: `http://localhost:5000/host.html`
- **Player Gamepad**: `http://localhost:5000/player.html`

---

## 🧪 7. Testing & Verification Walkthrough

1. Open Host View on Tab 1 (`http://localhost:5000/host.html`). Click **Create Battle Room** and note the 4-digit PIN.
2. Open Player View on Tab 2 and Tab 3 (`http://localhost:5000/player.html`). Enter the PIN and nicknames "Player 1" and "Player 2".
3. Verify that both player chips appear on the Host screen and the "Start Game" button becomes active.
4. From the Host screen, click **Start Game**.
5. On Tab 2 (Player 1), select the correct answer within 2 seconds. On Tab 3 (Player 2), wait 10 seconds before submitting the same answer.
6. Verify that Player 1 receives significantly more points than Player 2 due to the millisecond speed bonus calculation.
7. Attempt submitting an answer on another tab after the 15-second countdown finishes; verify the submission is rejected.
8. Verify that the correct answer is highlighted on the Host display along with the updated live leaderboard.
9. Advance through the questions until completion to verify the final Winner Podium screen.
