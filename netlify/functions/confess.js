import fetch from "node-fetch";

// ✅ Only read the secret from environment variables
const ORIGIN_SECRET = process.env.ORIGIN_SECRET;

export async function handler(event) {
  try {
    const method = event.httpMethod;
    const body = method !== "GET" ? event.body : undefined;

    const res = await fetch("https://iestea-backend.vercel.app/api/confess", {
      method,
      headers: {
        "Content-Type": "application/json",
        "x-origin-secret": ORIGIN_SECRET
      },
      body
    });

    const data = await res.json();
    return { statusCode: 200, body: JSON.stringify(data) };
  } catch (err) {
    console.error("Function error:", err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
}
