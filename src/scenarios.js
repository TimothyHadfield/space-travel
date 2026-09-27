/* ============================================================
   scenarios.js — Scene state management.

   A scene is:
     - locations: points at fixed positions in the launch frame
     - rockets:   objects that travel between locations
     - messages:  light-speed pulses emitted from locations or rockets

   All positions/times in the LAUNCH FRAME (the frame where all
   user-placed locations are at rest — we treat this as Earth's
   rest frame).
   ============================================================ */
(function () {
  'use strict';

  const NS = window.SpaceTravel = window.SpaceTravel || {};
  const P = NS.Physics;

  const COLORS = [
    '#00d9ff', '#a88bff', '#ff6fb5', '#ffd166',
    '#7bed9f', '#ff9f43', '#48dbfb', '#c471ed',
  ];
  const ROCKET_COLORS = [
    '#ffcd55', '#ff7a7a', '#66f0a1', '#b789ff',
    '#ff9ed4', '#5cefff',
  ];

  let _idCounter = 1;
  function nextId() { return 'id-' + (_idCounter++); }

  function createDefault() {
    const earth = {
      id: nextId(),
      kind: 'location',
      name: 'Earth',
      x: 0, y: 0,
      color: '#4e9bff',
    };
    const proxima = {
      id: nextId(),
      kind: 'location',
      name: 'Proxima Centauri',
      x: 4.25, y: 0,
      color: '#ffcd55',
    };

    const rocket = buildRocket({
      name: 'Rocket 1',
      originId: earth.id,
      destId: proxima.id,
      aG: 1.0,
      profile: 'no-coast',
      vCruise: 0.999,
      launchTime: 0,
      propulsionId: 'photon',
      dryMassKg: 100000,
    }, [earth, proxima]);

    return {
      locations: [earth, proxima],
      rockets: [rocket],
      messages: [],
    };
  }

  // Build or rebuild a rocket's trip plan.
  function buildRocket(config, locations) {
    const origin = locations.find(l => l.id === config.originId);
    const dest = locations.find(l => l.id === config.destId);
    if (!origin || !dest) {
      throw new Error('Rocket origin/dest not found');
    }
    const dx = dest.x - origin.x;
    const dy = dest.y - origin.y;
    const D = Math.hypot(dx, dy);
    // Direction in 2D (rockets fly in a straight line between their endpoints
    // in the launch frame — which is fine since endpoints are at rest).
    const dir = D > 0 ? { x: dx / D, y: dy / D } : { x: 1, y: 0 };

    const a = config.aG * P.G_IN_NATURAL;
    const trip = D > 0
      ? P.planTrip(a, D, config.profile, config.vCruise)
      : null;

    const colorIdx = config._colorIdx ?? (Math.floor(Math.random() * ROCKET_COLORS.length));

    return {
      id: config.id || nextId(),
      kind: 'rocket',
      name: config.name,
      originId: config.originId,
      destId: config.destId,
      aG: config.aG,
      profile: config.profile,
      vCruise: config.vCruise,
      launchTime: config.launchTime,
      propulsionId: config.propulsionId || 'photon',
      dryMassKg: config.dryMassKg || 100000,
      trip,
      D, dir,
      originPos: { x: origin.x, y: origin.y },
      destPos: { x: dest.x, y: dest.y },
      color: ROCKET_COLORS[colorIdx % ROCKET_COLORS.length],
      _colorIdx: colorIdx,
    };
  }

  // Fuel state of a rocket at launch-frame time t (wraps physics helper)
  function rocketFuelAt(rocket, t) {
    if (!rocket.trip) return { totalMass: rocket.dryMassKg, fuelMass: 0, fuelMassInitial: 0, fuelFraction: 0 };
    const prop = P.propulsionById(rocket.propulsionId);
    const dt = t - rocket.launchTime;
    const state = P.rocketState(rocket.trip, dt);
    return P.fuelStateAt(rocket.trip, prop.v_ex, rocket.dryMassKg, state.tau);
  }

  // State of a rocket at a given launch-frame coordinate time t.
  // Returns { x, y, vx, vy, speed, gamma, tau, phase }
  function rocketStateAt(rocket, t) {
    if (!rocket.trip) {
      return {
        x: rocket.originPos.x, y: rocket.originPos.y,
        vx: 0, vy: 0, speed: 0, gamma: 1, tau: 0, phase: 'idle',
      };
    }
    const dt = t - rocket.launchTime;
    const s = P.rocketState(rocket.trip, dt);
    const x = rocket.originPos.x + rocket.dir.x * s.x;
    const y = rocket.originPos.y + rocket.dir.y * s.x;
    let phase = 'cruising';
    if (dt <= 0) phase = 'pre-launch';
    else if (dt >= rocket.trip.tTotal) phase = 'arrived';
    else if (rocket.trip.type === 'no-coast') {
      phase = dt <= rocket.trip.t1 ? 'accelerating' : 'decelerating';
    } else {
      if (dt <= rocket.trip.tAccel) phase = 'accelerating';
      else if (dt <= rocket.trip.tAccel + rocket.trip.tCruise) phase = 'cruising';
      else phase = 'decelerating';
    }
    return {
      x, y,
      vx: rocket.dir.x * s.v,
      vy: rocket.dir.y * s.v,
      speed: s.v,
      gamma: s.gamma,
      tau: s.tau,
      phase,
    };
  }

  // Message creation: emitted from an object at time t, toward a target location.
  // Travels at c in a straight line. We precompute arrival time so we can render.
  function createMessage(fromObj, toLoc, emitTime, scene) {
    let emitPos;
    if (fromObj.kind === 'location') {
      emitPos = { x: fromObj.x, y: fromObj.y };
    } else {
      // rocket — position at emit time
      const s = rocketStateAt(fromObj, emitTime);
      emitPos = { x: s.x, y: s.y };
    }
    const dx = toLoc.x - emitPos.x;
    const dy = toLoc.y - emitPos.y;
    const D = Math.hypot(dx, dy);
    const dir = D > 0 ? { x: dx / D, y: dy / D } : { x: 1, y: 0 };
    const arrivalTime = emitTime + D / P.C;
    return {
      id: nextId(),
      kind: 'message',
      fromId: fromObj.id,
      toId: toLoc.id,
      emitTime,
      emitPos,
      dir,
      distance: D,
      arrivalTime,
      color: '#9affd9',
    };
  }

  function messagePosAt(msg, t) {
    if (t < msg.emitTime) return null;
    if (t > msg.arrivalTime) return null;
    const dt = t - msg.emitTime;
    return {
      x: msg.emitPos.x + msg.dir.x * P.C * dt,
      y: msg.emitPos.y + msg.dir.y * P.C * dt,
    };
  }

  // Total sim duration = max of all rocket trip ends + all pending messages
  function sceneMaxTime(scene) {
    let t = 10; // minimum 10-year window
    for (const r of scene.rockets) {
      if (r.trip) t = Math.max(t, r.launchTime + r.trip.tTotal);
    }
    for (const m of scene.messages) {
      t = Math.max(t, m.arrivalTime);
    }
    return t * 1.05; // a little padding
  }

  function findObject(scene, id) {
    return scene.locations.find(l => l.id === id)
      || scene.rockets.find(r => r.id === id)
      || null;
  }

  function nextLocationColor(scene) {
    const used = new Set(scene.locations.map(l => l.color));
    for (const c of COLORS) if (!used.has(c)) return c;
    return COLORS[scene.locations.length % COLORS.length];
  }

  function addLocation(scene, name, x, y) {
    const loc = {
      id: nextId(),
      kind: 'location',
      name: name || ('Location ' + (scene.locations.length + 1)),
      x, y,
      color: nextLocationColor(scene),
    };
    scene.locations.push(loc);
    return loc;
  }

  function removeLocation(scene, id) {
    scene.locations = scene.locations.filter(l => l.id !== id);
    // Remove or orphan rockets that reference it
    scene.rockets = scene.rockets.filter(r => r.originId !== id && r.destId !== id);
    scene.messages = scene.messages.filter(m => m.toId !== id && m.fromId !== id);
  }

  function addRocket(scene, config) {
    const rocket = buildRocket(config, scene.locations);
    scene.rockets.push(rocket);
    return rocket;
  }

  function removeRocket(scene, id) {
    scene.rockets = scene.rockets.filter(r => r.id !== id);
    scene.messages = scene.messages.filter(m => m.fromId !== id);
  }

  function rebuildRockets(scene) {
    scene.rockets = scene.rockets.map(r => buildRocket(r, scene.locations));
  }

  NS.Scenarios = {
    createDefault,
    buildRocket,
    rocketStateAt,
    rocketFuelAt,
    createMessage,
    messagePosAt,
    sceneMaxTime,
    findObject,
    addLocation,
    removeLocation,
    addRocket,
    removeRocket,
    rebuildRockets,
    nextId,
    COLORS,
    ROCKET_COLORS,
  };
})();
