// Fixed, administrator-triggered measurements of the local kiosk only.
export async function diagnoseKiosk() {
  const version = await fetch("http://127.0.0.1:9222/json/version", { signal: AbortSignal.timeout(3000) }).then(r => r.json());
  const endpoint = new URL(version.webSocketDebuggerUrl);
  if (endpoint.hostname !== "127.0.0.1" || endpoint.port !== "9222") throw new Error("Unexpected local debugger endpoint");
  const socket = new WebSocket(endpoint);
  const pending = new Map();
  let sequence = 0;
  let trace = [];
  let traceDone;
  socket.addEventListener("message", ({ data }) => {
    const message = JSON.parse(data);
    if (message.id) {
      const request = pending.get(message.id);
      if (!request) return;
      pending.delete(message.id);
      clearTimeout(request.timer);
      if (message.error) request.reject(new Error(message.error.message));
      else request.resolve(message.result);
    }
    if (message.method === "Tracing.dataCollected") trace.push(...message.params.value);
    if (message.method === "Tracing.tracingComplete") traceDone?.();
  });
  const command = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Diagnostic timeout: ${method}`)); }, 20000);
    pending.set(id, { resolve, reject, timer });
    socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
  let session;
  let tracing = false;
  const evaluate = async expression => {
    const result = await command("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }, session);
    if (result.exceptionDetails) throw new Error("Kiosk diagnostic script failed");
    return result.result.value;
  };
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Local debugger unavailable")), 3000);
      socket.addEventListener("open", () => { clearTimeout(timer); resolve(); }, { once: true });
      socket.addEventListener("error", () => { clearTimeout(timer); reject(new Error("Local debugger connection failed")); }, { once: true });
    });
    const { gpu } = await command("SystemInfo.getInfo");
    const { targetInfos } = await command("Target.getTargets");
    const target = targetInfos.find(t => t.type === "page" && t.url === "http://127.0.0.1:8099/");
    if (!target) throw new Error("Local kiosk page not found");
    session = (await command("Target.attachToTarget", { targetId: target.targetId, flatten: true })).sessionId;
    const viewport = await evaluate(`(() => {
      if (document.querySelector('dialog[open]')) throw new Error('Close kiosk dialogs before measuring');
      const track = document.querySelector('.page-track');
      if (!track) throw new Error('Missing pager');
      if (document.querySelector('.standby')) document.querySelector('.kiosk').click();
      window.__kioskDiagnosticScroll = track.scrollLeft;
      window.dispatchEvent(new PointerEvent('pointerdown'));
      return {width:innerWidth,height:innerHeight,dpr:devicePixelRatio};
    })()`);
    const measurements = [];
    for (const variant of ["dashboard", "minimal", "dashboard"]) {
      await evaluate(`(() => {
        document.getElementById('kiosk-diagnostic-style')?.remove();
        ${variant === "minimal" ? "const style=document.createElement('style');style.id='kiosk-diagnostic-style';style.textContent='.dashboard-page>*{visibility:hidden!important}.dashboard-page{background:#222}';document.head.append(style);" : ""}
        const track=document.querySelector('.page-track');track.scrollTo({left:track.clientWidth,behavior:'instant'});
        return new Promise(resolve=>setTimeout(resolve,700));
      })()`);
      trace = [];
      await command("Tracing.start", { categories: "devtools.timeline,disabled-by-default-devtools.timeline,disabled-by-default-devtools.timeline.frame,cc", transferMode: "ReportEvents" });
      tracing = true;
      await command("Input.synthesizeScrollGesture", { x: Math.round(viewport.width * 0.85), y: Math.round(viewport.height * 0.5), xDistance: -Math.round(viewport.width * 0.75), yDistance: 0, speed: 700, gestureSourceType: "touch", preventFling: true }, session);
      await evaluate("new Promise(resolve=>setTimeout(resolve,400))");
      const completed = new Promise(resolve => { traceDone = resolve; });
      await command("Tracing.end");
      await Promise.race([completed, new Promise((_, reject) => { const timer=setTimeout(()=>reject(new Error('Trace completion timeout')),5000); timer.unref(); })]);
      tracing = false;
      const work = {};
      for (const name of ["Layout", "Paint", "RasterTask", "RunTask"]) {
        const durations = trace.filter(e => e.name === name && e.ph === "X").map(e => (e.dur || 0) / 1000);
        work[name] = { count: durations.length, totalMs: durations.reduce((a,b)=>a+b,0), maxMs: Math.max(0,...durations) };
      }
      const draws = [...new Set(trace.filter(e => e.name === "DrawFrame").map(e => e.ts))].sort((a,b)=>a-b);
      const intervals = draws.slice(1).map((t,i)=>(t-draws[i])/1000).sort((a,b)=>a-b);
      measurements.push({ variant, work, draws: draws.length, drawIntervalP95Ms: intervals[Math.floor(intervals.length*0.95)] ?? null, intervalsOver25Ms: intervals.filter(t=>t>25).length });
    }
    return { browser: version.Browser, viewport, gpu: { devices: gpu.devices, featureStatus: gpu.featureStatus, auxAttributes: Object.fromEntries(Object.entries(gpu.auxAttributes || {}).filter(([key]) => /^(glRenderer|glVendor|glVersion|displayType|passthroughCmdDecoder|sandboxed|inProcessGpu)$/.test(key))) }, measurements };
  } finally {
    if (tracing) await command("Tracing.end").catch(()=>{});
    if (session) {
      await evaluate(`(() => {document.getElementById('kiosk-diagnostic-style')?.remove();const track=document.querySelector('.page-track');if(track && Number.isFinite(window.__kioskDiagnosticScroll))track.scrollTo({left:window.__kioskDiagnosticScroll,behavior:'instant'});delete window.__kioskDiagnosticScroll;})()`).catch(()=>{});
      await command("Target.detachFromTarget", { sessionId: session }).catch(()=>{});
    }
    for (const request of pending.values()) { clearTimeout(request.timer); request.reject(new Error("Diagnostic connection closed")); }
    socket.close();
  }
}
