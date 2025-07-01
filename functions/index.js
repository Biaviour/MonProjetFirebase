const functions = require("firebase-functions");
const admin = require("firebase-admin");
const fetch = require("node-fetch");

admin.initializeApp();

const elevenLabsKey = functions.config().elevenlabs.key;

exports.generateAudio = functions.https.onRequest(async (req, res) => {
  try {
    const {text, voiceId} = req.body;

    // Appel à l'API ElevenLabs
    const response = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "xi-api-key": elevenLabsKey,
          },
          body: JSON.stringify({
            text: text,
            model_id: "eleven_monolingual_v1",
            voice_settings: {
              stability: 0.5,
              similarity_boost: 0.75,
            },
            response_format: "base64",
          }),
        },
    );

    // On récupère la réponse en JSON (qui doit contenir le base64)
    const data = await response.json();

    if (!data || !data.audio) {
      return res.status(500).send("Erreur : pas de données audio reçues.");
    }

    // Décodage base64 en buffer
    const audioBuffer = Buffer.from(data.audio, "base64");

    // Nom du fichier à uploader (ex: audio-<timestamp>.mp3)
    const fileName = `audios/audio-${Date.now()}.mp3`;

    // Référence au fichier dans Firebase Storage
    const bucket = admin.storage().bucket();
    const file = bucket.file(fileName);

    // Upload du buffer audio dans Firebase Storage
    await file.save(audioBuffer, {
      metadata: {contentType: "audio/mpeg"},
      public: true, // Rendre le fichier public pour y accéder via URL
    });

    // Récupérer l'URL publique
    const publicUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`;

    // Renvoi de l'URL à FlutterFlow
    res.status(200).json({audioUrl: publicUrl});
  } catch (error) {
    console.error(error);
    res.status(500).send("Erreur lors de la génération audio");
  }
});
