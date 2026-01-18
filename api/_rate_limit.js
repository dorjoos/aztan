const buckets = new Map();

function keyFor(req) {
  const xf = req.headers["x-forwarded-for"];
  const ip = (Array.isArray(xf) ? xf[0] : xf || "").split(",")[0].trim();
  return ip || req.socket?.remoteAddress || "unknown";
}

function rateLimit({ windowMs, max }) {
  return (req) => {
    const key = keyFor(req);
    const now = Date.now();
    const b = buckets.get(key) || { start: now, count: 0 };
    if (now - b.start > windowMs) {
      b.start = now;
      b.count = 0;
    }
    b.count += 1;
    buckets.set(key, b);
    return b.count <= max;
  };
}

module.exports = { rateLimit };

