const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const DEFAULT_DURATIONS = {
  question: Number(process.env.QUESTION_TIME_MS) || 15_000,
  reveal: Number(process.env.REVEAL_TIME_MS) || 5_000,
  leaderboard: Number(process.env.LEADERBOARD_TIME_MS) || 4_000,
};

const QUESTIONS = [
  {
    prompt: "Which planet has the shortest day in our solar system?",
    choices: ["Mars", "Jupiter", "Mercury", "Neptune"],
    correctIndex: 1,
    explanation: "Jupiter rotates once in just under 10 hours—the fastest spin of any planet.",
    category: "Space",
  },
  {
    prompt: "What is the only mammal capable of true, sustained flight?",
    choices: ["Flying squirrel", "Sugar glider", "Bat", "Colugo"],
    correctIndex: 2,
    explanation: "Bats generate lift by flapping wings; the others can only glide.",
    category: "Nature",
  },
  {
    prompt: "Which country has the most natural lakes?",
    choices: ["Finland", "Canada", "Russia", "United States"],
    correctIndex: 1,
    explanation: "Canada contains more lakes than every other country combined.",
    category: "Geography",
  },
  {
    prompt: "In what year did the first human land on the Moon?",
    choices: ["1965", "1967", "1969", "1971"],
    correctIndex: 2,
    explanation: "Apollo 11 landed on July 20, 1969.",
    category: "History",
  },
  {
    prompt: "Which ingredient gives traditional pesto its green color?",
    choices: ["Parsley", "Basil", "Spinach", "Oregano"],
    correctIndex: 1,
    explanation: "Classic pesto Genovese is built around fresh basil leaves.",
    category: "Food",
  },
  {
    prompt: "What is the smallest prime number?",
    choices: ["0", "1", "2", "3"],
    correctIndex: 2,
    explanation: "Two is the first prime and the only even prime number.",
    category: "Numbers",
  },
  {
    prompt: "Which artist painted The Starry Night?",
    choices: ["Claude Monet", "Vincent van Gogh", "Pablo Picasso", "Edvard Munch"],
    correctIndex: 1,
    explanation: "Vincent van Gogh painted it in 1889 while staying in Saint-Rémy.",
    category: "Art",
  },
  {
    prompt: "What does the word “karaoke” roughly mean in Japanese?",
    choices: ["Empty orchestra", "Singing party", "Loud room", "Borrowed voice"],
    correctIndex: 0,
    explanation: "It combines kara (empty) and ōkesutora (orchestra).",
    category: "Words",
  },
  {
    prompt: "Which element has the chemical symbol Fe?",
    choices: ["Fluorine", "Iron", "Francium", "Fermium"],
    correctIndex: 1,
    explanation: "Fe comes from ferrum, the Latin word for iron.",
    category: "Science",
  },
  {
    prompt: "How many time zones does Russia span?",
    choices: ["7", "9", "11", "13"],
    correctIndex: 2,
    explanation: "Russia stretches across 11 time zones from Kaliningrad to Kamchatka.",
    category: "Geography",
  },
];

const rooms = new Map();
const publicDir = path.join(__dirname, "public");

function randomId(bytes = 12) {
  return crypto.randomBytes(bytes).toString("hex");
}

function makeRoomCode() {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let code = "";
  do {
    code = Array.from({ length: 6 }, () => alphabet[crypto.randomInt(alphabet.length)]).join("");
  } while (rooms.has(code));
  return code;
}

function cleanName(value) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, 18);
}

function createPlayer(name, isHost = false) {
  return {
    id: randomId(8),
    token: randomId(18),
    name,
    isHost,
    score: 0,
    correctCount: 0,
    correctResponseMs: 0,
    answer: null,
    lastPoints: 0,
    connected: true,
    joinedAt: Date.now(),
  };
}

function createRoom(name) {
  const host = createPlayer(name, true);
  const room = {
    code: makeRoomCode(),
    phase: "lobby",
    players: [host],
    questionIndex: -1,
    round: 0,
    questionStartedAt: null,
    phaseEndsAt: null,
    transitionTimer: null,
    listeners: new Set(),
    createdAt: Date.now(),
  };
  rooms.set(room.code, room);
  return { room, player: host };
}

function rankPlayers(players) {
  return [...players].sort((a, b) =>
    b.score - a.score ||
    b.correctCount - a.correctCount ||
    a.correctResponseMs - b.correctResponseMs ||
    a.joinedAt - b.joinedAt
  );
}

function publicPlayer(player, rank) {
  return {
    id: player.id,
    name: player.name,
    isHost: player.isHost,
    score: player.score,
    correctCount: player.correctCount,
    connected: player.connected,
    rank,
  };
}

function playerView(room, viewer) {
  const ranked = rankPlayers(room.players);
  const current = QUESTIONS[room.questionIndex];
  const question = current
    ? {
        number: room.questionIndex + 1,
        total: QUESTIONS.length,
        prompt: current.prompt,
        choices: current.choices,
        category: current.category,
        ...(room.phase === "reveal" || room.phase === "leaderboard" || room.phase === "finished"
          ? { correctIndex: current.correctIndex, explanation: current.explanation }
          : {}),
      }
    : null;

  const answerCounts = current && room.phase !== "question"
    ? current.choices.map((_, index) => room.players.filter((p) => p.answer?.choiceIndex === index).length)
    : null;

  return {
    code: room.code,
    phase: room.phase,
    phaseEndsAt: room.phaseEndsAt,
    question,
    answerCounts,
    answeredCount: room.players.filter((p) => p.answer).length,
    playerCount: room.players.length,
    players: ranked.map((player, index) => publicPlayer(player, index + 1)),
    me: {
      id: viewer.id,
      name: viewer.name,
      isHost: viewer.isHost,
      score: viewer.score,
      correctCount: viewer.correctCount,
      rank: ranked.findIndex((player) => player.id === viewer.id) + 1,
      hasAnswered: Boolean(viewer.answer),
      selectedAnswer: viewer.answer?.choiceIndex ?? null,
      lastPoints: viewer.lastPoints,
      wasCorrect: current && viewer.answer ? viewer.answer.choiceIndex === current.correctIndex : null,
    },
  };
}

function sendEvent(response, event, data) {
  response.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function broadcast(room) {
  for (const listener of room.listeners) {
    sendEvent(listener.response, "state", playerView(room, listener.player));
  }
}

function schedule(room, delay, callback) {
  clearTimeout(room.transitionTimer);
  room.phaseEndsAt = Date.now() + delay;
  room.transitionTimer = setTimeout(callback, delay);
  room.transitionTimer.unref?.();
}

function beginQuestion(room, durations) {
  room.phase = "question";
  room.questionIndex += 1;
  room.questionStartedAt = Date.now();
  for (const player of room.players) {
    player.answer = null;
    player.lastPoints = 0;
  }
  schedule(room, durations.question, () => revealQuestion(room, durations));
  broadcast(room);
}

function revealQuestion(room, durations) {
  if (room.phase !== "question") return;
  clearTimeout(room.transitionTimer);
  const question = QUESTIONS[room.questionIndex];

  for (const player of room.players) {
    if (player.answer?.choiceIndex === question.correctIndex) {
      const responseMs = Math.max(0, player.answer.answeredAt - room.questionStartedAt);
      const remainingRatio = Math.max(0, Math.min(1, 1 - responseMs / durations.question));
      const points = 600 + Math.round(400 * remainingRatio);
      player.score += points;
      player.correctCount += 1;
      player.correctResponseMs += responseMs;
      player.lastPoints = points;
    } else {
      player.lastPoints = 0;
    }
  }

  room.phase = "reveal";
  schedule(room, durations.reveal, () => showLeaderboard(room, durations));
  broadcast(room);
}

function showLeaderboard(room, durations) {
  if (room.phase !== "reveal") return;
  room.phase = "leaderboard";
  schedule(room, durations.leaderboard, () => {
    if (room.questionIndex >= QUESTIONS.length - 1) {
      room.phase = "finished";
      room.phaseEndsAt = null;
      room.transitionTimer = null;
      broadcast(room);
    } else {
      beginQuestion(room, durations);
    }
  });
  broadcast(room);
}

function parseBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 20_000) reject(new Error("Request is too large"));
    });
    request.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
    request.on("error", reject);
  });
}

function json(response, status, data) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  response.end(JSON.stringify(data));
}

function authenticate(room, playerId, token) {
  return room?.players.find((player) => player.id === playerId && player.token === token);
}

function credentials(data, url) {
  return {
    playerId: data.playerId || url.searchParams.get("playerId"),
    token: data.token || url.searchParams.get("token"),
  };
}

function serveStatic(request, response, pathname) {
  const requested = pathname === "/" ? "index.html" : pathname.slice(1);
  const filePath = path.resolve(publicDir, requested);
  if (!filePath.startsWith(`${publicDir}${path.sep}`)) return false;

  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) return false;
    const extension = path.extname(filePath);
    const types = {
      ".html": "text/html; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".js": "text/javascript; charset=utf-8",
      ".svg": "image/svg+xml",
      ".png": "image/png",
    };
    response.writeHead(200, {
      "Content-Type": types[extension] || "application/octet-stream",
      "Cache-Control": extension === ".html" ? "no-cache" : "public, max-age=3600",
    });
    fs.createReadStream(filePath).pipe(response);
    return true;
  } catch {
    return false;
  }
}

function createGameServer(options = {}) {
  const durations = { ...DEFAULT_DURATIONS, ...options.durations };

  return http.createServer(async (request, response) => {
    const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
    const segments = url.pathname.split("/").filter(Boolean);

    try {
      if (request.method === "GET" && url.pathname === "/api/health") {
        return json(response, 200, { ok: true });
      }

      if (request.method === "POST" && url.pathname === "/api/rooms") {
        const body = await parseBody(request);
        const name = cleanName(body.name);
        if (name.length < 2) return json(response, 400, { error: "Enter a name with at least 2 characters." });
        const { room, player } = createRoom(name);
        return json(response, 201, {
          roomCode: room.code,
          playerId: player.id,
          token: player.token,
          state: playerView(room, player),
        });
      }

      if (request.method === "POST" && segments[0] === "api" && segments[1] === "rooms" && segments[3] === "join") {
        const room = rooms.get(String(segments[2] || "").toUpperCase());
        if (!room) return json(response, 404, { error: "That room could not be found." });
        if (room.phase !== "lobby") return json(response, 409, { error: "That game has already started." });
        if (room.players.length >= 8) return json(response, 409, { error: "That room is full." });
        const body = await parseBody(request);
        const name = cleanName(body.name);
        if (name.length < 2) return json(response, 400, { error: "Enter a name with at least 2 characters." });
        if (room.players.some((player) => player.name.toLowerCase() === name.toLowerCase())) {
          return json(response, 409, { error: "That name is already taken in this room." });
        }
        const player = createPlayer(name);
        room.players.push(player);
        broadcast(room);
        return json(response, 201, {
          roomCode: room.code,
          playerId: player.id,
          token: player.token,
          state: playerView(room, player),
        });
      }

      if (segments[0] === "api" && segments[1] === "rooms" && segments[2]) {
        const room = rooms.get(String(segments[2]).toUpperCase());
        if (!room) return json(response, 404, { error: "That room could not be found." });

        if (request.method === "GET" && segments[3] === "events") {
          const { playerId, token } = credentials({}, url);
          const player = authenticate(room, playerId, token);
          if (!player) return json(response, 401, { error: "Your player session is no longer valid." });
          response.writeHead(200, {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
          });
          player.connected = true;
          const listener = { player, response };
          room.listeners.add(listener);
          sendEvent(response, "state", playerView(room, player));
          const heartbeat = setInterval(() => response.write(": keep-alive\n\n"), 20_000);
          heartbeat.unref?.();
          request.on("close", () => {
            clearInterval(heartbeat);
            room.listeners.delete(listener);
            if (![...room.listeners].some((active) => active.player.id === player.id)) {
              player.connected = false;
              broadcast(room);
            }
          });
          return;
        }

        const body = request.method === "POST" ? await parseBody(request) : {};
        const { playerId, token } = credentials(body, url);
        const player = authenticate(room, playerId, token);
        if (!player) return json(response, 401, { error: "Your player session is no longer valid." });

        if (request.method === "GET" && segments.length === 3) {
          return json(response, 200, playerView(room, player));
        }

        if (request.method === "POST" && segments[3] === "start") {
          if (!player.isHost) return json(response, 403, { error: "Only the room host can start the game." });
          if (room.phase !== "lobby") return json(response, 409, { error: "The game is already running." });
          if (room.players.length < 2) return json(response, 409, { error: "At least 2 players are needed." });
          room.questionIndex = -1;
          for (const member of room.players) {
            member.score = 0;
            member.correctCount = 0;
            member.correctResponseMs = 0;
          }
          beginQuestion(room, durations);
          return json(response, 200, { ok: true });
        }

        if (request.method === "POST" && segments[3] === "answer") {
          if (room.phase !== "question") return json(response, 409, { error: "Answers are closed for this question." });
          if (player.answer) return json(response, 409, { error: "Your answer is already locked in." });
          const choiceIndex = Number(body.choiceIndex);
          if (!Number.isInteger(choiceIndex) || choiceIndex < 0 || choiceIndex > 3) {
            return json(response, 400, { error: "Choose one of the four answers." });
          }
          player.answer = { choiceIndex, answeredAt: Date.now() };
          broadcast(room);
          json(response, 200, { ok: true });
          if (room.players.every((member) => member.answer)) {
            setTimeout(() => revealQuestion(room, durations), 350).unref?.();
          }
          return;
        }

        if (request.method === "POST" && segments[3] === "replay") {
          if (!player.isHost) return json(response, 403, { error: "Only the room host can set up a rematch." });
          if (room.phase !== "finished") return json(response, 409, { error: "Finish this game before starting a rematch." });
          room.phase = "lobby";
          room.questionIndex = -1;
          room.phaseEndsAt = null;
          for (const member of room.players) {
            member.score = 0;
            member.correctCount = 0;
            member.correctResponseMs = 0;
            member.answer = null;
            member.lastPoints = 0;
          }
          broadcast(room);
          return json(response, 200, { ok: true });
        }
      }

      if (request.method === "GET" && serveStatic(request, response, url.pathname)) return;
      json(response, 404, { error: "Not found" });
    } catch (error) {
      json(response, 400, { error: error.message || "Something went wrong." });
    }
  });
}

function cleanupRooms() {
  const cutoff = Date.now() - 6 * 60 * 60 * 1000;
  for (const [code, room] of rooms) {
    if (room.createdAt < cutoff) {
      clearTimeout(room.transitionTimer);
      rooms.delete(code);
    }
  }
}

const cleanupTimer = setInterval(cleanupRooms, 30 * 60 * 1000);
cleanupTimer.unref?.();

if (require.main === module) {
  const port = Number(process.env.PORT) || 3000;
  createGameServer().listen(port, () => {
    console.log(`Quickfire is ready at http://localhost:${port}`);
  });
}

module.exports = { createGameServer, QUESTIONS };
