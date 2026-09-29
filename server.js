const express = require("express");

const app = express();
const PORT = process.env.PORT || 3000;

// Front counter
app.get("/", (req, res) => {
  res.json({ message: "Hello from a hardened container" });
});

// Pulse check, used by the Docker HEALTHCHECK
app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok" });
});

const server = app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server listening on port ${PORT}`);
});

// Close cleanly when Docker asks the container to stop
process.on("SIGTERM", () => {
  server.close(() => process.exit(0));
});