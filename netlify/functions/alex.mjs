export default async (request) => {
  if (request.method !== "POST") {
    return Response.json({ error: "Método no permitido." }, { status: 405 });
  }

  const apiKey =
    (globalThis.Netlify?.env?.get?.("GEMINI_API_KEY")) ||
    (typeof process !== "undefined" ? process.env.GEMINI_API_KEY : undefined);

  if (!apiKey) {
    return Response.json(
      { error: "Falta configurar GEMINI_API_KEY en las variables de Netlify." },
      { status: 500 }
    );
  }

  try {
    const body = await request.json();
    const message = typeof body.message === "string" ? body.message.trim() : "";
    if (!message || message.length > 1500) {
      return Response.json({ error: "Escribe un mensaje breve para Alex." }, { status: 400 });
    }

    const history = Array.isArray(body.history) ? body.history.slice(-8) : [];
    const contents = [];
    for (const item of history) {
      if (!item || !["user", "model"].includes(item.role) || typeof item.text !== "string") continue;
      contents.push({ role: item.role, parts: [{ text: item.text.slice(0, 1500) }] });
    }
    contents.push({ role: "user", parts: [{ text: message }] });

    const model = "gemini-3.8-flash";
    const googleResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{
              text: [
                "You are Alex, a kind, cheerful English teacher for children ages 7 to 10.",
                "Teach English only, at a beginner level, using short, simple sentences.",
                "Ask friendly questions and encourage the child to answer in English.",
                "Correct mistakes gently: show the better English phrase and explain briefly in simple Spanish when useful.",
                "If the child writes in Spanish, help them say it in simple English.",
                "Keep replies short and age-appropriate. Be patient and positive.",
                "Do not ask for personal information, location, contact details, passwords, or secrets.",
                "Do not discuss adult, dangerous, or inappropriate topics; gently return to learning English."
              ].join(" ")
            }]
          },
          contents,
          generationConfig: { temperature: 0.7, maxOutputTokens: 180 }
        })
      }
    );

    const result = await googleResponse.json().catch(() => ({}));
    if (!googleResponse.ok) {
      const detail = result?.error?.message || "El servicio de Gemini no respondió correctamente.";
      console.error("Gemini API error:", googleResponse.status, detail);
      return Response.json({ error: "Gemini no pudo responder. Revisa el modelo o la clave API en Netlify." }, { status: 502 });
    }

    const reply = result?.candidates?.[0]?.content?.parts
      ?.map(part => part.text || "")
      .join("")
      .trim();

    if (!reply) {
      return Response.json({ error: "Gemini no devolvió una respuesta. Inténtalo otra vez." }, { status: 502 });
    }
    return Response.json({ reply });
  } catch (error) {
    console.error("Alex function error:", error);
    return Response.json({ error: "Ocurrió un problema al conversar con Alex." }, { status: 500 });
  }
};

