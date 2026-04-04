# banking-transaction-system

Backend service for concurrent banking transactions with optimistic concurrency control and real-time event notifications.

## Quick Setup

1. Install dependencies:

```bash
npm install
```

2. Create `.env` with PostgreSQL connection:

```env
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DB_NAME
PORT=5000
```

3. Create required tables:

```bash
psql "$DATABASE_URL" -f db/schema.sql
```

4. Start the API server:

```bash
npm run dev
```

## API Endpoints

- `POST /api/accounts`
- `GET /api/accounts/:id`
- `POST /api/transactions/deposit`
- `POST /api/transactions/withdraw`
- `POST /api/transactions/transfer`

## Real-Time Events (Socket.IO)

Clients can subscribe to the server and receive:

- `transaction:created`
- `balance:updated`
- `transaction:failed`

Socket server runs on the same host/port as the API.
