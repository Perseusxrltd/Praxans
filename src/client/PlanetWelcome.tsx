import { useEffect, useRef, useState } from "react";
import { ArrowRight, Globe2, Link2, Sprout } from "lucide-react";
import { celestialState, surfaceCoordinates } from "../simulation/planet";
import type { WorldOverview } from "../simulation/types";
import "./planet.css";

export function PlanetWelcome({
  world,
  connected,
  fault,
  observe,
  connect,
  explore,
}: {
  world: WorldOverview | null;
  connected: boolean;
  fault: string;
  observe: () => void;
  connect: () => void;
  explore: () => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const latest = useRef(world);
  latest.current = world;
  const [ready, setReady] = useState(false),
    [drawingError, setDrawingError] = useState("");
  useEffect(() => {
    if (!canvas.current) return;
    const element = canvas.current,
      abort = new AbortController();
    let disposed = false,
      cleanup = () => {};
    void (async () => {
      const [THREE, response] = await Promise.all([
        import("three"),
        fetch("/api/planet/atlas?detail=preview", { signal: abort.signal }),
      ]);
      if (!response.ok) throw new Error("The planet’s surface is unavailable.");
      const width = Number(response.headers.get("X-Atlas-Width")),
        height = Number(response.headers.get("X-Atlas-Height"));
      const pixels = new Uint8Array(await response.arrayBuffer());
      if (!width || !height || pixels.length !== width * height * 4)
        throw new Error("The planet’s surface is unavailable.");
      if (disposed) return;
      const renderer = new THREE.WebGLRenderer({
        canvas: element,
        antialias: true,
        alpha: true,
        powerPreference: "low-power",
      });
      renderer.setPixelRatio(Math.min(devicePixelRatio, 1.6));
      renderer.setClearColor(0x050d13, 0);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.35;
      const scene = new THREE.Scene(),
        camera = new THREE.PerspectiveCamera(38, 1, 0.1, 200);
      let texture = new THREE.DataTexture(
        pixels,
        width,
        height,
        THREE.RGBAFormat,
      );
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.magFilter = THREE.LinearFilter;
      texture.minFilter = THREE.LinearMipmapLinearFilter;
      texture.generateMipmaps = true;
      texture.needsUpdate = true;
      element.dataset.atlasWidth = String(width);
      const surface = new THREE.Group();
      scene.add(surface);
      const globeGeometry = new THREE.SphereGeometry(1, 96, 64);
      const globeMaterial = new THREE.MeshPhongMaterial({
        map: texture,
        shininess: 13,
        specular: 0x173343,
      });
      const globe = new THREE.Mesh(globeGeometry, globeMaterial);
      surface.add(globe);
      const sunlight = new THREE.DirectionalLight(0xffefd7, 2.4);
      scene.add(sunlight, new THREE.AmbientLight(0x94bdcb, 0.22));
      const haloGeometry = new THREE.SphereGeometry(1.035, 64, 48);
      const haloMaterial = new THREE.ShaderMaterial({
        uniforms: { glowColor: { value: new THREE.Color(0x74b4c6) } },
        vertexShader:
          "varying vec3 n; varying vec3 v; void main(){vec4 p=modelViewMatrix*vec4(position,1.0); n=normalize(normalMatrix*normal); v=normalize(-p.xyz); gl_Position=projectionMatrix*p;}",
        fragmentShader:
          "uniform vec3 glowColor; varying vec3 n; varying vec3 v; void main(){float edge=abs(dot(normalize(n),normalize(v))); float rim=edge*pow(1.0-edge,2.0); gl_FragColor=vec4(glowColor,rim*1.8);}",
        side: THREE.BackSide,
        blending: THREE.AdditiveBlending,
        transparent: true,
        depthWrite: false,
      });
      scene.add(new THREE.Mesh(haloGeometry, haloMaterial));
      const starGeometry = new THREE.BufferGeometry(),
        stars = new Float32Array(1800 * 3);
      let seed = 71247;
      const random = () => {
        seed = Math.imul(seed ^ (seed >>> 13), 1597334677);
        return (seed >>> 0) / 4294967296;
      };
      for (let i = 0; i < stars.length; i += 3) {
        const y = random() * 2 - 1,
          angle = random() * Math.PI * 2,
          radius = 35 + random() * 45;
        stars[i] = Math.sqrt(1 - y * y) * Math.cos(angle) * radius;
        stars[i + 1] = y * radius;
        stars[i + 2] = Math.sqrt(1 - y * y) * Math.sin(angle) * radius;
      }
      starGeometry.setAttribute(
        "position",
        new THREE.BufferAttribute(stars, 3),
      );
      const starMaterial = new THREE.PointsMaterial({
        color: 0xc5d5d9,
        size: 0.045,
        transparent: true,
        opacity: 0.65,
        depthWrite: false,
      });
      scene.add(new THREE.Points(starGeometry, starMaterial));
      const pinGeometry = new THREE.BufferGeometry();
      const pinMaterial = new THREE.PointsMaterial({
        color: 0xffde92,
        size: 0.024,
        transparent: true,
        opacity: 0.9,
        sizeAttenuation: true,
      });
      const pins = new THREE.Points(pinGeometry, pinMaterial);
      surface.add(pins);
      let pinCount = -1,
        drag: { x: number; y: number } | null = null;
      let yaw = 0.65,
        pitch = 0.28,
        animation = 0,
        previous = 0;
      let rotation: number | undefined;
      const resize = () => {
        const box = element.getBoundingClientRect();
        renderer.setSize(
          Math.max(1, box.width),
          Math.max(1, box.height),
          false,
        );
        camera.aspect = box.width / Math.max(1, box.height);
        camera.updateProjectionMatrix();
      };
      const observer = new ResizeObserver(resize);
      observer.observe(element);
      resize();
      const down = (event: PointerEvent) => {
        drag = { x: event.clientX, y: event.clientY };
        element.setPointerCapture(event.pointerId);
      };
      const move = (event: PointerEvent) => {
        if (!drag) return;
        yaw -= (event.clientX - drag.x) * 0.005;
        pitch = Math.max(
          -1.1,
          Math.min(1.1, pitch + (event.clientY - drag.y) * 0.004),
        );
        drag = { x: event.clientX, y: event.clientY };
      };
      const up = () => {
        drag = null;
      };
      const key = (event: KeyboardEvent) => {
        if (
          !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(
            event.key,
          )
        )
          return;
        event.preventDefault();
        if (event.key === "ArrowLeft") yaw -= 0.12;
        if (event.key === "ArrowRight") yaw += 0.12;
        if (event.key === "ArrowUp") pitch = Math.min(1.1, pitch + 0.12);
        if (event.key === "ArrowDown") pitch = Math.max(-1.1, pitch - 0.12);
      };
      element.addEventListener("pointerdown", down);
      element.addEventListener("pointermove", move);
      element.addEventListener("pointerup", up);
      element.addEventListener("pointercancel", up);
      element.addEventListener("keydown", key);
      const reducedMotion = matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      const draw = (time: number) => {
        animation = requestAnimationFrame(draw);
        if (document.hidden || time - previous < (reducedMotion ? 100 : 33))
          return;
        const elapsed = Math.min(100, time - previous) / 1000;
        previous = time;
        const state = latest.current;
        if (!state) return;
        const sky = celestialState(state.tick);
        rotation ??= sky.rotation;
        rotation += (sky.rotation - rotation) * Math.min(1, elapsed * 7);
        surface.rotation.y = rotation;
        sunlight.position.set(
          sky.starDirection[0] * 8,
          sky.starDirection[2] * 8,
          -sky.starDirection[1] * 8,
        );
        // A slowly moving observer reveals the planet even when a development clock is stopped.
        if (!drag && !reducedMotion) yaw += elapsed * 0.012;
        const distance = camera.aspect < 0.85 ? 3.7 : 3.35;
        camera.position.set(
          Math.cos(yaw) * Math.cos(pitch) * distance,
          Math.sin(pitch) * distance,
          Math.sin(yaw) * Math.cos(pitch) * distance,
        );
        camera.lookAt(0, 0, 0);
        if (pinCount !== state.civilizations.length) {
          pinCount = state.civilizations.length;
          const positions = new Float32Array(pinCount * 3);
          state.civilizations.forEach((c, i) => {
            const { latitude, longitude } = surfaceCoordinates(c.x, c.y);
            positions[i * 3] = Math.cos(latitude) * Math.cos(longitude) * 1.008;
            positions[i * 3 + 1] = Math.sin(latitude) * 1.008;
            positions[i * 3 + 2] =
              -Math.cos(latitude) * Math.sin(longitude) * 1.008;
          });
          pinGeometry.setAttribute(
            "position",
            new THREE.BufferAttribute(positions, 3),
          );
        }
        renderer.render(scene, camera);
      };
      animation = requestAnimationFrame(draw);
      cleanup = () => {
        cancelAnimationFrame(animation);
        observer.disconnect();
        element.removeEventListener("pointerdown", down);
        element.removeEventListener("pointermove", move);
        element.removeEventListener("pointerup", up);
        element.removeEventListener("pointercancel", up);
        element.removeEventListener("keydown", key);
        for (const resource of [
          texture,
          globeGeometry,
          globeMaterial,
          haloGeometry,
          haloMaterial,
          starGeometry,
          starMaterial,
          pinGeometry,
          pinMaterial,
        ])
          resource.dispose();
        renderer.dispose();
      };
      setReady(true);
      // First draw uses a small real geographic survey. Refine it in place after
      // the planet is usable; the camera and live celestial time stay intact.
      void (async () => {
        const detailed = await fetch("/api/planet/atlas", {
          signal: abort.signal,
        });
        if (!detailed.ok) return;
        const w = Number(detailed.headers.get("X-Atlas-Width")),
          h = Number(detailed.headers.get("X-Atlas-Height")),
          data = new Uint8Array(await detailed.arrayBuffer());
        if (disposed || !w || !h || data.length !== w * h * 4) return;
        const replacement = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
        replacement.colorSpace = THREE.SRGBColorSpace;
        replacement.magFilter = THREE.LinearFilter;
        replacement.minFilter = THREE.LinearMipmapLinearFilter;
        replacement.generateMipmaps = true;
        replacement.needsUpdate = true;
        globeMaterial.map = replacement;
        globeMaterial.needsUpdate = true;
        texture.dispose();
        texture = replacement;
        element.dataset.atlasWidth = String(w);
      })().catch(() => {
        /* The initial geographic survey remains usable. */
      });
    })().catch((error) => {
      if (!disposed)
        setDrawingError(
          error.message ?? "This browser could not draw the planet.",
        );
    });
    return () => {
      disposed = true;
      abort.abort();
      cleanup();
    };
  }, []);
  return (
    <main className="planet-welcome">
      <header className="planet-header">
        <span className="planet-brand">
          <Sprout size={26} strokeWidth={1.5} /> praxans<span>.</span>
        </span>
        <span className="planet-live">
          <i className={connected ? "" : "waiting"} />
          {connected ? "A world in motion" : "Connecting to the world"}
        </span>
      </header>
      <div className={`planet-view ${ready ? "ready" : ""}`}>
        <canvas
          ref={canvas}
          tabIndex={0}
          aria-label="Planet Praxans, showing its actual seeded geography. Drag or use arrow keys to orbit."
        />
        {!ready && (
          <div className="planet-placeholder">
            <Globe2 size={58} strokeWidth={0.6} />
            <span>{drawingError || "Finding our place in the cosmos…"}</span>
          </div>
        )}
        <span className="planet-orbit-note">
          PRAXANS / AUREA SYSTEM <i /> DRAG TO ORBIT
        </span>
      </div>
      <section className="planet-copy">
        <span className="planet-eyebrow">
          A LIVING WORLD. A SHARED HISTORY.
        </span>
        <h1>
          Life, left <br />
          to <em>unfold.</em>
        </h1>
        <p>
          A small beginning on an immense planet. Let your AI care for a
          community, and watch a civilization find its own way.
        </p>
        <p className="planet-subtext">
          The forests, the weather, the people.
          <br />
          One world. Always becoming.
        </p>
        <div className="planet-actions">
          <button
            className="planet-observe"
            onClick={observe}
            disabled={!world}
          >
            Watch the world <ArrowRight size={18} />
          </button>
          <button
            className="planet-connect"
            onClick={connect}
            disabled={!world || !connected}
          >
            <Link2 size={16} /> Connect your AI
          </button>
        </div>
        <span className="planet-invitation">
          <button
            className="planet-survey-link"
            onClick={explore}
            disabled={!world}
          >
            <Globe2 size={14} /> Explore the whole planet
          </button>
        </span>
        {fault && (
          <p className="planet-fault" role="status">
            {fault}
          </p>
        )}
      </section>
      <footer className="planet-footer">
        <div className="planet-vitals">
          <div>
            <strong>{world?.civilizations.length ?? "—"}</strong>
            <span>communities</span>
          </div>
          <div>
            <strong>{world?.summary.population.toLocaleString() ?? "—"}</strong>
            <span>human lives</span>
          </div>
          <div>
            <strong>
              {world
                ? world.summary.life.animalLineages +
                  world.summary.life.plantLineages
                : "—"}
            </strong>
            <span>living lineages</span>
          </div>
        </div>
        <div className="planet-epoch">
          <span>THE STORY CONTINUES</span>
          <strong>
            {world
              ? `Year ${world.summary.year} · Day ${world.summary.day}`
              : "Opening the shared record"}
          </strong>
          <small>
            {world
              ? `${world.summary.clock.universalTime} · Planetary reference time`
              : "4.54 billion years of planetary heritage"}
          </small>
        </div>
      </footer>
    </main>
  );
}
