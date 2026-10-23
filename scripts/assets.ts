import { chmodSync, copyFileSync, cpSync, mkdirSync } from "node:fs";

mkdirSync("dist/web", { recursive: true });
for (const name of ["index.html", "style.css"]) copyFileSync(`src/web/${name}`, `dist/web/${name}`);
cpSync("src/web/assets", "dist/web/assets", { recursive: true });
chmodSync("dist/cli.js", 0o755);
