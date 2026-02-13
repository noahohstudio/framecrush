console.log("✅ FRAMECRUSH BACKEND BOOTED - VERSION A");

import express from "express";
import cors from "cors";
import multer from "multer";
import { exec } from "child_process";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

/**
 * IMPORTANT:
 * - Include your prod domains + localhost
 * - Include your Vercel preview domain too (optional but helpful)
 */
const allowedOrigins = new Set([
  "http://localhost:3000",
  "https://framecrush.net",
  "https://www.framecrush.net",
  // If you ever test via the default vercel domain, add it:
  // "https://framecrush.vercel.app",
]);

app.use((req, res, next) => {
  // Helpful for debugging in Railway logs
  console.log(`${req.method} ${req.url} Origin=${req.headers.origin || "none"}`);
  next();
});

app.use(
  cors({
    origin(origin, callback) {
      // Allow server-to-server, curl, Railway health checks, etc.
      if (!origin) return callback(null, true);

      if (allowedOrigins.has(origin)) return callback(null, true);

      return callback(new Error(`CORS not allowed for origin: ${origin}`));
    },
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// Ensure preflight always returns correctly
app.options("*", cors());

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const uploadDir = path.join(__dirname, "uploads");
const outputDir = path.join(__dirname, "outputs");

if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

const upload = multer({
  dest: uploadDir,
  limits: { fileSize: 150 * 1024 * 1024 }, // 150MB
});

app.get("/", (req, res) => res.send("Framecrush API is running"));
app.get("/health", (req, res) => res.send("health-ok-123"));

/**
 * Core processing function
 * (You can expand this later; for now we just need it working reliably.)
 */
function runFfmpeg(inputPath, outputPath, cb) {
  const command = [
    `ffmpeg -y -i "${inputPath}"`,
    `-vf "fps=12,eq=contrast=1.2:brightness=0.02:saturation=0.8"`,
    `-crf 28`,
    `"${outputPath}"`,
  ].join(" ");

  exec(command, (error, stdout, stderr) => {
    if (error) {
      console.error("FFmpeg error:", error);
      console.error("FFmpeg stderr:", stderr);
      return cb(error);
    }
    cb(null);
  });
}

/**
 * IMPORTANT:
 * Your frontend is calling /api/grunge
 * So we expose that (and keep /crush too).
 */
async function handleCrush(req, res) {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    const inputPath = req.file.path;
    const outputPath = path.join(outputDir, `crushed-${Date.now()}.mp4`);

    runFfmpeg(inputPath, outputPath, (err) => {
      if (err) return res.status(500).json({ error: "Video processing failed" });

      res.download(outputPath, (downloadErr) => {
        // Cleanup
        try { fs.unlinkSync(inputPath); } catch {}
        try { fs.unlinkSync(outputPath); } catch {}

        if (downloadErr) console.error("Download error:", downloadErr);
      });
    });
  } catch (err) {
    console.error("Server error:", err);
    res.status(500).json({ error: "Server error" });
  }
}

// accept both old + new routes
app.post("/api/grunge", upload.single("video"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const inputPath = req.file.path;
    const outputPath = path.join(outputDir, `crushed-${Date.now()}.mp4`);

    const command = `
      ffmpeg -y -i "${inputPath}" \
      -vf "fps=12,eq=contrast=1.2:brightness=0.02:saturation=0.8" \
      -crf 28 \
      "${outputPath}"
    `;

    exec(command, (error) => {
      if (error) {
        console.error("FFmpeg error:", error);
        return res.status(500).json({ error: "Video processing failed" });
      }

      res.download(outputPath, () => {
        try { fs.unlinkSync(inputPath); } catch {}
        try { fs.unlinkSync(outputPath); } catch {}
      });
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

app.post("/api/grunge", upload.single("video"), handleCrush);

// Optional: if your frontend also hits other /api/* endpoints,
// you can add more aliases here later.

app.listen(PORT, () => {
  console.log(`Framecrush API running on port ${PORT}`);
});

app.post("/api/grunge", upload.single("video"), (req, res) => {
  // forward to your existing crush handler logic
  req.url = "/crush";
  app.handle(req, res);
});

app.post("/api/crush", upload.single("video"), (req, res) => {
  req.url = "/crush";
  app.handle(req, res);
});
