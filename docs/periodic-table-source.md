# Periodic-table data attribution

`src/simulation/data/elements.json` is adapted from [Periodic-Table-JSON by Bowserinator and contributors](https://github.com/Bowserinator/Periodic-Table-JSON), retrieved 2026-10-07. The upstream compilation cites Wikipedia.

The adapted dataset remains under [Creative Commons Attribution–ShareAlike 3.0 Unported](https://creativecommons.org/licenses/by-sa/3.0/); see the [included upstream notice](../src/simulation/data/elements.LICENSE.md) and [legal code](https://creativecommons.org/licenses/by-sa/3.0/legalcode). The project's MIT license does not replace this dataset license.

Changes: retained the 118 recognized elements and selected scientific properties, electron shells, positions, and source links; omitted prose, images, and extended configuration data. Unknown values remain null. Atomic masses use the upstream values (some short-lived elements use representative isotope mass numbers). Temperatures are kelvin; gas densities are g/L and solid/liquid densities g/cm³ in the source; electron affinity is kJ/mol and electronegativity is dimensionless.

Reference properties do not imply that every possible reaction or nuclear process is simulated. The running model exposes its active processes separately from the catalog.
