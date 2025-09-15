import fetch from 'node-fetch';

const VERCEL_API_URL = process.env.VERCEL_API_URL;
const VERCEL_ORIGIN_SECRET = process.env.VERCEL_ORIGIN_SECRET;

export async function handler(event, context) {
    const { httpMethod } = event;
    const body = event.body;
    
    // Log the request details for debugging
    console.log(`Received ${httpMethod} request to proxy`);

    try {
        const headers = {
            'Content-Type': 'application/json',
            // Here is where the secret is added securely on the server
            'x-origin-secret': VERCEL_ORIGIN_SECRET
        };
        
        const response = await fetch(VERCEL_API_URL, {
            method: httpMethod,
            headers: headers,
            body: body
        });
        
        const data = await response.json();
        
        // Return the response back to your frontend
        return {
            statusCode: response.status,
            body: JSON.stringify(data),
            headers: {
                'Content-Type': 'application/json'
            }
        };
    } catch (error) {
        console.error('Proxy error:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Internal Server Error' }),
        };
    }
}