import express from "express";
import {
  createAccount,
  getAllAccounts,
  getAccount,
} from "../controllers/account.controller.js";

const router = express.Router();

router.post("/create", createAccount);
router.get("/", getAllAccounts);
router.get("/:id", getAccount);

export default router;
