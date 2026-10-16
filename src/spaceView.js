/* ============================================================
   spaceView.js — Interactive 2D canvas for the space view.

   Coordinates:
     - World space: light-years, +x right, +y up.
     - Screen space: pixels, +x right, +y down (canvas default).
   Transform stored as { cx, cy, zoom } where zoom is pixels per light-year.

   Interactions:
     - scroll  = zoom (centered on mouse)
     - drag    = pan
     - click   = select nearest object

   Always renders in the LAUNCH FRAME (Earth's rest frame). The
   "perspective" selector drives time-axis semantics (handled in main.js),
   not 2D positions — this keeps v1 simple and the visual intuitive.
   ============================================================ */
(function () {
  'use strict';

  const NS = window.SpaceTravel = window.SpaceTravel || {};
  const P = NS.Physics;
  const S = NS.Scenarios;

  function createView(canvas) {
    const ctx = canvas.getContext('2d');
    const state = {
      canvas, ctx,
      dpr: Math.max(1, window.devicePixelRatio || 1),
      width: 0, height: 0,         // CSS pixels
      viewport: { cx: 2.125, cy: 0, zoom: 70 }, // fit Earth-Proxima (~4.25 ly)
      dragging: false,
      dragStart: null,
      dragViewport: null,
      selectedId: null,
      hoveredId: null,
      onSelect: null,     // callback(id)
      scene: null,
      currentTime: 0,
    };

    function resize() {
      const rect = canvas.getBoundingClientRect();
      state.width = rect.width;
      state.height = rect.height;
      canvas.width = Math.round(rect.width * state.dpr);
      canvas.height = Math.round(rect.height * state.dpr);
      ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
    }

    // ---------- transforms ----------
    function worldToScreen(wx, wy) {
      return {
        x: (wx - state.viewport.cx) * state.viewport.zoom + state.width / 2,
        y: state.height / 2 - (wy - state.viewport.cy) * state.viewport.zoom,
      };
    }
    function screenToWorld(sx, sy) {
      return {
        x: (sx - state.width / 2) / state.viewport.zoom + state.viewport.cx,
        y: state.viewport.cy - (sy - state.height / 2) / state.viewport.zoom,
      };
    }

    // ---------- input handlers ----------
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const before = screenToWorld(mx, my);
      const factor = Math.exp(-e.deltaY * 0.0015);
      state.viewport.zoom = clamp(state.viewport.zoom * factor, 0.01, 5000);
      const after = screenToWorld(mx, my);
      state.viewport.cx += before.x - after.x;
      state.viewport.cy += before.y - after.y;
      render();
    }, { passive: false });

    canvas.addEventListener('mousedown', (e) => {
      state.dragging = true;
      state.dragStart = { x: e.clientX, y: e.clientY };
      state.dragViewport = { cx: state.viewport.cx, cy: state.viewport.cy };
      state.movedDuringDrag = false;
    });
    window.addEventListener('mousemove', (e) => {
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      // Update hover
      const hover = findNearest(mx, my, 18);
      if (hover !== state.hoveredId) {
        state.hoveredId = hover;
        canvas.style.cursor = hover ? 'pointer' : (state.dragging ? 'grabbing' : 'grab');
        render();
      }
      if (!state.dragging) return;
      const dx = e.clientX - state.dragStart.x;
      const dy = e.clientY - state.dragStart.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) state.movedDuringDrag = true;
      state.viewport.cx = state.dragViewport.cx - dx / state.viewport.zoom;
      state.viewport.cy = state.dragViewport.cy + dy / state.viewport.zoom;
      render();
    });
    window.addEventListener('mouseup', (e) => {
      if (state.dragging && !state.movedDuringDrag) {
        const rect = canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        if (mx >= 0 && mx <= state.width && my >= 0 && my <= state.height) {
          const hit = findNearest(mx, my, 20);
          state.selectedId = hit;
          if (state.onSelect) state.onSelect(hit);
          render();
        }
      }
      state.dragging = false;
    });

    // ---------- hit-testing ----------
    function findNearest(sx, sy, tolPx) {
      if (!state.scene) return null;
      let best = null, bestD = tolPx;
      for (const loc of state.scene.locations) {
        const p = worldToScreen(loc.x, loc.y);
        const d = Math.hypot(p.x - sx, p.y - sy);
        if (d < bestD) { bestD = d; best = loc.id; }
      }
      for (const r of state.scene.rockets) {
        const st = S.rocketStateAt(r, state.currentTime);
        const p = worldToScreen(st.x, st.y);
        const d = Math.hypot(p.x - sx, p.y - sy);
        if (d < bestD) { bestD = d; best = r.id; }
      }
      return best;
    }

    // ---------- rendering ----------
    function render() {
      if (!state.width) resize();
      const { width: W, height: H } = state;
      ctx.clearRect(0, 0, W, H);

      drawStarfield();
      drawGrid();
      if (state.scene) {
        drawMessages();
        drawLocations();
        drawRockets();
      }
      drawScaleIndicator();
    }

    // Stars are generated deterministically per visible grid cell so density
    // stays roughly constant per screen area regardless of zoom. A fade
    // based on zoom hides them when panning/zooming at extreme scales.
    // 32-bit integer hash → [0,1)
    function hash01(x, y, salt) {
      let h = (x * 374761393) ^ (y * 668265263) ^ (salt * 1442695040);
      h = (h ^ (h >>> 13)) >>> 0;
      h = Math.imul(h, 1274126177) >>> 0;
      h = (h ^ (h >>> 16)) >>> 0;
      return h / 0xffffffff;
    }
    function drawStarfield() {
      const { width: W, height: H, viewport: vp } = state;
      // Star spacing (in world units) scales with zoom — we want ~1 star per
      // ~(60px × 60px) screen region. So cell size in world units = 60 / zoom.
      const pxPerStar = 55;
      const cellSize = pxPerStar / vp.zoom;

      // World bounds of the viewport, plus a small margin
      const halfWx = (W / 2) / vp.zoom;
      const halfHy = (H / 2) / vp.zoom;
      const xLo = vp.cx - halfWx - cellSize;
      const xHi = vp.cx + halfWx + cellSize;
      const yLo = vp.cy - halfHy - cellSize;
      const yHi = vp.cy + halfHy + cellSize;

      const i0 = Math.floor(xLo / cellSize);
      const i1 = Math.ceil (xHi / cellSize);
      const j0 = Math.floor(yLo / cellSize);
      const j1 = Math.ceil (yHi / cellSize);

      // Cap cells drawn (safety under extreme zoom-out)
      if ((i1 - i0) * (j1 - j0) > 4000) return;

      ctx.save();
      for (let j = j0; j <= j1; j++) {
        for (let i = i0; i <= i1; i++) {
          // One star per cell; jitter inside the cell
          const jx = hash01(i, j, 1);
          const jy = hash01(i, j, 2);
          const sz = hash01(i, j, 3);
          const br = hash01(i, j, 4);

          const wx = (i + jx) * cellSize;
          const wy = (j + jy) * cellSize;
          const p = worldToScreen(wx, wy);
          if (p.x < -5 || p.y < -5 || p.x > W + 5 || p.y > H + 5) continue;

          const size = 0.4 + sz * 1.1;
          const alpha = 0.25 + br * 0.55;
          ctx.fillStyle = `rgba(200, 220, 255, ${alpha})`;
          ctx.beginPath();
          ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();
    }

    function drawGrid() {
      const { width: W, height: H, viewport: vp } = state;
      // Choose grid spacing so we get ~6–10 lines across the viewport
      const span = W / vp.zoom;
      // ~8 lines on wide canvases; fewer on narrow (phone) canvases so the
      // axis labels (~50px wide) don't run into each other.
      const targetLines = Math.min(8, Math.max(3, Math.floor(W / 90)));
      const rawStep = span / targetLines;
      const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
      const norm = rawStep / mag;
      let step;
      if (norm < 1.5) step = 1 * mag;
      else if (norm < 3.5) step = 2 * mag;
      else if (norm < 7.5) step = 5 * mag;
      else step = 10 * mag;

      const x0 = Math.floor((vp.cx - (W / 2) / vp.zoom) / step) * step;
      const x1 = Math.ceil ((vp.cx + (W / 2) / vp.zoom) / step) * step;
      const y0 = Math.floor((vp.cy - (H / 2) / vp.zoom) / step) * step;
      const y1 = Math.ceil ((vp.cy + (H / 2) / vp.zoom) / step) * step;

      ctx.save();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.07)';
      ctx.lineWidth = 1;
      ctx.font = '10px Consolas, monospace';
      ctx.fillStyle = 'rgba(200, 220, 255, 0.3)';

      for (let x = x0; x <= x1 + 1e-9; x += step) {
        const p = worldToScreen(x, 0);
        ctx.beginPath();
        ctx.moveTo(Math.round(p.x) + 0.5, 0);
        ctx.lineTo(Math.round(p.x) + 0.5, H);
        ctx.stroke();
        if (Math.abs(x) > 1e-9) {
          ctx.fillText(formatLy(x), Math.round(p.x) + 4, H - 6);
        }
      }
      for (let y = y0; y <= y1 + 1e-9; y += step) {
        const p = worldToScreen(0, y);
        ctx.beginPath();
        ctx.moveTo(0, Math.round(p.y) + 0.5);
        ctx.lineTo(W, Math.round(p.y) + 0.5);
        ctx.stroke();
        if (Math.abs(y) > 1e-9) {
          ctx.fillText(formatLy(y), 4, Math.round(p.y) - 4);
        }
      }
      // origin cross
      const o = worldToScreen(0, 0);
      ctx.strokeStyle = 'rgba(0, 217, 255, 0.35)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(o.x - 12, o.y); ctx.lineTo(o.x + 12, o.y);
      ctx.moveTo(o.x, o.y - 12); ctx.lineTo(o.x, o.y + 12);
      ctx.stroke();
      ctx.restore();
    }

    function drawScaleIndicator() {
      const { width: W, height: H, viewport: vp } = state;
      const span = W / vp.zoom;
      const raw = span * 0.15;
      const mag = Math.pow(10, Math.floor(Math.log10(raw)));
      const norm = raw / mag;
      let step = norm < 1.5 ? 1*mag : norm < 3.5 ? 2*mag : norm < 7.5 ? 5*mag : 10*mag;
      const barPx = step * vp.zoom;
      const x0 = W - barPx - 20;
      const y = H - 20;
      ctx.save();
      ctx.strokeStyle = '#00d9ff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x0, y); ctx.lineTo(x0 + barPx, y);
      ctx.moveTo(x0, y - 4); ctx.lineTo(x0, y + 4);
      ctx.moveTo(x0 + barPx, y - 4); ctx.lineTo(x0 + barPx, y + 4);
      ctx.stroke();
      ctx.fillStyle = '#00d9ff';
      ctx.font = '11px Consolas, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(formatLy(step), x0 + barPx / 2, y - 8);
      ctx.textAlign = 'start';
      ctx.restore();
    }

    function drawLocations() {
      for (const loc of state.scene.locations) {
        const p = worldToScreen(loc.x, loc.y);
        const isSel = state.selectedId === loc.id;
        const isHov = state.hoveredId === loc.id;
        ctx.save();
        // glow
        const r = isSel ? 14 : 10;
        const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 2.5);
        grad.addColorStop(0, hexA(loc.color, 0.6));
        grad.addColorStop(1, hexA(loc.color, 0));
        ctx.fillStyle = grad;
        ctx.fillRect(p.x - r*2.5, p.y - r*2.5, r*5, r*5);
        // core
        ctx.beginPath();
        ctx.arc(p.x, p.y, r * 0.45, 0, Math.PI * 2);
        ctx.fillStyle = loc.color;
        ctx.fill();
        // ring
        if (isSel || isHov) {
          ctx.beginPath();
          ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
          ctx.strokeStyle = isSel ? '#00d9ff' : 'rgba(255,255,255,0.5)';
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
        // label
        ctx.font = '13px "Segoe UI", sans-serif';
        ctx.fillStyle = '#e8ecff';
        ctx.textAlign = 'left';
        ctx.fillText(loc.name, p.x + r + 4, p.y - 4);
        ctx.restore();
      }
    }

    function drawRockets() {
      for (const r of state.scene.rockets) {
        const st = S.rocketStateAt(r, state.currentTime);
        const p = worldToScreen(st.x, st.y);
        const isSel = state.selectedId === r.id;
        const isHov = state.hoveredId === r.id;
        const motionAngle = Math.atan2(-r.dir.y, r.dir.x); // canvas Y is flipped
        // During decel, a real rocket rotates 180° so its engines face forward
        // (opposite to motion) and thrust opposes velocity. Visualize that flip.
        const angle = (st.phase === 'decelerating') ? motionAngle + Math.PI : motionAngle;

        // trail: sample back in time
        drawTrail(r);

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(angle);
        // rocket triangle — always points in local +x (which is rocket's nose direction)
        const size = isSel ? 12 : 10;
        ctx.beginPath();
        ctx.moveTo(size, 0);
        ctx.lineTo(-size * 0.6, size * 0.55);
        ctx.lineTo(-size * 0.3, 0);
        ctx.lineTo(-size * 0.6, -size * 0.55);
        ctx.closePath();
        ctx.fillStyle = r.color;
        ctx.shadowColor = r.color;
        ctx.shadowBlur = 12;
        ctx.fill();
        // exhaust plume — always in local -x when thrusting (behind the rocket
        // in its own frame). Decel is handled by the 180° rotation above.
        if (st.phase === 'accelerating' || st.phase === 'decelerating') {
          ctx.shadowBlur = 6;
          const baseX = -size * 0.6;
          const tipX  = -size * 2.2;
          const grad = ctx.createLinearGradient(baseX, 0, tipX, 0);
          grad.addColorStop(0, 'rgba(255, 200, 100, 0.9)');
          grad.addColorStop(1, 'rgba(255, 100, 50, 0)');
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.moveTo(baseX, size * 0.4);
          ctx.lineTo(tipX, 0);
          ctx.lineTo(baseX, -size * 0.4);
          ctx.closePath();
          ctx.fill();
        }
        ctx.restore();

        if (isSel || isHov) {
          ctx.beginPath();
          ctx.arc(p.x, p.y, 16, 0, Math.PI * 2);
          ctx.strokeStyle = isSel ? '#00d9ff' : 'rgba(255,255,255,0.4)';
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }

        // label
        ctx.font = '12px "Segoe UI", sans-serif';
        ctx.fillStyle = '#e8ecff';
        ctx.textAlign = 'left';
        ctx.fillText(r.name, p.x + 14, p.y - 12);
        // speed readout
        ctx.font = '10px Consolas, monospace';
        ctx.fillStyle = r.color;
        const betaStr = (st.speed).toFixed(3);
        ctx.fillText(`β=${betaStr}  γ=${st.gamma.toFixed(2)}`, p.x + 14, p.y + 2);
      }
    }

    function drawTrail(r) {
      if (!r.trip) return;
      // Trail runs from launch time to (current time, capped at arrival)
      const tStart = r.launchTime;
      const tNow = Math.min(state.currentTime, r.launchTime + r.trip.tTotal);
      if (tNow <= tStart) return;

      // Smooth line along the full traversed path
      ctx.save();
      ctx.strokeStyle = hexA(r.color, 0.45);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      const N = 80;
      for (let i = 0; i <= N; i++) {
        const t = tStart + (i / N) * (tNow - tStart);
        const st = S.rocketStateAt(r, t);
        const p = worldToScreen(st.x, st.y);
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();

      // Time-tick breadcrumbs at every half-year (Earth frame).
      // Spacing between ticks reveals instantaneous speed: close = slow, far = fast.
      const tickInterval = pickTickInterval(r.trip.tTotal);
      ctx.fillStyle = hexA(r.color, 0.85);
      const k0 = Math.ceil(tStart / tickInterval);
      const k1 = Math.floor(tNow / tickInterval);
      for (let k = k0; k <= k1; k++) {
        const t = k * tickInterval;
        if (t < tStart || t > tNow) continue;
        const st = S.rocketStateAt(r, t);
        const p = worldToScreen(st.x, st.y);
        ctx.beginPath();
        ctx.arc(p.x, p.y, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    function pickTickInterval(tTotal) {
      // Aim for ~8–16 ticks along the trajectory
      if (tTotal <= 3) return 0.25;
      if (tTotal <= 8) return 0.5;
      if (tTotal <= 20) return 1;
      if (tTotal <= 60) return 5;
      return Math.max(1, Math.round(tTotal / 12));
    }

    function drawMessages() {
      for (const m of state.scene.messages) {
        const pos = S.messagePosAt(m, state.currentTime);
        if (!pos) continue;
        const p = worldToScreen(pos.x, pos.y);
        ctx.save();
        // expanding ring trail (past positions)
        const steps = 6;
        for (let i = 1; i <= steps; i++) {
          const t = state.currentTime - i * 0.1;
          const past = S.messagePosAt(m, t);
          if (!past) break;
          const pp = worldToScreen(past.x, past.y);
          const alpha = (1 - i / steps) * 0.4;
          ctx.fillStyle = hexA(m.color, alpha);
          ctx.beginPath();
          ctx.arc(pp.x, pp.y, 3, 0, Math.PI * 2);
          ctx.fill();
        }
        // main pulse
        ctx.fillStyle = m.color;
        ctx.shadowColor = m.color;
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }

    // ---------- helpers ----------
    function formatLy(v) {
      const abs = Math.abs(v);
      if (abs >= 100) return v.toFixed(0) + ' ly';
      if (abs >= 1) return v.toFixed(2) + ' ly';
      if (abs >= 0.01) return v.toFixed(3) + ' ly';
      // light-minutes / light-seconds
      const lm = v * 525960;   // ly -> light-minutes (approx, 1 yr = 525960 min)
      if (Math.abs(lm) >= 1) return lm.toFixed(1) + ' lm';
      const ls = v * 3.156e7;
      return ls.toFixed(1) + ' ls';
    }
    function hexA(hex, a) {
      // "#rrggbb" → rgba
      const h = hex.replace('#', '');
      const r = parseInt(h.substring(0, 2), 16);
      const g = parseInt(h.substring(2, 4), 16);
      const b = parseInt(h.substring(4, 6), 16);
      return `rgba(${r},${g},${b},${a})`;
    }
    function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

    // ---------- public API ----------
    function update(scene, currentTime) {
      state.scene = scene;
      state.currentTime = currentTime;
      render();
    }
    function setSelectCallback(fn) { state.onSelect = fn; }
    function setSelected(id) { state.selectedId = id; render(); }

    function fitToScene() {
      if (!state.scene) return;
      if (state.width <= 0 || state.height <= 0) resize();
      if (state.width <= 0 || state.height <= 0) return; // still no size
      const pts = [
        ...state.scene.locations.map(l => [l.x, l.y]),
      ];
      if (pts.length === 0) return;
      let xmin = pts[0][0], xmax = pts[0][0], ymin = pts[0][1], ymax = pts[0][1];
      for (const [x, y] of pts) {
        xmin = Math.min(xmin, x); xmax = Math.max(xmax, x);
        ymin = Math.min(ymin, y); ymax = Math.max(ymax, y);
      }
      const dx = Math.max(0.5, xmax - xmin);
      const dy = Math.max(0.5, ymax - ymin);
      state.viewport.cx = (xmin + xmax) / 2;
      state.viewport.cy = (ymin + ymax) / 2;
      const zoomX = state.width  / (dx * 1.4);
      const zoomY = state.height / (dy * 1.4 + 0.5);
      const zoom = Math.min(zoomX, zoomY);
      if (isFinite(zoom) && zoom > 0) state.viewport.zoom = zoom;
      render();
    }

    function resizeAndRender() { resize(); render(); }

    // Initial sizing
    resize();
    const resizeObserver = new ResizeObserver(() => { resize(); render(); });
    resizeObserver.observe(canvas);

    return {
      update, render, fitToScene, resizeAndRender,
      setSelectCallback, setSelected,
      get selectedId() { return state.selectedId; },
      worldToScreen, screenToWorld,
    };
  }

  NS.SpaceView = { createView };
})();
