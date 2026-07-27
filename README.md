# Table One Mahjong

This is the email-safe, standalone edition of Table One Mahjong. It contains
only the browser game and its automated gameplay test.

It does not contain:

- account or authentication code
- hosting credentials or project identifiers
- database code or migrations
- server or worker code
- environment files
- generated dependencies or build output

## Run the game

Install Node.js 20.19 or newer, then run:

```bash
npm install
npm run dev
```

Open the local address printed in the terminal.

## Verify the game

```bash
npm test
```

This builds the standalone browser app and runs the repeatable 100-game
computer simulation.

## Upload to GitHub

Upload this entire folder. Do not add `node_modules`, `dist`, or `.env` files.
