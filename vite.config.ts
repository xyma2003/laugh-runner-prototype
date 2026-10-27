import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const electronPath = require("electron") as string;

function localDesktopLauncher(): Plugin {
  return {
    name: "local-desktop-launcher",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/__launch-desktop", (request, response, next) => {
        if (request.method !== "POST") {
          next();
          return;
        }

        const remoteAddress = request.socket.remoteAddress ?? "";
        const host = request.headers.host ?? "";
        const origin = request.headers.origin;
        const isLoopback = ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(remoteAddress);
        const isLocalHost = /^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host);
        const isSameOrigin = origin === undefined || origin === `http://${host}`;

        response.setHeader("Content-Type", "application/json; charset=utf-8");
        if (!isLoopback || !isLocalHost || !isSameOrigin) {
          response.statusCode = 403;
          response.end(JSON.stringify({ error: "Local requests only" }));
          return;
        }

        const child = spawn(electronPath, [path.join(projectRoot, "electron", "main.cjs")], {
          cwd: projectRoot,
          detached: true,
          stdio: "ignore",
          env: {
            ...process.env,
            LAUGH_RUNNER_URL: `http://${host}/?compact=1&desktop=1`,
          },
        });

        child.once("spawn", () => {
          child.unref();
          response.statusCode = 202;
          response.end(JSON.stringify({ status: "launching" }));
        });
        child.once("error", () => {
          response.statusCode = 500;
          response.end(JSON.stringify({ error: "Desktop window failed to start" }));
        });
      });
    },
  };
}

export default defineConfig({
  base: "./",
  plugins: [localDesktopLauncher()],
  build: {
    outDir: "dist",
    assetsDir: "assets",
    sourcemap: true,
  },
});
