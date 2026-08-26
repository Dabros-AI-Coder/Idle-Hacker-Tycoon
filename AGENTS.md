# Projekt-Regeln — Idle Hacker Tycoon

## Workflow
- **Vor jedem Push:** `README.md` auf den neuesten Stand bringen (Versions-Badge, Features, Architektur, Update-Mechanik, Roadmap).
- Bei Versions-Änderungen: `js/config/GameConfig.js` (`version`) **und** `version.json` gemeinsam bumpen.
- Syntax-Check vor Commit: `node --check` über alle geänderten `.js`-Dateien.

## Selfproof-Loop (Pflicht)
Nach jedem implementierten Schritt, **bevor** der nächste Punkt beginnt:
1. `node --check` über alle geänderten `.js`-Dateien.
2. Logik, die headless prüfbar ist, per Node ausführen (z. B. `js/utils/simulate.js`, Systeme ohne DOM importieren) und Ergebnis verifizieren.
3. UI-/DOM-Code: statisch auf Tippfehler in IDs/Selektoren/Klassennamen prüfen (`index.html` ↔ `UIManager.js` ↔ `style.css` abgleichen).
4. Editor-/Runtime-Fehler prüfen wo möglich; erst wenn alles sauber ist: nächsten Punkt starten oder Push anbieten.
