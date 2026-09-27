# Physics Reference — Relativistic Space Travel

All equations needed to simulate rockets accelerating to near-light speed, decelerating at the destination, and exchanging messages between locations. Units are SI unless noted.

---

## 1. Constants & Unit Choices

| Symbol | Meaning | Value |
|---|---|---|
| `c` | Speed of light | 299,792,458 m/s |
| `g` | Earth gravity (comfortable accel for humans) | 9.80665 m/s² |
| `ly` | Light-year | 9.4607×10¹⁵ m (= c · 1 year) |
| `AU` | Astronomical unit | 1.496×10¹¹ m |
| `year` (Julian) | | 3.15576×10⁷ s |

### Natural units for the app
To keep numbers sane, use **light-years for distance** and **years for time**. Then `c = 1 ly/yr`. In these units:
- 1 g ≈ 1.032 ly/yr² (very close to 1)
- A rocket at 1 g reaches relativistic speeds (γ≈2) after ~1 proper year.

Let `β = v/c` (dimensionless velocity) and `γ = 1/√(1-β²)` (Lorentz factor). These two are the stars of the show.

---

## 2. Core Special Relativity

### 2.1 Lorentz factor
```
γ = 1 / √(1 - β²)      where β = v/c
```
- At β = 0: γ = 1 (no relativistic effect)
- At β = 0.5: γ ≈ 1.155
- At β = 0.9: γ ≈ 2.294
- At β = 0.99: γ ≈ 7.089
- At β = 0.999: γ ≈ 22.37

### 2.2 Time dilation
A moving clock ticks slower when viewed from a stationary frame:
```
Δt_stationary = γ · Δτ_moving
```
`τ` (proper time) = time experienced ON the moving object.
`t` (coordinate time) = time as measured by stationary observer.

### 2.3 Length contraction
Moving objects appear shorter along direction of motion:
```
L = L₀ / γ
```
`L₀` = proper length (rest frame), `L` = length in frame where object moves.

### 2.4 Lorentz transformation (between two inertial frames)
Frame S' moves at velocity `v` along +x relative to S. To convert an event (t, x, y, z) in S to (t', x', y', z') in S':
```
t' = γ (t - v·x / c²)
x' = γ (x - v·t)
y' = y
z' = z
```
Inverse (S' → S): swap primes and negate `v`.

### 2.5 Relativistic velocity addition
If an object moves at `u` in frame S, and S' moves at `v` in S (both along x):
```
u' = (u - v) / (1 - u·v/c²)
```
Inverse: `u = (u' + v) / (1 + u'·v/c²)`. Never exceeds c.

### 2.6 Invariant spacetime interval
```
Δs² = c²Δt² - Δx² - Δy²     (2D spatial version)
```
Same value in every inertial frame. `Δs² > 0` timelike, `= 0` lightlike, `< 0` spacelike.

---

## 3. Relativistic Rocket (Constant Proper Acceleration)

A rocket with acceleration `a` as felt INSIDE (proper acceleration) traces a **hyperbolic worldline** through spacetime. Let τ be proper time on the rocket; t and x are coordinates in the launch frame (rocket starts at rest at origin at τ = t = 0).

### 3.1 Parametric equations (launch frame)
```
x(τ) = (c²/a) · [cosh(aτ/c) - 1]
t(τ) = (c/a)  · sinh(aτ/c)
v(τ) = c · tanh(aτ/c)
γ(τ) = cosh(aτ/c)
```

### 3.2 Expressed in coordinate time t (launch frame)
```
x(t) = (c²/a) · [√(1 + (at/c)²) - 1]
v(t) = a·t / √(1 + (at/c)²)
γ(t) = √(1 + (at/c)²)
τ(t) = (c/a) · arcsinh(a·t/c)
```

### 3.3 Identities (useful for conversions)
```
a·t/c       = sinh(aτ/c)
1 + a·x/c²  = cosh(aτ/c) = γ
β = v/c     = tanh(aτ/c)
```

### 3.4 Quick numeric example (1 g acceleration)
In light-years and years, `a ≈ 1.032 ly/yr²`:
- After τ = 1 yr proper time: v ≈ 0.77c, γ ≈ 1.54, distance ≈ 0.56 ly
- After τ = 2 yr: v ≈ 0.97c, γ ≈ 3.76, distance ≈ 2.90 ly
- After τ = 5 yr: v ≈ 0.99993c, γ ≈ 75, distance ≈ 83 ly
- After τ = 10 yr: γ ≈ 11013, distance ≈ 10600 ly (crosses the galaxy!)

---

## 4. Full Trip Profiles

### 4.1 Accelerate-then-decelerate (no cruise phase)
Rocket accelerates at `+a` for the first half of distance `D`, then decelerates at `-a` for the second half, arriving at rest.

Let `τ₁` = proper time for the accelerate half.
```
cosh(a·τ₁/c) = 1 + aD / (2c²)
τ₁           = (c/a) · arcosh(1 + aD/(2c²))

Total proper time     : τ_trip = 2·τ₁
Total coordinate time : t_trip = 2·(c/a)·sinh(a·τ₁/c)
                              = 2·√( D/a + D²/(4c²) )   [useful closed form]
Peak velocity         : β_max = tanh(a·τ₁/c)
Peak γ                : γ_max = 1 + aD/(2c²)
```

### 4.2 Accelerate-cruise-decelerate
Accelerate to velocity `v_cruise` (γ_c = 1/√(1-β_c²)), cruise, then decelerate symmetrically.

**Accelerate phase:**
```
d_accel = (c²/a) · (γ_c - 1)
τ_accel = (c/a) · artanh(β_c) = (c/a) · arcosh(γ_c)
t_accel = (c/a) · sinh(a·τ_accel/c) = γ_c · v_cruise / a
```
**Cruise phase** (distance `D - 2·d_accel`, must be ≥ 0):
```
t_cruise = (D - 2·d_accel) / v_cruise
τ_cruise = t_cruise / γ_c
```
**Total:**
```
τ_trip = 2·τ_accel + τ_cruise
t_trip = 2·t_accel + t_cruise
```

### 4.3 Arriving "stationary relative to destination"
If the destination itself is moving at `v_dest` in the launch frame, the rocket must match velocity. Do the accel/decel calculation in the **destination's rest frame**. Distance used is the distance in that frame (length-contracted from the launch frame if the destination is moving).

---

## 5. Light Signals & Message Passing

### 5.1 Light worldline in 2D flat spacetime
A light pulse emitted at event `(t₀, x₀, y₀)` traveling in direction `(dx, dy)` with `√(dx² + dy²) = 1`:
```
x(t) = x₀ + c · dx · (t - t₀)
y(t) = y₀ + c · dy · (t - t₀)
```
The pulse's **future light cone** is the set of all events it could reach.

### 5.2 Earth-Star-Rocket scenario
Setup: Earth at x=0, Star at x=D (both at rest in launch frame). Rocket leaves Earth at t=0 on Rindler trajectory toward Star.

**Light from Star to Earth** (sent at coordinate time t_s from Star):
- Arrives at Earth at `t_earth = t_s + D/c`
- (For the observer on Earth, the round trip of any reply is `2D/c`.)

**Light from Earth chasing the rocket** (sent at t_e from Earth, +x direction):
Light: `x_light(t) = c·(t - t_e)`
Rocket: `x_rocket(t) = (c²/a)·[√(1 + (at/c)²) - 1]`
Solve `x_light(t) = x_rocket(t)` for reception time. Closed form (valid if rocket keeps accelerating):
```
t_receive = (1/2)·(t_e + c/a) + (c²/a)·(1/(2c)·…)
```
Easiest to solve numerically (Newton iteration on `f(t) = x_light(t) - x_rocket(t) = 0`). Note: if the rocket accelerates forever, messages sent from Earth after `t_e = c/a` (the Rindler horizon crossing) NEVER catch up. This is the **Rindler event horizon**.

**Light from rocket back to Earth**: always arrives eventually (rocket is behind its own forward light cone). Time of arrival at Earth from event (t_r, x_r) on rocket's worldline: `t_arrive_earth = t_r + x_r/c`.

### 5.3 Finite-speed message relay during a trip
To simulate "Earth sends update, rocket replies, Earth receives reply":
1. Earth emission event: `(t_e, 0)`.
2. Rocket reception: solve forward light cone intersecting rocket worldline (numerical).
3. Rocket immediately replies; reply worldline is `x = x_r - c·(t - t_r)`.
4. Earth reception: `t_earth_reply = t_r + x_r/c`.

The rocket's proper time between receiving and sending is ~0 (instant reply) but Earth round-trip delay grows as the rocket recedes.

---

## 6. Relativistic Doppler Effect

Signals sent between observers in relative motion experience frequency shifts.

### 6.1 Longitudinal (along line of sight)
Source recedes from observer at speed v (β = v/c):
```
f_observed / f_source = √((1 - β)/(1 + β))     [redshift]
```
Source approaches observer:
```
f_observed / f_source = √((1 + β)/(1 - β))     [blueshift]
```

### 6.2 Transverse (perpendicular at moment of closest approach)
Purely due to time dilation:
```
f_observed / f_source = 1/γ = √(1 - β²)
```

### 6.3 General angle θ (measured in observer's frame, from direction of motion)
```
f_observed / f_source = 1 / (γ · (1 - β·cos θ))
```

### 6.4 Application to message visualization
A periodic beacon on the rocket (e.g., 1 pulse per rocket-second) will appear to Earth as pulses arriving further and further apart as the rocket recedes — useful to animate the "redshift" of communication visually.

---

## 7. Simultaneity & Spacetime Diagrams

### 7.1 Lines of simultaneity (2D: t vs x)
An observer at rest in frame S sees horizontal lines (constant t) as "now."
An observer moving at β relative to S has lines of simultaneity with slope `β` on the Minkowski diagram (t vertical, x horizontal, both in units of ct and x so light is 45°).

Formally, the set of events S' calls "simultaneous with their now" (`t' = 0`) is:
```
t = (v/c²) · x        in frame S
```
→ on a (ct, x) diagram, these are lines of slope `v/c = β`.

### 7.2 "Play from an observer's perspective"
To animate events in observer O's frame:
- Compute proper time of O by integrating along its worldline.
- For each tick of O's proper time, draw the current Minkowski "now" hyperplane through O.
- Show where other worldlines intersect that hyperplane.

For an **inertial** observer moving at constant v, the hyperplane is `t - (v/c²)·x = constant` through O's position.
For an **accelerating** observer (Rindler), the instantaneous hyperplane is tangent to the observer's velocity at that instant — still a line with slope β(τ) through the observer's event.

### 7.3 Light cone at an event
From event (t₀, x₀, y₀):
- Future cone: `c·(t-t₀) ≥ √((x-x₀)² + (y-y₀)²)` with `t > t₀`
- Past cone: same with `t < t₀`
Useful for showing "what can this observer influence" and "what can it know about right now."

---

## 8. Twin Paradox & Age Differences

Two identical clocks synchronized at launch; one stays, one travels.
After a round trip `Earth → Star (D ly) → Earth` with symmetric 4-phase journey (accelerate, decelerate, stop, accelerate back, decelerate):

```
τ_traveler = 4 · (c/a) · arcosh(1 + aD/(2c²))
t_earth    = 4 · √( D/a + D²/(4c²) ) · (1/2)... = 2·t_trip_one_way
age_difference = t_earth - τ_traveler
```

At 1 g to Proxima Centauri (D = 4.25 ly) and back: Earth ≈ 12 yr, traveler ≈ 7.1 yr.
At 1 g to Andromeda (D = 2.5 Mly) and back: Earth ≈ 5 Myr, traveler ≈ 57 yr. (!!)

---

## 9. Computational Recipes for the Simulation

### 9.1 Integrating a rocket worldline
If using numerical ODE (needed for arbitrary acceleration profiles):
```
dx/dt = v
dv/dt = a_proper · (1 - v²/c²)^(3/2)       [so it never exceeds c]
```
For constant `a_proper`, prefer the closed-form equations in §3 — they're exact and don't accumulate error.

### 9.2 Finding when a light signal meets a worldline
Binary search or Newton's method on:
```
f(t) = x_signal(t) - x_object(t)
```
Bracket: start at emission time; use c·(t - t_emit) as upper bound proxy. Typically converges in <20 iterations.

### 9.3 Transforming a full trajectory into a new observer's frame
For each sampled event (t, x) on the trajectory, apply Lorentz transform with the observer's velocity. For an accelerating observer, the natural frame is their instantaneous rest frame at proper time τ, and visualizations usually "play" by sliding the simultaneity line.

### 9.4 Handling enormous ranges
Use log scales or zoomable plots. Typical user scenarios:
- Local (Earth ↔ Moon): light-seconds, ms resolution
- Interplanetary: light-minutes
- Nearby stars: light-years, years
- Galactic: kly, decades

---

## 10. Summary of Variables

| Symbol | Meaning | Frame |
|---|---|---|
| `τ` | proper time | on a specific worldline |
| `t` | coordinate time | specific chosen frame |
| `x, y` | spatial coordinates | specific chosen frame |
| `v`, `β=v/c` | velocity | specific chosen frame |
| `γ` | Lorentz factor | derived from β |
| `a` | proper acceleration | felt on rocket |
| `D` | trip distance | in frame where endpoints are at rest |
| `f` | signal frequency | specific chosen frame |

---

---

## 11. Fuel, Mass, and the Rocket Equation

Rockets work by throwing mass backward. As fuel burns, the ship loses mass, so a given thrust produces more acceleration. This feedback is the whole reason the "fuel for fuel" problem is ugly — every extra kg of fuel you load requires more fuel to accelerate it, leading to exponential scaling.

### 11.1 Tsiolkovsky rocket equation (non-relativistic)
For a rocket expelling propellant at exhaust velocity `v_ex` (in the rocket's rest frame):
```
Δv = v_ex · ln(M₀ / M_f)
M₀ / M_f = exp(Δv / v_ex)
fuel_mass = M₀ − M_f = M_f · (exp(Δv / v_ex) − 1)
```
- `M₀` = initial total mass (dry + fuel)
- `M_f` = final dry mass
- The `exp()` naturally accounts for "fuel for fuel" — it IS the recursive self-weighing; no correction needed.

### 11.2 Specific impulse
Engineers usually quote `I_sp` (specific impulse, in seconds):
```
v_ex = I_sp · g₀       where g₀ = 9.80665 m/s²
```
So `I_sp = 450 s` ⇒ `v_ex = 4413 m/s`.

### 11.3 Relativistic rocket equation (single accel phase)
For a rocket that accelerates from rest to velocity `v` in the launch frame, ejecting exhaust at speed `v_ex` in the **rocket's** instantaneous rest frame:
```
M₀ / M_f = ((c + v) / (c − v))^(c / (2 · v_ex))
         = ((1 + β) / (1 − β))^(c / (2 · v_ex))
```
Using rapidity `φ = artanh(β)`:
```
M₀ / M_f = exp(φ · c / v_ex)
```
This reduces to Tsiolkovsky as β → 0 (then φ → β and the exponent → v/v_ex).

### 11.4 Full trips (multiple burns)
For each acceleration or deceleration maneuver, multiply mass ratios:

| Trip type | Maneuvers | Mass ratio |
|---|---|---|
| Accelerate only (coast forever) | 1 | `R` |
| One-way, arriving at rest | 2 (accel + decel) | `R²` |
| Round trip, arriving at rest | 4 (accel, decel, accel, decel) | `R⁴` |

Where `R = ((1+β)/(1−β))^(c/(2v_ex))`.

### 11.5 Photon rocket (v_ex = c)
The theoretical best chemistry-free propellant — pure light:
```
M₀ / M_f = √((1 + β) / (1 − β))     (single phase)
```
At β = 0.9: mass ratio ≈ 4.36 per maneuver, 19 for full one-way stop.

### 11.6 Exhaust velocities of real and proposed propellants
| Propellant | v_ex (m/s) | I_sp (s) | Notes |
|---|---|---|---|
| Solid rocket | 2,500 | 250 | SRBs |
| Liquid H₂/O₂ (chemical) | 4,400 | 450 | Space Shuttle |
| Monopropellant (hydrazine) | 2,250 | 230 | Satellite thrusters |
| Nuclear thermal (NERVA) | 9,000 | 900 | Tested 1960s |
| Ion engine (Hall / gridded) | 30,000 | 3,000 | Current — Dawn, BepiColombo |
| VASIMR | 50,000 | 5,000 | Experimental |
| Nuclear pulse (Orion) | 100,000 | 10,000 | 1960s design study |
| Fusion (direct) | ~1×10⁷ | ~1×10⁶ | ~3% c, theoretical |
| Antimatter annihilation | ~1×10⁸ | ~1×10⁷ | ~33% c, theoretical |
| Photon drive | 3×10⁸ (c) | 3×10⁷ | Theoretical ceiling |

### 11.7 Energy delivered to the payload
Kinetic energy of the final ship (dry, moving at v):
```
E_kinetic = (γ − 1) · M_f · c²
```
Total exhaust energy is higher than this because of inefficiency. A useful back-of-envelope:
```
E_required ≳ (γ − 1) · M_f · c²     (ideal case)
```
1 Hiroshima bomb ≈ 6.3×10¹³ J, 1 megaton TNT ≈ 4.184×10¹⁵ J. Useful for scaling.

### 11.8 Worked examples

**Trip to Proxima Centauri (4.25 ly) at peak β = 0.5, one-way stop**
- Chemical rocket (v_ex = 4,400 m/s): R = ((1.5/0.5))^(3e8 / 8800) = 3^34091 ≈ 10^16253 → **impossible**.
- Ion (v_ex = 30,000): R = 3^5000 → still impossible.
- Fusion (v_ex = 1e7): R = 3^15 ≈ 1.4×10⁷, so one-way stop needs (1.4×10⁷)² = 2×10¹⁴ mass ratio. Still impractical.
- Antimatter (v_ex = 1e8): R = 3^1.5 ≈ 5.2, one-way stop ~27. Feasible.
- Photon (v_ex = c): R = √3 ≈ 1.73, one-way stop ~3. Best case.

**Key lesson:** For relativistic one-way trips, only antimatter or photon rockets are plausible. For β ≤ 0.1 (still fast, 42 years to Proxima), fusion becomes feasible.

---

## Sources (verified)
- [Relativistic Rocket — Baez (UCR)](https://math.ucr.edu/home/baez/physics/Relativity/SR/Rocket/rocket.html)
- [Rindler coordinates — Wikipedia](https://en.wikipedia.org/wiki/Rindler_coordinates)
- [Acceleration (special relativity) — Wikipedia](https://en.wikipedia.org/wiki/Acceleration_(special_relativity))
- [Relativistic Doppler effect — Wikipedia](https://en.wikipedia.org/wiki/Relativistic_Doppler_effect)
- [HyperPhysics: Relativistic Doppler](http://hyperphysics.phy-astr.gsu.edu/hbase/Relativ/reldop2.html)
- [Tsiolkovsky rocket equation — Wikipedia](https://en.wikipedia.org/wiki/Tsiolkovsky_rocket_equation)
- [Specific impulse — Wikipedia](https://en.wikipedia.org/wiki/Specific_impulse)
