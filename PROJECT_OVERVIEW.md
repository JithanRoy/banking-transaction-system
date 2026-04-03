# Banking System Project Overview

## Summary

This project is a small backend API for a banking system built with Node.js, Express, and PostgreSQL. It focuses on two core areas:

- account creation and retrieval
- balance withdrawal with transaction handling and optimistic locking

The codebase currently contains two very similar application layouts:

- a root-level app structure (`app.js`, `server.js`, `controllers/`, `config/`)
- a `src/` app structure with the same purpose

Based on the files currently present and the open editor context, the `src/` version appears to be the active working structure.

## Main Stack

- Node.js
- Express
- PostgreSQL via `pg`
- `dotenv` for environment variables
- `cors` for cross-origin requests
- `nodemon` as a dev dependency

## Current Structure

```text
src/
  app.js
  server.js
  config/
    db.js
  controllers/
    account.controller.js
  routes/
    account.routes.js
  services/
    transaction.service.js
```

There is also a duplicate root-level structure:

```text
app.js
server.js
config/db.js
controllers/account.controller.js
```

## How The App Flows

### 1. Server startup

`src/server.js` starts the Express app on `process.env.PORT` or `5000`.

### 2. App setup

`src/app.js`:

- loads environment variables
- enables CORS
- enables JSON body parsing
- mounts route groups under:
  - `/api/accounts`
  - `/api/transactions`
- exposes a root health-style response at `/`

### 3. Database access

`src/config/db.js` creates a PostgreSQL connection pool using:

- `process.env.DATABASE_URL`

### 4. Account features

`src/controllers/account.controller.js` currently supports:

- `createAccount`
  - inserts a new account into the `accounts` table
- `getAccount`
  - fetches a single account by `account_id`

`src/routes/account.routes.js` exposes:

- `POST /api/accounts/`
- `GET /api/accounts/:id`

### 5. Transaction logic

`src/services/transaction.service.js` implements withdrawal logic:

- opens a DB transaction with `BEGIN`
- fetches the account row
- checks that the account exists
- checks that the balance is sufficient
- updates the account using optimistic locking through a `version` column
- commits on success
- rolls back on failure

This is the most important business-logic-heavy part of the project right now.

## Database Expectations

From the code, the `accounts` table is expected to have at least:

- `account_id`
- `holder_name`
- `balance`
- `version`

The `version` field is required for the optimistic locking update in the withdrawal flow.

## Observations And Gaps

### Missing transaction route file

`src/app.js` imports:

- `./routes/transaction.routes.js`

That file does not currently exist in `src/routes/`, so the app will fail at runtime unless it is added.

### Controller logic inside service file

`src/services/transaction.service.js` contains both:

- service logic (`withdraw`)
- Express controller logic (`withdrawController`)

That works, but it mixes responsibilities. A cleaner split would be:

- service file for database/business logic
- controller file for request/response handling
- route file for endpoint wiring

### Duplicate project layout

The root folder and `src/` folder both contain overlapping app files. This can become confusing during development because it is not obvious which entrypoint should be used.

### Package configuration mismatch

The project uses ES module `import` syntax, but `package.json` currently does not show:

- `"type": "module"`

It also does not include a `start` or `dev` script. Unless that is handled elsewhere, runtime setup is still incomplete.

## Suggested Next Cleanup Steps

1. Choose one app layout: root or `src/`
2. Add `src/routes/transaction.routes.js`
3. Move `withdrawController` into a dedicated controller file
4. Add `package.json` scripts such as `start` and `dev`
5. Add `"type": "module"` if this project is intended to run with native ESM
6. Add a schema or SQL setup file for the `accounts` table

## Quick Endpoint Snapshot

### Implemented

- `GET /`
- `POST /api/accounts/`
- `GET /api/accounts/:id`

### Intended but not fully wired

- transaction withdrawal endpoint under `/api/transactions`

## Bottom Line

This is a straightforward Express + PostgreSQL banking API skeleton with a solid start on account management and a thoughtful withdrawal flow using optimistic locking. The biggest things holding it back are the missing transaction route, duplicate folder structure, and incomplete package/runtime setup.
