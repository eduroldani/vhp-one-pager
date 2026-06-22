import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";

const port = Number(process.env.PORT || 3000);
const publicDir = join(process.cwd(), "public");

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8"
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

  if (pathname === "/styles.css") {
    await serveFile(res, join(publicDir, "styles.css"));
    return;
  }

  if (pathname === "/data.js") {
    await serveFile(res, join(publicDir, "data.js"));
    return;
  }

  await serveFile(res, join(publicDir, "index.html"));
}).listen(port, () => {
  console.log(`Startup one-pager running at http://localhost:${port}/autocast`);
});
