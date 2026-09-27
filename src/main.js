/* ============================================================
   main.js — App entry point. Ties together physics, view,
   graphs, fuel calculator, and UI. Handles top-nav routing
   and runs the animation loop for the space view.
   ============================================================ */
(function () {
  'use strict';

  const NS = window.SpaceTravel;
  const S = NS.Scenarios;

  document.addEventListener('DOMContentLoaded', () => {

    // ==========================================================
    //  View switching (Home / Space / Data / Fuel)
    // ==========================================================
    const views = document.querySelectorAll('.view');
    const navLinks = document.querySelectorAll('.nav-link');

    let activeView = 'home';
    let spaceFitDone = false;

    function setView(name) {
      activeView = name;
      for (const v of views) {
        v.classList.toggle('active', v.dataset.view === name);
      }
      for (const b of navLinks) {
        b.classList.toggle('active', b.dataset.view === name);
      }
      // Trigger redraws for views with canvases that need current size
      if (name === 'space' && view) {
        requestAnimationFrame(() => {
          view.resizeAndRender();
          if (!spaceFitDone) { view.fitToScene(); spaceFitDone = true; }
          drawAll();
        });
      }
      if (name === 'data' && graphs) {
        requestAnimationFrame(() => graphs.render(app.scene, app.currentTime, app.perspectiveId));
      }
      if (name === 'fuel' && fuel) {
        requestAnimationFrame(() => fuel.renderChart());
      }
    }

    navLinks.forEach(b => b.addEventListener('click', () => setView(b.dataset.view)));
    document.querySelectorAll('[data-goto]').forEach(b => {
      b.addEventListener('click', () => setView(b.dataset.goto));
    });

    // ==========================================================
    //  Space / Data shared state
    // ==========================================================
    const app = {
      scene: S.createDefault(),
      currentTime: 0,
      playing: false,
      playSpeed: 1.0,
      perspectiveId: null,
      selectedId: null,
    };
    app.perspectiveId = app.scene.locations[0].id;

    // ---------- Space view ----------
    const canvas = document.getElementById('space-canvas');
    const view = NS.SpaceView.createView(canvas);

    view.setSelectCallback((id) => {
      app.selectedId = id;
      ui.refreshSelection();
    });

    // ---------- Graphs ----------
    const graphs = NS.Graphs.createGraphs({
      fuel: document.getElementById('graph-fuel'),
      fuelReadout: document.getElementById('fuel-graph-readout'),
      timedilation: document.getElementById('graph-timedilation'),
      distspeed: document.getElementById('graph-distspeed'),
      gamma: document.getElementById('graph-gamma'),
    });

    // ---------- UI ----------
    const ui = NS.UI.init(app, {
      onPlayToggle()          { /* no-op */ },
      onTimeChange()          { drawAll(); },
      onPerspectiveChange()   { drawAll(); },
      onRocketConfigChange()  { rebuildAll(); drawAll(); },
      onSceneChange()         { rebuildAll(); ui.refreshPerspective(); ui.refreshObjectList(); view.fitToScene(); drawAll(); },
      onFitView()             { view.fitToScene(); drawAll(); },
    });

    function rebuildAll() {
      S.rebuildRockets(app.scene);
      const tMax = S.sceneMaxTime(app.scene);
      if (app.currentTime > tMax) app.currentTime = tMax;
      if (app.currentTime < 0) app.currentTime = 0;
    }

    function drawAll() {
      view.update(app.scene, app.currentTime);
      view.setSelected(app.selectedId);
      graphs.render(app.scene, app.currentTime, app.perspectiveId);
      ui.refreshSelection();
      ui.updateReadouts();
    }

    rebuildAll();
    view.fitToScene();
    drawAll();

    // ---------- Fuel section ----------
    const fuel = NS.Fuel.init();

    // ==========================================================
    //  Animation loop (only runs if scene is playing)
    // ==========================================================
    let lastTs = performance.now();
    function loop(ts) {
      const dtMs = ts - lastTs;
      lastTs = ts;
      if (app.playing && activeView === 'space') {
        const observer = S.findObject(app.scene, app.perspectiveId);
        if (observer && observer.kind === 'rocket' && observer.trip) {
          const tauNow = ui.observerTau(observer, app.currentTime);
          const tauNext = tauNow + app.playSpeed * dtMs / 1000;
          app.currentTime = ui.perspectiveTauToCoord(observer, tauNext);
        } else {
          app.currentTime += app.playSpeed * dtMs / 1000;
        }
        const tMax = S.sceneMaxTime(app.scene);
        if (app.currentTime >= tMax) {
          app.currentTime = tMax;
          app.playing = false;
          document.getElementById('play-btn').textContent = '▶ Play';
        }
        drawAll();
      }
      requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);

    // Set initial view to home
    setView('home');

    // Expose for debugging
    window.__spaceTravelApp = app;
  });
})();
