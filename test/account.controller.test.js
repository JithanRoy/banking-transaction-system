import test from "node:test";
import assert from "node:assert/strict";
import {
  createAccount,
  deleteAccount,
  getAccount,
  getAllAccounts,
  updateAccount,
} from "../src/controllers/account.controller.js";
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
    assert.deepEqual(res.body, { message: "Account created", accountId: "ACC1001" });
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

test("getAllAccounts returns all account details", async () => {
  const originalQuery = pool.query;
  const calls = [];

  pool.query = async (sql, params) => {
    calls.push({ sql, params });

    if (/COUNT\(\*\) AS total FROM accounts/i.test(sql)) {
      return {
        rowCount: 1,
        rows: [{ total: "2" }],
      };
    }

    return {
      rowCount: 2,
      rows: [
        {
          id: 1,
          account_id: "ACC1001",
          holder_name: "Jane Doe",
          balance: 250,
          version: 1,
        },
        {
          id: 2,
          account_id: "ACC1002",
          holder_name: "John Doe",
          balance: 500,
          version: 3,
        },
      ],
    };
  };

  try {
    const req = {
      query: {
        page: "1",
        limit: "2",
      },
    };
    const res = createResponse();

    await getAllAccounts(req, res);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, {
      data: [
        {
          id: 1,
          account_id: "ACC1001",
          holder_name: "Jane Doe",
          balance: 250,
          version: 1,
        },
        {
          id: 2,
          account_id: "ACC1002",
          holder_name: "John Doe",
          balance: 500,
          version: 3,
        },
      ],
      pagination: {
        page: 1,
        limit: 2,
        total: 2,
        totalPages: 1,
      },
    });
    assert.equal(calls.length, 2);
    assert.match(calls[1].sql, /LIMIT \$1 OFFSET \$2/i);
    assert.deepEqual(calls[1].params, [2, 0]);
  } finally {
    pool.query = originalQuery;
  }
});

test("getAllAccounts rejects invalid pagination values", async () => {
  const originalQuery = pool.query;
  let called = false;

  pool.query = async () => {
    called = true;
    return { rowCount: 0, rows: [] };
  };

  try {
    const req = {
      query: {
        page: "0",
      },
    };
    const res = createResponse();

    await getAllAccounts(req, res);

    assert.equal(res.statusCode, 400);
    assert.deepEqual(res.body, {
      error: "page must be a positive integer",
      code: "INVALID_PAGE",
    });
    assert.equal(called, false);
  } finally {
    pool.query = originalQuery;
  }
});

test("updateAccount updates holderName and balance when valid fields are provided", async () => {
  const originalQuery = pool.query;
  const calls = [];

  pool.query = async (sql, params) => {
    calls.push({ sql, params });
    return {
      rowCount: 1,
      rows: [
        {
          id: 10,
          account_id: "ACC1001",
          holder_name: "Updated Name",
          balance: 300,
          version: 2,
        },
      ],
    };
  };

  try {
    const req = {
      params: { id: "ACC1001" },
      body: {
        holderName: "Updated Name",
        balance: 300,
      },
    };
    const res = createResponse();

    await updateAccount(req, res);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, {
      id: 10,
      account_id: "ACC1001",
      holder_name: "Updated Name",
      balance: 300,
      version: 2,
    });
    assert.equal(calls.length, 1);
    assert.match(calls[0].sql, /UPDATE accounts/i);
    assert.deepEqual(calls[0].params, ["Updated Name", 300, "ACC1001"]);
  } finally {
    pool.query = originalQuery;
  }
});

test("updateAccount rejects requests without any updatable fields", async () => {
  const originalQuery = pool.query;
  let called = false;

  pool.query = async () => {
    called = true;
    return { rowCount: 1, rows: [] };
  };

  try {
    const req = {
      params: { id: "ACC1001" },
      body: {},
    };
    const res = createResponse();

    await updateAccount(req, res);

    assert.equal(res.statusCode, 400);
    assert.deepEqual(res.body, {
      error: "At least one updatable field is required (holderName, balance)",
      code: "NO_UPDATE_FIELDS",
    });
    assert.equal(called, false);
  } finally {
    pool.query = originalQuery;
  }
});

test("deleteAccount returns 200 when account exists", async () => {
  const originalQuery = pool.query;

  pool.query = async () => ({
    rowCount: 1,
    rows: [{ account_id: "ACC1001" }],
  });

  try {
    const req = { params: { id: "ACC1001" } };
    const res = createResponse();

    await deleteAccount(req, res);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, {
      message: "Account deleted",
      accountId: "ACC1001",
    });
  } finally {
    pool.query = originalQuery;
  }
});

test("deleteAccount returns 404 when account does not exist", async () => {
  const originalQuery = pool.query;

  pool.query = async () => ({ rowCount: 0, rows: [] });

  try {
    const req = { params: { id: "MISSING" } };
    const res = createResponse();

    await deleteAccount(req, res);

    assert.equal(res.statusCode, 404);
    assert.deepEqual(res.body, {
      error: "Account not found",
      code: "ACCOUNT_NOT_FOUND",
    });
  } finally {
    pool.query = originalQuery;
  }
});
