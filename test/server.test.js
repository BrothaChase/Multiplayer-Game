const test = require("node:test");
const assert = require("node:assert/strict");
const { once } = require("node:events");
const { createGameServer } = require("../server");

async function post(baseUrl, pathname, body) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  assert.ok(response.ok, `${response.status}: ${JSON.stringify(data)}`);
  return data;
}

test("two players can create, join, answer, and reach the reveal", async (context) => {
  const server = createGameServer({
    durations: { question: 60, reveal: 250, leaderboard: 250 },
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  context.after(() => server.close());

  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;
  const host = await post(baseUrl, "/api/rooms", { name: "Alice" });
  const guest = await post(baseUrl, `/api/rooms/${host.roomCode}/join`, { name: "Bob" });

  assert.equal(guest.state.playerCount, 2);
  assert.equal(guest.state.phase, "lobby");

  await post(baseUrl, `/api/rooms/${host.roomCode}/start`, {
    playerId: host.playerId,
    token: host.token,
  });
  await post(baseUrl, `/api/rooms/${host.roomCode}/answer`, {
    playerId: host.playerId,
    token: host.token,
    choiceIndex: 1,
  });
  await post(baseUrl, `/api/rooms/${host.roomCode}/answer`, {
    playerId: guest.playerId,
    token: guest.token,
    choiceIndex: 0,
  });

  await new Promise((resolve) => setTimeout(resolve, 90));
  const query = new URLSearchParams({ playerId: host.playerId, token: host.token });
  const response = await fetch(`${baseUrl}/api/rooms/${host.roomCode}?${query}`);
  const state = await response.json();

  assert.equal(response.status, 200);
  assert.equal(state.phase, "reveal");
  assert.equal(state.question.correctIndex, 1);
  assert.equal(state.me.wasCorrect, true);
  assert.ok(state.me.lastPoints >= 600 && state.me.lastPoints <= 1000);
  assert.deepEqual(state.answerCounts, [1, 1, 0, 0]);
});
