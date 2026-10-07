import { LAWS } from "./laws";
import { CHEMISTRY, BIO_NUTRIENTS, ROCK, CLAY } from "./chemistry";
import { MATERIALS } from "./content";
import { STAR, PLANET, MOON, LUNAR_PERIOD, ORBITAL_PERIOD } from "./planet";
import { BIOTA_MODEL, FAUNA, FLORA } from "./life";
import { FOUNDING } from "./founding";
import { THERMODYNAMICS } from "./thermodynamics";

export const NATURAL_MODEL = Object.freeze({
  laws: LAWS,
  materials: MATERIALS,
  chemistry: {
    ...CHEMISTRY,
    biologicalMinerals: BIO_NUTRIENTS,
    rock: ROCK,
    clay: CLAY,
    units:
      "kg by element; temperatures in °C except periodic-table reference data in K",
  },
  universe: {
    star: STAR,
    planet: PLANET,
    satellite: MOON,
    orbitalDays: ORBITAL_PERIOD,
    lunarDays: LUNAR_PERIOD,
  },
  biosphere: { ...BIOTA_MODEL, fauna: FAUNA, flora: FLORA },
  founding: FOUNDING,
  thermodynamics: THERMODYNAMICS,
  chronology: {
    epoch: PLANET.epoch,
    planetaryAgeAtEpochYears: PLANET.ageYears,
    tickSeconds: 900,
    description:
      "One persistent integer tick drives every system. The observer calendar inserts whole days to follow the orbital year; local solar time depends on longitude and orbital position. The calendar is not an institution imposed on societies.",
  },
  scales: {
    peopleHours: 0.25,
    weatherAndEcologyHours: 1,
    tectonicsHours: 24,
    surfaceCellMetres: 10,
    regionSideCells: 32,
  },
  transport:
    "Local wind-driven eddy exchange moves equal volumes of air, heat, vapor, cloud droplets, and mineral dust. A shared well-mixed upper-air reservoir couples distant materialized regions. The atmosphere is a reduced model, not a global circulation solver.",
  initialConditions:
    "An old planet with weathered mineral soil and established plant lineages; three small human groups. New regions bring explicit boundary inventories. Geological age is encoded in initial conditions rather than replayed.",
  limits: [
    "Equilibrium tidal forcing, approximate eclipse coverage, and two Keplerian orbits; no full ocean or n-body solver.",
    "No general reaction network, isotope decay, abiogenesis, or molecular biology.",
    "Human behavior, physiology, gestation, and construction are coarse models; the five bulk materials are physical approximations, not a technology tree.",
    "No fixed player-count limit, but only materialized regions run in this single-process prototype; compute, memory, and the finite planetary surface remain real limits.",
  ],
});
