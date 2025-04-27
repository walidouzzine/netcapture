# NetCapture

Projet **Next.js** permettant la capture automatisée de pages web via une API utilisant **Puppeteer** (version "full") et Chromium embarqué.

## Fonctionnalités principales
- Capture de pages web et de leurs onglets via Puppeteer.
- Fermeture automatique des popups/bannières gênantes.
- Prise en charge de la navigation, du scroll et du chargement d'images avant capture.
- API REST (`/api/capture`) pour lancer des captures côté serveur.

## Installation

```bash
npm install
```

Puppeteer téléchargera automatiquement la version de Chromium nécessaire (stockée dans le cache utilisateur, pas dans node_modules).

## Utilisation en développement

```bash
npm run dev
```

Ouvre [http://localhost:3000](http://localhost:3000) pour accéder à l'application.

## Utilisation de l'API de capture

Effectue une requête POST sur `/api/capture` avec un JSON :
```json
{
  "url": "https://exemple.com"
}
```
La réponse contiendra les captures d'écran encodées en base64.

## Production et déploiement
- **Aucune configuration spéciale n'est requise** : Puppeteer détecte et utilise automatiquement Chromium téléchargé dans le cache utilisateur.
- Assure-toi que le cache Puppeteer est accessible ou que le serveur peut télécharger Chromium au premier lancement.
- Si tu utilises Docker ou un serveur Linux, vérifie les dépendances système (voir ci-dessous).

## Dépendances système (Linux)
Pour exécuter Chromium headless sur Linux, installe les librairies suivantes :
```bash
apt-get install -y \
  fonts-liberation libasound2 libatk-bridge2.0-0 libatk1.0-0 libcups2 \
  libdbus-1-3 libdrm2 libgbm1 libnspr4 libnss3 libxcomposite1 \
  libxdamage1 libxrandr2 xdg-utils --no-install-recommends
```
Plus d'infos : [Puppeteer troubleshooting](https://pptr.dev/troubleshooting/#chrome-headless-doesnt-launch-on-unix)

## Références
- [Documentation Puppeteer](https://pptr.dev/)
- [Next.js Documentation](https://nextjs.org/docs)

---

*Ce projet a été initialisé avec `create-next-app` et adapté pour l'automatisation web avancée avec Puppeteer.*
