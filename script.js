document.documentElement.classList.add('js');

const SCHEME_QUERY = window.matchMedia('(prefers-color-scheme: light)');
function applyScheme() {
    document.body.classList.toggle('light-theme', SCHEME_QUERY.matches);
}
applyScheme();
if (SCHEME_QUERY.addEventListener) SCHEME_QUERY.addEventListener('change', applyScheme);

const MOBILE_QUERY = window.matchMedia('(max-width: 768px)');
const PHONE_LANDSCAPE_QUERY = window.matchMedia('(max-width: 900px) and (orientation: landscape) and (max-height: 500px)');

function isMobileLayout() {
    return MOBILE_QUERY.matches && !PHONE_LANDSCAPE_QUERY.matches;
}

const navCategories = document.getElementById('nav-categories');
const mobileLabel   = document.getElementById('nav-mobile-label');

function updateNavLayout() {
    const isMobile = isMobileLayout();
    navCategories.style.display = isMobile ? 'none' : 'flex';
    if (mobileLabel) mobileLabel.style.display = isMobile ? 'flex' : 'none';
}

updateNavLayout();


const indicator  = document.getElementById('nav-indicator');
const links      = document.querySelectorAll('.nav-link');
const hero       = document.getElementById('main');
const sections   = document.querySelectorAll('.content-section, #main');
const bottomBtns = document.querySelectorAll('.bottom-nav-btn');

const sectionNames = {
    main:    'untitled.links',
    windows: 'Windows',
    soft:    'Soft & Utils',
    proxy:   'Proxy & VPN',
    web:     'Web tools'
};

let labelTimer;

function setMobileLabel(sectionId) {
    if (!mobileLabel) return;
    const name = sectionNames[sectionId] || sectionNames.main;
    clearTimeout(labelTimer);
    if (mobileLabel.textContent === name) {
        mobileLabel.style.opacity = '1';
        return;
    }
    mobileLabel.style.opacity = '0';
    labelTimer = setTimeout(() => {
        mobileLabel.textContent = name;
        mobileLabel.style.opacity = '1';
    }, 150);
}

function setBottomNavActive(sectionId) {
    bottomBtns.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.section === sectionId);
    });
}

function moveIndicator(link, scrollIntoView = true) {
    links.forEach(l => l.classList.remove('active'));
    if (!link) {
        if (indicator) indicator.style.width = '0px';
        return;
    }
    link.classList.add('active');
    if (indicator) {
        indicator.style.width     = link.offsetWidth + 'px';
        indicator.style.transform = `translateX(${link.offsetLeft}px)`;
    }
    if (scrollIntoView) {
        link.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
    }
}

function updateNavVisibility() {
    const pastHero = hero.getBoundingClientRect().bottom < window.innerHeight * 0.5;
    document.body.classList.toggle('nav-visible', pastHero);
}

function updateScrolled() {
    document.body.classList.toggle('scrolled', window.scrollY > 40);
}

let lastSection = '';

function updateActiveSection() {
    const scrollY = window.scrollY;
    let current = 'main';
    let lastVisible = 'main';

    sections.forEach(section => {
        if (section.offsetParent === null) return;
        lastVisible = section.id;
        if (scrollY >= section.offsetTop - 200) current = section.id;
    });

    const atPageBottom = window.innerHeight + scrollY >= document.documentElement.scrollHeight - 2;
    if (scrollY > 0 && atPageBottom) current = lastVisible;

    if (current === lastSection) return;
    lastSection = current;

    setMobileLabel(current);
    setBottomNavActive(current);

    if (current === 'main') {
        moveIndicator(null);
    } else {
        moveIndicator(document.querySelector(`.nav-link[href="#${current}"]`));
    }
}

links.forEach(link => link.addEventListener('click', () => moveIndicator(link)));


let frameQueued = false;

window.addEventListener('scroll', () => {
    if (frameQueued) return;
    frameQueued = true;
    requestAnimationFrame(() => {
        frameQueued = false;
        updateNavVisibility();
        updateActiveSection();
        updateScrolled();
    });
}, { passive: true });

window.addEventListener('resize', () => {
    updateNavLayout();
    updateNavVisibility();
    updateScrolled();
    moveIndicator(document.querySelector('.nav-link.active'), false);
});

window.addEventListener('load', () => {
    updateNavVisibility();
    updateActiveSection();
    updateScrolled();
});

updateNavVisibility();
updateScrolled();


const revealTargets = document.querySelectorAll(
    '.content-section > h2, .section-description, .step-marker, .step-title, .step-text, ' +
    '.software-card, .card-google-group, .card-win98-outer, .site-footer > *'
);

revealTargets.forEach(el => {
    el.classList.add('reveal');
    const siblings = [...el.parentElement.children].filter(n => n.classList.contains('reveal') || n === el);
    el.style.setProperty('--i', String(Math.max(0, siblings.indexOf(el)) % 6));
});

if ('IntersectionObserver' in window) {
    const ioIn = new IntersectionObserver(entries => {
        entries.forEach(entry => {
            if (entry.isIntersecting) entry.target.classList.add('in-view');
        });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.05 });

    const ioOut = new IntersectionObserver(entries => {
        entries.forEach(entry => {
            if (!entry.isIntersecting) entry.target.classList.remove('in-view');
        });
    }, { threshold: 0 });

    revealTargets.forEach(el => { ioIn.observe(el); ioOut.observe(el); });
} else {
    revealTargets.forEach(el => el.classList.add('in-view'));
}


document.addEventListener('pointermove', e => {
    const card = e.target.closest && e.target.closest('.software-card, .card-google-group');
    if (!card) return;
    const rect = card.getBoundingClientRect();
    card.style.setProperty('--mx', `${e.clientX - rect.left}px`);
    card.style.setProperty('--my', `${e.clientY - rect.top}px`);
}, { passive: true });


const win98CloseBtn = document.getElementById('win98-close-btn');
const win98Outer    = document.getElementById('win98-outer');

if (win98CloseBtn && win98Outer) {
    win98CloseBtn.addEventListener('click', () => {
        win98Outer.classList.toggle('clouds-mode');
    });
}
