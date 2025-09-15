import fetch from 'node-fetch';

const VERCEL_API_URL = process.env.VERCEL_API_URL;
const VERCEL_ORIGIN_SECRET = process.env.VERCEL_ORIGIN_SECRET;

export async function handler(event, context) {
    const { httpMethod } = event;
    let body = null;

    if (httpMethod !== 'GET' && httpMethod !== 'HEAD') {
        try {
            body = event.body;
        } catch (e) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'Invalid JSON body' })
            };
        }
    }

    try {
        const headers = {
            'Content-Type': 'application/json',
            'x-origin-secret': VERCEL_ORIGIN_SECRET
        };

        const fetchOptions = {
            method: httpMethod,
            headers: headers,
        };

        if (body) {
            fetchOptions.body = body;
        }

        const response = await fetch(VERCEL_API_URL, fetchOptions);

        if (!response.ok) {
            console.error(`Vercel API returned status: ${response.status}`);
            const errorText = await response.text();
            console.error(`Vercel API error text: ${errorText}`);
            return {
                statusCode: response.status,
                body: JSON.stringify({ error: 'Vercel API error' })
            };
        }

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