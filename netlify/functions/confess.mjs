import fetch from 'node-fetch';

const VERCEL_API_URL = process.env.VERCEL_API_URL;
const VERCEL_ORIGIN_SECRET = process.env.VERCEL_ORIGIN_SECRET;

export async function handler(event, context) {
    const { httpMethod, body } = event;

    try {
        const headers = {
            'Content-Type': 'application/json',
            'x-origin-secret': VERCEL_ORIGIN_SECRET
        };

        const fetchOptions = {
            method: httpMethod,
            headers: headers,
        };

        // Conditionally add the body for methods that support it
        if (httpMethod !== 'GET' && httpMethod !== 'HEAD') {
            fetchOptions.body = body;
        }

        const response = await fetch(VERCEL_API_URL, fetchOptions);

        const data = await response.json();

        return {
            statusCode: response.status,
            body: JSON.stringify(data),
            headers: {
                'Content-Type': 'application/json'
            },
        };
    } catch (error) {
        console.error('Proxy error:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Internal Server Error' }),
        };
    }
}