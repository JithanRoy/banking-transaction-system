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
        rows: [{ account_id: "ACC1", balance: 100, version: 3 }],
      }),
    },
    {
      when: (sql) => /UPDATE accounts/.test(sql),
      result: async () => ({ rowCount: 1, rows: [] }),
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
    assert.deepEqual(client.calls[2].params, [75, "ACC1", 3]);
    assert.equal(client.calls.at(-1).sql, "COMMIT");
  } finally {
    pool.connect = originalConnect;
  }
});

test("deposit returns ACCOUNT_NOT_FOUND when the target account is missing", async () => {
  const originalConnect = pool.connect;
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
  } finally {
    pool.connect = originalConnect;
  }
});

test("transfer updates both accounts and records the transfer atomically", async () => {
  const originalConnect = pool.connect;
  let selectCount = 0;
  const client = createMockClient([
    {
      when: (sql) => sql === "BEGIN" || sql === "COMMIT",
      result: async () => ({ rowCount: null, rows: [] }),
    },
    {
      when: (sql) => /SELECT account_id, balance, version FROM accounts/.test(sql),
      result: async () => {
        selectCount += 1;

        if (selectCount === 1) {
          return {
            rowCount: 1,
            rows: [{ account_id: "ACC1", balance: 100, version: 2 }],
          };
        }

        return {
          rowCount: 1,
          rows: [{ account_id: "ACC2", balance: 40, version: 7 }],
        };
      },
    },
    {
      when: (sql) => /UPDATE accounts/.test(sql),
      result: async () => ({ rowCount: 1, rows: [] }),
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
  const client = createMockClient([
    {
      when: (sql) => sql === "BEGIN" || sql === "ROLLBACK",
      result: async () => ({ rowCount: null, rows: [] }),
    },
    {
      when: (sql) => /SELECT account_id, balance, version FROM accounts/.test(sql),
      result: async () => ({
        rowCount: 1,
        rows: [{ account_id: "ACC1", balance: 100, version: 3 }],
      }),
    },
    {
      when: (sql) => /UPDATE accounts/.test(sql),
      result: async () => ({ rowCount: 0, rows: [] }),
    },
  ]);

  pool.connect = async () => client;

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
  }
});
