import { pool } from "../config/db.js";

export const createAccount = async (req, res) => {
  const { accountId, holderName, balance } = req.body;

  try {
    await pool.query(
      `INSERT INTO accounts (account_id, holder_name, balance)
       VALUES ($1, $2, $3)`,
      [accountId, holderName, balance],
    );

    res.json({ message: "Account created" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const getAccount = async (req, res) => {
  const { id } = req.params;

  const result = await pool.query(
    "SELECT * FROM accounts WHERE account_id = $1",
    [id],
  );

  res.json(result.rows[0]);
};
