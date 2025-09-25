// src/main.ts
import {
  Chart,
  Title,                 // << título
  LineController,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Tooltip,
  Legend,
} from 'chart.js';

// registra tudo, inclusive Title
Chart.register(
  Title,
  LineController,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Tooltip,
  Legend
);

// defaults globais bonitões
Chart.defaults.font.size = 16;
Chart.defaults.font.weight = 'bold';
Chart.defaults.plugins.title.display = true;
Chart.defaults.plugins.title.color = '#d7e3ee';
Chart.defaults.plugins.title.font = { size: 28, weight: '700' } as any;

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

// auto-scale inteligente do eixo Y
function autoscaleY(chart: Chart, padding = 0.08, minSpan = 1) {
  const data = (chart.data.datasets[0].data as (number | null)[])
    .filter((v): v is number => v != null);
  if (!data.length) return;

  let lo = Math.min(...data);
  let hi = Math.max(...data);

  if (hi - lo < minSpan) {
    const mid = (hi + lo) / 2;
    const half = Math.max(minSpan / 2, Math.abs(mid) * padding);
    lo = mid - half;
    hi = mid + half;
  } else {
    const span = hi - lo;
    const pad = span * padding;
    lo -= pad;
    hi += pad;
  }

  const y = (chart.options.scales!.y as any);
  y.min = lo;
  y.max = hi;
  y.ticks = {
    ...(y.ticks ?? {}),
    maxTicksLimit: 6,
    precision: 2,
  };
}

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
    maintainAspectRatio: true,
    layout: {
      padding: { top: 30, left: 20, right: 20, bottom: 10 } // ↑ espaço extra pros títulos
    },
    scales: {
      x: {
        ticks: {
          color: '#93a1ad',
          font: { size: 28, weight: 600 }  // aumenta
        },
        grid: { color: 'rgba(255,255,255,0.05)' }
      },
      y: {
        grace: '5%',
        ticks: {
          color: '#93a1ad',
          font: { size: 28, weight: 600 }, // aumenta
          maxTicksLimit: 6,
        },
        grid: { color: 'rgba(255,255,255,0.05)' }
      },
    },
    plugins: {
      title: {
        display: true,
        text: label,
        color: '#d7e3ee',
        font: { size: 40, weight: 900 },   // bem maior
        padding: { top: 0, bottom: 20 },     // ↑ distância do eixo Y
        align: 'center'                      // centraliza (ou 'start' se preferir à esquerda)
      },
      legend: {
        display: false
      },
      tooltip: {
        titleFont: { size: 28, weight: 700 },
        bodyFont:  { size: 26 }
      }
    }
  }
  });
}

// addData com auto-scale e janela máxima
function addData(
  chart: Chart | undefined,
  label: string,
  value: number | null,
  maxPoints = 60,
  minSpan = 1
) {
  if (!chart) return;
  chart.data.labels!.push(label);
  (chart.data.datasets[0].data as (number | null)[]).push(value);
  if (chart.data.labels!.length > maxPoints) {
    chart.data.labels!.shift();
    chart.data.datasets[0].data.shift();
  }
  autoscaleY(chart, 0.08, minSpan);
  chart.update();
}

function initCharts() {
  charts.temp  = makeLineChart('chartTemp',  'Temperatura (°C)', '#ff5c5c');
  charts.angle = makeLineChart('chartAngle', 'Ângulo C (°)',     '#f5a623');
  charts.rpm   = makeLineChart('chartRpm',   'RPM',              '#1db954');
  charts.x     = makeLineChart('chartX',     'Posição X (mm)',   '#4a90e2');
  charts.z     = makeLineChart('chartZ',     'Posição Z (mm)',   '#bd10e0');
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

    // gráficos (com janelas mínimas por métrica)
    const tLabel = new Date().toLocaleTimeString();
    addData(charts.temp,  tLabel, temp,   60, 0.5); // 0.5 °C
    addData(charts.angle, tLabel, angle,  60, 1);   // 1°
    addData(charts.rpm,   tLabel, rpmVal, 60, 10);  // 10 RPM
    addData(charts.x,     tLabel, xpos,   60, 1);   // 1 mm
    addData(charts.z,     tLabel, zpos,   60, 1);

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