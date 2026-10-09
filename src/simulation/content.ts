import type { Focus, Material } from "./types";

/** Effective material properties for this coarse-grained world, not a chemistry textbook. */
export const MATERIALS: Record<
  Material,
  {
    name: string;
    carbon: number;
    mineral: number;
    density: number;
    strength: number;
    tensile: number;
    conductivity: number;
    digestible: number;
    color: string;
  }
> = {
  biomass: {
    name: "Edible biomass",
    carbon: 0.94,
    mineral: 0.06,
    density: 220,
    strength: 800,
    tensile: 200,
    conductivity: 0.25,
    digestible: 1,
    color: "#b5a06a",
  },
  wood: {
    name: "Wood",
    carbon: 0.99,
    mineral: 0.01,
    density: 520,
    strength: 30e6,
    tensile: 15e6,
    conductivity: 0.12,
    digestible: 0,
    color: "#ae8156",
  },
  fiber: {
    name: "Plant fiber",
    carbon: 0.98,
    mineral: 0.02,
    density: 110,
    strength: 3000,
    tensile: 8e6,
    conductivity: 0.05,
    digestible: 0,
    color: "#caba86",
  },
  stone: {
    name: "Stone",
    carbon: 0,
    mineral: 1,
    density: 2400,
    strength: 60e6,
    tensile: 2e6,
    conductivity: 2,
    digestible: 0,
    color: "#8c9891",
  },
  clay: {
    name: "Clay",
    carbon: 0,
    mineral: 1,
    density: 1700,
    strength: 90e3,
    tensile: 20e3,
    conductivity: 0.6,
    digestible: 0,
    color: "#bd9278",
  },
};
export const FOCUSES: Record<Focus, { name: string; description: string }> = {
  balance: {
    name: "Find a balance",
    description: "Let individual needs guide the community.",
  },
  nourish: {
    name: "Nurture life",
    description: "Favor gathering, care, and tending living plants.",
  },
  build: {
    name: "Make a home",
    description: "Explore assemblies that offer physical shelter.",
  },
  discover: {
    name: "Stay curious",
    description: "Spend more time testing material and geometric hypotheses.",
  },
  connect: {
    name: "Reach outward",
    description: "Favor contact and mutually acceptable exchanges.",
  },
  preserve: {
    name: "Tread lightly",
    description: "Leave more living tissue and seed stock in the landscape.",
  },
};
export const PALETTES = [
  ["#658770", "#d8e8bf"],
  ["#c38a55", "#f2d4a0"],
  ["#728ea2", "#ccdee6"],
  ["#9b7992", "#e8d0e3"],
  ["#b2a45a", "#eee4b2"],
  ["#8c9670", "#dde5bd"],
  ["#c17769", "#f0c5b9"],
  ["#628f91", "#bde2dd"],
];
export const NAMES = [
  "Ada",
  "Ari",
  "Bram",
  "Cleo",
  "Dara",
  "Eli",
  "Esme",
  "Fern",
  "Finn",
  "Ida",
  "Ivo",
  "Jun",
  "Kira",
  "Leo",
  "Lina",
  "Lumi",
  "Mara",
  "Milo",
  "Nell",
  "Noa",
  "Ori",
  "Pia",
  "Remi",
  "Rhea",
  "Rowan",
  "Sage",
  "Sora",
  "Tavi",
  "Theo",
  "Una",
  "Wren",
  "Yara",
];
export const SURNAMES = [
  "Reed",
  "Moss",
  "Vale",
  "Brook",
  "Alder",
  "Finch",
  "Hollow",
  "Birch",
  "Willow",
  "Stone",
  "Aster",
  "Wren",
];
export const SEASONS = ["Spring", "Summer", "Autumn", "Winter"];
