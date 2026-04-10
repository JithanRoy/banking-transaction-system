import { pool } from "../config/db.js";
import { centsToNumber, centsToNumericString, toCents } from "../utils/money.js";
import { ApiError } from "../utils/errors.js";

const MAX_RETRIES = 3;
const RETRYABLE_DB_CODES = new Set(["40P01", "40001"]);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const isRetryableDbError = (error) => RETRYABLE_DB_CODES.has(error?.code);

const toApiAmount = (value) => centsToNumber(value);

const buildInvalidAmountError = (error) =>
  new ApiError(400, error.message, "INVALID_AMOUNT");

const recordTransaction = async (
  client,
  {
    type,
    sourceAccountId,
    destinationAccountId,
    amount,
    status = "SUCCESS",
    details,
  },
) => {
  try {
    await client.query(
      `INSERT INTO transactions (
         transaction_type,
         source_account_id,
         destination_account_id,
         amount,
         status,
         details
       )
       VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
      [
        type,
        sourceAccountId ?? null,
        destinationAccountId ?? null,
        amount,
        status,
        JSON.stringify(details ?? {}),
      ],
    );
  } catch (err) {
    if (err.code === "42P01") {
      throw new ApiError(
        500,
        "transactions table is missing. Apply the SQL schema before processing transactions",
        "MISSING_TRANSACTIONS_TABLE",
      );
    }

    throw err;
  }
};

const recordFailedTransactionSafely = async ({
  type,
  sourceAccountId,
  destinationAccountId,
  amount,
  error,
}) => {
  try {
    const details = {
      error: error?.message ?? "Unexpected transaction failure",
      code: error?.code ?? "UNEXPECTED_ERROR",
    };

    await pool.query(
      `INSERT INTO transactions (
         transaction_type,
         source_account_id,
         destination_account_id,
         amount,
         status,
         details
       )
       VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
      [
        type,
        sourceAccountId ?? null,
        destinationAccountId ?? null,
        centsToNumericString(amount),
        "FAILED",
        JSON.stringify(details),
      ],
    );
  } catch (auditError) {
    console.error("Failed to persist transaction failure audit", auditError);
  }
};

const getAccountById = async (client, accountId) => {
  const result = await client.query(
    "SELECT account_id, balance, version FROM accounts WHERE account_id = $1",
    [accountId],
  );

  return result.rows[0];
};

const updateAccountBalance = async (
  client,
  accountId,
  expectedVersion,
  newBalance,
) => {
  const update = await client.query(
    `UPDATE accounts
     SET balance = $1, version = version + 1, updated_at = NOW()
     WHERE account_id = $2 AND version = $3
     RETURNING account_id, balance, version`,
    [newBalance, accountId, expectedVersion],
  );

  if (update.rowCount === 0) {
    throw new ApiError(409, "Conflict detected. Try again", "VERSION_CONFLICT");
  }

  return update.rows[0];
};

const withTransaction = async (handler) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const result = await handler(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

const runWithRetries = async (handler) => {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      return await handler();
    } catch (error) {
      if (!isRetryableDbError(error) || attempt === MAX_RETRIES) {
        throw error;
      }

      await sleep(25 * attempt);
    }
  }

  throw new ApiError(500, "Transaction retry loop exhausted", "RETRY_EXHAUSTED");
};

const parseCents = (value, options) => {
  try {
    return toCents(value, options);
  } catch (error) {
    throw buildInvalidAmountError(error);
  }
};

const withdrawOnce = async (accountId, amountCents) =>
  withTransaction(async (client) => {
    const account = await getAccountById(client, accountId);

    if (!account) {
      throw new ApiError(404, "Account not found", "ACCOUNT_NOT_FOUND");
    }

    const balanceCents = parseCents(account.balance, {
      allowZero: true,
      fieldName: "balance",
    });

    if (balanceCents < amountCents) {
      throw new ApiError(422, "Insufficient balance", "INSUFFICIENT_BALANCE");
    }

    const newBalanceCents = balanceCents - amountCents;

    await updateAccountBalance(
      client,
      accountId,
      account.version,
      centsToNumericString(newBalanceCents),
    );
    await recordTransaction(client, {
      type: "withdraw",
      sourceAccountId: accountId,
      amount: centsToNumericString(amountCents),
      details: {
        previousBalance: toApiAmount(balanceCents),
        newBalance: toApiAmount(newBalanceCents),
      },
    });

    return {
      success: true,
      type: "withdraw",
      accountId,
      amount: toApiAmount(amountCents),
      balance: toApiAmount(newBalanceCents),
    };
  });

const depositOnce = async (accountId, amountCents) =>
  withTransaction(async (client) => {
    const account = await getAccountById(client, accountId);

    if (!account) {
      throw new ApiError(404, "Account not found", "ACCOUNT_NOT_FOUND");
    }

    const balanceCents = parseCents(account.balance, {
      allowZero: true,
      fieldName: "balance",
    });
    const newBalanceCents = balanceCents + amountCents;

    await updateAccountBalance(
      client,
      accountId,
      account.version,
      centsToNumericString(newBalanceCents),
    );
    await recordTransaction(client, {
      type: "deposit",
      sourceAccountId: accountId,
      amount: centsToNumericString(amountCents),
      details: {
        previousBalance: toApiAmount(balanceCents),
        newBalance: toApiAmount(newBalanceCents),
      },
    });

    return {
      success: true,
      type: "deposit",
      accountId,
      amount: toApiAmount(amountCents),
      balance: toApiAmount(newBalanceCents),
    };
  });

const transferOnce = async (fromAccountId, toAccountId, amountCents) =>
  withTransaction(async (client) => {
    const lockRowsResult = await client.query(
      `SELECT account_id, balance, version
       FROM accounts
       WHERE account_id = ANY($1::varchar[])
       ORDER BY account_id ASC
       FOR UPDATE`,
      [[fromAccountId, toAccountId]],
    );

    if (lockRowsResult.rowCount !== 2) {
      const existingIds = new Set(lockRowsResult.rows.map((row) => row.account_id));

      if (!existingIds.has(fromAccountId)) {
        throw new ApiError(
          404,
          "Source account not found",
          "SOURCE_ACCOUNT_NOT_FOUND",
        );
      }

      throw new ApiError(
        404,
        "Destination account not found",
        "DESTINATION_ACCOUNT_NOT_FOUND",
      );
    }

    const accountMap = new Map(
      lockRowsResult.rows.map((row) => [row.account_id, row]),
    );
    const fromAccount = accountMap.get(fromAccountId);
    const toAccount = accountMap.get(toAccountId);

    const fromBalanceCents = parseCents(fromAccount.balance, {
      allowZero: true,
      fieldName: "balance",
    });
    const toBalanceCents = parseCents(toAccount.balance, {
      allowZero: true,
      fieldName: "balance",
    });

    if (fromBalanceCents < amountCents) {
      throw new ApiError(422, "Insufficient balance", "INSUFFICIENT_BALANCE");
    }

    const fromNewBalanceCents = fromBalanceCents - amountCents;
    const toNewBalanceCents = toBalanceCents + amountCents;

    await updateAccountBalance(
      client,
      fromAccountId,
      fromAccount.version,
      centsToNumericString(fromNewBalanceCents),
    );
    await updateAccountBalance(
      client,
      toAccountId,
      toAccount.version,
      centsToNumericString(toNewBalanceCents),
    );
    await recordTransaction(client, {
      type: "transfer",
      sourceAccountId: fromAccountId,
      destinationAccountId: toAccountId,
      amount: centsToNumericString(amountCents),
      details: {
        fromPreviousBalance: toApiAmount(fromBalanceCents),
        fromNewBalance: toApiAmount(fromNewBalanceCents),
        toPreviousBalance: toApiAmount(toBalanceCents),
        toNewBalance: toApiAmount(toNewBalanceCents),
      },
    });

    return {
      success: true,
      fromAccount: {
        accountId: fromAccountId,
        balance: toApiAmount(fromNewBalanceCents),
      },
      toAccount: {
        accountId: toAccountId,
        balance: toApiAmount(toNewBalanceCents),
      },
    };
  });

export const withdraw = async (accountId, amount) => {
  const amountCents = parseCents(amount, { fieldName: "amount" });

  try {
    return await runWithRetries(() => withdrawOnce(accountId, amountCents));
  } catch (error) {
    await recordFailedTransactionSafely({
      type: "withdraw",
      sourceAccountId: accountId,
      amount: amountCents,
      error,
    });
    throw error;
  }
};

export const deposit = async (accountId, amount) => {
  const amountCents = parseCents(amount, { fieldName: "amount" });

  try {
    return await runWithRetries(() => depositOnce(accountId, amountCents));
  } catch (error) {
    await recordFailedTransactionSafely({
      type: "deposit",
      sourceAccountId: accountId,
      amount: amountCents,
      error,
    });
    throw error;
  }
};

export const transfer = async (fromAccountId, toAccountId, amount) => {
  const amountCents = parseCents(amount, { fieldName: "amount" });

  try {
    return await runWithRetries(() =>
      transferOnce(fromAccountId, toAccountId, amountCents),
    );
  } catch (error) {
    await recordFailedTransactionSafely({
      type: "transfer",
      sourceAccountId: fromAccountId,
      destinationAccountId: toAccountId,
      amount: amountCents,
      error,
    });
    throw error;
  }
};
