import { LandingNav } from '@/components/landing/landing-nav';
import { Hero } from '@/components/landing/hero';
import { WhatIsPai } from '@/components/landing/what-is-pai';
import { HowItWorks } from '@/components/landing/how-it-works';
import { PhotoCarousel } from '@/components/landing/photo-carousel';
import { Benefits } from '@/components/landing/benefits';
import { Stats } from '@/components/landing/stats';
import { Cta } from '@/components/landing/cta';
import { LandingFooter } from '@/components/landing/footer';

/**
 * Landing pública en `/`, fuera de `ProtectedRoute`.
 *
 * Vive fuera de `AppLayout` a propósito: es lo primero que ve alguien sin
 * cuenta, antes de decidir si entra. El Resumen del panel (lo que antes vivía
 * en `/`) se movió a `/panel` — ver `router.tsx`.
 *
 * Cada sección cita datos reales del protocolo (rutas del panel, el reparto
 * Web2/Arbitrum de `docs/referencia-pai-arbitrum.md`, los estados de
 * `AssetRegistry`) — no hay una sola cifra de tracción o adopción inventada.
 */
export default function LandingPage() {
  return (
    <div className="overflow-x-clip">
      <LandingNav />
      <Hero />
      <WhatIsPai />
      <HowItWorks />
      <PhotoCarousel />
      <Benefits />
      <Stats />
      <Cta />
      <LandingFooter />
    </div>
  );
}
