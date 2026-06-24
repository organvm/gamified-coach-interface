import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as THREE from 'three';
import { OrbitalNodes } from '../OrbitalNodes';

// Mock THREE.js
vi.mock('three', () => {
  const MeshBasicMaterial = vi.fn().mockImplementation(function(params) {
      this.setValues = vi.fn();
      // Emissive properties removed
  });

  const Mesh = vi.fn().mockImplementation(function(geometry, material) {
    this.add = vi.fn();
    this.position = { x: 0, y: 0, z: 0 };
    this.scale = { setScalar: vi.fn() };
    this.userData = {};
    this.material = material;
    this.geometry = geometry;
  });

  const SphereGeometry = vi.fn().mockImplementation(function() {});
  const PointLight = vi.fn().mockImplementation(function() {});

  return {
    MeshBasicMaterial,
    Mesh,
    SphereGeometry,
    PointLight,
    Scene: vi.fn(),
  };
});

describe('OrbitalNodes', () => {
  let scene;
  let strategyCore;

  beforeEach(() => {
    scene = {
      add: vi.fn()
    };
    strategyCore = {};
  });

  it('should instantiate correctly using shared geometry', () => {
    // This should NOT throw
    const orbitalNodes = new OrbitalNodes(scene, strategyCore);

    expect(orbitalNodes).toBeDefined();
    expect(orbitalNodes.nodes.length).toBeGreaterThan(0);
    expect(scene.add).toHaveBeenCalledTimes(orbitalNodes.nodes.length);

    // Verify shared geometry usage
    const firstNodeGeometry = orbitalNodes.nodes[0].geometry;
    expect(firstNodeGeometry).toBeDefined();

    orbitalNodes.nodes.forEach(node => {
        expect(node.geometry).toBe(firstNodeGeometry);
    });
  });
});
