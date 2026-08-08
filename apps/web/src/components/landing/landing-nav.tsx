import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

/** Anclas dentro de esta misma página — los mismos `id` que ya usa el footer. */
const LINKS = [
  { label: 'Qué es PAI', to: '#que-es-pai' },
  { label: 'Cómo funciona', to: '#como-funciona' },
  { label: 'Qué asegura la cadena', to: '#que-asegura-la-cadena' },
];

/**
 * Barra superior fija — pedido explícito: "lo que arriba no se quita" al
 * bajar por la página, tomando de referencia codegrid.app. `sticky` en vez de
 * `fixed`: no reserva espacio propio arriba de todo, así el Hero sigue
 * empezando en el borde de la ventana en vez de quedar corrido hacia abajo.
 *
 * Los enlaces del medio se esconden bajo `md`: Nocturne es un sistema
 * desktop-first (~1280px+, ver `playwright.config.ts`) y no hay todavía un
 * menú de hamburguesa — mejor no mostrarlos a la mitad que armar uno a las
 * apuradas el día del hackathon.
 */
export function LandingNav() {
  return (
    <header className="border-ink-800 bg-background/75 sticky top-0 z-40 border-b backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
        <Link to="/" className="flex items-baseline gap-[7px]">
          <span className="text-[16px] font-medium tracking-[-0.02em]">PAI</span>
          <span className="mono text-primary text-[10px]">× ARBITRUM</span>
        </Link>

        <nav aria-label="Secciones de la landing" className="hidden items-center gap-6 md:flex">
          {LINKS.map((link) => (
            <a
              key={link.to}
              href={link.to}
              className="text-muted-foreground hover:text-foreground text-[13px] transition-colors"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <Button asChild size="sm" className="rounded-full px-4">
          <Link to="/login">
            Entrar al panel
            <ArrowRight className="size-3.5" aria-hidden="true" />
          </Link>
        </Button>
      </div>
    </header>
  );
}
