import { NextRequest, NextResponse } from 'next/server';
// Import types explicitly
import puppeteer, { Page, Browser, ElementHandle } from 'puppeteer';
import { URL } from 'url';

// --- Helper Functions (adapted from capture.js) ---

// Use imported Page type
async function waitForVisibleImages(page: Page) {
  // console.log('API: Attente du chargement des images visibles...');
  try {
    await page.evaluate(async () => {
      // Type 'img' elements
      const images: HTMLImageElement[] = Array.from(document.querySelectorAll("img"));
      const visibleImages = images.filter((img: HTMLImageElement) => {
        const rect = img.getBoundingClientRect();
        return (
          rect.top < window.innerHeight && rect.bottom >= 0 &&
          rect.left < window.innerWidth && rect.right >= 0 &&
          getComputedStyle(img).display !== 'none'
        );
      });
      await Promise.all(visibleImages.map(img => {
        if (img.complete || !img.src) return;
        return new Promise((resolve) => {
          img.addEventListener('load', resolve, { once: true });
          img.addEventListener('error', resolve, { once: true });
        });
      }));
    });
    // console.log('API: Images visibles chargées.');
  } catch (error: unknown) { // Remplacer any par unknown
    // Vérifier si c'est une instance d'Error pour accéder à 'message'
    const message = error instanceof Error ? error.message : String(error);
    console.warn('Erreur lors de l\'attente des images visibles:', message);
  }
}

// Use imported Page type
async function scrollToBottomAndLoadImages(page: Page) {
  console.log('API: Défilement de la page pour charger toutes les images...');
  try {
    await page.evaluate(async () => {
      await new Promise<void>((resolve) => {
        let totalHeight = 0;
        const distance = window.innerHeight;
        const timer = setInterval(async () => {
          const scrollHeight = document.body.scrollHeight;
          window.scrollBy(0, distance);
          totalHeight += distance;
          await new Promise(r => setTimeout(r, 150)); // Increased delay slightly

          if (totalHeight >= scrollHeight) {
            clearInterval(timer);
            resolve();
          }
        }, 300); // Increased interval slightly
      });
    });
    await waitForVisibleImages(page); // Wait for images loaded at the very bottom
    console.log('API: Défilement terminé.');
    await page.evaluate(() => window.scrollTo(0, 0));
    await new Promise(resolve => setTimeout(resolve, 500));
    console.log('API: Retour en haut de la page.');
  } catch(error: unknown) { // Remplacer any par unknown
      console.error("API: Erreur pendant le défilement:", error instanceof Error ? error.message : String(error));
      // Continue execution even if scrolling fails
  }
}

// --- Nouvelle fonction pour fermer les popups ---
// Retourne true si un clic a été effectué (potentiellement causant une navigation)
async function closePopups(page: Page): Promise<boolean> {
  console.log('API: Recherche de pop-ups/bannières à fermer (avec délai)...');
  await new Promise(resolve => setTimeout(resolve, 1000)); // Attendre 1s que les popups apparaissent

  let clickSuccessful = false; // Track if a click actually happened

  // Sélecteurs CSS directs (plus rapides) - Suppression des :contains invalides
  const cssSelectors = [
    'button[aria-label*="Close"]',
    'button[aria-label*="Dismiss"]',
    'button[aria-label*="Fermer"]',
    'button[aria-label*="Rejeter"]',
    '[role="dialog"] button[aria-label*="Close"]',
    '[role="dialog"] button[aria-label*="Fermer"]',
    'button.modal__close',
    'button.popup-close',
    'button.close-button',
    'button.mfp-close',
    'button.fancybox-close-small',
    'button.artdeco-modal__dismiss', // LinkedIn
    'button[data-tracking-control-name="dialog_dismiss_btn"]', // LinkedIn specific
    // Sélecteurs spécifiques pour les boutons 'X' (simplifiés)
    'button[aria-label*="close" i]', // Recherche case-insensitive via evaluate plus bas
    'button[aria-label*="fermer" i]',
    'button[class*="close"]', // Classe contenant 'close'
     // --- Fin sélecteurs 'X' ---
    'button[id*="cookie"]',
    'button[class*="cookie"]',
    'div[id*="cookie"] button',
    'div[class*="cookie"] button',
    '[data-testid="dialog_close_button"]', // Common test ID
    '[data-testid="modal-close"]',
    '[role="dialog"] button', // Bouton générique dans un dialogue
  ];

  // Textes courants à rechercher dans les boutons (insensible à la casse)
  const buttonTexts = [
    'accept', 'accepter', 'agree', 'consent', 'got it', 'ok', 'compris',
    'continue', 'continuer', 'close', 'fermer', 'dismiss', 'rejeter',
    'allow', 'autoriser', 'confirm', 'confirmer'
  ];

  // 1. Essayer les sélecteurs CSS (simplifiés)
  for (const selector of cssSelectors) {
    if (clickSuccessful) break; // Sortir si on a déjà cliqué
    let elements: ElementHandle[] = [];
    try {
       elements = await page.$$(selector);
       for (const element of elements) {
         if (clickSuccessful) break; // Sortir si on a déjà cliqué
         try {
           if (await element.isIntersectingViewport()) {
             console.log(`API: Tentative de clic (CSS: ${selector})`);
             await element.click({ delay: 50 });
             clickSuccessful = true; // Marquer qu'un clic a réussi
             console.log(`API: Pop-up fermé via CSS: ${selector}`);
             await new Promise(resolve => setTimeout(resolve, 300)); // Pause courte
             break; // Sortir de la boucle interne après un clic réussi
           }
         } catch { /* Ignorer les erreurs de clic */ }
         finally { await element.dispose(); }
       }
    } catch (e: unknown) { // Remplacer any par unknown
        // Ignorer les erreurs de sélecteur invalide silencieusement
        const message = e instanceof Error ? e.message : String(e);
        if (!message?.includes('is not a valid selector')) {
            console.warn(`API: Erreur avec sélecteur CSS ${selector}:`, message);
        }
    }
  }


  // 2. Essayer de trouver par texte/aria-label (via evaluate) SEULEMENT si rien n'a été cliqué via CSS
  if (!clickSuccessful) {
    try {
        const clickedInEvaluate = await page.evaluate(async (textsToFind) => {
            let clickedEval = false;
            const elements: NodeListOf<HTMLElement> = document.querySelectorAll('button, a, [role="button"], [aria-label*="close" i], [aria-label*="fermer" i]');

            for (const element of elements) {
                 // Vérifier si l'élément est toujours dans le DOM et visible
                 if (!document.body.contains(element)) continue;

                const elementText = element.textContent?.trim().toLowerCase()
                                   || element.getAttribute('aria-label')?.trim().toLowerCase();
                const isExactX = element.textContent?.trim() === '×' || element.textContent?.trim().toUpperCase() === 'X';

                if ((elementText && textsToFind.some(text => elementText.includes(text))) || isExactX) {
                    const rect = element.getBoundingClientRect();
                    const isVisible = rect.width > 0 && rect.height > 0 && getComputedStyle(element).display !== 'none' && getComputedStyle(element).visibility !== 'hidden' && getComputedStyle(element).opacity !== '0';

                    if (isVisible) {
                        try {
                            console.log(`API (evaluate): Tentative de clic sur élément visible avec texte/symbole "${elementText || element.textContent?.trim()}"`);
                            element.click();
                            clickedEval = true;
                            console.log(`API (evaluate): Clic réussi.`);
                            await new Promise(resolve => setTimeout(resolve, 300)); // Pause
                            break; // Sortir après le premier clic réussi dans evaluate
                        } catch { // Variable non utilisée
                            console.warn("API (evaluate): Clic a échoué (élément peut-être détaché).");
                        }
                    }
                }
                if (clickedEval) break; // Sortir de la boucle externe si on a cliqué
            }
            return clickedEval;
        }, [...buttonTexts, '×', 'x']);

        if (clickedInEvaluate) {
            clickSuccessful = true;
        }

    } catch (e: unknown) { // Remplacer any par unknown
        const message = e instanceof Error ? e.message : String(e);
        if (message?.includes('Execution context was destroyed')) {
            console.warn(`API: Contexte détruit pendant l'évaluation de closePopups.`);
            // Si le contexte est détruit PENDANT cette évaluation, c'est étrange,
            // mais on ne peut rien faire de plus. On considère qu'aucun clic n'a eu lieu ici.
            clickSuccessful = false;
        } else {
            console.warn(`API: Erreur lors de la recherche/clic via evaluate:`, message);
        }
    }
  }

  if (clickSuccessful) {
    console.log('API: Vérification des pop-ups terminée (un clic a réussi).');
  } else {
    console.log('API: Aucun pop-up/bannière évident à fermer n\'a été trouvé/cliqué.');
  }
  return clickSuccessful; // Retourner si un clic a effectivement eu lieu
}


function generateFilename(urlStr: string, suffix = ''): string {
  try {
    const parsedUrl = new URL(urlStr);
    let path = parsedUrl.pathname;
    path = path.replace(/^\/|\/$/g, '').replace(/\//g, '_');
    if (path === '') path = 'home';
    path = path.replace(/[^a-zA-Z0-9_]/g, '');
    const safeSuffix = suffix.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
    // Limit suffix length to avoid excessively long filenames
    const finalSuffix = safeSuffix.substring(0, 50);
    return `${path}${finalSuffix ? '_' + finalSuffix : ''}.png`;
  } catch { // Variable non utilisée
    console.warn("API: Impossible de générer un nom de fichier, utilisation d'un nom par défaut.");
    const safeSuffix = suffix.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
    return `capture${safeSuffix ? '_' + safeSuffix.substring(0, 50) : ''}_${Date.now()}.png`;
  }
}
// --- API Route Handler ---

export async function POST(request: NextRequest) {
  // Use imported Browser type
  let browser: Browser | null = null;
  const screenshots: { filename: string; data: string }[] = [];

  try {
    const { url: targetUrl } = await request.json();

    if (!targetUrl || typeof targetUrl !== 'string') {
      return NextResponse.json({ error: 'URL manquante ou invalide dans la requête.' }, { status: 400 });
    }

    try {
      new URL(targetUrl); // Validate URL
    } catch { // Variable non utilisée
      return NextResponse.json({ error: `URL invalide fournie: "${targetUrl}"` }, { status: 400 });
    }

    console.log(`API: Lancement du navigateur pour ${targetUrl}`);

    // Force le chemin du cache sur Netlify pour correspondre à l'endroit où
    // le script postinstall a téléchargé le navigateur.
    const cacheDirectory = process.env.NETLIFY
      ? '/opt/buildhome/.cache/puppeteer'
      : undefined;

    const launchOptions: any = {
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      cacheDirectory: cacheDirectory,
    };

    browser = await puppeteer.launch(launchOptions);
    // Use imported Page type
    const page: Page = await browser.newPage();
    const VIEWPORT = { width: 1920, height: 1080 };
    await page.setViewport(VIEWPORT);

    console.log(`API: Chargement de ${targetUrl} ...`);
    await page.goto(targetUrl, { waitUntil: 'networkidle2', timeout: 90000 });
    console.log('API: Page chargée (network idle 2).');

    // *** Fermer les popups après le chargement initial ***
    let popupClosed = await closePopups(page);
    // Si un popup a été fermé (et a potentiellement navigué), attendre plus longtemps
    if (popupClosed) {
        console.log('API: Attente de stabilisation après fermeture de popup...');
        try {
            await page.waitForNetworkIdle({ idleTime: 1500, timeout: 20000 }); // Attente plus longue et idleTime augmenté
            console.log('API: Page stabilisée après fermeture popup.');
        } catch (waitError: unknown) { // Remplacer any par unknown
             const message = waitError instanceof Error ? waitError.message : String(waitError);
             console.warn(`API: Timeout/Erreur attente post-popup (${message}), continuation...`);
             // Si l'attente échoue (ex: contexte détruit), on continue quand même
        }
    }

    try {
      await scrollToBottomAndLoadImages(page);
    } catch (scrollError: unknown) { // Remplacer any par unknown
        const message = scrollError instanceof Error ? scrollError.message : String(scrollError);
        if (popupClosed && message?.includes('Execution context was destroyed')) {
            console.warn('API: Ignorer erreur de défilement post-popup (contexte détruit), capture sans défilement complet.');
        } else {
            // Si ce n'est pas l'erreur attendue, relancer l'erreur originale
             if (scrollError instanceof Error) throw scrollError;
             else throw new Error(String(scrollError));
        }
    }


    const tabSelectorString = 'div[role="tablist"] button[role="tab"]';
    // Use imported ElementHandle type
    const initialTabHandles: ElementHandle[] = await page.$$(tabSelectorString);

    if (initialTabHandles.length > 0) {
      console.log(`API: Structure d'onglets détectée (${initialTabHandles.length}).`);
      const tabTexts: string[] = [];
      // Use imported ElementHandle type
      for (const tabHandle of initialTabHandles) {
        try {
          // Type 'el' as Element
          const text = await tabHandle.evaluate((el: Element) => el.textContent?.trim() || '');
          tabTexts.push(text || `onglet_${tabTexts.length + 1}`);
        } catch { // Variable non utilisée
          console.warn("API: Impossible de récupérer le texte d'un onglet.");
          tabTexts.push(`onglet_${tabTexts.length + 1}`);
        }
        await tabHandle.dispose(); // Dispose handle after getting text
      }
      console.log(`API: Onglets trouvés: ${tabTexts.join(', ')}`);

      for (let i = 0; i < tabTexts.length; i++) {
        const tabText = tabTexts[i];
        console.log(`\nAPI: Traitement de l'onglet: ${tabText}`);
        // Use imported ElementHandle type
        let buttonHandle: ElementHandle | null = null;
        try {
          // Re-select tabs on each iteration
          // Use imported ElementHandle type
          const currentTabHandles: ElementHandle[] = await page.$$(tabSelectorString);
          if (currentTabHandles.length > i) {
              buttonHandle = currentTabHandles[i];
          } else {
              console.warn(`API: Impossible de retrouver le bouton pour l'onglet ${i}: ${tabText}`);
              // Dispose remaining handles if any issue
              // Type 'h' as ElementHandle
              await Promise.all(currentTabHandles.map((h: ElementHandle) => h.dispose()));
              continue;
          }

          console.log(`API: Clic sur l'onglet: ${tabText}`);
          await buttonHandle.click();
          await page.waitForNetworkIdle({ idleTime: 500, timeout: 15000 }).catch(() => console.log('API: Timeout/Erreur waitForNetworkIdle après clic onglet, continuation...'));

          // *** Fermer les popups après avoir cliqué sur l'onglet ***
          popupClosed = await closePopups(page);
          if (popupClosed) {
              console.log('API: Attente de stabilisation après fermeture de popup post-onglet...');
               try {
                  await page.waitForNetworkIdle({ idleTime: 1500, timeout: 20000 });
                   console.log('API: Page stabilisée après fermeture popup post-onglet.');
               } catch (waitError: unknown) { // Remplacer any par unknown
                    const message = waitError instanceof Error ? waitError.message : String(waitError);
                    console.warn(`API: Timeout/Erreur attente post-popup/onglet (${message}), continuation...`);
               }
           }

           try {
             await scrollToBottomAndLoadImages(page); // Scroll and load images for the new tab state
           } catch (scrollError: unknown) { // Remplacer any par unknown
               const message = scrollError instanceof Error ? scrollError.message : String(scrollError);
               if (popupClosed && message?.includes('Execution context was destroyed')) {
                   console.warn('API: Ignorer erreur de défilement post-popup/onglet (contexte détruit), capture sans défilement complet.');
               } else {
                   // Si ce n'est pas l'erreur attendue, relancer l'erreur originale
                   if (scrollError instanceof Error) throw scrollError;
                   else throw new Error(String(scrollError));
               }
           }

          // --- Ajustement dynamique du viewport avant capture ---
          const bodyHandle = await page.$('body');
          const boundingBox = await bodyHandle?.boundingBox();
          await bodyHandle?.dispose();

          const currentViewport = page.viewport();
          const newHeight = boundingBox?.height || currentViewport?.height || 1080; // Fallback height
          const newWidth = currentViewport?.width || 1920; // Fallback width

          console.log(`API: Ajustement du viewport à ${newWidth}x${Math.round(newHeight)} pour la capture...`);
          await page.setViewport({ width: newWidth, height: Math.round(newHeight) });
          await new Promise(resolve => setTimeout(resolve, 200)); // Petite pause pour le rendu
          // --- Fin ajustement ---

          const filename = generateFilename(targetUrl, tabText);
          console.log(`API: Capture de l'onglet ${tabText}`);
          const screenshotBuffer = await page.screenshot({ fullPage: true, encoding: 'base64' }); // fullPage réintroduit
          screenshots.push({ filename, data: screenshotBuffer });
          console.log(`API: Capturé: ${filename}`);

          // Restaurer le viewport original
          if (currentViewport) {
            console.log(`API: Restauration du viewport à ${currentViewport.width}x${currentViewport.height}.`);
            await page.setViewport(currentViewport);
          }

          // Dispose handles for this iteration except the clicked one (already disposed below)
          // Type parameters for filter and map
          await Promise.all(currentTabHandles
               .filter((_: ElementHandle, idx: number) => idx !== i)
               .map((h: ElementHandle) => h.dispose()));

         } catch (error: unknown) { // Remplacer any par unknown
           const message = error instanceof Error ? error.message : String(error);
           console.error(`API: Erreur lors du traitement de l'onglet ${tabText}:`, message);
         } finally {
             if(buttonHandle) await buttonHandle.dispose(); // Ensure disposal even on error
         }
      }
    } else {
      console.log("API: Aucune structure d'onglets détectée, capture simple.");

      // --- Ajustement dynamique du viewport avant capture ---
      const bodyHandle = await page.$('body');
      const boundingBox = await bodyHandle?.boundingBox();
      await bodyHandle?.dispose();

      const currentViewport = page.viewport();
      const newHeight = boundingBox?.height || currentViewport?.height || 1080; // Fallback height
      const newWidth = currentViewport?.width || 1920; // Fallback width

      console.log(`API: Ajustement du viewport à ${newWidth}x${Math.round(newHeight)} pour la capture...`);
      await page.setViewport({ width: newWidth, height: Math.round(newHeight) });
      await new Promise(resolve => setTimeout(resolve, 200)); // Petite pause pour le rendu
      // --- Fin ajustement ---

      const filename = generateFilename(targetUrl);
      const screenshotBuffer = await page.screenshot({ fullPage: true, encoding: 'base64' }); // fullPage réintroduit
      screenshots.push({ filename, data: screenshotBuffer });
      console.log(`API: Capturé: ${filename}`);

      // Restaurer le viewport original (même si on ferme juste après, bonne pratique)
      if (currentViewport) {
        console.log(`API: Restauration du viewport à ${currentViewport.width}x${currentViewport.height}.`);
        await page.setViewport(currentViewport);
      }
    }

    await browser.close();
    browser = null;
    console.log('API: Navigateur fermé.');

     return NextResponse.json({ screenshots });

   } catch (error: unknown) { // Remplacer any par unknown
     console.error("\n--- API Erreur Globale ---");
     console.error(error);
     if (browser) {
       try {
         await browser.close();
       } catch (closeError: unknown) {
         console.error("API: Erreur lors de la fermeture du navigateur dans le catch global:", closeError instanceof Error ? closeError.message : String(closeError));
       }
     }
     const message = error instanceof Error ? error.message : String(error);
     return NextResponse.json({ error: 'Erreur serveur lors de la capture.', details: message }, { status: 500 });
   }
 }
