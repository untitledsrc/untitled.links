(function () {
    const canvas = document.getElementById('usb-canvas');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const W = 72, H = 90, CELL = 4, DOT = 3;
    const HALF_H = 27, HALF_W = HALF_H * W / H;
    const SPHERE2 = 28 * 28;
    const CENTER_Y = 3.5;
    const LIGHT = [-0.55, 0.75, 0.55];
    const DARK_INK = 0xFFF0F0F0;
    const LIGHT_INK = 0xFF1A1A1A;

    canvas.width = W * CELL;
    canvas.height = H * CELL;
    const img = ctx.createImageData(W * CELL, H * CELL);
    const out = new Uint32Array(img.data.buffer);

    const BAYER = new Float32Array(64);
    (function () {
        function bayer(n) {
            if (n === 1) return [[0]];
            const m = bayer(n / 2);
            const s = m.length;
            const add = [[0, 2], [3, 1]];
            const res = [];
            for (let y = 0; y < n; y++) {
                res.push([]);
                for (let x = 0; x < n; x++) {
                    res[y].push(4 * m[y % s][x % s] + add[Math.floor(y / s)][Math.floor(x / s)]);
                }
            }
            return res;
        }
        bayer(8).forEach((row, y) => row.forEach((v, x) => { BAYER[y * 8 + x] = (v + 0.5) / 64; }));
    })();

    const lum = new Float32Array(W * H);
    const depth = new Float32Array(W * H);
    const hit = new Uint8Array(W * H);

    let mat = 0;

    function box(px, py, pz, bx, by, bz, r) {
        const qx = Math.abs(px) - bx + r;
        const qy = Math.abs(py) - by + r;
        const qz = Math.abs(pz) - bz + r;
        const mx = qx > 0 ? qx : 0, my = qy > 0 ? qy : 0, mz = qz > 0 ? qz : 0;
        return Math.sqrt(mx * mx + my * my + mz * mz) + Math.min(Math.max(qx, qy, qz), 0) - r;
    }

    function map(x, y, z) {
        let body = box(x, y + 4, z, 9.5, 17, 4.9, 2.6);
        const hole = 2.4 - Math.hypot(x, y + 16.5);
        if (hole > body) body = hole;
        const groove = 0.3 - Math.abs(y - 6.5);
        if (groove > body) body = groove;

        const outer = box(x, y - 19, z, 6, 9, 2.3, 0.5);
        const inner = box(x, y - 23.5, z, 5.4, 6.5, 1.55, 0.2);
        const slot = box(Math.abs(x) - 2.6, y - 14.5, Math.abs(z) - 2.3, 0.8, 1.1, 0.6, 0.1);
        let shell = Math.max(outer, -inner);
        if (-slot > shell) shell = -slot;

        const tongue = box(x, y - 21, z + 0.1, 5, 4.5, 0.55, 0.1);

        let d = body;
        mat = 0;
        if (tongue < d) d = tongue;
        if (shell < d) { d = shell; mat = 1; }
        return d;
    }

    function buildMatrix(theta, pitch, lean) {
        const cy = Math.cos(theta), sy = Math.sin(theta);
        const cx = Math.cos(pitch), sx = Math.sin(pitch);
        const cz = Math.cos(lean), sz = Math.sin(lean);

        const ry = [cy, 0, sy, 0, 1, 0, -sy, 0, cy];
        const rx = [1, 0, 0, 0, cx, -sx, 0, sx, cx];
        const rz = [cz, -sz, 0, sz, cz, 0, 0, 0, 1];

        function mul(a, b) {
            const r = new Array(9);
            for (let i = 0; i < 3; i++) {
                for (let j = 0; j < 3; j++) {
                    r[i * 3 + j] = a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j];
                }
            }
            return r;
        }
        return mul(rz, mul(rx, ry));
    }

    const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;

    function render(t) {
        const dark = !document.body.classList.contains('light-theme');
        const R = buildMatrix(t * 0.55 + 0.6, 0.3 + 0.06 * Math.sin(t * 0.7), -0.42 + 0.04 * Math.sin(t * 0.45));

        const dx = -R[6], dy = -R[7], dz = -R[8];
        const lx = R[0] * LIGHT[0] + R[3] * LIGHT[1] + R[6] * LIGHT[2];
        const ly = R[1] * LIGHT[0] + R[4] * LIGHT[1] + R[7] * LIGHT[2];
        const lz = R[2] * LIGHT[0] + R[5] * LIGHT[1] + R[8] * LIGHT[2];
        const ll = Math.hypot(lx, ly, lz);
        const Lx = lx / ll, Ly = ly / ll, Lz = lz / ll;

        const lvl = Math.hypot(LIGHT[0], LIGHT[1], LIGHT[2]);
        const lvx = LIGHT[0] / lvl, lvy = LIGHT[1] / lvl, lvz = LIGHT[2] / lvl;
        let hx = lvx, hy = lvy, hz = lvz + 1;
        const hl = Math.hypot(hx, hy, hz);
        hx /= hl; hy /= hl; hz /= hl;

        hit.fill(0);

        for (let py = 0; py < H; py++) {
            const yv = (0.5 - (py + 0.5) / H) * 2 * HALF_H;
            for (let px = 0; px < W; px++) {
                const xv = ((px + 0.5) / W - 0.5) * 2 * HALF_W;
                const r2 = xv * xv + yv * yv;
                if (r2 >= SPHERE2) continue;

                const half = Math.sqrt(SPHERE2 - r2);
                const ox = R[0] * xv + R[3] * yv + R[6] * half;
                const oy = R[1] * xv + R[4] * yv + R[7] * half + CENTER_Y;
                const oz = R[2] * xv + R[5] * yv + R[8] * half;

                let tt = 0, found = false;
                const tEnd = 2 * half;
                for (let i = 0; i < 44; i++) {
                    const d = map(ox + dx * tt, oy + dy * tt, oz + dz * tt);
                    if (d < 0.02) { found = true; break; }
                    tt += d;
                    if (tt > tEnd) break;
                }
                if (!found) continue;

                const x = ox + dx * tt, y = oy + dy * tt, z = oz + dz * tt;
                map(x, y, z);
                const m = mat;

                const e = 0.04;
                const n1 = map(x + e, y - e, z - e);
                const n2 = map(x - e, y - e, z + e);
                const n3 = map(x - e, y + e, z - e);
                const n4 = map(x + e, y + e, z + e);
                let nx = n1 - n2 - n3 + n4;
                let ny = -n1 - n2 + n3 + n4;
                let nz = -n1 + n2 - n3 + n4;
                const nl = Math.hypot(nx, ny, nz) || 1;
                nx /= nl; ny /= nl; nz /= nl;

                const vx = R[0] * nx + R[1] * ny + R[2] * nz;
                const vy = R[3] * nx + R[4] * ny + R[5] * nz;
                const vz = R[6] * nx + R[7] * ny + R[8] * nz;

                let occ = 0, w = 1;
                for (let k = 1; k <= 4; k++) {
                    const h = 0.55 * k;
                    occ += (h - map(x + nx * h, y + ny * h, z + nz * h)) * w;
                    w *= 0.6;
                }
                const ao = clamp01(1 - 0.32 * occ);

                let shadow = 1, s = 0.2;
                const sx0 = x + nx * 0.08, sy0 = y + ny * 0.08, sz0 = z + nz * 0.08;
                for (let k = 0; k < 14; k++) {
                    const h = map(sx0 + Lx * s, sy0 + Ly * s, sz0 + Lz * s);
                    if (h < 0.01) { shadow = 0; break; }
                    const q = 6 * h / s;
                    if (q < shadow) shadow = q;
                    s += h > 0.2 ? h : 0.2;
                    if (s > 40) break;
                }
                shadow = clamp01(shadow);

                const diff = Math.max(0, vx * lvx + vy * lvy + vz * lvz);
                const spec = Math.pow(Math.max(0, vx * hx + vy * hy + vz * hz), m ? 36 : 22);
                const rim = Math.pow(1 - Math.max(0, vz), 3);

                let L;
                if (m) {
                    const rdx = -2 * vz * vx, rdy = -2 * vz * vy;
                    const env = 0.5 + 0.5 * Math.sin(rdy * 4.2 + rdx * 1.6 + 0.8);
                    L = 0.14 + 0.55 * env * (0.45 + 0.55 * shadow) + 0.55 * spec * shadow + 0.2 * rim;
                    L *= 0.55 + 0.45 * ao;
                } else {
                    L = 0.16 + 0.8 * diff * shadow * ao + 0.3 * spec * shadow + 0.25 * rim * ao;
                }

                const idx = py * W + px;
                hit[idx] = 1;
                lum[idx] = clamp01(L);
                depth[idx] = half - tt;
            }
        }

        out.fill(0);
        const color = dark ? DARK_INK : LIGHT_INK;

        for (let py = 0; py < H; py++) {
            for (let px = 0; px < W; px++) {
                const idx = py * W + px;
                if (!hit[idx]) continue;

                let edge = false;
                const zc = depth[idx];
                if (px === 0 || px === W - 1 || py === 0 || py === H - 1) {
                    edge = true;
                } else {
                    const a = idx - 1, b = idx + 1, c = idx - W, d = idx + W;
                    if (!hit[a] || !hit[b] || !hit[c] || !hit[d]) {
                        edge = true;
                    } else if (depth[a] < zc - 3.5 || depth[b] < zc - 3.5 || depth[c] < zc - 3.5 || depth[d] < zc - 3.5) {
                        edge = true;
                    }
                }

                let ink = dark ? lum[idx] : 1 - lum[idx];
                ink = clamp01((ink - 0.05) / 0.9);
                ink = Math.pow(ink, 0.72);
                ink = ink * ink * (3 - 2 * ink);

                if (!edge && ink <= BAYER[((py & 7) << 3) | (px & 7)]) continue;

                const bx = px * CELL, by = py * CELL;
                for (let j = 0; j < DOT; j++) {
                    const row = (by + j) * W * CELL + bx;
                    for (let i = 0; i < DOT; i++) out[row + i] = color;
                }
            }
        }
        ctx.putImageData(img, 0, 0);
    }

    let running = false;
    let onScreen = false;
    let last = 0;

    function frame(now) {
        if (!running) return;
        if (now - last > 33) {
            last = now;
            render(now / 1000);
        }
        requestAnimationFrame(frame);
    }

    function update() {
        const should = onScreen && !document.hidden && !reducedMotion;
        if (should && !running) {
            running = true;
            requestAnimationFrame(frame);
        } else if (!should) {
            running = false;
        }
    }

    render(1.2);
    canvas.classList.add('is-ready');

    if ('IntersectionObserver' in window) {
        new IntersectionObserver(entries => {
            onScreen = entries[entries.length - 1].isIntersecting;
            update();
        }, { threshold: 0 }).observe(canvas);
    } else {
        onScreen = true;
        update();
    }

    document.addEventListener('visibilitychange', update);
})();
