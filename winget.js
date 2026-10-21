(function () {
    const btn = document.getElementById('winget-copy');
    const code = document.getElementById('winget-code');
    if (!btn || !code) return;

    const LABEL = btn.textContent;
    let timer;

    function done(text) {
        btn.textContent = text;
        clearTimeout(timer);
        timer = setTimeout(() => { btn.textContent = LABEL; }, 1600);
    }

    function fallback(text) {
        const area = document.createElement('textarea');
        area.value = text;
        area.setAttribute('readonly', '');
        area.style.position = 'fixed';
        area.style.opacity = '0';
        document.body.appendChild(area);
        area.select();
        let ok = false;
        try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
        document.body.removeChild(area);
        return ok;
    }

    btn.addEventListener('click', () => {
        const text = [...code.querySelectorAll('.wl')].map(el => el.textContent).join('\n');
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(() => done('Скопировано'), () => done(fallback(text) ? 'Скопировано' : 'Ошибка'));
        } else {
            done(fallback(text) ? 'Скопировано' : 'Ошибка');
        }
    });
})();
