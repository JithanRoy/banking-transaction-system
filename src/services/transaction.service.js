import { pool } from "../config/db.js";
import { ApiError } from "../utils/errors.js";

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

    await client.query("COMMIT");

    return { success: true, balance: newBalance };
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

    await client.query("COMMIT");

    return { success: true, balance: newBalance };
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
