import { describe, it, expect, vi } from 'vitest';
import { OrbitalNodes } from '../OrbitalNodes.js';
import * as THREE from 'three';

// Mock Three.js
vi.mock('three', () => {
  // Mock constructors to return objects with minimal necessary interface
  class MockMesh {
    constructor(geometry, material) {
      this.geometry = geometry;
      this.material = material;
      this.userData = {};
      this.position = { x: 0, y: 0, z: 0 };
      this.scale = { setScalar: vi.fn() };
      this.add = vi.fn();
    }
  }

  return {
    SphereGeometry: vi.fn(),
    MeshBasicMaterial: vi.fn(),
    Mesh: MockMesh,
    PointLight: vi.fn(),
    Vector3: vi.fn(),
    Color: vi.fn(),
  };
});

describe('OrbitalNodes', () => {
  it('should instantiate and create nodes without ReferenceError', () => {
    const mockScene = { add: vi.fn() };
    const mockStrategyCore = {};

    // This constructor calls createNodes(), which contains the bug
    // It should throw "ReferenceError: sharedGeometry is not defined" before the fix
    expect(() => {
      new OrbitalNodes(mockScene, mockStrategyCore);
    }).not.toThrow();
  });
});
