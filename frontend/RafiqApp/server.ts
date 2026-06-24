import express, { Application, Request, Response } from "express";
import cors from "cors";
import path from "path";
import { router as indoorRouter } from "./controllers/indoorController";
import { BACKEND_URL } from "./config";

const app: Application = express();
const PORT = Number(new URL(BACKEND_URL).port) || 8000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve uploaded images
app.use("/floor_images", express.static(path.join(__dirname, "public", "floor_images")));

// API routes
app.use("/indoor", indoorRouter);

// Health check
app.get("/", (_req: Request, res: Response) => res.send("RafiqApp backend is running"));

app.listen(PORT, () => console.log(`🚀 Server listening at ${BACKEND_URL}`));
