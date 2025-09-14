export async function handler(event) {
  const originSecret = process.env.ORIGIN_SECRET; // lives only on server

  const res = await fetch("https://iestea-backend.vercel.app/api/confess", {
    method: event.httpMethod,
    headers: {
      "Content-Type": "application/json",
      "x-origin-secret": originSecret,
    },
    body: ["GET", "HEAD"].includes(event.httpMethod) ? undefined : event.body,
  });

  return {
    statusCode: res.status,
    body: await res.text(),
  };
}
