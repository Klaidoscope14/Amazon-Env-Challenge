import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/*
 * The CloudFront Function that maps clean URLs to the static export lives in
 * the SAM template. This runs its code as written there, and checks its page
 * list matches the frontend's pages, so a new page can't 404 in production.
 */

const root = join(import.meta.dirname, "..", "..");
const template = readFileSync(join(root, "infrastructure", "template.yaml"), "utf8");

function functionCode(): string {
  const start = template.indexOf("      FunctionCode: |\n");
  const lines = template.slice(start).split("\n").slice(1);
  const body: string[] = [];
  for (const line of lines) {
    if (line.trim() !== "" && !line.startsWith("        ")) break;
    body.push(line.slice(8));
  }
  return body.join("\n");
}

const handler = new Function(`${functionCode()}\nreturn handler;`)() as (event: {
  request: { uri: string };
}) => { uri: string };
const route = (uri: string) => handler({ request: { uri } }).uri;

function pageRoutes(dir: string, prefix = ""): string[] {
  const routes: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) routes.push(...pageRoutes(path, `${prefix}/${entry}`));
    else if (entry === "page.tsx" && prefix) routes.push(prefix);
  }
  return routes;
}

describe("CloudFront route function", () => {
  it("lists exactly the frontend's pages", () => {
    const listed = JSON.parse(functionCode().match(/var ROUTES = (\[.*?\]);/)![1].replace(/'/g, '"')) as string[];
    expect([...listed].sort()).toEqual(pageRoutes(join(root, "frontend", "src", "app")).sort());
  });

  it.each([
    ["/", "/index.html"],
    ["/about", "/about.html"],
    ["/about/", "/about.html"],
    ["/forgot-password", "/forgot-password.html"],
    ["/nope", "/404.html"],
    ["/_next/static/chunks/app.js", "/_next/static/chunks/app.js"],
    ["/about.txt", "/about.txt"],
    ["/about/__next.about.__PAGE__.txt", "/about/__next.about.__PAGE__.txt"],
    ["/favicon.ico", "/favicon.ico"],
  ])("%s -> %s", (uri, expected) => {
    expect(route(uri)).toBe(expected);
  });
});
