import { pool } from "../config/db.js";
import { ApiError } from "../utils/errors.js";

const recordTransaction = async (
  client,
  { type, sourceAccountId, destinationAccountId, amount, details },
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
        "SUCCESS",
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
     SET balance = $1, version = version + 1
     WHERE account_id = $2 AND version = $3`,
    [newBalance, accountId, expectedVersion],
  );

  if (update.rowCount === 0) {
    throw new ApiError(409, "Conflict detected. Try again", "VERSION_CONFLICT");
  }
};

export const withdraw = async (accountId, amount) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const account = await getAccountById(client, accountId);

    if (!account) {
      throw new ApiError(404, "Account not found", "ACCOUNT_NOT_FOUND");
    }

    if (account.balance < amount) {
      throw new ApiError(422, "Insufficient balance", "INSUFFICIENT_BALANCE");
    }

    const newBalance = account.balance - amount;

    await updateAccountBalance(client, accountId, account.version, newBalance);
    await recordTransaction(client, {
      type: "withdraw",
      sourceAccountId: accountId,
      amount,
      details: {
        previousBalance: Number(account.balance),
        newBalance,
      },
    });

    await client.query("COMMIT");

    return {
      success: true,
      type: "withdraw",
      accountId,
      amount,
      balance: newBalance,
    };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
};

export const deposit = async (accountId, amount) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const account = await getAccountById(client, accountId);

    if (!account) {
      throw new ApiError(404, "Account not found", "ACCOUNT_NOT_FOUND");
    }

    const newBalance = Number(account.balance) + Number(amount);

    await updateAccountBalance(client, accountId, account.version, newBalance);
    await recordTransaction(client, {
      type: "deposit",
      sourceAccountId: accountId,
      amount,
      details: {
        previousBalance: Number(account.balance),
        newBalance,
      },
    });

    await client.query("COMMIT");

    return {
      success: true,
      type: "deposit",
      accountId,
      amount,
      balance: newBalance,
    };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
};

export const transfer = async (fromAccountId, toAccountId, amount) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const fromAccount = await getAccountById(client, fromAccountId);
    if (!fromAccount) {
      throw new ApiError(
        404,
        "Source account not found",
        "SOURCE_ACCOUNT_NOT_FOUND",
      );
    }

    const toAccount = await getAccountById(client, toAccountId);
    if (!toAccount) {
      throw new ApiError(
        404,
        "Destination account not found",
        "DESTINATION_ACCOUNT_NOT_FOUND",
      );
    }

    if (fromAccount.balance < amount) {
      throw new ApiError(422, "Insufficient balance", "INSUFFICIENT_BALANCE");
    }

    const fromNewBalance = Number(fromAccount.balance) - Number(amount);
    const toNewBalance = Number(toAccount.balance) + Number(amount);

    await updateAccountBalance(
      client,
      fromAccountId,
      fromAccount.version,
      fromNewBalance,
    );
    await updateAccountBalance(
      client,
      toAccountId,
      toAccount.version,
      toNewBalance,
    );
    await recordTransaction(client, {
      type: "transfer",
      sourceAccountId: fromAccountId,
      destinationAccountId: toAccountId,
      amount,
      details: {
        fromPreviousBalance: Number(fromAccount.balance),
        fromNewBalance,
        toPreviousBalance: Number(toAccount.balance),
        toNewBalance,
      },
    });

    await client.query("COMMIT");

    return {
      success: true,
      fromAccount: {
        accountId: fromAccountId,
        balance: fromNewBalance,
      },
      toAccount: {
        accountId: toAccountId,
        balance: toNewBalance,
      },
    };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
};
