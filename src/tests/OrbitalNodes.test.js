
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as THREE from 'three';

// Mock Three.js
vi.mock('three', () => {
    const THREE = {
        SphereGeometry: vi.fn(),
        MeshBasicMaterial: vi.fn(),
        Mesh: vi.fn(),
        PointLight: vi.fn(),
        Object3D: vi.fn(),
        Scene: vi.fn(),
    };

    THREE.SphereGeometry.prototype = {};
    THREE.MeshBasicMaterial.prototype = {};
    THREE.Mesh.prototype = {
        add: vi.fn(),
        position: { x: 0, y: 0, z: 0 },
        scale: { setScalar: vi.fn() },
        userData: {}
    };
    THREE.PointLight.prototype = {};
    THREE.Object3D.prototype = {
        add: vi.fn(),
    };
    THREE.Scene.prototype = {
        add: vi.fn(),
    };

    return THREE;
});

// Import the class under test
import { OrbitalNodes } from '../OrbitalNodes';

describe('OrbitalNodes', () => {
    let mockScene;
    let mockStrategyCore;

    beforeEach(() => {
        mockScene = new THREE.Scene();
        mockStrategyCore = {};
        vi.clearAllMocks();
    });

    it('should create nodes with shared geometry', () => {
        const orbitalNodes = new OrbitalNodes(mockScene, mockStrategyCore);

        // Check if geometry was created once
        expect(THREE.SphereGeometry).toHaveBeenCalledTimes(1);

        // Check if nodes were created
        expect(THREE.Mesh).toHaveBeenCalledTimes(5);

        // Verify nodes were added to scene
        expect(mockScene.add).toHaveBeenCalledTimes(5);

        // Verify node initialization
        expect(orbitalNodes.nodes.length).toBe(5);
    });

    it('should update nodes without errors', () => {
        const orbitalNodes = new OrbitalNodes(mockScene, mockStrategyCore);

        // Should not throw
        expect(() => orbitalNodes.update()).not.toThrow();

        // Check if positions were updated (mock check)
        // Since we mock Mesh, we can't easily check actual values without more complex mocks,
        // but not throwing is the first step.
    });
});
