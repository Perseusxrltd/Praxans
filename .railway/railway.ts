import { defineRailway, preserve, project, service, volume } from "railway/iac";

// This repository manages only its own resources in the environment. Other
// repositories export their own partial name.
// See https://docs.railway.com/infrastructure-as-code#multi-repo-projects
export const partial = "world";

export default defineRailway(() => {
  // This is the existing world's volume. Keep its identity and mount when
  // changing hosting configuration; an empty replacement is a different world.
  const worldVolume = volume("world-volume", {
    region: "iad",
    sizeMB: 1000,
    allowOnlineResize: true,
    alerts: { usage: { "80": {}, "95": {}, "100": {} } },
  });
  const world = service("world", {
    build: { builder: "DOCKERFILE", dockerfilePath: "Dockerfile" },
    healthcheck: "/api/health",
    healthcheckTimeout: 120,
    replicas: 1,
    deploy: {
      sleepApplication: false,
      restartPolicyType: "ON_FAILURE",
      restartPolicyMaxRetries: 10,
    },
    volumeMounts: { "/data": worldVolume },
    env: {
      PRAXANS_DB: preserve(),
      WORLD_SEED: preserve(),
      SERVER_ORIGIN: preserve(),
      PUBLIC_ORIGIN: preserve(),
      TRUST_PROXY: preserve(),
      PRAXANS_RELEASE: preserve(),
      PRAXANS_RELEASE_NOTES: preserve(),
      PRAXANS_REQUIRE_EXISTING_WORLD: preserve(),
    },
    networking: {
      serviceDomains: {
        "world-production-8384.up.railway.app": { port: 8080 },
      },
    },
  });
  return project("praxans", {
    resources: [worldVolume, world],
  });
});
