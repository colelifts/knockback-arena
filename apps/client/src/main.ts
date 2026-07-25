import './styles/main.css';
import { GameApp } from './app/GameApp.js';

const mount = document.querySelector<HTMLElement>('#app')!;
mount.innerHTML = `<div class="loading"><div class="loading-mark">KA</div><div class="loading-bar"><i></i></div><p>INITIALIZING ARENA PHYSICS</p></div>`;
try {
  const app = new GameApp();
  await app.start();
  mount.remove();
} catch (error) {
  console.error(error);
  mount.innerHTML = `<main class="fatal"><h1>ARENA OFFLINE</h1><p>WebGL or physics could not initialize. Update your browser and graphics drivers, then reload.</p><button onclick="location.reload()">TRY AGAIN</button></main>`;
}
