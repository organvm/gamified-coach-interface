
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as THREE from 'three';
import { OrbitalNodes } from '../OrbitalNodes';

// Mock THREE.js
vi.mock('three', () => {
    // Classes must be functions or classes
    const Scene = vi.fn();
    Scene.prototype.add = vi.fn();

    const Mesh = vi.fn();
    Mesh.prototype.add = vi.fn();
    Mesh.prototype.scale = { setScalar: vi.fn() };
    Mesh.prototype.material = { emissiveIntensity: 0 };
    Mesh.prototype.position = { x: 0, y: 0, z: 0 };
    Mesh.prototype.userData = {};

    const SphereGeometry = vi.fn();
    const MeshBasicMaterial = vi.fn();
    const PointLight = vi.fn();
    const Vector2 = vi.fn();
    const Raycaster = vi.fn();

    return {
        Scene,
        Mesh,
        SphereGeometry,
        MeshBasicMaterial,
        PointLight,
        Vector2,
        Raycaster,
    };
});

describe('OrbitalNodes', () => {
    let mockScene;
    let mockStrategyCore;

    beforeEach(() => {
        mockScene = new THREE.Scene();
        mockStrategyCore = {};
    });

    it('should create nodes without crashing', () => {
        expect(() => {
            new OrbitalNodes(mockScene, mockStrategyCore);
        }).not.toThrow();
    });

    it('should update node positions in the animation loop', () => {
        const orbitalNodes = new OrbitalNodes(mockScene, mockStrategyCore);
        const nodes = orbitalNodes.getNodes();

        expect(nodes.length).toBeGreaterThan(0);

        // Initial position check (all 0 because mock default)
        // But the update loop sets them.

        // Run update
        orbitalNodes.update();

        // Check if positions were updated.
        // In our mock, position is a simple object, so we can check if x/z changed from 0.
        // Wait, the logic is: node.position.x = Math.cos(angle) * this.orbitRadius;
        // Cos(0) * 2.5 = 2.5. So x should be non-zero.

        const firstNode = nodes[0];
        expect(firstNode.position.x).not.toBe(0);
        expect(firstNode.position.z).not.toBe(0); // Sin(0) is 0, but angle depends on index and time.

        // Store previous position
        const prevX = firstNode.position.x;

        // Advance time (mock Date.now? or just call update again, time will change)
        // We can't easily mock Date.now without vi.useFakeTimers, but calling update again
        // will use a new Date.now() if enough time passes, or same if too fast.

        // Let's force a small delay or just assume Date.now changes?
        // Better: Mock Date.now or pass a delta if the method supported it.
        // The method uses `Date.now()`.

        vi.useFakeTimers();
        vi.setSystemTime(new Date(1000));
        orbitalNodes.update();
        const x1 = firstNode.position.x;

        vi.setSystemTime(new Date(2000));
        orbitalNodes.update();
        const x2 = firstNode.position.x;

        expect(x1).not.toBe(x2);

        vi.useRealTimers();
    });
});
