import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';
// import mime from 'mime'; // Supprimé car non utilisé, on force image/png

const apiKey = process.env.GEMINI_API_KEY;
// Utilisation du modèle Gemini Flash (plus rapide et économique)
const MODEL_NAME = "gemini-2.5-flash-preview-04-17";

if (!apiKey) {
    console.error("API Analyze: Clé API Gemini (GEMINI_API_KEY) non trouvée dans les variables d'environnement.");
    // Pas besoin d'initialiser le client ici, on le fera dans la requête
}

// Fonction pour convertir l'image base64 en partie pour l'API Gemini
function fileToGenerativePart(base64Data: string, mimeType: string) {
  return {
    inlineData: {
      data: base64Data,
      mimeType
    },
  };
}

export async function POST(request: NextRequest) {
    if (!apiKey) {
        return NextResponse.json({ error: "Clé API Gemini (GEMINI_API_KEY) non configurée sur le serveur." }, { status: 500 });
    }

    try {
        const { imageData } = await request.json(); // Recevoir seulement l'image

        if (!imageData || typeof imageData !== 'string') {
            return NextResponse.json({ error: 'Données d\'image (base64) manquantes ou invalides.' }, { status: 400 });
        }
        // Prompt codé en dur - Nouveau prompt détaillé pour un cahier des charges
        const hardcodedPrompt = `
Contexte
Vous êtes un expert en design UX/UI et un développeur front-end senior.

Tâche
À partir de la capture d’écran fournie :

Analysez l’architecture de l’interface (structure, zones fonctionnelles, navigation).

Identifiez les parcours utilisateurs et les éléments interactifs clés.

Détaillez le système de design (couleurs, typographie, icônes, espacements, grilles, composants réutilisables).

Listez l’ensemble des fonctionnalités à reproduire (micro-interactions, formulaires, animations, logiques métier apparentes).

Proposez une arborescence technique front-end (technologies, frameworks, structure de fichiers, tâches NPM/CI).

Définissez les livrables attendus : wireframes, maquettes Figma/Sketch, guide de style, découpage HTML/CSS, planning de réalisation.

Contraintes

Respecter le responsive design (mobile / tablette / desktop).

Optimisation performance et accessibilité (WCAG AA).


Format de réponse attendu
Un cahier des charges complet et détaillé, structuré en sections :

Introduction et objectifs

Analyse UX (personas, user flows)

Design system et UI

Spécifications fonctionnelles

Spécifications techniques front-end

Livrables et planning

Contraintes (rappel)

Réponds en texte brut, sans utiliser de formatage Markdown (pas d'astérisques, de dièses, de listes numérotées, etc.). Utilise des tirets ou des retours à la ligne pour séparer les points si nécessaire.
        `.trim();


        console.log("API Analyze (Gemini): Réception d'une requête d'analyse (prompt codé en dur)...");

        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: MODEL_NAME });

        // Déterminer le type MIME (on s'attend à PNG de Puppeteer)
        // Le préfixe 'data:image/png;base64,' n'est pas nécessaire pour Gemini API, juste la data base64
        const imageMimeType = "image/png"; // On force PNG car c'est ce que Puppeteer génère par défaut
        const imagePart = fileToGenerativePart(imageData, imageMimeType);

        const generationConfig = {
            temperature: 0.4, // Contrôle le caractère aléatoire
            topK: 32,
            topP: 1,
            maxOutputTokens: 4096, // Augmenter si besoin d'analyses longues
        };

        // Configuration de sécurité (ajuster si nécessaire)
        const safetySettings = [
            { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
            { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
            { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
            { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
        ];

        // Construire le contenu de la requête avec le prompt codé en dur et l'image
        const parts = [
            { text: hardcodedPrompt }, // Utiliser le prompt codé en dur
            imagePart,                 // L'image
        ];

        console.log("API Analyze (Gemini): Envoi de la requête à Gemini Flash...");

        // Générer le contenu
        const result = await model.generateContent({
            contents: [{ role: "user", parts }],
            generationConfig,
            safetySettings,
        });

        console.log("API Analyze (Gemini): Réponse reçue.");

        // Extraire la réponse textuelle
        // Vérifier si la réponse a été bloquée pour des raisons de sécurité
        if (!result.response.candidates || result.response.candidates.length === 0 || !result.response.candidates[0].content) {
             const blockReason = result.response.promptFeedback?.blockReason;
             const safetyRatings = result.response.promptFeedback?.safetyRatings;
             console.warn("API Analyze (Gemini): Réponse bloquée ou vide.", { blockReason, safetyRatings });
             let errorMessage = "La réponse de l'IA a été bloquée ou est vide.";
             if (blockReason) {
                 errorMessage += ` Raison: ${blockReason}.`;
             }
             return NextResponse.json({ analysis: null, message: errorMessage }, { status: 200 }); // Retourner 200 mais avec un message
        }

        const responseText = result.response.text();

        console.log("API Analyze (Gemini): Analyse terminée avec succès.");
        // Retourner directement le texte généré sous la clé 'text'
        return NextResponse.json({ analysis: { text: responseText } });

    } catch (error: unknown) { // Utiliser unknown pour une meilleure sécurité de type
        console.error("\n--- API Analyze (Gemini) Erreur ---");
        console.error(error);
        let errorMessage = 'Erreur serveur lors de l\'analyse de l\'image avec Gemini.';
        let errorDetails = 'Erreur inconnue';

        // Vérifier si l'erreur est une instance de Error pour accéder à 'message'
        if (error instanceof Error) {
            errorDetails = error.message;
            if (error.message?.includes('API key not valid')) {
                errorMessage = "La clé API Gemini fournie n'est pas valide.";
            } else if (error.message?.includes('permission')) {
                 errorMessage = "Erreur de permission avec l'API Gemini.";
            } else if (error.message?.includes('invalid argument') || error.message?.includes('image')) {
                errorMessage = "Erreur dans les données envoyées à Gemini (prompt ou image invalide).";
            }
        } else {
             // Gérer les cas où l'erreur n'est pas un objet Error standard
             errorDetails = String(error);
        }


        return NextResponse.json({ error: errorMessage, details: errorDetails }, { status: 500 });
    }
}
