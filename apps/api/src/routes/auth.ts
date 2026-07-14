import { Router } from "express";
import bcrypt from "bcryptjs";
import { loginSchema, registerSchema } from "@modeljudge/shared";
import { User } from "../models";
import { validate } from "../middleware/validate";
import { AppError } from "../middleware/errorHandler";
import { requireAuth, signToken, AuthedRequest, asAuth } from "../middleware/auth";

export const authRouter = Router();

authRouter.post("/register", validate({ body: registerSchema }), async (req, res, next) => {
  try {
    const { email, password, name } = req.body;
    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) throw new AppError(409, "CONFLICT", "Email already registered");
    const passwordHash = await bcrypt.hash(password, 12);
    const user = await User.create({
      email: email.toLowerCase(),
      passwordHash,
      name,
    });
    const token = signToken({
      id: user._id.toString(),
      email: user.email,
      role: user.role,
    });
    res.status(201).json({
      accessToken: token,
      user: { id: user._id, email: user.email, name: user.name, role: user.role },
    });
  } catch (e) {
    next(e);
  }
});

authRouter.post("/login", validate({ body: loginSchema }), async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user || !user.isActive) {
      throw new AppError(401, "UNAUTHORIZED", "Invalid credentials");
    }
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) throw new AppError(401, "UNAUTHORIZED", "Invalid credentials");
    user.lastLoginAt = new Date();
    await user.save();
    const token = signToken({
      id: user._id.toString(),
      email: user.email,
      role: user.role,
    });
    res.json({
      accessToken: token,
      user: { id: user._id, email: user.email, name: user.name, role: user.role },
    });
  } catch (e) {
    next(e);
  }
});

authRouter.get("/me", requireAuth, async (req, res, next) => {
  try {
    const { user } = asAuth(req);
    const doc = await User.findById(user.id).select("-passwordHash");
    if (!doc) throw new AppError(404, "NOT_FOUND", "User not found");
    res.json({
      user: { id: doc._id, email: doc.email, name: doc.name, role: doc.role },
    });
  } catch (e) {
    next(e);
  }
});
