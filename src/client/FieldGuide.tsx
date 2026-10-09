import React, { useState } from "react";
import {
  Atom,
  ArrowRight,
  CloudRain,
  Clock3,
  Droplets,
  Globe2,
  Moon,
  Mountain,
  Orbit,
  Sprout,
  Sun,
  Users,
  Wind,
} from "lucide-react";
import {
  ELEMENTS,
  ELEMENT_BY_SYMBOL,
  elementPhase,
} from "../simulation/elements";
import { BIO_NUTRIENTS, CHEMISTRY, ROCK } from "../simulation/chemistry";
import { LAWS } from "../simulation/laws";
import {
  celestialState,
  PLANET,
  STAR,
  MOON,
  LUNAR_PERIOD,
} from "../simulation/planet";
import type { WorldSnapshot } from "../simulation/types";
import { Dialog } from "./Dialog";
import { WorldChanges } from "./Archive";

const number = (value: number, digits = 1) =>
  value.toLocaleString(undefined, { maximumFractionDigits: digits });
const mass = (value: number) =>
  value === 0
    ? "0 kg"
    : value < 0.001 || value > 1e7
      ? `${value.toExponential(3)} kg`
      : `${number(value, 4)} kg`;
export function FieldGuide({ world }: { world: WorldSnapshot }) {
  const [elementsOpen, setElementsOpen] = useState(false),
    environment = world.summary.environment;
  const sky = celestialState(world.tick);
  return (
    <>
      <span className="eyebrow">THE WORLD BENEATH THE WORLD</span>
      <h2>
        A few fixed laws.
        <br />
        <em>Many possible lives.</em>
      </h2>
      <p className="panel-lede">
        An old planet. Established ecosystems. The first chapters of human
        civilization.
      </p>
      <div className="planet-card">
        <div className="planet-symbol">
          <Orbit size={38} strokeWidth={1} />
          <span>PRAXANS</span>
        </div>
        <p>
          A 4.54-billion-year-old terrestrial world, orbiting{" "}
          <strong>{STAR.name}</strong> with its moon,{" "}
          <strong>{MOON.name}</strong>.
        </p>
        <div className="planet-facts">
          <span>
            <Sun size={14} />
            Star distance
            <strong>
              {number(sky.starDistance / PLANET.semiMajorAxis, 3)} AU
            </strong>
          </span>
          <span>
            <Globe2 size={14} />A year
            <strong>{number(PLANET.yearDays, 2)} days</strong>
          </span>
          <span>
            <Moon size={14} />
            Lunar orbit<strong>{number(LUNAR_PERIOD, 2)} days</strong>
          </span>
          <span>
            <Orbit size={14} />
            Axial tilt<strong>{PLANET.axialTilt.toFixed(2)}°</strong>
          </span>
        </div>
      </div>
      <div className="law-card">
        <Sun />
        <div>
          <h3>A place around a star</h3>
          <p>
            Rotation makes day and night. Tilt and orbit make seasons. The moon
            and star exert tides; their positions also determine eclipses.
          </p>
        </div>
      </div>
      <div className="world-time-card">
        <span className="eyebrow">
          <Clock3 size={13} />
          ONE CONTINUING CLOCK
        </span>
        <strong data-testid="world-clock">
          {world.summary.clock.universalTime}
        </strong>
        <span>
          Year {world.summary.clock.year} · Day {world.summary.clock.dayOfYear}{" "}
          of {world.summary.clock.daysInYear}
        </span>
        <p>
          Planet age: 4.54 billion years +{" "}
          {number(world.summary.clock.elapsedDays, 2)} recorded days. Local
          solar time: {world.summary.clock.localSolarTime}.
        </p>
        <small>
          Reference clock advances in 15-minute simulation steps. It survives
          every save and update.
        </small>
      </div>
      <div className="law-card">
        <Sun />
        <div>
          <h3>Time has a direction</h3>
          <p>
            Heat flows from warmer places into cooler ones. Respiration releases
            stored chemical energy as heat. Life builds local order with
            incoming starlight, while the surface emits thermal radiation.
          </p>
        </div>
      </div>
      <details className="model-details">
        <summary>Entropy, measured in kJ/K</summary>
        <div className="facts">
          <div>
            <span>Heat mixing produced</span>
            <strong>{world.summary.entropy.heatMixing.toExponential(3)}</strong>
          </div>
          <div>
            <span>Respiratory heat, Q/T estimate</span>
            <strong>
              {world.summary.entropy.metabolicHeat.toExponential(3)}
            </strong>
          </div>
          <div>
            <span>Absorbed starlight</span>
            <strong>{world.summary.entropy.solarIn.toExponential(3)}</strong>
          </div>
          <div>
            <span>Surface radiation emitted</span>
            <strong>
              {world.summary.entropy.longwaveOut.toExponential(3)}
            </strong>
          </div>
          <div>
            <span>Atmospheric radiation returned</span>
            <strong>
              {world.summary.entropy.atmosphericReturn.toExponential(3)}
            </strong>
          </div>
        </div>
        <p className="quiet-note">
          Selected irreversible processes and radiation flows, recorded since
          tick {world.summary.entropy.sinceTick}. Radiation uses a blackbody
          approximation. Q/T estimates heat delivered to the surroundings; full
          chemical reaction entropy and total planetary entropy remain
          unresolved. Local complexity can grow in an open system.
        </p>
      </details>
      <div className="law-card">
        <CloudRain />
        <div>
          <h3>A forest helps make its rain</h3>
          <p>
            Roots draw water from soil. Leaves return it to the air and cool
            their surroundings. Cooling moist air forms clouds; droplets fall
            and water flows downhill.
          </p>
        </div>
      </div>
      <div className="law-card">
        <Wind />
        <div>
          <h3>Distant ground can feed new life</h3>
          <p>
            Wind lifts dust from dry, bare rock. Air exchanges carry its
            elements. Rain deposits them into soil, where individual nutrient
            shortages limit growth.
          </p>
        </div>
      </div>
      <button
        className="button secondary wide elements-trigger"
        onClick={() => setElementsOpen(true)}
      >
        <Atom size={17} />
        Explore all 118 elements
        <ArrowRight size={15} />
      </button>
      <div className="law-card">
        <Mountain />
        <div>
          <h3>The ground has a history</h3>
          <p>
            Seeded plates shape initial terrain. Their movement accumulates
            strain and uplift in centimetres per year. Water weathers rock,
            exposing and releasing existing mineral matter.
          </p>
        </div>
      </div>
      <div className="law-card">
        <Sprout />
        <div>
          <h3>Light becomes living matter</h3>
          <p>
            Photosynthesis binds carbon dioxide and water into organic tissue,
            releasing oxygen. Breathing spends that oxygen and returns water and
            carbon dioxide. Seeds inherit traits with variation.
          </p>
        </div>
      </div>
      <div className="law-card">
        <Users />
        <div>
          <h3>People learn through consequences</h3>
          <p>
            Daily needs guide work. Material experiments become shared
            observations. Structures must support their own loads. Shelter,
            exchange, and habits follow what people actually make and do.
          </p>
        </div>
      </div>
      <h3>Conditions in this region</h3>
      <div className="facts">
        <div>
          <span>Temperature</span>
          <strong>{number(environment.temperature)} °C</strong>
        </div>
        <div>
          <span>Daylight</span>
          <strong>{number(environment.daylight)} hours</strong>
        </div>
        <div>
          <span>Relative humidity</span>
          <strong>{number(environment.humidity * 100, 0)}%</strong>
        </div>
        <div>
          <span>Wind</span>
          <strong>{number(environment.wind)} m/s</strong>
        </div>
        <div>
          <span>Oxygen in dry air</span>
          <strong>{number(environment.oxygen * 100, 2)}%</strong>
        </div>
        <div>
          <span>Moon illuminated</span>
          <strong>{number(environment.moonPhase * 100, 0)}%</strong>
        </div>
        <div>
          <span>Equilibrium tide</span>
          <strong>{number(environment.tide, 2)} m</strong>
        </div>
      </div>
      <div className="conservation-card">
        <span>
          <span className="status-dot" />
          Conservation, measured live
        </span>
        <div>
          <span>Largest element difference</span>
          <strong>
            {world.summary.elementError < 0.001
              ? "< 0.001"
              : number(world.summary.elementError, 4)}{" "}
            kg
          </strong>
        </div>
        <div>
          <span>Relative element error</span>
          <strong>{world.summary.elementRelativeError.toExponential(1)}</strong>
        </div>
        <div>
          <span>Water-equivalent difference</span>
          <strong>
            {Math.abs(world.summary.waterError) < 0.001
              ? "< 0.001"
              : number(world.summary.waterError, 4)}{" "}
            kg
          </strong>
        </div>
        <div>
          <span>Biochemical energy error</span>
          <strong>
            {Math.abs(world.summary.energyError) < 0.01
              ? "< 0.01"
              : number(world.summary.energyError, 3)}{" "}
            kJ
          </strong>
        </div>
      </div>
      <details className="model-details">
        <summary>What this model resolves</summary>
        <p className="quiet-note">
          Local air uses wind-driven eddy exchange; the upper atmosphere is a
          shared, well-mixed reservoir. Tides use equilibrium forcing, not an
          ocean circulation solver. Chemistry tracks elements in
          carbohydrate-equivalent tissue and bulk minerals, without a general
          reaction network. Temperature uses a reduced energy balance. Humans,
          inheritance, and mechanics remain coarse models.
        </p>
        <p className="quiet-note">
          The planet has roughly five trillion 100 m² surface cells.{" "}
          {world.summary.regions} regions are currently materialized. Revealed
          regions persist; new terrain and arriving people bring explicitly
          accounted initial matter into the simulated volume. Geological history
          informs initial conditions rather than being replayed atom by atom.
          Law set {LAWS.version}.
        </p>
      </details>
      <WorldChanges />
      {elementsOpen && (
        <ElementExplorer world={world} close={() => setElementsOpen(false)} />
      )}
    </>
  );
}
function ElementExplorer({
  world,
  close,
}: {
  world: WorldSnapshot;
  close: () => void;
}) {
  const [selected, setSelected] = useState("O"),
    [kelvin, setKelvin] = useState(293.15),
    element = ELEMENT_BY_SYMBOL[selected];
  const active =
    ["H", "C", "O", "N"].includes(selected) ||
    !!BIO_NUTRIENTS[selected] ||
    !!ROCK[selected];
  const available = world.summary.elements[selected] ?? 0;
  return (
    <Dialog
      title="The matter of this world."
      eyebrow="118 ELEMENTS · ONE CONSERVED WORLD"
      close={close}
      wide
    >
      <p className="dialog-intro">
        Select an element to see its properties and the mass present in the
        modeled world. Elements remain themselves as they move through air,
        water, rock, and life.
      </p>
      <div className="periodic-scroll">
        <div className="periodic-table" aria-label="Periodic table">
          {ELEMENTS.map((e) => (
            <button
              key={e.symbol}
              aria-label={`${e.name}, element ${e.number}`}
              aria-pressed={selected === e.symbol}
              className={`element-cell ${selected === e.symbol ? "chosen" : ""} ${(world.summary.elements[e.symbol] ?? 0) > 0 ? "present" : "unstocked"}`}
              style={{ gridColumn: e.xpos, gridRow: e.ypos }}
              onClick={() => setSelected(e.symbol)}
            >
              <small>{e.number}</small>
              <strong>{e.symbol}</strong>
              <span>{e.name}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="element-detail">
        <div className="element-large">
          <small>{element.number}</small>
          <strong>{element.symbol}</strong>
          <span>{element.name}</span>
        </div>
        <div>
          <h3>{element.name}</h3>
          <p className="element-category">{element.category}</p>
          <div className="element-values">
            <span>
              Atomic mass<strong>{number(element.atomic_mass, 5)} u</strong>
            </span>
            <span>
              In modeled reservoirs<strong>{mass(available)}</strong>
            </span>
            <span>
              Melting point
              <strong>
                {element.melt === null
                  ? "Unknown"
                  : `${number(element.melt, 2)} K`}
              </strong>
            </span>
            <span>
              Boiling point
              <strong>
                {element.boil === null
                  ? "Unknown"
                  : `${number(element.boil, 2)} K`}
              </strong>
            </span>
          </div>
        </div>
      </div>
      <div className="phase-reference">
        <label>
          Reference temperature (K)
          <input
            aria-label="Reference temperature in kelvin"
            type="number"
            min="0"
            max="10000"
            step="1"
            value={kelvin}
            onChange={(e) =>
              setKelvin(Math.max(0, Math.min(10000, Number(e.target.value))))
            }
          />
        </label>
        <p>
          Reference phase at 1 atmosphere
          <strong className="capitalize" data-testid="element-phase">
            {elementPhase(selected, kelvin)}
          </strong>
        </p>
      </div>
      <p className="body-copy">
        {active
          ? "This element participates in the active material, water, nutrient, or respiratory cycles. Its mass includes chemically bound matter; it is not all available as a pure substance."
          : available > 0
            ? "This element exists in trace deposits that weather and become exposed. Its full reaction chemistry is not yet modeled."
            : "This element is registered, with no stock in the current world. Nuclear synthesis and radioactive decay are not yet modeled."}
      </p>
      <p className="quiet-note">
        Reference phase does not change the world. Unknown measurements remain
        unknown. Data adapted from{" "}
        <a
          href="https://github.com/Bowserinator/Periodic-Table-JSON"
          target="_blank"
          rel="noreferrer"
        >
          Bowserinator and contributors
        </a>
        ,{" "}
        <a
          href="https://creativecommons.org/licenses/by-sa/3.0/"
          target="_blank"
          rel="noreferrer"
        >
          CC BY-SA 3.0
        </a>
        . {CHEMISTRY.organicFormula} is the model’s organic matrix.
      </p>
    </Dialog>
  );
}
