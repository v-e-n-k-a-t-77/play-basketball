import { Router } from "express";
import { validateBody } from "../../middleware/validate.js";
import * as controller from "./auth.controller.js";
//import { registerSchema } from "./auth.schemas.js";
import { registerSchema, verifyEmailSchema } from "./auth.schemas.js";

export const authRouter = Router();

authRouter.post("/register", validateBody(registerSchema), controller.register);
authRouter.post("/verify-email", validateBody(verifyEmailSchema), controller.verifyEmail);
