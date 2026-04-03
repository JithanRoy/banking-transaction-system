import { pool } from "../config/db.js";

export const withdraw = async (accountId, amount) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const result = await client.query(
      "SELECT * FROM accounts WHERE account_id = $1",
      [accountId],
    );

    const account = result.rows[0];

    if (!account) throw new Error("Account not found");

    if (account.balance < amount) {
      throw new Error("Insufficient balance");
    }

    const newBalance = account.balance - amount;

    const update = await client.query(
      `UPDATE accounts
       SET balance = $1, version = version + 1
       WHERE account_id = $2 AND version = $3`,
      [newBalance, accountId, account.version],
    );

    if (update.rowCount === 0) {
      throw new Error("Conflict detected. Try again");
    }

    await client.query("COMMIT");

    return { success: true, balance: newBalance };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
};

export const withdrawController = async (req, res) => {
  const { accountId, amount } = req.body;

  try {
    const result = await withdraw(accountId, amount);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};
