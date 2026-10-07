import React, { useState } from "react";
import { Bird, Bug, Fish, Leaf, ArrowRight, Sprout, Heart } from "lucide-react";
import { FAUNA, FAUNA_BY_ID, FLORA, floraOf } from "../simulation/life";
import type { Animal, FaunaDiet, WorldSnapshot } from "../simulation/types";
const n = (value: number, digits = 0) =>
  value.toLocaleString(undefined, { maximumFractionDigits: digits });
const roles: Record<FaunaDiet, string> = {
  grazer: "Grazers",
  nectar: "Pollinators",
  predator: "Predators",
  detritivore: "Litter recyclers",
  omnivore: "Omnivores",
};
function SpeciesIcon({ species }: { species: string }) {
  const s = FAUNA_BY_ID[species];
  return s.habitat === "water" ? (
    <Fish size={23} />
  ) : s.dryMass < 0.001 ? (
    <Bug size={22} />
  ) : s.habitat === "air" ? (
    <Bird size={23} />
  ) : (
    <Leaf size={22} />
  );
}
export function LifePanel({
  world,
  select,
}: {
  world: WorldSnapshot;
  select: (animal: Animal) => void;
}) {
  const [role, setRole] = useState("all");
  const animals = world.animals.filter(
    (a) =>
      a.x >= world.originX &&
      a.y >= world.originY &&
      a.x < world.originX + world.width &&
      a.y < world.originY + world.height,
  );
  const plants = world.tiles
    .flatMap((t) => [t.plant, t.groundcover])
    .filter((p) => p !== null);
  return (
    <>
      <span className="eyebrow">LIVES WITHIN LIVES</span>
      <h2>
        A living web.
        <br />
        <em>Every life belongs.</em>
      </h2>
      <p className="panel-lede">
        Different needs, shared ground. What one organism takes, grows, or
        leaves behind changes the lives around it.
      </p>
      <div className="civ-metrics">
        <div>
          <strong>{new Set(plants.map((p) => p!.lineage)).size}</strong>
          <span>plant lineages</span>
        </div>
        <div>
          <strong>{new Set(animals.map((a) => a.species)).size}</strong>
          <span>animal lineages</span>
        </div>
        <div>
          <strong>{n(animals.reduce((sum, a) => sum + a.count, 0))}</strong>
          <span>animals here</span>
        </div>
      </div>
      <div className="food-web-note">
        <SunChain />
        <p>
          Light → plants → grazers → predators
          <br />
          Living remains → recyclers → soil → plants
        </p>
      </div>
      <h3>The fauna of this region</h3>
      <label className="wildlife-filter">
        Ecological role
        <select
          aria-label="Ecological role"
          value={role}
          onChange={(e) => setRole(e.target.value)}
        >
          <option value="all">All roles</option>
          {Object.entries(roles).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <div className="wildlife-list">
        {FAUNA.filter((s) => role === "all" || s.diet === role).map(
          (species) => {
            const groups = animals.filter((a) => a.species === species.id);
            if (!groups.length) return null;
            return (
              <button
                key={species.id}
                className="community-row"
                onClick={() => select(groups[0])}
              >
                <span
                  className="wildlife-icon"
                  style={{ color: species.color }}
                >
                  <SpeciesIcon species={species.id} />
                </span>
                <span>
                  <strong>{species.name}</strong>
                  <small>
                    {roles[species.diet]} ·{" "}
                    {n(groups.reduce((sum, a) => sum + a.count, 0))} individuals
                  </small>
                </span>
                <ArrowRight size={14} />
              </button>
            );
          },
        )}
      </div>
      <p className="quiet-note">
        Animals are represented in groups, including insect populations. The
        figures come from the current simulation; populations can grow, migrate
        locally, or disappear.
      </p>
      <h3>Canopy, ground, and water</h3>
      <div className="flora-list">
        {FLORA.map((lineage, i) => {
          const found = plants.filter((p) => p!.lineage === i);
          if (!found.length) return null;
          return (
            <div key={lineage.name}>
              <span>
                <Sprout size={15} />
                <strong>{lineage.name}</strong>
                <small>{lineage.form}</small>
              </span>
              <span>{n(found.length)} patches</span>
            </div>
          );
        })}
      </div>
      <h3>Connections that leave a trace</h3>
      <div className="facts">
        <div>
          <span>Pollination visits, world</span>
          <strong>{n(world.summary.life.pollinations)}</strong>
        </div>
        <div>
          <span>Animal-dispersed seedlings</span>
          <strong>{n(world.summary.life.dispersedSeeds)}</strong>
        </div>
        <div>
          <span>Animal births, world</span>
          <strong>{n(world.summary.life.births)}</strong>
        </div>
        <div>
          <span>Animal deaths, world</span>
          <strong>{n(world.summary.life.deaths)}</strong>
        </div>
      </div>
    </>
  );
}
function SunChain() {
  return <Sprout size={24} strokeWidth={1.3} />;
}
export function AnimalPanel({ animal }: { animal: Animal }) {
  const species = FAUNA_BY_ID[animal.species],
    fresh = animal.body + animal.hydration;
  return (
    <>
      <span className="eyebrow">A NEIGHBOR IN THE LIVING WORLD</span>
      <div className="animal-portrait" style={{ color: species.color }}>
        <SpeciesIcon species={animal.species} />
      </div>
      <h2>{species.name}</h2>
      <p className="panel-lede">
        {roles[species.diet]} ·{" "}
        {species.habitat === "air" ? "Flying" : species.habitat} habitat
      </p>
      <div className="civ-metrics">
        <div>
          <strong>{n(animal.count)}</strong>
          <span>in this group</span>
        </div>
        <div>
          <strong>{animal.generation}</strong>
          <span>generations</span>
        </div>
        <div>
          <strong>{n(animal.health)}%</strong>
          <span>condition</span>
        </div>
      </div>
      <div className="focus-note">
        <Heart size={17} />
        <span>
          {animal.activity}
          <small>
            Near {n(animal.x)}, {n(animal.y)}
          </small>
        </span>
      </div>
      <h3>A body in its surroundings</h3>
      <div className="facts">
        <div>
          <span>Living mass, whole group</span>
          <strong>{n(fresh, 3)} kg</strong>
        </div>
        <div>
          <span>Body water</span>
          <strong>{n(animal.hydration, 3)} kg</strong>
        </div>
        <div>
          <span>Preferred temperature</span>
          <strong>
            {n(species.temperature + animal.traits.temperature, 1)} °C
          </strong>
        </div>
        <div>
          <span>Average age</span>
          <strong>{n(animal.ageDays)} days</strong>
        </div>
      </div>
      <p className="body-copy animal-description">
        {species.diet === "nectar"
          ? "Feeding visits pollinate nearby flowers. Without suitable flowering plants, this group loses the food it needs."
          : species.diet === "predator"
            ? "It must find and consume smaller animals. Prey scarcity limits its growth and reproduction."
            : species.diet === "detritivore"
              ? "It consumes organic remains. Metabolism returns their elements to available soil nutrients."
              : "It grazes or forages from actual plant tissue. Plants lose matter, while the animal gains tissue and returns waste."}
        {species.seedDispersal > 0
          ? " Foraging can disperse seeds into nearby gaps."
          : ""}
        {species.habitat === "water"
          ? " It also needs dissolved oxygen, which changes with temperature, gas exchange, and aquatic plants."
          : ""}
      </p>
    </>
  );
}
export function plantLabel(world: WorldSnapshot, index: number): string {
  const tile = world.tiles[index];
  return [tile?.plant, tile?.groundcover]
    .filter((p) => p !== null && p !== undefined)
    .map((p) => floraOf(p!).name)
    .join(" · ");
}
