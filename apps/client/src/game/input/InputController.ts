export interface InputFrame {
  moveX: number;
  moveZ: number;
  jump: boolean;
  dodge: boolean;
  punch: boolean;
  brace: boolean;
}
export class InputController {
  private readonly keys = new Set<string>();
  private jumpQueued = false;
  private dodgeQueued = false;
  private punchQueued = false;
  private enabled = true;
  constructor(
    private readonly canvas: HTMLCanvasElement,
    onMouse: (dx: number, dy: number) => void,
    onPause: () => void,
  ) {
    window.addEventListener('keydown', (event) => {
      if (event.code === 'Escape') {
        onPause();
        return;
      }
      this.keys.add(event.code);
      if (event.code === 'Space') {
        event.preventDefault();
        this.jumpQueued = true;
      }
      if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') this.dodgeQueued = true;
    });
    window.addEventListener('keyup', (event) => this.keys.delete(event.code));
    canvas.addEventListener('mousedown', (event) => {
      if (event.button === 0) {
        this.punchQueued = true;
        if (document.pointerLockElement !== canvas) void canvas.requestPointerLock();
      }
    });
    document.addEventListener('mousemove', (event) => {
      if (document.pointerLockElement === canvas) onMouse(event.movementX, event.movementY);
    });
    window.addEventListener('blur', () => this.keys.clear());
  }
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) this.keys.clear();
  }
  frame(): InputFrame {
    if (!this.enabled)
      return { moveX: 0, moveZ: 0, jump: false, dodge: false, punch: false, brace: false };
    const moveX = Number(this.keys.has('KeyD')) - Number(this.keys.has('KeyA'));
    const moveZ = Number(this.keys.has('KeyW')) - Number(this.keys.has('KeyS'));
    const frame = {
      moveX,
      moveZ,
      jump: this.jumpQueued,
      dodge: this.dodgeQueued,
      punch: this.punchQueued,
      brace: this.keys.has('KeyE'),
    };
    this.jumpQueued = false;
    this.dodgeQueued = false;
    this.punchQueued = false;
    return frame;
  }
  testKey(code: string, down: boolean): void {
    if (down) this.keys.add(code);
    else this.keys.delete(code);
  }
  testPunch(): void {
    this.punchQueued = true;
  }
}
