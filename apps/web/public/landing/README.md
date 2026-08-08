# Imágenes de impacto de la landing

Carpeta pública: todo lo que pongas acá queda servido tal cual en
`https://tu-dominio/landing/<archivo>` (en dev, `http://localhost:5173/landing/<archivo>`).

La landing (`src/pages/landing.tsx`) referencia estos archivos por nombre fijo.
**Ninguno es obligatorio**: si un archivo no existe, el componente `ImpactImage`
lo detecta (`onError`) y cae solo a un degradé de marca — no rompe la página ni
tira un ícono de imagen rota. Agregalos cuando los tengas, sin tocar código.

| Archivo esperado    | Dónde aparece                                                                                                                                                                                    | Proporción sugerida                            |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------- |
| `b1.png` … `b4.png` | Fondo del Hero (`hero-background.tsx`) — rotan con crossfade cada 4s. Ya están puestas.                                                                                                          | Horizontal ~3:2, ≥ 1200×800px                  |
| `base1.png`         | Sección "Qué es PAI", a la derecha — captura real del panel corriendo. Ya está puesta.                                                                                                           | Horizontal ~4:3                                |
| `a1.png` … `a4.png` | Carrusel "Detrás de cada expediente" (`photo-carousel.tsx`) — 4 fotos de negocios reales con sus facturas, en loop infinito con pausa al pasar el mouse o enfocar con teclado. Ya están puestas. | Horizontal ~3:2, el carrusel recorta a 340×260 |

Formato: `jpg`/`webp` para fotos, `png` si necesita transparencia. Pesá las
imágenes antes de subirlas (`squoosh.app` o similar) — la landing es lo
primero que carga un jurado, un hero de 8MB se nota.

Para cambiar las fotos del Hero: array `PHOTOS` en `hero-background.tsx`. Para
el carrusel: array `PHOTOS` en `photo-carousel.tsx` (nombre de archivo y su
descripción de una línea van juntos ahí).
