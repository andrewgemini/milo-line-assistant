import "dotenv/config";
import { createServer } from "node:http";
import app from "./api";
import { serveStatic } from "./_core/vite";

serveStatic(app);

const port = Number.parseInt(process.env.PORT || "3000", 10);
const server = createServer(app);

server.listen(port, "0.0.0.0", () => {
  console.log(`Milo container listening on 0.0.0.0:${port}`);
});

function shutdown(signal: string) {
  console.log(`Received ${signal}; shutting down Milo container`);
  server.close(error => {
    if (error) {
      console.error("Milo container shutdown failed", error);
      process.exitCode = 1;
    }
    process.exit();
  });
}

process.once("SIGTERM", () => shutdown("SIGTERM"));
process.once("SIGINT", () => shutdown("SIGINT"));
