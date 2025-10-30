import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import path from "path";
import { fileURLToPath } from "url";
import { config } from "./config/database.js";
import dotenv from "dotenv";

// ✅ Load env before anything
dotenv.config();

import studentRoutes from "./routes/students.js";
import uploadRoutes from "./routes/upload.js";
import errorHandler from "./middleware/errorHandler.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5000;

// 🔍 Check Mongo URI
console.log("🔗 Loaded Mongo URI:", config.mongoURI || "❌ Not found");

// 🧠 Security Middleware
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
  })
);

app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// ⏱️ Rate Limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  message: {
    success: false,
    message: "Too many requests from this IP, please try again later.",
  },
});
app.use(limiter);

// 📦 Body Parsing
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// 📂 Static Files
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// 🧭 Routes
app.use("/api/students", studentRoutes);
app.use("/api/upload", uploadRoutes);

// 💓 Health Check
app.get("/api/health", (req, res) => {
  res.json({
    status: "OK",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    database:
      mongoose.connection.readyState === 1 ? "Connected" : "Disconnected",
  });
});

// ⚠️ Error Handling
app.use(errorHandler);

// ❌ 404 Handler
app.use("*", (req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found",
  });
});

// 🚀 Database Connection & Server Start
async function startServer() {
  try {
    await mongoose.connect(config.mongoURI);
    console.log("✅ MongoDB Connected Successfully");

    // 📁 Create Upload Directories
    const fs = await import("fs");
    const uploadDirs = [
      config.storagePath,
      path.join(config.storagePath, "images"),
      path.join(config.storagePath, "pdfs"),
    ];

    for (const dir of uploadDirs) {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        console.log(`📁 Created directory: ${dir}`);
      }
    }

    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`📊 MongoDB: ${config.mongoURI}`);
      console.log(`💾 Storage: ${config.storagePath}`);
      console.log(
        `🌐 Frontend: ${process.env.FRONTEND_URL || "http://localhost:3000"}`
      );
    });
  } catch (error) {
    console.error("❌ Database connection failed:", error);
    process.exit(1);
  }
}

// 🧹 Graceful Shutdown
process.on("SIGINT", async () => {
  console.log("\n🛑 Shutting down server gracefully...");
  await mongoose.connection.close();
  console.log("✅ MongoDB connection closed.");
  process.exit(0);
});

startServer();
