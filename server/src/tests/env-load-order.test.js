import { describe, it, expect } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * The documented startup path is `bun src/index.js` (`dev:dotenv`), and
 * index.js line 1 is `import 'dotenv/config'`.
 *
 * ESM evaluates imports in source order, so that import must be first or
 * modules that capture `process.env` at import time (app.js reads
 * CORS_ORIGIN while building the middleware stack) see an empty environment.
 * This runs the same import sequence under Node — which does not auto-load
 * .env the way Bun does — from a scratch cwd whose .env is the only source of
 * CORS_ORIGIN, then checks the CORS answer for that exact origin.
 */

const serverDir = path.resolve(import.meta.dir, "../..");

describe("environment load order", () => {
  it("loads .env before app.js captures process.env", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sentinel-env-order-"));
    fs.writeFileSync(path.join(dir, ".env"), "CORS_ORIGIN=http://env-order.test\n");

    // Same modules index.js imports; absolute URLs so Node can resolve them
    // from the scratch cwd.
    const dotenvConfig = import.meta.resolve("dotenv/config");

    const script = `
      await import(${JSON.stringify(dotenvConfig)});
      const { default: app } = await import(${JSON.stringify(path.join(serverDir, "src/app.js"))});
      const server = app.listen(0, async () => {
        const { port } = server.address();
        const res = await fetch('http://127.0.0.1:' + port + '/api/v1/health/', {
          headers: { Origin: 'http://env-order.test' },
        });
        console.log('ACAO=' + (res.headers.get('access-control-allow-origin') || 'none'));
        server.close();
      });
    `;

    const env = { ...process.env, NODE_ENV: "test" };
    delete env.CORS_ORIGIN; // must come from the scratch .env only

    const child = Bun.spawnSync({
      cmd: ["node", "--input-type=module", "-e", script],
      cwd: dir,
      env,
      stdout: "pipe",
      stderr: "pipe",
    });

    const stdout = child.stdout.toString();
    fs.rmSync(dir, { recursive: true, force: true });

    expect({ exitCode: child.exitCode, stderr: child.stderr.toString().slice(0, 400) }).toEqual({
      exitCode: 0,
      stderr: "",
    });
    expect(stdout).toContain("ACAO=http://env-order.test");
  });
});
