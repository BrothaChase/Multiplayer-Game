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

const SPORT_QUESTIONS = {
  NFL: [
    { prompt: "How many points is a touchdown worth before the extra-point attempt?", choices: ["3", "6", "7", "8"], correctIndex: 1, explanation: "A touchdown is worth six points; the conversion attempt comes afterward.", category: "NFL Rules" },
    { prompt: "How many players does one NFL team have on the field for a standard play?", choices: ["9", "10", "11", "12"], correctIndex: 2, explanation: "Each team fields 11 players at a time.", category: "NFL Basics" },
    { prompt: "What is a defensive interception returned for a touchdown commonly called?", choices: ["Pick-six", "Scoop score", "Safety run", "Red-zone return"], correctIndex: 0, explanation: "A pick-six is an interception returned all the way for six points.", category: "NFL Terms" },
    { prompt: "How many points does a safety score?", choices: ["1", "2", "3", "6"], correctIndex: 1, explanation: "A safety awards two points to the defending team.", category: "NFL Scoring" },
    { prompt: "What trophy is awarded to the Super Bowl champion?", choices: ["Heisman Trophy", "Lombardi Trophy", "Commissioner’s Trophy", "Stanley Cup"], correctIndex: 1, explanation: "The Super Bowl winner receives the Vince Lombardi Trophy.", category: "NFL History" },
    { prompt: "How long is the field between the two goal lines?", choices: ["80 yards", "90 yards", "100 yards", "120 yards"], correctIndex: 2, explanation: "The playing field is 100 yards between goal lines, plus two end zones.", category: "NFL Field" },
    { prompt: "What is the line called where the ball is placed before a play?", choices: ["Goal line", "Hash line", "Line of scrimmage", "First-down line"], correctIndex: 2, explanation: "Each play begins from the line of scrimmage.", category: "NFL Terms" },
    { prompt: "Which position usually throws the forward pass?", choices: ["Center", "Quarterback", "Linebacker", "Kicker"], correctIndex: 1, explanation: "The quarterback typically directs the offense and throws passes.", category: "NFL Positions" },
    { prompt: "What is it called when the quarterback is tackled behind the line of scrimmage?", choices: ["Sack", "Stuff", "Hold", "Rush"], correctIndex: 0, explanation: "A tackle of the passer behind the line is recorded as a sack.", category: "NFL Defense" },
    { prompt: "How many yards must an offense normally gain for a new set of downs?", choices: ["5", "8", "10", "15"], correctIndex: 2, explanation: "An offense gets four downs to gain at least 10 yards.", category: "NFL Rules" },
  ],
  NBA: [
    { prompt: "How many points is a successful free throw worth?", choices: ["1", "2", "3", "4"], correctIndex: 0, explanation: "Each made free throw adds one point.", category: "NBA Scoring" },
    { prompt: "How many players from one team are on the court during play?", choices: ["4", "5", "6", "7"], correctIndex: 1, explanation: "Basketball is played five-on-five.", category: "NBA Basics" },
    { prompt: "How long is the NBA shot clock?", choices: ["20 seconds", "24 seconds", "30 seconds", "35 seconds"], correctIndex: 1, explanation: "The offense has 24 seconds to attempt a shot that hits the rim.", category: "NBA Rules" },
    { prompt: "What is a three-stat double-digit performance called?", choices: ["Three-piece", "Triple-double", "Hat trick", "Full house"], correctIndex: 1, explanation: "Double digits in three statistical categories make a triple-double.", category: "NBA Terms" },
    { prompt: "How high is a regulation basketball rim?", choices: ["8 feet", "9 feet", "10 feet", "12 feet"], correctIndex: 2, explanation: "The rim is 10 feet above the court.", category: "NBA Court" },
    { prompt: "How many quarters are in an NBA regulation game?", choices: ["2", "3", "4", "5"], correctIndex: 2, explanation: "NBA games are divided into four 12-minute quarters.", category: "NBA Rules" },
    { prompt: "What trophy goes to the NBA champion?", choices: ["Larry O’Brien Trophy", "Lombardi Trophy", "Commissioner’s Trophy", "Calder Cup"], correctIndex: 0, explanation: "The champions lift the Larry O’Brien NBA Championship Trophy.", category: "NBA History" },
    { prompt: "What does “and-one” mean?", choices: ["A made basket plus a free throw", "One extra timeout", "A one-point lead", "A technical foul"], correctIndex: 0, explanation: "An and-one occurs when a player scores while fouled and earns a free throw.", category: "NBA Terms" },
    { prompt: "A shot made from beyond which line is worth three points?", choices: ["Free-throw line", "Baseline", "Half-court line", "Three-point arc"], correctIndex: 3, explanation: "Shots made from beyond the three-point arc count for three.", category: "NBA Scoring" },
    { prompt: "What action starts the opening possession of an NBA game?", choices: ["Throw-in", "Jump ball", "Free throw", "Coin toss"], correctIndex: 1, explanation: "The game begins with a jump ball at center court.", category: "NBA Basics" },
  ],
  MLB: [
    { prompt: "How many innings are in a regulation MLB game?", choices: ["7", "8", "9", "10"], correctIndex: 2, explanation: "A regulation game is scheduled for nine innings.", category: "MLB Rules" },
    { prompt: "How many strikes make an out?", choices: ["2", "3", "4", "5"], correctIndex: 1, explanation: "Three strikes result in a strikeout.", category: "MLB Basics" },
    { prompt: "How many runs score on a grand slam when the bases are loaded?", choices: ["2", "3", "4", "5"], correctIndex: 2, explanation: "The batter and all three baserunners score, for four runs.", category: "MLB Scoring" },
    { prompt: "What is a play that records two outs called?", choices: ["Twin hit", "Double play", "Two-bagger", "Split inning"], correctIndex: 1, explanation: "A double play records two outs during the same continuous play.", category: "MLB Terms" },
    { prompt: "How many balls result in a walk?", choices: ["3", "4", "5", "6"], correctIndex: 1, explanation: "Four balls award the batter first base.", category: "MLB Rules" },
    { prompt: "What is MLB’s championship series called?", choices: ["Fall Final", "World Series", "Champions Classic", "Pennant Cup"], correctIndex: 1, explanation: "The American and National League champions meet in the World Series.", category: "MLB History" },
    { prompt: "Which player throws from the mound?", choices: ["Catcher", "Shortstop", "Pitcher", "Center fielder"], correctIndex: 2, explanation: "The pitcher delivers each pitch from the mound.", category: "MLB Positions" },
    { prompt: "What does a designated hitter primarily do?", choices: ["Runs for the catcher", "Bats in place of a fielder", "Calls balls and strikes", "Coaches first base"], correctIndex: 1, explanation: "The designated hitter bats without playing a defensive position in that game.", category: "MLB Terms" },
    { prompt: "How many bases are included when counting home plate?", choices: ["3", "4", "5", "6"], correctIndex: 1, explanation: "First, second, third, and home make four bases.", category: "MLB Field" },
    { prompt: "What is it called when a batter reaches second base on one hit?", choices: ["Double", "Steal", "Bunt", "Sacrifice"], correctIndex: 0, explanation: "A hit that safely reaches second base is a double.", category: "MLB Scoring" },
  ],
  NHL: [
    { prompt: "How many periods are in a regulation NHL game?", choices: ["2", "3", "4", "5"], correctIndex: 1, explanation: "Regulation consists of three 20-minute periods.", category: "NHL Rules" },
    { prompt: "What trophy is awarded to the NHL champion?", choices: ["Stanley Cup", "Calder Cup", "Presidents’ Cup", "Canada Cup"], correctIndex: 0, explanation: "The NHL champion raises the Stanley Cup.", category: "NHL History" },
    { prompt: "How many players per team are normally on the ice, including the goalie?", choices: ["5", "6", "7", "8"], correctIndex: 1, explanation: "A team normally has five skaters and one goaltender on the ice.", category: "NHL Basics" },
    { prompt: "What is three goals by one player in a game called?", choices: ["Triple-double", "Three-star", "Hat trick", "Power trio"], correctIndex: 2, explanation: "Three goals by one player make a hat trick.", category: "NHL Terms" },
    { prompt: "What advantage occurs when the opponent has a player serving a penalty?", choices: ["Power play", "Free skate", "Open ice", "Fast break"], correctIndex: 0, explanation: "The team with more skaters has a power play.", category: "NHL Rules" },
    { prompt: "What event restarts play after a stoppage?", choices: ["Tipoff", "Faceoff", "Kickoff", "Drop shot"], correctIndex: 1, explanation: "An official drops the puck for a faceoff.", category: "NHL Basics" },
    { prompt: "Which lines divide the rink into offensive, neutral, and defensive zones?", choices: ["Goal lines", "Red circles", "Blue lines", "Crease lines"], correctIndex: 2, explanation: "Two blue lines divide the rink into three zones.", category: "NHL Rink" },
    { prompt: "Who is allowed to routinely use a catching glove?", choices: ["Center", "Defenseman", "Goaltender", "Referee"], correctIndex: 2, explanation: "The goaltender wears a specialized catching glove.", category: "NHL Positions" },
    { prompt: "What must the puck completely cross for a goal to count?", choices: ["Blue line", "Center line", "Goal line", "Faceoff circle"], correctIndex: 2, explanation: "The entire puck must cross the goal line between the posts and under the bar.", category: "NHL Scoring" },
    { prompt: "What penalty can be called for shooting the puck across two red lines untouched?", choices: ["Offside", "Icing", "Boarding", "Tripping"], correctIndex: 1, explanation: "Icing can be called when the puck travels untouched across the center and opposing goal lines.", category: "NHL Rules" },
  ],
};

const QUIZ_PACKS = {
  "nfl-weekly": { id: "nfl-weekly", sport: "NFL", title: "Weekly Huddle", edition: "Week 4", description: "Rules, positions, and Sunday essentials." },
  "nfl-history": { id: "nfl-history", sport: "NFL", title: "Gridiron Classics", edition: "Legends", description: "Big-game history and football vocabulary." },
  "nfl-gameday": { id: "nfl-gameday", sport: "NFL", title: "Game Day Challenge", edition: "Sunday", description: "A fast pregame test for the whole room." },
  "nba-weekly": { id: "nba-weekly", sport: "NBA", title: "Weekly Tipoff", edition: "This week", description: "Court rules, scoring, and basketball IQ." },
  "nba-history": { id: "nba-history", sport: "NBA", title: "Hardwood Legends", edition: "Legends", description: "Championship language and iconic fundamentals." },
  "nba-gameday": { id: "nba-gameday", sport: "NBA", title: "Prime Time Hoops", edition: "Game night", description: "A quick warmup before the opening tip." },
  "mlb-roundup": { id: "mlb-roundup", sport: "MLB", title: "September 29 Roundup", edition: "Sep 29", description: "A late-season baseball knowledge check." },
  "mlb-postseason": { id: "mlb-postseason", sport: "MLB", title: "Postseason Push", edition: "October", description: "Playoff terms, scoring, and diamond basics." },
  "mlb-classics": { id: "mlb-classics", sport: "MLB", title: "Ballpark Classics", edition: "Legends", description: "Timeless rules and baseball vocabulary." },
  "nhl-weekly": { id: "nhl-weekly", sport: "NHL", title: "Weekly Faceoff", edition: "This week", description: "Rink rules, scoring, and hockey essentials." },
  "nhl-rivalry": { id: "nhl-rivalry", sport: "NHL", title: "Rivalry Night", edition: "Game night", description: "Fast-paced trivia before the puck drops." },
  "nhl-cup": { id: "nhl-cup", sport: "NHL", title: "Cup Classics", edition: "Legends", description: "Championship traditions and hockey terms." },
};

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

function createRoom(name, packId) {
  const host = createPlayer(name, true);
  const pack = QUIZ_PACKS[packId] || { id: "general", sport: "GENERAL", title: "Quickfire Mix", edition: "Classic", description: "Ten fast questions across every category." };
  const room = {
    code: makeRoomCode(),
    phase: "lobby",
    players: [host],
    pack,
    questions: SPORT_QUESTIONS[pack.sport] || QUESTIONS,
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
  const current = room.questions[room.questionIndex];
  const question = current
    ? {
        number: room.questionIndex + 1,
        total: room.questions.length,
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
    pack: room.pack,
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
  const question = room.questions[room.questionIndex];

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
    if (room.questionIndex >= room.questions.length - 1) {
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
        const { room, player } = createRoom(name, body.packId);
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

module.exports = { createGameServer, QUESTIONS, QUIZ_PACKS, SPORT_QUESTIONS };
