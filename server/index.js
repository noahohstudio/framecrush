import express from "express";
import cors from "cors";
import multer from "multer";
import { exec } from "child_process";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

// --------------------
// Setup
// --------------------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// --------------------
// CORS (IMPORTANT)
// --------------------
const allowedOrigins = [
  "http://localhost:3000",
  "https://framecrush.net",
  "https://www.framecrush.net"
];

app.use(
  cors({
    origin: function (origin, callback) {
      // Allow server-to-server & tools like curl
      if (!origin) return callback(null, true);

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error("CORS not allowed"));
    },
    methods: ["GET", "POST"],
    credentials: true
  })
);

// --------------------
// Middleware
// --------------------
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --------------------
// File upload (multer)
// --------------------
const uploadDir = path.join(__dirname, "uploads");
const outputDir = path.join(__dirname, "outputs");

if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);
if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir);

const upload = multer({
  dest: uploadDir,
  limits: {
    fileSize: 150 * 1024 * 1024 // 150MB
  }
});

// --------------------
// Health check (Railway / Vercel sanity)
// --------------------
app.get("/", (req, res) => {
  res.send("Framecrush API is running");
});

app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok" });
});

// --------------------
// Crush endpoint (placeholder FFmpeg pipeline)
// --------------------
app.post("/crush", upload.single("video"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const inputPath = req.file.path;
    const outputPath = path.join(
      outputDir,
      `crushed-${Date.now()}.mp4`
    );

    // VERY BASIC FFmpeg example (safe default)
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
        fs.unlinkSync(inputPath);
        fs.unlinkSync(outputPath);
      });
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// --------------------
// Start server
// --------------------
app.listen(PORT, () => {
  console.log(`Framecrush API running on port ${PORT}`);
});
