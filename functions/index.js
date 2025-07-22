const { onRequest } = require("firebase-functions/v2/https");
const { SecretManagerServiceClient } = require('@google-cloud/secret-manager');
const admin = require("firebase-admin");
const fetch = require("node-fetch");

admin.initializeApp();

// Initialisation du client Secret Manager
const client = new SecretManagerServiceClient({
  projectId: 'b-iaviourauth',
});

async function getElevenLabsKey() {
  const secretName = `projects/b-iaviourauth/secrets/ELEVENLABS_KEY/versions/latest`;
  console.log("Accès au secret avec le chemin :", secretName);
  const [version] = await client.accessSecretVersion({ name: secretName });
  const payload = version.payload.data.toString();
  console.log("Clé récupérée de Secret Manager :", payload.slice(0, 5) + '... (coupée)');
  return payload;
}

exports.generateAudio = onRequest(async (req, res) => {
  // CORS
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(204).send("");
  }

  try {
    const elevenLabsKey = await getElevenLabsKey();
    const { text, voiceId } = req.body;

    if (!text || !voiceId) {
      return res.status(400).send("Champs 'text' et 'voiceId' requis.");
    }

    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "xi-api-key": elevenLabsKey,
        },
        body: JSON.stringify({
          text,
          model_id: "eleven_multilingual_v1",
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
          },
          response_format: "mp3"
        }),
      }
    );

    console.log("Statut ElevenLabs:", response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Erreur ElevenLabs:", errorText);
      return res.status(500).send("Erreur API ElevenLabs");
    }

    const audioBuffer = await response.arrayBuffer();
    console.log("Taille buffer audio :", audioBuffer.byteLength);

    const fileName = `audios/audio-${Date.now()}.mp3`;
    const bucket = admin.storage().bucket();
    const file = bucket.file(fileName);

    await file.save(Buffer.from(audioBuffer), {
      metadata: { contentType: "audio/mpeg" },
      public: true,
    });

    const publicUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`;
    console.log("Fichier audio disponible à :", publicUrl);
    res.status(200).json({ audioUrl: publicUrl });
  } catch (error) {
    console.error("Erreur globale :", error);
    res.status(500).send("Erreur lors de la génération audio");
  }
});

exports.uploadAudioFromFlutterFlow = onRequest(async (req, res) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(204).send("");
  }

  try {
    const { audio_base64 } = req.body;

    if (!audio_base64 || !audio_base64.startsWith("data:audio")) {
      return res.status(400).send("Champ 'audio_base64' manquant ou invalide.");
    }

    const matches = audio_base64.match(/^data:(audio\/\w+);base64,(.+)$/);
    if (!matches) {
      return res.status(400).send("Format base64 audio invalide.");
    }

    const contentType = matches[1];
    const base64Data = matches[2];
    const buffer = Buffer.from(base64Data, "base64");

    const fileName = `uploads/audio-${Date.now()}.mp3`;
    const bucket = admin.storage().bucket();
    const file = bucket.file(fileName);

    await file.save(buffer, {
      metadata: { contentType },
      public: true,
    });

    const publicUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`;
    console.log("URL audio générée :", publicUrl);

    res.status(200).json({ audioUrl: publicUrl });
  } catch (error) {
    console.error("Erreur upload audio :", error);
    res.status(500).send("Erreur lors de l'upload audio");
  }
});