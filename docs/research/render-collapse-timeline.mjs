import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { chromium } from "playwright";
fs.mkdirSync("output/research", { recursive: true });
const data = JSON.parse(
  fs.readFileSync("docs/research/collapse-timeline.json", "utf8"),
);
const plotly = fs
  .readFileSync(
    "output/validation/collapse-chart/node_modules/plotly.js-dist-min/plotly.min.js",
  )
  .toString("base64");
const x = data.history.map((p) => p.day);
const traces = [
  {
    x,
    y: data.history.map((p) => p.population),
    type: "scatter",
    mode: "lines",
    line: { color: "#365c45", width: 3 },
    name: "Living people",
    showlegend: false,
    xaxis: "x",
    yaxis: "y",
  },
  {
    x,
    y: data.history.map((p) => p.communalFoodTonnes),
    type: "scatter",
    mode: "lines",
    line: { color: "#98723e", width: 3 },
    name: "Communal food",
    showlegend: false,
    xaxis: "x2",
    yaxis: "y2",
  },
  {
    x: data.deathsPerDay.map((p) => p.day),
    y: data.deathsPerDay.map((p) => p.adult),
    type: "bar",
    name: "Adults",
    marker: { color: "#52696d" },
    xaxis: "x3",
    yaxis: "y3",
  },
  {
    x: data.deathsPerDay.map((p) => p.day),
    y: data.deathsPerDay.map((p) => p.child),
    type: "bar",
    name: "Children under one year",
    marker: { color: "#b66e5b" },
    xaxis: "x3",
    yaxis: "y3",
  },
];
const axis = {
  showline: false,
  zeroline: false,
  gridcolor: "#e4e8e2",
  tickfont: { size: 12 },
  automargin: true,
};
const layout = {
  width: 1280,
  height: 1000,
  paper_bgcolor: "#fcfbf7",
  plot_bgcolor: "#fcfbf7",
  font: { family: "Arial, sans-serif", color: "#33463b", size: 14 },
  margin: { t: 105, l: 100, r: 65, b: 105 },
  barmode: "stack",
  bargap: 0,
  title: {
    text: "Praxans · the renewed communities’ collapse<br><sup>Preserved world history · 1,200 founders · 407 births · all 1,607 subsequently died</sup>",
    x: 0.07,
    xanchor: "left",
    font: { size: 24 },
  },
  xaxis: {
    ...axis,
    domain: [0, 1],
    anchor: "y",
    range: [0, 570],
    showticklabels: false,
  },
  xaxis2: {
    ...axis,
    domain: [0, 1],
    anchor: "y2",
    range: [0, 570],
    showticklabels: false,
  },
  xaxis3: {
    ...axis,
    domain: [0, 1],
    anchor: "y3",
    range: [0, 570],
    title: { text: "Simulated days after the recorded restoration" },
  },
  yaxis: {
    ...axis,
    domain: [0.71, 1],
    title: { text: "Living people" },
    rangemode: "tozero",
  },
  yaxis2: {
    ...axis,
    domain: [0.39, 0.65],
    title: { text: "Communal food (tonnes)" },
    rangemode: "tozero",
  },
  yaxis3: {
    ...axis,
    domain: [0.03, 0.29],
    title: { text: "Recorded deaths / day" },
    rangemode: "tozero",
  },
  legend: {
    orientation: "h",
    x: 0,
    y: 0.355,
    xanchor: "left",
    yanchor: "middle",
    font: { size: 13 },
  },
  shapes: [data.firstDeathDay, data.lastDeathDay].map((day) => ({
    type: "line",
    xref: "x",
    x0: day,
    x1: day,
    yref: "paper",
    y0: 0.03,
    y1: 1,
    line: { color: "#9aa59b", width: 1, dash: "dot" },
  })),
  annotations: [
    {
      xref: "x",
      yref: "paper",
      x: data.firstDeathDay,
      y: 1.02,
      text: "First death · day 372",
      showarrow: false,
      xanchor: "right",
      font: { size: 12 },
    },
    {
      xref: "x",
      yref: "paper",
      x: data.lastDeathDay,
      y: 1.02,
      text: "Extinct · day 550",
      showarrow: false,
      xanchor: "center",
      font: { size: 12 },
    },
    {
      xref: "paper",
      yref: "paper",
      x: 0,
      y: -0.065,
      xanchor: "left",
      yanchor: "top",
      showarrow: false,
      align: "left",
      text: "Source: verified tick-289492 backup. Food excludes personal rations, cargo and standing plants.<br>These trajectories describe the simulation; they do not establish a realistic natural extinction.",
      font: { size: 12, color: "#657267" },
    },
  ],
};
const html =
  '<!doctype html><meta charset="utf-8"><title>Praxans collapse timeline</title><style>body{margin:0;background:#fcfbf7}#chart{width:1280px;height:1000px}</style><div id="chart"></div><script src="data:text/javascript;base64,' +
  plotly +
  '"></script><script>Plotly.newPlot("chart",' +
  JSON.stringify(traces) +
  "," +
  JSON.stringify(layout) +
  ",{responsive:true,displaylogo:false}).then(()=>window.chartReady=true)</script>";
const path = resolve("output/research/collapse-timeline-recheck.html");
fs.writeFileSync(path, html);
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 1000 },
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(pathToFileURL(path).href);
  await page.waitForFunction(() => window.chartReady);
  const png = await page.evaluate(() =>
    Plotly.toImage(document.getElementById("chart"), {
      format: "png",
      width: 1280,
      height: 1000,
      scale: 1,
    }),
  );
  fs.writeFileSync(
    "output/research/collapse-timeline-recheck.png",
    Buffer.from(png.split(",")[1], "base64"),
  );
  if (errors.length) throw Error(errors.join("\n"));
  console.log(
    JSON.stringify({
      figure: "output/research/collapse-timeline-recheck.png",
      interactive: "output/research/collapse-timeline-recheck.html",
      errors,
    }),
  );
} finally {
  await browser.close();
}
