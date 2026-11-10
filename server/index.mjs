import { fileURLToPath } from "node:url";
import { createApp } from "./app.mjs";
import { HomeAssistantClient } from "./home-assistant.mjs";

const ha = new HomeAssistantClient({ token: process.env.SUPERVISOR_TOKEN });
const app = await createApp({
  ha,
  dataDir: process.env.HOME_KIOSK_DATA_DIR || "/data",
  frontendDir: process.env.HOME_KIOSK_FRONTEND_DIR || fileURLToPath(new URL("../frontend", import.meta.url)),
});
app.server.listen(8099, "0.0.0.0");
ha.start();
for (const signal of ["SIGTERM", "SIGINT"]) process.once(signal, async () => {
  ha.stop();
  await app.close();
});
