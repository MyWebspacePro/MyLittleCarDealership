import { buildApp } from "./app.js";
import { env } from "./env.js";

const app = await buildApp();

await app.listen({ port: env.API_PORT, host: "0.0.0.0" });

// Container-Orchestrer schickt SIGTERM: sauber schliessen, damit keine
// Verbindungen und DB-Transaktionen mitten im Request abreissen.
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, async () => {
    app.log.info({ signal }, "shutting down");
    await app.close();
    process.exit(0);
  });
}