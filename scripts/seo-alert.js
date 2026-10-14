#!/usr/bin/env node
// Decides whether the latest SEO audit deserves an alert.
//   node scripts/seo-alert.js reports/seo.json
// Prints a markdown message to stdout. Exit code 10 = raise an alert, 0 = all fine.

const fs = require("fs");

const r = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const hist = r.history || [];
const prev = hist.length >= 2 ? hist[hist.length - 2].score : null;
const drop = prev === null ? 0 : prev - r.summary.score;
const high = r.issues.filter((i) => i.severity === "high");
const homeDown = (r.pages || []).some((p) => p.path === "/" && p.status !== 200);

const reasons = [];
if (homeDown) reasons.push("The homepage did not return HTTP 200.");
if (drop >= 5) reasons.push(`The SEO score fell from ${prev} to ${r.summary.score} (${drop} points).`);
if (high.length) reasons.push(`${high.length} high-priority issue type(s) found.`);
if (!reasons.length) process.exit(0);

const lines = [];
lines.push(`**SEO audit ${r.generatedAt.slice(0, 10)}** for ${r.site}: score **${r.summary.score}/100**.`, "");
reasons.forEach((x) => lines.push("- " + x));
lines.push("");
r.issues.filter((i) => i.severity !== "low").slice(0, 8).forEach((i) => {
  lines.push(`### [${i.severity}] ${i.title} (${i.site ? "whole site" : i.count + " page(s)"})`);
  lines.push(`Fix: ${i.fix}`);
  i.urls.slice(0, 5).forEach((u) => lines.push("- " + u));
  lines.push("");
});
lines.push("Open **Blog Studio -> SEO Health** for the full report.");
process.stdout.write(lines.join("\n") + "\n");
process.exit(10);
