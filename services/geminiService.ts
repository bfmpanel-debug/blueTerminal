
import { GoogleGenAI } from "@google/genai";

export const analyzeBleData = async (data: string): Promise<string> => {
  const apiKey = (process.env as any).API_KEY;
  if (!apiKey) return "API Key not configured. Please check your environment.";

  const ai = new GoogleGenAI({ apiKey });
  
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `You are an expert technical analyst for embedded systems. I have received this data from a Bluetooth device: "${data}". 
      Can you briefly explain what this data might represent (e.g., sensor readings, status codes, or plain text)? 
      Keep the explanation concise and professional.`,
      config: {
        temperature: 0.5,
        maxOutputTokens: 300,
      }
    });

    return response.text || "No interpretation available.";
  } catch (error) {
    console.error("AI Analysis error:", error);
    return "Failed to analyze data via AI.";
  }
};
