import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import insuranceRouter from "./insurance.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use(insuranceRouter);

export default router;
