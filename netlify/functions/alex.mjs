

export default async (request) => {
  if (request.method !== "POST") {
    return Response.json(
      { error: "Método no permitido." },
      { status: 405 }
    );
  }

  const apiKey =
    globalThis.Netlify?.env?.get?.("GEMINI_API_KEY") ||
    (typeof process !== "undefined"
      ? process.env.GEMINI_API_KEY
      : undefined);

  if (!apiKey) {
    return Response.json(
      { error: "Falta configurar GEMINI_API_KEY en Netlify." },
      { status: 500 }
    );
  }

  try {
    const body = await request.json();
    const message =
      typeof body.message === "string"
        ? body.message.trim()
        : "";

    if (!message || message.length > 1500) {
      return Response.json(
        { error: "Escribe un mensaje breve para Alex." },
        { status: 400 }
      );
    }

    const history = Array.isArray(body.history)
      ? body.history.slice(-8)
      : [];

    const contents = [];

    for (const item of history) {
      if (
        !item ||
        !["user", "model"].includes(item.role) ||
        typeof item.text !== "string"
      ) continue;

      contents.push({
        role: item.role,
        parts: [{ text: item.text.slice(0, 1500) }]
      });
    }

    contents.push({
      role: "user",
      parts: [{ text: message }]
    });

    const model = "gemini-3.8-flash";

    const url =
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;

    const payload = {
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
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 180
      }
    };

    let googleResponse;
    let result;
    let lastNetworkError;

    const maxAttempts = 3;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        googleResponse = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify(payload)
        });

        result = await googleResponse.json().catch(() => ({}));

        if (googleResponse.ok) {
          break;
        }

        const retryable = [
          429, 500, 502, 503, 504
        ].includes(googleResponse.status);

        if (!retryable || attempt === maxAttempts) {
          const detail =
            result?.error?.message ||
            "Gemini no respondió correctamente.";

          console.error(
            "Gemini API error:",
            googleResponse.status,
            detail
          );

          return Response.json(
            {
              error: "Gemini está ocupado. Inténtalo nuevamente en unos momentos."
            },
            {
              status: googleResponse.status === 503
                ? 503
                : 502
            }
          );
        }

        console.log(
          `Gemini ocupado. Reintento ${attempt + 1} de ${maxAttempts}.`
        );

      } catch (error) {
        lastNetworkError = error;

        if (attempt === maxAttempts) {
          console.error("Gemini connection error:", error);
          return Response.json(
            {
              error: "No se pudo conectar con Gemini. Inténtalo nuevamente."
            },
            { status: 503 }
          );
        }

        console.log(
          `Error de conexión. Reintento ${attempt + 1} de ${maxAttempts}.`
        );
      }

      await new Promise(resolve =>
        setTimeout(resolve, attempt * 1000)
      );
    }

    if (!googleResponse?.ok) {
      console.error("Gemini final error:", lastNetworkError);
      return Response.json(
        { error: "Gemini no pudo responder." },
        { status: 503 }
      );
    }

    const reply = result?.candidates?.[0]?.content?.parts
      ?.map(part => part.text || "")
      .join("")
      .trim();

    if (!reply) {
      return Response.json(
        {
          error: "Gemini no devolvió una respuesta. Inténtalo otra vez."
        },
        { status: 502 }
      );
    }

    return Response.json({ reply });

  } catch (error) {
    console.error("Alex function error:", error);

    return Response.json(
      { error: "Ocurrió un problema al conversar con Alex." },
      { status: 500 }
    );
  }
};
