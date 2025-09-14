import fetch from "node-fetch";

// Get the secret:
// - On Netlify, process.env.ORIGIN_SECRET comes from your Netlify environment
// - Locally, fallback to .env file (Codespaces)
const ORIGIN_SECRET = process.env.ORIGIN_SECRET || process.env.LOCAL_ORIGIN_SECRET;

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
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
}
