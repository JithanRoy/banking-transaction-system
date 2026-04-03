import express from "express";
import { withdrawController } from "../services/transaction.service.js";

const router = express.Router();

router.post("/withdraw", withdrawController);

export default router;
