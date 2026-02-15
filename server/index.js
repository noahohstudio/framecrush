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
// Helpers: parse + fallback aliases
// --------------------
function pickBody(req, keys) {
  for (const k of keys) {
    const v = req.body?.[k];
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return undefined;
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function num(v, fallback) {
  const x = Number(v);
  return Number.isFinite(x) ? x : fallback;
}

// --------------------
// FFmpeg runner (final look + gamma support)
// --------------------
function runFfmpeg({
  inputPath,
  outputPath,
  fps,
  crunchWidth,
  grain,
  contrast,
  brightness,
  gamma,
  saturation,
  crf,
}) {
  const downW = clamp(Math.round(num(crunchWidth, 480)), 180, 960);
  const outW = 1280;
  const outH = -2;

  const f = clamp(num(fps, 12), 4, 30);
  const g = clamp(num(grain, 14), 0, 30);
  const c = clamp(num(contrast, 1.2), 0.8, 1.6);
  const b = clamp(num(brightness, 0.02), -0.2, 0.2);
  const ga = clamp(num(gamma, 1.0), 0.7, 1.4);
  const s = clamp(num(saturation, 0.8), 0, 1.5);
  const q = clamp(Math.round(num(crf, 28)), 18, 35);

  // IMPORTANT: saturation + gamma are in eq here.
  // Noise is after eq so color changes stay visible.
  const vf = [
    `fps=${f}`,
    `scale=${downW}:-2`,
    `scale=${outW}:${outH}:flags=neighbor`,
    `eq=contrast=${c}:brightness=${b}:saturation=${s}:gamma=${ga}`,
    `noise=alls=${g}:allf=t`,
  ].join(",");

  const args = [
    "-y",
    "-i",
    inputPath,
    "-vf",
    vf,

    // Force a real transcode so effects can't "pass through"
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    String(q),
    "-pix_fmt",
    "yuv420p",

    // audio
    "-c:a",
    "aac",
    "-b:a",
    "128k",

    outputPath,
  ];

  console.log("🎛️ params:", { fps: f, crunchWidth: downW, grain: g, contrast: c, brightness: b, gamma: ga, saturation: s, crf: q });
  console.log("🎥 ffmpeg:", args.join(" "));

  return new Promise((resolve, reject) => {
    const ff = spawn("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });

    let stderr = "";
    ff.stderr.on("data", (d) => (stderr += d.toString()));

    ff.on("close", (code) => {
      if (code === 0) return resolve();
      console.error("❌ FFmpeg failed:", stderr);
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
    const outputPath = path.join(
      outputDir,
      `framecrush-${Date.now()}-${Math.random().toString(16).slice(2)}.mp4`
    );

    // Accept multiple key names (so UI changes don't break backend)
    const fps = pickBody(req, ["fps", "frameRate", "framerate"]);
    const crunchWidth = pickBody(req, ["crunch", "width", "downscale", "res"]);
    const grain = pickBody(req, ["grain", "noise"]);
    const contrast = pickBody(req, ["contrast", "con"]);
    const brightness = pickBody(req, ["brightness", "bright"]);
    const gamma = pickBody(req, ["gamma"]);
    const saturation = pickBody(req, ["saturation", "sat", "s"]);
    const crf = pickBody(req, ["crf", "compression"]);

    // Log the raw body once so you can confirm sliders are being sent
    console.log("📦 raw req.body:", req.body);

    await runFfmpeg({
      inputPath,
      outputPath,
      fps,
      crunchWidth,
      grain,
      contrast,
      brightness,
      gamma,
      saturation,
      crf,
    });

    // IMPORTANT: return OUTPUT
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
app.post("/api/crush", upload.single("video"), handleGrunge);
app.post("/crush", upload.single("video"), handleGrunge);

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Framecrush API running on port ${PORT}`);
});
