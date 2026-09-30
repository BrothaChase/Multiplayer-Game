# Quickfire Trivia

A real-time party trivia game for 2–8 players. One player creates a room, everyone else joins with the six-character code, and the full game runs on each player’s phone or computer.

## Run locally

Quickfire only requires Node.js 20 or newer. It has no third-party runtime dependencies.

```bash
npm start
```

Open [http://localhost:3000](http://localhost:3000) in a browser. To test multiple players on one computer, use a second browser or a private browsing window so that each player has separate local storage.

## Core game loop

- Browse NFL, NBA, MLB, and NHL trivia sections.
- Choose from weekly, game-night, dated, and history quiz packs.
- Set the sport, trivia category, and exact quiz pack before creating a room.
- Create a room and share its six-character code.
- Join with 2–8 unique display names.
- Answer 10 multiple-choice questions with a 15-second timer.
- Earn 600–1,000 points for correct answers, based on response speed.
- See the correct answer, explanation, and vote totals after each question.
- View the live leaderboard between questions and the final podium at the end.
- Keep the same room and players for a rematch.

Rooms are held in memory for this first local version, so restarting the server closes active rooms.

## Verify

```bash
npm test
```
