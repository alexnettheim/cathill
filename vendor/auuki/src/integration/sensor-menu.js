import { xf } from '../functions.js';

function initSensorMenu() {
    const button = document.querySelector('#sensors-menu-btn');
    const panel = document.querySelector('#sensor-panel');
    if(!button || !panel) return;

    const connected = {trainer: false, heartRate: false};
    const render = () => {
        const ready = connected.trainer && connected.heartRate;
        button.classList.toggle('ready', ready);
        button.setAttribute('aria-label', ready ? 'Sensors connected' : 'Connect trainer and heart-rate monitor');
    };
    const close = () => { panel.hidden = true; button.setAttribute('aria-expanded', 'false'); };

    button.addEventListener('click', () => {
        panel.hidden = !panel.hidden;
        button.setAttribute('aria-expanded', String(!panel.hidden));
    });
    document.addEventListener('pointerdown', (event) => {
        if(!panel.hidden && !panel.contains(event.target) && !button.contains(event.target)) close();
    });
    document.addEventListener('keydown', (event) => { if(event.key === 'Escape') close(); });

    xf.sub('ble:controllable:connected', () => { connected.trainer = true; render(); });
    xf.sub('ble:controllable:disconnected', () => { connected.trainer = false; render(); });
    xf.sub('ble:heartRateMonitor:connected', () => { connected.heartRate = true; render(); });
    xf.sub('ble:heartRateMonitor:disconnected', () => { connected.heartRate = false; render(); });
    render();
}

export { initSensorMenu };
