import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const port = Number(process.env.PORT || 3000);
const publicDir = join(process.cwd(), "public");

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".svg": "image/svg+xml"
};

async function serveFile(res, path) {
  try {
    const body = await readFile(path);
    res.writeHead(200, {
      "Content-Type": contentTypes[extname(path)] || "application/octet-stream"
    });
    res.end(body);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
  }
}

createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://localhost:${port}`);
  const pathname = decodeURIComponent(url.pathname);
  const staticPath = normalize(pathname).replace(/^(\.\.[/\\])+/, "");

  if (extname(staticPath)) {
    await serveFile(res, join(publicDir, staticPath));
    return;
  }

  await serveFile(res, join(publicDir, "index.html"));
}).listen(port, () => {
  console.log(`Startup one-pager running at http://localhost:${port}/autocast`);
});
