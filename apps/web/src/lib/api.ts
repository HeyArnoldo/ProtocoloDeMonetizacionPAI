import axios from 'axios';

/**
 * Cliente HTTP centralizado. withCredentials: true → manda/recibe la cookie
 * httpOnly de sesión. En dev VITE_API_URL va vacía: pega a /api (mismo origen)
 * y el proxy de Vite lo reenvía a la API. En producción: URL absoluta.
 */
export const api = axios.create({
  baseURL: `${import.meta.env.VITE_API_URL ?? ''}/api`,
  withCredentials: true,
});

/**
 * Guarda anti-HTML: si VITE_API_URL falta o el backend no responde, la request
 * puede caer en el dev server y volver index.html (status 200). Sin esto, ese
 * string HTML se cuela como "datos" y rompe los componentes. Lo convertimos
 * en error de query visible.
 */
api.interceptors.response.use((response) => {
  const contentType = String(response.headers?.['content-type'] ?? '');
  const looksLikeHtml =
    contentType.includes('text/html') ||
    (typeof response.data === 'string' && /^\s*<(?:!doctype|html)/i.test(response.data));

  if (looksLikeHtml) {
    throw new Error(
      'API devolvió HTML en vez de JSON. Falta VITE_API_URL o el backend no responde.',
    );
  }
  return response;
});
