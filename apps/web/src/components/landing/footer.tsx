import { Link } from 'react-router-dom';
import { SAMPLE_VERIFY_CODE } from '@/config/navigation';

interface FooterColumn {
  heading: string;
  links: { label: string; to: string }[];
}

/**
 * Solo enlaces que existen de verdad — nada de columnas tipo "Docs" o cambios
 * de precio que no tenemos. Los de "Protocolo" apuntan a anclas dentro de
 * esta misma página (`#como-funciona`, `#que-asegura-la-cadena`), no a un
 * sitio de documentación separado que no existe todavía.
 */
const COLUMNS: FooterColumn[] = [
  {
    heading: 'Producto',
    links: [
      { label: 'Entrar al panel', to: '/login' },
      { label: 'Verificación pública', to: `/verify/${SAMPLE_VERIFY_CODE}` },
    ],
  },
  {
    heading: 'Protocolo',
    links: [
      { label: 'Cómo funciona', to: '#como-funciona' },
      { label: 'Qué asegura la cadena', to: '#que-asegura-la-cadena' },
    ],
  },
];

export function LandingFooter() {
  return (
    <footer className="border-ink-800 border-t px-6 py-14">
      <div className="mx-auto grid max-w-5xl gap-10 sm:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <Link to="/" className="flex w-fit items-baseline gap-[7px]">
            <span className="text-[16px] font-medium tracking-[-0.02em]">PAI</span>
            <span className="mono text-primary text-[10px]">× ARBITRUM</span>
          </Link>
          <p className="text-muted-foreground mt-2 max-w-xs text-[13px] leading-relaxed">
            Cuentas por cobrar convertidas en garantía verificable — sin que el banco tenga que
            confiar en la palabra de nadie.
          </p>
        </div>

        {COLUMNS.map((column) => (
          <div key={column.heading}>
            <p className="text-muted-foreground mb-3 text-[11px] tracking-[0.1em] uppercase">
              {column.heading}
            </p>
            <ul className="flex flex-col gap-2">
              {column.links.map((link) => (
                <li key={link.label}>
                  <Link
                    to={link.to}
                    className="hover:text-brand-300 text-[13.5px] transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="border-ink-800 mx-auto mt-10 flex max-w-5xl flex-col gap-2 border-t pt-6 text-[11.5px] sm:flex-row sm:justify-between">
        <p className="text-muted-foreground">
          Hackathon Track Arbitrum · DeFi / RWA · {new Date().getFullYear()}
        </p>
        <p className="text-muted-foreground">Construido con NestJS · React · Solidity · Stylus</p>
      </div>
    </footer>
  );
}
