/* ============================================================
   physics.js — Relativistic math for the Space Travel sim.

   Units:
     - distance: light-years (ly)
     - time:     years (yr)
     - so c = 1 ly/yr  (natural units; keeps formulas clean)
     - acceleration: ly/yr²

   All equations derived from physics_reference.md.
   Pure functions only — no DOM, no state.
   ============================================================ */
(function () {
  'use strict';

  const NS = window.SpaceTravel = window.SpaceTravel || {};

  // ---------- Constants ----------
  const C = 1;                 // light-years per year
  const G_IN_NATURAL = 1.0323; // 1 g ≈ 1.0323 ly/yr²  (derived: 9.80665 m/s² * 31557600² s²/yr² / 9.4607e15 m/ly)
  const EPS = 1e-12;

  // ---------- Basic SR ----------
  function gamma(beta) {
    const b2 = beta * beta;
    if (b2 >= 1) return Infinity;
    return 1 / Math.sqrt(1 - b2);
  }

  // Boost event (t,x) into a frame moving at velocity v along +x (both in natural units).
  function lorentzBoost(t, x, v) {
    const g = gamma(v);
    return {
      t: g * (t - v * x),
      x: g * (x - v * t),
    };
  }

  // Inverse boost (back from moving frame into stationary frame).
  function lorentzBoostInverse(tp, xp, v) {
    return lorentzBoost(tp, xp, -v);
  }

  // ---------- Rindler (constant proper acceleration) ----------
  // Rocket at rest at origin at t=τ=0, constant proper acceleration a along +x.

  function rindlerXfromTau(a, tau) {
    return (1 / a) * (Math.cosh(a * tau) - 1);
  }
  function rindlerTfromTau(a, tau) {
    return (1 / a) * Math.sinh(a * tau);
  }
  function rindlerVfromTau(a, tau) {
    return Math.tanh(a * tau);
  }
  function rindlerGammaFromTau(a, tau) {
    return Math.cosh(a * tau);
  }

  function rindlerXfromT(a, t) {
    return (1 / a) * (Math.sqrt(1 + (a * t) * (a * t)) - 1);
  }
  function rindlerVfromT(a, t) {
    const at = a * t;
    return at / Math.sqrt(1 + at * at);
  }
  function rindlerTauFromT(a, t) {
    return (1 / a) * Math.asinh(a * t);
  }
  function rindlerGammaFromT(a, t) {
    return Math.sqrt(1 + (a * t) * (a * t));
  }

  // ---------- Trip planning ----------
  // A "trip" runs a rocket from one stationary point to another (distance D),
  // arriving at rest, with constant proper acceleration a.

  function planNoCoastTrip(a, D) {
    const arg = 1 + (a * D) / 2;
    const tau1 = (1 / a) * Math.acosh(arg);
    const t1 = Math.sqrt(D / a + (D * D) / 4); // = (1/a) sinh(a*tau1)
    const gammaMax = arg;
    const vMax = Math.tanh(a * tau1);
    return {
      type: 'no-coast',
      D, a,
      tau1, t1,
      tauTotal: 2 * tau1,
      tTotal: 2 * t1,
      vMax, gammaMax,
    };
  }

  function planCoastTrip(a, D, vCruise) {
    if (vCruise <= 0 || vCruise >= 1) return null;
    const gc = gamma(vCruise);
    const dAccel = (1 / a) * (gc - 1);
    if (2 * dAccel >= D) return null; // not enough room to coast
    const tauAccel = (1 / a) * Math.atanh(vCruise);
    const tAccel = gc * vCruise / a;
    const dCruise = D - 2 * dAccel;
    const tCruise = dCruise / vCruise;
    const tauCruise = tCruise / gc;
    return {
      type: 'coast',
      D, a, vCruise, gammaC: gc,
      dAccel, dCruise,
      tauAccel, tAccel,
      tauCruise, tCruise,
      tauTotal: 2 * tauAccel + tauCruise,
      tTotal: 2 * tAccel + tCruise,
      vMax: vCruise,
      gammaMax: gc,
    };
  }

  // Choose a trip profile. `profile` is 'auto' | 'no-coast' | 'coast'.
  function planTrip(a, D, profile, vCruise) {
    if (profile === 'no-coast') return planNoCoastTrip(a, D);
    if (profile === 'coast') {
      return planCoastTrip(a, D, vCruise) || planNoCoastTrip(a, D);
    }
    // auto: use coast if it fits, else no-coast
    const coast = planCoastTrip(a, D, vCruise);
    return coast || planNoCoastTrip(a, D);
  }

  // ---------- Rocket state at coordinate time ----------
  // Input: trip object, coordinate time t relative to LAUNCH TIME (t=0 at launch)
  // Returns { x, v, gamma, tau } — x is distance from origin along +x.

  function rocketState(trip, t) {
    if (t <= 0) return { x: 0, v: 0, gamma: 1, tau: 0 };
    if (t >= trip.tTotal) {
      return { x: trip.D, v: 0, gamma: 1, tau: trip.tauTotal };
    }

    if (trip.type === 'no-coast') {
      if (t <= trip.t1) {
        // accelerating
        return {
          x: rindlerXfromT(trip.a, t),
          v: rindlerVfromT(trip.a, t),
          gamma: rindlerGammaFromT(trip.a, t),
          tau: rindlerTauFromT(trip.a, t),
        };
      } else {
        // decelerating — mirror of accel phase
        const dt = trip.tTotal - t;
        return {
          x: trip.D - rindlerXfromT(trip.a, dt),
          v: rindlerVfromT(trip.a, dt), // still moving +x
          gamma: rindlerGammaFromT(trip.a, dt),
          tau: trip.tauTotal - rindlerTauFromT(trip.a, dt),
        };
      }
    }

    // coast
    if (t <= trip.tAccel) {
      return {
        x: rindlerXfromT(trip.a, t),
        v: rindlerVfromT(trip.a, t),
        gamma: rindlerGammaFromT(trip.a, t),
        tau: rindlerTauFromT(trip.a, t),
      };
    }
    if (t <= trip.tAccel + trip.tCruise) {
      const dtCruise = t - trip.tAccel;
      return {
        x: trip.dAccel + trip.vCruise * dtCruise,
        v: trip.vCruise,
        gamma: trip.gammaC,
        tau: trip.tauAccel + dtCruise / trip.gammaC,
      };
    }
    // decelerating
    const dt = trip.tTotal - t;
    return {
      x: trip.D - rindlerXfromT(trip.a, dt),
      v: rindlerVfromT(trip.a, dt),
      gamma: rindlerGammaFromT(trip.a, dt),
      tau: trip.tauTotal - rindlerTauFromT(trip.a, dt),
    };
  }

  // Map rocket's proper time τ → coordinate time t (inverse of rocketState().tau).
  // Simple monotone binary search; fast enough for interactive use.
  function coordTimeFromProperTime(trip, tau) {
    if (tau <= 0) return 0;
    if (tau >= trip.tauTotal) return trip.tTotal;
    let lo = 0, hi = trip.tTotal;
    for (let i = 0; i < 60; i++) {
      const mid = 0.5 * (lo + hi);
      const s = rocketState(trip, mid);
      if (s.tau < tau) lo = mid; else hi = mid;
      if (hi - lo < 1e-10) break;
    }
    return 0.5 * (lo + hi);
  }

  // ---------- Simultaneity / perspective ----------
  // For an inertial observer at rest at position x=x_obs moving at velocity v_obs
  // in the launch frame, their "now" slice at their proper time τ_obs corresponds
  // to events (t, x) in the launch frame satisfying:
  //   t' = γ_obs (t - v_obs (x - x_obs)) = τ_obs
  // For an observer at rest (v_obs = 0): t = τ_obs (their coordinate time equals their proper time).

  // For our purposes, "play from observer X" means: the master time parameter is
  // that observer's proper time. We map it to launch-frame coordinate time, then
  // everyone else's state follows deterministically in the launch frame.
  //
  // For Earth (x=0, at rest): tau_earth = t_launch_frame
  // For destination (x=D, at rest): tau_dest = t_launch_frame
  // For rocket (accelerating): use coordTimeFromProperTime(trip, tau_rocket) to get t.

  // ---------- Messages (light signals) ----------
  // A message is a light pulse emitted at (tEmit, xEmit) traveling at ±c.
  // Position in launch frame at coordinate time t:
  function messageX(tEmit, xEmit, direction, t) {
    if (t < tEmit) return null;
    return xEmit + direction * C * (t - tEmit);
  }

  // Find coordinate time when light emitted at (tEmit, xEmit) reaches stationary
  // receiver at xRecv.
  function messageArrivalStationary(tEmit, xEmit, xRecv) {
    return tEmit + Math.abs(xRecv - xEmit) / C;
  }

  // Find coordinate time when light emitted at (tEmit, xEmit) in +x direction
  // hits the rocket (traveling per `trip`, launched at tLaunch in +x from origin).
  // Returns { t, x, tau } of reception, or null if never catches up.
  function messageArrivalRocket(trip, tLaunch, tEmit, xEmit) {
    // rocket position at launch-frame time t: rocketState(trip, t - tLaunch).x, valid for t in [tLaunch, tLaunch+tTotal]
    // light position: xEmit + C*(t - tEmit) for t >= tEmit (assuming +x direction)
    // Solve f(t) = light(t) - rocket(t) = 0
    const rocketPos = (t) => {
      if (t < tLaunch) return 0;
      if (t > tLaunch + trip.tTotal) return trip.D;
      return rocketState(trip, t - tLaunch).x;
    };
    const lightPos = (t) => xEmit + C * (t - tEmit);

    const tStart = Math.max(tEmit, tLaunch);
    // Check feasibility near the end: does light ever catch up before rocket arrives?
    const tEnd = tLaunch + trip.tTotal;
    const fStart = lightPos(tStart) - rocketPos(tStart);
    const fEnd = lightPos(tEnd) - rocketPos(tEnd);

    if (fStart >= 0) {
      // light is already ahead of rocket — caught up immediately? Find intersection going back.
      // (Should be rare for Earth->rocket; but e.g. light from destination catches up immediately.)
      return {
        t: tStart,
        x: lightPos(tStart),
        tau: tStart >= tLaunch ? rocketState(trip, tStart - tLaunch).tau : 0,
      };
    }
    if (fEnd < 0) {
      // rocket arrived; check if light catches up after that — rocket now stationary at D.
      // light at D: xEmit + C*(t - tEmit) = D → t = tEmit + (D - xEmit)/C
      const tArrive = tEmit + (trip.D - xEmit) / C;
      if (tArrive >= tEnd) {
        return { t: tArrive, x: trip.D, tau: trip.tauTotal };
      }
      // shouldn't happen if fEnd < 0, but guard.
      return null;
    }

    // Bisection for root
    let lo = tStart, hi = tEnd;
    for (let i = 0; i < 80; i++) {
      const mid = 0.5 * (lo + hi);
      const f = lightPos(mid) - rocketPos(mid);
      if (f < 0) lo = mid; else hi = mid;
      if (hi - lo < 1e-10) break;
    }
    const tHit = 0.5 * (lo + hi);
    return {
      t: tHit,
      x: lightPos(tHit),
      tau: rocketState(trip, tHit - tLaunch).tau,
    };
  }

  // ---------- Rocket equation (fuel) ----------
  // Works in SI units (m/s, kg). Ship physics, not the 2D-sim natural units.

  const C_MPS = 299792458;
  const G0 = 9.80665;

  // Mass ratio for a single accel maneuver from rest → v (launch frame),
  // with exhaust speed v_ex (rocket frame). Uses the relativistic rocket
  // equation; reduces to Tsiolkovsky as v/c → 0.
  //   M0/Mf = ((c+v)/(c-v))^(c/(2·v_ex))
  function massRatioRelativistic(v_mps, v_ex_mps) {
    if (v_mps <= 0) return 1;
    if (v_ex_mps <= 0) return Infinity;
    const beta = v_mps / C_MPS;
    if (beta >= 1) return Infinity;
    const exponent = C_MPS / (2 * v_ex_mps);
    return Math.pow((1 + beta) / (1 - beta), exponent);
  }

  // Classical Tsiolkovsky — valid at non-relativistic speeds
  //   M0/Mf = exp(Δv / v_ex)
  function massRatioClassical(v_mps, v_ex_mps) {
    if (v_ex_mps <= 0) return Infinity;
    return Math.exp(v_mps / v_ex_mps);
  }

  // Full-trip mass ratio for N maneuvers (2 = accel+decel one-way, 4 = round trip).
  function tripMassRatio(v_mps, v_ex_mps, maneuvers) {
    const R = massRatioRelativistic(v_mps, v_ex_mps);
    return Math.pow(R, maneuvers);
  }

  // Fuel mass given dry mass and total mass ratio
  function fuelMass(dryMassKg, massRatio) {
    return dryMassKg * (massRatio - 1);
  }

  // Minimum kinetic-energy cost for the dry payload at peak velocity
  // (lower bound; actual energy delivered to exhaust is much higher).
  //   E_kinetic = (γ − 1) · m · c²
  function kineticEnergy(dryMassKg, v_mps) {
    const beta = v_mps / C_MPS;
    if (beta >= 1) return Infinity;
    const g = 1 / Math.sqrt(1 - beta * beta);
    return (g - 1) * dryMassKg * C_MPS * C_MPS;
  }

  // Propulsion catalog (exhaust velocities in m/s).
  const PROPULSION = [
    { id: 'chemical',  name: 'Chemical (H₂/O₂)',   v_ex: 4400,     note: 'Saturn V / Shuttle' },
    { id: 'nuclear',   name: 'Nuclear thermal',    v_ex: 9000,     note: 'NERVA, 1960s tested' },
    { id: 'ion',       name: 'Ion engine',         v_ex: 30000,    note: 'Current: Dawn, BepiColombo' },
    { id: 'vasimr',    name: 'VASIMR (plasma)',    v_ex: 50000,    note: 'Experimental' },
    { id: 'orion',     name: 'Nuclear pulse (Orion)', v_ex: 100000, note: '1960s design study' },
    { id: 'fusion',    name: 'Fusion drive',       v_ex: 1e7,      note: '~3% c, theoretical' },
    { id: 'antimatter',name: 'Antimatter',         v_ex: 1e8,      note: '~33% c, theoretical' },
    { id: 'photon',    name: 'Photon drive',       v_ex: C_MPS,    note: 'Theoretical ceiling' },
  ];

  function propulsionById(id) {
    return PROPULSION.find(p => p.id === id) || PROPULSION[PROPULSION.length - 1];
  }

  // ---------- Fuel over the course of a trip ----------
  // Returns cumulative rapidity BURNED (absolute Δφ summed across maneuvers)
  // as of proper time tau on the trip. Accel accumulates φ, cruise is flat,
  // decel accumulates another φ (even though it lowers velocity).
  function rapidityBurned(trip, tau) {
    if (tau <= 0) return 0;
    if (tau >= trip.tauTotal) return trip.type === 'coast'
      ? 2 * trip.a * trip.tauAccel
      : 2 * trip.a * trip.tau1;
    if (trip.type === 'no-coast') {
      if (tau <= trip.tau1) return trip.a * tau;
      const tauDecel = tau - trip.tau1;
      return trip.a * trip.tau1 + trip.a * tauDecel;
    }
    // coast
    if (tau <= trip.tauAccel) return trip.a * tau;
    if (tau <= trip.tauAccel + trip.tauCruise) return trip.a * trip.tauAccel;
    const tauDecel = tau - trip.tauAccel - trip.tauCruise;
    return trip.a * trip.tauAccel + trip.a * tauDecel;
  }

  // Fuel state at proper time tau given propulsion and dry mass.
  //
  // M(τ)/M_initial = exp(−Δφ · c / v_ex)
  //
  // Starting mass = dryMass × R²  (stop trip: 2 burns of ratio R each).
  // Returns { totalMass, fuelMass, fuelMassInitial, fuelFraction } (kg, kg, kg, 0..1).
  function fuelStateAt(trip, v_ex_mps, dryMassKg, tau) {
    const vex_nat = v_ex_mps / C_MPS;       // fraction of c
    const phi = rapidityBurned(trip, tau);  // natural units (c=1)
    // Full-trip mass ratio for a stop trip (2 burns)
    const phi_peak = trip.type === 'coast'
      ? trip.a * trip.tauAccel
      : trip.a * trip.tau1;
    const R_trip = Math.exp((2 * phi_peak) / vex_nat);         // M_initial / M_final
    const M_initial = dryMassKg * R_trip;
    const M_current = M_initial * Math.exp(-phi / vex_nat);
    const fuelMass = Math.max(0, M_current - dryMassKg);
    const fuelInitial = Math.max(0, M_initial - dryMassKg);
    return {
      totalMass: M_current,
      fuelMass,
      fuelMassInitial: fuelInitial,
      fuelFraction: fuelInitial > 0 ? fuelMass / fuelInitial : 0,
    };
  }

  // ---------- Export ----------
  NS.Physics = {
    C, G_IN_NATURAL, EPS,
    C_MPS, G0,
    gamma,
    lorentzBoost, lorentzBoostInverse,
    // Rindler
    rindlerXfromTau, rindlerTfromTau, rindlerVfromTau, rindlerGammaFromTau,
    rindlerXfromT, rindlerVfromT, rindlerTauFromT, rindlerGammaFromT,
    // Trips
    planNoCoastTrip, planCoastTrip, planTrip,
    rocketState, coordTimeFromProperTime,
    // Messages
    messageX, messageArrivalStationary, messageArrivalRocket,
    // Fuel
    massRatioRelativistic, massRatioClassical, tripMassRatio,
    fuelMass, kineticEnergy, PROPULSION, propulsionById,
    rapidityBurned, fuelStateAt,
  };
})();
