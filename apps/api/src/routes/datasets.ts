import { Router } from "express";
import multer from "multer";
import crypto from "crypto";
import { requireAuth, AuthedRequest } from "../middleware/auth";
import { AppError } from "../middleware/errorHandler";
import { Dataset, Job } from "../models";
import { config } from "../config";
import { putObject } from "../lib/minio";
import { enqueueProfile } from "../queues/producer";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxUploadBytes },
  fileFilter: (_req, file, cb) => {
    const ok =
      file.mimetype.includes("csv") ||
      file.originalname.endsWith(".csv") ||
      file.originalname.endsWith(".tsv") ||
      file.mimetype === "text/plain" ||
      file.mimetype === "application/vnd.ms-excel";
    if (!ok) cb(new AppError(400, "VALIDATION_ERROR", "Only CSV/TSV uploads are allowed"));
    else cb(null, true);
  },
});

export const datasetsRouter = Router();
datasetsRouter.use(requireAuth);

datasetsRouter.get("/", async (req, res, next) => {
  try {
    const { user } = req as AuthedRequest;
    const items = await Dataset.find({ userId: user.id, deletedAt: null })
      .sort({ createdAt: -1 })
      .limit(100);
    res.json({ items });
  } catch (e) {
    next(e);
  }
});

datasetsRouter.get("/:id", async (req, res, next) => {
  try {
    const { user } = req as AuthedRequest;
    const ds = await Dataset.findOne({ _id: req.params.id, userId: user.id, deletedAt: null });
    if (!ds) throw new AppError(404, "NOT_FOUND", "Dataset not found");
    res.json({ dataset: ds });
  } catch (e) {
    next(e);
  }
});

datasetsRouter.post("/", upload.single("file"), async (req, res, next) => {
  try {
    const { user } = req as AuthedRequest;
    const file = req.file;
    if (!file) throw new AppError(400, "VALIDATION_ERROR", "file is required");

    const name = (req.body.name as string) || file.originalname;
    const hash = crypto.createHash("sha256").update(file.buffer).digest("hex");
    const ds = await Dataset.create({
      userId: user.id,
      name,
      originalFilename: file.originalname,
      contentType: file.mimetype,
      format: file.originalname.endsWith(".tsv") ? "tsv" : "csv",
      storage: { bucket: config.minio.bucket, rawKey: "pending" },
      hashes: { rawSha256: hash },
      sizeBytes: file.size,
      profile: { status: "PENDING", columns: [], warnings: [] },
    });

    const rawKey = `datasets/${user.id}/${ds._id}/raw.csv`;
    await putObject(rawKey, file.buffer, file.size, {
      "Content-Type": file.mimetype || "text/csv",
    });
    ds.storage.rawKey = rawKey;
    await ds.save();

    const jobDoc = await Job.create({
      userId: user.id,
      datasetId: ds._id,
      type: "PROFILE",
      status: "QUEUED",
      payload: {},
      queuedAt: new Date(),
    });

    const bullId = await enqueueProfile({
      requestId: (req as AuthedRequest).requestId || "",
      userId: user.id,
      datasetId: ds._id.toString(),
      jobDocId: jobDoc._id.toString(),
    });
    jobDoc.bullJobId = bullId;
    await jobDoc.save();

    res.status(201).json({ dataset: ds, jobId: jobDoc._id });
  } catch (e) {
    next(e);
  }
});

datasetsRouter.delete("/:id", async (req, res, next) => {
  try {
    const { user } = req as AuthedRequest;
    const ds = await Dataset.findOne({ _id: req.params.id, userId: user.id, deletedAt: null });
    if (!ds) throw new AppError(404, "NOT_FOUND", "Dataset not found");
    ds.deletedAt = new Date();
    await ds.save();
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});
