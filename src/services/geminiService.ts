import axios from "axios";

/**
 * Native AI Analysis
 * Integrated directly with the VENET PRO backend.
 * No client-side API keys required.
 */
export const analyzeNetworkHealth = async (devices: any[], logs: any[]) => {
  try {
    const res = await axios.post("/api/ai/analyze", { devices, logs });
    return res.data;
  } catch (error) {
    console.error("Oracle AI Error:", error);
    return null;
  }
};

/**
 * Native Neural Link (Chat)
 * Direct integration with the Central Oracle.
 */
export const askOracle = async (question: string, context: any) => {
  try {
    const res = await axios.post("/api/ai/ask", { question, context });
    return res.data.text;
  } catch (error) {
    console.error("Oracle AI Chat Error:", error);
    return "Error en la conexión con el núcleo neuronal.";
  }
};
