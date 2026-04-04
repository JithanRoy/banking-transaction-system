import express from "express";
import {
  depositController,
  transferController,
  withdrawController,
} from "../controllers/transaction.controller.js";

const router = express.Router();

router.post("/deposit", depositController);
router.post("/withdraw", withdrawController);
router.post("/transfer", transferController);

export default router;
