'use client'; // Required for useState, useEffect, event handlers

import { useState } from 'react';

interface Screenshot {
  filename: string;
  data: string; // base64 encoded image data
}

// Interface pour les résultats d'analyse Gemini
interface AnalysisResult {
    text?: string | null; // Réponse textuelle directe de Gemini
    message?: string; // Pour les cas où rien n'est trouvé ou bloqué
}

// État pour chaque carte de capture
interface ScreenshotState extends Screenshot {
    isAnalyzing?: boolean;
    analysisResult?: AnalysisResult | null;
    analysisError?: string | null;
}


export default function HomePage() {
  const [url, setUrl] = useState<string>('');
  // Supprimer l'état du prompt
  // const [prompt, setPrompt] = useState<string>("...");
  // Utiliser le nouvel état ScreenshotState
  const [screenshots, setScreenshots] = useState<ScreenshotState[]>([]);
  const [isCapturing, setIsCapturing] = useState<boolean>(false); // Renommé pour clarté
  const [captureError, setCaptureError] = useState<string | null>(null);

  const handleCapture = async () => {
    if (!url) {
      setCaptureError('Veuillez entrer une URL.');
      return;
    }
    setIsCapturing(true);
    setCaptureError(null);
    setScreenshots([]); // Clear previous screenshots and analyses

    try {
      const response = await fetch('/api/capture', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Erreur HTTP: ${response.status}`);
      }

      const result = await response.json();
      // Initialiser l'état pour chaque capture
      if (result.screenshots && result.screenshots.length > 0) {
         setScreenshots(result.screenshots.map((ss: Screenshot) => ({
             ...ss,
             isAnalyzing: false,
             analysisResult: null,
             analysisError: null,
         })));
      } else {
         // eslint-disable-next-line react/no-unescaped-entities
         setCaptureError('Aucune capture d\'écran n\'a été retournée par l\'API.');
       }
     } catch (err: unknown) { // Remplacer any par unknown
       const message = err instanceof Error ? err.message : String(err);
       console.error('Erreur lors de la capture:', message);
       setCaptureError(`Erreur lors de la capture: ${message}`);
     } finally {
       setIsCapturing(false);
    }
  };

  // --- Nouvelle fonction pour gérer l'analyse ---
  const handleAnalyze = async (index: number) => {
      const targetScreenshot = screenshots[index];
      if (!targetScreenshot) return;

      // Mettre à jour l'état de chargement pour cette carte spécifique
      setScreenshots(prev => prev.map((ss, idx) =>
          idx === index ? { ...ss, isAnalyzing: true, analysisError: null, analysisResult: null } : ss
      ));

      try {
          const response = await fetch('/api/analyze', {
              method: 'POST',
              headers: {
                  'Content-Type': 'application/json',
              },
              // Envoyer seulement les données base64
              body: JSON.stringify({
                  imageData: targetScreenshot.data
                  // Pas besoin d'envoyer le prompt
              }),
          });

          if (!response.ok) {
              const errorData = await response.json();
              throw new Error(errorData.error || `Erreur HTTP: ${response.status}`);
          }

          const result = await response.json();

          // Mettre à jour l'état avec le résultat de l'analyse
           setScreenshots(prev => prev.map((ss, idx) =>
              idx === index ? { ...ss, isAnalyzing: false, analysisResult: result.analysis || { message: result.message } } : ss
           ));

       } catch (err: unknown) { // Remplacer any par unknown
           const message = err instanceof Error ? err.message : String(err);
           console.error(`Erreur lors de l'analyse de ${targetScreenshot.filename}:`, message);
            // Mettre à jour l'état avec l'erreur d'analyse
            setScreenshots(prev => prev.map((ss, idx) =>
               idx === index ? { ...ss, isAnalyzing: false, analysisError: message } : ss
           ));
       }
  };

  return (
    // Ajuster le fond pour un effet plus subtil
    <main className="flex min-h-screen flex-col items-center p-6 md:p-12 bg-gradient-to-br from-slate-50 via-gray-50 to-indigo-50">
      {/* Titre simplifié */}
      <h1 className="text-4xl md:text-5xl font-bold mb-10 text-gray-700 drop-shadow-md">NetCapture</h1>

      {/* Section de contrôle (URL + Bouton) */}
      <div className="w-full max-w-2xl mb-8 bg-white bg-opacity-60 p-6 rounded-xl shadow-lg border border-gray-200 backdrop-filter backdrop-blur-sm">
        <label htmlFor="urlInput" className="block text-sm font-medium text-gray-700 mb-1">
          URL à capturer :
        </label>
        <input
          id="urlInput"
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://exemple.com"
          className="w-full px-4 py-2 border border-gray-300 rounded-lg shadow-sm focus:ring-indigo-500 focus:border-indigo-500 bg-white bg-opacity-80 text-lg" // Police plus grande
          disabled={isCapturing}
        />
         <button
            onClick={handleCapture}
            disabled={isCapturing}
            className={`mt-4 w-full px-6 py-3 rounded-lg text-white font-semibold shadow-md transition-transform transform hover:scale-105 duration-200 ${
              isCapturing
                ? 'bg-indigo-400 cursor-not-allowed' // Couleur différente pour chargement
                : 'bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500'
            }`}
          >
            {isCapturing ? 'Capture en cours...' : 'Capturer'}
          </button>
      </div>


      {captureError && (
        <div className="mt-6 p-4 bg-red-100 border border-red-300 text-red-800 rounded-lg w-full max-w-2xl shadow"> {/* Style d'erreur ajusté */}
          <p className="font-bold">Erreur de Capture</p>
          <p>{captureError}</p>
        </div>
      )}

      {screenshots.length > 0 && (
        // Enlever la grille et afficher chaque capture dans une carte pleine largeur
        <div className="mt-10 w-full max-w-screen-lg space-y-8"> {/* Utiliser max-w-screen-lg pour une largeur raisonnable */}
          <h2 className="text-3xl font-semibold mb-6 text-gray-700 drop-shadow-sm">Captures :</h2>
          {screenshots.map((ss, index) => (
            // Carte pour chaque capture, pleine largeur avec style glacé
            <div key={ss.filename} className="border border-gray-200 rounded-xl shadow-lg overflow-hidden bg-white bg-opacity-70 backdrop-filter backdrop-blur-sm flex flex-col">
             {/* Section Image avec scroll */}
             <div className="max-h-[70vh] overflow-auto border-b border-gray-200"> {/* Conteneur scrollable */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                   src={`data:image/png;base64,${ss.data}`}
                   alt={`Capture de ${ss.filename}`}
                   className="w-full h-auto block" // Image prend la largeur, hauteur auto
                 />
              </div>

               {/* Section Analyse */}
               <div className="p-6 flex-grow">
                  <h3 className="text-xl font-semibold mb-4 text-gray-800">Analyse IA</h3> {/* Titre plus grand */}
                  {ss.isAnalyzing && <p className="text-base text-indigo-600 animate-pulse">Analyse en cours...</p>} {/* Taille et animation */}
                  {ss.analysisError && (
                      <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg text-base"> {/* Style d'erreur amélioré */}
                          <p className="font-semibold">Erreur d'analyse:</p>
                          <p>{ss.analysisError}</p>
                      </div>
                  )}
                  {ss.analysisResult && !ss.analysisError && (
                       <div className="space-y-4 text-base text-gray-800"> {/* Taille de texte augmentée */}
                          {/* Afficher le message si présent (ex: réponse bloquée) */}
                          {ss.analysisResult.message && <p className="p-4 bg-yellow-100 border border-yellow-300 rounded-lg"><i>{ss.analysisResult.message}</i></p>}
                          {/* Afficher la réponse textuelle de Gemini */}
                          {ss.analysisResult.text && (
                              // Conteneur modernisé pour le texte d'analyse
                              <div className="whitespace-pre-wrap bg-gradient-to-br from-gray-50 to-gray-100 p-5 rounded-lg border border-gray-200 shadow-inner max-h-96 overflow-y-auto font-mono text-sm leading-relaxed"> {/* Fond dégradé, padding, ombre interne, scroll, police mono */}
                                  {ss.analysisResult.text}
                              </div>
                          )}
                      </div>
                  )}
               </div>

               {/* Section Actions (Footer de la carte) */}
              <div className="p-4 flex justify-end items-center bg-gray-100 bg-opacity-80 border-t border-gray-200 space-x-4"> {/* Padding, couleur fond, espacement */}
                <button
                   onClick={() => handleAnalyze(index)}
                   disabled={ss.isAnalyzing || isCapturing}
                   className={`px-5 py-2 text-sm font-medium rounded-lg shadow-sm transition-transform transform hover:scale-105 duration-200 ${
                     ss.isAnalyzing || isCapturing
                       ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                       : 'bg-green-600 hover:bg-green-700 text-white'
                   }`}
                 >
                   {ss.isAnalyzing ? 'Analyse...' : 'Analyser'}
                  </button>
                 <button
                  onClick={() => downloadScreenshot(ss.data, ss.filename)}
                  disabled={isCapturing} // Désactiver pendant la capture globale
                  className={`px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md shadow transition-colors ${ // Ajuster padding, taille texte, ombre, couleurs
                      isCapturing ? 'opacity-50 cursor-not-allowed' : 'hover:bg-blue-700'
                  }`}
                >
                  Télécharger
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}

// Helper function to trigger download
function downloadScreenshot(base64Data: string, filename: string) {
  const link = document.createElement('a');
  link.href = `data:image/png;base64,${base64Data}`;
  link.download = filename;
  document.body.appendChild(link); // Required for Firefox
  link.click();
  document.body.removeChild(link);
}
