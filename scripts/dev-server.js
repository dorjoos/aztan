// Minimal static dev server for local testing (optional).
// For Vercel deployment, /api/* functions are used by Vercel automatically.
const http = require("http");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const port = Number(process.env.PORT || 5173);

function loadDotEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  const raw = fs.readFileSync(filePath, "utf8");
  raw.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const eq = trimmed.indexOf("=");
    if (eq === -1) return;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith("'") && val.endsWith("'")) || (val.startsWith('"') && val.endsWith('"'))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  });
}

// Load local env for dev (keeps secrets out of repo; uses your existing .env)
loadDotEnv(path.join(root, ".env"));

const mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
};

function tryLoadApiHandler(apiPath) {
  // /api/auth/me -> api/auth/me.js
  const rel = apiPath.replace(/^\/api\//, "");
  const file = path.join(root, "api", rel) + ".js";
  if (!fs.existsSync(file)) return null;
  // bust require cache for local dev edits (handler + shared api modules)
  for (const k of Object.keys(require.cache)) {
    if (k.startsWith(path.join(root, "api") + path.sep)) delete require.cache[k];
  }
  // eslint-disable-next-line import/no-dynamic-require, global-require
  return require(file);
}

http
  .createServer(async (req, res) => {
    const parsed = new URL(req.url || "/", "http://localhost");
    const urlPath = parsed.pathname || "/";
    const query = {};
    for (const [k, v] of parsed.searchParams.entries()) query[k] = v;

    // Minimal local /api router (Vercel-compatible)
    if (urlPath.startsWith("/api/")) {
      const handler = tryLoadApiHandler(urlPath);
      if (!handler) {
        res.statusCode = 404;
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.end(JSON.stringify({ error: "not_found" }));
        return;
      }
      req.query = query;
      try {
        await Promise.resolve(handler(req, res));
      } catch (e) {
        res.statusCode = 500;
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.end(JSON.stringify({ error: "server_error" }));
        console.error("API error:", urlPath, e);
      }
      return;
    }

    const safe = urlPath.replace(/\.\./g, "");
    const filePath = path.join(root, safe === "/" ? "/index.html" : safe);

    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.statusCode = 404;
        res.end("Not found");
        return;
      }
      const ext = path.extname(filePath).toLowerCase();
      res.setHeader("Content-Type", mime[ext] || "application/octet-stream");
      res.end(data);
    });
  })
  .listen(port, () => console.log(`Dev server: http://localhost:${port}`));

