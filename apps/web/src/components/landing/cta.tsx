import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Reveal } from './reveal';

/**
 * Único bloque sólido de la landing — rompe a propósito el degradé continuo
 * del resto de secciones para marcar el cierre, igual que hace CtaSection en
 * DESIGN_SYSTEM.md §7.1.
 */
export function Cta() {
  return (
    <section className="bg-brand-600 relative overflow-hidden px-6 py-24 text-center">
      <div
        aria-hidden="true"
        className="absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            'linear-gradient(white 1px, transparent 1px), linear-gradient(90deg, white 1px, transparent 1px)',
          backgroundSize: '48px 48px',
        }}
      />

      <Reveal className="relative mx-auto flex max-w-xl flex-col items-center gap-5">
        <h2 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
          Entrá y verificalo vos mismo
        </h2>
        <p className="text-brand-100/85 text-base leading-relaxed">
          No hace falta cuenta para empezar: la verificación pública está a un clic.
        </p>
        <div className="flex flex-col gap-3 pt-1 sm:flex-row">
          <Button
            asChild
            size="lg"
            className="bg-background text-brand-600 hover:bg-brand-100 rounded-full border-0 px-6"
          >
            <Link to="/login">
              Entrar al panel
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </Button>
          <Button
            asChild
            size="lg"
            variant="ghost"
            className="rounded-full px-6 text-white hover:bg-white/10 hover:text-white"
          >
            <Link to="/verify">Ver verificación pública</Link>
          </Button>
        </div>
      </Reveal>
    </section>
  );
}
