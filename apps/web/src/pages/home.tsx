import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function HomePage() {
  return (
    <div className="space-y-6 py-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">Protocolo de Monetización PAI</h1>
        <p className="text-muted-foreground max-w-3xl text-sm">
          La cadena no reemplaza al abogado ni al registro público — reemplaza la necesidad de
          confiar en el operador de la plataforma.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Divulgación selectiva</CardTitle>
          <CardDescription>
            Elegí qué cuotas mostrarle al prestamista y construí la prueba. Es el momento de la demo
            donde se ve algo que no se ve en las otras 40.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild>
            <Link to="/disclosure">Abrir</Link>
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-muted-foreground">Próximas pantallas</CardTitle>
          <CardDescription>
            Expediente y carga de evidencias · certificaciones desde tres wallets · desglose del
            motor Stylus · verificación pública en <code>/verify/:code</code>.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
