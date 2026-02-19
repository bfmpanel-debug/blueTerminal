
import { GoogleGenAI } from "@google/genai";

export const analyzeBleData = async (data: string): Promise<string> => {
  // Pastikan API_KEY tersedia di environment
  const apiKey = (process.env as any).API_KEY;
  if (!apiKey) return "API Key belum dikonfigurasi.";

  const ai = new GoogleGenAI({ apiKey });
  
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Analisis data Bluetooth berikut secara teknis: "${data}". Berikan penjelasan singkat tentang apa kemungkinan data ini.`,
    });

    // Menggunakan .text sesuai instruksi SDK terbaru
    return response.text || "Tidak ada hasil analisis.";
  } catch (error) {
    console.error("AI Analysis error:", error);
    return "Gagal menganalisis data.";
  }
};
