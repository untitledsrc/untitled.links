(function () {
    const buttons = document.querySelectorAll('[data-copy-target]');
    if (!buttons.length) return;

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

    buttons.forEach(btn => {
        const target = document.getElementById(btn.dataset.copyTarget);
        if (!target) return;
        const label = btn.textContent;
        let timer;

        function done(text) {
            btn.textContent = text;
            clearTimeout(timer);
            timer = setTimeout(() => { btn.textContent = label; }, 1600);
        }

        btn.addEventListener('click', () => {
            const text = target.textContent.replace(/\s+$/, '');
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(text).then(
                    () => done('Скопировано'),
                    () => done(fallback(text) ? 'Скопировано' : 'Ошибка')
                );
            } else {
                done(fallback(text) ? 'Скопировано' : 'Ошибка');
            }
        });
    });
})();
