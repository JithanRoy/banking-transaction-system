import test from "node:test";
import assert from "node:assert/strict";
import { createAccount, getAccount } from "../src/controllers/account.controller.js";
import { pool } from "../src/config/db.js";

const createResponse = () => {
  const response = {
    statusCode: 200,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };

  return response;
};

test("createAccount stores a valid account and returns 201", async () => {
  const originalQuery = pool.query;
  const calls = [];

  pool.query = async (sql, params) => {
    calls.push({ sql, params });
    return { rowCount: 1 };
  };

  try {
    const req = {
      body: {
        accountId: "ACC1001",
        holderName: "Jane Doe",
        balance: 250,
      },
    };
    const res = createResponse();

    await createAccount(req, res);

    assert.equal(res.statusCode, 201);
    assert.deepEqual(res.body, { message: "Account created" });
    assert.equal(calls.length, 1);
    assert.match(calls[0].sql, /INSERT INTO accounts/i);
    assert.deepEqual(calls[0].params, ["ACC1001", "Jane Doe", 250]);
  } finally {
    pool.query = originalQuery;
  }
});

test("createAccount returns 409 when the account already exists", async () => {
  const originalQuery = pool.query;

  pool.query = async () => {
    const error = new Error("duplicate key");
    error.code = "23505";
    throw error;
  };

  try {
    const req = {
      body: {
        accountId: "ACC1001",
        holderName: "Jane Doe",
        balance: 250,
      },
    };
    const res = createResponse();

    await createAccount(req, res);

    assert.equal(res.statusCode, 409);
    assert.deepEqual(res.body, {
      error: "Account already exists",
      code: "ACCOUNT_ALREADY_EXISTS",
    });
  } finally {
    pool.query = originalQuery;
  }
});

test("createAccount rejects invalid balances before hitting the database", async () => {
  const originalQuery = pool.query;
  let called = false;

  pool.query = async () => {
    called = true;
    return { rowCount: 1 };
  };

  try {
    const req = {
      body: {
        accountId: "ACC1001",
        holderName: "Jane Doe",
        balance: -5,
      },
    };
    const res = createResponse();

    await createAccount(req, res);

    assert.equal(res.statusCode, 400);
    assert.deepEqual(res.body, {
      error: "balance must be a non-negative number",
      code: "INVALID_BALANCE",
    });
    assert.equal(called, false);
  } finally {
    pool.query = originalQuery;
  }
});

test("getAccount returns 404 when the account does not exist", async () => {
  const originalQuery = pool.query;

  pool.query = async () => ({ rowCount: 0, rows: [] });

  try {
    const req = {
      params: {
        id: "MISSING",
      },
    };
    const res = createResponse();

    await getAccount(req, res);

    assert.equal(res.statusCode, 404);
    assert.deepEqual(res.body, {
      error: "Account not found",
      code: "ACCOUNT_NOT_FOUND",
    });
  } finally {
    pool.query = originalQuery;
  }
});
