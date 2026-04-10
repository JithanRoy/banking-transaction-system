import express from "express";
import {
  createAccount,
  deleteAccount,
  getAllAccounts,
  getAccount,
  updateAccount,
} from "../controllers/account.controller.js";

const router = express.Router();

router.post("/create", createAccount);
router.get("/", getAllAccounts);
router.get("/:id", getAccount);
router.put("/update/:id", updateAccount);
router.delete("/:id", deleteAccount);

export default router;
