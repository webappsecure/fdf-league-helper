# FDF League Helper

A companion app for the Commissioner Expansion (version 1.5) to Fast Drive Football. It runs on your own computer. You create a league, it rolls the teams, owners, coaches and offenses and defenses for you, and it prints the team cards. When a season is over, you enter the results and it runs the off-season: coaches, Franchise Points, the annual draft, training camp and the new season. Every past season stays on file so you can look at it or print its cards again.

It is a fan-made helper. It is not the game, and you need your own copy of Fast Drive Football and the Commissioner Expansion to play.

## What you need

- [Node.js](https://nodejs.org) version 24 or later, which also installs `npm`
- A modern web browser

You do not need an account, a hosted service or any settings.

## Install

Download or clone this repository, open a terminal in its folder, and run:

```bash
npm install
```

## Run

For everyday use, run this in the same folder:

```bash
npm run dev
```

Then open <http://localhost:3000> in your browser. Press Ctrl+C in the terminal to stop the app.

If you prefer the production version, build it once and start it. It uses the same address:

```bash
npm run build
```

```bash
npm run start
```

To print cards, open a league's team cards page and choose Print cards. The browser prints six cards per page on letter paper in landscape.

## Your league data

Everything you create is kept in one file, `data/fdf.sqlite`, inside the folder you start the app from. The app creates it the first time it runs. The `data` folder is not part of the repository, so updating or re-downloading the code never touches your leagues.

To keep the file somewhere else, set the `FDF_DB_PATH` environment variable to the full path of the file before you start the app. For example, on macOS or Linux:

```bash
FDF_DB_PATH=/path/to/my-league.sqlite npm run dev
```

## Back up, move or restore your leagues

1. Stop the app (Ctrl+C in the terminal).
2. Copy `data/fdf.sqlite` somewhere safe. That copy is your backup.

To move your leagues to another computer, install the app there as described above, copy the file into that computer's `data` folder (create the folder if it is missing) before the first run, then start the app. To restore a backup, stop the app and put the file back the same way.

When you update to a newer version of the app, it upgrades your file the first time it opens it. Make a backup before you update, and do not put a file saved by a newer version back into an older version of the app.

## Credits

Fast Drive Football and 3d6 Games were created by Al Wilson. The Commissioner Expansion version 1.5 is published by 3d6 Games (© 2024 3d6 Games). Its rules, tables and name lists are included in this app with the author's permission. All credit for the game belongs to them.

## Developing

The repository uses these commands:

```bash
npm test
```

```bash
npm run test:browser
```

```bash
npm run verify
```

`npm test` runs the unit tests, `npm run test:browser` runs the browser tests (it builds the app and starts its own copy on port 3100 with a temporary database), and `npm run verify` runs lint, the unit tests and the browser tests in turn. Notes for coding assistants and contributors are in [AGENTS.md](AGENTS.md).
