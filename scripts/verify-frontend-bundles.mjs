import { readFileSync } from "node:fs";
import { Script } from "node:vm";

const files = process.argv.slice(2);

if (files.length === 0) {
  throw new Error("Pass at least one HTML file to verify.");
}

let parsedScripts = 0;

for (const file of files) {
  const html = readFileSync(file, "utf8");

  if (/^(<<<<<<<|=======|>>>>>>>)/m.test(html)) {
    throw new Error(`${file}: unresolved merge conflict marker`);
  }

  const scripts = html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi);
  let fileScripts = 0;

  for (const match of scripts) {
    const attributes = match[1] ?? "";
    const source = match[2] ?? "";

    if (/\bsrc\s*=/i.test(attributes) || source.trim() === "") {
      continue;
    }

    new Script(`(function () {\n${source}\n})`, {
      filename: `${file}#inline-${fileScripts + 1}`,
    });
    fileScripts += 1;
    parsedScripts += 1;
  }

  process.stdout.write(`${file}: ${fileScripts} inline scripts OK\n`);
}

process.stdout.write(`Parsed ${parsedScripts} inline scripts.\n`);
