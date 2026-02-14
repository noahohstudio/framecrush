import express from "express";
import multer from "multer";
import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 8080;

// --------------------
// CORS + preflight
// --------------------
const allowedOrigins = new Set([
  "https://framecrush.net",
  "https://www.framecrush.net",
  "http://localhost:3000",
]);

app.use((req, res, next) => {
  const origin = req.headers.origin;

  if (origin && allowedOrigins.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Credentials", "true");

  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

// --------------------
// Middleware
// --------------------
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --------------------
// Storage
// --------------------
const uploadDir = path.join(__dirname, "uploads");
const outputDir = path.join(__dirname, "outputs");
fs.mkdirSync(uploadDir, { recursive: true });
fs.mkdirSync(outputDir, { recursive: true });

const upload = multer({
  dest: uploadDir,
  limits: { fileSize: 150 * 1024 * 1024 }, // 150MB
});

// --------------------
// Health
// --------------------
app.get("/", (req, res) => res.send("Framecrush API is running"));
app.get("/health", (req, res) => res.status(200).json({ status: "ok" }));

function safeUnlink(p) {
  try {
    if (p && fs.existsSync(p)) fs.unlinkSync(p);
  } catch {}
}

// --------------------
// Core FFmpeg runner (FORCES re-encode + obvious effect)
// --------------------
function runFfmpeg(inputPath, outputPath) {
  // OBVIOUS effect so you can’t miss it:
  // - fps=8 (choppy)
  // - scale=320 wide (tiny)
  // - heavy contrast + lowered saturation
  // - add noise grain
  // - force x264 encode + aac audio so it definitely changes
  const vf =
    "fps=8,scale=320:-2," +
    "eq=contrast=1.6:brightness=-0.06:saturation=0.55," +
    "noise=alls=20:allf=t";

  const args = [
    "-y",
    "-i",
    inputPath,
    "-vf",
    vf,
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "34",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    outputPath,
  ];

  console.log("🎥 FFmpeg args:", args.join(" "));

  return new Promise((resolve, reject) => {
    const ff = spawn("ffmpeg", args, { stdio: ["ignore", "pipe", "pipe"] });

    let stderr = "";
    ff.stderr.on("data", (d) => (stderr += d.toString()));

    ff.on("close", (code) => {
      if (code === 0) return resolve();
      console.error("❌ FFmpeg failed:", stderr);
      reject(new Error("ffmpeg failed"));
    });
  });
}

async function handleCrush(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded (field must be "video")' });
    }

    const inputPath = req.file.path;

    // unique output name each time
    const outputPath = path.join(outputDir, `framecrush-${Date.now()}-${Math.random().toString(16).slice(2)}.mp4`);

    await runFfmpeg(inputPath, outputPath);

    // IMPORTANT: download OUTPUT (not input)
    res.download(outputPath, "framecrush.mp4", (err) => {
      if (err) console.error("Download error:", err);
      safeUnlink(inputPath);
      safeUnlink(outputPath);
    });
  } catch (e) {
    console.error("Server error:", e);
    return res.status(500).json({ error: "processing failed" });
  }
}

// Routes your frontend might call
app.post("/api/grunge", upload.single("video"), handleCrush);
app.post("/api/crush", upload.single("video"), handleCrush);
app.post("/crush", upload.single("video"), handleCrush); // optional legacy

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Framecrush API running on port ${PORT}`);
});
