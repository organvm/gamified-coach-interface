
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OrbitalNodes } from '../OrbitalNodes.js';
import * as THREE from 'three';

// Mock Three.js parts that require WebGL or browser context
vi.mock('three', async () => {
  const actual = await vi.importActual('three');
  return {
    ...actual,
    WebGLRenderer: vi.fn().mockImplementation(() => ({
      setSize: vi.fn(),
      setPixelRatio: vi.fn(),
      shadowMap: { enabled: false, type: null },
      domElement: {},
      render: vi.fn(),
      dispose: vi.fn(),
    })),
    // SphereGeometry might be safe, but let's see.
    // MeshBasicMaterial is safe.
    // Mesh is safe.
  };
});

describe('OrbitalNodes', () => {
  let scene;
  let strategyCore;

  beforeEach(() => {
    scene = new THREE.Scene();
    strategyCore = {}; // Mock strategy core
  });

  it('should instantiate without crashing', () => {
    expect(() => {
      new OrbitalNodes(scene, strategyCore);
    }).not.toThrow();
  });

  it('should have created nodes', () => {
    const orbitalNodes = new OrbitalNodes(scene, strategyCore);
    expect(orbitalNodes.nodes.length).toBeGreaterThan(0);
  });
});
