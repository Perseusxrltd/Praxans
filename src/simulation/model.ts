import { LAWS } from "./laws";
import { CHEMISTRY, BIO_NUTRIENTS, ROCK, CLAY } from "./chemistry";
import { MATERIALS } from "./content";
import { STAR, PLANET, MOON, LUNAR_PERIOD, ORBITAL_PERIOD } from "./planet";
import { BIOTA_MODEL, FAUNA, FLORA } from "./life";
import { FOUNDING } from "./founding";
import { THERMODYNAMICS } from "./thermodynamics";
import { ADVICE_RULES } from "./society";
import { DEVELOPMENT, METABOLISM, PHYSIOLOGY } from "./physiology";
import { FOOD_HANDOFF } from "./foodwork";
import { SUBSISTENCE } from "./subsistence";
import { WALKING_METRES_PER_HOUR } from "./movement";
import { SETTLEMENT_SPACE } from "./settlement";
import { JOURNEY_LOAD_PER_ADULT_KG } from "./diplomacy";

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
  settlementSpace: SETTLEMENT_SPACE,
  inventoryExposure: {
    description:
      "From biosphere-1.7, loose camp stocks, personal provisions and cargo, and caravan provisions and goods share hourly local temperature/moisture exposure. Each boundary applies a full hour at the current location, including recently acquired goods; paths through exposure are not integrated. Represented camp storage supplies its existing protection; carried goods have no modeled container. Spoilage transfers material once into local reservoirs. Swallowed intake, body reserves and worn fiber follow their existing physiological or wear paths. Exposure rates remain coarse assumptions, without microbes, packaging or measured food-specific shelf lives.",
  },
  journeyLoad: {
    kilogramsPerAdult: JOURNEY_LOAD_PER_ADULT_KG,
    description:
      "The existing fixed load allowance includes personal rations, actual covering, work cargo, shared provisions and outward/return goods. Remaining living carriers limit material that can move or be acquired. This is a controller approximation, not a strength/biomechanics model; party size remains capped at three.",
  },
  humanVitals: {
    thermalBalance: PHYSIOLOGY,
    metabolism: METABOLISM,
    development: DEVELOPMENT,
    seasonalPlanning: SUBSISTENCE,
    localFoodHandoff: FOOD_HANDOFF,
    walkingMetresPerHour: WALKING_METRES_PER_HOUR,
    nourishment:
      "From biosphere-1.6, satiety, nourishment and the historical hunger field describe intake fullness (0 empty, 100 full), not stored body energy or a starvation diagnosis. A migrated legacy value is replaced by the first metabolic interval. Inspect metabolism.intake, metabolism.reserves and metabolism.last for actual fuel and shortfalls.",
    energy:
      "0 means exhausted; 100 means rested. Urgent nourishment and rest can interrupt ongoing work.",
    feeding:
      "Current metabolic requests share finite reachable food before optional intake buffers and personal rations refill. Intake is separate unoxidized biomass-equivalent kg; reserves are a usable subset already included in body, never extra mass. One oxygen-limited oxidation supplies maintenance, heat and paid activity. Retained intake restores reserves before coarse structural growth. Allocation, automatic feeding, retention and power limits are controller/model assumptions, not learned institutions or calibrated anatomy.",
    foodHandoff:
      "From biosphere-1.8, a willing person can spend paid delivery time handing their own provisions or biomass cargo to a stationary person in the same cell. Post-meal holder budgets and all-debits-before-credits prevent duplication and same-interval forwarding. Delivery credits provisions only; later ordinary physiology ingests the food. Choice uses coarse local hunger/empty-bundle signals and social disposition, without kinship or community permission. Bundle targets, handling rates and the contact cell are approximations, not recipient consent, lactation, preparation or assisted swallowing. No nutritional success is awarded merely for handing food over.",
    growth:
      "From biosphere-1.9, tissue processing is bounded by the resting-maintenance equivalent of actual food oxidation; extra cold, melting or work cannot increase that allowance. Processing remains included in coarse maintenance, without a separately calibrated synthesis cost. Reserve restoration precedes structural deposition. Structural capacity follows a concave age curve between the existing 2 and 18 kg dry-equivalent total-body references, with zero slope at the declared 18-year maturity. Finite structural recovery uses a 90-day time constant and actual surplus intake. These are versioned model assumptions, not a fitted anatomical chart or guaranteed development. Existing larger bodies remain intact; developmental mobility, gestation and seasonal viability remain unresolved.",
    protection:
      "Performed work places real fiber on bodies. Thickness and conductivity reduce heat demand; cold can use finite intake and body reserves within their power limits. Shared ice is reserved once before food allocation and melts only with released heat. Sweating spends hydration. The injury dose is an uncalibrated energy-deficit model without core temperature, organs or tissue-specific metabolism.",
  },
  thermodynamics: THERMODYNAMICS,
  agency: ADVICE_RULES,
  development: {
    weathering:
      "Exposure, moisture, heat and frost change remaining fabric mass and strength. Repair needs replacement stock and work; ruins retain their remaining matter for salvage.",
    learning:
      "A bounded adaptive sensorimotor network links drives, attention, fatigue, memory and prediction-error learning. Physical trials use actual samples; knowledge is held and taught by individuals. This is a functional model, not cellular neuroscience.",
    diplomacy:
      "Dated contacts, voluntary local deliberation, inert free-text letters, finite provisioned parties, outward/return exchanges, reciprocal commitments and limited physical raids. Comprehension and witnessed conduct affect relationships; there is no arbitrary-text effect interpreter.",
    success:
      "Six bounded outcome potentials: wellbeing, resilience, knowledge, ecology, connection and reach. Signed daily changes and once-only milestones grant no resources. Communities can choose their own aspiration and weights.",
  },
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
