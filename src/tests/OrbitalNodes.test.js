import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OrbitalNodes } from '../OrbitalNodes.js';
import * as THREE from 'three';

// Mock Three.js
vi.mock('three', () => {
  // We need constructible functions
  const Mesh = vi.fn();
  Mesh.prototype.add = vi.fn();
  Mesh.prototype.position = { x: 0, y: 0, z: 0 };
  Mesh.prototype.scale = { setScalar: vi.fn() };
  Mesh.prototype.userData = {};
  // Create a mock material object that will be assigned to mesh.material
  Mesh.prototype.material = { emissiveIntensity: 0 };

  const SphereGeometry = vi.fn();
  const MeshBasicMaterial = vi.fn();
  const PointLight = vi.fn();

  return {
    Mesh,
    SphereGeometry,
    MeshBasicMaterial,
    PointLight
  };
});

describe('OrbitalNodes', () => {
  let sceneMock;
  let strategyCoreMock;

  beforeEach(() => {
    sceneMock = {
      add: vi.fn()
    };
    strategyCoreMock = {};
  });

  it('should instantiate without crashing', () => {
    // This is expected to fail with "ReferenceError: sharedGeometry is not defined"
    // or similar, until we fix the bug.
    expect(() => {
      new OrbitalNodes(sceneMock, strategyCoreMock);
    }).not.toThrow();
  });

  it('should run update loop without errors', () => {
    const nodes = new OrbitalNodes(sceneMock, strategyCoreMock);
    expect(() => {
      nodes.update(100);
    }).not.toThrow();
  });
});
