// Boucle à pas fixe : la simulation avance par tranches de `dt`, le rendu interpole entre deux états.

export function createLoop({ step, render, dt, maxSteps = 4 }) {
  let acc = 0;
  let last = 0;
  let running = false;

  function frame(now) {
    if (!running) return;
    const elapsed = Math.min((now - last) / 1000, dt * maxSteps);
    last = now;
    acc += elapsed;
    while (acc >= dt) {
      step(dt);
      acc -= dt;
    }
    render(acc / dt, elapsed);
    requestAnimationFrame(frame);
  }

  return {
    start() {
      if (running) return;
      running = true;
      last = performance.now();
      requestAnimationFrame(frame);
    },
    stop() {
      running = false;
    },
  };
}
