import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import usersRouter from "./users";
import speditionenRouter from "./speditionen";
import shipmentsRouter from "./shipments";
import palletsRouter from "./pallets";
import reconciliationsRouter from "./reconciliations";
import dashboardRouter from "./dashboard";
import auditRouter from "./audit";
import austraegeRouter from "./austraege";
import settingsRouter from "./settings";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(usersRouter);
router.use(speditionenRouter);
router.use(shipmentsRouter);
router.use(palletsRouter);
router.use(reconciliationsRouter);
router.use(dashboardRouter);
router.use(auditRouter);
router.use(austraegeRouter);
router.use(settingsRouter);

export default router;
