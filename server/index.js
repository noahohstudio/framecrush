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

function safeUnlink(p) {
  try {
    if (p && fs.existsSync(p)) fs.unlinkSync(p);
  } catch {}
}

// --------------------
// Health
// --------------------
app.get("/", (req, res) => res.send("Framecrush API is running"));
app.get("/health", (req, res) => res.status(200).json({ status: "ok" }));

// --------------------
// FFmpeg runner (final look)
// --------------------
function runFfmpeg({ inputPath, outputPath, fps, crunchWidth, grain, contrast, brightness, saturation, crf }) {
  // Keep it “grunge” but not nuclear:
  // - fps (frame drop)
  // - scale down then scale back up with nearest neighbor to get crunchy pixels
  // - eq for contrast/brightness/saturation
  // - noise grain
  //
  // crunchWidth controls the *downscale* width.
  // Example: 320 feels crunchy; 640 feels milder.
  const downW = Math.max(180, Math.min(960, Number(crunchWidth) || 480));
  const outW = 1280; // final upscale target (still fits typical outputs)
  const outH = -2;   // keep aspect ratio

  const f = Math.max(4, Math.min(30, Number(fps) || 12));
  const g = Math.max(0, Math.min(30, Number(grain) || 14));
  const c = Math.max(0.8, Math.min(1.6, Number(contrast) || 1.2));
  const b = Math.max(-0.2, Math.min(0.2, Number(brightness) || 0.02));
  const s = Math.max(0, Math.min(1.5, Number(saturation) || 0.8));
  const q = Math.max(18, Math.min(35, Number(crf) || 28));

  // Nearest-neighbor upscaling = crunchy pixel vibe
  const vf = [
    `fps=${f}`,
    `scale=${downW}:-2`,
    `scale=${outW}:${outH}:flags=neighbor`,
    `eq=contrast=${c}:brightness=${b}:saturation=${s}`,
    `noise=alls=${g}:allf=t`,
  ].join(",");

  const args = [
    "-y",
    "-i",
    inputPath,
    "-vf",
    vf,

    // FORCE a real transcode so effects cannot “accidentally” be bypassed
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    String(q),
    "-pix_fmt",
    "yuv420p",

    // audio (safe defaults)
    "-c:a",
    "aac",
    "-b:a",
    "128k",

    outputPath,
  ];

  return new Promise((resolve, reject) => {
    const ff = spawn("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });

    let stderr = "";
    ff.stderr.on("data", (d) => (stderr += d.toString()));

    ff.on("close", (code) => {
      if (code === 0) return resolve();
      console.error("FFmpeg failed:", stderr);
      reject(new Error("ffmpeg failed"));
    });
  });
}

// --------------------
// Handler
// --------------------
async function handleGrunge(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded (field must be "video")' });
    }

    const inputPath = req.file.path;

    // Unique output name every time
    const outputPath = path.join(
      outputDir,
      `framecrush-${Date.now()}-${Math.random().toString(16).slice(2)}.mp4`
    );

    // Pull settings (if frontend sends them). If not present, defaults apply.
    const fps = req.body?.fps;
    const crunchWidth = req.body?.crunch;
    const grain = req.body?.grain;
    const contrast = req.body?.contrast;
    const brightness = req.body?.brightness;
    const saturation = req.body?.saturation;
    const crf = req.body?.crf;

    await runFfmpeg({
      inputPath,
      outputPath,
      fps,
      crunchWidth,
      grain,
      contrast,
      brightness,
      saturation,
      crf,
    });

    // IMPORTANT: return the OUTPUT
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

// --------------------
// Routes (match your frontend)
// --------------------
app.post("/api/grunge", upload.single("video"), handleGrunge);

// Optional aliases (won’t hurt, helps future changes)
app.post("/api/crush", upload.single("video"), handleGrunge);
app.post("/crush", upload.single("video"), handleGrunge);

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Framecrush API running on port ${PORT}`);
});
