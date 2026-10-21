(function () {
    const canvas = document.getElementById('globe-canvas');
    if (!canvas) return;

    const cell = canvas.parentElement;
    const ctx = canvas.getContext('2d');
    const asciiCanvas = document.createElement('canvas');
    asciiCanvas.className = 'globe-ascii';
    asciiCanvas.setAttribute('aria-hidden', 'true');
    cell.appendChild(asciiCanvas);
    const actx = asciiCanvas.getContext('2d');
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const PX = 2;
    const FPS = 30;
    const ASCII_FPS = 12;
    const ASCII_FPS_ACTIVE = 30;
    const POINTER_R = 80;
    const RAMP = ' .:-=+*#%@';
    const GLITCH = '01<>/\{}[]#$%&*+=';
    const FONT_SIZE = 10;
    const LINE_H = 11;
    const FONT = `${FONT_SIZE}px ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace`;
    const ANGLE_STEP = 0.02;
    const GRID = Math.PI / 12;
    const SAMPLE = Math.PI / 60;
    const PITCH = 0.4;
    const LEAN = 0.3;
    const COS_P = Math.cos(PITCH), SIN_P = Math.sin(PITCH);
    const COS_L = Math.cos(LEAN), SIN_L = Math.sin(LEAN);

    let gw = 0, gh = 0;
    let img = null, buf = null;
    let geo = null;
    let clearIdx = new Uint32Array(0), inkIdx = new Uint32Array(0);
    let insideMask = null;
    let asciiCells = [], asciiRows = 1, asciiCols = 1;
    let inkCss = '#f0f0f0';
    let dpr = 1;
    let lastAsciiTick = -1;
    let asciiCw = 6;
    const pointer = { x: -9999, y: -9999, tx: -9999, ty: -9999, active: false };
    let strength = 0;
    let color = 0xFFF0F0F0;
    let lastLight = null;
    let running = false, onScreen = false, lastTick = -1;

    function parseColor(str, fallback) {
        const s = (str || '').trim();
        let m = s.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
        if (m) {
            let hex = m[1];
            if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
            const r = parseInt(hex.slice(0, 2), 16), g = parseInt(hex.slice(2, 4), 16), b = parseInt(hex.slice(4, 6), 16);
            return (0xFF000000 | (b << 16) | (g << 8) | r) >>> 0;
        }
        m = s.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
        if (m) return (0xFF000000 | (+m[3] << 16) | (+m[2] << 8) | +m[1]) >>> 0;
        return fallback;
    }

    function readTheme() {
        const light = document.body.classList.contains('light-theme');
        if (light === lastLight) return;
        lastLight = light;
        const v = getComputedStyle(document.body).getPropertyValue('--text-color');
        color = parseColor(v, light ? 0xFF1A1A1A : 0xFFF0F0F0);
        inkCss = v.trim() || (light ? '#1a1a1a' : '#f0f0f0');
    }

    function layout() {
        const rc = canvas.getBoundingClientRect();
        const rp = cell.getBoundingClientRect();
        const cw = rp.width, ch = rp.height;
        const R = Math.min(ch * 0.82, cw * 0.62) / PX;
        geo = {
            cx: (rp.left - rc.left + cw * 0.4) / PX,
            cy: (rp.top - rc.top + ch * 0.5) / PX,
            R,
            sx: 0, sy: 0, sh: R * 0.42
        };
        geo.sx = geo.cx + R * 0.7;
        geo.sy = geo.cy + R * 0.56;
        return rc;
    }

    function resize() {
        const rc = layout();
        gw = Math.max(1, Math.round(rc.width / PX));
        gh = Math.max(1, Math.round(rc.height / PX));
        canvas.width = gw;
        canvas.height = gh;
        img = ctx.createImageData(gw, gh);
        buf = new Uint32Array(img.data.buffer);
        dpr = Math.min(window.devicePixelRatio || 1, 2);
        asciiCanvas.width = Math.max(1, Math.round(rc.width * dpr));
        asciiCanvas.height = Math.max(1, Math.round(rc.height * dpr));
        actx.setTransform(dpr, 0, 0, dpr, 0, 0);
        buildShield();
        buildAscii(outlineBounds());
    }

    function plot(x, y) {
        if (x < 0 || y < 0 || x >= gw || y >= gh) return;
        buf[y * gw + x] = color;
    }

    function segment(x0, y0, x1, y1) {
        x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
        const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
        const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
        let err = dx + dy;
        for (;;) {
            plot(x0, y0);
            if (x0 === x1 && y0 === y1) break;
            const e2 = 2 * err;
            if (e2 >= dy) { err += dy; x0 += sx; }
            if (e2 <= dx) { err += dx; y0 += sy; }
        }
    }

    function project(lat, lon) {
        const cl = Math.cos(lat);
        const x = cl * Math.sin(lon);
        const y = Math.sin(lat);
        const z = cl * Math.cos(lon);
        const y1 = y * COS_P - z * SIN_P;
        const z1 = y * SIN_P + z * COS_P;
        return [x * COS_L + y1 * SIN_L, -x * SIN_L + y1 * COS_L, z1];
    }

    function curve(count, pointAt) {
        let prev = null;
        for (let i = 0; i <= count; i++) {
            const p = pointAt(i);
            if (p[2] < 0) {
                prev = null;
                continue;
            }
            const x = geo.cx + p[0] * geo.R, y = geo.cy - p[1] * geo.R;
            if (prev) segment(prev[0], prev[1], x, y);
            prev = [x, y];
        }
    }

    function shieldPoints() {
        const k = 0.82;
        const pts = [];
        function bez(p0, p1, p2, p3, n) {
            for (let i = 1; i <= n; i++) {
                const t = i / n, u = 1 - t;
                pts.push([
                    u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
                    u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1]
                ]);
            }
        }
        pts.push([0, -1]);
        bez([0, -1], [0.3, -0.82], [0.6, -0.74], [1, -0.74], 10);
        pts.push([1, 0.04]);
        bez([1, 0.04], [1, 0.58], [0.5, 0.86], [0, 1], 16);
        bez([0, 1], [-0.5, 0.86], [-1, 0.58], [-1, 0.04], 16);
        pts.push([-1, -0.74]);
        bez([-1, -0.74], [-0.6, -0.74], [-0.3, -0.82], [0, -1], 10);
        return pts.map(p => [geo.sx + p[0] * k * geo.sh, geo.sy + p[1] * geo.sh]);
    }

    function buildShield() {
        const outline = shieldPoints();
        const n = outline.length;
        const ink = new Uint8Array(gw * gh);
        const clear = new Uint8Array(gw * gh);
        const inside = new Uint8Array(gw * gh);

        for (let i = 0; i < n; i++) {
            const p = outline[i], q = outline[(i + 1) % n];
            let x0 = Math.round(p[0]), y0 = Math.round(p[1]);
            const x1 = Math.round(q[0]), y1 = Math.round(q[1]);
            const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
            const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
            let err = dx + dy;
            for (;;) {
                for (let oy = 0; oy < 2; oy++) {
                    for (let ox = 0; ox < 2; ox++) {
                        const px = x0 + ox, py = y0 + oy;
                        if (px >= 0 && py >= 0 && px < gw && py < gh) ink[py * gw + px] = 1;
                    }
                }
                if (x0 === x1 && y0 === y1) break;
                const e2 = 2 * err;
                if (e2 >= dy) { err += dy; x0 += sx; }
                if (e2 <= dx) { err += dx; y0 += sy; }
            }
        }

        for (let y = 0; y < gh; y++) {
            const yc = y + 0.5;
            const xs = [];
            for (let i = 0; i < n; i++) {
                const p = outline[i], q = outline[(i + 1) % n];
                if ((p[1] <= yc) !== (q[1] <= yc)) {
                    xs.push(p[0] + (yc - p[1]) * (q[0] - p[0]) / (q[1] - p[1]));
                }
            }
            xs.sort((m, k) => m - k);
            for (let k = 0; k + 1 < xs.length; k += 2) {
                const from = Math.max(0, Math.ceil(xs[k] - 0.5));
                const to = Math.min(gw - 1, Math.floor(xs[k + 1] - 0.5));
                for (let x = from; x <= to; x++) {
                    clear[y * gw + x] = 1;
                    inside[y * gw + x] = 1;
                }
            }
        }

        for (let y = 0; y < gh; y++) {
            for (let x = 0; x < gw; x++) {
                if (!ink[y * gw + x]) continue;
                for (let dy = -2; dy <= 2; dy++) {
                    for (let dx = -2; dx <= 2; dx++) {
                        const nx = x + dx, ny = y + dy;
                        if (nx >= 0 && ny >= 0 && nx < gw && ny < gh) clear[ny * gw + nx] = 1;
                    }
                }
            }
        }

        const c = [], k = [];
        for (let i = 0; i < clear.length; i++) {
            if (clear[i] || ink[i]) c.push(i);
            if (ink[i]) k.push(i);
        }
        clearIdx = Uint32Array.from(c);
        inkIdx = Uint32Array.from(k);
        insideMask = inside;
    }

    function outlineBounds() {
        const pts = shieldPoints();
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        pts.forEach(p => {
            minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]);
            minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]);
        });
        return { x0: minX * PX, y0: minY * PX, x1: maxX * PX, y1: maxY * PX };
    }

    function buildAscii(b) {
        asciiCells = [];
        if (!insideMask) return;
        const E = 3;
        const ok = (x, y) => x >= 0 && y >= 0 && x < gw && y < gh && insideMask[y * gw + x] === 1;
        const eroded = (x, y) => ok(x, y) && ok(x - E, y) && ok(x + E, y) && ok(x, y - E) && ok(x, y + E)
            && ok(x - E, y - E) && ok(x + E, y - E) && ok(x - E, y + E) && ok(x + E, y + E);
        const at = (px, py) => eroded(Math.floor(px / PX), Math.floor(py / PX));

        actx.font = FONT;
        const cw = Math.ceil(actx.measureText('M').width);
        const cols = Math.max(1, Math.floor((b.x1 - b.x0) / cw));
        const rows = Math.max(1, Math.floor((b.y1 - b.y0) / LINE_H));
        const ox = b.x0 + ((b.x1 - b.x0) - cols * cw) / 2;
        const oy = b.y0 + ((b.y1 - b.y0) - rows * LINE_H) / 2;
        asciiCols = cols;
        asciiRows = rows;
        asciiCw = cw;

        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const x = ox + c * cw, y = oy + r * LINE_H;
                const my = y + LINE_H / 2;
                if (at(x + cw / 2, my) && at(x + 1, my) && at(x + cw - 1, my) && at(x + cw / 2, y + 1) && at(x + cw / 2, y + LINE_H - 1)) {
                    asciiCells.push({ x, y, c, r });
                }
            }
        }
    }

    function hash(a, b, c) {
        let h = (a * 374761393 + b * 668265263 + c * 2147483647) | 0;
        h = (h ^ (h >>> 13)) * 1274126177;
        return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
    }

    function field(c, r, t, band) {
        const y = r / Math.max(1, asciiRows - 1);
        let v = 0.5 + 0.5 * Math.sin(c * 0.55 + t * 1.1) * Math.cos(r * 0.7 - t * 0.7);
        v = 0.12 + v * 0.5;
        v += Math.max(0, 1 - Math.abs(y - band) * 5) * 0.6;
        return Math.min(1, v);
    }

    function drawAscii(t) {
        actx.clearRect(0, 0, asciiCanvas.width / dpr, asciiCanvas.height / dpr);
        if (!asciiCells.length) return;
        const tick = Math.floor(t * ASCII_FPS);
        const step = Math.floor(t * 14);
        const band = ((t * 0.32) % 1.5) - 0.25;
        const live = strength > 0.01;
        let px = 0, py = 0;
        if (live) {
            const rc = asciiCanvas.getBoundingClientRect();
            px = pointer.x - rc.left;
            py = pointer.y - rc.top;
        }

        actx.font = FONT;
        actx.textBaseline = 'top';
        actx.fillStyle = inkCss;

        for (let i = 0; i < asciiCells.length; i++) {
            const cell = asciiCells[i];
            let infl = 0, dx = 0, dy = 0, d = 1;
            if (live) {
                dx = cell.x + asciiCw / 2 - px;
                dy = cell.y + LINE_H / 2 - py;
                d = Math.sqrt(dx * dx + dy * dy) || 1;
                infl = Math.max(0, 1 - d / POINTER_R) * strength;
            }

            let sc = cell.c, sr = cell.r;
            if (infl > 0) {
                const shift = infl * infl * 4.5;
                sc = Math.round(cell.c - (dx / d) * shift * (LINE_H / asciiCw));
                sr = Math.round(cell.r - (dy / d) * shift);
            }

            let v = field(sc, sr, t, band);
            if (infl > 0) {
                const wave = 0.5 + 0.5 * Math.sin(d * 0.05 - t * 5);
                v += infl * 0.35 * wave;
                v = Math.max(v, infl * 0.7 * wave);
                v = Math.min(1, v);
            }

            let ch = RAMP[Math.min(RAMP.length - 1, Math.floor(v * RAMP.length))];
            if (hash(cell.c, cell.r, tick) < 0.025) {
                ch = GLITCH[Math.floor(hash(cell.r, cell.c, tick + 7) * GLITCH.length)];
                v = Math.max(v, 0.7);
            } else if (infl > 0.3 && hash(cell.c, cell.r, step) < infl * 0.22) {
                ch = GLITCH[Math.floor(hash(cell.r, cell.c, step + 7) * GLITCH.length)];
            }
            if (ch === ' ') continue;

            actx.globalAlpha = 0.25 + 0.75 * v;
            actx.fillText(ch, cell.x, cell.y);
        }
        actx.globalAlpha = 1;
    }

    function drawShield() {
        for (let i = 0; i < clearIdx.length; i++) buf[clearIdx[i]] = 0;
        for (let i = 0; i < inkIdx.length; i++) buf[inkIdx[i]] = color;
    }

    function draw(rot) {
        if (!buf || !geo) return;
        readTheme();
        buf.fill(0);

        const meridians = Math.round(Math.PI * 2 / GRID);
        for (let k = 0; k < meridians; k++) {
            const lon = rot + k * GRID;
            curve(Math.round(Math.PI / SAMPLE), i => project(-Math.PI / 2 + i * SAMPLE, lon));
        }

        const parallels = Math.round(Math.PI / GRID) - 1;
        for (let j = 1; j <= parallels; j++) {
            const lat = -Math.PI / 2 + j * GRID;
            curve(Math.round(Math.PI * 2 / SAMPLE), i => project(lat, rot + i * SAMPLE));
        }

        let prev = [geo.cx + geo.R, geo.cy];
        const steps = 180;
        for (let i = 1; i <= steps; i++) {
            const a = i / steps * Math.PI * 2;
            const p = [geo.cx + Math.cos(a) * geo.R, geo.cy + Math.sin(a) * geo.R];
            segment(prev[0], prev[1], p[0], p[1]);
            prev = p;
        }

        drawShield();
        ctx.putImageData(img, 0, 0);
    }

    function frame(now) {
        if (!running) return;
        const tick = Math.floor(now / (1000 / FPS));
        if (tick !== lastTick) {
            lastTick = tick;
            draw(tick * ANGLE_STEP);
        }
        if (pointer.x < -9000) {
            pointer.x = pointer.tx;
            pointer.y = pointer.ty;
        } else {
            pointer.x += (pointer.tx - pointer.x) * 0.18;
            pointer.y += (pointer.ty - pointer.y) * 0.18;
        }
        strength += ((pointer.active ? 1 : 0) - strength) * 0.1;

        const aTick = Math.floor(now / (1000 / (strength > 0.01 ? ASCII_FPS_ACTIVE : ASCII_FPS)));
        if (aTick !== lastAsciiTick) {
            lastAsciiTick = aTick;
            drawAscii(now / 1000);
        }
        requestAnimationFrame(frame);
    }

    function update() {
        const should = onScreen && !document.hidden && !reducedMotion && gw > 1;
        if (should && !running) {
            running = true;
            requestAnimationFrame(frame);
        } else if (!should) {
            running = false;
        }
    }

    function refresh() {
        if (!cell.clientWidth) return;
        resize();
        draw(reducedMotion ? 0.6 : Math.floor(performance.now() / (1000 / FPS)) * ANGLE_STEP);
        drawAscii(reducedMotion ? 20 / ASCII_FPS : performance.now() / 1000);
        canvas.classList.add('is-ready');
        asciiCanvas.classList.add('is-ready');
        update();
    }

    refresh();

    if ('ResizeObserver' in window) {
        new ResizeObserver(refresh).observe(cell);
    } else {
        window.addEventListener('resize', refresh);
    }

    if ('IntersectionObserver' in window) {
        new IntersectionObserver(entries => {
            onScreen = entries[entries.length - 1].isIntersecting;
            update();
        }, { threshold: 0 }).observe(cell);
    } else {
        onScreen = true;
        update();
    }

    if (!reducedMotion) {
        const setPointer = e => {
            pointer.tx = e.clientX;
            pointer.ty = e.clientY;
            pointer.active = true;
        };
        window.addEventListener('pointermove', setPointer, { passive: true });
        window.addEventListener('pointerdown', setPointer, { passive: true });
        window.addEventListener('pointerup', e => { if (e.pointerType !== 'mouse') pointer.active = false; });
        window.addEventListener('pointercancel', () => { pointer.active = false; });
        document.documentElement.addEventListener('mouseleave', () => { pointer.active = false; });
        window.addEventListener('blur', () => { pointer.active = false; });
    }

    document.addEventListener('visibilitychange', update);
})();
