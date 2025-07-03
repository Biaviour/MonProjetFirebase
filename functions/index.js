const { onRequest } = require("firebase-functions/v2/https");
const { SecretManagerServiceClient } = require('@google-cloud/secret-manager');
const admin = require("firebase-admin");
const fetch = require("node-fetch");

admin.initializeApp();

const client = new SecretManagerServiceClient();

async function getElevenLabsKey() {
  const secretName = `projects/b-iaviourauth/secrets/ELEVENLABS_KEY/versions/latest`;
  console.log("Accès au secret avec le chemin :", secretName); // Log debug
  const [version] = await client.accessSecretVersion({
    name: secretName,
  });
  const payload = version.payload.data.toString();
  console.log("Clé récupérée de Secret Manager :", payload); // Log debug
  return payload;
}

exports.generateAudio = onRequest(async (req, res) => {
  // Gestion CORS
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Headers", "Content-Type");

  // Requête OPTIONS pré-vol
  if (req.method === "OPTIONS") {
    return res.status(204).send("");
  }

  try {
    // Récupération sécurisée de la clé API
    const elevenLabsKey = await getElevenLabsKey();

    const { text, voiceId } = req.body;

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
          model_id: "eleven_monolingual_v1",
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
          },
          response_format: "base64",
        }),
      }
    );

    const data = await response.json();

    if (!data || !data.audio) {
      return res.status(500).send("Erreur : pas de données audio reçues.");
    }

    const audioBuffer = Buffer.from(data.audio, "base64");
    const fileName = `audios/audio-${Date.now()}.mp3`;
    const bucket = admin.storage().bucket();
    const file = bucket.file(fileName);

    await file.save(audioBuffer, {
      metadata: { contentType: "audio/mpeg" },
      public: true,
    });

    const publicUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`;
    res.status(200).json({ audioUrl: publicUrl });
  } catch (error) {
    console.error(error);
    res.status(500).send("Erreur lors de la génération audio");
  }
});