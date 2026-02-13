import express from "express";
import multer from "multer";
import { execFile } from "child_process";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

// --------------------
// Setup
// --------------------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 8080;

// --------------------
// CORS (strict + preflight)
// --------------------
const allowedOrigins = new Set([
  "https://framecrush.net",
  "https://www.framecrush.net",
  "http://localhost:3000",
]);

app.use((req, res, next) => {
  const origin = req.headers.origin;

  // If the request has an Origin and it's allowed, echo it back
  if (origin && allowedOrigins.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }

  // Helps caches behave correctly when origin varies
  res.setHeader("Vary", "Origin");

  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization"
  );

  // Preflight request
  if (req.method === "OPTIONS") return res.sendStatus(204);

  next();
});

// --------------------
// Middleware
// --------------------
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --------------------
// Upload + output folders
// --------------------
const uploadDir = path.join(__dirname, "uploads");
const outputDir = path.join(__dirname, "outputs");

if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

// Multer: expects field name "video"
const upload = multer({
  dest: uploadDir,
  limits: { fileSize: 150 * 1024 * 1024 }, // 150MB
});

// --------------------
// Health
// --------------------
app.get("/", (req, res) => res.send("Framecrush API is running"));
app.get("/health", (req, res) => res.status(200).json({ status: "ok" }));

// --------------------
// Core processing handler
// --------------------
function runFfmpeg({ inputPath, outputPath }, cb) {
  // NOTE: This requires ffmpeg to exist in the Railway environment.
  // If you get "ffmpeg not found" in logs, we’ll fix Dockerfile next.
  const args = [
    "-y",
    "-i",
    inputPath,
    "-vf",
    "fps=12,eq=contrast=1.2:brightness=0.02:saturation=0.8",
    "-crf",
    "28",
    outputPath,
  ];

  execFile("ffmpeg", args, (err, stdout, stderr) => {
    if (err) return cb(err, { stdout, stderr });
    cb(null, { stdout, stderr });
  });
}

function safeUnlink(filePath) {
  try {
    if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch (_) {}
}

async function handleCrush(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded (field: video)" });
    }

    const inputPath = req.file.path;
    const outputPath = path.join(outputDir, `crushed-${Date.now()}.mp4`);

    runFfmpeg({ inputPath, outputPath }, (err, logs) => {
      if (err) {
        console.error("FFmpeg failed:", err);
        console.error("FFmpeg stderr:", logs?.stderr);
        safeUnlink(inputPath);
        safeUnlink(outputPath);
        return res.status(500).json({ error: "Video processing failed" });
      }

      // Send file to client
      res.download(outputPath, "framecrush.mp4", (downloadErr) => {
        if (downloadErr) console.error("Download error:", downloadErr);
        safeUnlink(inputPath);
        safeUnlink(outputPath);
      });
    });
  } catch (e) {
    console.error("Server error:", e);
    return res.status(500).json({ error: "Server error" });
  }
}

// --------------------
// Routes (match your UI)
// --------------------
app.post("/api/grunge", upload.single("video"), handleCrush);
app.post("/api/crush", upload.single("video"), handleCrush);

// Helpful 404 for API routes (so you don't get confusing HTML errors)
app.use("/api", (req, res) => {
  res.status(404).json({ error: "API route not found" });
});

// --------------------
// Start
// --------------------
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Framecrush API running on port ${PORT}`);
});
