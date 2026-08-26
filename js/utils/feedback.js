/**
 * Feedback — baut eine GitHub-Issue-URL mit vorbefüllten System-Infos.
 * Kein Tracking, kein Backend — nur URL-Parameter.
 */

const REPO_URL = 'https://github.com/Dabros-AI-Coder/Idle-Hacker-Tycoon/issues/new';

function getSystemInfo() {
    const ua = navigator.userAgent || '';
    let browser = 'Unbekannt';
    if (ua.includes('Firefox/')) browser = 'Firefox ' + ua.split('Firefox/')[1]?.split(' ')[0];
    else if (ua.includes('Edg/')) browser = 'Edge ' + ua.split('Edg/')[1]?.split(' ')[0];
    else if (ua.includes('Chrome/')) browser = 'Chrome ' + ua.split('Chrome/')[1]?.split(' ')[0];
    else if (ua.includes('Safari/') && ua.includes('Version/')) browser = 'Safari ' + ua.split('Version/')[1]?.split(' ')[0];

    let os = 'Unbekannt';
    if (ua.includes('Windows')) os = 'Windows';
    else if (ua.includes('Mac OS')) os = 'macOS';
    else if (ua.includes('Linux')) os = 'Linux';
    else if (ua.includes('Android')) os = 'Android ' + (ua.match(/Android (\d+)/)?.[1] || '');
    else if (ua.includes('iPhone') || ua.includes('iPad')) os = 'iOS';

    const standalone = window.matchMedia('(display-mode: standalone)').matches
        || window.navigator.standalone === true;

    return { browser, os, standalone, screen: `${screen.width}×${screen.height}`, version: GameConfig.version };
}

export function buildFeedbackUrl() {
    const sys = getSystemInfo();
    const body = [
        `## Beschreibung`,
        ``,
        `(Was ist passiert? Was hast du erwartet?)`,
        ``,
        `---`,
        `*Automatisch ausgefüllt:*`,
        `- Version: ${sys.version}`,
        `- Browser: ${sys.browser}`,
        `- OS: ${sys.os}`,
        `- Screen: ${sys.screen}`,
        `- Standalone: ${sys.standalone ? 'Ja' : 'Nein'}`,
    ].join('\n');

    const params = new URLSearchParams({
        title: `[Bug] `,
        labels: 'bug',
        body,
    });

    return `${REPO_URL}?${params.toString()}`;
}
