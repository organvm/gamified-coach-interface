
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OrbitalNodes } from '../OrbitalNodes.js';
import * as THREE from 'three';

describe('OrbitalNodes', () => {
    let mockScene;
    let mockCore;
    let orbitalNodes;

    beforeEach(() => {
        mockScene = {
            add: vi.fn(),
            camera: { position: new THREE.Vector3(0, 0, 5) }
        };
        mockCore = {};
        orbitalNodes = new OrbitalNodes(mockScene, mockCore);
    });

    it('should create nodes', () => {
        expect(orbitalNodes.nodes.length).toBeGreaterThan(0);
        // expect(orbitalNodes.orbits.length).toBe(3); // This property doesn't exist in the current version of OrbitalNodes.js
        expect(mockScene.add).toHaveBeenCalled();
    });

    it('should update node positions', () => {
        const node = orbitalNodes.nodes[0];
        const initialPos = node.position.clone();

        // Advance time
        // We mock Date.now to ensure time advances
        const originalDateNow = Date.now;
        let mockTime = 1000;
        Date.now = () => mockTime;

        orbitalNodes.update();

        mockTime = 2000;
        orbitalNodes.update();

        // Position should change (unless speed is 0)
        expect(node.position).not.toEqual(initialPos);

        Date.now = originalDateNow;
    });
});
