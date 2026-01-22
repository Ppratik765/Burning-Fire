import { useEffect, useRef } from "react";
import * as THREE from "three";
import { EffectComposer, RenderPass, EffectPass, BloomEffect } from "postprocessing";
import fireSfx from "../assets/fire.m4a"; // Import the audio file

export default function FlameCanvas() {
  const mountRef = useRef();
  // mouse.z = 1.0 (Pen Down), 0.0 (Pen Up)
  const mouse = useRef({ x: 0.5, y: 0.5, z: 1.0 });
  // Track previous mouse position to calculate velocity (Inertia)
  const lastMouse = useRef({ x: 0.5, y: 0.5 });
  // Store the audio object
  const audioRef = useRef(null);

  useEffect(() => {
    // --- AUDIO SETUP ---
    const audio = new Audio(fireSfx);
    audio.loop = true; 
    audio.volume = 0.8; 
    audioRef.current = audio;

    // --- RENDERER SETUP ---
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

    // --- PHYSICS SHADER (With Inertia/Wind) ---
    const simMat = new THREE.ShaderMaterial({
      uniforms: {
        prev: { value: targetA.texture },
        mouse: { value: new THREE.Vector3(0, 0, 0) },
        velocity: { value: new THREE.Vector2(0, 0) }, // NEW: Mouse Velocity
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
        uniform vec2 velocity; // Input Velocity
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
          
          // 1. INERTIA / WIND CALCULATION
          // We add the mouse velocity to the lookup coordinate.
          // By subtracting velocity from the UV, we "pull" the fire in the direction of movement.
          // 'velocity * 0.15' controls the strength of the "Whoosh".
          vec2 wind = velocity * 0.15;

          // 2. TURBULENCE (Natural Rise)
          float n = noise(uv * 8.0 + vec2(0.0, time * 2.5));
          // Standard rise + Wind influence
          vec2 upOffset = vec2((n - 0.5) * 0.006, -0.005) - wind; 
          
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

    // --- VISUAL SHADER (Same as before) ---
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

          // Sparkles
          float sparkNoise = noise(vUv * 60.0 - vec2(0.0, time * 10.0));
          float edgeZone = smoothstep(0.02, 0.15, heat) * (1.0 - smoothstep(0.25, 0.45, heat));
          float sparkle = step(0.96, sparkNoise) * edgeZone;

          vec2 noiseUV = vUv * 4.0 - vec2(0.0, time * 1.5);
          float shape = fbm(noiseUV);
          float vol = heat * (0.5 + 0.8 * shape); 

          // HDR Colors
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

          float edge = fbm(noiseUV + 0.1) - shape;
          float light = max(0.0, edge * 4.0);
          col += light * 0.3; 

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

    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    composer.addPass(new EffectPass(camera, new BloomEffect({
        intensity: 2.5,
        luminanceThreshold: 0.15,
        radius: 0.85
    })));

    // --- ANIMATION LOOP ---
    function animate(t) {
      const timeVal = t * 0.001;

      // 1. Calculate Velocity (Inertia)
      // Velocity = Current Position - Last Position
      const currentX = mouse.current.x;
      const currentY = mouse.current.y;
      
      const velX = (currentX - lastMouse.current.x);
      const velY = (currentY - lastMouse.current.y);

      // Smooth the velocity slightly if needed, or pass raw for snappiness
      // We pass the RAW velocity to the shader to 'throw' the fire
      simMat.uniforms.velocity.value.set(velX, velY);

      // Update last mouse position for next frame
      lastMouse.current.x = currentX;
      lastMouse.current.y = currentY;

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

    // --- HELPER: AUDIO CONTROL ---
    const playAudio = () => {
        if (audioRef.current) {
            audioRef.current.play().catch(e => console.log("Audio autoplay blocked:", e));
        }
    };

    const pauseAudio = () => {
        if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current.currentTime = 0; // Optional: Reset to start
        }
    };

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
      if (e.button === 0) {
          mouse.current.z = 1.0;
          playAudio(); // START AUDIO
      }
      if (e.button === 2) {
          mouse.current.z = 0.0;
          pauseAudio(); // STOP AUDIO
      }
    }

    // Stop audio on global mouse up (optional, depends on preference)
    // Currently logic is: Left Click = Fire ON, Right Click = Fire OFF
    // If you want "Hold to Burn", uncomment the window.addEventListener("mouseup", ...) logic below.

    function onContextMenu(e) { e.preventDefault(); }
    
    function onTouchStart(e) { 
        if (e.cancelable) e.preventDefault(); 
        mouse.current.z = 1.0; 
        playAudio(); // START AUDIO
        updateTouch(e); 
    }
    
    function onTouchMove(e) { 
        if (e.cancelable) e.preventDefault(); 
        updateTouch(e); 
    }
    
    function onTouchEnd() { 
        mouse.current.z = 0.0; 
        pauseAudio(); // STOP AUDIO
    }
    
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
      if (audioRef.current) {
          audioRef.current.pause();
          audioRef.current = null;
      }
      if (mountRef.current && renderer.domElement) mountRef.current.removeChild(renderer.domElement);
      renderer.dispose(); targetA.dispose(); targetB.dispose();
    };
  }, []);

  return <div ref={mountRef} style={{ position: "fixed", top: 0, left: 0, width: "100%", height: "100%", zIndex: 10, cursor: 'crosshair', background: '#000' }} />;
}