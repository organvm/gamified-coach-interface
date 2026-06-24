
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OrbitalNodes } from '../OrbitalNodes.js';
import * as THREE from 'three';

// Mock THREE parts that might cause issues in non-browser env or just to simplify
vi.mock('three', async () => {
  const actual = await vi.importActual('three');
  return {
    ...actual,
    WebGLRenderer: vi.fn().mockReturnValue({
      setSize: vi.fn(),
      setPixelRatio: vi.fn(),
      render: vi.fn(),
      domElement: {}, // Mock domElement as empty object in Node env
    }),
  };
});

describe('OrbitalNodes', () => {
  let scene;
  let strategyCore;

  beforeEach(() => {
    scene = new THREE.Scene();
    strategyCore = {}; // Mock strategyCore
  });

  it('should instantiate without crashing', () => {
    expect(() => {
      new OrbitalNodes(scene, strategyCore);
    }).not.toThrow();
  });

  it('should create nodes correctly', () => {
    const orbitalNodes = new OrbitalNodes(scene, strategyCore);
    expect(orbitalNodes.nodes.length).toBeGreaterThan(0);
  });
});
