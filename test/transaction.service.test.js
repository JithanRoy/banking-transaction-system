import test from "node:test";
import assert from "node:assert/strict";
import { deposit, transfer, withdraw } from "../src/services/transaction.service.js";
import { pool } from "../src/config/db.js";

const createMockClient = (handlers) => {
  const calls = [];

  return {
    calls,
    async query(sql, params) {
      calls.push({ sql, params });

      for (const handler of handlers) {
        if (handler.when(sql, params)) {
          return handler.result(sql, params, calls);
        }
      }

      throw new Error(`Unexpected query: ${sql}`);
    },
    releaseCalled: false,
    release() {
      this.releaseCalled = true;
    },
  };
};

test("withdraw debits the account, records the transaction, and commits", async () => {
  const originalConnect = pool.connect;
  const client = createMockClient([
    {
      when: (sql) => sql === "BEGIN" || sql === "COMMIT",
      result: async () => ({ rowCount: null, rows: [] }),
    },
    {
      when: (sql) => /SELECT account_id, balance, version FROM accounts/.test(sql),
      result: async () => ({
        rowCount: 1,
        rows: [{ account_id: "ACC1", balance: "100.00", version: 3 }],
      }),
    },
    {
      when: (sql) => /UPDATE accounts/.test(sql),
      result: async () => ({ rowCount: 1, rows: [{ account_id: "ACC1", balance: "75.00", version: 4 }] }),
    },
    {
      when: (sql) => /INSERT INTO transactions/.test(sql),
      result: async () => ({ rowCount: 1, rows: [] }),
    },
  ]);

  pool.connect = async () => client;

  try {
    const result = await withdraw("ACC1", 25);

    assert.deepEqual(result, {
      success: true,
      type: "withdraw",
      accountId: "ACC1",
      amount: 25,
      balance: 75,
    });
    assert.equal(client.releaseCalled, true);
    assert.deepEqual(client.calls[2].params, ["75.00", "ACC1", 3]);
    assert.equal(client.calls.at(-1).sql, "COMMIT");
  } finally {
    pool.connect = originalConnect;
  }
});

test("deposit returns ACCOUNT_NOT_FOUND when the target account is missing", async () => {
  const originalConnect = pool.connect;
  const originalQuery = pool.query;
  const failedAuditCalls = [];
  const client = createMockClient([
    {
      when: (sql) => sql === "BEGIN" || sql === "ROLLBACK",
      result: async () => ({ rowCount: null, rows: [] }),
    },
    {
      when: (sql) => /SELECT account_id, balance, version FROM accounts/.test(sql),
      result: async () => ({ rowCount: 0, rows: [] }),
    },
  ]);

  pool.connect = async () => client;
  pool.query = async (sql, params) => {
    failedAuditCalls.push({ sql, params });
    return { rowCount: 1, rows: [] };
  };

  try {
    await assert.rejects(
      () => deposit("MISSING", 10),
      (error) => {
        assert.equal(error.statusCode, 404);
        assert.equal(error.code, "ACCOUNT_NOT_FOUND");
        return true;
      },
    );

    assert.equal(client.calls.at(-1).sql, "ROLLBACK");
    assert.equal(client.releaseCalled, true);
    assert.equal(failedAuditCalls.length, 1);
    assert.equal(failedAuditCalls[0].params[4], "FAILED");
    assert.equal(failedAuditCalls[0].params[0], "deposit");
  } finally {
    pool.connect = originalConnect;
    pool.query = originalQuery;
  }
});

test("transfer updates both accounts and records the transfer atomically", async () => {
  const originalConnect = pool.connect;
  const client = createMockClient([
    {
      when: (sql) => sql === "BEGIN" || sql === "COMMIT",
      result: async () => ({ rowCount: null, rows: [] }),
    },
    {
      when: (sql) => /WHERE account_id = ANY\(\$1::varchar\[\]\)/.test(sql),
      result: async () => ({
        rowCount: 2,
        rows: [
          { account_id: "ACC1", balance: "100.00", version: 2 },
          { account_id: "ACC2", balance: "40.00", version: 7 },
        ],
      }),
    },
    {
      when: (sql) => /UPDATE accounts/.test(sql),
      result: async () => ({ rowCount: 1, rows: [{ account_id: "X", balance: "0.00", version: 1 }] }),
    },
    {
      when: (sql) => /INSERT INTO transactions/.test(sql),
      result: async () => ({ rowCount: 1, rows: [] }),
    },
  ]);

  pool.connect = async () => client;

  try {
    const result = await transfer("ACC1", "ACC2", 15);

    assert.deepEqual(result, {
      success: true,
      fromAccount: {
        accountId: "ACC1",
        balance: 85,
      },
      toAccount: {
        accountId: "ACC2",
        balance: 55,
      },
    });
    assert.equal(client.calls.at(-1).sql, "COMMIT");
    assert.equal(client.releaseCalled, true);
  } finally {
    pool.connect = originalConnect;
  }
});

test("withdraw rolls back on version conflicts", async () => {
  const originalConnect = pool.connect;
  const originalQuery = pool.query;
  const client = createMockClient([
    {
      when: (sql) => sql === "BEGIN" || sql === "ROLLBACK",
      result: async () => ({ rowCount: null, rows: [] }),
    },
    {
      when: (sql) => /SELECT account_id, balance, version FROM accounts/.test(sql),
      result: async () => ({
        rowCount: 1,
        rows: [{ account_id: "ACC1", balance: "100.00", version: 3 }],
      }),
    },
    {
      when: (sql) => /UPDATE accounts/.test(sql),
      result: async () => ({ rowCount: 0, rows: [] }),
    },
  ]);

  pool.connect = async () => client;
  pool.query = async () => ({ rowCount: 1, rows: [] });

  try {
    await assert.rejects(
      () => withdraw("ACC1", 25),
      (error) => {
        assert.equal(error.statusCode, 409);
        assert.equal(error.code, "VERSION_CONFLICT");
        return true;
      },
    );

    assert.equal(client.calls.at(-1).sql, "ROLLBACK");
    assert.equal(client.releaseCalled, true);
  } finally {
    pool.connect = originalConnect;
    pool.query = originalQuery;
  }
});

test("withdraw retries once when a deadlock error occurs", async () => {
  const originalConnect = pool.connect;
  const originalQuery = pool.query;
  let connectCount = 0;

  const deadlockError = Object.assign(new Error("deadlock detected"), {
    code: "40P01",
  });

  const firstClient = createMockClient([
    {
      when: (sql) => sql === "BEGIN" || sql === "ROLLBACK",
      result: async () => ({ rowCount: null, rows: [] }),
    },
    {
      when: (sql) => /SELECT account_id, balance, version FROM accounts/.test(sql),
      result: async () => ({
        rowCount: 1,
        rows: [{ account_id: "ACC1", balance: "100.00", version: 1 }],
      }),
    },
    {
      when: (sql) => /UPDATE accounts/.test(sql),
      result: async () => {
        throw deadlockError;
      },
    },
  ]);

  const secondClient = createMockClient([
    {
      when: (sql) => sql === "BEGIN" || sql === "COMMIT",
      result: async () => ({ rowCount: null, rows: [] }),
    },
    {
      when: (sql) => /SELECT account_id, balance, version FROM accounts/.test(sql),
      result: async () => ({
        rowCount: 1,
        rows: [{ account_id: "ACC1", balance: "100.00", version: 1 }],
      }),
    },
    {
      when: (sql) => /UPDATE accounts/.test(sql),
      result: async () => ({ rowCount: 1, rows: [{ account_id: "ACC1", balance: "75.00", version: 2 }] }),
    },
    {
      when: (sql) => /INSERT INTO transactions/.test(sql),
      result: async () => ({ rowCount: 1, rows: [] }),
    },
  ]);

  pool.connect = async () => {
    connectCount += 1;
    return connectCount === 1 ? firstClient : secondClient;
  };
  pool.query = async () => ({ rowCount: 1, rows: [] });

  try {
    const result = await withdraw("ACC1", 25);
    assert.equal(result.balance, 75);
    assert.equal(connectCount, 2);
    assert.equal(firstClient.calls.at(-1).sql, "ROLLBACK");
    assert.equal(secondClient.calls.at(-1).sql, "COMMIT");
  } finally {
    pool.connect = originalConnect;
    pool.query = originalQuery;
  }
});
