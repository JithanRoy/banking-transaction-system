import { pool } from "../config/db.js";
import { ApiError, toHttpError } from "../utils/errors.js";

const parseAccountId = (accountId) => {
  if (typeof accountId !== "string" || accountId.trim() === "") {
    throw new ApiError(400, "accountId is required", "INVALID_ACCOUNT_ID");
  }

  return accountId.trim();
};

const parseHolderName = (holderName) => {
  if (typeof holderName !== "string" || holderName.trim() === "") {
    throw new ApiError(400, "holderName is required", "INVALID_HOLDER_NAME");
  }

  return holderName.trim();
};

const parseBalance = (balance) => {
  const parsed = Number(balance);

  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new ApiError(
      400,
      "balance must be a non-negative number",
      "INVALID_BALANCE",
    );
  }

  return parsed;
};

const parsePositiveInteger = (value, fieldName, defaultValue) => {
  if (value === undefined) {
    return defaultValue;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new ApiError(
      400,
      `${fieldName} must be a positive integer`,
      `INVALID_${fieldName.toUpperCase()}`,
    );
  }

  return parsed;
};

export const createAccount = async (req, res) => {
  try {
    const accountId = parseAccountId(req.body.accountId);
    const holderName = parseHolderName(req.body.holderName);
    const balance = parseBalance(req.body.balance);

    await pool.query(
      `INSERT INTO accounts (account_id, holder_name, balance, version)
       VALUES ($1, $2, $3, 1)`,
      [accountId, holderName, balance],
    );

    res.status(201).json({ message: "Account created" });
  } catch (err) {
    if (err.code === "23505") {
      return res.status(409).json({
        error: "Account already exists",
        code: "ACCOUNT_ALREADY_EXISTS",
      });
    }

    const httpError = toHttpError(err);
    res.status(httpError.statusCode).json(httpError.body);
  }
};

export const getAllAccounts = async (req, res) => {
  try {
    const page = parsePositiveInteger(req.query.page, "page", 1);
    const limit = parsePositiveInteger(req.query.limit, "limit", 10);
    const offset = (page - 1) * limit;

    const countResult = await pool.query("SELECT COUNT(*) AS total FROM accounts");
    const result = await pool.query(
      `SELECT account_id, holder_name, balance, version
       FROM accounts
       ORDER BY account_id ASC
       LIMIT $1 OFFSET $2`,
      [limit, offset],
    );

    const total = Number(countResult.rows[0].total);
    const totalPages = total === 0 ? 0 : Math.ceil(total / limit);

    res.status(200).json({
      data: result.rows,
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    });
  } catch (err) {
    const httpError = toHttpError(err);
    res.status(httpError.statusCode).json(httpError.body);
  }
};

export const getAccount = async (req, res) => {
  try {
    const accountId = parseAccountId(req.params.id);

    const result = await pool.query(
      `SELECT account_id, holder_name, balance, version
       FROM accounts
       WHERE account_id = $1`,
      [accountId],
    );

    if (result.rowCount === 0) {
      throw new ApiError(404, "Account not found", "ACCOUNT_NOT_FOUND");
    }

    res.status(200).json(result.rows[0]);
  } catch (err) {
    const httpError = toHttpError(err);
    res.status(httpError.statusCode).json(httpError.body);
  }
};
