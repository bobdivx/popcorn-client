import { defineMiddleware } from 'astro:middleware';

export const onRequest = defineMiddleware(async (context, next) => {
  const response = await next();

  // Strict-Transport-Security
  response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');

  // Content-Security-Policy
  // NOTE: This is a basic CSP. You might need to adjust it based on your application's needs.
  // For example, if you use external scripts or styles, you'll need to add their sources.
  response.headers.set('Content-Security-Policy', "default-src 'self'; img-src *; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'");

  // X-Content-Type-Options
  response.headers.set('X-Content-Type-Options', 'nosniff');

  // X-Frame-Options
  response.headers.set('X-Frame-Options', 'DENY');

  // Referrer-Policy
  response.headers.set('Referrer-Policy', 'no-referrer-when-downgrade');

  return response;
});