import * as THREE from 'three';
import { StrategyCore } from './StrategyCore.js';
import { OrbitalNodes } from './OrbitalNodes.js';

/**
 * SceneManager - Manages the Three.js scene, camera, and rendering
 */
export class SceneManager {
    constructor(containerElement) {
        this.container = containerElement;
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.strategyCore = null;
        this.orbitalNodes = null;
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();
        this.animationId = null;
        this.frameCount = 0;

        this.init();
        this.setupLights();
        this.setupObjects();
        this.setupEventListeners();

        // Performance: Bind animate once to avoid creating new functions every frame
        this.boundAnimate = this.animate.bind(this);
        this.animate();
    }

    init() {
        // Scene
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x000000);
        this.scene.fog = new THREE.Fog(0x000000, 5, 15);

        // Camera
        this.camera = new THREE.PerspectiveCamera(
            50,
            window.innerWidth / window.innerHeight,
            0.1,
            1000
        );
        this.camera.position.set(0, 2, 5);
        this.camera.lookAt(0, 0, 0);

        // Renderer
        this.renderer = new THREE.WebGLRenderer({
            antialias: true,
            alpha: true
        });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

        this.container.appendChild(this.renderer.domElement);
    }

    setupLights() {
        // Key light (cyan directional)
        const keyLight = new THREE.DirectionalLight(0x00ffff, 1);
        keyLight.position.set(5, 5, 5);
        keyLight.castShadow = true;
        keyLight.shadow.camera.near = 0.1;
        keyLight.shadow.camera.far = 50;
        keyLight.shadow.mapSize.width = 1024;
        keyLight.shadow.mapSize.height = 1024;
        this.scene.add(keyLight);

        // Fill light (orange directional)
        const fillLight = new THREE.DirectionalLight(0xff4f00, 0.3);
        fillLight.position.set(-5, 3, -5);
        this.scene.add(fillLight);

        // Ambient light (subtle)
        const ambientLight = new THREE.AmbientLight(0x7a7a7a, 0.1);
        this.scene.add(ambientLight);

        // Rim light (back light)
        const rimLight = new THREE.DirectionalLight(0x00ffff, 0.5);
        rimLight.position.set(0, 5, -5);
        this.scene.add(rimLight);
    }

    setupObjects() {
        // Create Strategy Core
        this.strategyCore = new StrategyCore(this.scene);

        // Create Orbital Nodes
        this.orbitalNodes = new OrbitalNodes(this.scene, this.strategyCore);

        // Optional: Add particle system for extra ambiance
        this.createParticleField();
    }

    createParticleField() {
        const particleCount = 100;
        const positions = new Float32Array(particleCount * 3);

        for (let i = 0; i < particleCount * 3; i += 3) {
            positions[i] = (Math.random() - 0.5) * 20;
            positions[i + 1] = (Math.random() - 0.5) * 20;
            positions[i + 2] = (Math.random() - 0.5) * 20;
        }

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

        const material = new THREE.PointsMaterial({
            color: 0x00ffff,
            size: 0.05,
            transparent: true,
            opacity: 0.3,
            blending: THREE.AdditiveBlending
        });

        const particles = new THREE.Points(geometry, material);
        this.scene.add(particles);
    }

    setupEventListeners() {
        // Window resize
        window.addEventListener('resize', () => this.onWindowResize(), false);

        // Mouse move for hover effects
        window.addEventListener('mousemove', (event) => this.onMouseMove(event), false);

        // Click for node activation
        window.addEventListener('click', (event) => this.onClick(event), false);
    }

    onWindowResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    onMouseMove(event) {
        // Calculate mouse position in normalized device coordinates
        this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    }

    onClick(event) {
        // Calculate mouse position
        this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

        // Check for node click
        const nodeData = this.orbitalNodes.handleClick(
            this.raycaster,
            this.camera,
            this.mouse
        );

        if (nodeData) {
            console.log('Node clicked:', nodeData);
        }
    }

    animate() {
        this.animationId = requestAnimationFrame(this.boundAnimate);

        // Update objects
        const deltaTime = 0.016; // ~60fps
        this.strategyCore.update(deltaTime);
        this.orbitalNodes.update();

        // Throttle hover check to every 3rd frame (20fps effective check) to save CPU
        // This maintains interactivity with moving objects while reducing raycasting overhead
        this.frameCount++;
        if (this.frameCount % 3 === 0) {
            const hoveredNodeId = this.orbitalNodes.handleHover(
                this.raycaster,
                this.camera,
                this.mouse
            );

            if (hoveredNodeId) {
                document.body.style.cursor = 'pointer';
            } else {
                document.body.style.cursor = 'default';
            }
        }

        // Render
        this.renderer.render(this.scene, this.camera);
    }

    // Public methods to control Strategy Core state
    setCoreStat(state) {
        switch (state) {
            case 'analyzing':
                this.strategyCore.enterAnalysisMode();
                break;
            case 'glitching':
                this.strategyCore.enterGlitchMode();
                break;
            case 'success':
                this.strategyCore.enterSuccessMode();
                break;
            case 'idle':
                this.strategyCore.returnToIdle();
                break;
        }
    }

    // Clean up
    dispose() {
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
        }
        this.renderer.dispose();
        this.scene.clear();
    }

    // Getters
    getStrategyCore() {
        return this.strategyCore;
    }

    getOrbitalNodes() {
        return this.orbitalNodes;
    }
}
