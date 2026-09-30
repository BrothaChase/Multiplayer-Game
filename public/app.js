const app = document.querySelector("#app");
const SESSION_KEY = "quickfire-session";
const CHOICE_MARKS = ["A", "B", "C", "D"];
const CHOICE_COLORS = ["#8367ff", "#ff6f61", "#4ed8e6", "#ffcf5a"];
const SPORTS = ["NFL", "NBA", "MLB", "NHL"];
const CATEGORY_LABELS = {
  roundup: "Weekly roundup",
  game: "Game day",
  history: "History & legends",
};
const PACKS = [
  { id: "nfl-weekly", sport: "NFL", category: "roundup", title: "Weekly Huddle", edition: "Week 4", description: "Rules, positions, and Sunday essentials.", tone: "orange" },
  { id: "nfl-gameday", sport: "NFL", category: "game", title: "Game Day Challenge", edition: "Sunday", description: "A fast pregame test for the whole room.", tone: "purple" },
  { id: "nfl-history", sport: "NFL", category: "history", title: "Gridiron Classics", edition: "Legends", description: "Big-game history and football vocabulary.", tone: "blue" },
  { id: "nba-weekly", sport: "NBA", category: "roundup", title: "Weekly Tipoff", edition: "This week", description: "Court rules, scoring, and basketball IQ.", tone: "orange" },
  { id: "nba-gameday", sport: "NBA", category: "game", title: "Prime Time Hoops", edition: "Game night", description: "A quick warmup before the opening tip.", tone: "purple" },
  { id: "nba-history", sport: "NBA", category: "history", title: "Hardwood Legends", edition: "Legends", description: "Championship language and iconic fundamentals.", tone: "blue" },
  { id: "mlb-roundup", sport: "MLB", category: "roundup", title: "September 29 Roundup", edition: "Sep 29", description: "A late-season baseball knowledge check.", tone: "orange" },
  { id: "mlb-postseason", sport: "MLB", category: "game", title: "Postseason Push", edition: "October", description: "Playoff terms, scoring, and diamond basics.", tone: "purple" },
  { id: "mlb-classics", sport: "MLB", category: "history", title: "Ballpark Classics", edition: "Legends", description: "Timeless rules and baseball vocabulary.", tone: "blue" },
  { id: "nhl-weekly", sport: "NHL", category: "roundup", title: "Weekly Faceoff", edition: "This week", description: "Rink rules, scoring, and hockey essentials.", tone: "blue" },
  { id: "nhl-rivalry", sport: "NHL", category: "game", title: "Rivalry Night", edition: "Game night", description: "Fast-paced trivia before the puck drops.", tone: "orange" },
  { id: "nhl-cup", sport: "NHL", category: "history", title: "Cup Classics", edition: "Legends", description: "Championship traditions and hockey terms.", tone: "purple" },
];

let session = null;
let gameState = null;
let eventSource = null;
let countdownTimer = null;
let connectionStatus = "connected";
let renderedPhase = null;
let selectedSport = "MLB";
let selectedCategory = "roundup";
let selectedPackId = "mlb-roundup";
let hostNameDraft = "";

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
          <span class="brand-mark" aria-hidden="true">Q</span>
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
  renderedPhase = null;
  const sportPacks = PACKS.filter((pack) => pack.sport === selectedSport);
  const sportCategories = [...new Set(sportPacks.map((pack) => pack.category))];
  const categoryPacks = sportPacks.filter((pack) => pack.category === selectedCategory);
  const selectedPack = PACKS.find((pack) => pack.id === selectedPackId) || categoryPacks[0] || sportPacks[0];
  app.innerHTML = page(`
    <section class="sports-hub">
      <div class="hub-intro">
        <div>
          <p class="eyebrow">The trivia clubhouse</p>
          <h1>Pick your sport.<br>Own the board.</h1>
          <p class="lede">Choose a weekly roundup, a game-night challenge, or a trip through the record books.</p>
        </div>
        <form class="card quick-join" id="join-form">
          <div class="quick-join-copy">
            <p class="eyebrow">Live room</p>
            <h2>Join by code</h2>
          </div>
          <div class="join-fields">
            <div class="field compact-field">
              <label for="room-code">Room code</label>
              <input class="code-input" id="room-code" name="code" maxlength="6" autocomplete="off" placeholder="ABC123" required />
            </div>
            <div class="field compact-field">
              <label for="join-name">Your name</label>
              <input id="join-name" name="name" maxlength="18" autocomplete="nickname" placeholder="Rookie" required />
            </div>
            <button class="button secondary join-button" type="submit">Join</button>
          </div>
          <p class="error" id="join-error"></p>
        </form>
      </div>

      <nav class="sport-tabs" aria-label="Choose a sport">
        ${SPORTS.map((sport) => `<button class="sport-tab ${sport === selectedSport ? "active" : ""}" type="button" data-sport="${sport}" aria-pressed="${sport === selectedSport}">${sport}</button>`).join("")}
      </nav>

      <div class="edition-strip" aria-label="${selectedSport} trivia editions">
        ${sportPacks.map((pack, index) => `
          <button class="edition-chip ${pack.id === selectedPackId ? "active" : ""}" type="button" data-pack="${pack.id}">
            <span>${escapeHtml(pack.edition)}</span>
            <strong>${escapeHtml(CATEGORY_LABELS[pack.category])}</strong>
          </button>`).join("")}
      </div>

      <div class="hub-section-heading">
        <div><p class="eyebrow">${selectedSport} lineup</p><h2>Choose your challenge</h2></div>
        <span class="pack-count">${sportPacks.length} packs · 10 questions each</span>
      </div>

      <div class="pack-grid">
        ${sportPacks.map((pack, index) => `
          <article class="pack-card card ${pack.tone} ${pack.id === selectedPackId ? "selected" : ""}">
            <div class="pack-card-top">
              <span class="sport-badge">${pack.sport}</span>
              <span class="pack-edition">${escapeHtml(pack.edition)}</span>
            </div>
            <div class="matchup-mark" aria-hidden="true"><span>${index + 1}</span><i></i><span>10</span></div>
            <h3>${escapeHtml(pack.title)}</h3>
            <p>${escapeHtml(pack.description)}</p>
            <button class="button ${index === 0 ? "" : "secondary"} full" type="button" data-pack="${pack.id}">${pack.id === selectedPackId ? "Selected" : "Host this quiz"}</button>
          </article>`).join("")}
      </div>

      <section class="card host-panel" id="host-panel">
          <div>
            <p class="eyebrow">Create a private room</p>
            <h2>Build your matchup</h2>
            <p class="waiting-note">Choose the sport, category, and exact trivia pack. Then share the room code with up to seven friends.</p>
          </div>
          <form id="create-form" class="host-form">
            <div class="room-options" aria-label="Room trivia options">
              <div class="field compact-field">
                <label for="create-sport">Sport</label>
                <select id="create-sport" name="sport">
                  ${SPORTS.map((sport) => `<option value="${sport}" ${sport === selectedSport ? "selected" : ""}>${sport}</option>`).join("")}
                </select>
              </div>
              <div class="field compact-field">
                <label for="create-category">Category</label>
                <select id="create-category" name="category">
                  ${sportCategories.map((category) => `<option value="${category}" ${category === selectedCategory ? "selected" : ""}>${escapeHtml(CATEGORY_LABELS[category])}</option>`).join("")}
                </select>
              </div>
              <div class="field compact-field">
                <label for="create-pack">Quiz pack</label>
                <select id="create-pack" name="packId">
                  ${categoryPacks.map((pack) => `<option value="${pack.id}" ${pack.id === selectedPack.id ? "selected" : ""}>${escapeHtml(pack.title)}</option>`).join("")}
                </select>
              </div>
            </div>
            <div class="field compact-field">
              <label for="create-name">Host display name</label>
              <input id="create-name" name="name" maxlength="18" autocomplete="nickname" placeholder="Commissioner" value="${escapeHtml(hostNameDraft)}" required />
            </div>
            <button class="button" type="submit">Create room</button>
            <p class="error" id="create-error">${escapeHtml(message)}</p>
          </form>
        </section>
    </section>
  `);

  document.querySelector("#room-code").addEventListener("input", (event) => {
    event.target.value = event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "");
  });

  document.querySelectorAll("[data-sport]").forEach((button) => {
    button.addEventListener("click", () => {
      selectedSport = button.dataset.sport;
      const firstPack = PACKS.find((pack) => pack.sport === selectedSport);
      selectedCategory = firstPack.category;
      selectedPackId = firstPack.id;
      showHome();
    });
  });
  document.querySelectorAll("[data-pack]").forEach((button) => {
    button.addEventListener("click", () => {
      const pack = PACKS.find((candidate) => candidate.id === button.dataset.pack);
      selectedSport = pack.sport;
      selectedCategory = pack.category;
      selectedPackId = pack.id;
      showHome();
      requestAnimationFrame(() => document.querySelector("#host-panel")?.scrollIntoView({ behavior: "smooth", block: "center" }));
    });
  });
  document.querySelector("#create-sport").addEventListener("change", (event) => {
    selectedSport = event.target.value;
    const firstPack = PACKS.find((pack) => pack.sport === selectedSport);
    selectedCategory = firstPack.category;
    selectedPackId = firstPack.id;
    showHome();
  });
  document.querySelector("#create-category").addEventListener("change", (event) => {
    selectedCategory = event.target.value;
    selectedPackId = PACKS.find((pack) => pack.sport === selectedSport && pack.category === selectedCategory).id;
    showHome();
  });
  document.querySelector("#create-pack").addEventListener("change", (event) => {
    selectedPackId = event.target.value;
    showHome();
  });
  document.querySelector("#create-name").addEventListener("input", (event) => {
    hostNameDraft = event.target.value;
  });
  document.querySelector("#create-form")?.addEventListener("submit", createRoom);
  document.querySelector("#join-form").addEventListener("submit", joinRoom);
}

async function createRoom(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector("button");
  const error = form.querySelector(".error");
  hostNameDraft = form.elements.name.value;
  button.disabled = true;
  button.textContent = "Creating…";
  error.textContent = "";
  try {
    const data = await api("/api/rooms", {
      method: "POST",
      body: JSON.stringify({ name: form.elements.name.value, packId: form.elements.packId.value }),
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
      <div class="lobby-pack-banner">
        <span class="sport-badge">${escapeHtml(gameState.pack.sport)}</span>
        <div><p class="eyebrow">${escapeHtml(gameState.pack.edition)}</p><h2>${escapeHtml(gameState.pack.title)}</h2></div>
      </div>
      <div class="lobby-grid">
        <section class="card panel-pad">
          <p class="eyebrow">Players</p>
          <h2>The room is filling up</h2>
          <ul class="player-list">${playerRows(gameState.players)}</ul>
        </section>
        <aside class="card panel-pad">
          <p class="eyebrow">Up next</p>
          <h2>${escapeHtml(gameState.pack.title)}</h2>
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
    <div class="pixel-hero question-art" role="img" aria-label="Pixel art autumn sports park">
      <div class="sport-ticker" aria-hidden="true"><span>${escapeHtml(gameState.pack.sport)}</span><span>${escapeHtml(gameState.pack.title)}</span></div>
    </div>
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
      <div class="pixel-hero arena-strip" role="img" aria-label="Pixel art autumn sports park scoreboard view"></div>
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
      <div class="pixel-hero arena-strip" role="img" aria-label="Pixel art autumn championship grounds"></div>
      <p class="eyebrow">Game complete</p>
      <h1 style="margin-inline:auto">${top[0]?.id === gameState.me.id ? "You won the room." : `${escapeHtml(top[0]?.name || "Nobody")} takes it.`}</h1>
      <p class="lede" style="margin-inline:auto">${escapeHtml(gameState.pack.title)} is complete. Here’s how everyone finished.</p>
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
  const phaseChanged = renderedPhase !== gameState.phase;
  renderedPhase = gameState.phase;
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
  if (phaseChanged) requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "smooth" }));
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
