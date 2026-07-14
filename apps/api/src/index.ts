import http from "http";
import { createApp } from "./app";
import { config } from "./config";
import { connectDb } from "./db";
import { ensureBucket } from "./lib/minio";
import { initSocket } from "./socket";

async function main() {
  await connectDb();
  try {
    await ensureBucket();
  } catch (e) {
    console.warn("[api] MinIO bucket ensure failed (will retry on upload):", e);
  }

  const app = createApp();
  const server = http.createServer(app);
  initSocket(server);

  server.listen(config.port, () => {
    console.log(`[api] listening on :${config.port}`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
