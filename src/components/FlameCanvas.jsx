import { useEffect, useRef } from "react";
import * as THREE from "three";
import { EffectComposer, RenderPass, EffectPass, BloomEffect } from "postprocessing";
// 1. Import the audio file
import fireSound from "../assets/fire.m4a";

export default function FlameCanvas() {
  const mountRef = useRef();
  // mouse.z = 1.0 (Pen Down), 0.0 (Pen Up)
  const mouse = useRef({ x: 0.5, y: 0.5, z: 1.0 });
  const audioRef = useRef(null); // Store audio instance

  useEffect(() => {
    // 2. Setup Audio
    const audio = new Audio(fireSound);
    audio.loop = true; // Loop the campfire track
    audio.volume = 1.0;
    audioRef.current = audio;

    // Helper to start audio on first interaction
    const handleInteraction = () => {
      if (audio.paused) {
        audio.play().catch((e) => console.log("Audio play error:", e));
      }
    };

    const renderer = new THREE.WebGLRenderer({ 
      alpha: true, 
      powerPreference: "high-performance",
      antialias: false,
      stencil: false,
      depth: false
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    mountRef.current.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    const simRes = 512; 
    const createRT = () =>
      new THREE.WebGLRenderTarget(simRes, simRes, {
        type: THREE.HalfFloatType,
        format: THREE.RGBAFormat,
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
      });

    let targetA = createRT();
    let targetB = createRT();

    // --- PHYSICS SHADER (Advection & Buoyancy) ---
    const simMat = new THREE.ShaderMaterial({
      uniforms: {
        prev: { value: targetA.texture },
        mouse: { value: new THREE.Vector3(0, 0, 0) },
        resolution: { value: new THREE.Vector2(simRes, simRes) },
        time: { value: 0 },
        aspect: { value: window.innerWidth / window.innerHeight },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = vec4(position, 1.0); }
      `,
      fragmentShader: `
        precision highp float;
        varying vec2 vUv;
        uniform sampler2D prev;
        uniform vec3 mouse;
        uniform vec2 resolution;
        uniform float time;
        uniform float aspect;

        float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
        float noise(vec2 p) {
            vec2 i = floor(p);
            vec2 f = fract(p);
            f = f * f * (3.0 - 2.0 * f);
            return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
                       mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
        }

        void main() {
          vec2 uv = vUv;
          
          // Turbulence
          float n = noise(uv * 8.0 + vec2(0.0, time * 2.5));
          vec2 upOffset = vec2((n - 0.5) * 0.006, -0.005); 
          
          float heat = texture2D(prev, uv + upOffset).r;

          // Cooling
          if (heat > 0.3) {
             heat *= 0.96; 
          } else {
             heat *= 0.99; 
          }
          heat -= 0.001; 

          // Mouse Input
          vec2 m = mouse.xy;
          vec2 d = uv - m;
          d.x *= aspect;
          float len = length(d);
          
          if(len < 0.05) {
             float fuel = smoothstep(0.05, 0.0, len);
             heat += fuel * 0.8 * mouse.z;
          }

          gl_FragColor = vec4(max(heat, 0.0), 0.0, 0.0, 1.0);
        }
      `,
    });

    // --- VISUAL SHADER (HDR Fire Colors + Outer Sparkles) ---
    const displayMat = new THREE.ShaderMaterial({
      uniforms: {
        tex: { value: targetA.texture },
        time: { value: 0 },
        resolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) }
      },
      vertexShader: `
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = vec4(position, 1.0); }
      `,
      fragmentShader: `
        precision highp float;
        varying vec2 vUv;
        uniform sampler2D tex;
        uniform float time;
        uniform vec2 resolution;

        float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
        float noise(vec2 p) {
            vec2 i = floor(p);
            vec2 f = fract(p);
            f = f * f * (3.0 - 2.0 * f);
            return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
                       mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
        }
        float fbm(vec2 p) {
            float v = 0.0;
            v += 0.5 * noise(p); p *= 2.02;
            v += 0.25 * noise(p); p *= 2.03;
            v += 0.125 * noise(p);
            return v;
        }

        void main() {
          float heat = texture2D(tex, vUv).r;
          if (heat < 0.001) discard;

          // --- SPARKLES LOGIC ---
          float sparkNoise = noise(vUv * 60.0 - vec2(0.0, time * 10.0));
          
          // Zone Mask: "Outside/Close" to flame
          float edgeZone = smoothstep(0.02, 0.15, heat) * (1.0 - smoothstep(0.25, 0.45, heat));
          
          // Combine
          float sparkle = step(0.96, sparkNoise) * edgeZone;

          // 3D Noise Shape for Fire Body
          vec2 noiseUV = vUv * 4.0 - vec2(0.0, time * 1.5);
          float shape = fbm(noiseUV);
          float vol = heat * (0.5 + 0.8 * shape); 

          // --- HDR COLOR PALETTE ---
          vec3 col = vec3(0.0);
          float alpha = 1.0;

          vec3 smoke = vec3(0.1, 0.1, 0.12);
          vec3 darkRed = vec3(0.8, 0.1, 0.05);   
          vec3 orange = vec3(1.5, 0.5, 0.1);     
          vec3 yellow = vec3(1.5, 1.2, 0.4);     
          vec3 core = vec3(1.5, 1.5, 1.2);       

          if (vol < 0.2) {
             col = smoke;
             alpha = smoothstep(0.0, 0.2, vol) * 0.6;
          } else if (vol < 0.4) {
             col = mix(smoke, darkRed, (vol - 0.2) / 0.2);
          } else if (vol < 0.75) { 
             col = mix(darkRed, orange, (vol - 0.4) / 0.35);
          } else if (vol < 0.95) { 
             col = mix(orange, yellow, (vol - 0.75) / 0.2);
          } else {
             col = mix(yellow, core, (vol - 0.95) / 0.05);
          }

          // Fake 3D Lighting
          float edge = fbm(noiseUV + 0.1) - shape;
          float light = max(0.0, edge * 4.0);
          col += light * 0.3; 

          // --- APPLY SPARKLES ---
          if (sparkle > 0.0) {
              col += vec3(2.0, 1.5, 0.5) * sparkle * 2.0;
              alpha = max(alpha, 0.8); 
          }

          gl_FragColor = vec4(col, alpha);
        }
      `,
      transparent: true,
    });

    const plane = new THREE.PlaneGeometry(2, 2);
    const mesh = new THREE.Mesh(plane, simMat);
    scene.add(mesh);

    // --- POST PROCESSING ---
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    composer.addPass(new EffectPass(camera, new BloomEffect({
        intensity: 2.5,
        luminanceThreshold: 0.15,
        radius: 0.85
    })));

    function animate(t) {
      const timeVal = t * 0.001;

      // Simulation
      mesh.material = simMat;
      simMat.uniforms.prev.value = targetA.texture;
      simMat.uniforms.time.value = timeVal;
      simMat.uniforms.mouse.value.set(mouse.current.x, 1.0 - mouse.current.y, mouse.current.z);
      
      renderer.setRenderTarget(targetB);
      renderer.render(scene, camera);
      renderer.setRenderTarget(null);

      const temp = targetA;
      targetA = targetB;
      targetB = temp;

      // Display
      mesh.material = displayMat;
      displayMat.uniforms.tex.value = targetA.texture;
      displayMat.uniforms.time.value = timeVal;
      displayMat.uniforms.resolution.value.set(window.innerWidth, window.innerHeight);

      composer.render();
      requestAnimationFrame(animate);
    }

    animate(0);

    // --- EVENTS ---
    function onResize() {
        const w = window.innerWidth;
        const h = window.innerHeight;
        renderer.setSize(w, h);
        composer.setSize(w, h);
        simMat.uniforms.aspect.value = w / h;
    }
    function onMouseMove(e) {
      mouse.current.x = e.clientX / window.innerWidth;
      mouse.current.y = e.clientY / window.innerHeight;
    }
    function onMouseDown(e) {
      // 3. Play audio on interaction
      handleInteraction();
      if (e.button === 0) mouse.current.z = 1.0;
      if (e.button === 2) mouse.current.z = 0.0;
    }
    function onContextMenu(e) { e.preventDefault(); }
    function onTouchStart(e) { 
        // 3. Play audio on touch
        handleInteraction();
        if (e.cancelable) e.preventDefault(); 
        mouse.current.z = 1.0; 
        updateTouch(e); 
    }
    function onTouchMove(e) { if (e.cancelable) e.preventDefault(); updateTouch(e); }
    function onTouchEnd() { mouse.current.z = 0.0; }
    function updateTouch(e) {
        if(e.touches.length > 0) {
            mouse.current.x = e.touches[0].clientX / window.innerWidth;
            mouse.current.y = e.touches[0].clientY / window.innerHeight;
        }
    }

    window.addEventListener("resize", onResize);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mousedown", onMouseDown);
    window.addEventListener("contextmenu", onContextMenu);
    window.addEventListener("touchstart", onTouchStart, { passive: false });
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("touchend", onTouchEnd);

    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("contextmenu", onContextMenu);
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
      if (mountRef.current && renderer.domElement) mountRef.current.removeChild(renderer.domElement);
      renderer.dispose(); targetA.dispose(); targetB.dispose();
      // Cleanup Audio
      if (audioRef.current) {
          audioRef.current.pause();
          audioRef.current = null;
      }
    };
  }, []);

  return <div ref={mountRef} style={{ position: "fixed", top: 0, left: 0, width: "100%", height: "100%", zIndex: 10, cursor: 'crosshair', background: '#000' }} />;
}