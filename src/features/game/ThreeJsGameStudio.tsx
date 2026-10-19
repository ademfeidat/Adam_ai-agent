import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  Play,
  RotateCcw,
  Volume2,
  VolumeX,
  Camera,
  Pause,
  ChevronDown,
  ChevronUp,
  Crosshair,
  Shield,
  Zap,
  Trophy,
  ArrowLeft,
  Flame,
  Radio,
  Gamepad2,
} from 'lucide-react';

export type GameMission = 'drone' | 'space' | 'lab';

interface ThreeJsGameStudioProps {
  language: 'ar' | 'en';
  onBackToApps?: () => void;
}

function checkWebGLSupport(): boolean {
  if (typeof window === 'undefined' || typeof document === 'undefined') return false;
  try {
    const canvas = document.createElement('canvas');
    const origError = console.error;
    const origWarn = console.warn;
    let gl: any = null;
    try {
      console.error = () => {};
      console.warn = () => {};
      gl = canvas.getContext('webgl2') || canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    } catch {
      return false;
    } finally {
      console.error = origError;
      console.warn = origWarn;
    }
    return Boolean(gl);
  } catch {
    return false;
  }
}

// ============================================================================
// Procedural Web Audio Synthesizer (Zero External File Dependencies)
// ============================================================================
class ProceduralAudioEngine {
  private ctx: AudioContext | null = null;
  public isMuted = false;

  private initCtx() {
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  playLaser() {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx) return;

    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      const now = this.ctx.currentTime;
      osc.frequency.setValueAtTime(880, now);
      osc.frequency.exponentialRampToValueAtTime(110, now + 0.14);

      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.15);
    } catch {}
  }

  playPickup() {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx) return;

    try {
      const now = this.ctx.currentTime;
      [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + i * 0.04);
        gain.gain.setValueAtTime(0.12, now + i * 0.04);
        gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.04 + 0.12);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now + i * 0.04);
        osc.stop(now + i * 0.04 + 0.13);
      });
    } catch {}
  }

  playHit() {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx) return;

    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(160, now);
      osc.frequency.exponentialRampToValueAtTime(40, now + 0.25);

      gain.gain.setValueAtTime(0.35, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.25);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.26);
    } catch {}
  }

  playBoost() {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx) return;

    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(220, now);
      osc.frequency.exponentialRampToValueAtTime(660, now + 0.3);

      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.31);
    } catch {}
  }
}

const audio = new ProceduralAudioEngine();

// ============================================================================
// 3D Procedural Composite Models Assembly (3 to 12 Part THREE.Group)
// ============================================================================

/**
 * Builds a composite 8-part Cyber-Drone
 */
function createCyberDrone(): THREE.Group {
  const group = new THREE.Group();

  // 1. Central Hull Chassis (Octagonal Body)
  const hullGeo = new THREE.CylinderGeometry(0.7, 0.85, 0.35, 8);
  const hullMat = new THREE.MeshPhysicalMaterial({
    color: 0x111827,
    metalness: 0.85,
    roughness: 0.2,
    clearcoat: 0.5,
  });
  const hull = new THREE.Mesh(hullGeo, hullMat);
  hull.castShadow = true;
  group.add(hull);

  // 2. Neon Cyber Visor Canopy
  const visorGeo = new THREE.SphereGeometry(0.42, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2);
  const visorMat = new THREE.MeshPhysicalMaterial({
    color: 0x06b6d4,
    emissive: 0x0891b2,
    emissiveIntensity: 0.6,
    metalness: 0.1,
    roughness: 0.1,
    transmission: 0.85,
    ior: 1.5,
  });
  const visor = new THREE.Mesh(visorGeo, visorMat);
  visor.position.y = 0.15;
  group.add(visor);

  // 3-6. 4 Rotor Arms & Turbo Rotors
  const armGeo = new THREE.BoxGeometry(0.12, 0.08, 0.9);
  const armMat = new THREE.MeshStandardMaterial({ color: 0x374151, metalness: 0.7, roughness: 0.35 });
  const rotorGeo = new THREE.TorusGeometry(0.28, 0.03, 8, 24);
  const rotorMat = new THREE.MeshStandardMaterial({
    color: 0x38bdf8,
    emissive: 0x0284c7,
    emissiveIntensity: 0.8,
  });

  const angles = [Math.PI / 4, (3 * Math.PI) / 4, (5 * Math.PI) / 4, (7 * Math.PI) / 4];
  angles.forEach((angle) => {
    const arm = new THREE.Mesh(armGeo, armMat);
    arm.rotation.y = angle;
    arm.position.y = 0.02;
    group.add(arm);

    const dist = 0.85;
    const rotor = new THREE.Mesh(rotorGeo, rotorMat);
    rotor.rotation.x = Math.PI / 2;
    rotor.position.set(Math.cos(angle) * dist, 0.12, Math.sin(angle) * dist);
    rotor.name = 'rotorRing';
    group.add(rotor);

    // Motor Hub
    const motorGeo = new THREE.CylinderGeometry(0.08, 0.09, 0.15, 12);
    const motor = new THREE.Mesh(motorGeo, hullMat);
    motor.position.set(Math.cos(angle) * dist, 0.05, Math.sin(angle) * dist);
    group.add(motor);
  });

  // 7. Underside Plasma Thruster Flare
  const thrusterGeo = new THREE.ConeGeometry(0.25, 0.5, 12, 1, true);
  const thrusterMat = new THREE.MeshBasicMaterial({
    color: 0x06b6d4,
    transparent: true,
    opacity: 0.8,
    side: THREE.DoubleSide,
  });
  const thruster = new THREE.Mesh(thrusterGeo, thrusterMat);
  thruster.rotation.x = Math.PI;
  thruster.position.set(0, -0.3, 0);
  thruster.name = 'plasmaThruster';
  group.add(thruster);

  // 8. Contact shadow disc
  const shadowGeo = new THREE.PlaneGeometry(2.2, 2.2);
  const shadowMat = new THREE.MeshBasicMaterial({
    color: 0x000000,
    transparent: true,
    opacity: 0.4,
    depthWrite: false,
  });
  const shadow = new THREE.Mesh(shadowGeo, shadowMat);
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = -0.55;
  group.add(shadow);

  group.scale.set(1.4, 1.4, 1.4);
  return group;
}

/**
 * Builds a composite 9-part Deep-Space Starship
 */
function createDeepSpaceStarship(): THREE.Group {
  const group = new THREE.Group();

  // 1. Sleek Fuselage Hull
  const hullGeo = new THREE.ConeGeometry(0.75, 2.6, 6);
  const hullMat = new THREE.MeshPhysicalMaterial({
    color: 0x1e293b,
    metalness: 0.9,
    roughness: 0.22,
    clearcoat: 0.6,
  });
  const hull = new THREE.Mesh(hullGeo, hullMat);
  hull.rotation.x = Math.PI / 2;
  hull.castShadow = true;
  group.add(hull);

  // 2. Cockpit Canopy (Crystalline Amber)
  const canopyGeo = new THREE.SphereGeometry(0.35, 16, 12);
  const canopyMat = new THREE.MeshPhysicalMaterial({
    color: 0xf59e0b,
    emissive: 0xd97706,
    emissiveIntensity: 0.5,
    transmission: 0.8,
    roughness: 0.1,
  });
  const canopy = new THREE.Mesh(canopyGeo, canopyMat);
  canopy.scale.set(0.65, 0.4, 1.2);
  canopy.position.set(0, 0.26, 0.2);
  group.add(canopy);

  // 3-4. Left & Right Swept Delta Wings
  const wingShape = new THREE.Shape();
  wingShape.moveTo(0, 0);
  wingShape.lineTo(1.6, -0.8);
  wingShape.lineTo(1.4, -1.4);
  wingShape.lineTo(0, -0.9);
  wingShape.closePath();

  const wingExtrude = new THREE.ExtrudeGeometry(wingShape, { depth: 0.06, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02 });
  const wingMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.85, roughness: 0.3 });

  const leftWing = new THREE.Mesh(wingExtrude, wingMat);
  leftWing.rotation.x = Math.PI / 2;
  leftWing.position.set(0.2, 0, 0.5);
  group.add(leftWing);

  const rightWing = new THREE.Mesh(wingExtrude, wingMat);
  rightWing.rotation.x = Math.PI / 2;
  rightWing.rotation.y = Math.PI;
  rightWing.position.set(-0.2, 0, 0.5);
  group.add(rightWing);

  // 5-6. Twin Engine Nacelles
  const engineGeo = new THREE.CylinderGeometry(0.18, 0.22, 0.9, 12);
  const engineMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.9, roughness: 0.15 });
  const leftEngine = new THREE.Mesh(engineGeo, engineMat);
  leftEngine.rotation.x = Math.PI / 2;
  leftEngine.position.set(0.75, 0, 0.9);
  group.add(leftEngine);

  const rightEngine = new THREE.Mesh(engineGeo, engineMat);
  rightEngine.rotation.x = Math.PI / 2;
  rightEngine.position.set(-0.75, 0, 0.9);
  group.add(rightEngine);

  // 7-8. Twin Engine Plasma Plumes
  const plumeGeo = new THREE.ConeGeometry(0.16, 0.7, 12);
  const plumeMat = new THREE.MeshBasicMaterial({ color: 0x06b6d4, transparent: true, opacity: 0.85 });
  const leftPlume = new THREE.Mesh(plumeGeo, plumeMat);
  leftPlume.rotation.x = -Math.PI / 2;
  leftPlume.position.set(0.75, 0, 1.6);
  leftPlume.name = 'enginePlume';
  group.add(leftPlume);

  const rightPlume = new THREE.Mesh(plumeGeo, plumeMat);
  rightPlume.rotation.x = -Math.PI / 2;
  rightPlume.position.set(-0.75, 0, 1.6);
  rightPlume.name = 'enginePlume';
  group.add(rightPlume);

  // 9. Dorsal Stabilizer Fin
  const finGeo = new THREE.BoxGeometry(0.06, 0.6, 0.7);
  const fin = new THREE.Mesh(finGeo, wingMat);
  fin.position.set(0, 0.38, 0.8);
  group.add(fin);

  group.scale.set(1.2, 1.2, 1.2);
  return group;
}

/**
 * Builds a composite 7-part Tech Lab Quantum Explorer
 */
function createLabExplorer(): THREE.Group {
  const group = new THREE.Group();

  // 1. Sleek Armored Core
  const coreGeo = new THREE.DodecahedronGeometry(0.85);
  const coreMat = new THREE.MeshPhysicalMaterial({
    color: 0x0f172a,
    metalness: 0.95,
    roughness: 0.18,
    clearcoat: 0.8,
  });
  const core = new THREE.Mesh(coreGeo, coreMat);
  core.castShadow = true;
  group.add(core);

  // 2. Floating Quantum Energy Orb inside
  const orbGeo = new THREE.SphereGeometry(0.48, 24, 18);
  const orbMat = new THREE.MeshPhysicalMaterial({
    color: 0xa855f7,
    emissive: 0x9333ea,
    emissiveIntensity: 0.8,
    roughness: 0.05,
    metalness: 0.1,
  });
  const orb = new THREE.Mesh(orbGeo, orbMat);
  orb.name = 'quantumOrb';
  group.add(orb);

  // 3. Orbital Sensor Ring 1
  const ring1Geo = new THREE.TorusGeometry(1.25, 0.04, 12, 48);
  const ring1Mat = new THREE.MeshStandardMaterial({ color: 0x06b6d4, metalness: 0.8, roughness: 0.2 });
  const ring1 = new THREE.Mesh(ring1Geo, ring1Mat);
  ring1.name = 'orbitalRing1';
  group.add(ring1);

  // 4. Orbital Sensor Ring 2
  const ring2Geo = new THREE.TorusGeometry(1.4, 0.035, 12, 48);
  const ring2Mat = new THREE.MeshStandardMaterial({ color: 0xec4899, metalness: 0.8, roughness: 0.2 });
  const ring2 = new THREE.Mesh(ring2Geo, ring2Mat);
  ring2.name = 'orbitalRing2';
  ring2.rotation.x = Math.PI / 3;
  group.add(ring2);

  // 5-6. Dual Front Scanner Probes
  const probeGeo = new THREE.CylinderGeometry(0.04, 0.06, 0.6, 8);
  const probeMat = new THREE.MeshStandardMaterial({ color: 0x64748b, metalness: 0.9, roughness: 0.1 });
  const probeL = new THREE.Mesh(probeGeo, probeMat);
  probeL.rotation.x = Math.PI / 2;
  probeL.position.set(0.45, -0.1, -0.85);
  group.add(probeL);

  const probeR = new THREE.Mesh(probeGeo, probeMat);
  probeR.rotation.x = Math.PI / 2;
  probeR.position.set(-0.45, -0.1, -0.85);
  group.add(probeR);

  // 7. Ground Contact Glow
  const glowGeo = new THREE.PlaneGeometry(2.4, 2.4);
  const glowMat = new THREE.MeshBasicMaterial({
    color: 0xa855f7,
    transparent: true,
    opacity: 0.35,
    depthWrite: false,
  });
  const glow = new THREE.Mesh(glowGeo, glowMat);
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = -0.95;
  group.add(glow);

  group.scale.set(1.2, 1.2, 1.2);
  return group;
}

export const ThreeJsGameStudio: React.FC<ThreeJsGameStudioProps> = ({ language, onBackToApps }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  // Game UI States
  const [gameState, setGameState] = useState<'title' | 'playing' | 'paused' | 'gameover' | 'victory'>('title');
  const [activeMission, setActiveMission] = useState<GameMission>('drone');
  const [score, setScore] = useState(0);
  const [shield, setShield] = useState(100);
  const [speedKph, setSpeedKph] = useState(180);
  const [isMuted, setIsMuted] = useState(false);
  const [cameraMode, setCameraMode] = useState<'chase' | 'cockpit' | 'top'>('chase');
  const [isControlsExpanded, setIsControlsExpanded] = useState(true);
  const [missionTimeSeconds, setMissionTimeSeconds] = useState(0);

  // Mutable Game Loop State
  const gameLoopRef = useRef({
    score: 0,
    shield: 100,
    speed: 38,
    distance: 0,
    playerX: 0,
    playerY: 1.5,
    targetX: 0,
    targetY: 1.5,
    bullets: [] as { mesh: THREE.Mesh; zSpeed: number }[],
    collectibles: [] as THREE.Mesh[],
    obstacles: [] as THREE.Mesh[],
    speedRings: [] as THREE.Mesh[],
    keys: new Set<string>(),
    hitCooldown: 0,
    isRunning: false,
  });

  const isAr = language === 'ar';

  const toggleMute = () => {
    const next = !isMuted;
    setIsMuted(next);
    audio.isMuted = next;
  };

  const handleStartGame = (mission: GameMission = activeMission) => {
    setActiveMission(mission);
    setGameState('playing');
    setScore(0);
    setShield(100);
    setMissionTimeSeconds(0);
    gameLoopRef.current.score = 0;
    gameLoopRef.current.shield = 100;
    gameLoopRef.current.playerX = 0;
    gameLoopRef.current.targetX = 0;
    gameLoopRef.current.distance = 0;
    gameLoopRef.current.isRunning = true;
    audio.playBoost();
  };

  const handleRestart = () => {
    handleStartGame(activeMission);
  };

  // Keyboard Event Handlers
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      gameLoopRef.current.keys.add(e.code);

      if (e.code === 'KeyP') {
        setGameState((prev) => (prev === 'playing' ? 'paused' : prev === 'paused' ? 'playing' : prev));
      }
      if (e.code === 'KeyM') {
        toggleMute();
      }
      if (e.code === 'Space') {
        if (gameState === 'title') {
          handleStartGame();
        } else if (gameState === 'playing') {
          fireLaserBullet();
        }
      }
      if (e.code === 'KeyC') {
        setCameraMode((prev) => (prev === 'chase' ? 'cockpit' : prev === 'cockpit' ? 'top' : 'chase'));
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      gameLoopRef.current.keys.delete(e.code);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [gameState, isMuted, activeMission]);

  // Laser Weapon Pulse
  const sceneRef = useRef<THREE.Scene | null>(null);
  const playerRef = useRef<THREE.Group | null>(null);

  const fireLaserBullet = () => {
    if (!sceneRef.current || !playerRef.current) return;
    audio.playLaser();

    const bulletGeo = new THREE.CylinderGeometry(0.06, 0.06, 1.2, 8);
    const bulletMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
    const bullet = new THREE.Mesh(bulletGeo, bulletMat);
    bullet.rotation.x = Math.PI / 2;

    const playerPos = playerRef.current.position;
    bullet.position.set(playerPos.x, playerPos.y, playerPos.z - 2.0);
    sceneRef.current.add(bullet);
    gameLoopRef.current.bullets.push({ mesh: bullet, zSpeed: 95 });
  };

  // Three.js Game Engine Initialization & Render Loop
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // 1. Scene, Renderer, and Studio Lighting
    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const isSpace = activeMission === 'space';
    const isLab = activeMission === 'lab';

    const bgColors = {
      drone: 0x050811,
      space: 0x020308,
      lab: 0x0a0e1a,
    };
    scene.background = new THREE.Color(bgColors[activeMission]);
    scene.fog = new THREE.FogExp2(bgColors[activeMission], isSpace ? 0.008 : 0.015);

    const camera = new THREE.PerspectiveCamera(65, container.clientWidth / container.clientHeight, 0.1, 800);
    camera.position.set(0, 4.5, 9);

    let renderer: THREE.WebGLRenderer | null = null;
    let fallback2DCanvas: HTMLCanvasElement | null = null;
    let isFallbackMode = false;

    const hasWebGL = checkWebGLSupport();

    if (hasWebGL) {
      const origConsoleError = console.error;
      const origConsoleWarn = console.warn;
      try {
        console.error = (...args: any[]) => {
          const msg = typeof args[0] === 'string' ? args[0] : '';
          if (
            msg.includes('THREE.WebGLRenderer') ||
            msg.includes('WebGL') ||
            msg.includes('GL driver') ||
            msg.includes('EGL_NO_CONFIG')
          ) {
            return;
          }
          origConsoleError.apply(console, args);
        };
        console.warn = (...args: any[]) => {
          const msg = typeof args[0] === 'string' ? args[0] : '';
          if (msg.includes('THREE.WebGLRenderer') || msg.includes('WebGL')) {
            return;
          }
          origConsoleWarn.apply(console, args);
        };

        renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'default' });
        renderer.setSize(container.clientWidth, container.clientHeight);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.15;
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        renderer.domElement.addEventListener('webglcontextlost', (e) => {
          e.preventDefault();
        }, false);
        container.appendChild(renderer.domElement);
      } catch {
        isFallbackMode = true;
      } finally {
        console.error = origConsoleError;
        console.warn = origConsoleWarn;
      }
    } else {
      isFallbackMode = true;
    }

    if (isFallbackMode || !renderer) {
      isFallbackMode = true;
      fallback2DCanvas = document.createElement('canvas');
      fallback2DCanvas.width = container.clientWidth || 800;
      fallback2DCanvas.height = container.clientHeight || 600;
      fallback2DCanvas.style.width = '100%';
      fallback2DCanvas.style.height = '100%';
      container.appendChild(fallback2DCanvas);
    }

    if (!isFallbackMode && renderer) {
      try {
        // Studio Environment Reflections via RoomEnvironment
        const pmremGenerator = new THREE.PMREMGenerator(renderer);
        scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
        pmremGenerator.dispose();
      } catch {
        // Handled silently
      }
    }

    // Studio 3-Point Balanced Lighting
    const keyLight = new THREE.DirectionalLight(0xfff5e6, 2.2);
    keyLight.position.set(12, 22, 10);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 1024;
    keyLight.shadow.mapSize.height = 1024;
    keyLight.shadow.camera.near = 0.5;
    keyLight.shadow.camera.far = 120;
    keyLight.shadow.camera.left = -25;
    keyLight.shadow.camera.right = 25;
    keyLight.shadow.camera.top = 25;
    keyLight.shadow.camera.bottom = -25;
    keyLight.shadow.bias = -0.0005;
    scene.add(keyLight);

    const hemiLight = new THREE.HemisphereLight(0x38bdf8, 0x0f172a, 1.4);
    scene.add(hemiLight);

    // 2. Mission-Specific Actors & Environments
    let player: THREE.Group;
    if (activeMission === 'drone') {
      player = createCyberDrone();
    } else if (activeMission === 'space') {
      player = createDeepSpaceStarship();
    } else {
      player = createLabExplorer();
    }
    player.position.set(0, 1.5, 0);
    scene.add(player);
    playerRef.current = player;

    // Ground Highway or Starfield Grid
    let groundGrid: THREE.GridHelper;
    if (isSpace) {
      groundGrid = new THREE.GridHelper(300, 60, 0x0ea5e9, 0x1e293b);
      groundGrid.position.y = -12;
    } else {
      groundGrid = new THREE.GridHelper(260, 52, isLab ? 0xa855f7 : 0x06b6d4, 0x1e293b);
      groundGrid.position.y = 0;
    }
    scene.add(groundGrid);

    // Instanced Distant Neon Skyscrapers or Asteroids
    const propCount = 60;
    let propMesh: THREE.InstancedMesh;
    const dummy = new THREE.Object3D();

    if (isSpace) {
      const astGeo = new THREE.DodecahedronGeometry(1.6, 1);
      const astMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.85, metalness: 0.1 });
      propMesh = new THREE.InstancedMesh(astGeo, astMat, propCount);
    } else {
      const bldgGeo = new THREE.BoxGeometry(4, 25, 4);
      const bldgMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.4, metalness: 0.7 });
      propMesh = new THREE.InstancedMesh(bldgGeo, bldgMat, propCount);
    }

    for (let i = 0; i < propCount; i++) {
      const x = (Math.random() - 0.5) * 80 + (Math.random() > 0.5 ? 20 : -20);
      const z = -Math.random() * 280;
      const y = isSpace ? (Math.random() - 0.5) * 40 : 12.5;
      dummy.position.set(x, y, z);
      const s = 0.7 + Math.random() * 0.9;
      dummy.scale.set(s, isSpace ? s : s * (1 + Math.random() * 2), s);
      dummy.updateMatrix();
      propMesh.setMatrixAt(i, dummy.matrix);
    }
    propMesh.instanceMatrix.needsUpdate = true;
    scene.add(propMesh);

    // Collectibles & Hazard Rings Pools
    const collectibles: THREE.Mesh[] = [];
    const obstacles: THREE.Mesh[] = [];
    const speedRings: THREE.Mesh[] = [];

    const orbGeo = new THREE.OctahedronGeometry(0.55);
    const orbMat = new THREE.MeshBasicMaterial({ color: 0x34d399 });

    const barrierGeo = new THREE.BoxGeometry(2.2, 1.8, 0.4);
    const barrierMat = new THREE.MeshStandardMaterial({
      color: 0xef4444,
      emissive: 0xb91c1c,
      emissiveIntensity: 0.7,
      roughness: 0.3,
    });

    const ringGeo = new THREE.TorusGeometry(1.6, 0.1, 8, 24);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x06b6d4 });

    for (let i = 0; i < 8; i++) {
      const orb = new THREE.Mesh(orbGeo, orbMat);
      orb.position.set((Math.random() - 0.5) * 16, 1.5, -40 - i * 35);
      scene.add(orb);
      collectibles.push(orb);

      const barrier = new THREE.Mesh(barrierGeo, barrierMat);
      barrier.position.set((Math.random() - 0.5) * 14, 1.2, -60 - i * 40);
      barrier.castShadow = true;
      scene.add(barrier);
      obstacles.push(barrier);

      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.position.set((Math.random() - 0.5) * 12, 1.8, -80 - i * 50);
      scene.add(ring);
      speedRings.push(ring);
    }

    gameLoopRef.current.collectibles = collectibles;
    gameLoopRef.current.obstacles = obstacles;
    gameLoopRef.current.speedRings = speedRings;

    // 3. Animation & 60 FPS Game Loop
    let animId: number;
    let lastTime = performance.now();
    const clock = new THREE.Clock();

    const renderLoop = () => {
      animId = requestAnimationFrame(renderLoop);

      const now = performance.now();
      const rawDt = (now - lastTime) / 1000;
      lastTime = now;
      const dt = Math.min(rawDt, 0.05); // Clamp dt to avoid frame spikes

      const g = gameLoopRef.current;

      // Handle Inputs & Steering
      const moveSpeed = 22;
      if (g.keys.has('KeyA') || g.keys.has('ArrowLeft')) {
        g.targetX -= moveSpeed * dt;
      }
      if (g.keys.has('KeyD') || g.keys.has('ArrowRight')) {
        g.targetX += moveSpeed * dt;
      }
      if (g.keys.has('KeyW') || g.keys.has('ArrowUp')) {
        g.targetY += moveSpeed * 0.7 * dt;
      }
      if (g.keys.has('KeyS') || g.keys.has('ArrowDown')) {
        g.targetY -= moveSpeed * 0.7 * dt;
      }

      // Bound steering limits
      g.targetX = THREE.MathUtils.clamp(g.targetX, -10, 10);
      g.targetY = THREE.MathUtils.clamp(g.targetY, 0.8, 6.0);

      // Smooth exponential damping on position
      const dampFactor = 1 - Math.exp(-12 * dt);
      g.playerX += (g.targetX - g.playerX) * dampFactor;
      g.playerY += (g.targetY - g.playerY) * dampFactor;

      player.position.x = g.playerX;
      player.position.y = g.playerY;

      // Dynamic banking/tilting during turns
      const rollTarget = (g.targetX - g.playerX) * -0.25;
      player.rotation.z += (rollTarget - player.rotation.z) * dampFactor;
      player.rotation.x = (g.targetY - g.playerY) * 0.15;

      // Animate Sub-Parts (Rotors, Orbs, Plasma plumes)
      const t = clock.getElapsedTime();
      player.traverse((child) => {
        if (child.name === 'rotorRing') {
          child.rotation.z += 18 * dt;
        }
        if (child.name === 'quantumOrb') {
          child.rotation.y += 2.5 * dt;
        }
        if (child.name === 'orbitalRing1') {
          child.rotation.y += 1.8 * dt;
          child.rotation.x += 1.2 * dt;
        }
        if (child.name === 'orbitalRing2') {
          child.rotation.z -= 2.2 * dt;
        }
        if (child.name === 'plasmaThruster' || child.name === 'enginePlume') {
          const s = 1 + Math.sin(t * 30) * 0.15;
          child.scale.set(s, s * 1.2, s);
        }
      });

      // Advance Forward Simulation & World Recycling
      const forwardVelocity = g.speed * dt;
      g.distance += forwardVelocity;

      // Animate Grid Scroll
      groundGrid.position.z = (groundGrid.position.z + forwardVelocity) % 20;

      // Update Collectibles
      collectibles.forEach((item) => {
        item.position.z += forwardVelocity;
        item.rotation.y += 3.0 * dt;
        item.rotation.x += 1.5 * dt;

        // Collision with player
        const dist = item.position.distanceTo(player.position);
        if (dist < 1.4) {
          audio.playPickup();
          g.score += 150;
          setScore(g.score);
          item.position.z = -180 - Math.random() * 60;
          item.position.x = (Math.random() - 0.5) * 16;
        }

        // Recycle passed items
        if (item.position.z > 15) {
          item.position.z = -220 - Math.random() * 50;
          item.position.x = (Math.random() - 0.5) * 16;
        }
      });

      // Update Speed Rings
      speedRings.forEach((ring) => {
        ring.position.z += forwardVelocity;
        ring.rotation.z += 1.5 * dt;

        const dist = ring.position.distanceTo(player.position);
        if (dist < 1.8) {
          audio.playBoost();
          g.score += 300;
          g.speed = Math.min(65, g.speed + 4);
          setScore(g.score);
          ring.position.z = -260 - Math.random() * 60;
          ring.position.x = (Math.random() - 0.5) * 12;
        }

        if (ring.position.z > 15) {
          ring.position.z = -280 - Math.random() * 60;
          ring.position.x = (Math.random() - 0.5) * 12;
        }
      });

      // Update Obstacles & Hazards
      obstacles.forEach((obs) => {
        obs.position.z += forwardVelocity;

        const dist = obs.position.distanceTo(player.position);
        if (dist < 1.5 && g.hitCooldown <= 0) {
          audio.playHit();
          g.shield = Math.max(0, g.shield - 25);
          setShield(g.shield);
          g.hitCooldown = 1.0; // 1s invulnerability flash

          if (g.shield <= 0) {
            setGameState('gameover');
          }
        }

        if (obs.position.z > 15) {
          obs.position.z = -240 - Math.random() * 60;
          obs.position.x = (Math.random() - 0.5) * 14;
        }
      });

      if (g.hitCooldown > 0) {
        g.hitCooldown -= dt;
      }

      // Update Laser Bullets
      for (let i = g.bullets.length - 1; i >= 0; i--) {
        const b = g.bullets[i];
        b.mesh.position.z -= b.zSpeed * dt;

        // Check collision between laser and obstacles
        for (const obs of obstacles) {
          if (b.mesh.position.distanceTo(obs.position) < 2.0) {
            audio.playHit();
            g.score += 200;
            setScore(g.score);
            obs.position.z = -250 - Math.random() * 60;
            scene.remove(b.mesh);
            g.bullets.splice(i, 1);
            break;
          }
        }

        if (b.mesh.position.z < -250) {
          scene.remove(b.mesh);
          g.bullets.splice(i, 1);
        }
      }

      // Check Victory Condition (Reaching 5000 score or 120s survival)
      if (g.score >= 5000 && gameState === 'playing') {
        setGameState('victory');
      }

      // Camera Choreography with Exponential Damping
      if (cameraMode === 'chase') {
        const targetCamX = g.playerX * 0.45;
        const targetCamY = g.playerY + 2.8;
        const targetCamZ = g.playerX ? 7.5 : 8.2;
        camera.position.x += (targetCamX - camera.position.x) * (1 - Math.exp(-8 * dt));
        camera.position.y += (targetCamY - camera.position.y) * (1 - Math.exp(-8 * dt));
        camera.position.z += (targetCamZ - camera.position.z) * (1 - Math.exp(-8 * dt));
        camera.lookAt(g.playerX * 0.8, g.playerY, -12);
      } else if (cameraMode === 'cockpit') {
        camera.position.set(g.playerX, g.playerY + 0.35, 0.4);
        camera.lookAt(g.playerX, g.playerY + 0.2, -40);
      } else {
        // Top-Down Tactical Cam
        camera.position.set(g.playerX * 0.3, 18, -4);
        camera.lookAt(g.playerX, g.playerY, -14);
      }

      // HUD Metrics Update
      setSpeedKph(Math.round(g.speed * 4.6));

      if (isFallbackMode && fallback2DCanvas) {
        const ctx = fallback2DCanvas.getContext('2d');
        if (ctx) {
          ctx.fillStyle = '#050811';
          ctx.fillRect(0, 0, fallback2DCanvas.width, fallback2DCanvas.height);

          // Draw Neon grid lines
          ctx.strokeStyle = '#1e293b';
          ctx.lineWidth = 1;
          for (let gx = 0; gx < fallback2DCanvas.width; gx += 40) {
            ctx.beginPath();
            ctx.moveTo(gx, 0);
            ctx.lineTo(gx, fallback2DCanvas.height);
            ctx.stroke();
          }

          // Draw Player Ship
          const px = fallback2DCanvas.width / 2 + g.playerX * 30;
          const py = fallback2DCanvas.height * 0.7 - (g.playerY - 1.5) * 30;
          ctx.fillStyle = activeMission === 'space' ? '#38bdf8' : activeMission === 'lab' ? '#a855f7' : '#06b6d4';
          ctx.beginPath();
          ctx.moveTo(px, py - 20);
          ctx.lineTo(px - 15, py + 15);
          ctx.lineTo(px + 15, py + 15);
          ctx.closePath();
          ctx.fill();

          // Draw Collectibles
          ctx.fillStyle = '#34d399';
          collectibles.forEach((item) => {
            const ix = fallback2DCanvas.width / 2 + item.position.x * 25;
            const iy = fallback2DCanvas.height * 0.3 + (item.position.z + 50) * 3;
            ctx.beginPath();
            ctx.arc(ix, iy, 8, 0, Math.PI * 2);
            ctx.fill();
          });

          // Draw Obstacles
          ctx.fillStyle = '#ef4444';
          obstacles.forEach((obs) => {
            const ox = fallback2DCanvas.width / 2 + obs.position.x * 25;
            const oy = fallback2DCanvas.height * 0.3 + (obs.position.z + 50) * 3;
            ctx.fillRect(ox - 18, oy - 12, 36, 24);
          });
        }
      } else if (renderer) {
        try {
          renderer.render(scene, camera);
        } catch (rErr) {
          console.warn('[ThreeJsGameStudio] Render frame error caught safely:', rErr);
        }
      }
    };

    animId = requestAnimationFrame(renderLoop);

    // Responsive Resize Handler
    const handleResize = () => {
      if (!container) return;
      if (renderer) {
        camera.aspect = container.clientWidth / container.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(container.clientWidth, container.clientHeight);
      } else if (fallback2DCanvas) {
        fallback2DCanvas.width = container.clientWidth;
        fallback2DCanvas.height = container.clientHeight;
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', handleResize);
      if (renderer) {
        renderer.dispose();
        if (renderer.domElement.parentNode) {
          renderer.domElement.parentNode.removeChild(renderer.domElement);
        }
      }
      if (fallback2DCanvas && fallback2DCanvas.parentNode) {
        fallback2DCanvas.parentNode.removeChild(fallback2DCanvas);
      }
    };
  }, [activeMission, cameraMode]);

  // Mission Timer
  useEffect(() => {
    if (gameState !== 'playing') return;
    const interval = setInterval(() => {
      setMissionTimeSeconds((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [gameState]);

  return (
    <div className="relative w-full h-full flex flex-col overflow-hidden bg-[#050811] select-none font-sans text-white">
      {/* 1. Pure Isolated 3D Canvas Mount Point */}
      <div ref={containerRef} className="absolute inset-0 w-full h-full z-0 cursor-crosshair" />

      {/* 2. Top Perimeter Status Cluster (Semantic DOM Layer, No Occlusion) */}
      <header className="relative z-10 flex items-center justify-between w-full px-4 sm:px-6 py-3 pointer-events-auto">
        <div className="flex items-center gap-3">
          {onBackToApps && (
            <button
              type="button"
              onClick={onBackToApps}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-neutral-900/80 border border-neutral-700/60 text-xs font-semibold hover:border-cyan-500/50 hover:text-cyan-400 transition-colors shadow-sm cursor-pointer"
            >
              <ArrowLeft size={14} />
              <span>{isAr ? 'العودة للتطبيقات' : 'Back to Apps'}</span>
            </button>
          )}

          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-neutral-900/80 border border-neutral-800 text-xs font-mono shadow-sm">
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
            <span className="font-bold text-cyan-300">
              {activeMission === 'drone' ? 'CYBER-DRONE 3D' : activeMission === 'space' ? 'DEEP-SPACE 3D' : 'TECH-LAB 3D'}
            </span>
          </div>
        </div>

        {/* Minimal Score & Vital Cluster */}
        <div className="flex items-center gap-4 text-xs font-mono">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-neutral-900/80 border border-neutral-800">
            <Trophy size={14} className="text-amber-400" />
            <span className="text-neutral-400">{isAr ? 'النقاط:' : 'SCORE:'}</span>
            <span className="text-white font-bold tabular-nums text-sm">{score}</span>
          </div>

          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-neutral-900/80 border border-neutral-800">
            <Shield size={14} className={shield > 35 ? 'text-emerald-400' : 'text-red-400'} />
            <span className="text-neutral-400">{isAr ? 'الدرع:' : 'SHIELD:'}</span>
            <span className="text-white font-bold tabular-nums text-sm">{shield}%</span>
          </div>
        </div>
      </header>

      {/* 3. Title Screen & Mission Selection Modal */}
      {gameState === 'title' && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center p-6 bg-black/75 backdrop-blur-md animate-fadeIn">
          <div className="max-w-xl w-full text-center space-y-6">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-cyan-500/15 border border-cyan-500/40 text-cyan-300 text-xs font-mono">
              <Gamepad2 size={15} />
              <span>{isAr ? 'استوديو الألعاب التفاعلية ثلاثي الأبعاد • Three.js 60FPS' : 'THREE.JS 3D ARCADE ENGINE 2026'}</span>
            </div>

            <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight bg-gradient-to-r from-cyan-300 via-sky-200 to-indigo-300 bg-clip-text text-transparent">
              {isAr ? 'منظومة الألعاب الفضائية والسايبر' : 'ADEM 3D ARCADE SUITE'}
            </h1>

            <p className="text-sm text-neutral-300 max-w-md mx-auto leading-relaxed">
              {isAr
                ? 'تجربة محاكاة ثلاثية الأبعاد كاملة، إضاءة PBR استوديو، ومؤثرات صوتية اصطناعية فورية. اختر مهمتك وابدأ فوراً!'
                : 'High-performance 60fps procedural 3D simulations with real-time PBR lighting and zero external 404 dependencies.'}
            </p>

            {/* Mission Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-start">
              {[
                {
                  id: 'drone' as GameMission,
                  title: isAr ? 'طائرة السايبر' : 'Cyber-Drone',
                  desc: isAr ? 'تحليق بين ناطحات السحاب وحلقات السرعة' : 'City runner dodging neon obstacles',
                  color: 'border-cyan-500/50 hover:border-cyan-400 text-cyan-400',
                  icon: Zap,
                },
                {
                  id: 'space' as GameMission,
                  title: isAr ? 'سفينة الفضاء' : 'Starship Flight',
                  desc: isAr ? 'مناورة الكويكبات وضربات الليزر البلازمية' : 'Deep-space asteroid fighter flight',
                  color: 'border-sky-500/50 hover:border-sky-400 text-sky-400',
                  icon: Flame,
                },
                {
                  id: 'lab' as GameMission,
                  title: isAr ? 'المختبر الذكي' : 'Quantum Lab',
                  desc: isAr ? 'استكشاف محطة الطاقة وحل عقد الطاقة' : 'Explore high-tech lab energy nodes',
                  color: 'border-purple-500/50 hover:border-purple-400 text-purple-400',
                  icon: Radio,
                },
              ].map((m) => {
                const Icon = m.icon;
                const isSelected = activeMission === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setActiveMission(m.id)}
                    className={`p-3.5 rounded-2xl border bg-neutral-900/90 text-start cursor-pointer transition-all ${
                      isSelected ? 'ring-2 ring-cyan-400 border-cyan-400 shadow-[0_0_20px_rgba(6,182,212,0.3)]' : m.color
                    }`}
                  >
                    <Icon size={20} className="mb-2" />
                    <div className="font-bold text-sm text-white">{m.title}</div>
                    <div className="text-[11px] text-neutral-400 leading-tight mt-1">{m.desc}</div>
                  </button>
                );
              })}
            </div>

            {/* Primary Start CTA */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => handleStartGame(activeMission)}
                className="w-full sm:w-auto px-8 py-3 rounded-2xl bg-cyan-500 hover:bg-cyan-400 text-black font-extrabold text-sm flex items-center justify-center gap-2 shadow-[0_0_25px_rgba(6,182,212,0.4)] transition-all cursor-pointer active:scale-95"
              >
                <Play size={16} fill="currentColor" />
                <span>{isAr ? 'ابدأ المهمة الآن (Space)' : 'Launch Mission (Space)'}</span>
              </button>
            </div>

            <div className="text-xs text-neutral-400 font-mono">
              WASD / Arrow Keys Move · Space Laser · C Camera · P Pause · M Mute
            </div>
          </div>
        </div>
      )}

      {/* 4. Victory & Game Over Modals */}
      {(gameState === 'gameover' || gameState === 'victory') && (
        <div className="absolute inset-0 z-30 flex items-center justify-center p-6 bg-black/80 backdrop-blur-md animate-fadeIn">
          <div className="max-w-md w-full p-6 rounded-3xl bg-neutral-900 border border-neutral-800 text-center space-y-4 shadow-2xl">
            <div
              className={`w-14 h-14 rounded-2xl mx-auto flex items-center justify-center text-2xl ${
                gameState === 'victory' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-red-500/20 text-red-400 border border-red-500/30'
              }`}
            >
              {gameState === 'victory' ? <Trophy size={28} /> : <Shield size={28} />}
            </div>

            <h2 className="text-2xl font-extrabold text-white">
              {gameState === 'victory'
                ? isAr
                  ? 'تم إنجاز المهمة بنجاح!'
                  : 'Mission Accomplished!'
                : isAr
                ? 'تحطم الدرع الدفاعي'
                : 'Shield Depleted!'}
            </h2>

            <p className="text-sm text-neutral-300">
              {gameState === 'victory'
                ? isAr
                  ? `أحرزت ${score} نقطة في زمن ${missionTimeSeconds} ثانية!`
                  : `You scored ${score} points in ${missionTimeSeconds} seconds!`
                : isAr
                ? `لقد انتهت طاقتك بعد جمع ${score} نقطة.`
                : `Simulation halted after scoring ${score} points.`}
            </p>

            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={handleRestart}
                className="px-6 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black font-bold text-xs flex items-center gap-2 cursor-pointer shadow-md"
              >
                <RotateCcw size={14} />
                <span>{isAr ? 'إعادة المحاولة' : 'Play Again'}</span>
              </button>

              <button
                type="button"
                onClick={() => setGameState('title')}
                className="px-6 py-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-white font-medium text-xs cursor-pointer border border-neutral-700"
              >
                <span>{isAr ? 'تغيير المهمة' : 'Select Mission'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. Ergonomic Collapsible Bottom Control Dock (Zero Viewport Occlusion) */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 w-[94%] max-w-[840px] pointer-events-auto">
        {/* Toggle Collapse Button */}
        <div className="flex justify-center -mb-2">
          <button
            type="button"
            onClick={() => setIsControlsExpanded((prev) => !prev)}
            className="px-3 py-1 rounded-t-lg bg-neutral-900 border-t border-x border-neutral-700/80 text-[11px] font-mono text-neutral-400 hover:text-white flex items-center gap-1 cursor-pointer shadow-sm"
          >
            {isControlsExpanded ? <ChevronDown size={13} /> : <ChevronUp size={13} />}
            <span>{isControlsExpanded ? (isAr ? 'إخفاء لوحة التحكم' : 'Hide Controls') : isAr ? 'إظهار لوحة التحكم' : 'Show Controls'}</span>
          </button>
        </div>

        {isControlsExpanded && (
          <div className="p-3 sm:p-4 rounded-2xl bg-neutral-900/95 border border-neutral-800 shadow-2xl flex flex-wrap items-center justify-between gap-3 text-xs">
            {/* Speedometer & Vital readout */}
            <div className="flex items-center gap-3 font-mono">
              <div className="flex items-center gap-1.5 text-neutral-300">
                <Flame size={15} className="text-orange-400" />
                <span>{speedKph} KM/H</span>
              </div>
              <span className="text-neutral-700">|</span>
              <div className="text-neutral-400">
                {isAr ? 'الزمن:' : 'TIME:'} <span className="text-white font-bold">{missionTimeSeconds}s</span>
              </div>
            </div>

            {/* Quick Interactive Actions */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={fireLaserBullet}
                className="px-3 py-1.5 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/40 text-cyan-300 font-bold flex items-center gap-1.5 cursor-pointer active:scale-95"
                title="Space"
              >
                <Crosshair size={14} />
                <span>{isAr ? 'إطلاق بلازما' : 'Fire Laser'}</span>
              </button>

              <button
                type="button"
                onClick={() => setCameraMode((prev) => (prev === 'chase' ? 'cockpit' : prev === 'cockpit' ? 'top' : 'chase'))}
                className="px-3 py-1.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-neutral-200 flex items-center gap-1.5 cursor-pointer"
                title="Camera view (C)"
              >
                <Camera size={14} />
                <span className="capitalize">{cameraMode}</span>
              </button>

              <button
                type="button"
                onClick={toggleMute}
                className="p-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-neutral-200 cursor-pointer"
                title="Mute / Unmute (M)"
              >
                {isMuted ? <VolumeX size={15} /> : <Volume2 size={15} />}
              </button>

              <button
                type="button"
                onClick={() => setGameState((prev) => (prev === 'playing' ? 'paused' : prev === 'paused' ? 'playing' : prev))}
                className="p-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-neutral-200 cursor-pointer"
                title="Pause (P)"
              >
                {gameState === 'paused' ? <Play size={15} /> : <Pause size={15} />}
              </button>

              <button
                type="button"
                onClick={handleRestart}
                className="p-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-neutral-200 cursor-pointer"
                title="Restart"
              >
                <RotateCcw size={15} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
