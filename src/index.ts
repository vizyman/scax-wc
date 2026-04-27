import { LitElement, css, html } from 'lit';
import { customElement } from 'lit/decorators.js';
import * as THREE from 'three';

@customElement('scax-three-viewer')
export class ScaxThreeViewer extends LitElement {
  static styles = css`
    :host {
      display: block;
      width: 100%;
      max-width: 640px;
      aspect-ratio: 16 / 9;
      border: 1px solid #d1d5db;
      border-radius: 12px;
      overflow: hidden;
      background: #111827;
    }

    #canvas-root {
      width: 100%;
      height: 100%;
    }
  `;

  private scene?: THREE.Scene;
  private camera?: THREE.PerspectiveCamera;
  private renderer?: THREE.WebGLRenderer;
  private cube?: THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial>;
  private animationId?: number;

  render() {
    return html`<div id="canvas-root"></div>`;
  }

  firstUpdated(): void {
    const root = this.renderRoot.querySelector('#canvas-root') as HTMLDivElement | null;
    if (!root) return;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#111827');

    this.camera = new THREE.PerspectiveCamera(75, root.clientWidth / root.clientHeight, 0.1, 1000);
    this.camera.position.z = 2;

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setSize(root.clientWidth, root.clientHeight);
    root.append(this.renderer.domElement);

    const geometry = new THREE.BoxGeometry();
    const material = new THREE.MeshStandardMaterial({ color: '#60a5fa' });
    this.cube = new THREE.Mesh(geometry, material);
    this.scene.add(this.cube);

    const light = new THREE.DirectionalLight('#ffffff', 1);
    light.position.set(5, 5, 5);
    this.scene.add(light);

    const ambient = new THREE.AmbientLight('#ffffff', 0.35);
    this.scene.add(ambient);

    window.addEventListener('resize', this.handleResize);
    this.renderLoop();
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();

    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
    }

    window.removeEventListener('resize', this.handleResize);
    this.renderer?.dispose();
    this.cube?.geometry.dispose();
    this.cube?.material.dispose();
  }

  private renderLoop = () => {
    if (!this.scene || !this.camera || !this.renderer || !this.cube) return;

    this.cube.rotation.x += 0.01;
    this.cube.rotation.y += 0.01;
    this.renderer.render(this.scene, this.camera);
    this.animationId = requestAnimationFrame(this.renderLoop);
  };

  private handleResize = () => {
    const root = this.renderRoot.querySelector('#canvas-root') as HTMLDivElement | null;
    if (!root || !this.camera || !this.renderer) return;

    this.camera.aspect = root.clientWidth / root.clientHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(root.clientWidth, root.clientHeight);
  };
}

declare global {
  interface HTMLElementTagNameMap {
    'scax-three-viewer': ScaxThreeViewer;
  }
}
