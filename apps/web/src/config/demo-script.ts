import type { TimelineStepId } from '@/domain/operational-timeline';

/**
 * El guion de la demo, hecho dato.
 *
 * La narrativa vive en `docs/caso-de-uso-hackathon.md`; acá se copia solo la
 * frase que acompaña cada pantalla, para que quien presenta no tenga que
 * acordarse de ocho frases delante del jurado.
 *
 * **Cada frase declara de qué sección salió.** El guion cronometrado del §6
 * tiene siete filas y el flujo tiene ocho etapas: la carga de evidencias y el
 * registro comparten el minuto 0:30, y el repago no aparece en el guion de
 * cuatro minutos. Antes que inventar dos frases para cuadrar la tabla, se
 * toman de las secciones donde el documento sí las dice y se dice cuál es.
 * Un jurado que busque la frase en el documento tiene que encontrarla.
 *
 * `cue` es el minuto del guion cronometrado, y es `null` cuando la etapa no
 * está en él. Un minuto inventado convertiría esta pantalla en un cronómetro
 * que miente.
 */
export interface DemoScriptEntry {
  /** Frase que se dice en voz alta al abrir la pantalla. */
  phrase: string;
  /** Sección de `docs/caso-de-uso-hackathon.md` de la que sale la frase. */
  source: string;
  /** Minuto del guion de 4 minutos (§6), o `null` si la etapa no figura ahí. */
  cue: string | null;
  /** Qué decir —y qué falta— cuando la etapa todavía no dejó artefacto. */
  pending: { reason: string; unblockedBy: string };
}

export const DEMO_SCRIPT: Record<TimelineStepId, DemoScriptEntry> = {
  evidence: {
    phrase:
      'El activo financiable no es el que más vale, es el que tiene un tercero obligado a pagar en una fecha',
    source: '§3',
    cue: '0:30',
    pending: {
      reason: 'Todavía no hay documentos cargados enlazados a cuotas de la cartera.',
      unblockedBy: 'subir evidencias en /evidencias',
    },
  },
  dossier: {
    phrase: 'Del expediente entero, on-chain viajan 32 bytes',
    source: '§6',
    cue: '0:30',
    pending: {
      reason: 'Sin expediente registrado no hay merkleRoot escrito ni transacción que abrir.',
      unblockedBy: 'registrar el expediente en /expediente/nuevo',
    },
  },
  certification: {
    phrase: 'Ninguno ve todo. Cada firma es acotada y revocable',
    source: '§6',
    cue: '1:15',
    pending: {
      reason: 'El expediente todavía no acumula las tres atestaciones de certificadores distintos.',
      unblockedBy: 'firmar desde las tres wallets con CERTIFIER_ROLE',
    },
  },
  disclosure: {
    phrase: 'Prueba sin revelar. Sin ZK, solo Merkle',
    source: '§6',
    cue: '2:00',
    pending: {
      reason: 'No se ha construido ningún multiproof: no hay selección divulgada que mostrar.',
      unblockedBy: 'elegir cuotas y construir la prueba en /divulgacion',
    },
  },
  'borrowing-base': {
    phrase: 'Este número no le pedimos que lo crea. Que lo recompute',
    source: '§6',
    cue: '2:30',
    /**
     * El §4.2 lo dice sin rodeos: hoy el desglose corre en el navegador con
     * `@app/borrowing-base` y la pantalla lo rotula «cálculo local de
     * referencia», sin insignia MATCH. Por eso esta etapa no tiene artefacto
     * verificable aunque el recómputo se haya ejecutado — repetir acá el
     * número del navegador lo disfrazaría de lectura de cadena.
     */
    pending: {
      reason:
        'El desglose corre en el navegador con @app/borrowing-base, la especificación normativa. No es una lectura de BorrowingBaseEngine.',
      unblockedBy: 'cablear la función view del motor on-chain',
    },
  },
  loan: {
    phrase: 'El dinero nunca tocó nuestro servidor',
    source: '§6',
    cue: '3:15',
    pending: {
      reason: 'CollateralVault no reporta préstamo para este expediente.',
      unblockedBy: 'pignorar y fondear desde la wallet del fondo en /prestamo',
    },
  },
  repayment: {
    phrase: 'Custodia, préstamo, repago y default: el vault los hace públicos',
    source: '§5',
    cue: null,
    pending: {
      reason: 'El préstamo todavía no está en estado Repaid.',
      unblockedBy: 'repagar el principal desde la wallet de la PYME',
    },
  },
  verification: {
    phrase: 'Ábrala usted, sin credenciales nuestras',
    source: '§6',
    cue: '3:45',
    pending: {
      reason:
        'La verificación pública no deja rastro en este panel: se comprueba abriéndola sin sesión.',
      unblockedBy: 'abrir /verify con el identificador del expediente',
    },
  },
};

/**
 * La precondición del minuto 0:00.
 *
 * No es una etapa del flujo y por eso no vive en `DEMO_SCRIPT`: es lo que se
 * dice sobre la banda de estado de cadena, antes de empezar a recorrer pasos.
 */
export const DEMO_OPENING = {
  cue: '0:00',
  phrase: 'El panel no dice que está conectado: muestra a qué altura leyó',
  source: '§6',
} as const;
