/* ============================================================
   graphs.js — Four interactive physics graphs.

     1. Fuel Remaining vs Perceived Time (rocket proper time τ)
     2. Earth Time vs Perceived Time
     3. Distance from Earth vs Speed (β)
     4. Time Dilation Factor (γ) vs Earth Time

   All graphs render in SI-ish natural units (ly, yr, c=1) and
   show a live "now" marker that tracks the current sim time.

   Graphs compute data from the first rocket in the scene (rocket[0]).
   If no rocket has a valid trip, graphs show a neutral placeholder.
   ============================================================ */
(function () {
  'use strict';

  const NS = window.SpaceTravel = window.SpaceTravel || {};
  const P = NS.Physics;
  const S = NS.Scenarios;

  const BG = '#060612';
  const AXIS = 'rgba(255,255,255,0.25)';
  const GRID = 'rgba(255,255,255,0.07)';
  const LABEL = 'rgba(220,230,255,0.85)';
  const NOW_LINE = 'rgba(255, 200, 80, 0.75)';
  const REF_LINE = 'rgba(0, 217, 255, 0.35)';

  // ---------- Shared helpers ----------

  function prepareCanvas(canvas) {
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, W: rect.width, H: rect.height };
  }

  function niceStep(range, targetCount) {
    const raw = range / targetCount;
    if (raw <= 0 || !isFinite(raw)) return 1;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const norm = raw / mag;
    if (norm < 1.5) return 1 * mag;
    if (norm < 3.5) return 2 * mag;
    if (norm < 7.5) return 5 * mag;
    return 10 * mag;
  }

  // Draw axes, grid, and labels. Returns helpers for plotting.
  function drawAxes(ctx, W, H, margin, xRange, yRange, xLabel, yLabel, opts) {
    opts = opts || {};
    const [xmin, xmax] = xRange;
    const [ymin, ymax] = yRange;
    const plotW = W - margin.l - margin.r;
    const plotH = H - margin.t - margin.b;
    const xToPx = (x) => margin.l + (x - xmin) / (xmax - xmin) * plotW;
    const yToPx = (y) => margin.t + plotH - (y - ymin) / (ymax - ymin) * plotH;

    const xStep = opts.xStep || niceStep(xmax - xmin, 5);
    const yStep = opts.yStep || niceStep(ymax - ymin, 4);

    ctx.save();
    ctx.strokeStyle = GRID;
    ctx.lineWidth = 1;
    ctx.font = '10px Consolas, monospace';
    ctx.fillStyle = LABEL;

    ctx.textAlign = 'center';
    const x0 = Math.ceil(xmin / xStep) * xStep;
    for (let x = x0; x <= xmax + 1e-9; x += xStep) {
      const px = Math.round(xToPx(x)) + 0.5;
      ctx.beginPath();
      ctx.moveTo(px, margin.t); ctx.lineTo(px, margin.t + plotH);
      ctx.stroke();
      ctx.fillText(opts.xFormat ? opts.xFormat(x) : fmt(x), px, margin.t + plotH + 14);
    }
    ctx.textAlign = 'right';
    const y0 = Math.ceil(ymin / yStep) * yStep;
    for (let y = y0; y <= ymax + 1e-9; y += yStep) {
      const py = Math.round(yToPx(y)) + 0.5;
      ctx.beginPath();
      ctx.moveTo(margin.l, py); ctx.lineTo(margin.l + plotW, py);
      ctx.stroke();
      ctx.fillText(opts.yFormat ? opts.yFormat(y) : fmt(y), margin.l - 4, py + 3);
    }

    ctx.strokeStyle = AXIS;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(margin.l, margin.t); ctx.lineTo(margin.l, margin.t + plotH);
    ctx.lineTo(margin.l + plotW, margin.t + plotH);
    ctx.stroke();

    ctx.fillStyle = LABEL;
    ctx.textAlign = 'center';
    ctx.font = '11px "Segoe UI", sans-serif';
    ctx.fillText(xLabel, margin.l + plotW / 2, H - 4);
    ctx.save();
    ctx.translate(12, margin.t + plotH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(yLabel, 0, 0);
    ctx.restore();
    ctx.restore();

    return { xToPx, yToPx, plotW, plotH, margin };
  }

  function fmt(v) {
    const a = Math.abs(v);
    if (a === 0) return '0';
    if (a >= 1000) return v.toFixed(0);
    if (a >= 10) return v.toFixed(1);
    if (a >= 1) return v.toFixed(2);
    if (a >= 0.01) return v.toFixed(3);
    return v.toExponential(1);
  }

  function emptyMessage(ctx, W, H, msg) {
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = LABEL;
    ctx.font = '12px "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(msg, W / 2, H / 2);
  }

  // Mass formatter — uses celestial-body units once mass gets absurd.
  const SOLAR_MASS  = 1.989e30;
  const JUPITER_MASS= 1.898e27;
  const EARTH_MASS  = 5.972e24;
  const MOON_MASS   = 7.342e22;
  function formatMass(kg) {
    if (!isFinite(kg)) return '∞';
    if (kg <= 0) return '0 kg';
    if (kg >= SOLAR_MASS * 1e6)  return (kg / SOLAR_MASS).toExponential(2) + ' M☉';
    if (kg >= SOLAR_MASS * 0.1)  return (kg / SOLAR_MASS).toFixed(2) + ' M☉';
    if (kg >= JUPITER_MASS * 0.1) return (kg / JUPITER_MASS).toFixed(2) + ' M♃';
    if (kg >= EARTH_MASS * 0.1)  return (kg / EARTH_MASS).toFixed(2) + ' M⊕';
    if (kg >= MOON_MASS * 0.1)   return (kg / MOON_MASS).toFixed(2) + ' Moons';
    if (kg >= 1e15) return (kg / 1e12).toExponential(2) + ' Gt';
    if (kg >= 1e12) return (kg / 1e12).toFixed(2) + ' Gt';
    if (kg >= 1e9)  return (kg / 1e9).toFixed(2) + ' Mt';
    if (kg >= 1e6)  return (kg / 1e6).toFixed(2) + ' kt';
    if (kg >= 1e3)  return (kg / 1e3).toFixed(2) + ' t';
    return kg.toFixed(0) + ' kg';
  }

  // Get the primary rocket (index 0) or null
  function primaryRocket(scene) {
    return (scene.rockets && scene.rockets.length > 0 && scene.rockets[0].trip)
      ? scene.rockets[0] : null;
  }

  // Sample N evenly over a phase; skip phases not occupied
  function sampleTrip(rocket, N) {
    const samples = [];
    const trip = rocket.trip;
    for (let i = 0; i <= N; i++) {
      const frac = i / N;
      const t = rocket.launchTime + frac * trip.tTotal;
      const state = P.rocketState(trip, t - rocket.launchTime);
      samples.push({
        t,
        tau: state.tau,
        x: state.x,
        v: state.v,
        gamma: state.gamma,
      });
    }
    return samples;
  }

  // ==========================================================
  //  Graph 1: Fuel Remaining vs Perceived Time
  // ==========================================================
  function renderFuel(canvas, scene, currentTime, readoutEl) {
    const { ctx, W, H } = prepareCanvas(canvas);
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, W, H);

    const rocket = primaryRocket(scene);
    if (!rocket) { emptyMessage(ctx, W, H, 'No rocket to plot'); return; }

    const prop = P.propulsionById(rocket.propulsionId);
    const trip = rocket.trip;
    const tauMax = trip.tauTotal;

    const fuelAtStart = P.fuelStateAt(trip, prop.v_ex, rocket.dryMassKg, 0);
    const initialFuel = fuelAtStart.fuelMass;

    if (!isFinite(initialFuel) || initialFuel <= 0) {
      emptyMessage(ctx, W, H, 'Mass ratio is infinite with this propulsion');
      if (readoutEl) readoutEl.textContent = '';
      return;
    }

    const margin = { l: 50, r: 14, t: 12, b: 34 };
    const axes = drawAxes(
      ctx, W, H, margin, [0, tauMax], [0, 100],
      'perceived time τ (yr, on rocket)', 'fuel remaining (%)',
      { yStep: 25, yFormat: y => y.toFixed(0) + '%' }
    );

    // Curve
    ctx.save();
    ctx.strokeStyle = rocket.color;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    const N = 200;
    for (let i = 0; i <= N; i++) {
      const tau = (i / N) * tauMax;
      const f = P.fuelStateAt(trip, prop.v_ex, rocket.dryMassKg, tau);
      const pct = f.fuelFraction * 100;
      const px = axes.xToPx(tau);
      const py = axes.yToPx(pct);
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.stroke();
    ctx.restore();

    // Shade under the curve (light)
    ctx.save();
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = rocket.color;
    ctx.beginPath();
    ctx.moveTo(axes.xToPx(0), axes.yToPx(0));
    for (let i = 0; i <= N; i++) {
      const tau = (i / N) * tauMax;
      const f = P.fuelStateAt(trip, prop.v_ex, rocket.dryMassKg, tau);
      ctx.lineTo(axes.xToPx(tau), axes.yToPx(f.fuelFraction * 100));
    }
    ctx.lineTo(axes.xToPx(tauMax), axes.yToPx(0));
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // Now marker
    const dt = currentTime - rocket.launchTime;
    if (dt >= 0 && dt <= trip.tTotal) {
      const stNow = P.rocketState(trip, dt);
      const fNow = P.fuelStateAt(trip, prop.v_ex, rocket.dryMassKg, stNow.tau);
      const px = axes.xToPx(stNow.tau);
      const py = axes.yToPx(fNow.fuelFraction * 100);
      // Vertical now line
      ctx.strokeStyle = NOW_LINE;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.moveTo(px, margin.t); ctx.lineTo(px, margin.t + axes.plotH);
      ctx.stroke();
      ctx.setLineDash([]);
      // Dot
      ctx.fillStyle = rocket.color;
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(px, py, 5.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      // Readout
      if (readoutEl) {
        readoutEl.innerHTML =
          `<span class="mono">${fNow.fuelMass > 0 ? formatMass(fNow.fuelMass) : '0 kg'}</span>` +
          ` remaining of <span class="mono">${formatMass(initialFuel)}</span> ` +
          `(${prop.name})`;
      }
    } else if (readoutEl) {
      readoutEl.innerHTML =
        `Initial fuel: <span class="mono">${formatMass(initialFuel)}</span> ` +
        `· dry mass <span class="mono">${formatMass(rocket.dryMassKg)}</span> ` +
        `· ${prop.name}`;
    }
  }

  // ==========================================================
  //  Graph 2: Earth Time vs Perceived Time
  // ==========================================================
  function renderTimeDilation(canvas, scene, currentTime) {
    const { ctx, W, H } = prepareCanvas(canvas);
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, W, H);

    const rocket = primaryRocket(scene);
    if (!rocket) { emptyMessage(ctx, W, H, 'No rocket to plot'); return; }
    const trip = rocket.trip;

    const tauMax = trip.tauTotal;
    const tMax = trip.tTotal;

    const margin = { l: 50, r: 14, t: 12, b: 34 };
    const axes = drawAxes(
      ctx, W, H, margin, [0, tauMax], [0, tMax],
      'perceived time τ (yr, on rocket)', 'Earth time t (yr)'
    );

    // 45° reference line (τ = t)
    ctx.save();
    ctx.strokeStyle = REF_LINE;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    const maxEq = Math.min(tauMax, tMax);
    ctx.moveTo(axes.xToPx(0), axes.yToPx(0));
    ctx.lineTo(axes.xToPx(maxEq), axes.yToPx(maxEq));
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = REF_LINE;
    ctx.font = '10px "Segoe UI", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('τ = t (no relativity)', axes.xToPx(maxEq) - 120, axes.yToPx(maxEq) - 6);
    ctx.restore();

    // Actual curve: for each τ, find Earth t
    ctx.save();
    ctx.strokeStyle = rocket.color;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    const N = 200;
    for (let i = 0; i <= N; i++) {
      const tau = (i / N) * tauMax;
      const t = P.coordTimeFromProperTime(trip, tau);
      const px = axes.xToPx(tau);
      const py = axes.yToPx(t);
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.stroke();
    ctx.restore();

    // Now marker
    const dt = currentTime - rocket.launchTime;
    if (dt >= 0 && dt <= trip.tTotal) {
      const stNow = P.rocketState(trip, dt);
      const px = axes.xToPx(stNow.tau);
      const py = axes.yToPx(dt);
      ctx.strokeStyle = NOW_LINE;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.moveTo(px, margin.t); ctx.lineTo(px, margin.t + axes.plotH);
      ctx.moveTo(margin.l, py); ctx.lineTo(margin.l + axes.plotW, py);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = rocket.color;
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(px, py, 5.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }

  // ==========================================================
  //  Graph 3: Distance from Earth vs Speed (β)
  // ==========================================================
  function renderDistanceSpeed(canvas, scene, currentTime) {
    const { ctx, W, H } = prepareCanvas(canvas);
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, W, H);

    const rocket = primaryRocket(scene);
    if (!rocket) { emptyMessage(ctx, W, H, 'No rocket to plot'); return; }
    const trip = rocket.trip;

    const D = trip.D;
    const yMax = Math.min(1, Math.max(0.05, trip.vMax * 1.1));

    const margin = { l: 50, r: 14, t: 12, b: 34 };
    const axes = drawAxes(
      ctx, W, H, margin, [0, D], [0, yMax],
      'distance from Earth (ly)', 'β (speed / c)',
      { yStep: niceStep(yMax, 4) }
    );

    // Plot β vs x along the trajectory
    ctx.save();
    ctx.strokeStyle = rocket.color;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    const N = 240;
    for (let i = 0; i <= N; i++) {
      const t = (i / N) * trip.tTotal;
      const s = P.rocketState(trip, t);
      const px = axes.xToPx(s.x);
      const py = axes.yToPx(s.v);
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.stroke();
    ctx.restore();

    // Now marker
    const dt = currentTime - rocket.launchTime;
    if (dt >= 0 && dt <= trip.tTotal) {
      const s = P.rocketState(trip, dt);
      const px = axes.xToPx(s.x);
      const py = axes.yToPx(s.v);
      ctx.strokeStyle = NOW_LINE;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.moveTo(px, margin.t); ctx.lineTo(px, margin.t + axes.plotH);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = rocket.color;
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(px, py, 5.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      // Label current x and β
      ctx.fillStyle = '#e8ecff';
      ctx.font = '10px Consolas, monospace';
      ctx.textAlign = 'left';
      const readX = Math.min(px + 8, margin.l + axes.plotW - 90);
      ctx.fillText(`x=${s.x.toFixed(2)} ly`, readX, margin.t + 12);
      ctx.fillText(`β=${s.v.toFixed(3)}`, readX, margin.t + 24);
    }

    // Annotate peak
    const peakX = (trip.type === 'coast') ? trip.dAccel : trip.D / 2;
    const peakBeta = trip.vMax;
    ctx.fillStyle = 'rgba(0, 217, 255, 0.5)';
    ctx.font = '10px Consolas, monospace';
    ctx.textAlign = 'center';
    const ppx = axes.xToPx(peakX);
    const ppy = axes.yToPx(peakBeta);
    ctx.fillText(`peak β ${peakBeta.toFixed(3)}`, ppx, ppy - 6);
  }

  // ==========================================================
  //  Graph 4: Time Dilation Factor (γ) vs Earth Time
  // ==========================================================
  function renderGamma(canvas, scene, currentTime) {
    const { ctx, W, H } = prepareCanvas(canvas);
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, W, H);

    const rocket = primaryRocket(scene);
    if (!rocket) { emptyMessage(ctx, W, H, 'No rocket to plot'); return; }
    const trip = rocket.trip;

    const tMax = trip.tTotal;
    const gammaMax = Math.max(1.1, trip.gammaMax * 1.08);

    const margin = { l: 50, r: 14, t: 12, b: 34 };
    const axes = drawAxes(
      ctx, W, H, margin, [0, tMax], [1, gammaMax],
      'Earth time t (yr)', 'γ (time dilation factor)'
    );

    // Reference γ = 1 baseline
    ctx.save();
    ctx.strokeStyle = REF_LINE;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(axes.xToPx(0), axes.yToPx(1));
    ctx.lineTo(axes.xToPx(tMax), axes.yToPx(1));
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = REF_LINE;
    ctx.font = '10px "Segoe UI", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('γ = 1 (no dilation)', axes.xToPx(0) + 4, axes.yToPx(1) - 4);
    ctx.restore();

    // Curve
    ctx.save();
    ctx.strokeStyle = rocket.color;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    const N = 240;
    for (let i = 0; i <= N; i++) {
      const t = (i / N) * tMax;
      const s = P.rocketState(trip, t);
      const px = axes.xToPx(t);
      const py = axes.yToPx(s.gamma);
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.stroke();
    ctx.restore();

    // Now marker
    const dt = currentTime - rocket.launchTime;
    if (dt >= 0 && dt <= trip.tTotal) {
      const s = P.rocketState(trip, dt);
      const px = axes.xToPx(dt);
      const py = axes.yToPx(s.gamma);
      ctx.strokeStyle = NOW_LINE;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.moveTo(px, margin.t); ctx.lineTo(px, margin.t + axes.plotH);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = rocket.color;
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(px, py, 5.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#e8ecff';
      ctx.font = '10px Consolas, monospace';
      ctx.textAlign = 'left';
      const readX = Math.min(px + 8, margin.l + axes.plotW - 70);
      ctx.fillText(`γ=${s.gamma.toFixed(3)}`, readX, margin.t + 12);
    }
  }

  // ---------- Controller ----------
  function createGraphs(refs) {
    // refs: { fuel, timedilation, distspeed, gamma, fuelReadout? }
    let _lastScene, _lastTime, _lastPersp;
    function render(scene, t, p) {
      _lastScene = scene; _lastTime = t; _lastPersp = p;
      renderFuel(refs.fuel, scene, t, refs.fuelReadout);
      renderTimeDilation(refs.timedilation, scene, t);
      renderDistanceSpeed(refs.distspeed, scene, t);
      renderGamma(refs.gamma, scene, t);
    }
    window.addEventListener('resize', () => {
      if (_lastScene) render(_lastScene, _lastTime, _lastPersp);
    });
    return { render };
  }

  NS.Graphs = { createGraphs, formatMass };
})();
