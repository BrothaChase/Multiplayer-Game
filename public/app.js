const app = document.querySelector("#app");
const SESSION_KEY = "quickfire-session";
const CHOICE_MARKS = ["A", "B", "C", "D"];
const CHOICE_COLORS = ["#8367ff", "#ff6f61", "#4ed8e6", "#ffcf5a"];

let session = null;
let gameState = null;
let eventSource = null;
let countdownTimer = null;
let connectionStatus = "connected";

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Something went wrong. Please try again.");
  return data;
}

function saveSession(nextSession) {
  session = nextSession;
  localStorage.setItem(SESSION_KEY, JSON.stringify(nextSession));
}

function clearSession() {
  eventSource?.close();
  eventSource = null;
  session = null;
  gameState = null;
  localStorage.removeItem(SESSION_KEY);
}

function authBody(extra = {}) {
  return JSON.stringify({ playerId: session.playerId, token: session.token, ...extra });
}

function page(content, inGame = false) {
  return `
    <main class="page">
      <header class="topbar">
        <div class="brand" aria-label="Quickfire Trivia">
          <span class="brand-mark" aria-hidden="true">ϟ</span>
          <span class="brand-word">Quickfire</span>
        </div>
        ${inGame ? `
          <div style="display:flex;align-items:center;gap:12px">
            <span class="connection ${connectionStatus === "offline" ? "offline" : ""}">
              ${connectionStatus === "offline" ? "Reconnecting" : "Live"}
            </span>
            <button class="subtle-button" data-action="leave">Leave</button>
          </div>
        ` : `<span class="connection">Ready to play</span>`}
      </header>
      ${content}
    </main>`;
}

function showHome(message = "") {
  clearInterval(countdownTimer);
  app.innerHTML = page(`
    <section>
      <p class="eyebrow">Real-time trivia · 2–8 players</p>
      <h1>Think fast.<br>Claim the board.</h1>
      <p class="lede">Ten questions. Fifteen seconds each. Bring your sharpest friends and see who knows it first.</p>
      <div class="home-grid">
        <form class="card action-card create-card" id="create-form">
          <p class="eyebrow">Start a new game</p>
          <h2>Create a room</h2>
          <div class="field">
            <label for="create-name">Your display name</label>
            <input id="create-name" name="name" maxlength="18" autocomplete="nickname" placeholder="Quizmaster" required />
          </div>
          <button class="button full" type="submit">Create room</button>
          <p class="error" id="create-error">${escapeHtml(message)}</p>
        </form>
        <form class="card action-card" id="join-form">
          <p class="eyebrow">Have a room code?</p>
          <h2>Join the game</h2>
          <div class="field">
            <label for="room-code">6-character room code</label>
            <input class="code-input" id="room-code" name="code" maxlength="6" autocomplete="off" placeholder="ABC123" required />
          </div>
          <div class="field">
            <label for="join-name">Your display name</label>
            <input id="join-name" name="name" maxlength="18" autocomplete="nickname" placeholder="Fast thinker" required />
          </div>
          <button class="button secondary full" type="submit">Join room</button>
          <p class="error" id="join-error"></p>
        </form>
      </div>
    </section>
  `);

  document.querySelector("#room-code").addEventListener("input", (event) => {
    event.target.value = event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "");
  });

  document.querySelector("#create-form").addEventListener("submit", createRoom);
  document.querySelector("#join-form").addEventListener("submit", joinRoom);
}

async function createRoom(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector("button");
  const error = form.querySelector(".error");
  button.disabled = true;
  button.textContent = "Creating…";
  error.textContent = "";
  try {
    const data = await api("/api/rooms", {
      method: "POST",
      body: JSON.stringify({ name: form.elements.name.value }),
    });
    saveSession({ roomCode: data.roomCode, playerId: data.playerId, token: data.token });
    gameState = data.state;
    connect();
    renderGame();
  } catch (caught) {
    error.textContent = caught.message;
    button.disabled = false;
    button.textContent = "Create room";
  }
}

async function joinRoom(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector("button");
  const error = form.querySelector(".error");
  const code = form.elements.code.value.trim().toUpperCase();
  button.disabled = true;
  button.textContent = "Joining…";
  error.textContent = "";
  try {
    const data = await api(`/api/rooms/${encodeURIComponent(code)}/join`, {
      method: "POST",
      body: JSON.stringify({ name: form.elements.name.value }),
    });
    saveSession({ roomCode: data.roomCode, playerId: data.playerId, token: data.token });
    gameState = data.state;
    connect();
    renderGame();
  } catch (caught) {
    error.textContent = caught.message;
    button.disabled = false;
    button.textContent = "Join room";
  }
}

function connect() {
  eventSource?.close();
  const query = new URLSearchParams({ playerId: session.playerId, token: session.token });
  eventSource = new EventSource(`/api/rooms/${session.roomCode}/events?${query}`);
  eventSource.addEventListener("open", () => {
    connectionStatus = "connected";
    updateConnectionPill();
  });
  eventSource.addEventListener("state", (event) => {
    gameState = JSON.parse(event.data);
    connectionStatus = "connected";
    renderGame();
  });
  eventSource.addEventListener("error", () => {
    connectionStatus = "offline";
    updateConnectionPill();
  });
}

function updateConnectionPill() {
  const pill = document.querySelector(".connection");
  if (!pill || !session) return;
  pill.classList.toggle("offline", connectionStatus === "offline");
  pill.textContent = connectionStatus === "offline" ? "Reconnecting" : "Live";
}

function playerRows(players, includeScores = false) {
  return players.map((player, index) => `
    <li class="${includeScores ? "leader-row" : "player-row"} ${player.id === gameState.me.id ? "me" : ""}">
      ${includeScores ? `<span class="rank">${index + 1}</span>` : `<span class="avatar" style="background:${CHOICE_COLORS[index % CHOICE_COLORS.length]}">${escapeHtml(player.name[0].toUpperCase())}</span>`}
      <span class="player-name">${escapeHtml(player.name)}${player.id === gameState.me.id ? " (you)" : ""}</span>
      ${player.isHost ? `<span class="tag">Host</span>` : ""}
      ${includeScores ? `<span class="leader-score">${player.score.toLocaleString()}</span>` : ""}
    </li>
  `).join("");
}

function gameStats() {
  return `
    <div class="stat-row">
      <div class="stat"><span class="stat-label">Score</span><span class="stat-value">${gameState.me.score.toLocaleString()}</span></div>
      <div class="stat"><span class="stat-label">Rank</span><span class="stat-value">#${gameState.me.rank}</span></div>
    </div>`;
}

function renderLobby() {
  const canStart = gameState.playerCount >= 2;
  return page(`
    <div class="game-shell">
      <div class="room-header">
        <div>
          <p class="eyebrow">Room code</p>
          <div class="room-code-wrap">
            <span class="room-code">${gameState.code}</span>
            <button class="button secondary small" data-action="copy-code">Copy code</button>
          </div>
        </div>
        <span class="tag">${gameState.playerCount}/8 joined</span>
      </div>
      <div class="lobby-grid">
        <section class="card panel-pad">
          <p class="eyebrow">Players</p>
          <h2>The room is filling up</h2>
          <ul class="player-list">${playerRows(gameState.players)}</ul>
        </section>
        <aside class="card panel-pad">
          <p class="eyebrow">Up next</p>
          <h2>10 quick questions</h2>
          <p class="waiting-note">You’ll have 15 seconds for each question. Correct answers earn more points when they’re fast.</p>
          ${gameState.me.isHost
            ? `<button class="button full" data-action="start" ${canStart ? "" : "disabled"}>${canStart ? "Start game" : "Waiting for a player"}</button>`
            : `<p class="waiting-note"><strong>${escapeHtml(gameState.players.find((player) => player.isHost)?.name || "The host")}</strong> will start when everyone is ready.</p>`}
          <p class="error" id="game-error"></p>
        </aside>
      </div>
    </div>
  `, true);
}

function progressBar() {
  const percent = gameState.question ? (gameState.question.number / gameState.question.total) * 100 : 0;
  return `<div class="progress-track" aria-hidden="true"><div class="progress-fill" style="width:${percent}%"></div></div>`;
}

function answerButtons(reveal = false) {
  const question = gameState.question;
  return question.choices.map((choice, index) => {
    const selected = gameState.me.selectedAnswer === index;
    const isCorrect = reveal && question.correctIndex === index;
    const classes = ["answer"];
    if (selected) classes.push("selected");
    if (reveal && isCorrect) classes.push("correct");
    if (reveal && selected && !isCorrect) classes.push("wrong");
    if (!reveal && gameState.me.hasAnswered && !selected) classes.push("dimmed");
    return `
      <button class="${classes.join(" ")}" style="--choice:${CHOICE_COLORS[index]}" data-choice="${index}" ${reveal || gameState.me.hasAnswered ? "disabled" : ""}>
        <span class="choice-marker">${CHOICE_MARKS[index]}</span>
        <span class="answer-text">${escapeHtml(choice)}</span>
        ${reveal ? `<span class="answer-count">${gameState.answerCounts[index]} vote${gameState.answerCounts[index] === 1 ? "" : "s"}</span>` : ""}
      </button>`;
  }).join("");
}

function questionHeader(includeTimer = true) {
  return `
    <div class="game-meta">
      <p class="eyebrow">Question ${gameState.question.number} of ${gameState.question.total}</p>
      ${gameStats()}
    </div>
    ${progressBar()}
    <div class="question-head">
      <div>
        <p class="category">${escapeHtml(gameState.question.category)}</p>
        <h2 class="question-title">${escapeHtml(gameState.question.prompt)}</h2>
      </div>
      ${includeTimer ? `<div class="timer" id="timer"><span class="timer-value" id="timer-value">15</span></div>` : ""}
    </div>`;
}

function renderQuestion() {
  return page(`
    <div class="game-shell">
      ${questionHeader(true)}
      <div class="answers">${answerButtons(false)}</div>
      <p class="lock-message">${gameState.me.hasAnswered ? `Answer locked · ${gameState.answeredCount}/${gameState.playerCount} players ready` : "Choose carefully—your first answer is final."}</p>
      <p class="error center" id="game-error"></p>
    </div>
  `, true);
}

function renderReveal() {
  const noAnswer = gameState.me.selectedAnswer === null;
  const correct = gameState.me.wasCorrect;
  const title = noAnswer ? "Time’s up" : correct ? "That’s right!" : "Not this time";
  return page(`
    <div class="game-shell">
      <div class="result-banner ${correct ? "" : "wrong"}">
        <p class="result-title">${title}</p>
        <span class="points-earned">${correct ? `+${gameState.me.lastPoints}` : "+0"}</span>
      </div>
      ${questionHeader(false)}
      <div class="answers">${answerButtons(true)}</div>
      <p class="explanation">${escapeHtml(gameState.question.explanation)}</p>
    </div>
  `, true);
}

function renderLeaderboard() {
  return page(`
    <section class="card panel-pad leader-card">
      <div class="center">
        <p class="eyebrow">After question ${gameState.question.number}</p>
        <h2>${gameState.question.number === gameState.question.total ? "Final scores are in" : "Here’s the board"}</h2>
      </div>
      <ol class="leader-list">${playerRows(gameState.players, true)}</ol>
      <p class="next-label" id="next-label">${gameState.question.number === gameState.question.total ? "Final results in 4…" : "Next question in 4…"}</p>
    </section>
  `, true);
}

function renderFinished() {
  const top = gameState.players.slice(0, 3);
  const ordered = [top[1], top[0], top[2]].filter(Boolean);
  return page(`
    <section class="game-shell center">
      <p class="eyebrow">Game complete</p>
      <h1 style="margin-inline:auto">${top[0]?.id === gameState.me.id ? "You won the room." : `${escapeHtml(top[0]?.name || "Nobody")} takes it.`}</h1>
      <p class="lede" style="margin-inline:auto">Ten questions down. Here’s how everyone finished.</p>
      <div class="podium">
        ${ordered.map((player) => `
          <div class="podium-place ${player.rank === 1 ? "first" : ""}">
            <span class="podium-number">#${player.rank}</span>
            <span class="podium-name">${escapeHtml(player.name)}</span>
            <span>${player.score.toLocaleString()} pts</span>
          </div>
        `).join("")}
      </div>
      <div class="card panel-pad" style="text-align:left">
        <ol class="leader-list">${playerRows(gameState.players, true)}</ol>
      </div>
      <div class="action-row">
        ${gameState.me.isHost ? `<button class="button" data-action="replay">Play again</button>` : ""}
        <button class="button secondary" data-action="leave">Leave room</button>
      </div>
      <p class="error center" id="game-error"></p>
    </section>
  `, true);
}

function renderGame() {
  clearInterval(countdownTimer);
  if (!gameState) return;
  const renderers = {
    lobby: renderLobby,
    question: renderQuestion,
    reveal: renderReveal,
    leaderboard: renderLeaderboard,
    finished: renderFinished,
  };
  app.innerHTML = (renderers[gameState.phase] || renderLobby)();
  bindGameActions();
  startCountdown();
}

function bindGameActions() {
  document.querySelectorAll("[data-action]").forEach((button) => {
    button.addEventListener("click", () => handleAction(button.dataset.action, button));
  });
  document.querySelectorAll("[data-choice]").forEach((button) => {
    button.addEventListener("click", () => submitAnswer(Number(button.dataset.choice)));
  });
}

async function handleAction(action, button) {
  if (action === "leave") {
    clearSession();
    showHome();
    return;
  }
  if (action === "copy-code") {
    await navigator.clipboard.writeText(gameState.code).catch(() => {});
    button.textContent = "Copied";
    setTimeout(() => { if (button.isConnected) button.textContent = "Copy code"; }, 1500);
    return;
  }

  button.disabled = true;
  const error = document.querySelector("#game-error");
  try {
    await api(`/api/rooms/${session.roomCode}/${action}`, { method: "POST", body: authBody() });
  } catch (caught) {
    if (error) error.textContent = caught.message;
    button.disabled = false;
  }
}

async function submitAnswer(choiceIndex) {
  document.querySelectorAll("[data-choice]").forEach((button) => { button.disabled = true; });
  try {
    await api(`/api/rooms/${session.roomCode}/answer`, {
      method: "POST",
      body: authBody({ choiceIndex }),
    });
  } catch (caught) {
    const error = document.querySelector("#game-error");
    if (error) error.textContent = caught.message;
    document.querySelectorAll("[data-choice]").forEach((button) => { button.disabled = false; });
  }
}

function startCountdown() {
  if (!gameState.phaseEndsAt) return;
  const update = () => {
    const remainingMs = Math.max(0, gameState.phaseEndsAt - Date.now());
    const seconds = Math.max(0, Math.ceil(remainingMs / 1000));
    const timer = document.querySelector("#timer");
    const timerValue = document.querySelector("#timer-value");
    const nextLabel = document.querySelector("#next-label");
    if (timer && timerValue) {
      timer.style.setProperty("--progress", String(Math.min(1, remainingMs / 15_000)));
      timerValue.textContent = seconds;
    }
    if (nextLabel) {
      const lead = gameState.question.number === gameState.question.total ? "Final results" : "Next question";
      nextLabel.textContent = `${lead} in ${seconds}…`;
    }
    if (remainingMs <= 0) clearInterval(countdownTimer);
  };
  update();
  countdownTimer = setInterval(update, 100);
}

async function restore() {
  try {
    session = JSON.parse(localStorage.getItem(SESSION_KEY));
  } catch {
    session = null;
  }
  if (!session?.roomCode || !session?.playerId || !session?.token) {
    showHome();
    return;
  }
  try {
    const query = new URLSearchParams({ playerId: session.playerId, token: session.token });
    gameState = await api(`/api/rooms/${session.roomCode}?${query}`);
    connect();
    renderGame();
  } catch {
    clearSession();
    showHome("Your previous room has closed. Create a new one to play again.");
  }
}

restore();
