/* ============================================================
   ui.js — Wire up all the HTML controls to the app state.

   Exposes SpaceTravel.UI.init(appState, handlers) where
   handlers provides callbacks into main.js for state changes.
   ============================================================ */
(function () {
  'use strict';

  const NS = window.SpaceTravel = window.SpaceTravel || {};
  const S = NS.Scenarios;
  const P = NS.Physics;

  function init(app, handlers) {
    const $ = (id) => document.getElementById(id);

    const el = {
      perspective: $('perspective-select'),
      play: $('play-btn'),
      reset: $('reset-btn'),
      time: $('time-slider'),
      timeReadout: $('time-readout'),
      speed: $('speed-slider'),
      speedReadout: $('speed-readout'),
      accel: $('accel-slider'),
      accelReadout: $('accel-readout'),
      profileRadios: document.querySelectorAll('input[name="profile"]'),
      cruise: $('cruise-slider'),
      cruiseReadout: $('cruise-readout'),
      cruiseGroup: $('cruise-group'),
      addLocation: $('add-location-btn'),
      addRocket: $('add-rocket-btn'),
      sendMessage: $('send-message-btn'),
      fitView: $('fit-view-btn'),
      objectList: $('object-list'),
      selectionInfo: $('selection-info'),
      rocketProp: $('rocket-propulsion'),
      rocketDryMass: $('rocket-drymass'),
      rocketDryMassRO: $('rocket-drymass-readout'),
    };

    // Populate propulsion dropdown
    if (el.rocketProp && window.SpaceTravel.Physics.PROPULSION) {
      for (const pr of window.SpaceTravel.Physics.PROPULSION) {
        const o = document.createElement('option');
        o.value = pr.id;
        o.textContent = pr.name;
        el.rocketProp.appendChild(o);
      }
    }

    // ---------- Perspective dropdown ----------
    function refreshPerspective() {
      const prev = el.perspective.value;
      el.perspective.innerHTML = '';
      for (const loc of app.scene.locations) {
        const o = document.createElement('option');
        o.value = loc.id;
        o.textContent = loc.name + ' (stationary)';
        el.perspective.appendChild(o);
      }
      for (const r of app.scene.rockets) {
        const o = document.createElement('option');
        o.value = r.id;
        o.textContent = r.name + ' (rocket)';
        el.perspective.appendChild(o);
      }
      if (prev && [...el.perspective.options].some(o => o.value === prev)) {
        el.perspective.value = prev;
      } else {
        el.perspective.value = app.perspectiveId || app.scene.locations[0]?.id;
      }
      app.perspectiveId = el.perspective.value;
    }
    el.perspective.addEventListener('change', () => {
      app.perspectiveId = el.perspective.value;
      handlers.onPerspectiveChange();
    });

    // ---------- Play / Reset ----------
    el.play.addEventListener('click', () => {
      app.playing = !app.playing;
      el.play.textContent = app.playing ? '❚❚ Pause' : '▶ Play';
      handlers.onPlayToggle();
    });
    el.reset.addEventListener('click', () => {
      app.currentTime = 0;
      app.playing = false;
      el.play.textContent = '▶ Play';
      handlers.onTimeChange();
    });

    // ---------- Time slider ----------
    el.time.addEventListener('input', () => {
      const tMax = S.sceneMaxTime(app.scene);
      // Slider 0..1 is mapped to selected perspective's time range
      const frac = parseFloat(el.time.value);
      const observer = S.findObject(app.scene, app.perspectiveId);
      const tauMax = observerTauMax(observer);
      const tauTarget = frac * tauMax;
      app.currentTime = perspectiveTauToCoord(observer, tauTarget);
      app.playing = false;
      el.play.textContent = '▶ Play';
      handlers.onTimeChange();
    });

    // ---------- Speed slider ----------
    el.speed.addEventListener('input', () => {
      app.playSpeed = parseFloat(el.speed.value);
      el.speedReadout.textContent = app.playSpeed.toFixed(2) + ' yr/s';
    });

    // ---------- Accel slider (affects rocket[0]) ----------
    el.accel.addEventListener('input', () => {
      const g = parseFloat(el.accel.value);
      el.accelReadout.textContent = g.toFixed(2) + ' g';
      if (app.scene.rockets.length > 0) {
        app.scene.rockets[0].aG = g;
      }
      handlers.onRocketConfigChange();
    });

    // ---------- Profile radio ----------
    el.profileRadios.forEach(r => {
      r.addEventListener('change', () => {
        if (!r.checked) return;
        if (app.scene.rockets.length > 0) {
          app.scene.rockets[0].profile = r.value;
        }
        el.cruiseGroup.style.display = (r.value === 'no-coast') ? 'none' : '';
        handlers.onRocketConfigChange();
      });
    });

    // ---------- Cruise slider ----------
    function formatBeta(v) {
      // Show enough decimals to distinguish 0.9, 0.99, 0.999, 0.9999...
      if (v >= 0.9999) return v.toFixed(5);
      if (v >= 0.999)  return v.toFixed(4);
      if (v >= 0.99)   return v.toFixed(4);
      return v.toFixed(3);
    }
    el.cruise.addEventListener('input', () => {
      const v = parseFloat(el.cruise.value);
      el.cruiseReadout.textContent = formatBeta(v) + ' c';
      if (app.scene.rockets.length > 0) {
        app.scene.rockets[0].vCruise = v;
      }
      handlers.onRocketConfigChange();
    });

    // ---------- Rocket propulsion ----------
    if (el.rocketProp) {
      el.rocketProp.addEventListener('change', () => {
        if (app.scene.rockets.length > 0) {
          app.scene.rockets[0].propulsionId = el.rocketProp.value;
        }
        handlers.onRocketConfigChange();
      });
    }

    // ---------- Rocket dry mass ----------
    if (el.rocketDryMass) {
      el.rocketDryMass.addEventListener('input', () => {
        const kg = parseFloat(el.rocketDryMass.value);
        el.rocketDryMassRO.textContent = NS.Graphs.formatMass(kg);
        if (app.scene.rockets.length > 0) {
          app.scene.rockets[0].dryMassKg = kg;
        }
        handlers.onRocketConfigChange();
      });
    }

    // ---------- Inline form helpers ----------
    const form = {
      loc:   document.getElementById('form-add-location'),
      rkt:   document.getElementById('form-add-rocket'),
      msg:   document.getElementById('form-send-msg'),
    };
    const locInputs = {
      name: document.getElementById('loc-name'),
      x:    document.getElementById('loc-x'),
      y:    document.getElementById('loc-y'),
    };
    const rktInputs = {
      name:   document.getElementById('rkt-name'),
      origin: document.getElementById('rkt-origin'),
      dest:   document.getElementById('rkt-dest'),
      launch: document.getElementById('rkt-launch'),
    };
    const msgInputs = {
      from:  document.getElementById('msg-from'),
      to:    document.getElementById('msg-to'),
      emit:  document.getElementById('msg-emit'),
    };

    // Hide every form except the one named ('loc' | 'rkt' | 'msg' | null)
    function openForm(which) {
      form.loc.hidden = (which !== 'loc');
      form.rkt.hidden = (which !== 'rkt');
      form.msg.hidden = (which !== 'msg');
    }

    function closeAllForms() { openForm(null); }

    function populateLocationSelect(selectEl) {
      selectEl.innerHTML = '';
      for (const l of app.scene.locations) {
        const o = document.createElement('option');
        o.value = l.id;
        o.textContent = l.name;
        selectEl.appendChild(o);
      }
    }
    function populateSenderSelect(selectEl) {
      selectEl.innerHTML = '';
      for (const l of app.scene.locations) {
        const o = document.createElement('option');
        o.value = l.id;
        o.textContent = l.name + ' (location)';
        selectEl.appendChild(o);
      }
      for (const r of app.scene.rockets) {
        const o = document.createElement('option');
        o.value = r.id;
        o.textContent = r.name + ' (rocket)';
        selectEl.appendChild(o);
      }
    }

    // ---------- Add Location ----------
    el.addLocation.addEventListener('click', () => {
      if (!form.loc.hidden) { closeAllForms(); return; }
      locInputs.name.value = 'Location ' + (app.scene.locations.length + 1);
      locInputs.x.value = '';
      locInputs.y.value = '0';
      openForm('loc');
      setTimeout(() => locInputs.x.focus(), 0);
    });
    form.loc.querySelector('[data-action="loc-submit"]').addEventListener('click', () => {
      const name = (locInputs.name.value || '').trim() || ('Location ' + (app.scene.locations.length + 1));
      const x = parseFloat(locInputs.x.value);
      const y = parseFloat(locInputs.y.value);
      if (!isFinite(x) || !isFinite(y)) {
        locInputs.x.style.borderColor = '#ff6060';
        return;
      }
      S.addLocation(app.scene, name, x, y);
      closeAllForms();
      handlers.onSceneChange();
    });
    form.loc.querySelector('[data-action="loc-cancel"]').addEventListener('click', closeAllForms);
    // Submit on Enter
    [locInputs.name, locInputs.x, locInputs.y].forEach(inp => {
      inp.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') form.loc.querySelector('[data-action="loc-submit"]').click();
        if (e.key === 'Escape') closeAllForms();
      });
      inp.addEventListener('input', () => { inp.style.borderColor = ''; });
    });

    // ---------- Add Rocket ----------
    el.addRocket.addEventListener('click', () => {
      if (app.scene.locations.length < 2) {
        alert('Need at least 2 locations first.');
        return;
      }
      if (!form.rkt.hidden) { closeAllForms(); return; }
      rktInputs.name.value = 'Rocket ' + (app.scene.rockets.length + 1);
      populateLocationSelect(rktInputs.origin);
      populateLocationSelect(rktInputs.dest);
      if (rktInputs.dest.options.length > 1) rktInputs.dest.selectedIndex = 1;
      rktInputs.launch.value = app.currentTime.toFixed(2);
      openForm('rkt');
    });
    form.rkt.querySelector('[data-action="rkt-submit"]').addEventListener('click', () => {
      const name = (rktInputs.name.value || '').trim() || ('Rocket ' + (app.scene.rockets.length + 1));
      const originId = rktInputs.origin.value;
      const destId = rktInputs.dest.value;
      if (!originId || !destId || originId === destId) {
        rktInputs.dest.style.borderColor = '#ff6060';
        return;
      }
      const launchTime = parseFloat(rktInputs.launch.value);
      if (!isFinite(launchTime)) {
        rktInputs.launch.style.borderColor = '#ff6060';
        return;
      }
      S.addRocket(app.scene, {
        name, originId, destId,
        aG: 1.0, profile: 'no-coast', vCruise: 0.999,
        launchTime,
        propulsionId: 'photon', dryMassKg: 100000,
      });
      closeAllForms();
      handlers.onSceneChange();
    });
    form.rkt.querySelector('[data-action="rkt-cancel"]').addEventListener('click', closeAllForms);
    [rktInputs.name, rktInputs.launch].forEach(inp => {
      inp.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') form.rkt.querySelector('[data-action="rkt-submit"]').click();
        if (e.key === 'Escape') closeAllForms();
      });
      inp.addEventListener('input', () => { inp.style.borderColor = ''; });
    });

    // ---------- Send Message ----------
    el.sendMessage.addEventListener('click', () => {
      if (app.scene.locations.length < 1) { alert('Need a location first.'); return; }
      if (!form.msg.hidden) { closeAllForms(); return; }
      populateSenderSelect(msgInputs.from);
      populateLocationSelect(msgInputs.to);
      if (msgInputs.to.options.length > 1) msgInputs.to.selectedIndex = 1;
      msgInputs.emit.value = app.currentTime.toFixed(2);
      openForm('msg');
    });
    form.msg.querySelector('[data-action="msg-submit"]').addEventListener('click', () => {
      const fromId = msgInputs.from.value;
      const toId = msgInputs.to.value;
      const emitTime = parseFloat(msgInputs.emit.value);
      if (!fromId || !toId || fromId === toId) {
        msgInputs.to.style.borderColor = '#ff6060';
        return;
      }
      if (!isFinite(emitTime)) {
        msgInputs.emit.style.borderColor = '#ff6060';
        return;
      }
      const from = S.findObject(app.scene, fromId);
      const to = S.findObject(app.scene, toId);
      if (!from || !to || to.kind !== 'location') return;
      const msg = S.createMessage(from, to, emitTime, app.scene);
      app.scene.messages.push(msg);
      closeAllForms();
      handlers.onSceneChange();
    });
    form.msg.querySelector('[data-action="msg-cancel"]').addEventListener('click', closeAllForms);
    msgInputs.emit.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') form.msg.querySelector('[data-action="msg-submit"]').click();
      if (e.key === 'Escape') closeAllForms();
    });
    msgInputs.emit.addEventListener('input', () => { msgInputs.emit.style.borderColor = ''; });

    // ---------- Fit view ----------
    if (el.fitView) {
      el.fitView.addEventListener('click', () => {
        if (handlers.onFitView) handlers.onFitView();
      });
    }

    // ---------- Object list with delete buttons ----------
    function refreshObjectList() {
      el.objectList.innerHTML = '';
      for (const loc of app.scene.locations) {
        const row = document.createElement('div');
        row.className = 'object-row';
        row.innerHTML = `
          <span class="object-name"><span class="dot" style="background:${loc.color};color:${loc.color}"></span>${escapeHtml(loc.name)}
          <span style="opacity:0.5;margin-left:6px;">(${loc.x.toFixed(2)}, ${loc.y.toFixed(2)}) ly</span></span>
          <button class="object-del" title="Remove">✕</button>
        `;
        row.querySelector('.object-del').addEventListener('click', () => {
          S.removeLocation(app.scene, loc.id);
          handlers.onSceneChange();
        });
        el.objectList.appendChild(row);
      }
      for (const r of app.scene.rockets) {
        const row = document.createElement('div');
        row.className = 'object-row';
        const originName = app.scene.locations.find(l => l.id === r.originId)?.name || '?';
        const destName = app.scene.locations.find(l => l.id === r.destId)?.name || '?';
        row.innerHTML = `
          <span class="object-name"><span class="dot" style="background:${r.color};color:${r.color}"></span>${escapeHtml(r.name)}
          <span style="opacity:0.5;margin-left:6px;">${originName} → ${destName}, ${r.aG.toFixed(1)}g</span></span>
          <button class="object-del" title="Remove">✕</button>
        `;
        row.querySelector('.object-del').addEventListener('click', () => {
          S.removeRocket(app.scene, r.id);
          handlers.onSceneChange();
        });
        el.objectList.appendChild(row);
      }
    }

    // ---------- Selection info ----------
    function refreshSelection() {
      const id = app.selectedId;
      if (!id) { el.selectionInfo.classList.remove('visible'); return; }
      const obj = S.findObject(app.scene, id);
      if (!obj) { el.selectionInfo.classList.remove('visible'); return; }
      el.selectionInfo.classList.add('visible');
      if (obj.kind === 'location') {
        el.selectionInfo.innerHTML = `
          <div style="color:${obj.color};font-weight:600;">${escapeHtml(obj.name)}</div>
          <div>position: (${obj.x.toFixed(3)}, ${obj.y.toFixed(3)}) ly</div>
          <div>τ (proper time): ${Math.max(0, app.currentTime).toFixed(3)} yr</div>
        `;
      } else {
        const st = S.rocketStateAt(obj, app.currentTime);
        el.selectionInfo.innerHTML = `
          <div style="color:${obj.color};font-weight:600;">${escapeHtml(obj.name)}</div>
          <div>phase: ${st.phase}</div>
          <div>position: (${st.x.toFixed(3)}, ${st.y.toFixed(3)}) ly</div>
          <div>β = ${st.speed.toFixed(4)} c &nbsp; γ = ${st.gamma.toFixed(3)}</div>
          <div>τ (rocket): ${st.tau.toFixed(3)} yr &nbsp; t (earth): ${Math.max(0, app.currentTime).toFixed(3)} yr</div>
          ${obj.trip ? `<div style="opacity:0.7;">trip: ${obj.trip.type}, total ${obj.trip.tTotal.toFixed(2)} yr earth / ${obj.trip.tauTotal.toFixed(2)} yr rocket</div>` : ''}
        `;
      }
    }

    // ---------- Readouts on tick ----------
    function updateReadouts() {
      const observer = S.findObject(app.scene, app.perspectiveId);
      const tau = observerTau(observer, app.currentTime);
      el.timeReadout.textContent = tau.toFixed(2) + ' yr';
      const tauMax = observerTauMax(observer);
      const frac = tauMax > 0 ? Math.min(1, tau / tauMax) : 0;
      // Only update slider if user isn't dragging it (approximate by checking focus)
      if (document.activeElement !== el.time) {
        el.time.value = String(frac);
      }
    }

    function observerTau(observer, t) {
      if (!observer) return Math.max(0, t);
      if (observer.kind === 'location') return Math.max(0, t);
      // rocket
      if (!observer.trip) return 0;
      const dt = t - observer.launchTime;
      if (dt <= 0) return 0;
      if (dt >= observer.trip.tTotal) return observer.trip.tauTotal + (dt - observer.trip.tTotal);
      return S.rocketStateAt(observer, t).tau;
    }
    function observerTauMax(observer) {
      const tMax = S.sceneMaxTime(app.scene);
      if (!observer) return tMax;
      if (observer.kind === 'location') return tMax;
      if (!observer.trip) return tMax;
      const dt = tMax - observer.launchTime;
      if (dt <= 0) return 0.0001;
      if (dt <= observer.trip.tTotal) return S.rocketStateAt(observer, tMax).tau;
      return observer.trip.tauTotal + (dt - observer.trip.tTotal);
    }
    function perspectiveTauToCoord(observer, tau) {
      if (!observer) return tau;
      if (observer.kind === 'location') return tau;
      if (!observer.trip) return tau;
      if (tau <= 0) return observer.launchTime;
      if (tau >= observer.trip.tauTotal) {
        return observer.launchTime + observer.trip.tTotal + (tau - observer.trip.tauTotal);
      }
      return observer.launchTime + P.coordTimeFromProperTime(observer.trip, tau);
    }

    function escapeHtml(s) {
      return String(s).replace(/[&<>"']/g, c => ({
        '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
      }[c]));
    }

    // Initialize readouts
    el.speedReadout.textContent = app.playSpeed.toFixed(2) + ' yr/s';
    el.accelReadout.textContent = (app.scene.rockets[0]?.aG ?? 1).toFixed(2) + ' g';
    el.cruiseReadout.textContent = formatBeta(app.scene.rockets[0]?.vCruise ?? 0.999) + ' c';
    if (el.cruise) el.cruise.value = String(app.scene.rockets[0]?.vCruise ?? 0.999);
    if (el.rocketDryMassRO) {
      el.rocketDryMassRO.textContent = NS.Graphs.formatMass(app.scene.rockets[0]?.dryMassKg ?? 100000);
    }
    if (el.rocketProp && app.scene.rockets[0]) {
      el.rocketProp.value = app.scene.rockets[0].propulsionId || 'photon';
    }
    if (app.scene.rockets[0]) {
      el.cruiseGroup.style.display = (app.scene.rockets[0].profile === 'no-coast') ? 'none' : '';
      const profile = app.scene.rockets[0].profile || 'auto';
      el.profileRadios.forEach(r => { r.checked = (r.value === profile); });
    }

    refreshPerspective();
    refreshObjectList();

    return {
      refreshPerspective,
      refreshObjectList,
      refreshSelection,
      updateReadouts,
      observerTau,
      observerTauMax,
      perspectiveTauToCoord,
    };
  }

  NS.UI = { init };
})();
