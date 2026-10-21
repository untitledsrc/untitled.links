(function () {
    const canvas = document.getElementById('dither-canvas');
    const heroEl = document.getElementById('main');
    if (!canvas || !heroEl) return;

    const ctx = canvas.getContext('2d');
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const MAX_OPACITY = 0.16;
    const COVERAGE = 0.9;
    const DENSITY = 0.55;

    function bayer(n) {
        if (n === 1) return [[0]];
        const m = bayer(n / 2);
        const s = m.length;
        const add = [[0, 2], [3, 1]];
        const out = [];
        for (let y = 0; y < n; y++) {
            out.push([]);
            for (let x = 0; x < n; x++) {
                out[y].push(4 * m[y % s][x % s] + add[Math.floor(y / s)][Math.floor(x / s)]);
            }
        }
        return out;
    }
    const BAYER = new Float32Array(64);
    bayer(8).forEach((row, y) => row.forEach((v, x) => { BAYER[y * 8 + x] = (v + 0.5) / 64; }));

    let P = 4, W = 0, H = 0, img = null, buf = null, dx2 = null, dy2 = null, sinX = null;
    let running = false;

    function resize() {
        P = window.innerWidth < 700 ? 3 : 4;
        W = Math.ceil(window.innerWidth / P);
        H = Math.ceil(window.innerHeight / P);
        canvas.width = W;
        canvas.height = H;
        img = ctx.createImageData(W, H);
        buf = new Uint32Array(img.data.buffer);

        dx2 = new Float32Array(W);
        dy2 = new Float32Array(H);
        sinX = new Float32Array(W);
        for (let x = 0; x < W; x++) { const k = (x - W / 2) / (W / 2); dx2[x] = k * k; }
        for (let y = 0; y < H; y++) { const k = (y - H / 2) / (H / 2); dy2[y] = k * k; }
        render(performance.now() / 1000);
    }

    function heroVisibility() {
        return Math.max(0, Math.min(1, heroEl.getBoundingClientRect().bottom / window.innerHeight));
    }

    function render(t) {
        for (let x = 0; x < W; x++) sinX[x] = Math.sin(x * 0.08 + t * 0.3);

        for (let y = 0; y < H; y++) {
            const wy = Math.sin(y * 0.06 - t * 0.2);
            const row = y * W;
            const by = (y & 7) << 3;

            for (let x = 0; x < W; x++) {
                let e = dx2[x] + dy2[y] + 0.05 * sinX[x] * wy - COVERAGE;
                e = e < 0 ? 0 : e > 1 ? 1 : e;
                const f = e * e * (3 - 2 * e);

                buf[row + x] = f * DENSITY > BAYER[by | (x & 7)] ? 0xFFFFFFFF : 0;
            }
        }
        ctx.putImageData(img, 0, 0);
    }

    function updateOpacity() {
        const v = heroVisibility();
        const intro = typeof window.__introDither === 'number' ? window.__introDither : 1;
        canvas.style.opacity = (MAX_OPACITY * v * intro).toFixed(3);
        return v;
    }

    let last = 0;
    function frame(now) {
        if (!running) return;
        if (updateOpacity() <= 0) { running = false; return; }

        if (now - last > 50) {
            last = now;
            render(now / 1000);
        }
        requestAnimationFrame(frame);
    }

    function start() {
        if (running || reducedMotion || document.hidden) return;
        running = true;
        requestAnimationFrame(frame);
    }

    window.addEventListener('scroll', () => {
        const v = updateOpacity();
        if (v > 0 && !running) start();
    }, { passive: true });

    document.addEventListener('visibilitychange', () => {
        if (document.hidden) running = false; else start();
    });

    let resizeTimer;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => { resize(); updateOpacity(); }, 100);
    });

    resize();
    updateOpacity();
    start();
})();
