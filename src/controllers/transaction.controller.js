import { getIO } from "../realtime/socket.js";
import {
  deposit,
  transfer,
  withdraw,
} from "../services/transaction.service.js";
import { ApiError, toHttpError } from "../utils/errors.js";

const parseAmount = (amount) => {
  if (amount === undefined || amount === null || amount === "") {
    throw new ApiError(
      400,
      "Amount must be a positive number",
      "INVALID_AMOUNT",
    );
  }

  return amount;
};

const parseAccountId = (accountId) => {
  if (typeof accountId !== "string" || accountId.trim() === "") {
    throw new ApiError(400, "accountId is required", "INVALID_ACCOUNT_ID");
  }

  return accountId.trim();
};

const emitRealtimeEvent = (event, payload) => {
  const io = getIO();

  if (io) {
    io.emit(event, payload);
  }
};

export const withdrawController = async (req, res) => {
  try {
    const accountId = parseAccountId(req.body.accountId);
    const amount = parseAmount(req.body.amount);

    const result = await withdraw(accountId, amount);
    emitRealtimeEvent("transaction:created", result);
    emitRealtimeEvent("balance:updated", {
      accountId: result.accountId,
      balance: result.balance,
    });
    res.status(200).json(result);
  } catch (error) {
    const httpError = toHttpError(error);
    emitRealtimeEvent("transaction:failed", {
      type: "withdraw",
      accountId: req.body.accountId ?? null,
      amount: req.body.amount ?? null,
      ...httpError.body,
    });
    res.status(httpError.statusCode).json(httpError.body);
  }
};

export const depositController = async (req, res) => {
  try {
    const accountId = parseAccountId(req.body.accountId);
    const amount = parseAmount(req.body.amount);

    const result = await deposit(accountId, amount);
    emitRealtimeEvent("transaction:created", result);
    emitRealtimeEvent("balance:updated", {
      accountId: result.accountId,
      balance: result.balance,
    });
    res.status(200).json(result);
  } catch (error) {
    const httpError = toHttpError(error);
    emitRealtimeEvent("transaction:failed", {
      type: "deposit",
      accountId: req.body.accountId ?? null,
      amount: req.body.amount ?? null,
      ...httpError.body,
    });
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
    emitRealtimeEvent("transaction:created", result);
    emitRealtimeEvent("balance:updated", {
      accountId: result.fromAccount.accountId,
      balance: result.fromAccount.balance,
    });
    emitRealtimeEvent("balance:updated", {
      accountId: result.toAccount.accountId,
      balance: result.toAccount.balance,
    });
    res.status(200).json(result);
  } catch (error) {
    const httpError = toHttpError(error);
    emitRealtimeEvent("transaction:failed", {
      type: "transfer",
      fromAccountId: req.body.fromAccountId ?? null,
      toAccountId: req.body.toAccountId ?? null,
      amount: req.body.amount ?? null,
      ...httpError.body,
    });
    res.status(httpError.statusCode).json(httpError.body);
  }
};
