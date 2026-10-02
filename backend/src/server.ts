import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import authRouter from "./routes/auth.js";
import pagesRouter from "./routes/pages.js";
import postsRouter from "./routes/posts.js";

dotenv.config();

const app = express();
const allowedOrigins = [
  process.env.FRONTEND_URL,
  "http://localhost:5173",
  "http://localhost:5174",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:5174"
].filter(Boolean) as string[];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error("Not allowed by CORS"));
  }
}));
app.use(express.json({ limit: "20mb" }));

app.get("/api/health", (_req, res) => res.json({ ok: true, service: "SocialPilot Hub" }));
app.use("/api/auth", authRouter);
app.use("/api/pages", pagesRouter);
app.use("/api/posts", postsRouter);

const port = Number(process.env.PORT || 4000);
app.listen(port, () => console.log(`SocialPilot Hub API running on http://localhost:${port}`));
