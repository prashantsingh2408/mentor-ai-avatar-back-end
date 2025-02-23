import { exec } from "child_process";
import cors from "cors";
import dotenv from "dotenv";
import voice from "elevenlabs-node";
import express from "express";
import { promises as fs } from "fs";
import OpenAI from "openai/index.mjs";
import path from 'path';
import { fileURLToPath } from 'url';
dotenv.config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || "-", // Your OpenAI API key here, I used "-" to avoid errors when the key is not set but you should not do that
});
const ibmApiKeys = process.env.OPENAI_API_KEY || "KeLVOKnelfNy0lwDEDQy4jbXX_FpUo47SyDGIJVOiW1D"

const elevenLabsApiKey = process.env.ELEVEN_LABS_API_KEY;
const voiceID = "9BWtsMINqrJLrRacOk9x";

const app = express();
app.use(express.json());
app.use(cors({
  origin: ['https://mentor-ai-avatar-front-end.vercel.app', 'http://localhost:3000'],
  methods: ['GET', 'POST'],
  credentials: true
}));
// app.use(cors());
const port = process.env.PORT || 8080;
// app.options("*", (req, res) => {
//   res.header("Access-Control-Allow-Origin", "*");  // Vous pouvez restreindre ça si nécessaire
//   res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
//   res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
//   res.sendStatus(200); // Répondre avec succès aux requêtes OPTIONS
// });
// app.options("*", (req, res) => {
//   res.sendStatus(200);
// });

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Add mouth shape constants
const MOUTH_SHAPES = {
  REST: "M30,60 Q50,70 70,60",  // Closed mouth
  A: "M30,65 Q50,75 70,65",     // Wide open for A sounds
  B: "M30,62 Q50,68 70,62",     // Slightly open for B/P sounds
  F: "M30,63 Q50,63 70,63",     // Flat for F/V sounds
  L: "M30,61 Q50,65 70,61",     // Tongue up for L sounds
  O: "M30,58 Q50,68 70,58"      // Round for O sounds
};

const execCommand = (command) => {
  return new Promise((resolve, reject) => {
    exec(command, (error, stdout, stderr) => {
      if (error) reject(error);
      resolve(stdout);
    });
  });
};

const generatePhonemes = (text) => {
  // Simple phoneme detection
  return text.toLowerCase().split('').map(char => {
    if ('aeiou'.includes(char)) return 'A';
    if ('bpm'.includes(char)) return 'B';
    if ('fv'.includes(char)) return 'F';
    if ('l'.includes(char)) return 'L';
    if ('o'.includes(char)) return 'O';
    return 'REST';
  });
};

const getAudioPath = (filename) => path.join('/tmp', filename);

const lipSyncMessage = async (message, text) => {
  const time = new Date().getTime();
  console.log(`Starting conversion for message ${message}`);
  
  const inputPath = getAudioPath(`message_${message}.mp3`);
  const outputPath = getAudioPath(`message_${message}.wav`);
  
  // Convert audio
  await execCommand(
    `ffmpeg -y -i ${inputPath} ${outputPath}`
  );
  console.log(`Conversion done in ${new Date().getTime() - time}ms`);

  // Generate lip sync data
  const phonemes = generatePhonemes(text);
  const lipSyncData = phonemes.map((phoneme, index) => ({
    value: phoneme,
    start: index * 0.1,
    end: (index + 1) * 0.1
  }));

  // Save lip sync data
  const jsonPath = getAudioPath(`message_${message}.json`);
  await fs.writeFile(
    jsonPath,
    JSON.stringify(lipSyncData),
    'utf8'
  );

  console.log(`Lip sync done in ${new Date().getTime() - time}ms`);
};

app.post("/chat", async (req, res) => {
  const userMessage = req.body.message;
  if (!userMessage) {
    res.send({
      messages: [
        {
          text: "Hey dear... How was your day?",
          audio: await audioFileToBase64("audios/intro_0.wav"),
          lipsync: await readJsonTranscript("audios/intro_0.json"),
          facialExpression: "smile",
          animation: "Talking_1",
        },
        {
          text: "I missed you so much... Please don't go for so long!",
          audio: await audioFileToBase64("audios/intro_1.wav"),
          lipsync: await readJsonTranscript("audios/intro_1.json"),
          facialExpression: "sad",
          animation: "Crying",
        },
      ],
    });
    return;
  }
  if (!elevenLabsApiKey || openai.apiKey === "-") {
    res.send({
      messages: [
        {
          text: "Please my dear, don't forget to add your API keys!",
          audio: await audioFileToBase64("audios/api_0.wav"),
          lipsync: await readJsonTranscript("audios/api_0.json"),
          facialExpression: "angry",
          animation: "Angry",
        },
        {
          text: "You don't want to ruin Wawa Sensei with a crazy ChatGPT and ElevenLabs bill, right?",
          audio: await audioFileToBase64("audios/api_1.wav"),
          lipsync: await readJsonTranscript("audios/api_1.json"),
          facialExpression: "smile",
          animation: "Laughing",
        },
      ],
    });
    return;
  }

  const completion = await openai.chat.completions.create({
    model: "gpt-3.5-turbo-1106",
    max_tokens: 1000,
    temperature: 0.6,
    response_format: {
      type: "json_object",
    },
    messages: [
      {
        role: "system",
        content: `
        You are a virtual girlfriend.
        You will always reply with a JSON array of messages. With a maximum of 3 messages.
        Each message has a text, facialExpression, and animation property.
        The different facial expressions are: smile, sad, angry, surprised, funnyFace, and default.
        The different animations are: Talking_0, Talking_1, Talking_2, Crying, Laughing, Rumba, Idle, Terrified, and Angry. 
        `,
      },
      {
        role: "user",
        content: userMessage || "Hello",
      },
    ],
  });
  let messages = JSON.parse(completion.choices[0].message.content);
  if (messages.messages) {
    messages = messages.messages; // ChatGPT is not 100% reliable, sometimes it directly returns an array and sometimes a JSON object with a messages property
  }
  for (let i = 0; i < messages.length; i++) {
    const message = messages[i];
    const fileName = getAudioPath(`message_${i}.mp3`);
    const textInput = message.text;
    
    await voice.textToSpeech(elevenLabsApiKey, voiceID, fileName, textInput);
    await lipSyncMessage(i, textInput);
    
    message.audio = await audioFileToBase64(fileName);
    message.lipsync = await readJsonTranscript(getAudioPath(`message_${i}.json`));
  }

  res.send({ messages });
});

const readJsonTranscript = async (file) => {
  const data = await fs.readFile(file, "utf8");
  return JSON.parse(data);
};

const audioFileToBase64 = async (file) => {
  const data = await fs.readFile(file);
  return data.toString("base64");
};

// get acces_token
const getIbmToken = async () => {
  const url = "https://iam.cloud.ibm.com/identity/token";
  const headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
  const apiKey = ibmApiKeys;

  if (!apiKey) {
    throw new Error("IBM API Key not found. Set it as an environment variable.");
  }

  const data = new URLSearchParams({
    'grant_type': 'urn:ibm:params:oauth:grant-type:apikey',
    'apikey': apiKey
  });

  try {
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: data
    });
    const result = await response.json();
    return result.access_token;
    log
  } catch (error) {
    console.error("Error fetching IBM token:", error);
    throw error;
  }
}

//  get bot response
const graniteQuery = async (prompt,systemPrompts) => {
  const token = await getIbmToken();
  const url = "https://us-south.ml.cloud.ibm.com/ml/v1/text/generation?version=2023-05-29";
  const headers = {
    'Accept': 'application/json',
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`

  };
  const systemPrompt = systemPrompts ? systemPrompts : "You are a language learning assistant. If the user speaks in French, respond in French and provide corrections.If the user speaks in English, first respond in English, then provide the French translation. Be friendly and helpful."
  const payload = {
    "input": `<|start_of_role|>system<|end_of_role|>${systemPrompt}<|end_of_text|>\n`
      + `<|start_of_role|>user<|end_of_role|>${prompt}<|end_of_text|>\n`
      + `<|start_of_role|>assistant<|end_of_role|>`,
    "parameters": { "max_new_tokens": 300 },
    "model_id": "ibm/granite-13b-instruct-v2",
    "project_id": "44e4e31f-bde1-4da6-85ec-7dfbb505cffa"
  };

  try {
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload)
    });
    const result = await response.json();
    // console.log(result);

    return result.results[0].generated_text;
  } catch (error) {
    console.error("Error fetching Granite query:", error);
    throw error;
  }
}

// Add a redirect route for the avatar
app.get("/avatar", (req, res) => {
  res.redirect('https://mentor-ai-avatar-front-end.vercel.app/');
});
// chat with ibm models 
app.post("/agent-chat", async (req, res) => {
  console.log(req.body.message);


  try {
    const userMessage = req.body.message;
    const prompt = req.body.prompt
    // const history = req.body.history
    // console.log("history ;", req.body);
    
   
    if (!userMessage) {
      const response = " how can i help you today ?"
      res.json({ response });
    }
    const response = await graniteQuery( userMessage, prompt)
    console.log("response : ",response);
    
    res.json({ response });

  } catch (error) {
    console.error(error)
  }

});
// Basic route
app.get('/', (req, res) => {
  res.json({ message: 'Server is running' });
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
