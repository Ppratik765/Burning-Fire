# Burning Flame Simulation

## Overview

The Burning Flame Simulation is a high-performance, interactive, GPU-accelerated visual experiment built using React, Three.js, and GLSL (OpenGL Shading Language). It simulates the physical behavior of fire—including advection, turbulence, buoyancy, and cooling—in real-time within a web browser.

Unlike simple particle systems, this project utilises a fluid dynamics approach running entirely on the GPU via custom fragment shaders. This allows for complex, organic motion where the fire swirls, rises, and interacts with user input in a physically plausible manner. The visual output is enhanced with High Dynamic Range (HDR) colour mapping, procedural sparkles, and post-processing bloom effects to achieve a photorealistic, glowing appearance.

## Features

### Core Simulation
- **GPU-Based Fluid Dynamics:** Implements a custom solver for advection and buoyancy using "Ping-Pong" frame buffering. This allows the state of the fire in the previous frame to influence the current frame, creating continuous fluid motion.
- **Turbulence & Noise:** Utilises fractional Brownian motion (fBM) and noise functions to introduce chaotic swirling and "licking" motions characteristic of real flames.
- **Buoyancy Physics:** Simulates hot gas rising against gravity.
- **Thermodynamics:** Implements cooling logic where "heat" decays over time, transitioning from a bright core to dark smoke.

### Visual Rendering
- **Volumetric Appearance:** The display shader interprets 2D heat data as 3D volume, applying fake lighting and rim shading to give the fire depth and thickness.
- **HDR Color Palette:** Uses color values exceeding 1.0 to drive the bloom effect. The palette transitions smoothly from Smoke (Dark Grey) to Magma (Deep Red), Fire (HDR Orange), Bright Flame (HDR Yellow), and finally to a Super-Hot Core (Pale Yellow).
- **Procedural Sparkles:** Generates high-frequency noise embers that appear on the outer edges of the flame and rise rapidly, simulating ejected sparks.
- **Post-Processing Bloom:** Utilizes the `postprocessing` library to apply a high-intensity bloom effect, causing the HDR colors to glow and bleed light onto the background.

### Interactivity & Audio
- **Mouse & Touch Support:** Fully responsive input handling for both desktop and mobile devices.
- **Physics Interaction:**
  - **Ignite/Fuel:** Left Mouse Button or Touch Down injects heat/fuel into the simulation at the cursor position.
  - **Extinguish/Stop:** Right Mouse Button or lifting the finger stops the fuel injection.
- **Audio Synchronization:** Integrated campfire ambient sound (`fire.m4a`) that automatically plays when the fire is active (user interaction) and pauses when inactive. Includes logic to handle browser Autoplay policies.

## Technology Stack

- **Frontend Framework:** React (Vite)
- **Graphics Engine:** Three.js
- **Shading Language:** GLSL (WebGL 2.0)
- **Post-Processing:** `postprocessing` library (BloomEffect, EffectComposer)
- **Language:** JavaScript (ES6+) / JSX

## Installation & Setup

### Prerequisites
- Node.js (v14.0.0 or higher recommended)
- npm (Node Package Manager)

### Steps

1. **Clone the Repository**
   ```bash
   git clone https://github.com/Ppratik765/Burning-Fire.git
   cd burning-flame-simulation
   ```
2. **Install Dependencies**
    ```bash
    npm install
    ```
3. **Add Assets** Ensure your audio file is placed correctly:
    * Place fire.m4a inside the `src/assets/` directory.
4. **Run Development Server**
    ```bash
    npm run dev
    ```
    Open your browser and navigate to http://localhost:5173 (or the port shown in your terminal).
6. **Build for Production**
    ```bash
    npm run build
    ```
### Usage Controls
  | Platform | Action              | Effect                                      |
  |----------|---------------------|---------------------------------------------|
  | Desktop  | Left Click (Hold)   | Inject fuel (Fire ON) / Play Audio          |
  |          | Right Click         | Stop fuel (Fire OFF) / Pause Audio          |
  |          | Mouse Move          | Move the source of the fire                 |
  | Mobile   | Touch & Drag        | Inject fuel (Fire ON) / Play Audio          |
  |          | Release Touch       | Stop fuel (Fire OFF) / Pause Audio          |

### Technical Architecture
The core logic resides in src/components/FlameCanvas.jsx. The rendering pipeline consists of three main stages:

1. Physics Simulation (Simulation Shader)
This shader calculates the behaviour of the fire. It uses two render targets (targetA and targetB) to read the previous frame's heat data and write the new state.

    * **Advection**: Moves heat pixels upward based on a noise field.
    
    * **Input:** Checks the mouse uniform to add new heat at the cursor coordinates.
    
    * **Cooling:** Multiplies the current heat by a decay factor (e.g., 0.96) to simulate energy loss.

2. Visual Interpretation (Display Shader)
This shader takes the raw heat data (0.0 to 1.0 black-and-white values) from the physics simulation and converts it into the final colored image.

    * **Colour Mapping:** Maps heat values to specific RGB colours (Smoke, Red, Orange, Yellow).
    
    * **Noise Displacement:** Distorts UV coordinates slightly to create a "heat haze" effect.
    
    * **Sparkle Masking:** Detects the edges of the heat field and overlays high-frequency noise dots to create sparks.

3. Post-Processing
The rendered scene is passed through an EffectComposer.

    * **BloomEffect:** Thresholds the bright pixels (HDR values) and blurs them to create the glow. The luminanceThreshold is tuned to ensure only the orange and yellow parts of the flame emit light.
  
### Directory Structure
    src/
    ├── assets/
    │   └── fire.m4a          # Audio file for campfire sound
    ├── components/
    │   └── FlameCanvas.jsx   # Main component containing Three.js and GLSL logic
    ├── App.jsx               # Root React component
    ├── App.css               # Global styles
    └── main.jsx              # Entry point

### Customization
You can tweak the behaviour of the fire by modifying the GLSL code in FlameCanvas.jsx:

  * Change Fire Height: Adjust the cooling factor in the Simulation Shader (heat *= 0.96). Higher numbers (e.g., 0.98) make the fire taller; lower numbers make it shorter.
  
  * Adjust Turbulence: Modify the noise multipliers in the Simulation Shader (noise(uv * 8.0 ...)).
  
  * Change Colours: Update the vec3 definitions in the Display Shader (orange, yellow, core).
  
  * Glow Intensity: Modify the intensity property in the BloomEffect configuration.
