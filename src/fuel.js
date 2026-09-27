/* ============================================================
   fuel.js — Fuel calculator + mass-ratio chart.

   Inputs (SI where relevant):
     - distance (ly)
     - peak β (v/c)
     - proper acceleration (g)
     - propulsion (from PROPULSION catalog → exhaust velocity)
     - ship dry mass (kg)
     - trip type: 1, 2, or 4 maneuvers

   Outputs:
     - Mass ratio (single-burn and full-trip)
     - Fuel mass
     - Total wet mass
     - Trip time (Earth frame & on-board)
     - Kinetic energy of payload at peak speed
     - Scale comparisons (Hiroshima bombs etc.)

   Physics lives in NS.Physics; this file is the UI + chart.
   ============================================================ */
(function () {
  'use strict';

  const NS = window.SpaceTravel = window.SpaceTravel || {};
  const P = NS.Physics;

  const HIROSHIMA_J = 6.3e13;     // ~15 kt
  const MEGATON_J   = 4.184e15;
  const SUN_SEC_J   = 3.828e26 * 1.0; // 1 sec of solar output

  function init() {
    const $ = (id) => document.getElementById(id);
    const el = {
      dist:    $('fuel-dist'),     distRO:  $('fuel-dist-readout'),
      beta:    $('fuel-beta'),     betaRO:  $('fuel-beta-readout'),
      accel:   $('fuel-accel'),    accelRO: $('fuel-accel-readout'),
      prop:    $('fuel-propulsion'),
      propNote:$('fuel-propulsion-note'),
      dryMass: $('fuel-drymass'),  dryMassRO: $('fuel-drymass-readout'),
      tripRadios: document.querySelectorAll('input[name="fuel-trip"]'),
      results: $('fuel-results'),
      chart:   $('fuel-chart'),
      exponent:$('fuel-exponent'),
    };

    // Populate propulsion dropdown
    for (const prop of P.PROPULSION) {
      const o = document.createElement('option');
      o.value = prop.id;
      o.textContent = prop.name;
      el.prop.appendChild(o);
    }
    el.prop.value = 'fusion'; // sensible default for interstellar discussion

    const state = {
      distLy: parseFloat(el.dist.value),
      beta: parseFloat(el.beta.value),
      aG: parseFloat(el.accel.value),
      propulsionId: el.prop.value,
      dryMassKg: parseFloat(el.dryMass.value),
      maneuvers: 2,
    };

    function propulsionOf(id) {
      return P.PROPULSION.find(p => p.id === id) || P.PROPULSION[0];
    }

    // ---------- Recompute ----------
    function recompute() {
      const prop = propulsionOf(state.propulsionId);
      const v = state.beta * P.C_MPS;
      const R_single = P.massRatioRelativistic(v, prop.v_ex);
      const R_trip = Math.pow(R_single, state.maneuvers);
      const fuel = P.fuelMass(state.dryMassKg, R_trip);
      const wetMass = state.dryMassKg + fuel;
      const Ekin = P.kineticEnergy(state.dryMassKg, v);

      // Trip time (best case assuming we can hit β given accel and distance)
      const aNat = state.aG * P.G_IN_NATURAL;        // ly/yr²
      const D = state.distLy;                         // ly
      const gammaPeak = 1 / Math.sqrt(1 - state.beta * state.beta);
      const dAccel = (1 / aNat) * (gammaPeak - 1);    // ly in launch frame
      let tTotal, tauTotal, feasible;
      if (2 * dAccel >= D) {
        // Can't reach the target β in half the distance at this accel.
        // Do a no-coast trip at the given accel; peak β will be lower than requested.
        const trip = P.planNoCoastTrip(aNat, D);
        tTotal = trip.tTotal;
        tauTotal = trip.tauTotal;
        feasible = 'partial';
      } else {
        const trip = P.planCoastTrip(aNat, D, state.beta);
        tTotal = trip.tTotal;
        tauTotal = trip.tauTotal;
        feasible = 'ok';
      }

      renderResults({
        R_single, R_trip, fuel, wetMass, Ekin,
        tTotal, tauTotal, feasible, prop, gammaPeak,
      });

      renderChart();

      el.exponent.textContent = state.maneuvers;
      el.propNote.textContent = `${prop.name} — v_ex = ${formatSpeed(prop.v_ex)} (${prop.note})`;
    }

    // ---------- Render results panel ----------
    function renderResults(r) {
      const ratioStr = (r.R_trip > 1e9) ? r.R_trip.toExponential(2) : r.R_trip.toFixed(r.R_trip < 10 ? 2 : 0);
      const fuelStr = formatMass(r.fuel);
      const wetStr = formatMass(r.wetMass);
      const Estr = r.Ekin.toExponential(2) + ' J';
      const hiroStr = formatBig(r.Ekin / HIROSHIMA_J) + ' Hiroshima bombs';
      const sunStr  = (r.Ekin / SUN_SEC_J > 0.001)
        ? formatBig(r.Ekin / SUN_SEC_J) + ' s of total solar output'
        : '';

      const tEarthStr = formatTime(r.tTotal);
      const tShipStr = formatTime(r.tauTotal);

      const feasNote = (r.feasible === 'partial')
        ? `<div class="fuel-result-hint">⚠ peak β not reachable at this accel/distance — trip uses pure no-coast and peaks below target.</div>`
        : '';

      // Warn about impractical mass ratios
      const ratioWarn = (r.R_trip > 1e6) ? ' warn' : '';

      el.results.innerHTML = `
        <div class="fuel-result">
          <div class="fuel-result-label">Mass ratio (full trip)</div>
          <div class="fuel-result-value${ratioWarn}">${ratioStr}×</div>
          <div class="fuel-result-hint">single burn: ${formatRatio(r.R_single)}× &nbsp;·&nbsp; ${state.maneuvers} burn${state.maneuvers>1?'s':''}</div>
        </div>
        <div class="fuel-result">
          <div class="fuel-result-label">Fuel mass</div>
          <div class="fuel-result-value${ratioWarn}">${fuelStr}</div>
          <div class="fuel-result-hint">wet mass: ${wetStr}</div>
        </div>
        <div class="fuel-result">
          <div class="fuel-result-label">Trip time — Earth frame</div>
          <div class="fuel-result-value">${tEarthStr}</div>
        </div>
        <div class="fuel-result">
          <div class="fuel-result-label">Trip time — on board</div>
          <div class="fuel-result-value">${tShipStr}</div>
          <div class="fuel-result-hint">γ at peak: ${r.gammaPeak.toFixed(2)}</div>
        </div>
        <div class="fuel-result">
          <div class="fuel-result-label">Payload kinetic energy</div>
          <div class="fuel-result-value">${Estr}</div>
          <div class="fuel-result-hint">≈ ${hiroStr}${sunStr ? '<br>≈ ' + sunStr : ''}</div>
        </div>
        <div class="fuel-result">
          <div class="fuel-result-label">Feasibility</div>
          <div class="fuel-result-value${ratioWarn}">${verdict(r.R_trip)}</div>
          ${feasNote}
        </div>
      `;
    }

    function verdict(R) {
      if (!isFinite(R) || R > 1e12) return 'impossible';
      if (R > 1e6) return 'absurd';
      if (R > 1e3) return 'extreme';
      if (R > 100) return 'hard';
      if (R > 10)  return 'plausible';
      return 'realistic';
    }

    // ---------- Render chart (mass ratio vs β for each propellant) ----------
    function renderChart() {
      const canvas = el.chart;
      const dpr = Math.max(1, window.devicePixelRatio || 1);
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      const ctx = canvas.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const W = rect.width, H = rect.height;

      ctx.fillStyle = '#060612';
      ctx.fillRect(0, 0, W, H);

      const margin = { l: 56, r: 20, t: 16, b: 36 };
      const plotW = W - margin.l - margin.r;
      const plotH = H - margin.t - margin.b;

      // Y axis is log10 of mass ratio, from 0 to some max
      const yMaxLog = 20;  // up to 10^20
      const yMinLog = 0;

      const xMin = 0, xMax = 0.999;

      const xToPx = (x) => margin.l + (x - xMin) / (xMax - xMin) * plotW;
      const yToPx = (logY) => margin.t + plotH - (logY - yMinLog) / (yMaxLog - yMinLog) * plotH;

      // Grid
      ctx.save();
      ctx.strokeStyle = 'rgba(255,255,255,0.07)';
      ctx.lineWidth = 1;
      ctx.fillStyle = 'rgba(220,230,255,0.85)';
      ctx.font = '10px Consolas, monospace';
      ctx.textAlign = 'right';
      for (let logy = yMinLog; logy <= yMaxLog; logy += 2) {
        const py = Math.round(yToPx(logy)) + 0.5;
        ctx.beginPath();
        ctx.moveTo(margin.l, py);
        ctx.lineTo(margin.l + plotW, py);
        ctx.stroke();
        const label = logy === 0 ? '1' : '10^' + logy;
        ctx.fillText(label, margin.l - 4, py + 3);
      }
      ctx.textAlign = 'center';
      for (let b = 0; b <= 0.9; b += 0.1) {
        const px = Math.round(xToPx(b)) + 0.5;
        ctx.beginPath();
        ctx.moveTo(px, margin.t);
        ctx.lineTo(px, margin.t + plotH);
        ctx.stroke();
        ctx.fillText(b.toFixed(1), px, margin.t + plotH + 14);
      }
      // Axes
      ctx.strokeStyle = 'rgba(255,255,255,0.25)';
      ctx.beginPath();
      ctx.moveTo(margin.l, margin.t);
      ctx.lineTo(margin.l, margin.t + plotH);
      ctx.lineTo(margin.l + plotW, margin.t + plotH);
      ctx.stroke();
      ctx.font = '11px "Segoe UI", sans-serif';
      ctx.fillStyle = 'rgba(220,230,255,0.85)';
      ctx.textAlign = 'center';
      ctx.fillText('peak β', margin.l + plotW / 2, H - 6);
      ctx.save();
      ctx.translate(14, margin.t + plotH / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.fillText('mass ratio (full trip, log scale)', 0, 0);
      ctx.restore();
      ctx.restore();

      // Lines per propellant
      const palette = {
        chemical: '#ff6b6b',
        nuclear:  '#ffa94d',
        ion:      '#ffd43b',
        vasimr:   '#a9e34b',
        orion:    '#63e6be',
        fusion:   '#4dabf7',
        antimatter:'#b197fc',
        photon:   '#ff8cc3',
      };

      for (const prop of P.PROPULSION) {
        ctx.save();
        const color = palette[prop.id] || '#e8ecff';
        const isCurrent = prop.id === state.propulsionId;
        ctx.strokeStyle = color;
        ctx.lineWidth = isCurrent ? 3 : 1.5;
        ctx.globalAlpha = isCurrent ? 1 : 0.55;
        ctx.beginPath();
        let started = false;
        for (let i = 0; i <= 200; i++) {
          const b = (i / 200) * xMax;
          const v = b * P.C_MPS;
          const R = Math.pow(P.massRatioRelativistic(v, prop.v_ex), state.maneuvers);
          const logR = Math.log10(R);
          if (!isFinite(logR) || logR < yMinLog) { started = false; continue; }
          const y = Math.min(logR, yMaxLog + 1);
          if (!started) { ctx.moveTo(xToPx(b), yToPx(y)); started = true; }
          else ctx.lineTo(xToPx(b), yToPx(y));
        }
        ctx.stroke();
        ctx.restore();
      }

      // Operating point marker
      const prop = propulsionOf(state.propulsionId);
      const R_trip = Math.pow(P.massRatioRelativistic(state.beta * P.C_MPS, prop.v_ex), state.maneuvers);
      const logR = Math.log10(R_trip);
      if (isFinite(logR)) {
        const y = Math.max(yMinLog, Math.min(yMaxLog, logR));
        ctx.fillStyle = '#ffd166';
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(xToPx(state.beta), yToPx(y), 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }

      // Legend
      ctx.save();
      ctx.font = '10px Consolas, monospace';
      ctx.textAlign = 'left';
      let lx = margin.l + 8, ly = margin.t + 14;
      for (const prop of P.PROPULSION) {
        const color = palette[prop.id] || '#e8ecff';
        const isCurrent = prop.id === state.propulsionId;
        ctx.fillStyle = color;
        ctx.globalAlpha = isCurrent ? 1 : 0.65;
        ctx.fillRect(lx, ly - 8, 10, 2);
        ctx.fillStyle = isCurrent ? '#e8ecff' : 'rgba(232,236,255,0.65)';
        ctx.fillText(prop.name, lx + 14, ly);
        ly += 14;
      }
      ctx.restore();
    }

    // ---------- Formatters ----------
    // Uses celestial-body units once the mass gets absurd.
    function formatMass(kg) {
      if (!isFinite(kg)) return '∞';
      if (kg <= 0) return '0 kg';
      const SUN = 1.989e30, JUPITER = 1.898e27, EARTH = 5.972e24, MOON = 7.342e22;
      if (kg >= SUN * 1e6)  return (kg / SUN).toExponential(2) + ' M☉';
      if (kg >= SUN * 0.1)  return (kg / SUN).toFixed(2) + ' solar masses';
      if (kg >= JUPITER * 0.1) return (kg / JUPITER).toFixed(2) + ' Jupiter masses';
      if (kg >= EARTH * 0.1) return (kg / EARTH).toFixed(2) + ' Earth masses';
      if (kg >= MOON * 0.1)  return (kg / MOON).toFixed(2) + ' Moon masses';
      if (kg >= 1e15) return (kg / 1e12).toExponential(2) + ' Gt';
      if (kg >= 1e12) return (kg / 1e12).toFixed(2) + ' Gt';
      if (kg >= 1e9)  return (kg / 1e9).toFixed(2)  + ' Mt';
      if (kg >= 1e6)  return (kg / 1e6).toFixed(2)  + ' kt';
      if (kg >= 1e3)  return (kg / 1e3).toFixed(1)  + ' t';
      return kg.toFixed(0) + ' kg';
    }
    function formatSpeed(mps) {
      if (mps >= 1e7) return (mps / P.C_MPS).toFixed(3) + ' c';
      if (mps >= 1000) return (mps / 1000).toFixed(1) + ' km/s';
      return mps.toFixed(0) + ' m/s';
    }
    function formatTime(yr) {
      if (!isFinite(yr)) return '∞';
      if (yr > 1e6) return (yr / 1e6).toFixed(2) + ' Myr';
      if (yr > 1e3) return (yr / 1e3).toFixed(2) + ' kyr';
      if (yr > 1)   return yr.toFixed(2) + ' yr';
      if (yr > 1/365) return (yr * 365).toFixed(1) + ' days';
      return (yr * 31557600).toFixed(0) + ' s';
    }
    function formatBig(v) {
      if (!isFinite(v)) return '∞';
      if (v > 1e9) return v.toExponential(2);
      if (v > 1e6) return (v / 1e6).toFixed(1) + 'M';
      if (v > 1e3) return (v / 1e3).toFixed(1) + 'k';
      if (v > 1) return v.toFixed(1);
      return v.toFixed(3);
    }
    function formatRatio(R) {
      if (!isFinite(R)) return '∞';
      if (R > 1e6) return R.toExponential(2);
      if (R > 100) return R.toFixed(0);
      if (R > 10)  return R.toFixed(1);
      return R.toFixed(2);
    }

    // ---------- Wire up inputs ----------
    el.dist.addEventListener('input', () => {
      state.distLy = parseFloat(el.dist.value);
      el.distRO.textContent = state.distLy.toFixed(2) + ' ly';
      recompute();
    });
    el.beta.addEventListener('input', () => {
      state.beta = parseFloat(el.beta.value);
      el.betaRO.textContent = state.beta.toFixed(3) + ' c';
      recompute();
    });
    el.accel.addEventListener('input', () => {
      state.aG = parseFloat(el.accel.value);
      el.accelRO.textContent = state.aG.toFixed(2) + ' g';
      recompute();
    });
    el.prop.addEventListener('change', () => {
      state.propulsionId = el.prop.value;
      recompute();
    });
    el.dryMass.addEventListener('input', () => {
      state.dryMassKg = parseFloat(el.dryMass.value);
      el.dryMassRO.textContent = formatMass(state.dryMassKg);
      recompute();
    });
    el.tripRadios.forEach(r => r.addEventListener('change', () => {
      if (r.checked) { state.maneuvers = parseInt(r.value, 10); recompute(); }
    }));

    // Initial readouts
    el.distRO.textContent = state.distLy.toFixed(2) + ' ly';
    el.betaRO.textContent = state.beta.toFixed(3) + ' c';
    el.accelRO.textContent = state.aG.toFixed(2) + ' g';
    el.dryMassRO.textContent = formatMass(state.dryMassKg);

    recompute();

    // Redraw chart when window resizes (chart uses getBoundingClientRect).
    window.addEventListener('resize', () => renderChart());

    return { recompute, renderChart };
  }

  NS.Fuel = { init };
})();
