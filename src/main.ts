// src/main.ts
import {
  Chart,
  LineController,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Tooltip,
  Legend,
} from 'chart.js';

Chart.register(LineController, LineElement, PointElement, LinearScale, CategoryScale, Tooltip, Legend);
Chart.defaults.font.size = 16;   // fonte base maior
Chart.defaults.font.weight = 'bold'; // peso mais forte

const ENDPOINT = "/api/current";
const POLL_MS = 2000;

type Maybe = string | null;

function $(id: string) {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Elemento #${id} não encontrado`);
  return el as HTMLElement;
}

function safeNum(value: string | null, invalids: (string | number)[] = ["UNAVAILABLE", "-9999"]) {
  if (value == null) return null;
  if (invalids.includes(value)) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function txt(node: Element | null): Maybe {
  return node ? (node.textContent ?? "").trim() : null;
}

function findByTagAndName(doc: Document, tag: string, name: string): Element | null {
  const list = doc.getElementsByTagName(tag);
  for (let i = 0; i < list.length; i++) {
    const el = list.item(i)!;
    if (el.getAttribute("name") === name) return el;
  }
  return null;
}

function findFirst(doc: Document, tag: string): Element | null {
  const list = doc.getElementsByTagName(tag);
  return list.length ? list.item(0) : null;
}

async function fetchXML(signal?: AbortSignal): Promise<Document> {
  const res = await fetch(ENDPOINT, { signal, cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  const xml = new DOMParser().parseFromString(text, "text/xml");
  const parserErr = xml.getElementsByTagName("parsererror")[0];
  if (parserErr) throw new Error("XML inválido");
  return xml;
}

function setBadge(el: HTMLElement, value: string | null) {
  el.classList.remove("ok", "bad", "warn");
  el.textContent = value ?? "–";
  if (!value) return;

  if (el.id === "avail") {
    if (value === "AVAILABLE") el.classList.add("ok");
    else el.classList.add("warn");
  }
  if (el.id === "estop") {
    if (value === "ARMED") el.classList.add("warn");
    if (value === "TRIGGERED") el.classList.add("bad");
    if (value === "READY" || value === "INACTIVE") el.classList.add("ok");
  }
  if (el.id === "exec") {
    if (value === "ACTIVE" || value === "EXECUTING") el.classList.add("ok");
    else if (value === "STOPPED" || value === "INTERRUPTED") el.classList.add("warn");
  }
}

function formatMaybeNumber(n: number | null, decimals = 3): string {
  return n == null ? "–" : n.toFixed(decimals);
}

/* =========================
   GRÁFICOS (Chart.js)
   ========================= */

type Charts = {
  temp?: Chart;
  angle?: Chart;
  rpm?: Chart;
  x?: Chart;
  z?: Chart;
};

const charts: Charts = {};

function makeLineChart(canvasId: string, label: string, color: string) {
  const ctx = (document.getElementById(canvasId) as HTMLCanvasElement)!.getContext('2d')!;
  return new Chart(ctx, {
    type: 'line',
    data: {
      labels: [] as string[],
      datasets: [{
        label,
        data: [] as (number | null)[],
        borderColor: color,
        backgroundColor: color,
        borderWidth: 2,
        tension: 0.2,
        pointRadius: 0,
        spanGaps: true,
      }]
    },
    options: {
      responsive: true,
      animation: false,
      maintainAspectRatio: false,
      scales: {
        x: {
          ticks: {
            color: '#93a1ad',
            font: { size: 24, weight: 500 } // aumenta fonte eixo X
          },
          grid: { color: 'rgba(255,255,255,0.05)' }
        },
        y: {
          ticks: {
            color: '#93a1ad',
            font: { size: 24, weight: 500 } // aumenta fonte eixo Y
          },
          grid: { color: 'rgba(255,255,255,0.05)' }
        },
      },
      plugins: {
        legend: {
          labels: {
            color: '#93a1ad',
            font: { size: 24, weight: 600 } // legenda maior
          }
        },
        tooltip: {
          titleFont: { size: 24, weight: 600 },
          bodyFont: { size: 24 }
        }
      }
    }
  });
}

function initCharts() {
  charts.temp  = makeLineChart('chartTemp',  'Temperatura (°C)', '#ff5c5c');
  charts.angle = makeLineChart('chartAngle', 'Ângulo C (°)',     '#f5a623');
  charts.rpm   = makeLineChart('chartRpm',   'RPM',              '#1db954');
  charts.x     = makeLineChart('chartX',     'Posição X (mm)',   '#4a90e2');
  charts.z     = makeLineChart('chartZ',     'Posição Z (mm)',   '#bd10e0');
}

function addData(chart: Chart | undefined, label: string, value: number | null, maxPoints = 30) {
  if (!chart) return;
  chart.data.labels!.push(label);
  (chart.data.datasets[0].data as (number | null)[]).push(value);
  if (chart.data.labels!.length > maxPoints) {
    chart.data.labels!.shift();
    chart.data.datasets[0].data.shift();
  }
  chart.update();
}

/* =========================
   POLLING + RENDER
   ========================= */

async function tick(ctrl?: AbortController) {
  try {
    const xml = await fetchXML(ctrl?.signal);

    // estado geral
    const avail = txt(findFirst(xml, "Availability"));
    const exec = txt(findByTagAndName(xml, "Execution", "execution"));
    const mode = txt(findByTagAndName(xml, "ControllerMode", "mode"));
    const estop = txt(findFirst(xml, "EmergencyStop"));
    const updated = findFirst(xml, "Header")?.getAttribute("creationTime") ?? "";

    setBadge($("avail"), avail);
    setBadge($("exec"), exec);
    setBadge($("mode"), mode);
    setBadge($("estop"), estop);
    $("updated").textContent = updated ? `Atualizado: ${updated}` : "—";

    // spindle
    const tempS2 = safeNum(txt(findByTagAndName(xml, "Temperature", "S2temp")), ["UNAVAILABLE"]);
    const tempS  = safeNum(txt(findByTagAndName(xml, "Temperature", "Stemp")), ["UNAVAILABLE"]);
    const temp   = tempS2 ?? tempS;
    $("temp").textContent = temp == null ? "–" : `${temp.toFixed(1)}`;

    const angleC  = safeNum(txt(findByTagAndName(xml, "Angle", "Cpos")));
    const angleC2 = safeNum(txt(findByTagAndName(xml, "Angle", "C2pos")));
    const angle   = angleC ?? angleC2 ?? null;
    $("angle").textContent = formatMaybeNumber(angle, 4);

    const rpm  = safeNum(txt(findByTagAndName(xml, "RotaryVelocity", "Srpm")));
    const rpm2 = safeNum(txt(findByTagAndName(xml, "RotaryVelocity", "S2rpm")));
    const rpmVal = rpm ?? rpm2 ?? null;
    $("rpm").textContent = formatMaybeNumber(rpmVal, 0);

    const sovr = safeNum(txt(findByTagAndName(xml, "RotaryVelocityOverride", "Sovr")));
    $("sovr").textContent = formatMaybeNumber(sovr, 0);

    const fovr   = safeNum(txt(findByTagAndName(xml, "PathFeedrateOverride", "Fovr")));
    const frapid = safeNum(txt(findByTagAndName(xml, "PathFeedrateOverride", "Frapidovr")));
    $("fovr").textContent = formatMaybeNumber(fovr, 0);
    $("frapid").textContent = formatMaybeNumber(frapid, 0);

    // porta
    const door = txt(findByTagAndName(xml, "DoorState", "doorstate"));
    $("door").textContent = door ?? "–";

    // eixos
    const xpos = safeNum(txt(findByTagAndName(xml, "Position", "Xpos")));
    const zpos = safeNum(txt(findByTagAndName(xml, "Position", "Zpos")));
    $("xpos").textContent = formatMaybeNumber(xpos, 4);
    $("zpos").textContent = formatMaybeNumber(zpos, 4);

    // programa + contagem
    $("program").textContent = txt(findByTagAndName(xml, "Program", "program")) ?? "–";
    const pc = safeNum(txt(findByTagAndName(xml, "PartCount", "PartCountAct")));
    $("partcount").textContent = pc == null ? "–" : String(pc);

    // gráficos
    const tLabel = new Date().toLocaleTimeString();
    addData(charts.temp,  tLabel, temp);
    addData(charts.angle, tLabel, angle);
    addData(charts.rpm,   tLabel, rpmVal);
    addData(charts.x,     tLabel, xpos);
    addData(charts.z,     tLabel, zpos);

  } catch (err: any) {
    console.error(err);
    setBadge($("avail"), "OFFLINE");
    $("updated").textContent = "Erro ao atualizar";
  }
}

function startPolling() {
  let current: AbortController | null = null;
  tick();
  setInterval(() => {
    current?.abort();
    current = new AbortController();
    tick(current);
  }, POLL_MS);
}

document.addEventListener("DOMContentLoaded", () => {
  initCharts();
  startPolling();
});