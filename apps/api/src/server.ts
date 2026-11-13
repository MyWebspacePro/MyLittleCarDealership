import { buildApp } from "./app.js";
import { env } from "./env.js";
import { imapConfigured, pollImap } from "./lib/imap.js";

const app = await buildApp();

await app.listen({ port: env.API_PORT, host: "0.0.0.0" });

// E-Mail-Eingang (Posteingang-Automatik): alle IMAP_POLL_SECONDS ungelesene
// Mails holen. Ohne IMAP_HOST bleibt der Poller deaktiviert — "Jetzt abholen"
// im Posteingang funktioniert unabhängig davon.
if (imapConfigured()) {
  const tick = () =>
    pollImap()
      .then((result) => {
        if (result.imported > 0) app.log.info(result, "IMAP: E-Mails importiert");
      })
      .catch((err) => app.log.warn({ err: (err as Error).message }, "IMAP-Poll fehlgeschlagen"));
  setTimeout(tick, 5_000);
  const interval = setInterval(tick, env.IMAP_POLL_SECONDS * 1_000);
  interval.unref();
} else {
  app.log.info("IMAP-Eingang deaktiviert (IMAP_HOST nicht gesetzt)");
}

// Container-Orchestrer schickt SIGTERM: sauber schliessen, damit keine
// Verbindungen und DB-Transaktionen mitten im Request abreissen.
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, async () => {
    app.log.info({ signal }, "shutting down");
    await app.close();
    process.exit(0);
  });
}