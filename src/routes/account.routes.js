import express from "express";
import {
  createAccount,
  getAccount,
} from "../controllers/account.controller.js";

const router = express.Router();

router.post("/", createAccount);
router.get("/:id", getAccount);

export default router;
