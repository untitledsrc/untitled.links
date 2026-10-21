(function () {
    const canvas = document.getElementById('ascii-canvas');
    const logoEl = document.getElementById('ascii-logo');
    const heroEl = document.getElementById('main');
    if (!canvas || !logoEl || !heroEl) return;

    const ctx = canvas.getContext('2d');
    const RAMP = ' .:-=+*#%@';
    const LOGO_RAMP = ' .:i1tfLCO08%&@';
    const LOGO_POOL = 'abcdefghijklmnopqrstuvwxyz0123456789#@%&';
    const GLITCH = '01<>/\\{}[]#$%&*+=';
    const GLYPH_LINES = ['untitled', '.links'];
    const FONT_FAMILY = 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace';
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const SCATTER = 0.7;
    const SPREAD = 1.3;
    const FLIGHT = 1.1;
    const INTRO_END = SCATTER + SPREAD + FLIGHT;
    const DITHER_FROM = 1.9;
    const TEXT_AT = 2.5;
    const AMBIENT = 420;
    const AMBIENT_POOL = LOGO_POOL + '.:;+=*<>/|';
    const STRAYS = 200;
    const t0 = performance.now() / 1000;
    let introDone = reducedMotion;

    let cols = 0, rows = 0, cw = 8, ch = 14, width = 0, height = 0, dpr = 1, fontSize = 12;
    let logoCols = 0, logoRows = 0;
    let base = new Float32Array(0);

    const pointer = { x: -9999, y: -9999, tx: -9999, ty: -9999, active: false };
    let strength = 0;
    let running = false;

    function buildBase() {
        const rect = logoEl.getBoundingClientRect();
        const lw = Math.max(1, Math.round(rect.width));
        const lh = Math.max(1, Math.round(rect.height));
        logoCols = Math.floor(lw / cw);
        logoRows = Math.floor(lh / ch);

        const off = document.createElement('canvas');
        off.width = lw;
        off.height = lh;
        const o = off.getContext('2d', { willReadFrequently: true });

        const FONT = '800 100px ui-monospace, "JetBrains Mono", "Cascadia Code", Consolas, Menlo, "DejaVu Sans Mono", monospace';
        o.font = FONT;
        const widest = Math.max(...GLYPH_LINES.map(l => o.measureText(l).width));
        const ASC = 0.73, GAP = 0.25;
        const blockEm = ASC * GLYPH_LINES.length + GAP * (GLYPH_LINES.length - 1);
        const fs = Math.min((lw * 0.92) / (widest / 100), (lh * 0.92) / blockEm);

        o.font = FONT.replace('100px', `${fs}px`);
        o.fillStyle = '#fff';
        o.textAlign = 'center';
        o.textBaseline = 'alphabetic';
        let baseline = (lh - blockEm * fs) / 2 + ASC * fs;
        for (const line of GLYPH_LINES) {
            o.fillText(line, lw / 2, baseline);
            baseline += (ASC + GAP) * fs;
        }

        const data = o.getImageData(0, 0, lw, lh).data;
        base = new Float32Array(logoCols * logoRows);
        const pts = [[0.5, 0.5], [0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]];
        for (let r = 0; r < logoRows; r++) {
            for (let c = 0; c < logoCols; c++) {
                let sum = 0;
                for (const [px, py] of pts) {
                    const x = Math.min(lw - 1, Math.floor((c + px) * cw));
                    const y = Math.min(lh - 1, Math.floor((r + py) * ch));
                    sum += data[(y * lw + x) * 4 + 3];
                }
                base[r * logoCols + c] = sum / (pts.length * 255);
            }
        }
    }

    function resize() {
        dpr = Math.min(window.devicePixelRatio || 1, 2);
        width = window.innerWidth;
        height = window.innerHeight;
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        fontSize = width < 360 ? 10 : 12;
        ctx.font = `${fontSize}px ${FONT_FAMILY}`;
        cw = Math.ceil(ctx.measureText('M').width);
        ch = Math.round(fontSize * 1.2);
        cols = Math.ceil(width / cw);
        rows = Math.ceil(height / ch);
        buildBase();
        draw(performance.now() / 1000);
    }

    function hash(a, b, c) {
        let h = (a * 374761393 + b * 668265263 + c * 2147483647) | 0;
        h = (h ^ (h >>> 13)) * 1274126177;
        return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
    }

    const smooth = x => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };
    const easeInOut = x => x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;

    function landedAt(lc, lr) {
        return SCATTER + hash(lc, lr, 31) * SPREAD + FLIGHT;
    }

    function drawIntro(introT, t, lc0, lr0) {
        const step = Math.floor(t * 9);
        const fadeIn = smooth(introT / 0.5);
        ctx.fillStyle = getComputedStyle(document.body).color;

        for (let lr = 0; lr < logoRows; lr++) {
            for (let lc = 0; lc < logoCols; lc++) {
                const v = base[lr * logoCols + lc];
                if (v < 0.06) continue;

                const land = landedAt(lc, lr);
                if (introT >= land) continue;

                const tx = (lc0 + lc) * cw, ty = (lr0 + lr) * ch;
                const sx = hash(lc, lr, 21) * (width - cw), sy = hash(lc, lr, 22) * (height - ch);
                const p = Math.max(0, Math.min(1, (introT - (land - FLIGHT)) / FLIGHT));
                const e = easeInOut(p);

                let x = sx + (tx - sx) * e;
                let y = sy + (ty - sy) * e;
                const side = (hash(lc, lr, 23) - 0.5) * 140;
                x += Math.sin(Math.PI * e) * side;
                y += Math.sin(Math.PI * e) * side * 0.35;
                if (p <= 0) {
                    x += Math.sin(t * 1.7 + hash(lc, lr, 24) * 6.3) * 3;
                    y += Math.cos(t * 1.3 + hash(lc, lr, 25) * 6.3) * 3;
                }

                let sym;
                if (p > 0.86) {
                    sym = LOGO_RAMP[Math.min(LOGO_RAMP.length - 1, Math.floor(v * LOGO_RAMP.length))];
                } else {
                    sym = LOGO_POOL[Math.floor(hash(lc, lr, step + 40) * LOGO_POOL.length)];
                }
                if (sym === ' ') continue;

                ctx.globalAlpha = fadeIn;
                ctx.fillText(sym, x, y);
            }
        }

        const strayFade = fadeIn * (1 - smooth((introT - 1.6) / 1.4));
        if (strayFade > 0.01) {
            for (let i = 0; i < STRAYS; i++) {
                const x = hash(i, 5, 51) * (width - cw) + Math.sin(t * 0.8 + i) * 6;
                const y = hash(i, 6, 52) * (height - ch) + Math.cos(t * 0.7 + i * 1.7) * 6;
                const sym = LOGO_POOL[Math.floor(hash(i, step, 53) * LOGO_POOL.length)];
                ctx.globalAlpha = strayFade;
                ctx.fillText(sym, x, y);
            }
        }

        for (let i = 0; i < AMBIENT; i++) {
            const appear = hash(i, 61, 1) * 0.9;
            const leaveDur = 0.6 + hash(i, 62, 1) * 0.6;
            const leaveAt = 0.8 + hash(i, 63, 1) * (INTRO_END - 0.8 - leaveDur);
            const q = (introT - leaveAt) / leaveDur;
            if (introT < appear || q >= 1) continue;

            const bright = 0.1 + 0.6 * Math.pow(hash(i, 64, 1), 1.6);
            let x = hash(i, 65, 1) * (width - cw) + Math.sin(t * 0.6 + i * 1.3) * 5;
            let y = hash(i, 66, 1) * (height - ch) + Math.cos(t * 0.5 + i * 0.7) * 5;
            let a = bright * smooth((introT - appear) / 0.35);

            if (q > 0) {
                if (hash(i, 67, 1) < 0.5) {
                    a *= 1 - smooth(q);
                } else {
                    const ang = hash(i, 68, 1) * Math.PI * 2;
                    const dist = (500 + hash(i, 69, 1) * 500) * q * q;
                    x += Math.cos(ang) * dist;
                    y += Math.sin(ang) * dist;
                    a *= 1 - q * q;
                }
            }
            if (a < 0.01) continue;

            const rate = 2 + hash(i, 70, 1) * 6;
            const sym = AMBIENT_POOL[Math.floor(hash(i, Math.floor(t * rate), 71) * AMBIENT_POOL.length)];
            ctx.globalAlpha = a;
            ctx.fillText(sym, x, y);
        }
        ctx.globalAlpha = 1;
    }

    function draw(t) {
        ctx.clearRect(0, 0, width, height);
        ctx.fillStyle = getComputedStyle(document.body).color;
        ctx.font = `${fontSize}px ${FONT_FAMILY}`;
        ctx.textBaseline = 'top';

        const logo = logoEl.getBoundingClientRect();
        const lc0 = Math.round(logo.left / cw);
        const lr0 = Math.round(logo.top / ch);
        const heroBottom = heroEl.getBoundingClientRect().bottom;

        if (strength < 0.01 && introDone && (logo.bottom < 0 || logo.top > height)) return;

        const R = Math.max(80, Math.min(width, height) * 0.1);
        const step = Math.floor(t * 14);
        const introT = introDone ? Infinity : t - t0;

        for (let r = 0; r < rows; r++) {
            const y = r * ch + ch / 2;
            const lr = r - lr0;
            const rowInLogo = lr >= 0 && lr < logoRows;

            for (let c = 0; c < cols; c++) {
                const x = c * cw + cw / 2;
                const lc = c - lc0;
                const inLogo = rowInLogo && lc >= 0 && lc < logoCols;

                const dx = x - pointer.x;
                const dy = y - pointer.y;
                const d = Math.sqrt(dx * dx + dy * dy) || 1;
                const infl = Math.max(0, 1 - d / R) * strength;

                if (!inLogo && infl <= 0) continue;

                let v = 0;
                let isGlyph = false;
                if (inLogo) {
                    let sc = lc, sr = lr;
                    if (infl > 0) {
                        const shift = infl * infl * 4.5;
                        sc = Math.round(lc - (dx / d) * shift * (ch / cw));
                        sr = Math.round(lr - (dy / d) * shift);
                    }
                    if (sc >= 0 && sc < logoCols && sr >= 0 && sr < logoRows) v = base[sr * logoCols + sc];
                    isGlyph = v >= 0.06;
                    if (isGlyph && introT < landedAt(lc, lr)) { isGlyph = false; v = 0; }
                    if (v > 0) {
                        v *= 0.62 + 0.38 * (0.5 + 0.5 * Math.sin(c * 0.33 + r * 0.55 + t * 0.9));
                    }
                }

                if (infl > 0) {
                    const wave = 0.5 + 0.5 * Math.sin(d * 0.05 - t * 5);
                    v += infl * 0.35 * wave;
                    v = Math.max(v, infl * 0.7 * wave);
                }

                if (v < 0.06) continue;
                v = Math.min(v, 1);

                const ramp = isGlyph ? LOGO_RAMP : RAMP;
                let sym = ramp[Math.min(ramp.length - 1, Math.floor(v * ramp.length))];
                if (infl > 0.3 && hash(c, r, step) < infl * 0.22) {
                    sym = GLITCH[Math.floor(hash(r, c, step + 7) * GLITCH.length)];
                }
                if (sym === ' ') continue;

                const heroMix = Math.max(0, Math.min(1, 1 - (y - heroBottom) / 150));
                const dim = isGlyph ? 1 : 0.35 + 0.65 * heroMix;
                ctx.globalAlpha = isGlyph ? 1 : (0.3 + 0.7 * v) * dim;
                ctx.fillText(sym, c * cw, r * ch);
            }
        }
        ctx.globalAlpha = 1;

        if (introT < INTRO_END) drawIntro(introT, t, lc0, lr0);
    }

    let last = 0;
    function frame(now) {
        if (!running) return;
        const t = now / 1000;

        if (!introDone) {
            const it = t - t0;
            window.__introDither = smooth((it - DITHER_FROM) / (INTRO_END - DITHER_FROM));
            if (it >= TEXT_AT) document.documentElement.classList.remove('intro');
            if (it >= INTRO_END) {
                introDone = true;
                window.__introDither = 1;
                document.documentElement.classList.remove('intro');
            }
        }

        if (pointer.x < -9000) {
            pointer.x = pointer.tx;
            pointer.y = pointer.ty;
        } else {
            pointer.x += (pointer.tx - pointer.x) * 0.18;
            pointer.y += (pointer.ty - pointer.y) * 0.18;
        }
        strength += ((pointer.active ? 1 : 0) - strength) * 0.1;

        if (now - last > 30) {
            last = now;
            draw(t);
        }
        requestAnimationFrame(frame);
    }

    function start() {
        if (running || reducedMotion) return;
        running = true;
        requestAnimationFrame(frame);
    }

    function stop() { running = false; }

    function setPointer(e) {
        pointer.tx = e.clientX;
        pointer.ty = e.clientY;
        pointer.active = true;
    }

    window.addEventListener('pointermove', setPointer, { passive: true });
    window.addEventListener('pointerdown', setPointer, { passive: true });
    window.addEventListener('pointerup', e => { if (e.pointerType !== 'mouse') pointer.active = false; });
    window.addEventListener('pointercancel', () => { pointer.active = false; });
    document.documentElement.addEventListener('mouseleave', () => { pointer.active = false; });
    window.addEventListener('blur', () => { pointer.active = false; });

    if (reducedMotion) {
        window.addEventListener('scroll', () => draw(0), { passive: true });
    }

    document.addEventListener('visibilitychange', () => {
        if (document.hidden) stop(); else start();
    });

    let resizeTimer;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(resize, 100);
    });

    if (reducedMotion) document.documentElement.classList.remove('intro');

    resize();
    start();
})();
