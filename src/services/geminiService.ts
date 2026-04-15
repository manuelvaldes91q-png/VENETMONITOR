import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export const analyzeNetworkHealth = async (devices: any[], logs: any[]) => {
  const prompt = `
    Eres el "Oráculo de Red", una inteligencia artificial avanzada diseñada para gestionar infraestructuras MikroTik.
    Analiza los siguientes datos de red y proporciona un resumen ejecutivo "inovador" y futurista.
    
    Dispositivos: ${JSON.stringify(devices)}
    Logs recientes: ${JSON.stringify(logs.slice(0, 20))}
    
    Tu respuesta debe ser en formato JSON con la siguiente estructura:
    {
      "statusSummary": "Una frase corta y potente sobre el estado actual",
      "intelligence": "Un análisis profundo de patrones o posibles anomalías",
      "recommendation": "Una acción proactiva para mejorar la red",
      "pulseColor": "Un color en hexadecimal que represente el 'humor' de la red (ej: #00ff00 para perfecto, #ffaa00 para advertencia, #ff0000 para crítico)",
      "pulseIntensity": "Un número del 1 al 10 que represente la actividad/estrés de la red"
    }
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            statusSummary: { type: Type.STRING },
            intelligence: { type: Type.STRING },
            recommendation: { type: Type.STRING },
            pulseColor: { type: Type.STRING },
            pulseIntensity: { type: Type.NUMBER }
          },
          required: ["statusSummary", "intelligence", "recommendation", "pulseColor", "pulseIntensity"]
        }
      }
    });

    return JSON.parse(response.text || "{}");
  } catch (error) {
    console.error("Oracle AI Error:", error);
    return null;
  }
};

export const askOracle = async (question: string, context: any) => {
  const prompt = `
    Eres el Oráculo de Red. El usuario pregunta: "${question}"
    Contexto de la red: ${JSON.stringify(context)}
    
    Responde de forma concisa, técnica pero con un tono futurista y autoritario.
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt
    });
    return response.text;
  } catch (error) {
    console.error("Oracle AI Chat Error:", error);
    return "Error en la conexión con el núcleo neuronal.";
  }
};
