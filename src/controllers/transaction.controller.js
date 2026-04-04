import {
  deposit,
  transfer,
  withdraw,
} from "../services/transaction.service.js";
import { ApiError, toHttpError } from "../utils/errors.js";

const parseAmount = (amount) => {
  const parsed = Number(amount);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new ApiError(
      400,
      "Amount must be a positive number",
      "INVALID_AMOUNT",
    );
  }

  return parsed;
};

const parseAccountId = (accountId) => {
  if (typeof accountId !== "string" || accountId.trim() === "") {
    throw new ApiError(400, "accountId is required", "INVALID_ACCOUNT_ID");
  }

  return accountId.trim();
};

export const withdrawController = async (req, res) => {
  try {
    const accountId = parseAccountId(req.body.accountId);
    const amount = parseAmount(req.body.amount);

    const result = await withdraw(accountId, amount);
    res.status(200).json(result);
  } catch (error) {
    const httpError = toHttpError(error);
    res.status(httpError.statusCode).json(httpError.body);
  }
};

export const depositController = async (req, res) => {
  try {
    const accountId = parseAccountId(req.body.accountId);
    const amount = parseAmount(req.body.amount);

    const result = await deposit(accountId, amount);
    res.status(200).json(result);
  } catch (error) {
    const httpError = toHttpError(error);
    res.status(httpError.statusCode).json(httpError.body);
  }
};

export const transferController = async (req, res) => {
  try {
    const fromAccountId = parseAccountId(req.body.fromAccountId);
    const toAccountId = parseAccountId(req.body.toAccountId);
    const amount = parseAmount(req.body.amount);

    if (fromAccountId === toAccountId) {
      throw new ApiError(
        400,
        "fromAccountId and toAccountId must be different",
        "INVALID_TRANSFER_ACCOUNTS",
      );
    }

    const result = await transfer(fromAccountId, toAccountId, amount);
    res.status(200).json(result);
  } catch (error) {
    const httpError = toHttpError(error);
    res.status(httpError.statusCode).json(httpError.body);
  }
};
