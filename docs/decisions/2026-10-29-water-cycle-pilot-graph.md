# Water Cycle pilot graph (D44)

Settled by the user on 2026-10-29. This is the structure of the pilot curriculum (D42, task L1). Teachers author the explanations, objectives and teach-back questions. Where they leave one empty, A6 drafts it for teacher approval.

## Scope and grounding

- **Standard:** NGSS MS-ESS2-4. Develop a model to describe the cycling of water through Earth's systems, driven by energy from the sun and the force of gravity.
- **Ownership:** The curriculum is authored and approved in-house. OpenSciEd Unit 6.3 (*Weather, Climate & Water Cycling*, v1.0, CC BY 4.0) is the conceptual reference and vocabulary inventory, not an import. Any reused text or figure carries its attribution (D31 as amended).
- **Tutors:** Ms. Ivy states facts only from vault sources and asks questions where none exists (D35). Milo checks teach-backs against each idea's objective and key points.
- **Clicking an idea** opens its teaching and practice page (S6).

## Ideas

`scope` and `key_terms` are D43. `layer` is D41/C12. `unit` names the unit an idea supports. Units: 1 *Water goes up*, 2 *Water in the sky*, 3 *Water comes down and moves on*.

| # | idea_id | Title | scope | layer | unit | category | standard_codes | requires | key_terms (from the OpenSciEd 6.3 word wall) |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `thermal` | Thermal Energy & Particle Motion | prerequisite | mechanism | 1 | Force | MS-PS1-4, MS-PS3-4 | | particles, energy, temperature, mass |
| 2 | `solar` | Solar Radiation & Surface Heating | prerequisite | mechanism | 1 | Force | MS-PS4-2, MS-PS3-4 | | incoming light, reflected, absorbed, conduction, lux |
| 3 | `evap` | Evaporation & Humidity | core | process | 1 | Process | MS-ESS2-4 | thermal | evaporation, humidity, relative humidity, parcel of air |
| 4 | `convection` | Air Density & Convection | core | process | 1 | Process | MS-ESS2-4 | solar | density, convection, fluid, altitude, atmosphere |
| 5 | `cond` | Condensation & Cloud Formation | core | process | 2 | Process | MS-ESS2-4 | evap | condensation, condensation/boiling point, freezing/melting point, deposition, cloud condensation nuclei (CCN) |
| 6 | `pressure` | Air Pressure & Updrafts | core | process | 2 | Force | MS-ESS2-4 | convection | higher/lower pressure air, air pressure, lift force, downdrafts, updrafts, currents, barometer |
| 7 | `precip` | Precipitation | core | process | 3 | Process | MS-ESS2-4 | cond | precipitation, hail, weather conditions, hailstone |
| 8 | `runoff` | Runoff, Collection & Gravity | core | process | 3 | Process | MS-ESS2-4 | precip | gravity, runoff, collection, infiltration, groundwater, watershed |
| 9 | `fronts` | Air Masses & Fronts | extension | process | 3 | Thing | MS-ESS2-5 | precip, convection | air mass, front, forecast |
| 10 | `climates` | Regional Climates | extension | process | 3 | Thing | MS-ESS2-6 | fronts | climate, tropical rainforest, temperate rainforest, hurricane |

- Gravity moved from Air Pressure's terms to Runoff, Collection & Gravity. That idea now teaches the force that returns water downhill.
- If the trace-back later needs gravity as a mechanism of its own, gravity can be split out as a prerequisite and mechanism idea, as C12 allows.

## Links

All links have `importance` 3 unless a teacher changes it. The relations become quiz questions (C3).

| From | Relation | To |
|---|---|---|
| Thermal Energy & Particle Motion | powers | Evaporation & Humidity |
| Solar Radiation & Surface Heating | drives | Air Density & Convection |
| Evaporation & Humidity | supplies water vapour for | Condensation & Cloud Formation |
| Air Density & Convection | triggers | Condensation & Cloud Formation |
| Air Density & Convection | creates | Air Pressure & Updrafts |
| Condensation & Cloud Formation | leads to | Precipitation |
| Air Pressure & Updrafts | suspends or drops | Precipitation |
| Precipitation | flows downhill as | Runoff, Collection & Gravity |
| Runoff, Collection & Gravity | returns water to | Evaporation & Humidity |
| Precipitation | scales up to | Air Masses & Fronts |
| Air Density & Convection | scales up to | Air Masses & Fronts |
| Air Masses & Fronts | determine | Regional Climates |

- The links close the surface loop: evaporation → condensation → precipitation → runoff → evaporation.
- `requires` stays acyclic: runoff returns water to evaporation as a link, never as a prerequisite. This is the loop C12-F2 allows.

## Layout check

These are the results of running the current ranking and layout code (`packages/domain`, unchanged) on this graph on 2026-10-29.

- **All 10 ideas on one map:** the centre is Air Density & Convection. A prerequisite (Thermal Energy) and an extension (Air Masses & Fronts) land on the inner ring. This is why D43 lays out each scope separately (C16).
- **Core ideas only:** the centre is Condensation & Cloud Formation. Precipitation, Evaporation, Air Density, Air Pressure and Runoff form the inner ring, and all 7 core links are kept.
- **Choosing the centre:** the centre is whichever idea has the most links. To put another idea at the centre, raise the importance of its links in the sheet.
