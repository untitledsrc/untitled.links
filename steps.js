(function () {
    const container = document.querySelector('.steps');
    const steps = [...document.querySelectorAll('.step')];
    if (!container || !steps.length) return;

    const BLOCK = 8;
    const LINE_OFFSET = 64;
    let queued = false;

    function update() {
        queued = false;
        const ref = window.innerHeight * 0.55;

        steps.forEach(step => {
            const badge = step.querySelector('.step-number');
            if (!badge) return;
            const rect = badge.getBoundingClientRect();
            const center = rect.top + rect.height / 2;

            step.classList.toggle('is-reached', ref >= center);

            if (step.classList.contains('is-last')) return;

            const height = step.offsetHeight;
            const frac = Math.max(0, Math.min(1, (ref - center) / height));
            const length = Math.max(0, height - LINE_OFFSET);
            step.style.setProperty('--fill', Math.floor(frac * length / BLOCK) * BLOCK + 'px');
        });
    }

    function schedule() {
        if (queued) return;
        queued = true;
        requestAnimationFrame(update);
    }

    container.classList.add('is-tracked');
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    window.addEventListener('load', schedule);
    update();
})();
