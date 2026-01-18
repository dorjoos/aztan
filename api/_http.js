function json(res, status, data, headers = {}) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  Object.entries(headers).forEach(([k, v]) => res.setHeader(k, v));
  res.end(JSON.stringify(data));
}

function methodNotAllowed(res, allow = ["GET"]) {
  res.setHeader("Allow", allow.join(", "));
  return json(res, 405, { error: "method_not_allowed" });
}

function noStore(res) {
  res.setHeader("Cache-Control", "no-store");
}

module.exports = { json, methodNotAllowed, noStore };

