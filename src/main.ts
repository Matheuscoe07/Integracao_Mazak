const ENDPOINT = "/api/current";
const POLL_MS = 2000;

type Maybe = string | null;

function $(id: string) {
  return document.getElementById(id)!;
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

  // Heurísticas simples pra badges “sem surto”
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

async function tick(ctrl?: AbortController) {
  try {
    const xml = await fetchXML(ctrl?.signal);

    // ——— Cabeçalho/estado geral
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

    // ——— Spindle/C (temperatura, ângulo, rpm, override)
    // Temperatura: prioriza S2temp (C2), senão Stemp (S)
    const tempS2 = safeNum(txt(findByTagAndName(xml, "Temperature", "S2temp")), ["UNAVAILABLE"]);
    const tempS = safeNum(txt(findByTagAndName(xml, "Temperature", "Stemp")), ["UNAVAILABLE"]);
    const temp = tempS2 ?? tempS;
    $("temp").textContent = temp == null ? "–" : `${temp.toFixed(1)}`;

    // Ângulo: tenta Cpos (absoluto do C), senão C2pos
    const angleC = safeNum(txt(findByTagAndName(xml, "Angle", "Cpos")));
    const angleC2 = safeNum(txt(findByTagAndName(xml, "Angle", "C2pos")));
    $("angle").textContent = formatMaybeNumber(angleC ?? angleC2, 4);

    // RPM: RotaryVelocity Srpm (C), senão S2rpm
    const rpm = safeNum(txt(findByTagAndName(xml, "RotaryVelocity", "Srpm")));
    const rpm2 = safeNum(txt(findByTagAndName(xml, "RotaryVelocity", "S2rpm")));
    $("rpm").textContent = formatMaybeNumber(rpm ?? rpm2, 0);

    // Overrides
    const sovr = safeNum(txt(findByTagAndName(xml, "RotaryVelocityOverride", "Sovr")));
    $("sovr").textContent = formatMaybeNumber(sovr, 0);

    const fovr = safeNum(txt(findByTagAndName(xml, "PathFeedrateOverride", "Fovr")));
    const frapid = safeNum(txt(findByTagAndName(xml, "PathFeedrateOverride", "Frapidovr")));
    $("fovr").textContent = formatMaybeNumber(fovr, 0);
    $("frapid").textContent = formatMaybeNumber(frapid, 0);

    // ——— Porta
    const door = txt(findByTagAndName(xml, "DoorState", "doorstate"));
    $("door").textContent = door ?? "–";

    // ——— Posições X/Z (subType ACTUAL)
    const xpos = safeNum(txt(findByTagAndName(xml, "Position", "Xpos")));
    const zpos = safeNum(txt(findByTagAndName(xml, "Position", "Zpos")));
    $("xpos").textContent = formatMaybeNumber(xpos, 4);
    $("zpos").textContent = formatMaybeNumber(zpos, 4);

    // ——— Programa + Part Count
    $("program").textContent = txt(findByTagAndName(xml, "Program", "program")) ?? "–";
    const pc = safeNum(txt(findByTagAndName(xml, "PartCount", "PartCountAct")));
    $("partcount").textContent = pc == null ? "–" : String(pc);

  } catch (err) {
    console.error(err);
    // feedback leve no header
    setBadge($("avail"), "OFFLINE");
    $("updated").textContent = "Erro ao atualizar";
  }
}

function startPolling() {
  let current: AbortController | null = null;
  tick(); // primeira
  setInterval(() => {
    current?.abort(); // cancela requisição anterior se ainda pendente
    current = new AbortController();
    tick(current);
  }, POLL_MS);
}

document.addEventListener("DOMContentLoaded", startPolling);